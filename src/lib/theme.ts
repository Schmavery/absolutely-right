import { useEffect, useState, useCallback } from 'react';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '../game/constants';

export type ThemeKind = 'dark' | 'light';

export interface ThemeOption {
  id: string;
  label: string;
  kind: ThemeKind;
  /**
   * Optional id of the same theme's opposite-kind variant. The dark/light
   * toggle prefers a sibling when present; otherwise it falls back to the
   * default theme of the opposite kind.
   */
  sibling?: string;
}

export const THEMES: readonly ThemeOption[] = [
  { id: 'terminal-dark', label: 'terminal · dark', kind: 'dark', sibling: 'terminal-light' },
  { id: 'terminal-light', label: 'terminal · light', kind: 'light', sibling: 'terminal-dark' },
  { id: 'solarized-dark', label: 'solarized · dark', kind: 'dark', sibling: 'solarized-light' },
  { id: 'solarized-light', label: 'solarized · light', kind: 'light', sibling: 'solarized-dark' },
  { id: 'gruvbox-dark', label: 'gruvbox · dark', kind: 'dark' },
  { id: 'nord', label: 'nord', kind: 'dark' },
];

export const THEME_IDS = THEMES.map((t) => t.id);

/** Stored preference id for “follow browser/OS”. */
export const SYSTEM_THEME_ID = 'system';

const DEFAULT_DARK_ID = 'terminal-dark';
const DEFAULT_LIGHT_ID = 'terminal-light';

/** User-picked palette from localStorage, or null to follow OS/browser. */
export function readStoredTheme(): string | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (!stored || stored === SYSTEM_THEME_ID) return null;
    if (THEME_IDS.includes(stored)) return stored;
  } catch {
    // ignored
  }
  return null;
}

export function followsSystemPreference(): boolean {
  return readStoredTheme() === null;
}

/** Terminal light/dark matching `prefers-color-scheme`. */
export function systemThemeId(): string {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return DEFAULT_THEME;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? DEFAULT_DARK_ID
    : DEFAULT_LIGHT_ID;
}

export function readTheme(): string {
  return readStoredTheme() ?? systemThemeId();
}

function writeTheme(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // ignored
  }
}

function clearThemePreference(): void {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // ignored
  }
}

export type AppearanceMode = 'system' | 'light' | 'dark';

/** Toolbar cycle: system → light → dark → system. */
export function nextAppearanceAfter(current: AppearanceMode): AppearanceMode {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

export function getTheme(id: string): ThemeOption | undefined {
  return THEMES.find((t) => t.id === id);
}

/**
 * Pick the dark/light counterpart of a given theme. Prefers the theme's
 * declared sibling; otherwise falls back to the default theme of the
 * opposite kind.
 */
export function oppositeTheme(id: string): string {
  const t = getTheme(id);
  if (!t) return DEFAULT_DARK_ID;
  if (t.sibling && getTheme(t.sibling)) return t.sibling;
  return t.kind === 'dark' ? DEFAULT_LIGHT_ID : DEFAULT_DARK_ID;
}

/** Apply stored or system theme on `<html>` before first paint. Safe on debug routes too. */
export function initTheme(): void {
  document.documentElement.setAttribute('data-theme', readTheme());
}

/**
 * Manages the active theme. The theme id is mirrored onto
 * `<html data-theme="…">` so the CSS variables in `themes.css` apply
 * everywhere — including portaled elements.
 */
export function useTheme(): {
  /** Resolved palette on `<html data-theme>`. */
  theme: string;
  kind: ThemeKind;
  /** Toolbar tristate: system, pinned light, or pinned dark. */
  appearance: AppearanceMode;
  setTheme: (id: string) => void;
  /** Pick system / terminal-light / terminal-dark from settings. */
  setAppearance: (mode: AppearanceMode) => void;
  /** Cycle system → light → dark → system (sun/moon/auto button). */
  cycleAppearance: () => void;
} {
  const [stored, setStored] = useState<string | null>(readStoredTheme);
  const [systemResolved, setSystemResolved] = useState(systemThemeId);

  const theme = stored ?? systemResolved;
  const appearance: AppearanceMode = stored
    ? (getTheme(stored)?.kind ?? (stored === DEFAULT_DARK_ID ? 'dark' : 'light'))
    : 'system';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (stored !== null) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemResolved(systemThemeId());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [stored]);

  const applyStored = useCallback((id: string | null) => {
    if (id === null) {
      clearThemePreference();
      setStored(null);
      setSystemResolved(systemThemeId());
    } else {
      writeTheme(id);
      setStored(id);
    }
  }, []);

  const setTheme = useCallback(
    (id: string) => {
      if (id === SYSTEM_THEME_ID) {
        applyStored(null);
        return;
      }
      if (!THEME_IDS.includes(id)) return;
      applyStored(id);
    },
    [applyStored],
  );

  const setAppearance = useCallback(
    (mode: AppearanceMode) => {
      if (mode === 'system') {
        applyStored(null);
        return;
      }
      const current = stored ?? systemResolved;
      const t = getTheme(current);
      if (mode === 'light') {
        if (t?.kind === 'light') {
          applyStored(current);
        } else if (t?.sibling && getTheme(t.sibling)?.kind === 'light') {
          applyStored(t.sibling);
        } else {
          applyStored(DEFAULT_LIGHT_ID);
        }
        return;
      }
      if (t?.kind === 'dark') {
        applyStored(current);
      } else if (t?.sibling && getTheme(t.sibling)?.kind === 'dark') {
        applyStored(t.sibling);
      } else {
        applyStored(DEFAULT_DARK_ID);
      }
    },
    [applyStored, stored, systemResolved],
  );

  const cycleAppearance = useCallback(() => {
    const next = nextAppearanceAfter(appearance);
    if (next === 'system') {
      applyStored(null);
      return;
    }
    if (next === 'light') {
      const current = stored ?? systemResolved;
      const t = getTheme(current);
      if (t?.kind === 'light') {
        applyStored(current);
      } else if (t?.sibling && getTheme(t.sibling)?.kind === 'light') {
        applyStored(t.sibling);
      } else {
        applyStored(DEFAULT_LIGHT_ID);
      }
      return;
    }
    const current = stored ?? systemResolved;
    const t = getTheme(current);
    if (t?.kind === 'dark') {
      applyStored(current);
    } else if (t?.sibling && getTheme(t.sibling)?.kind === 'dark') {
      applyStored(t.sibling);
    } else {
      applyStored(DEFAULT_DARK_ID);
    }
  }, [appearance, applyStored, stored, systemResolved]);

  const kind: ThemeKind = getTheme(theme)?.kind ?? (theme === DEFAULT_DARK_ID ? 'dark' : 'light');

  return { theme, kind, appearance, setTheme, setAppearance, cycleAppearance };
}
