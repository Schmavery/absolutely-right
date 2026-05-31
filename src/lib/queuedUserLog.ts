import type { LogEntry } from '../types';
import { isLogEntryFullyDisplayed } from './useStreamingLog';

/**
 * User lines waiting in `state.log` while earlier entries still stream.
 * Scans all user entries (not only the first incomplete log line) so a
 * second `>` prompt during an AI reply still surfaces in the queued panel.
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
    if (isLogEntryFullyDisplayed(entry.id, stateLog, displayLog)) continue;
    const blocked = stateLog
      .slice(0, i)
      .some((prior) => !isLogEntryFullyDisplayed(prior.id, stateLog, displayLog));
    if (blocked) queued.push(entry);
  }
  return queued;
}
