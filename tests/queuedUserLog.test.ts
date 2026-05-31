import { describe, expect, it } from 'vitest';
import { computeQueuedUserEntries } from '../src/lib/queuedUserLog';
import type { LogEntry } from '../src/types';

function entry(id: number, type: LogEntry['type'], text: string): LogEntry {
  return { id, type, text, streamMs: 100 };
}

describe('computeQueuedUserEntries', () => {
  it('queues a user line behind a still-streaming AI reply', () => {
    const stateLog = [
      entry(1, 'user', 'first prompt'),
      entry(2, 'info', 'full ai reply'),
      entry(3, 'user', 'second prompt'),
    ];
    const displayLog = [entry(1, 'user', 'first prompt'), entry(2, 'info', 'partial|')];

    expect(computeQueuedUserEntries(stateLog, displayLog, true)).toEqual([stateLog[2]]);
  });

  it('returns empty when idle', () => {
    const stateLog = [entry(1, 'user', 'a'), entry(2, 'info', 'b')];
    expect(computeQueuedUserEntries(stateLog, stateLog, false)).toEqual([]);
  });

  it('does not queue when prior lines are done and user lead-in is next', () => {
    const stateLog = [entry(1, 'user', 'a'), entry(2, 'info', 'b'), entry(3, 'user', 'c')];
    const displayLog = [entry(1, 'user', 'a'), entry(2, 'info', 'b')];

    expect(computeQueuedUserEntries(stateLog, displayLog, true)).toEqual([]);
  });
});
