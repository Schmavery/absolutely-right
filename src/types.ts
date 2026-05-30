export interface GenDef {
  id: string;
  name: string;
  desc: string;
  locPerSec: number;
  bugsPerSec: number;
  fixPerSec: number;
  baseCost: number;
  costMult: number;
  unlockAt: number;
}

/**
 * Definition of an upgrade. Effect fields are optional and combine with
 * different semantics depending on the field — see comments inline.
 */
export interface UpgDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  unlockAt: number;

  // ── click effects ──
  /** Multiplied across all owned upgrades. */
  clickMult?: number;
  /** Summed across all owned upgrades. */
  clickBonus?: number;

  // ── generator effects ──
  /** Multiplied across all owned upgrades. */
  globalMult?: number;
  /** Multiplied across all owned upgrades. */
  bugMult?: number;
  /** Last-owned-wins (later upgrades override earlier ones). */
  reviewLocMult?: number;
  /** Last-owned-wins (later upgrades override earlier ones). */
  reviewBugMult?: number;
  /** Multiplies agent base LOC during the agent buff. Last-owned-wins. */
  agentLocMult?: number;
  /** Per-test bug-fix rate from CI. Summed across owned upgrades. */
  testFixRate?: number;

  // ── token effects (additive across owned upgrades) ──
  maxTokensBonus?: number;
  tokenRegenBonus?: number;

  // ── nines & bug bounty (additive across owned upgrades) ──
  /** Constant nines-per-second bleed. */
  ninesPerSec?: number;
  /** Nines-per-second per outstanding bug. */
  ninesPerBugSec?: number;
  /**
   * Auto-drains bugs at `bugs * rate` per second. Max-wins across owned
   * upgrades — a later upgrade with a larger rate replaces an earlier one
   * rather than stacking.
   */
  autoBugDrainRate?: number;

  // ── money ──
  /** Largest owned value wins (later plans replace cheaper ones). */
  moneyCostPerSec?: number;
  /** When set true and owned, enables money revenue/cost flow. */
  enablesMoney?: boolean;

  // ── meta / gating ──
  /** Required upgrade ids that must be owned to unlock this one. */
  requires?: string[];
  /** Player must have launched (`state.launched === true`). */
  requiresLaunch?: boolean;
  /** When purchased, raises the nines counter to at least this value. */
  ninesFloor?: number;
  /** Flavor line shown in the conversation log when this upgrade is bought. */
  purchaseMsg?: string;

  /**
   * Feature flags this upgrade grants while owned. See `GAME_FLAGS` in
   * `src/game/flags.ts` for the vocabulary.
   */
  flags?: string[];
  /**
   * While this upgrade is not yet owned, it only enters the unlock shop when
   * uptime nines (from bugs) are at least this value.
   */
  unlockMinUptimeNines?: number;
  /**
   * Overrides entries in `THRESHOLDS` while this upgrade is owned (e.g. lower
   * `showBugBountyBugs` once nines meta is in play). Later upgrades in
   * `upgrades.yaml` win on duplicate keys.
   */
  thresholdOverrides?: Partial<
    Record<
      | 'showGeneratorsLoc'
      | 'showUpgradesLoc'
      | 'showPasteErrorBugs'
      | 'showKickAgentClicks'
      | 'showWriteTestsBugs'
      | 'showRunTestsBugs'
      | 'showClearContextLoc'
      | 'showClearContextMinTokens'
      | 'showYoloMergeLoc'
      | 'showBugBountyBugs'
      | 'showBugsClicks'
      | 'showStatsLoc'
      | 'showNewFreeAccountTokens',
      number
    >
  >;
}

export interface EventDef {
  text: string;
  locMult?: number;
  locDelta?: number;
  bugDelta?: number;
  freeAccountsDelta?: number;
  type: 'info' | 'bad' | 'event' | 'news';
  minLoc: number;
  requiresLaunch?: boolean;
  requires?: string[];
}

export type LogEntryType =
  | 'info'
  | 'bad'
  | 'event'
  | 'news'
  | 'milestone'
  | 'system'
  | 'user';

/**
 * Per-action data record — see `data/actions.yaml`. All numeric fields are
 * optional because each action only uses a subset; required fields are
 * enforced at use-sites by the corresponding action reducer.
 */
export interface ActionDef {
  id: string;

  // Common knobs
  tokenCost?: number;
  cooldownMs?: number;
  eventProbability?: number;

  // Random message pools (Handlebars-templated)
  messages?: string[];

  // prompt
  firstPromptMsg?: string;

  // kick_agent
  buffMs?: number;

  // paste_error
  fixChance?: number;
  baseLocGain?: number;
  extraLocRange?: number;
  goodMessages?: string[];
  badMessages?: string[];
  neutralMessages?: string[];

  // yolo_merge
  baseLoc?: number;
  locPerBug?: number;
  bugMultiplier?: number;
  baseBugs?: number;
  extraBugRange?: number;
  hypeReward?: number;

  // run_tests
  /** Per-test independent fix probability. Total = `1 - (1 - p)^tests`. */
  perTestFixFraction?: number;
  minCost?: number;
  costFraction?: number;
  /** Min ms between consecutive "ran tests" log lines. */
  logCooldownMs?: number;

  // bug_bounty
  maxConvertedPerRun?: number;
  ninesPerBug?: number;
  runMsg?: string;

  // new_free_account
  maxTokensPerExtra?: number;
  tokenRegenPerExtra?: number;

  // write_test
  baseCost?: number;
  costMult?: number;
  /** Per-test bug-rate damping factor (`1 / (1 + tests * this)`). */
  bugDamping?: number;
  milestones?: { count: number; text: string }[];

  // buy_gen
  firstPurchaseMsg?: string;
}

export interface LogEntry {
  id: number;
  text: string;
  type: LogEntryType;
}

export interface GameState {
  loc: number;
  bugs: number;
  hype: number;
  tests: number;
  freeAccounts: number;
  totalLoc: number;
  totalClicks: number;
  totalTokensSpent: number;
  minTokensSeen: number;
  genCounts: Record<string, number>;
  upgrades: string[];
  log: LogEntry[];
  logId: number;
  lastEventTime: number;
  lastTestLogTime: number;
  actionCooldowns: Record<string, number>;
  milestonesSeen: number[];
  started: boolean;
  launched: boolean;
  usedEventIds: string[];
  tokens: number;
  money: number;
  agentBuffExpires: number;
  unlockedUpgrades: string[];
  nines: number;
}
