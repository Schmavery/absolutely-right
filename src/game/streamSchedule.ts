/**
 * Deterministic log-stream timing. Computed once in `appendLog` and stored on
 * each `LogEntry.streamMs`; `useStreamingLog` plays back using the same numbers.
 */

import type { LogEntry, LogEntryType } from '../types';
import { STREAMING } from './constants';

export function countTypedTokens(text: string): number {
  const tokens = text.split(/(\s+)/);
  let n = 0;
  for (const tok of tokens) if (tok.length > 0 && tok.trim() !== '') n++;
  return n;
}

export type EntryStreamOpts = {
  /** Next queued line is an AI reply right after a `>` user line (skips spinner hold). */
  afterUserReply?: boolean;
};

/** Ms for `useStreamingLog` to fully drain one log entry. */
export function computeEntryStreamMs(
  text: string,
  type: LogEntryType,
  prevLineWasUser: boolean,
  opts?: EntryStreamOpts,
): number {
  if (type === 'system' || type === 'tool') return 0;
  if (type === 'user' || text.trimStart().startsWith('>')) {
    // thinkingDelayMs runs inside this window (before the next AI line).
    return STREAMING.userLeadInMs + STREAMING.afterUserMs;
  }

  let ms = STREAMING.aiLeadInMs + STREAMING.afterAiMs;
  if (!prevLineWasUser && !opts?.afterUserReply) {
    ms += STREAMING.aiOnlySpinnerHoldMs;
  }
  ms += countTypedTokens(text) * STREAMING.charMs;
  return ms;
}

/** Sum of per-entry `streamMs` for a multi-line append (same order as `appendLog`). */
export function computeTextStreamMs(text: string, fallbackType: LogEntryType): number {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  let total = 0;
  let prevWasUser = false;
  for (const line of lines) {
    const isUser = line.trimStart().startsWith('>');
    const entryType: LogEntryType = isUser ? 'user' : fallbackType;
    total += computeEntryStreamMs(line, entryType, prevWasUser, {
      afterUserReply: prevWasUser && !isUser,
    });
    prevWasUser = isUser;
  }
  return total;
}

/** AI stream phase delays (sum with typed tokens × `charMs` equals `streamMs`). */
export function aiStreamPhases(afterUserReply: boolean): {
  spinnerHoldMs: number;
  leadInMs: number;
  afterMs: number;
  tokenDelayMs: number;
} {
  return {
    spinnerHoldMs: afterUserReply ? 0 : STREAMING.aiOnlySpinnerHoldMs,
    leadInMs: STREAMING.aiLeadInMs,
    afterMs: STREAMING.afterAiMs,
    tokenDelayMs: STREAMING.charMs,
  };
}

export function effectiveStreamMs(entry: LogEntry, prevWasUser: boolean): number {
  if (entry.streamMs != null) return entry.streamMs;
  return computeEntryStreamMs(entry.text, entry.type, prevWasUser);
}
