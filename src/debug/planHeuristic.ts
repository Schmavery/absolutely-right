/**
 * Configurable A* lower bound for the debug planner. Coefficients are tuning
 * knobs — not game balance. Swap or wrap `PlanHeuristicFn` in search opts to
 * compare variants without touching sim physics.
 */

import { LAUNCH_LOC, LOC_PER_CLICK_POWER, THRESHOLDS } from '../game/constants';
import { UPGRADES } from '../game/data';
import { getPhase } from '../game/phases';
import {
  calcClickBonus,
  calcClickPower,
  calcPromptCooldownMs,
  calcRates,
} from '../game/rates';
import type { GameState } from '../types';
import type { PlanGoal } from './planReach';
import { measureGoalProgress } from './planReach';

export interface PlanHeuristicCoeffs {
  /** Weight on totalLoc gap to upgrade unlock threshold (default 0.35). */
  unlockFracWeight?: number;
  /** Extra LOC gap when goal upgrade requires launch (default 0.5). */
  launchGapWeight?: number;
  /** Per-phase LOC proxy for phase goals (default 0.35). */
  phaseLaunchMult?: number;
  /** Fallback LOC/ms when passive + click rates are near zero (default 0.02). */
  minLocPerMs?: number;
}

export const DEFAULT_HEURISTIC_COEFFS: Required<PlanHeuristicCoeffs> = {
  unlockFracWeight: 0.35,
  launchGapWeight: 0.5,
  phaseLaunchMult: 0.35,
  minLocPerMs: 0.02,
};

export type PlanHeuristicFn = (state: GameState, goal: PlanGoal) => number;

function goalSatisfied(state: GameState, goal: PlanGoal): boolean {
  return measureGoalProgress(state, goal).progress >= 1;
}

export function locIncomePerMs(state: GameState, minLocPerMs: number): number {
  const { locRate } = calcRates(state.genCounts, state.upgrades, state.tests ?? 0);
  const cd = Math.max(1, calcPromptCooldownMs(state.upgrades));
  const clickLoc =
    calcClickPower(state.upgrades) * LOC_PER_CLICK_POWER + calcClickBonus(state.upgrades);
  const locPerMs = locRate / 1000 + clickLoc / cd;
  return locPerMs > 1e-6 ? locPerMs : minLocPerMs;
}

/** Build an optimistic ms-left estimate from current rates and goal distance. */
export function makePlanHeuristic(
  coeffs: PlanHeuristicCoeffs = {},
): PlanHeuristicFn {
  const c = { ...DEFAULT_HEURISTIC_COEFFS, ...coeffs };
  return (state, goal) => {
    if (goalSatisfied(state, goal)) return 0;
    const floor = locIncomePerMs(state, c.minLocPerMs);

    switch (goal.kind) {
      case 'launched': {
        const gap = Math.max(0, LAUNCH_LOC - state.totalLoc);
        return gap / floor;
      }
      case 'upgrade': {
        const def = UPGRADES.find((u) => u.id === goal.id);
        if (!def) return 0;
        let gap = Math.max(0, def.cost - state.loc);
        const unlockAt = def.unlockAt * THRESHOLDS.upgradeUnlockFraction;
        gap = Math.max(gap, Math.max(0, unlockAt - state.totalLoc) * c.unlockFracWeight);
        for (const r of def.requires ?? []) {
          if (!state.upgrades.includes(r)) {
            const rd = UPGRADES.find((u) => u.id === r);
            if (rd) gap += rd.cost;
          }
        }
        if (def.requiresLaunch && !state.launched) {
          gap += Math.max(0, LAUNCH_LOC - state.totalLoc) * c.launchGapWeight;
        }
        return gap / floor;
      }
      case 'phase': {
        const cur = getPhase(state);
        const gap = Math.max(0, goal.index - cur);
        return (gap * LAUNCH_LOC * c.phaseLaunchMult) / floor;
      }
    }
  };
}

export const defaultPlanHeuristic = makePlanHeuristic();
