import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY } from '../src/game/constants';
import { defaultState } from '../src/game/state';
import {
  EDITOR_PULSE_TTL_MS,
  SAVE_EDITOR_PULSE_KEY,
  SAVE_META_KEY,
  clearSaveEditorPulse,
  clearSaveStorage,
  getStoredSaveRevision,
  isSaveEditorTabOpen,
  readSaveDiskSnapshot,
  readSaveMeta,
  shouldFollowDiskSnapshot,
  touchSaveEditorPulse,
  writeSaveWithMeta,
} from '../src/game/saveSync';

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

function wipeSaveKeys(): void {
  store.clear();
}

describe('saveSync', () => {
  beforeEach(() => {
    mockLocalStorage();
    wipeSaveKeys();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    wipeSaveKeys();
  });

  it('bumps revision and records source on write', () => {
    const rev1 = writeSaveWithMeta(defaultState(), 'game');
    const rev2 = writeSaveWithMeta({ ...defaultState(), loc: 99 }, 'editor');
    expect(rev1).toBe(1);
    expect(rev2).toBe(2);
    expect(readSaveMeta().source).toBe('editor');
    expect(localStorage.getItem(SAVE_KEY)).toContain('"loc":99');
  });

  it('detects open save editor via pulse TTL', () => {
    expect(isSaveEditorTabOpen()).toBe(false);
    touchSaveEditorPulse();
    expect(isSaveEditorTabOpen()).toBe(true);
    vi.advanceTimersByTime(EDITOR_PULSE_TTL_MS + 1);
    expect(isSaveEditorTabOpen()).toBe(false);
  });

  it('clears editor pulse', () => {
    touchSaveEditorPulse();
    clearSaveEditorPulse();
    expect(localStorage.getItem(SAVE_EDITOR_PULSE_KEY)).toBeNull();
  });

  it('getStoredSaveRevision reads meta', () => {
    writeSaveWithMeta(defaultState(), 'game');
    expect(getStoredSaveRevision()).toBe(1);
    expect(JSON.parse(localStorage.getItem(SAVE_META_KEY)!).rev).toBe(1);
  });

  it('shouldFollowDiskSnapshot when another tab resets (rev drops)', () => {
    writeSaveWithMeta({ ...defaultState(), loc: 99 }, 'game');
    const stale = { rev: 1, resetEpoch: 0, writerSessionId: null };
    expect(shouldFollowDiskSnapshot(stale, { rev: 1, resetEpoch: 0, writerSessionId: null })).toBe(
      false,
    );
    clearSaveStorage();
    expect(getStoredSaveRevision()).toBe(0);
    expect(readSaveMeta().resetEpoch).toBe(1);
    expect(shouldFollowDiskSnapshot(stale, { rev: 0, resetEpoch: 1, writerSessionId: null })).toBe(
      true,
    );
  });

  it('shouldFollowDiskSnapshot when another tab saves ahead', () => {
    writeSaveWithMeta(defaultState(), 'game');
    expect(
      shouldFollowDiskSnapshot(
        { rev: 1, resetEpoch: 0, writerSessionId: 'a' },
        { rev: 2, resetEpoch: 0, writerSessionId: 'b' },
      ),
    ).toBe(true);
  });

  it('shouldFollowDiskSnapshot when another session wrote same rev', () => {
    writeSaveWithMeta(defaultState(), 'game', 'session-a');
    const local = { rev: 1, resetEpoch: 0, writerSessionId: 'session-b' };
    expect(
      shouldFollowDiskSnapshot(local, readSaveDiskSnapshot(), 'session-b'),
    ).toBe(true);
  });

  it('stale tab detects reset even when rev wraps to the same number', () => {
    writeSaveWithMeta({ ...defaultState(), totalLoc: 5000 }, 'game');
    const stale = { rev: 1, resetEpoch: 0, writerSessionId: null };
    clearSaveStorage();
    writeSaveWithMeta(defaultState(), 'game');
    const disk = readSaveDiskSnapshot();
    expect(shouldFollowDiskSnapshot(stale, disk)).toBe(true);
    expect(disk.rev).toBe(1);
    expect(disk.resetEpoch).toBe(1);
    expect(localStorage.getItem(SAVE_KEY)).not.toContain('"totalLoc":5000');
  });
});
