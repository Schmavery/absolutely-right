import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState } from '../src/game/state';
import { loadStateWithCatchup, snapshotElapsedMs } from '../src/game/snapshotPlay';
import { writeSaveWithMeta } from '../src/game/saveSync';

const store = new Map<string, string>();

function mockLocalStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
}

describe('snapshotPlay', () => {
  beforeEach(() => {
    mockLocalStorage();
    store.clear();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    store.clear();
  });

  it('snapshotElapsedMs reads SaveMeta.updatedAt', () => {
    writeSaveWithMeta(defaultState(), 'game');
    vi.advanceTimersByTime(5000);
    expect(snapshotElapsedMs()).toBe(5000);
  });

  it('loadStateWithCatchup advances passive progress since snapshot', () => {
    writeSaveWithMeta(
      {
        ...defaultState(),
        started: true,
        totalLoc: 500,
        loc: 500,
        genCounts: { autocomplete: 1 },
      },
      'game',
    );
    vi.advanceTimersByTime(10_000);
    const next = loadStateWithCatchup();
    expect(next.totalLoc).toBeGreaterThan(500);
  });
});
