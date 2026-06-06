import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { GameState } from '../types';
import { TICK_MS } from '../game/constants';
import { advanceTick } from '../game/foregroundTick';

export interface ForegroundGameOpts {
  /** Visible tab in a focused browser window — ticks and writes save. */
  isActive: boolean;
  setState: Dispatch<SetStateAction<GameState>>;
  /** Called when becoming active — catch up or reload from disk. */
  onActivate: () => void;
}

/** Tick in memory while `isActive`; catch up when becoming active. */
export function useForegroundGame({
  isActive,
  setState,
  onActivate,
}: ForegroundGameOpts): void {
  const lastTickAtRef = useRef(Date.now());
  const wasActiveRef = useRef(isActive);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stopInterval = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const startInterval = () => {
      if (intervalId !== null) return;
      lastTickAtRef.current = Date.now();
      intervalId = setInterval(() => {
        const now = Date.now();
        const elapsed = now - lastTickAtRef.current;
        lastTickAtRef.current = now;
        if (elapsed <= 0) return;
        setState((prev) => advanceTick(prev, elapsed));
      }, TICK_MS);
    };

    if (isActive === wasActiveRef.current) {
      if (isActive) startInterval();
      else stopInterval();
      return () => stopInterval();
    }

    wasActiveRef.current = isActive;
    if (!isActive) {
      stopInterval();
      return () => stopInterval();
    }

    onActivateRef.current();
    startInterval();
    return () => stopInterval();
  }, [isActive, setState]);
}
