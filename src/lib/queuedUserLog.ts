import type { GameState, LogEntry } from '../types';
import { isLogEntryFullyDisplayed } from './useStreamingLog';

function burstIdOf(entry: LogEntry): number {
  return entry.burstId ?? entry.id;
}

/** Opening `>` from a multi-line append; follow-ups in the same burst skip the queue. */
function isFirstUserInBurst(log: LogEntry[], index: number): boolean {
  const entry = log[index]!;
  const burst = burstIdOf(entry);
  for (let j = 0; j < index; j++) {
    const prior = log[j]!;
    if (prior.type === 'user' && burstIdOf(prior) === burst) return false;
  }
  return true;
}

/**
 * User lines waiting in `state.log` while earlier entries still stream.
 * Scans blocked user entries so a second prompt during an AI reply still
 * surfaces, but only the opening `>` per append — multi-turn events
 * (`> X / AI / > Y / AI`) do not stack follow-up lines in the queue.
 */
export function computeQueuedUserEntries(
  stateLog: LogEntry[],
  displayLog: LogEntry[],
  isAnimating: boolean,
): LogEntry[] {
  if (!isAnimating) return [];

  const queued: LogEntry[] = [];
  for (let i = 0; i < stateLog.length; i++) {
    const entry = stateLog[i]!;
    if (entry.type !== 'user') continue;
    if (!isFirstUserInBurst(stateLog, i)) continue;
    if (isLogEntryFullyDisplayed(entry.id, stateLog, displayLog)) continue;
    const blocked = stateLog
      .slice(0, i)
      .some((prior) => !isLogEntryFullyDisplayed(prior.id, stateLog, displayLog));
    if (blocked) queued.push(entry);
  }
  return queued;
}

/** User lines tagged `queued` in persisted state (blur snapshot). */
export function queuedUserEntries(state: GameState): LogEntry[] {
  return state.log.filter((e) => e.type === 'user' && e.queued);
}

/** Mirror `computeQueuedUserEntries` onto `GameState.log` for disk snapshots. */
export function syncQueuedUserFlags(
  state: GameState,
  displayLog: LogEntry[],
  isAnimating: boolean,
): GameState {
  const computed = computeQueuedUserEntries(state.log, displayLog, isAnimating);
  const computedIds = new Set(computed.map((e) => e.id));
  let changed = false;
  const log = state.log.map((entry) => {
    if (entry.type !== 'user') return entry;
    const shouldQueue = computedIds.has(entry.id);
    if (shouldQueue && !entry.queued) {
      changed = true;
      return { ...entry, queued: true };
    }
    if (entry.queued && !shouldQueue) {
      changed = true;
      const { queued: _queued, ...rest } = entry;
      return rest;
    }
    return entry;
  });

  return changed ? { ...state, log } : state;
}
