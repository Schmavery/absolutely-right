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
export const MAX_LOG = 80;
export const LAUNCH_LOC = 10000;
/** How often the game auto-persists state to localStorage (ms). */
export const SAVE_INTERVAL_MS = 10000;

export const SAVE_KEY = 'extra_thinking_v1';
export const THEME_STORAGE_KEY = 'extra_thinking_theme';
export const DEFAULT_THEME = 'terminal-dark';

/** Min ms between any two random events firing across actions. */
export const EVENT_COOLDOWN_MS = 5000;

// ─── UI gating thresholds ──────────────────────────────────────────────────
//
// Anything keyed off raw player progress lives here. The names match how the
// component code uses them so a quick search reveals where each one shows up.

export const THRESHOLDS = {
  /** Stats lines ("total loc", "prompts") become visible. */
  showStatsLoc: 1000,

  /** Generators section becomes visible. */
  showGeneratorsLoc: 450,
  /** Upgrades section becomes visible. */
  showUpgradesLoc: 2000,

  /** "Free Account" generator row becomes visible. */
  showNewFreeAccountTokens: 500,
  /** Each generator becomes visible at `unlockAt * this`. */
  generatorVisibleFraction: 0.8,
  /** Each upgrade becomes a candidate for unlock at `unlockAt * this`. */
  upgradeUnlockFraction: 0.7,
  /** And once the player can afford this fraction of its cost. */
  upgradeAffordFraction: 0.25,

  // Action visibility ─────────────────────────────────────────────────────
  /** Reveal paste-the-error once `lifetimeBugs` reaches this (stays visible at 0 bugs). */
  showPasteErrorBugs: 1,
  showKickAgentClicks: 10,
  showWriteTestsBugs: 5,
  showRunTestsBugs: 2,
  showClearContextLoc: 4000,
  showClearContextMinTokens: 10,
  showYoloMergeLoc: 15000,
  showBugBountyBugs: 50,

  // Bug-related effects ───────────────────────────────────────────────────
  /** Below this totalLoc, bugs aren't generated yet (newborn project). */
  bugSpawnLoc: 100,
  /** Chance a manual prompt also spawns a bug, once `bugSpawnLoc` reached. */
  promptBugChance: 0.25,
  /** Events with `minLoc <` this become eligible as fallback "filler" events. */
  repeatableEventMaxLoc: 2000,
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

// ─── Hype display ──────────────────────────────────────────────────────────

export const HYPE = {
  /** Hype reward each time a milestone fires. */
  perMilestone: 5,
  /** Hype thresholds for the resource panel labels. */
  buildingMomentum: 20,
  goingViral: 100,
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

export const AGENT_BUFF = {
  /** Bug-rate multiplier while the agent buff is active. */
  bugRateMult: 1.5,
  /**
   * If `nines` has never been initialized but status was revamped, fall back
   * to this floor when computing nines.
   */
  ninesFloorFallback: 4,
} as const;

// ─── Simulator / pacing ────────────────────────────────────────────────────

/**
 * Virtual time (ms) charged to a successful action by the simulator. Mimics
 * the human read-decide-press loop so bot-driven traces are paced like a
 * real session rather than at full tick speed. Real React doesn't consult
 * this — players move at whatever speed they move at.
 */
export const ACTION_DURATION_MS = 1500;

// ─── Streaming / typing animation ──────────────────────────────────────────

export const STREAMING = {
  /** Pause before a user line appears (ms). */
  userLeadInMs: 240,
  /** Pause after a user line before the next entry begins (ms). */
  afterUserMs: 5000,
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
