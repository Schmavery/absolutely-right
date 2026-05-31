/**
 * Single place to derive flags, effective UI thresholds, and visibility rules
 * from raw `GameState`. Components import `deriveGame(state)` instead of
 * re-deriving ad hoc.
 */

import type { GameState } from '../types';
import { LAUNCH_LOC } from './constants';
import {
  computeFlags,
  effectiveThresholds,
  hasFlag,
  type EffectiveThresholds,
  type GameFlag,
} from './flags';
export interface DerivedUi {
  showTokens: boolean;
  showWriteTests: boolean;
  showRunTests: boolean;
  showBugBounty: boolean;
  showMoney: boolean;
  ninesTracking: boolean;
  showBugs: boolean;
  showStats: boolean;
  showUptime: boolean;
  showHype: boolean;
  showLaunchBtn: boolean;
  showYoloMerge: boolean;
  showPasteError: boolean;
  showKickAgent: boolean;
  showClearContext: boolean;
  showGenSection: boolean;
  showUpgSection: boolean;
}

export interface DerivedGame {
  flags: ReadonlySet<GameFlag>;
  thresholds: EffectiveThresholds;
  hasFlag: (flag: GameFlag) => boolean;
  ui: DerivedUi;
}

export function deriveGame(state: GameState): DerivedGame {
  const flags = computeFlags(state.upgrades);
  const thresholds = effectiveThresholds(state.upgrades);
  const flag = (f: GameFlag) => hasFlag(flags, f);

  const ui: DerivedUi = {
    showTokens: (state.totalTokensSpent ?? 0) > 0,
    showPasteError: (state.lifetimeBugs ?? 0) >= thresholds.showPasteErrorBugs,
    showKickAgent: state.totalClicks >= thresholds.showKickAgentClicks,
    showWriteTests:
      (state.bugs >= thresholds.showWriteTestsBugs || (state.tests ?? 0) > 0) &&
      !flag('ai_review'),
    showRunTests:
      state.bugs > thresholds.showRunTestsBugs &&
      (state.tests ?? 0) > 0 &&
      !flag('ai_review'),
    showClearContext:
      (state.minTokensSeen ?? 9999) < thresholds.showClearContextMinTokens ||
      state.totalLoc >= thresholds.showClearContextLoc,
    showLaunchBtn: state.totalLoc >= LAUNCH_LOC && !state.launched,
    showYoloMerge: state.launched && state.totalLoc >= thresholds.showYoloMergeLoc,
    showBugBounty:
      flag('nines_tracking') &&
      state.bugs > thresholds.showBugBountyBugs &&
      !flag('auto_bug_bounty'),
    showMoney: flag('money'),
    ninesTracking: flag('nines_tracking'),
    showBugs: (state.lifetimeBugs ?? 0) > 1,
    showStats: state.totalLoc >= thresholds.showStatsLoc,
    showUptime: state.launched,
    showHype: state.launched,
    showGenSection: state.totalLoc >= thresholds.showGeneratorsLoc,
    showUpgSection: state.totalLoc >= thresholds.showUpgradesLoc,
  };

  return {
    flags,
    thresholds,
    hasFlag: (f) => flag(f),
    ui,
  };
}
