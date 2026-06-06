/**
 * Cross-cutting balance and UX constants. Anything that shows up as a magic
 * number in the tick loop or UI lives here so the game can be retuned without
 * spelunking through component code.
 *
 * Per-action knobs (cost, cooldown, formula numbers, message pools) live as
 * fields on each entry in `data/actions.yaml` and are reached via
 * `action(id)` in `src/game/data.ts`.
 *
 * Per-upgrade effects (token bonuses, drain rates, etc.) live as fields on
 * each upgrade definition in `data/upgrades.yaml`.
 */

export const TICK_MS = 100;
/** Max virtual time applied in one foreground catch-up (tab refocus or throttled interval). */
export const MAX_CATCHUP_MS = 30 * 60 * 1000;

/** Per-second rates with |value| below this are treated as zero (ticks and UI). */
export const NEGLIGIBLE_RATE = 0.01;
export const MAX_LOG = 80;
export const LAUNCH_LOC = 10000;
/** How often the game auto-persists state to localStorage (ms). */
export const SAVE_INTERVAL_MS = 10000;

export const SAVE_KEY = 'extra_thinking_v1';
export const THEME_STORAGE_KEY = 'extra_thinking_theme';
/** Fallback when `prefers-color-scheme` is unavailable (tests, SSR). */
export const DEFAULT_THEME = 'terminal-light';

/** Min ms between any two random events firing across actions. */
export const EVENT_COOLDOWN_MS = 5000;

/** Random dialogue/action pools skip templates seen in this many recent log entries. */
export const MESSAGE_POOL = {
  recentWindow: 48,
} as const;

// ─── UI gating thresholds ──────────────────────────────────────────────────
//
// Anything keyed off raw player progress lives here. The names match how the
// component code uses them so a quick search reveals where each one shows up.

export const THRESHOLDS = {
  /** Generators section becomes visible. */
  showGeneratorsLoc: 450,
  /** Upgrades section becomes visible. */
  showUpgradesLoc: 80,

  /** "Free Account" generator row becomes visible. */
  showNewFreeAccountTokens: 2000,
  /** Each generator becomes visible at `unlockAt * this`. */
  generatorVisibleFraction: 0.8,
  /** Each upgrade becomes a candidate for unlock at `unlockAt * this`. */
  upgradeUnlockFraction: 0.7,
  /** And once the player can afford this fraction of its cost. */
  upgradeAffordFraction: 0.25,

  // Action visibility ─────────────────────────────────────────────────────
  /** Reveal paste-the-error and the bugs counter once `lifetimeBugs` reaches this. */
  showPasteErrorBugs: 1,
  showKickAgentClicks: 10,
  showWriteTestsBugs: 50,
  /** Reveal run_tests once the player has written at least this many tests. */
  showRunTestsTests: 1,
  showClearContextLoc: 4000,
  showClearContextMinTokens: 10,
  showBugBountyBugs: 50,

  // Bug-related effects ───────────────────────────────────────────────────
  /** Below this totalLoc, bugs aren't generated yet (newborn project). */
  bugSpawnLoc: 100,
  /** Chance a manual prompt also spawns a bug, once `bugSpawnLoc` reached. */
  promptBugChance: 0.25,
  /** Bug count above which warnings start showing. */
  warnBugsElevated: 10,
  warnBugsCritical: 100,
  warnBugsPenaltyShown: 20,
  /** Below this uptime nine count, "production is on fire" warning shows. */
  warnUptimeFireNines: 1,
  warnUptimeDegradedNines: 2,
} as const;

/** When both dialogue events and unused headlines are eligible, pick headline with this chance. */
export const EVENT_MIX = {
  newsShare: 0.35,
} as const;

// ─── Investor overlay (burn, buzz meter, McMinis) ────────────────────────

export const INVESTOR = {
  buzzMax: 100,
  buzzPerSecPerGrowthMini: 8,
  tokenDrainPerCodeMini: 3,
  tokenDrainPerGrowthMini: 4,
  tokenDrainPerTestsMini: 2,
  /** LOC/s per McMini on code (before bug penalty); scaled by `calcAgentLocMult`. */
  codeLocPerMini: 12,
  codeBugRateMult: 1.35,
  fundingRounds: [
    {
      label: 'Seed',
      minBurnPerSec: 0,
      mcMinisGrant: 1,
    },
    {
      label: 'Series A',
      minBurnPerSec: 5,
      mcMinisGrant: 1,
    },
    {
      label: 'Series B',
      minBurnPerSec: 20,
      mcMinisGrant: 2,
    },
  ],
} as const;

// ─── Manual prompt math ────────────────────────────────────────────────────

/** Manual prompt LOC = `clickPower * LOC_PER_CLICK_POWER + clickBonuses`. */
export const LOC_PER_CLICK_POWER = 10;

/**
 * After `prompt.earlyPromptMsgs` are exhausted, random events decay from
 * certainty to `actions.yaml` `eventProbability` over `decayClicks` (indexed
 * by prompts past the scripted list).
 */
export const PROMPT_EVENT = {
  decayClicks: 20,
} as const;

// ─── Token capacity baseline ───────────────────────────────────────────────

export const TOKENS = {
  baseMax: 120,
  baseRegen: 4,
  /** Reveal token counter once fill has fallen to this fraction of max (or lower). */
  showAtMaxFillFraction: 0.1,
  /** Min token reading below which the "low" warning shows. */
  lowWarnThreshold: 20,
} as const;

// ─── Money / uptime / agent buff ───────────────────────────────────────────

export const MONEY = {
  /** $/s of revenue per LOC/s, post-uptime, post-launch. */
  revenuePerLocPerSec: 0.003,
} as const;

export const UPTIME = {
  bugPenaltyRate: 0.003,
  /** Cap on bug-induced output penalty. */
  minOutputFraction: 0.2,
  fractionMin: 0.8,
  fractionMax: 0.99999,
  bugFractionRate: 0.0001,
} as const;

/**
 * Bug spawn scales faster than LOC as throughput rises (fixes stay ~linear in
 * tests/gens). Tuned so CI-heavy midgame can still hit review-crisis uptime.
 */
/** Tuned in one place; `number` so `rates.ts` can branch when exponent is 1. */
export const BUG_GENERATION: {
  readonly genCountExponent: number;
  readonly throughputScale: number;
  readonly throughputExponent: number;
} = {
  /** Per-generator: bugs/s uses count^exp instead of count (1 = linear). */
  genCountExponent: 1.14,
  /** After summing generators: bugRate *= (1 + locRate/scale)^exp. */
  throughputScale: 320,
  throughputExponent: 0.3,
};

export const AGENT_BUFF = {
  /** Bug-rate multiplier while the agent buff is active. */
  bugRateMult: 1.5,
  /** Flat LOC/s while `kick_agent` buff is active (independent of generator scaling). */
  locPerSec: 20,
  /**
   * If `nines` has never been initialized but status was revamped, fall back
   * to this floor when computing nines.
   */
  ninesFloorFallback: 4,
} as const;

// ─── Simulator / pacing ────────────────────────────────────────────────────

/**
 * Default virtual time (ms) per planner step for actions without a yaml cooldown.
 * Prompt and other cooldown actions use their gameplay cooldown values as a direct
 * time cost in `planReach.ts` (no separate idle-wait search branches).
 */
export const ACTION_DURATION_MS = 2000;

// ─── Streaming / typing animation ──────────────────────────────────────────

/** MCP tool-call approval UX (mid chapter). */
export const MCP = {
  /** Spinner after Allow (manual or auto) before the ack line appears (ms). */
  executeSpinnerMs: 5000,
  /** How long the approval card is visible before auto-allow fires (ms). */
  autoApproveDelayMs: 400,
  /** Share of LOC buffer lost on unsafe allow without YOLO (manual Allow). */
  unsafeAllowLocLeakFraction: 0.5,
  /** Min LOC granted when a safe tool is allowed. */
  safeAllowLocMin: 800,
  /** Extra safe-allow LOC = floor(totalLoc × this). */
  safeAllowLocFraction: 0.006,
} as const;

export const STREAMING = {
  /** Pause before a user line appears (ms). */
  userLeadInMs: 240,
  /** Pause after a user line before the next entry begins (ms). */
  afterUserMs: 3000,
  /** Delay after a user line before the thinking spinner appears (ms). */
  thinkingDelayMs: 500,
  /** How long the spinner stays visible on AI-only lines before typing (ms). */
  aiOnlySpinnerHoldMs: 800,
  /** Pause after the spinner before typing starts on post-user replies (ms). */
  aiLeadInMs: 90,
  /** Per typed token during AI streaming (ms); fixed, set at enqueue. */
  charMs: 52,
  /** Pause after an AI message finishes streaming (ms). */
  afterAiMs: 420,
  /** Spinner frame interval (ms). */
  spinnerMs: 80,
  /** Spinner verb cycles every N spinner frames. */
  spinnerVerbEvery: 20,
} as const;
