import type { TraceMilestone } from './traceAnalyze';
import type { MoveKind } from '../game/availability';
import type { DebugBotId } from '../sim/bots';

export const MS_PER_VIRTUAL_HOUR = 3_600_000;

export interface TraceRunConfig {
  runKey: string;
  /** Shared sim RNG seed for all bot columns. */
  seed: number;
  botIds: DebugBotId[];
  budgetMs: number;
  chunkMs: number;
  firstChunkMs: number;
}

export interface SerializedMove {
  t: number;
  id: string;
  kind: MoveKind;
  target?: string;
  loc: number;
}

export interface SerializedRun {
  botId: DebugBotId;
  seed: number;
  milestones: TraceMilestone[];
  moves: SerializedMove[];
  endT: number;
  final: { totalLoc: number; upgrades: string[]; launched: boolean };
}

export interface TraceRunPayload {
  runs: SerializedRun[];
  heatmapByUpgrade: [string, { botId: DebugBotId; t: number; loc: number }[]][];
}

export type TraceWorkerBotIn = {
  type: 'runBot';
  requestId: number;
  botId: DebugBotId;
  seed: number;
  budgetMs: number;
  chunkMs: number;
  firstChunkMs: number;
};

export type TraceWorkerBotOut =
  | {
      type: 'botChunk';
      requestId: number;
      run: SerializedRun;
      virtualHours: number;
      done: boolean;
    }
  | { type: 'error'; requestId: number; botId: DebugBotId; message: string };
