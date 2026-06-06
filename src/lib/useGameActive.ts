import { useEffect, useRef, useState } from 'react';
import { isDocumentVisible } from '../game/foregroundTick';

function readActive(windowFocused: boolean): boolean {
  return isDocumentVisible() && windowFocused;
}

/**
 * Tracks whether this tab should tick: visible tab in a focused browser window.
 */
export function useGameActive(): {
  isActive: boolean;
  isForeground: boolean;
  windowFocused: boolean;
} {
  const windowFocusedRef = useRef(
    typeof document === 'undefined' || document.hasFocus(),
  );
  const [windowFocused, setWindowFocused] = useState(() => windowFocusedRef.current);
  const [isActive, setIsActive] = useState(() => readActive(windowFocusedRef.current));
  const [isForeground, setIsForeground] = useState(() => isDocumentVisible());

  useEffect(() => {
    const apply = () => {
      const fg = isDocumentVisible();
      const active = fg && windowFocusedRef.current;

      setIsForeground((prev) => (prev === fg ? prev : fg));
      setWindowFocused((prev) =>
        prev === windowFocusedRef.current ? prev : windowFocusedRef.current,
      );
      setIsActive((prev) => (prev === active ? prev : active));
    };

    const onWindowBlur = () => {
      windowFocusedRef.current = false;
      apply();
    };
    const onWindowFocus = () => {
      windowFocusedRef.current = true;
      apply();
    };

    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', apply);
    apply();

    return () => {
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', apply);
    };
  }, []);

  return { isActive, isForeground, windowFocused };
}
