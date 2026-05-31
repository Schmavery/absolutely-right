import type { Bot, BotContext } from './Sim';
import type { Move } from '../game/availability';
import {
  pickAdaptiveMove,
  WEIGHTS_HYGIENE,
  WEIGHTS_LOC,
  WEIGHTS_PROGRESS,
  type NeedWeights,
} from '../game/moveIntent';

export type BotStrategyId = 'progress' | 'loc' | 'hygiene';

/** Legacy fixed action ranking (pre–state-based bots). */
export const PRIORITY_PROGRESS: Record<string, number> = {
  launch: 1000,
  buy_upgrade: 900,
  buy_gen: 800,
  bug_bounty: 700,
  run_tests: 600,
  paste_error: 500,
  write_test: 400,
  kick_agent: 300,
  clear_context: 200,
  new_free_account: 150,
  prompt: 100,
};

export const PRIORITY_LOC: Record<string, number> = {
  buy_upgrade: 1000,
  buy_gen: 980,
  launch: 920,
  prompt: 880,
  new_free_account: 860,
  bug_bounty: 500,
  run_tests: 450,
  paste_error: 400,
  write_test: 350,
  kick_agent: 300,
  clear_context: 200,
};

export const PRIORITY_HYGIENE: Record<string, number> = {
  run_tests: 1000,
  write_test: 950,
  bug_bounty: 900,
  paste_error: 850,
  kick_agent: 800,
  buy_upgrade: 700,
  buy_gen: 650,
  launch: 600,
  clear_context: 500,
  new_free_account: 400,
  prompt: 100,
};

function moveRank(m: Move, priorities: Record<string, number>): number {
  return priorities[m.kind === 'action' ? m.actionId! : m.kind] ?? 0;
}

function pickPriorityMove(
  ctx: BotContext,
  priorities: Record<string, number>,
  patienceMs: number,
): Move | null {
  const rank = (m: Move) => moveRank(m, priorities);
  const sortedLegal = [...ctx.legal].sort((a, b) => {
    const d = rank(b) - rank(a);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
  const bestLegal = sortedLegal[0];
  const bestRank = bestLegal ? rank(bestLegal) : -Infinity;

  let soon: Move | null = null;
  let soonRank = bestRank;
  for (const m of ctx.visible) {
    if (m.legal) continue;
    if (m.waitMs === null || m.waitMs <= 0 || m.waitMs > patienceMs) continue;
    const r = rank(m);
    if (r > soonRank) {
      soon = m;
      soonRank = r;
    }
  }
  if (soon) return null;
  return bestLegal ?? null;
}

/** Fixed priority table + patience (old trace bots). */
export function priorityBot(
  priorities: Record<string, number>,
  patienceMs = TRACE_PATIENCE_MS,
): Bot {
  return (ctx) => pickPriorityMove(ctx, priorities, patienceMs);
}

export type RankBotId =
  | 'progress_rank'
  | 'loc_rank'
  | 'hygiene_rank'
  | 'greedy_rank'
  | 'instant_rank'
  | 'patient_rank';

const STRATEGY_WEIGHTS: Record<BotStrategyId, NeedWeights> = {
  progress: WEIGHTS_PROGRESS,
  loc: WEIGHTS_LOC,
  hygiene: WEIGHTS_HYGIENE,
};

export const BOT_STRATEGIES: Record<BotStrategyId, { label: string; description: string }> = {
  progress: {
    label: 'Progress',
    description: 'Launch and buys when affordable; fixes deficits by state.',
  },
  loc: {
    label: 'LOC',
    description: 'Prioritizes LOC and purchases over launch and hygiene.',
  },
  hygiene: {
    label: 'Hygiene',
    description: 'Tests and bug tools when bugs are high.',
  },
};

/**
 * Idle up to `patienceMs` when a higher-scoring move unlocks soon (event-driven
 * sim fast-forwards).
 */
export const TRACE_PATIENCE_MS = 10_000;

export function adaptiveBot(
  weights: NeedWeights,
  patienceMs = TRACE_PATIENCE_MS,
): Bot {
  return (ctx: BotContext) => pickAdaptiveMove(ctx, { weights, patienceMs });
}

export function strategyBot(strategy: BotStrategyId, patienceMs = TRACE_PATIENCE_MS): Bot {
  return adaptiveBot(STRATEGY_WEIGHTS[strategy], patienceMs);
}

/** Default playtest / invariant bot (progress profile). */
export const greedyPlayer: Bot = strategyBot('progress');

export const lazy: Bot = (): null => null;

export const spammer: Bot = (ctx: BotContext): Move | null => {
  if (ctx.legal.length === 0) return null;
  return ctx.legal[0];
};

export function randomBot(seed: number): Bot {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
    t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
  return (ctx: BotContext): Move | null => {
    if (ctx.legal.length === 0) return null;
    return ctx.legal[Math.floor(next() * ctx.legal.length)];
  };
}

export type DebugBotId = BotStrategyId | RankBotId | 'lazy' | 'random' | 'spammer';

export const DEBUG_BOTS: Record<
  DebugBotId,
  { label: string; make: (simSeed: number) => Bot }
> = {
  progress: { label: 'Progress', make: () => strategyBot('progress') },
  loc: { label: 'LOC', make: () => strategyBot('loc') },
  hygiene: { label: 'Hygiene', make: () => strategyBot('hygiene') },
  progress_rank: {
    label: 'Progress (rank)',
    make: () => priorityBot(PRIORITY_PROGRESS),
  },
  loc_rank: { label: 'LOC (rank)', make: () => priorityBot(PRIORITY_LOC) },
  hygiene_rank: {
    label: 'Hygiene (rank)',
    make: () => priorityBot(PRIORITY_HYGIENE),
  },
  greedy_rank: {
    label: 'Greedy (rank, 5s)',
    make: () => priorityBot(PRIORITY_PROGRESS, 5000),
  },
  instant_rank: {
    label: 'Instant (rank, 0s)',
    make: () => priorityBot(PRIORITY_PROGRESS, 0),
  },
  patient_rank: {
    label: 'Patient (rank, 30s)',
    make: () => priorityBot(PRIORITY_PROGRESS, 30_000),
  },
  lazy: { label: 'Lazy (no clicks)', make: () => lazy },
  random: {
    label: 'Random legal',
    make: (simSeed) => randomBot(simSeed ^ 0xdecafbad),
  },
  spammer: { label: 'Spammer', make: () => spammer },
};

/** @deprecated Use `strategyBot('progress')` or `priorityBot`. */
export function patientGreedy(opts: { patienceMs?: number } = {}): Bot {
  return priorityBot(PRIORITY_PROGRESS, opts.patienceMs ?? 5000);
}
