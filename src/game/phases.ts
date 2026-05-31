/**
 * Flavor phase index — which subtitle from `ui.yaml` `phases:` to show.
 * Tied to mechanical chapters (see `data/PHASES.md`), not totalLoc.
 *
 * When adding MCP / YOLO upgrades, extend the mid-chapter checks here.
 */

import type { GameState } from '../types';
import { UI } from './data';
import { computeFlags, hasFlag } from './flags';

export const PHASE_COUNT = UI.phases.length;

/** Human-readable gates for debug UI (`?debug=phases`). Keep in sync with `getPhase`. */
export const PHASE_RULES: readonly { index: number; rule: string }[] = [
  { index: 0, rule: 'not launched' },
  { index: 1, rule: 'launched' },
  {
    index: 2,
    rule: 'launched + (pro_plan / money OR multi_agent); MCP upgrade TBD',
  },
  { index: 3, rule: 'code_review or ai_review owned' },
  { index: 4, rule: 'revamp_status_page (nines_tracking flag)' },
] as const;

function hasUpgrade(upgrades: string[], id: string): boolean {
  return upgrades.includes(id);
}

/**
 * Highest matching chapter index, 0 .. PHASE_COUNT-1.
 * Evaluated top-down so late-game flags win.
 */
export function getPhase(state: Pick<GameState, 'upgrades' | 'launched'>): number {
  const flags = computeFlags(state.upgrades);
  const u = state.upgrades;

  // 5. Late — status page / nines meta
  if (hasFlag(flags, 'nines_tracking')) return clamp(4);

  // 4. Min–late — human then AI review theater
  if (hasFlag(flags, 'ai_review') || hasUpgrade(u, 'code_review')) return clamp(3);

  // 3. Mid — paid scale + parallel agents (MCP approvals: add upgrade id here)
  if (state.launched && (hasFlag(flags, 'money') || hasUpgrade(u, 'multi_agent'))) {
    return clamp(2);
  }

  // 2. Early mid — live in production, still prompting
  if (state.launched) return clamp(1);

  // 1. Early — prompts and basic tests
  return clamp(0);
}

function clamp(index: number): number {
  return Math.min(Math.max(0, index), PHASE_COUNT - 1);
}
