import type { GameState, LogEntry } from '../types';
import { isLogEntryFullyDisplayed } from './useStreamingLog';

/** User lines tagged `queued` in persisted state. */
export function queuedUserEntries(state: GameState): LogEntry[] {
  return state.log.filter((e) => e.type === 'user' && e.queued);
}

/**
 * Tag blocked user lines as queued; clear the flag once they have streamed in.
 * Persisted on `GameState.log` so reload / blur snapshot keeps the queue.
 */
export function syncQueuedUserFlags(state: GameState, displayLog: LogEntry[]): GameState {
  let changed = false;
  const log = state.log.map((entry, i) => {
    if (entry.type !== 'user') return entry;

    const displayed = isLogEntryFullyDisplayed(entry.id, state.log, displayLog);
    const blocked = state.log
      .slice(0, i)
      .some((prior) => !isLogEntryFullyDisplayed(prior.id, state.log, displayLog));
    const shouldQueue = !displayed && blocked;

    if (shouldQueue && !entry.queued) {
      changed = true;
      return { ...entry, queued: true };
    }
    if (entry.queued && displayed) {
      changed = true;
      const { queued: _queued, ...rest } = entry;
      return rest;
    }
    return entry;
  });

  return changed ? { ...state, log } : state;
}
