import { DEBUG_BOTS } from '../sim/bots';
import { Sim, traceSnapshot } from '../sim/Sim';
import { defaultMaxEventDtMs } from './runBotSim';
import { extractMilestones } from './traceAnalyze';
import type { SerializedRun } from './traceTypes';
import type { DebugBotId } from '../sim/bots';

function buildRun(botId: DebugBotId, seed: number, sim: Sim): SerializedRun {
  const snap = traceSnapshot(sim.state);
  const moves = sim.trace
    .filter((e) => e.move)
    .map((e) => ({
      t: e.t,
      id: e.move!.id,
      kind: e.move!.kind,
      target: e.move!.target,
      loc: e.snapshot.totalLoc,
    }));
  return {
    botId,
    seed,
    milestones: extractMilestones(sim.trace),
    moves,
    endT: sim.t,
    final: {
      totalLoc: snap.totalLoc,
      upgrades: snap.upgrades,
      launched: snap.launched,
    },
  };
}

/**
 * One continuous sim per bot; posts accumulated trace after each virtual-time chunk.
 */
export function runOneBotChunked(
  opts: {
    botId: DebugBotId;
    seed: number;
    budgetMs: number;
    chunkMs: number;
    firstChunkMs: number;
  },
  emit: (run: SerializedRun, virtualHours: number, done: boolean) => void,
): void {
  const botDef = DEBUG_BOTS[opts.botId];
  if (!botDef) throw new Error(`Unknown bot: ${opts.botId}`);

  const sim = new Sim({
    seed: opts.seed,
    recordTrace: 'moves-only',
    maxEventDtMs: defaultMaxEventDtMs(opts.budgetMs),
  });

  try {
    const bot = botDef.make(opts.seed);
    let first = true;

    while (sim.t < opts.budgetMs) {
      const remaining = opts.budgetMs - sim.t;
      const step = first
        ? Math.min(opts.firstChunkMs, remaining)
        : Math.min(opts.chunkMs, remaining);
      first = false;

      sim.runEventDriven(bot, step);

      const virtualHours = sim.t / 3_600_000;
      const done = sim.t >= opts.budgetMs;
      emit(buildRun(opts.botId, opts.seed, sim), virtualHours, done);
      if (done) break;
    }
  } finally {
    Sim.teardown();
  }
}
