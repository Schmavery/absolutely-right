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

const DEFAULT_DARK_ID = 'terminal-dark';
const DEFAULT_LIGHT_ID = 'terminal-light';

function readTheme(): string {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && THEME_IDS.includes(stored)) return stored;
  } catch {
    // ignored
  }
  return DEFAULT_THEME;
}

function writeTheme(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // ignored
  }
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

/**
 * Manages the active theme. The theme id is mirrored onto
 * `<html data-theme="…">` so the CSS variables in `themes.css` apply
 * everywhere — including portaled elements.
 */
export function useTheme(): {
  theme: string;
  kind: ThemeKind;
  setTheme: (id: string) => void;
  toggleDarkLight: () => void;
} {
  const [theme, setThemeState] = useState<string>(readTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((id: string) => {
    if (!THEME_IDS.includes(id)) return;
    writeTheme(id);
    setThemeState(id);
  }, []);

  const toggleDarkLight = useCallback(() => {
    setThemeState((prev) => {
      const next = oppositeTheme(prev);
      writeTheme(next);
      return next;
    });
  }, []);

  const kind: ThemeKind = getTheme(theme)?.kind ?? 'dark';

  return { theme, kind, setTheme, toggleDarkLight };
}
