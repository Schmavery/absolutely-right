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
  /** Multiplies McMini code LOC/s. Last-owned-wins. */
  agentLocMult?: number;
  /** Additive flat LOC/s while `kick_agent` buff is active (independent of generators). */
  kickAgentLocPerSec?: number;
  /** Additive tokens spent per `kick_agent` (stacks across owned upgrades). */
  kickAgentTokenCostBonus?: number;
  /** Additive tokens spent per `prompt` (stacks across owned upgrades). */
  promptTokenCostBonus?: number;
  /** Additive tokens spent per `paste_error` (stacks across owned upgrades). */
  pasteErrorTokenCostBonus?: number;
  /** Additive fix chance for `paste_error` (stacks; capped at 1). */
  pasteErrorFixChanceBonus?: number;
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
  /** Prompt action cooldown (ms). Min-wins across owned upgrades vs `actions.yaml` base. */
  promptCooldownMs?: number;

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
   * Shop unlock only when uptime nines (from current bugs) are at most this
   * value — crisis upgrades when reliability has collapsed.
   */
  unlockMaxUptimeNines?: number;
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
      | 'showRunTestsTests'
      | 'showClearContextLoc'
      | 'showClearContextMinTokens'
      | 'showBugBountyBugs'
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
  type: 'info' | 'bad' | 'event';
  minLoc: number;
  requiresLaunch?: boolean;
  requires?: string[];
}

/** Industry headlines in `data/news.yaml` — never repeat; keyed by `id`. */
export interface NewsDef {
  id: string;
  text: string;
  minLoc: number;
  requiresLaunch?: boolean;
  requires?: string[];
}

/** One fake tool invocation in `data/mcp.yaml` (`tools` pool). */
export type McpToolDef = {
  id: string;
  /** When true, `always_allow` may auto-approve; unsafe beats need Allow/Deny. */
  safe: boolean;
  /** Log line after the tool card is approved (per tool). */
  onAllow: string;
  /** Log line when the player denies this tool; required when `safe: false`. */
  onDeny?: string;
} & (
  | {
      tool: 'CallMcpTool';
      server: string;
      toolName: string;
      args: string;
    }
  | { tool: 'Shell'; command: string; output?: string }
  /** `snippet` — fake bytes the agent “read” (not a meta caption). */
  | { tool: 'Read'; path: string; snippet?: string }
  | { tool: 'Write'; path: string; preview?: string; output?: string }
);

/** MCP tool-call definitions in `data/mcp.yaml`. */
export interface McpCopy {
  /** Extra ack line after unsafe `onAllow` (non-YOLO). */
  unsafeAllowLeakAck: string[];
  tools: McpToolDef[];
}

export type LogEntryType =
  | 'info'
  | 'bad'
  | 'event'
  | 'news'
  | 'milestone'
  | 'system'
  | 'tool'
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

  // prompt — scripted log beats before `eventProbability` / random events
  earlyPromptMsgs?: string[];

  // kick_agent
  buffMs?: number;

  // paste_error
  fixChance?: number;
  baseLocGain?: number;
  extraLocRange?: number;
  goodMessages?: string[];
  badMessages?: string[];
  neutralMessages?: string[];

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
  /** One-shot AI line when this action first becomes available. */
  introMsg?: string;

  // buy_gen
  firstPurchaseMsg?: string;

  // lobstagram_post
  buzzGain?: number;
}

/** Per-McMini lane assignment; counts must sum to `mcMinis`. */
export interface McMiniLanes {
  code: number;
  growth: number;
  tests: number;
}

export interface LogEntry {
  id: number;
  text: string;
  type: LogEntryType;
  /** User line waiting behind earlier log playback; cleared once streamed in. */
  queued?: boolean;
  /** Id of the first entry from the same `appendLog` call (multi-line events). */
  burstId?: number;
  /** Ms for `useStreamingLog` to drain this entry; fixed in `appendLog`. */
  streamMs?: number;
  /** Jump to front of pending queue once the current line finishes. */
  priority?: boolean;
  /** Front of queue + no token animation (MCP tool cards, etc.). */
  instant?: boolean;
  /** Short post-approve line under an MCP `tool` entry body. */
  toolAck?: string;
}

export interface GameState {
  loc: number;
  bugs: number;
  /** Cumulative bugs ever gained; sticky `showBugs` once `lifetimeBugs > 1`. */
  lifetimeBugs: number;
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
  /** Legacy save field; random pools dedupe from the recent log window now. */
  usedEventIds: string[];
  /** Action ids whose `introMsg` has been shown (one-shot per save). */
  actionsIntroduced?: string[];
  /** Stable ids from `data/news.yaml`; each headline fires at most once per save. */
  usedNewsIds: string[];
  tokens: number;
  /** 0–100; resets on fundraise. */
  buzzMeter: number;
  /** Index into `INVESTOR.fundingRounds`; 0 = next round is seed. */
  fundingRound: number;
  mcMinis: number;
  mcMiniLanes: McMiniLanes;
  /** Legacy `kick_agent` buff; unused once McMinis are deployed. */
  agentBuffExpires: number;
  unlockedUpgrades: string[];
  nines: number;
  /** MCP tool-call line awaiting Allow/Deny; null when idle. */
  mcpApprovalPending: string | null;
  /** Always-allow: fire `mcpAllow` after this timestamp (card still shown first). */
  mcpAutoApproveAt: number | null;
  /** While set, prompt/actions blocked and UI shows post-allow spinner until ack. */
  mcpExecutingUntil: number | null;
  /** Tool-call text kept visible during the post-allow spinner. */
  mcpExecutingLine: string | null;
  /** `data/mcp.yaml` tool `id` for pending/execute (per-tool onAllow/onDeny). */
  mcpActiveToolId: string | null;
}
