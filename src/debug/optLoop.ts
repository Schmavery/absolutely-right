import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Generic planner ↔ trace-bot optimization loop. Goals and milestones are derived
 * from `PlanGoal` + game data — not hardcoded upgrade lists. Use reports to
 * tune `planHeuristic` coefficients, `NeedWeights`, and `MOVE_HELPS`.
 */

import { defaultMaxEventDtMs } from './runBotSim';
import {
  measureGoalProgress,
  planShortestPath,
  type PlanGoal,
  type PlanSearchOpts,
  type PlanSearchOutcome,
  type PlanStep,
  PLAN_GOALS,
} from './planReach';
import { heuristicBot } from './heuristicBot';
import { metaPlanBot } from './metaPlan';
import {
  defaultPlanHeuristic,
  makePlanHeuristic,
  type PlanHeuristicCoeffs,
  type PlanHeuristicFn,
} from './planHeuristic';
import { replayPlanInSim } from './planReplay';
import { extractMilestones, fmtTime } from './traceAnalyze';
import type { Bot } from '../sim/Sim';
import { Sim } from '../sim/Sim';
import {
  adaptiveBot,
  strategyBot,
  TRACE_PATIENCE_MS,
  type BotStrategyId,
} from '../sim/bots';
import type { NeedWeights } from '../game/moveIntent';
import { WEIGHTS_PROGRESS } from '../game/moveIntent';
import type { BotRunResult } from './runBotSim';
import type { GameState } from '../types';

export type { PlanGoal, PlanHeuristicCoeffs, PlanHeuristicFn, NeedWeights };

export interface OptTarget {
  id: string;
  label: string;
  goal: PlanGoal;
  planOpts?: PlanSearchOpts;
  /** Virtual ms cap for bot runs (default 10h). */
  botBudgetMs?: number;
}

/** Default suite — extend by adding entries to `PLAN_GOALS` or passing custom targets. */
export const DEFAULT_OPT_TARGETS: OptTarget[] = PLAN_GOALS.map((g) => ({
  id: g.id,
  label: g.label,
  goal: g.goal,
  planOpts: {
    maxStates: g.id === 'launch' ? 25_000 : 40_000,
    maxTimeMs: 8 * 3_600_000,
    seed: 42,
    filterMoves: false,
    maxActionBranches: 18,
    heuristicWeight: 1,
  },
}));

export const OPT_LOOP_SEEDS = [42, 7, 99];

export interface BotCandidate {
  id: string;
  label: string;
  make: (seed: number, target: OptTarget) => Bot;
}

/** Built-in candidates; add variants without changing game mechanics. */
export function defaultBotCandidates(): BotCandidate[] {
  const strategies: BotStrategyId[] = ['progress', 'loc', 'hygiene'];
  const out: BotCandidate[] = [];
  for (const s of strategies) {
    out.push({
      id: `adaptive:${s}`,
      label: `adaptive ${s} (10s)`,
      make: () => strategyBot(s, TRACE_PATIENCE_MS),
    });
    out.push({
      id: `adaptive:${s}:30s`,
      label: `adaptive ${s} (30s)`,
      make: () => strategyBot(s, 30_000),
    });
  }
  out.push({
    id: 'heuristic:default',
    label: 'heuristic bot (default coeffs)',
    make: (_seed, target) => heuristicBot(target.goal),
  });
  out.push({
    id: 'metaplan',
    label: 'metaplan (purchase search + cruise solve)',
    make: (seed, target) =>
      metaPlanBot(target.goal, {
        seed,
        maxMetaStates: 80,
        maxMetaBranches: 8,
        maxTimeMs: target.planOpts?.maxTimeMs,
        maxCruiseMs: 3 * 3_600_000,
      }),
  });
  return out;
}

export interface WitnessProfile {
  source: 'plan' | 'bot';
  totalMs: number;
  achieved: boolean;
  progress: number;
  progressLabel: string;
  purchaseOrder: string[];
  moveHistogram: Record<string, number>;
  kickCount: number;
  promptCount: number;
  idleMs: number;
  idleFraction: number;
  bestEffort?: boolean;
}

export interface OptCompareRow {
  targetId: string;
  targetLabel: string;
  seed: number;
  botId: string;
  botLabel: string;
  plan: WitnessProfile;
  bot: WitnessProfile;
  planMs: number | null;
  botMs: number | null;
  /** Same witness steps replayed through Sim; null if sequence does not reach goal. */
  simReplayMs: number | null;
  simReplayOk: boolean;
  /** Replay when valid, else search — ground truth for graph quality. */
  boundMs: number | null;
  /**
   * botMs / boundMs. Below 1 means graph search lost to a greedy policy:
   * heuristic debt (primary tuning signal).
   */
  heuristicDebt: number | null;
  /** @deprecated Use heuristicDebt */
  gapRatio: number | null;
  /** Actionable hints for the next tuning iteration. */
  hints: string[];
}

export interface OptSuiteReport {
  rows: OptCompareRow[];
  generatedAt: string;
}

function goalReached(state: GameState, goal: PlanGoal): boolean {
  return measureGoalProgress(state, goal).progress >= 1;
}

/** Event-driven run until `goal` is met or budget exhausted. */
export function runUntilGoalMs(
  seed: number,
  bot: Bot,
  goal: PlanGoal,
  budgetMs: number,
): BotRunResult & { goalT: number | null } {
  let goalT: number | null = null;
  const sim = new Sim({
    seed,
    maxEventDtMs: defaultMaxEventDtMs(budgetMs),
    recordTrace: 'moves-only',
  });
  try {
    sim.runEventDriven(bot, budgetMs, {
      stopWhen: (s) => {
        if (goalReached(s, goal) && goalT == null) goalT = sim.t;
        return goalReached(s, goal);
      },
    });
    if (goalT == null && goalReached(sim.state, goal)) goalT = sim.t;
    const trace = sim.trace;
    return {
      trace,
      milestones: extractMilestones(trace),
      final: sim.state,
      endT: sim.t,
      goalT,
    };
  } finally {
    Sim.teardown();
  }
}

function purchaseKey(step: { moveKind: string; target?: string; moveId: string }): string | null {
  if (step.moveKind === 'buy_upgrade' && step.target) return `up:${step.target}`;
  if (step.moveKind === 'buy_gen' && step.target) return `gen:${step.target}`;
  if (step.moveId === 'launch') return 'launch';
  return null;
}

function characterizeSteps(
  steps: PlanStep[],
  totalMs: number,
  goal: PlanGoal,
  endState: import('../types').GameState | null,
  source: 'plan' | 'bot',
  bestEffort?: boolean,
): WitnessProfile {
  const purchaseOrder: string[] = [];
  const moveHistogram: Record<string, number> = {};
  let kickCount = 0;
  let promptCount = 0;
  let idleMs = 0;

  for (const s of steps) {
    idleMs += s.waitMs;
    const key = s.moveId;
    moveHistogram[key] = (moveHistogram[key] ?? 0) + 1;
    if (s.moveId === 'kick_agent') kickCount += 1;
    if (s.moveId === 'prompt') promptCount += 1;
    const pk = purchaseKey(s);
    if (pk) purchaseOrder.push(pk);
  }

  const progress = endState
    ? measureGoalProgress(endState, goal)
    : { progress: bestEffort ? 0.5 : 0, label: 'unknown' };

  return {
    source,
    totalMs,
    achieved: progress.progress >= 1,
    progress: progress.progress,
    progressLabel: progress.label,
    purchaseOrder,
    moveHistogram,
    kickCount,
    promptCount,
    idleMs,
    idleFraction: totalMs > 0 ? idleMs / totalMs : 0,
    bestEffort,
  };
}

function characterizePlan(outcome: PlanSearchOutcome, goal: PlanGoal): WitnessProfile {
  const result = outcome.result;
  const steps = result?.steps ?? outcome.closest?.steps ?? [];
  const totalMs = result?.totalMs ?? outcome.closest?.totalMs ?? 0;
  const achieved = result != null && !result.bestEffort;
  const progress =
    (achieved ? 1 : null) ??
    result?.progress ??
    outcome.closest?.progress.progress ??
    0;
  const progressLabel =
    (achieved ? 'goal reached' : null) ??
    result?.progressLabel ??
    outcome.closest?.progress.label ??
    'partial';
  const profile = characterizeSteps(steps, totalMs, goal, null, 'plan', result?.bestEffort);
  return {
    ...profile,
    achieved,
    progress,
    progressLabel,
  };
}

function movesToSteps(
  moves: { t: number; id: string; kind: string; target?: string }[],
): PlanStep[] {
  let prevT = 0;
  return moves.map((m) => {
    const waitMs = Math.max(0, m.t - prevT);
    prevT = m.t;
    return {
      t: m.t,
      waitMs,
      moveId: m.id,
      moveKind: m.kind,
      target: m.target,
    };
  });
}

function characterizeBotRun(
  run: BotRunResult,
  goal: PlanGoal,
  goalT: number | null,
): WitnessProfile {
  const moves = run.trace.filter((e) => e.move).map((e) => ({
    t: e.t,
    id: e.move!.id,
    kind: e.move!.kind,
    target: e.move!.target,
  }));
  const steps = movesToSteps(moves);
  const totalMs = goalT ?? run.endT;
  return characterizeSteps(steps, totalMs, goal, run.final, 'bot');
}

function firstDivergentPurchase(plan: string[], bot: string[]): string | null {
  const n = Math.min(plan.length, bot.length);
  for (let i = 0; i < n; i++) {
    if (plan[i] !== bot[i]) return plan[i]!;
  }
  if (plan.length !== bot.length) return plan[n] ?? bot[n] ?? null;
  return null;
}

function isHeuristicBot(botId: string): boolean {
  return botId.startsWith('heuristic:');
}

function buildHints(
  plan: WitnessProfile,
  bot: WitnessProfile,
  botId: string,
  heuristicDebt: number | null,
  boundMs: number | null,
  simReplayOk = true,
): string[] {
  const hints: string[] = [];
  if (!plan.achieved && plan.bestEffort) {
    hints.push('search: budget exhausted — raise maxStates or tune heuristicWeight');
  }
  if (!plan.achieved && !plan.bestEffort) {
    hints.push('search: no witness — check goal definition or search opts');
  }
  if (plan.achieved && simReplayOk === false) {
    hints.push('search: witness does not replay — fix stepMove before comparing heuristics');
  }

  if (heuristicDebt != null && boundMs != null) {
    if (heuristicDebt < 0.95) {
      const pct = ((1 - heuristicDebt) * 100).toFixed(0);
      const knobs = isHeuristicBot(botId)
        ? 'planHeuristic coeffs, filterMoves/pruneShop (greedy h() beat A*)'
        : 'planHeuristic coeffs, heuristicWeight, filterMoves/pruneShop, maxStates';
      hints.push(
        `HEURISTIC DEBT: bot ${pct}% faster than graph search — search missed a legal path; tune ${knobs}`,
      );
      const div = firstDivergentPurchase(plan.purchaseOrder, bot.purchaseOrder);
      if (div && bot.achieved) {
        hints.push(
          `counterexample: faster bot diverges at ${div} — characterize bot purchase/mix in search graph`,
        );
      }
      if (bot.promptCount > plan.promptCount * 1.3) {
        hints.push('counterexample: bot is prompt-heavier — search may over-prune or under-value prompt chains');
      }
      if (bot.kickCount > plan.kickCount * 1.3) {
        hints.push('counterexample: bot is kick-heavier — raise kick value in planHeuristic / filterMoves');
      }
    } else if (heuristicDebt > 1.1) {
      hints.push(
        `bot policy: ${(heuristicDebt * 100 - 100).toFixed(0)}% slower than search bound — tune NeedWeights / MOVE_HELPS / patience`,
      );
    } else {
      hints.push('parity: bot within 10% of search bound — heuristic adequate for this case');
    }
  }

  if (plan.achieved && !bot.achieved) {
    hints.push('bot: did not reach goal — search found a path this policy misses');
  }

  return hints;
}

function buildHintsWithReplay(
  row: Pick<
    OptCompareRow,
    'plan' | 'bot' | 'botId' | 'heuristicDebt' | 'boundMs' | 'simReplayOk'
  >,
): string[] {
  return buildHints(
    row.plan,
    row.bot,
    row.botId,
    row.heuristicDebt,
    row.boundMs,
    row.simReplayOk,
  );
}

export function compareBotToPlan(opts: {
  target: OptTarget;
  seed: number;
  bot: BotCandidate;
  planOpts?: PlanSearchOpts;
}): OptCompareRow {
  const planOpts = { seed: opts.seed, ...opts.target.planOpts, ...opts.planOpts };
  const outcome = planShortestPath(opts.target.goal, planOpts);
  const plan = characterizePlan(outcome, opts.target.goal);

  const steps = outcome.result?.steps ?? [];
  const replay =
    steps.length > 0
      ? replayPlanInSim(steps, opts.seed, opts.target.goal, opts.target.botBudgetMs)
      : null;

  const budgetMs = opts.target.botBudgetMs ?? 10 * 3_600_000;
  const botInstance = opts.bot.make(opts.seed, opts.target);
  const run = runUntilGoalMs(opts.seed, botInstance, opts.target.goal, budgetMs);
  const bot = characterizeBotRun(run, opts.target.goal, run.goalT);

  const planMs = plan.achieved ? plan.totalMs : null;
  const botMs = bot.achieved ? bot.totalMs : null;
  const simReplayOk = replay?.simGoalMs != null;
  const simReplayMs = replay?.simGoalMs ?? null;
  // Replay is sim ground truth; when replay overshoots plan `t` (gate chunking), use the larger.
  const boundMs =
    simReplayOk && simReplayMs != null && planMs != null
      ? Math.max(planMs, simReplayMs)
      : simReplayOk
        ? simReplayMs
        : planMs;
  const heuristicDebt =
    boundMs != null && botMs != null && boundMs > 0 ? botMs / boundMs : null;
  const gapRatio = heuristicDebt;

  const row: OptCompareRow = {
    targetId: opts.target.id,
    targetLabel: opts.target.label,
    seed: opts.seed,
    botId: opts.bot.id,
    botLabel: opts.bot.label,
    plan,
    bot,
    planMs,
    botMs,
    simReplayMs,
    simReplayOk,
    boundMs,
    heuristicDebt,
    gapRatio,
    hints: [],
  };
  row.hints = buildHintsWithReplay(row);
  return row;
}

export interface RunOptSuiteOpts {
  targets?: OptTarget[];
  seeds?: number[];
  bots?: BotCandidate[];
  /** Extra planner heuristic variants to benchmark as bots. */
  heuristicVariants?: { id: string; label: string; heuristic: PlanHeuristicFn }[];
}

export function runOptSuite(opts: RunOptSuiteOpts = {}): OptSuiteReport {
  const targets = opts.targets ?? DEFAULT_OPT_TARGETS.filter((t) => t.id === 'launch' || t.id === 'multi_agent');
  const seeds = opts.seeds ?? [42];
  const bots = [
    ...(opts.bots ?? defaultBotCandidates().filter((b) => b.id.startsWith('adaptive:progress'))),
    ...(opts.heuristicVariants ?? []).map((v) => ({
      id: `heuristic:${v.id}`,
      label: v.label,
      make: (_seed: number, target: OptTarget) =>
        heuristicBot(target.goal, { heuristic: v.heuristic }),
    })),
  ];

  const rows: OptCompareRow[] = [];
  for (const target of targets) {
    for (const seed of seeds) {
      for (const bot of bots) {
        rows.push(compareBotToPlan({ target, seed, bot }));
      }
    }
  }
  return { rows, generatedAt: new Date().toISOString() };
}

export const OPT_LOOP_REPORT_PATH = 'debug-reports/opt-loop-last.txt';

/** Rows where a bot policy beat graph search — agent loop should tune heuristics first. */
export function heuristicDebtRows(report: OptSuiteReport): OptCompareRow[] {
  return report.rows.filter(
    (r) => r.heuristicDebt != null && r.heuristicDebt < 0.95 && r.bot.achieved,
  );
}

/** Human-readable report for agent / CI logs. */
export function formatOptReport(report: OptSuiteReport): string {
  const lines: string[] = [
    `Opt loop report (${report.generatedAt})`,
    'Primary signal: heuristicDebt < 1 ⇒ graph search lost; tune planHeuristic / search pruning, not bot policy.',
    '',
  ];
  for (const row of report.rows) {
    lines.push(
      `## ${row.targetLabel} · seed ${row.seed} · ${row.botLabel}`,
    );
    const planT = row.planMs != null ? fmtTime(row.planMs) : `— (${row.plan.progressLabel})`;
    const botT = row.botMs != null ? fmtTime(row.botMs) : `— (${row.bot.progressLabel})`;
    lines.push(`  search: ${planT}${row.plan.bestEffort ? ' (best-effort)' : ''}`);
    const replayT =
      row.simReplayMs != null
        ? fmtTime(row.simReplayMs)
        : row.simReplayOk
          ? '—'
          : 'does not launch';
    lines.push(`  replay: ${replayT}`);
    lines.push(`  bot:    ${botT}`);
    if (row.heuristicDebt != null) {
      const tag = row.heuristicDebt < 0.95 ? 'HEURISTIC DEBT' : row.heuristicDebt > 1.1 ? 'bot slow' : 'ok';
      lines.push(`  debt: ${row.heuristicDebt.toFixed(2)}× (${tag})`);
    }
    lines.push(
      `  plan mix: kicks ${row.plan.kickCount} · prompts ${row.plan.promptCount} · buys ${row.plan.purchaseOrder.length}`,
    );
    lines.push(
      `  bot mix:  kicks ${row.bot.kickCount} · prompts ${row.bot.promptCount} · buys ${row.bot.purchaseOrder.length}`,
    );
    if (row.plan.purchaseOrder.length > 0) {
      lines.push(`  plan purchases: ${row.plan.purchaseOrder.join(' → ')}`);
    }
    if (row.bot.purchaseOrder.length > 0) {
      lines.push(`  bot purchases:  ${row.bot.purchaseOrder.join(' → ')}`);
    }
    for (const h of row.hints) {
      lines.push(`  → ${h}`);
    }
    lines.push('');
  }
  const debt = heuristicDebtRows(report);
  if (debt.length > 0) {
    lines.push('## Heuristic debt summary (tune search first)');
    for (const r of debt.sort((a, b) => (a.heuristicDebt ?? 1) - (b.heuristicDebt ?? 1))) {
      lines.push(
        `  ${r.targetLabel} seed ${r.seed} ${r.botLabel}: ${r.heuristicDebt!.toFixed(2)}×`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Write formatted report for agent reads (best-effort; ignores write errors). */
export function saveOptReport(report: OptSuiteReport, path = OPT_LOOP_REPORT_PATH): void {
  try {
    const text = formatOptReport(report);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
  } catch {
    // optional artifact
  }
}

/** Quick coeffs grid for heuristic-as-bot experiments. */
export function heuristicCoeffVariants(): {
  id: string;
  label: string;
  coeffs: PlanHeuristicCoeffs;
}[] {
  return [
    { id: 'default', label: 'default', coeffs: {} },
    { id: 'tight-launch', label: 'tight launch gap', coeffs: { launchGapWeight: 0.75 } },
    { id: 'loose-unlock', label: 'loose unlock', coeffs: { unlockFracWeight: 0.2 } },
  ];
}

export function adaptiveWeightVariant(
  id: string,
  weights: NeedWeights,
  patienceMs = TRACE_PATIENCE_MS,
): BotCandidate {
  return {
    id: `weights:${id}`,
    label: `weights ${id}`,
    make: () => adaptiveBot(weights, patienceMs),
  };
}

export { defaultPlanHeuristic, makePlanHeuristic, WEIGHTS_PROGRESS };
