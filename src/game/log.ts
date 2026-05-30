import type { GameState, LogEntry, LogEntryType } from '../types';
import { MAX_LOG } from './constants';

/**
 * Append one or more log entries derived from `text` to `prev.log`. Lines
 * starting with `>` are detected automatically and their type is overridden
 * to `'user'` (they render right-aligned in the conversation panel). Empty
 * lines are dropped. The log is truncated to `MAX_LOG` entries.
 */
export function appendLog(prev: GameState, text: string, type: LogEntryType): GameState {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  let next = prev;
  for (const line of lines) {
    const isUser = line.trimStart().startsWith('>');
    const clean = isUser ? line.replace(/^\s*>\s*/, '') : line;
    const entryType: LogEntryType = isUser ? 'user' : type;
    const entry: LogEntry = { id: next.logId + 1, text: clean, type: entryType };
    next = {
      ...next,
      logId: next.logId + 1,
      log: [...next.log, entry].slice(-MAX_LOG),
    };
  }
  return next;
}
