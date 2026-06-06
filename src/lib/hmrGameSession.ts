import type { GameState } from '../types';
import { advanceTick } from '../game/foregroundTick';
import { rehydratePoolUsage } from '../game/rehydratePoolUsage';
import { loadStateWithCatchup } from '../game/snapshotPlay';
import {
  createWriterSessionId,
  isSaveEditorTabOpen,
  readSaveDiskSnapshot,
  type SaveDiskSnapshot,
} from '../game/saveSync';
import { saveState } from '../game/state';

const HMR_SESSION_KEY = 'extra_thinking_v1_hmr_session';
const HMR_STATE_KEY = 'extra_thinking_v1_hmr_state';

interface HmrStash {
  state: GameState;
  sessionId: string;
  savedAt: number;
}

type HmrFlush = () => SaveDiskSnapshot | undefined;

let flushHandler: HmrFlush | null = null;
let hmrTestMode = false;

/** Test-only: exercise stash/session paths without Vite HMR. */
export function __enableHmrForTests(enable: boolean): void {
  hmrTestMode = enable;
}

function hmrActive(): boolean {
  return hmrTestMode || import.meta.hot != null;
}

export function isHmrEnabled(): boolean {
  return hmrActive();
}

/** Reuse the writer session across Vite HMR remounts so we are not a "foreign tab". */
export function getOrCreateHmrWriterSessionId(): string {
  if (hmrActive()) {
    try {
      const stored = sessionStorage.getItem(HMR_SESSION_KEY);
      if (stored) return stored;
    } catch {
      // ignored — private mode
    }
  }
  const id = createWriterSessionId();
  if (hmrActive()) {
    try {
      sessionStorage.setItem(HMR_SESSION_KEY, id);
    } catch {
      // ignored
    }
  }
  return id;
}

function readHmrStash(): HmrStash | null {
  if (!hmrActive()) return null;
  try {
    const raw = sessionStorage.getItem(HMR_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HmrStash>;
    if (!parsed.state || typeof parsed.sessionId !== 'string') return null;
    return {
      state: parsed.state as GameState,
      sessionId: parsed.sessionId,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

function clearHmrStash(): void {
  if (!hmrActive()) return;
  try {
    sessionStorage.removeItem(HMR_STATE_KEY);
  } catch {
    // ignored
  }
}

export function stashHmrState(state: GameState, sessionId: string): void {
  if (!hmrActive()) return;
  try {
    sessionStorage.setItem(HMR_SESSION_KEY, sessionId);
    sessionStorage.setItem(
      HMR_STATE_KEY,
      JSON.stringify({ state, sessionId, savedAt: Date.now() } satisfies HmrStash),
    );
  } catch {
    // ignored — quota
  }
}

/** Prefer in-memory stash from the prior module instance; otherwise load from disk. */
export function loadGameBootState(sessionId: string): GameState {
  const stash = readHmrStash();
  if (stash && stash.sessionId === sessionId) {
    clearHmrStash();
    const elapsed = Date.now() - stash.savedAt;
    return advanceTick(rehydratePoolUsage(stash.state), elapsed);
  }
  return loadStateWithCatchup();
}

export function registerHmrGameFlush(fn: HmrFlush): () => void {
  flushHandler = fn;
  return () => {
    if (flushHandler === fn) flushHandler = null;
  };
}

function flushOnHmrDispose(): void {
  if (isSaveEditorTabOpen()) return;
  flushHandler?.();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    flushOnHmrDispose();
  });
}

/** Flush gameplay to disk and session stash (for tests and explicit saves). */
export function flushGameForHmr(
  state: GameState,
  sessionId: string,
): SaveDiskSnapshot {
  saveState(state, 'game', sessionId);
  stashHmrState(state, sessionId);
  return readSaveDiskSnapshot();
}
