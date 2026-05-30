import { useEffect, useState } from 'react';

/** Re-renders on window resize; returns the current `window.innerWidth`. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/** Convenience: collapses the layout under 700px. */
export function useIsMobile(breakpoint = 700): boolean {
  return useWindowWidth() < breakpoint;
}
