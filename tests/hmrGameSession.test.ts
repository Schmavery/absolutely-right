import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { defaultState } from '../src/game/state';
import { SAVE_KEY, SAVE_META_KEY } from '../src/game/constants';
import { appendLog } from '../src/game/log';
import {
  __enableHmrForTests,
  flushGameForHmr,
  getOrCreateHmrWriterSessionId,
  loadGameBootState,
  registerHmrGameFlush,
} from '../src/lib/hmrGameSession';

const HMR_SESSION_KEY = 'extra_thinking_v1_hmr_session';
const HMR_STATE_KEY = 'extra_thinking_v1_hmr_state';

const localStore = new Map<string, string>();
const sessionStore = new Map<string, string>();

function mockWebStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStore.get(key) ?? null,
    setItem: (key: string, value: string) => localStore.set(key, value),
    removeItem: (key: string) => localStore.delete(key),
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => sessionStore.get(key) ?? null,
    setItem: (key: string, value: string) => sessionStore.set(key, value),
    removeItem: (key: string) => sessionStore.delete(key),
  });
}

describe('hmrGameSession', () => {
  beforeEach(() => {
    mockWebStorage();
    __enableHmrForTests(true);
    localStore.clear();
    sessionStore.clear();
  });

  afterEach(() => {
    __enableHmrForTests(false);
    vi.unstubAllGlobals();
    localStore.clear();
    sessionStore.clear();
  });

  it('reuses a stable writer session id when sessionStorage already has one', () => {
    sessionStore.set(HMR_SESSION_KEY, 'session-abc');
    const id = getOrCreateHmrWriterSessionId();
    expect(id).toBe('session-abc');
  });

  it('restores stashed in-memory state on boot before disk catchup', () => {
    const sessionId = 'session-restore';
    sessionStore.set(HMR_SESSION_KEY, sessionId);

    let state = defaultState();
    state = appendLog(state, '> hmr stash beat', 'info');
    state = { ...state, totalClicks: 7 };

    flushGameForHmr(state, sessionId);

    localStore.set(SAVE_KEY, JSON.stringify({ ...defaultState(), totalClicks: 0 }));
    localStore.set(
      SAVE_META_KEY,
      JSON.stringify({
        rev: 1,
        updatedAt: Date.now(),
        source: 'game',
        resetEpoch: 0,
        writerSessionId: sessionId,
      }),
    );

    const booted = loadGameBootState(sessionId);
    expect(booted.totalClicks).toBe(7);
    expect(booted.log.some((e) => e.text.includes('hmr stash beat'))).toBe(true);
    expect(sessionStore.get(HMR_STATE_KEY)).toBeUndefined();
  });

  it('registers a flush handler for HMR dispose', () => {
    const sessionId = 'session-flush';
    let state = defaultState();
    state = { ...state, totalClicks: 3 };

    const unregister = registerHmrGameFlush(() => flushGameForHmr(state, sessionId));
    flushGameForHmr(state, sessionId);

    expect(sessionStore.get(HMR_STATE_KEY)).toBeDefined();
    unregister();
  });
});
