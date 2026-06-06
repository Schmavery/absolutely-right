import type { LogEntry } from '../types';

/** True when `displayLog` has finished streaming an entry from `stateLog`. */
export function isLogEntryFullyDisplayed(
  entryId: number,
  stateLog: LogEntry[],
  displayLog: LogEntry[],
): boolean {
  const src = stateLog.find((e) => e.id === entryId);
  const d = displayLog.find((e) => e.id === entryId);
  return !!src && !!d && d.text === src.text;
}

export function burstIdOf(entry: LogEntry): number {
  return entry.burstId ?? entry.id;
}

/** Bursts with a line still streaming or not yet fully shown in `displayLog`. */
export function activeBurstIds(
  stateLog: LogEntry[],
  displayLog: LogEntry[],
  currentEntry: LogEntry | null,
): Set<number> {
  const ids = new Set<number>();
  if (currentEntry) ids.add(burstIdOf(currentEntry));
  for (const entry of displayLog) {
    if (!isLogEntryFullyDisplayed(entry.id, stateLog, displayLog)) {
      ids.add(burstIdOf(entry));
    }
  }
  return ids;
}

/**
 * Insert priority/instant entries after any pending tail from active bursts,
 * but before unrelated backlog — keeps multi-line events intact.
 */
export function insertPriorityEntries(
  pending: LogEntry[],
  incoming: LogEntry[],
  activeBursts: Set<number>,
): LogEntry[] {
  if (incoming.length === 0) return pending;
  if (activeBursts.size === 0) return [...incoming, ...pending];

  let insertAt = 0;
  while (insertAt < pending.length && activeBursts.has(burstIdOf(pending[insertAt]!))) {
    insertAt++;
  }
  return [...pending.slice(0, insertAt), ...incoming, ...pending.slice(insertAt)];
}
