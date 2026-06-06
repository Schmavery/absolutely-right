/**
 * Shared move policy: assess resource pressure, score legal moves by what they
 * fix, optionally wait for a better soon-unlock. Used by trace bots and the
 * debug goal planner (`filterMovesForPlanner`).
 */

import type { Move } from './availability';
import { LAUNCH_LOC, THRESHOLDS } from './constants';
import { action, GENS, UPGRADES } from './data';
import { deriveGame } from './derive';
import { mcpBlocksPlay } from './mcpApproval';
import { mcpToolIsSafe } from './data';
import { calcTokenConfig, genCost } from './rates';
import type { GameState } from '../types';
import { now as runtimeNow } from './runtime';

export type NeedAxis = 'loc' | 'tokens' | 'bugs' | 'tests' | 'economy' | 'launch';

export type NeedVector = Record<NeedAxis, number>;

export interface NeedWeights {
  loc: number;
  tokens: number;
  bugs: number;
  tests: number;
  economy: number;
  launch: number;
}

/** Trace column: ship launch and buys. */
export const WEIGHTS_PROGRESS: NeedWeights = {
  launch: 2.2,
  economy: 1.6,
  loc: 1,
  bugs: 0.55,
  tests: 0.5,
  tokens: 0.45,
};

/** Trace column: grind LOC and purchases. */
export const WEIGHTS_LOC: NeedWeights = {
  loc: 2,
  economy: 1.9,
  launch: 1.1,
  tokens: 0.5,
  bugs: 0.45,
  tests: 0.35,
};

/** Trace column: tests and bug tools first. */
export const WEIGHTS_HYGIENE: NeedWeights = {
  bugs: 2.1,
  tests: 1.9,
  loc: 0.55,
  economy: 0.75,
  launch: 0.85,
  tokens: 0.4,
};

/** How strongly a move addresses each need axis (0–1 per axis). */
const MOVE_HELPS: Record<string, Partial<Record<NeedAxis, number>>> = {
  prompt: { loc: 1 },
  paste_error: { bugs: 0.85, loc: 0.25 },
  write_test: { tests: 1, bugs: 0.45 },
  run_tests: { bugs: 1 },
  kick_agent: { loc: 0.85 },
  clear_context: { tokens: 1 },
  new_free_account: { tokens: 1 },
  launch: { launch: 1 },
  mcp_allow: { loc: 0.55 },
  mcp_always_allow: { loc: 0.55 },
  mcp_deny: { bugs: 0.85, tests: 0.2 },
  bug_bounty: { bugs: 0.75 },
  buy_gen: { economy: 1, loc: 0.65 },
  buy_upgrade: { economy: 1, loc: 0.55 },
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function moveIntentKey(m: Move): string {
  return m.kind === 'action' ? m.actionId! : m.kind;
}

export function moveHelps(m: Move): Partial<Record<NeedAxis, number>> {
  return MOVE_HELPS[moveIntentKey(m)] ?? {};
}

/** Cheapest visible gen/upgrade buy target (for loc pressure). */
export function cheapestBuyTarget(state: GameState): number | null {
  const { ui, thresholds } = deriveGame(state);
  let min = Infinity;
  if (ui.showGenSection) {
    for (const g of GENS) {
      const vis = g.unlockAt * thresholds.generatorVisibleFraction;
      if (state.totalLoc < vis) continue;
      min = Math.min(min, genCost(g, state.genCounts[g.id] ?? 0));
    }
  }
  if (ui.showUpgSection) {
    for (const u of UPGRADES) {
      if (!state.unlockedUpgrades.includes(u.id) || state.upgrades.includes(u.id)) continue;
      const vis = u.unlockAt * thresholds.upgradeUnlockFraction;
      if (state.totalLoc < vis) continue;
      min = Math.min(min, u.cost);
    }
  }
  return min < Infinity ? min : null;
}

export function assessNeeds(state: GameState, t: number = runtimeNow()): NeedVector {
  const { ui, thresholds } = deriveGame(state);
  const { maxTokens } = calcTokenConfig(state.upgrades, state.freeAccounts);
  const kickCost = action('kick_agent').tokenCost ?? 60;
  const buyTarget = cheapestBuyTarget(state);
  const locDenom = buyTarget ?? LAUNCH_LOC * 0.5;

  const locUrgency = clamp01(1 - state.loc / Math.max(1, locDenom * 0.45));

  const tokenPressure =
    state.tokens < kickCost * 1.1 ||
    (state.minTokensSeen ?? maxTokens) < thresholds.showClearContextMinTokens;
  const tokensUrgency = tokenPressure ? clamp01(1 - state.tokens / Math.max(1, maxTokens)) : 0;

  const bugsUrgency = clamp01(state.bugs / Math.max(1, THRESHOLDS.warnBugsElevated));

  let testsUrgency = 0;
  if (state.bugs >= thresholds.showWriteTestsBugs && (state.tests ?? 0) === 0) {
    testsUrgency = clamp01(state.bugs / Math.max(1, thresholds.showWriteTestsBugs));
  } else if ((state.tests ?? 0) >= thresholds.showRunTestsTests) {
    testsUrgency = clamp01(0.4 * state.bugs / THRESHOLDS.warnBugsElevated);
  }

  const economyUrgency =
    buyTarget != null && state.loc >= buyTarget * 0.7
      ? clamp01(state.loc / buyTarget)
      : 0;

  const launchUrgency =
    ui.showLaunchBtn && !state.launched ? clamp01(state.totalLoc / LAUNCH_LOC) : 0;

  return {
    loc: locUrgency,
    tokens: tokensUrgency,
    bugs: bugsUrgency,
    tests: testsUrgency,
    economy: economyUrgency,
    launch: launchUrgency,
  };
}

export function scoreMove(
  move: Move,
  needs: NeedVector,
  weights: NeedWeights,
  /** Tiny bias so ties are stable and buys beat noise. */
  tieBias = 0,
): number {
  const helps = moveHelps(move);
  let s = tieBias;
  for (const axis of Object.keys(needs) as NeedAxis[]) {
    const h = helps[axis] ?? 0;
    if (h > 0) s += needs[axis] * weights[axis] * h;
  }
  return s;
}

export interface PickAdaptiveOpts {
  weights: NeedWeights;
  patienceMs: number;
  /** Per-move-id bias (e.g. prefer cheaper upgrades by target id). */
  tieBias?: (m: Move) => number;
}

export function pickAdaptiveMove(
  ctx: { state: GameState; visible: Move[]; legal: Move[]; t: number },
  opts: PickAdaptiveOpts,
): Move | null {
  if (mcpBlocksPlay(ctx.state)) {
    const mcp = ctx.legal.filter(
      (m) =>
        m.actionId === 'mcp_allow' ||
        m.actionId === 'mcp_always_allow' ||
        m.actionId === 'mcp_deny',
    );
    if (mcp.length === 0) return null;
    const needs = assessNeeds(ctx.state, ctx.t);
    const score = (m: Move) => scoreMove(m, needs, opts.weights, opts.tieBias?.(m) ?? 0);
    return [...mcp].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0]!;
  }
  const needs = assessNeeds(ctx.state, ctx.t);
  const score = (m: Move) => scoreMove(m, needs, opts.weights, opts.tieBias?.(m) ?? 0);

  const sortedLegal = [...ctx.legal].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
  const bestLegal = sortedLegal[0];
  const bestScore = bestLegal ? score(bestLegal) : -Infinity;

  let soonMove: Move | null = null;
  let soonScore = bestScore;
  for (const m of ctx.visible) {
    if (m.legal) continue;
    if (m.waitMs === null || m.waitMs <= 0 || m.waitMs > opts.patienceMs) continue;
    const s = score(m);
    if (s > soonScore) {
      soonMove = m;
      soonScore = s;
    }
  }
  if (soonMove) return null;
  return bestLegal ?? null;
}

/** Planner helper: keep economic + goal moves; drop low-value grinds when pressure is elsewhere. */
export function filterMovesForPlanner(
  moves: Move[],
  state: GameState,
  t: number,
  opts: { weights?: NeedWeights; minScore?: number } = {},
): Move[] {
  const needs = assessNeeds(state, t);
  const weights = opts.weights ?? WEIGHTS_PROGRESS;
  const minScore = opts.minScore ?? 0.28;
  const top = topNeeds(needs, 2);

  return moves.filter((m) => {
    if (m.waitMs === null && !m.legal) return false;
    if (m.kind === 'buy_upgrade' || m.kind === 'buy_gen') return true;
    if (m.id === 'launch') return true;
    const s = scoreMove(m, needs, weights);
    if (s >= minScore) return true;
    const helps = moveHelps(m);
    return top.some((axis) => (helps[axis] ?? 0) >= 0.5);
  });
}

export function topNeeds(needs: NeedVector, n: number): NeedAxis[] {
  return (Object.keys(needs) as NeedAxis[])
    .sort((a, b) => needs[b] - needs[a])
    .slice(0, n);
}

/** Describe current pressure for debug UI. */
export function formatNeedsSummary(needs: NeedVector): string {
  return topNeeds(needs, 3)
    .filter((a) => needs[a] > 0.15)
    .map((a) => `${a} ${(needs[a] * 100).toFixed(0)}%`)
    .join(', ');
}
