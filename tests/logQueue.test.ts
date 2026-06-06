import { describe, expect, it } from 'vitest';
import { activeBurstIds, burstIdOf, insertPriorityEntries } from '../src/lib/logQueue';
import type { LogEntry } from '../src/types';

function entry(
  id: number,
  type: LogEntry['type'],
  text: string,
  burstId?: number,
): LogEntry {
  return { id, type, text, streamMs: 100, ...(burstId != null ? { burstId } : {}) };
}

describe('insertPriorityEntries', () => {
  it('prepends when no burst is active', () => {
    const pending = [entry(2, 'info', 'backlog')];
    const intro = entry(3, 'system', 'new action', 3);
    intro.priority = true;

    expect(insertPriorityEntries(pending, [intro], new Set())).toEqual([intro, ...pending]);
  });

  it('inserts after the pending tail of an active burst', () => {
    const burst = 5;
    const pending = [
      entry(6, 'bad', 'apology 2', burst),
      entry(7, 'info', 'unrelated'),
    ];
    const intro = entry(8, 'system', 'new action', 8);
    intro.priority = true;

    const next = insertPriorityEntries(pending, [intro], new Set([burst]));

    expect(next.map((e) => e.id)).toEqual([6, 8, 7]);
  });

  it('still jumps ahead of unrelated backlog while a burst is streaming', () => {
    const burst = 2;
    const pending = [entry(4, 'info', 'later')];
    const intro = entry(5, 'system', 'new action', 5);
    intro.priority = true;
    const displayLog = [
      entry(2, 'user', 'prompt', burst),
      { ...entry(3, 'info', 'partial|'), burstId: burst },
    ];
    const stateLog = [
      entry(2, 'user', 'prompt', burst),
      entry(3, 'info', 'partial reply', burst),
      ...pending,
      intro,
    ];

    const active = activeBurstIds(stateLog, displayLog, entry(3, 'info', 'partial reply', burst));
    const next = insertPriorityEntries(pending, [intro], active);

    expect(active.has(burst)).toBe(true);
    expect(next.map((e) => e.id)).toEqual([5, 4]);
  });
});

describe('burstIdOf', () => {
  it('falls back to entry id', () => {
    expect(burstIdOf(entry(9, 'info', 'solo'))).toBe(9);
  });
});
