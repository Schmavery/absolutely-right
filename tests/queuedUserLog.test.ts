import { describe, expect, it } from 'vitest';
import { defaultState } from '../src/game/state';
import {
  computeQueuedUserEntries,
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

describe('computeQueuedUserEntries', () => {
  it('queues a user line blocked behind a still-streaming AI reply', () => {
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

  it('does not queue when prior lines are done', () => {
    const stateLog = [entry(1, 'user', 'a'), entry(2, 'info', 'b'), entry(3, 'user', 'c')];
    const displayLog = [entry(1, 'user', 'a'), entry(2, 'info', 'b')];

    expect(computeQueuedUserEntries(stateLog, displayLog, true)).toEqual([]);
  });

  it('does not queue follow-up user lines from the same multi-turn event', () => {
    const burstId = 10;
    const stateLog = [
      { ...entry(10, 'user', "that's wrong"), burstId },
      { ...entry(11, 'bad', 'I apologize.'), burstId },
      { ...entry(12, 'user', "that's still wrong"), burstId },
      { ...entry(13, 'bad', 'I apologize again.'), burstId },
    ];
    const displayLog = [stateLog[0]!, { ...stateLog[1]!, text: 'I apol|' }];

    expect(computeQueuedUserEntries(stateLog, displayLog, true)).toEqual([]);
  });

  it('queues only the opening user per event, not follow-ups, while separate events still queue', () => {
    const eventBurst = 2;
    const otherBurst = 6;
    const stateLog = [
      entry(1, 'info', 'prior reply still streaming'),
      { ...entry(2, 'user', "that's wrong"), burstId: eventBurst },
      { ...entry(3, 'bad', 'I apologize.'), burstId: eventBurst },
      { ...entry(4, 'user', "that's still wrong"), burstId: eventBurst },
      { ...entry(5, 'bad', 'I apologize again.'), burstId: eventBurst },
      { ...entry(6, 'user', 'second prompt'), burstId: otherBurst },
      { ...entry(7, 'info', 'second reply'), burstId: otherBurst },
    ];
    const displayLog = [{ ...stateLog[0]!, text: 'prior reply still stre|' }];

    const queued = computeQueuedUserEntries(stateLog, displayLog, true);

    expect(queued.map((e) => e.id)).toEqual([2, 6]);
    expect(queued.some((e) => e.id === 4)).toBe(false);
  });
});

describe('syncQueuedUserFlags', () => {
  it('mirrors compute onto persisted log entries', () => {
    const stateLog = [
      entry(1, 'user', 'first prompt'),
      entry(2, 'info', 'full ai reply'),
      entry(3, 'user', 'second prompt'),
    ];
    const displayLog = [entry(1, 'user', 'first prompt'), entry(2, 'info', 'partial|')];
    const next = syncQueuedUserFlags(withLog(stateLog), displayLog, true);

    expect(queuedUserEntries(next)).toEqual([{ ...stateLog[2]!, queued: true }]);
  });

  it('marks only opening user lines per event queued, including separate later events', () => {
    const eventBurst = 2;
    const otherBurst = 6;
    const stateLog = [
      entry(1, 'info', 'prior reply still streaming'),
      { ...entry(2, 'user', "that's wrong"), burstId: eventBurst },
      { ...entry(3, 'bad', 'I apologize.'), burstId: eventBurst },
      { ...entry(4, 'user', "that's still wrong"), burstId: eventBurst },
      { ...entry(5, 'bad', 'I apologize again.'), burstId: eventBurst },
      { ...entry(6, 'user', 'second prompt'), burstId: otherBurst },
      { ...entry(7, 'info', 'second reply'), burstId: otherBurst },
    ];
    const displayLog = [{ ...stateLog[0]!, text: 'prior reply still stre|' }];
    const next = syncQueuedUserFlags(withLog(stateLog), displayLog, true);

    expect(next.log[1]?.queued).toBe(true);
    expect(next.log[3]?.queued).toBeUndefined();
    expect(next.log[5]?.queued).toBe(true);
    expect(queuedUserEntries(next).map((e) => e.id)).toEqual([2, 6]);
  });

  it('clears queued once the user line has streamed in', () => {
    const stateLog = [
      entry(1, 'user', 'first prompt'),
      entry(2, 'info', 'reply'),
      { ...entry(3, 'user', 'second prompt'), queued: true },
    ];
    const displayLog = [...stateLog];
    const next = syncQueuedUserFlags(withLog(stateLog), displayLog, true);

    expect(queuedUserEntries(next)).toEqual([]);
    expect(next.log[2]?.queued).toBeUndefined();
  });
});
