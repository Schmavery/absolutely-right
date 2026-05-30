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
