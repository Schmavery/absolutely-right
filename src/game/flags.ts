/**
 * Feature flags granted by owned upgrades. Game logic and UI should branch on
 * `hasFlag(derive.flags, '…')` rather than `state.upgrades.includes('some_id')`.
 *
 * Upgrades declare flags in `data/upgrades.yaml` via a `flags:` list. Some
 * flags are also implied by effect fields (e.g. `enablesMoney` → `money`).
 */

import { THRESHOLDS } from './constants';
import { UPGRADES } from './data';
import type { UpgDef } from '../types';

/** Known flags — add new literals here when introducing new behavior gates. */
export const GAME_FLAGS = {
  /** Hides write-test / run-tests actions; tests row hidden in resource panel. */
  ai_review: 'ai_review',
  /** Nines meta: tick nines drain/gain, revamped uptime display, manual bug bounty. */
  nines_tracking: 'nines_tracking',
  /** Automated bug→nines conversion; hides manual bug bounty action. */
  auto_bug_bounty: 'auto_bug_bounty',
  /** Money resource visible (also set when any owned upgrade has `enablesMoney`). */
  money: 'money',
  /** MCP tool beats can fire after prompts (see `mcp_tools` upgrade). */
  mcp_tools: 'mcp_tools',
  /** Auto-approve MCP calls without blocking the prompt (see `always_allow`). */
  mcp_auto_approve: 'mcp_auto_approve',
  /** MCP beats skip approval card; approved calls go to `tool` log entries (see `yolo_mode`). */
  yolo_mode: 'yolo_mode',
} as const;

export type GameFlag = (typeof GAME_FLAGS)[keyof typeof GAME_FLAGS];

const KNOWN_FLAGS = new Set<string>(Object.values(GAME_FLAGS));

function ownedDefs(upgrades: string[]): UpgDef[] {
  return UPGRADES.filter((u) => upgrades.includes(u.id));
}

/** Union of explicit `flags` on owned upgrades plus implied flags from effects. */
export function computeFlags(upgrades: string[]): ReadonlySet<GameFlag> {
  const flags = new Set<GameFlag>();
  for (const u of ownedDefs(upgrades)) {
    if (u.flags) {
      for (const f of u.flags) {
        if (KNOWN_FLAGS.has(f)) flags.add(f as GameFlag);
      }
    }
    if (u.enablesMoney) flags.add(GAME_FLAGS.money);
  }
  return flags;
}

export function hasFlag(flags: ReadonlySet<GameFlag>, flag: GameFlag): boolean {
  return flags.has(flag);
}

export type EffectiveThresholds = typeof THRESHOLDS;

/**
 * Base `THRESHOLDS` merged with any `thresholdOverrides` on owned upgrades
 * (later upgrades in data file order win on duplicate keys).
 */
export function effectiveThresholds(upgrades: string[]): EffectiveThresholds {
  const out = { ...THRESHOLDS };
  for (const u of ownedDefs(upgrades)) {
    if (u.thresholdOverrides) {
      Object.assign(out, u.thresholdOverrides);
    }
  }
  return out;
}
