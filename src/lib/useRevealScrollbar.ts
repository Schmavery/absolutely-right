import { useEffect, type RefObject } from 'react';

const REVEAL_MS = 600;
/** Keep in sync with --hairline-scrollbar-fade-ms in index.css */
const FADE_MS = 280;
/** Matches .hairline-scrollbar gutter (offset + size) for scrollbar-drag hit testing */
const GUTTER_PX = 6;

const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

/** Shows hairline scrollbar only for user-driven scroll, not programmatic scrollIntoView etc. */
export function useRevealScrollbar(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let hideTimeout: ReturnType<typeof setTimeout> | undefined;
    let fadeTimeout: ReturnType<typeof setTimeout> | undefined;
    let userIntentUntil = 0;

    const clearFade = () => {
      clearTimeout(fadeTimeout);
      el.classList.remove('is-hiding');
    };

    const reveal = () => {
      clearFade();
      el.classList.add('is-scrolling');
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(hide, REVEAL_MS);
    };

    const hide = () => {
      el.classList.remove('is-scrolling');
      el.classList.add('is-hiding');
      clearTimeout(fadeTimeout);
      fadeTimeout = setTimeout(() => el.classList.remove('is-hiding'), FADE_MS);
    };

    const onUserScroll = () => {
      userIntentUntil = Date.now() + REVEAL_MS;
      reveal();
    };

    const onScroll = () => {
      if (Date.now() <= userIntentUntil) reveal();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(e.key)) return;
      if (!el.contains(document.activeElement) && document.activeElement !== el) return;
      onUserScroll();
    };

    const onMouseDown = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.right - GUTTER_PX) onUserScroll();
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onUserScroll, { passive: true });
    el.addEventListener('touchmove', onUserScroll, { passive: true });
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('mousedown', onMouseDown);

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onUserScroll);
      el.removeEventListener('touchmove', onUserScroll);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('mousedown', onMouseDown);
      clearTimeout(hideTimeout);
      clearTimeout(fadeTimeout);
      el.classList.remove('is-scrolling', 'is-hiding');
    };
  }, [ref]);
}
