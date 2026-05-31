import { LAUNCH_LOC } from '../game/constants';
import { getPhase } from '../game/phases';
import { defaultMaxEventDtMs } from './runBotSim';
import { fmtTime } from './traceAnalyze';
import type { Bot } from '../sim/Sim';
import { Sim } from '../sim/Sim';
import {
  DEBUG_BOTS,
  strategyBot,
  type BotStrategyId,
  type DebugBotId,
} from '../sim/bots';

/** Same default as TraceDebug. */
export const LAUNCH_BENCH_BUDGET_MS = 10 * 3_600_000;
export const LAUNCH_BENCH_SEEDS = [1, 7, 42, 99, 4242];
export const LAUNCH_BENCH_PATIENCE_MS = [0, 10_000, 30_000] as const;
export const LAUNCH_BENCH_STRATEGIES: BotStrategyId[] = ['progress', 'loc', 'hygiene'];

/** Flavor index 2: launched + pro_plan/money or multi_agent or mcp_tools (`getPhase`). */
export const BENCH_PHASE_2 = 2;

export function medianMs(values: number[]): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export interface MilestoneRunTimes {
  /** Time when `getPhase(state) >= targetPhase` (or launch for target 1). */
  milestoneT: number | null;
  launchT: number | null;
}

/** Event-driven run until flavor phase index ≥ `targetPhase` (stops early). */
export function runUntilPhaseMs(
  seed: number,
  bot: Bot,
  targetPhase: number,
  budgetMs = LAUNCH_BENCH_BUDGET_MS,
): MilestoneRunTimes {
  let milestoneT: number | null = null;
  let launchT: number | null = null;
  const sim = new Sim({
    seed,
    maxEventDtMs: defaultMaxEventDtMs(budgetMs),
    onAfterMove: ({ t, snapshot }) => {
      if (launchT == null && snapshot.launched) launchT = t;
      if (milestoneT == null && getPhase(snapshot) >= targetPhase) milestoneT = t;
    },
  });
  try {
    sim.runEventDriven(bot, budgetMs, {
      stopWhen: (s) => getPhase(s) >= targetPhase,
    });
    const phase = getPhase(sim.state);
    if (milestoneT == null && phase >= targetPhase) milestoneT = sim.t;
    if (launchT == null && sim.state.launched) launchT = sim.t;
    return { milestoneT, launchT };
  } finally {
    Sim.teardown();
  }
}

/** Stops at deploy (flavor phase ≥ 1). */
export function launchTimeMsForBot(seed: number, bot: Bot): number | null {
  const { milestoneT, launchT } = runUntilPhaseMs(seed, bot, 1);
  return launchT ?? milestoneT;
}

/** Stops at flavor phase 2 (mid chapter). */
export function phase2TimeMsForBot(seed: number, bot: Bot): number | null {
  return runUntilPhaseMs(seed, bot, BENCH_PHASE_2).milestoneT;
}

export interface LaunchBenchRow {
  label: string;
  medianMs: number;
  launches: number;
  times: string[];
}

function medianMilestoneRow(
  label: string,
  seeds: number[],
  bot: (seed: number) => Bot,
  measure: (seed: number, bot: Bot) => number | null,
): LaunchBenchRow {
  const ms: number[] = [];
  for (const seed of seeds) {
    const t = measure(seed, bot(seed));
    if (t != null) ms.push(t);
  }
  return {
    label,
    medianMs: medianMs(ms),
    launches: ms.length,
    times: ms.map((t) => fmtTime(t)),
  };
}

export function medianLaunchRow(
  label: string,
  seeds: number[],
  bot: (seed: number) => Bot,
): LaunchBenchRow {
  return medianMilestoneRow(label, seeds, bot, launchTimeMsForBot);
}

export function medianPhase2Row(
  label: string,
  seeds: number[],
  bot: (seed: number) => Bot,
): LaunchBenchRow {
  return medianMilestoneRow(label, seeds, bot, phase2TimeMsForBot);
}

export function logMedianTable(title: string, rows: LaunchBenchRow[], topN = 10): void {
  const ranked = [...rows].sort((a, b) => a.medianMs - b.medianMs);
  const lines: string[] = [`\n${title}`];
  for (const r of ranked) {
    lines.push(
      `  ${r.label.padEnd(22)} ${r.medianMs === Infinity ? '—' : fmtTime(r.medianMs).padStart(7)}  (${r.launches}/${LAUNCH_BENCH_SEEDS.length})  [${r.times.join(', ')}]`,
    );
  }
  const top = ranked.filter((r) => r.medianMs < Infinity).slice(0, topN);
  lines.push(
    `\nTop ${top.length}: ${top.map((r) => `${r.label} ${fmtTime(r.medianMs)}`).join(' · ')}`,
  );
  console.log(lines.join('\n'));
}

const RANK_BOTS: DebugBotId[] = [
  'instant_rank',
  'greedy_rank',
  'progress_rank',
  'patient_rank',
  'loc_rank',
  'hygiene_rank',
];

function patienceSweepRows(
  measure: (label: string, seeds: number[], bot: (seed: number) => Bot) => LaunchBenchRow,
): LaunchBenchRow[] {
  const rows: LaunchBenchRow[] = [];
  for (const strategy of LAUNCH_BENCH_STRATEGIES) {
    for (const p of LAUNCH_BENCH_PATIENCE_MS) {
      const pLabel = p === 0 ? '0s' : p === 10_000 ? '10s' : '30s';
      rows.push(
        measure(`${strategy}@${pLabel}`, LAUNCH_BENCH_SEEDS, () => strategyBot(strategy, p)),
      );
    }
  }
  for (const botId of RANK_BOTS) {
    rows.push(
      measure(botId, LAUNCH_BENCH_SEEDS, (seed) => DEBUG_BOTS[botId]!.make(seed)),
    );
  }
  return rows;
}

export function runPatienceSweep(): LaunchBenchRow[] {
  const rows = patienceSweepRows(medianLaunchRow);
  logMedianTable(
    `Median launch @ ${LAUNCH_LOC} (10h cap), seeds ${LAUNCH_BENCH_SEEDS.join(', ')} — patience sweep:`,
    rows,
    10,
  );
  return rows;
}

export function runPhase2PatienceSweep(): LaunchBenchRow[] {
  const rows = patienceSweepRows(medianPhase2Row);
  logMedianTable(
    `Median phase ${BENCH_PHASE_2} (launched + pro_plan|multi_agent|mcp_tools), 10h cap, seeds ${LAUNCH_BENCH_SEEDS.join(', ')}:`,
    rows,
    10,
  );
  return rows;
}
