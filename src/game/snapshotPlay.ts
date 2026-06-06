import type { GameState } from '../types';
import { readSaveMeta } from './saveSync';
import { rehydratePoolUsage } from './rehydratePoolUsage';
import { initState } from './state';
import { advanceTick, catchupDtMs } from './foregroundTick';

/** Wall ms since the last disk snapshot (`SaveMeta.updatedAt`). */
export function snapshotElapsedMs(at: number = Date.now()): number {
  const { updatedAt } = readSaveMeta();
  if (!updatedAt) return 0;
  return catchupDtMs(at - updatedAt);
}

/** Load the on-disk save and fast-forward passive progress to `at`. */
export function loadStateWithCatchup(at: number = Date.now()): GameState {
  const base = rehydratePoolUsage(initState());
  const elapsed = snapshotElapsedMs(at);
  return advanceTick(base, elapsed);
}
