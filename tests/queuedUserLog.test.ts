import { describe, expect, it } from 'vitest';
import { defaultState } from '../src/game/state';
import {
  queuedUserEntries,
  syncQueuedUserFlags,
} from '../src/lib/queuedUserLog';
import type { GameState, LogEntry } from '../src/types';

function entry(id: number, type: LogEntry['type'], text: string): LogEntry {
  return { id, type, text, streamMs: 100 };
}

function withLog(log: LogEntry[]): GameState {
  return {
    ...defaultState(),
    log,
    logId: log.reduce((m, e) => Math.max(m, e.id), 0),
  };
}

describe('syncQueuedUserFlags', () => {
  it('tags a user line blocked behind a still-streaming AI reply', () => {
    const stateLog = [
      entry(1, 'user', 'first prompt'),
      entry(2, 'info', 'full ai reply'),
      entry(3, 'user', 'second prompt'),
    ];
    const displayLog = [entry(1, 'user', 'first prompt'), entry(2, 'info', 'partial|')];
    const next = syncQueuedUserFlags(withLog(stateLog), displayLog);

    expect(queuedUserEntries(next)).toEqual([{ ...stateLog[2]!, queued: true }]);
  });

  it('clears queued once the user line has streamed in', () => {
    const stateLog = [
      entry(1, 'user', 'first prompt'),
      entry(2, 'info', 'reply'),
      { ...entry(3, 'user', 'second prompt'), queued: true },
    ];
    const displayLog = [...stateLog];
    const next = syncQueuedUserFlags(withLog(stateLog), displayLog);

    expect(queuedUserEntries(next)).toEqual([]);
    expect(next.log[2]?.queued).toBeUndefined();
  });

  it('does not queue when prior lines are done', () => {
    const stateLog = [entry(1, 'user', 'a'), entry(2, 'info', 'b'), entry(3, 'user', 'c')];
    const displayLog = [entry(1, 'user', 'a'), entry(2, 'info', 'b')];
    const next = syncQueuedUserFlags(withLog(stateLog), displayLog);

    expect(queuedUserEntries(next)).toEqual([]);
  });
});
