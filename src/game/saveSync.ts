/**
 * Cross-tab save coordination: revision metadata, editor-tab heartbeat, and
 * storage listeners so the game and /debug/save do not clobber each other.
 */

import type { GameState } from '../types';
import { SAVE_KEY } from './constants';

export const SAVE_META_KEY = 'extra_thinking_v1_meta';
/** Timestamp (ms) heartbeat while a /debug/save tab is open — pauses game auto-save. */
export const SAVE_EDITOR_PULSE_KEY = 'extra_thinking_v1_editor';

export type SaveSource = 'game' | 'editor';

export interface SaveMeta {
  rev: number;
  updatedAt: number;
  source: SaveSource;
}

const DEFAULT_META: SaveMeta = { rev: 0, updatedAt: 0, source: 'game' };

/** How long after the last editor pulse we treat the save editor tab as open. */
export const EDITOR_PULSE_TTL_MS = 12_000;

export function readSaveMeta(): SaveMeta {
  try {
    const raw = localStorage.getItem(SAVE_META_KEY);
    if (!raw) return { ...DEFAULT_META };
    const parsed = JSON.parse(raw) as Partial<SaveMeta>;
    return {
      rev: typeof parsed.rev === 'number' ? parsed.rev : 0,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      source: parsed.source === 'editor' ? 'editor' : 'game',
    };
  } catch {
    return { ...DEFAULT_META };
  }
}

export function getStoredSaveRevision(): number {
  return readSaveMeta().rev;
}

/** True when a save-editor tab is heartbeating — game should not auto-persist. */
export function isSaveEditorTabOpen(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_EDITOR_PULSE_KEY);
    if (!raw) return false;
    const t = Number(raw);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < EDITOR_PULSE_TTL_MS;
  } catch {
    return false;
  }
}

export function touchSaveEditorPulse(): void {
  try {
    localStorage.setItem(SAVE_EDITOR_PULSE_KEY, String(Date.now()));
  } catch {
    // ignored
  }
}

export function clearSaveEditorPulse(): void {
  try {
    localStorage.removeItem(SAVE_EDITOR_PULSE_KEY);
  } catch {
    // ignored
  }
}

/** Persist gameplay state and bump revision (returns new rev). */
export function writeSaveWithMeta(state: GameState, source: SaveSource): number {
  const meta: SaveMeta = {
    rev: readSaveMeta().rev + 1,
    updatedAt: Date.now(),
    source,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    localStorage.setItem(SAVE_META_KEY, JSON.stringify(meta));
  } catch {
    // ignored — quota / privacy mode
  }
  return meta.rev;
}

export function clearSaveStorage(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.setItem(
      SAVE_META_KEY,
      JSON.stringify({ rev: 0, updatedAt: Date.now(), source: 'game' } satisfies SaveMeta),
    );
  } catch {
    // ignored
  }
}

export function isSaveStorageKey(key: string | null): boolean {
  return key === SAVE_KEY || key === SAVE_META_KEY;
}
