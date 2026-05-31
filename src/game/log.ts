import type { GameState, LogEntry, LogEntryType } from '../types';
import { MAX_LOG, STREAMING } from './constants';
import { now } from './runtime';

/**
 * Predict how long `useStreamingLog` will take to fully render `text` if
 * appended now. Mirrors `processEntry` in `src/lib/useStreamingLog.ts`:
 *
 *   - User lines (start with `>`): `userLeadInMs + afterUserMs`, no
 *     per-character animation.
 *   - AI / event / news / milestone lines: `aiLeadInMs + nWords *
 *     (charBaseMs + expectedJitter) + afterAiMs`, where words are the
 *     non-whitespace tokens produced by `text.split(/(\s+)/)` (whitespace
 *     tokens have a 0ms inter-token delay in the renderer).
 *
 * Uses worst-case per-token delay (base + full jitter) so `chatBusyUntil`
 * does not clear before the UI finishes. The prompt button also waits on
 * `useStreamingLog`'s `isAnimating`, which tracks the real display queue.
 */
export function streamingDurationMs(text: string, fallbackType: LogEntryType): number {
  // No-op for the synthetic fallback type that never streams.
  if (fallbackType === 'system') return 0;

  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  let ms = 0;
  let afterUser = false;
  for (const line of lines) {
    const isUser = line.trimStart().startsWith('>');
    if (isUser) {
      ms += STREAMING.userLeadInMs + STREAMING.afterUserMs;
      afterUser = true;
      continue;
    }
    if (!afterUser) {
      ms += STREAMING.aiOnlySpinnerHoldMs;
    }
    afterUser = false;
    const tokens = line.split(/(\s+)/);
    let nonSpaceTokens = 0;
    for (const tok of tokens) if (tok.length > 0 && tok.trim() !== '') nonSpaceTokens++;
    ms +=
      STREAMING.aiLeadInMs +
      nonSpaceTokens * (STREAMING.charBaseMs + STREAMING.charJitterMs) +
      STREAMING.afterAiMs;
  }
  return ms;
}

/**
 * Append one or more log entries derived from `text` to `prev.log`. Lines
 * starting with `>` are detected automatically and their type is overridden
 * to `'user'` (they render right-aligned in the conversation panel). Empty
 * lines are dropped. The log is truncated to `MAX_LOG` entries.
 *
 * Also extends `chatBusyUntil` so the prompt action stays gated until the
 * conversation log catches up to the player visually.
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
  const duration = streamingDurationMs(text, type);
  if (duration > 0) {
    const t = now();
    next = {
      ...next,
      chatBusyUntil: Math.max(next.chatBusyUntil ?? 0, t + duration),
    };
  }
  return next;
}
