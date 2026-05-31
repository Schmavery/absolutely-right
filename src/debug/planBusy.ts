import type { GameState, LogEntry } from '../types';
import { effectiveStreamMs } from '../game/streamSchedule';

/** New log lines appended between two states (by id). */
export function newLogEntries(prev: GameState, next: GameState): LogEntry[] {
  const afterId = prev.logId;
  return next.log.filter((e) => e.id > afterId);
}

/**
 * Wall-clock ms to drain new log lines. Matches UI queue playback:
 * entries play sequentially; each starts after the prior finishes.
 */
export function streamMsForNewEntries(prev: GameState, next: GameState): number {
  const added = newLogEntries(prev, next);
  if (added.length === 0) return 0;
  let total = 0;
  let prevWasUser = prev.log[prev.log.length - 1]?.type === 'user';
  for (const e of added) {
    total += effectiveStreamMs(e, prevWasUser);
    prevWasUser = e.type === 'user';
  }
  return total;
}

/**
 * Extend chat-busy horizon after new log lines land at `atMs`.
 * Same-timestamp appends use max stacking (see equivalence.test.ts).
 */
export function extendChatBusyUntil(
  busyUntil: number,
  atMs: number,
  streamMs: number,
): number {
  if (streamMs <= 0) return busyUntil;
  return Math.max(busyUntil, atMs + streamMs);
}
