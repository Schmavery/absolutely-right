import type { GameState } from '../types';
import { MAX_CATCHUP_MS } from './constants';
import { tickReducer } from './tick';

/** Clamp elapsed wall time to the catch-up budget. */
export function catchupDtMs(elapsedMs: number, maxCatchupMs: number = MAX_CATCHUP_MS): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(elapsedMs, maxCatchupMs);
}

/** Advance game state by elapsed ms; no-op when elapsed is zero. */
export function advanceTick(
  state: GameState,
  elapsedMs: number,
  maxCatchupMs: number = MAX_CATCHUP_MS,
): GameState {
  const dt = catchupDtMs(elapsedMs, maxCatchupMs);
  if (dt <= 0) return state;
  return tickReducer(state, dt);
}

export function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}
