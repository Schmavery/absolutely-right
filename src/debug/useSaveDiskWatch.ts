import { useCallback, useEffect, useState } from 'react';
import {
  getStoredSaveRevision,
  isSaveStorageKey,
  readSaveMeta,
} from '../game/saveSync';

/**
 * Track whether localStorage was updated after `baselineRev` (e.g. game auto-save
 * in another tab). Does not mutate editor state — callers show a banner / confirm.
 */
export function useSaveDiskWatch(baselineRev: number) {
  const [diskRev, setDiskRev] = useState(() => getStoredSaveRevision());
  const [diskSource, setDiskSource] = useState(() => readSaveMeta().source);

  const refreshDisk = useCallback(() => {
    setDiskRev(getStoredSaveRevision());
    setDiskSource(readSaveMeta().source);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!isSaveStorageKey(e.key)) return;
      refreshDisk();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshDisk]);

  const diskAhead = diskRev > baselineRev;

  return { diskRev, diskSource, diskAhead, refreshDisk };
}
