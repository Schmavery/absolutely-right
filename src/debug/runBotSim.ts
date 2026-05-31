import {
  Sim,
  traceSnapshot,
  type Bot,
  type TraceEntry,
  type TraceRecord,
} from '../sim/Sim';
import type { GameState } from '../types';
import { defaultState } from '../game/state';
import { extractMilestones, milestonesBetween, type TraceMilestone } from './traceAnalyze';

export interface BotRunResult {
  trace: TraceEntry[];
  milestones: TraceMilestone[];
  final: GameState;
  endT: number;
}

const MS_PER_HOUR = 3_600_000;

export function defaultMaxEventDtMs(virtualMs: number): number {
  return virtualMs >= MS_PER_HOUR ? 300_000 : 30_000;
}

export function runBotSim(opts: {
  seed: number;
  bot: Bot;
  virtualMs: number;
  state?: GameState;
  recordTrace?: TraceRecord;
  /** No trace array; milestones only via `onAfterMove` (heatmap runs). */
  milestonesOnly?: boolean;
  maxEventDtMs?: number;
}): BotRunResult {
  const milestones: TraceMilestone[] = [];
  let prev = traceSnapshot(opts.state ?? defaultState());

  const sim = new Sim({
    seed: opts.seed,
    state: opts.state,
    recordTrace: opts.milestonesOnly ? false : (opts.recordTrace ?? 'moves-only'),
    maxEventDtMs: opts.maxEventDtMs ?? defaultMaxEventDtMs(opts.virtualMs),
    onAfterMove: ({ t, snapshot }) => {
      milestones.push(...milestonesBetween(prev, snapshot, t));
      prev = snapshot;
    },
  });

  try {
    sim.runEventDriven(opts.bot, opts.virtualMs);
    const trace = sim.trace;
    return {
      trace,
      milestones: opts.milestonesOnly ? milestones : extractMilestones(trace),
      final: sim.state,
      endT: sim.t,
    };
  } finally {
    Sim.teardown();
  }
}

export function serializeRun(
  botId: import('./traceTypes').SerializedRun['botId'],
  seed: number,
  result: BotRunResult,
): import('./traceTypes').SerializedRun {
  const snap = traceSnapshot(result.final);
  const moves = result.trace
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
    milestones: result.milestones,
    moves,
    endT: result.endT,
    final: {
      totalLoc: snap.totalLoc,
      upgrades: snap.upgrades,
      launched: snap.launched,
    },
  };
}

export function heatmapFromRuns(runs: import('./traceTypes').SerializedRun[]): Map<
  string,
  { botId: import('./traceTypes').SerializedRun['botId']; t: number; loc: number }[]
> {
  const map = new Map<string, { botId: import('./traceTypes').SerializedRun['botId']; t: number; loc: number }[]>();
  for (const run of runs) {
    mergeHeatmapBot(map, run.botId, run.milestones);
  }
  return map;
}

export function mergeHeatmapBot(
  heatmap: Map<string, { botId: import('./traceTypes').SerializedRun['botId']; t: number; loc: number }[]>,
  botId: import('./traceTypes').SerializedRun['botId'],
  milestones: TraceMilestone[],
): void {
  for (const m of milestones) {
    if (m.kind !== 'upgrade' || !m.id) continue;
    const list = heatmap.get(m.id) ?? [];
    list.push({ botId, t: m.t, loc: m.totalLoc });
    heatmap.set(m.id, list);
  }
}

export function heatmapToSerialized(
  map: Map<string, { botId: import('./traceTypes').SerializedRun['botId']; t: number; loc: number }[]>,
): [string, { botId: import('./traceTypes').SerializedRun['botId']; t: number; loc: number }[]][] {
  return [...map.entries()];
}

export function heatmapFromSerialized(
  entries: [string, { botId: import('./traceTypes').SerializedRun['botId']; t: number; loc: number }[]][],
): Map<string, { botId: import('./traceTypes').SerializedRun['botId']; t: number; loc: number }[]> {
  return new Map(entries);
}
