/**
 * Tunable balance and UX constants. Anything that shows up as a magic number
 * in the tick loop, action handlers, or the UI lives here so the game can be
 * retuned without spelunking through component code.
 *
 * Per-upgrade effects (token bonuses, drain rates, etc.) live as fields on
 * each upgrade definition in `data/upgrades.yaml`; only cross-cutting numbers
 * belong here.
 */

export const TICK_MS = 100;
export const MAX_LOG = 80;
export const LAUNCH_LOC = 10000;
/** How often the game auto-persists state to localStorage (ms). */
export const SAVE_INTERVAL_MS = 10000;

export const SAVE_KEY = 'absolutely_right_v1';
export const THEME_STORAGE_KEY = 'absolutely_right_theme';
export const DEFAULT_THEME = 'terminal-dark';

// ─── Cooldowns (ms) ────────────────────────────────────────────────────────

export const COOLDOWNS = {
  pasteError: 4000,
  yoloMerge: 20000,
  bugBounty: 30000,
  clearContext: 30000,
  freeAccount: 20000,
  /** Minimum gap between random events firing from any single action. */
  globalEvent: 5000,
  /** Minimum gap between consecutive "ran tests" log lines. */
  testLog: 4000,
} as const;

// ─── Token costs ───────────────────────────────────────────────────────────

export const TOKEN_COSTS = {
  prompt: 15,
  agent: 60,
  pasteError: 10,
  yoloMerge: 25,
  tests: 8,
  bugBounty: 20,
  writeTest: 5,
} as const;

/** How long the "kick off an agent" buff lasts (ms). */
export const AGENT_BUFF_MS = 30000;

// ─── Probability that an action fires a random event ───────────────────────

export const EVENT_PROBABILITIES = {
  prompt: 0.12,
  kickAgent: 0.2,
  runTests: 0.25,
  buyGen: 0.3,
  buyUpgrade: 0.4,
  yoloMerge: 0.5,
} as const;

// ─── UI gating thresholds ──────────────────────────────────────────────────
//
// Anything keyed off raw player progress lives here. The names match how the
// component code uses them so a quick search reveals where each one shows up.

export const THRESHOLDS = {
  /** Resource panel starts showing the bug counter. */
  showBugsClicks: 3,
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
  /** revamp_status_page additionally requires this many uptime nines first. */
  revampMinNines: 4,

  // Action visibility ─────────────────────────────────────────────────────
  showPasteErrorBugs: 1,
  showKickAgentClicks: 5,
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

// ─── Hype rewards ──────────────────────────────────────────────────────────

export const HYPE = {
  perMilestone: 5,
  yoloMerge: 8,
  launch: 20,
  /** Hype thresholds for the resource panel labels. */
  buildingMomentum: 20,
  goingViral: 100,
} as const;

// ─── Cost / yield formula constants ────────────────────────────────────────

/** Manual prompt LOC = `clickPower * LOC_PER_CLICK_POWER + clickBonuses`. */
export const LOC_PER_CLICK_POWER = 10;

export const PASTE_ERROR = {
  /** Chance the paste actually fixes the bug. */
  fixChance: 0.5,
  baseLocGain: 20,
  /** Random extra LOC up to this amount. */
  extraLocRange: 30,
} as const;

export const YOLO_MERGE = {
  baseLoc: 300,
  locPerBug: 20,
  extraLocRange: 500,
  bugMultiplier: 0.2,
  baseBugs: 5,
  extraBugRange: 10,
} as const;

export const RUN_TESTS = {
  /** Cost is `max(minCost, totalLoc * costFraction)`. */
  minCost: 100,
  costFraction: 0.005,
  /** Fraction of outstanding bugs fixed per run. */
  bugFixFraction: 0.25,
} as const;

export const WRITE_TEST = {
  baseCost: 200,
  costMult: 1.04,
  /** Per-test bug-rate damping factor (`1 / (1 + tests * this)`). */
  bugDamping: 0.01,
} as const;

export const BUG_BOUNTY = {
  /** Max bugs converted per run. */
  maxConvertedPerRun: 500,
  ninesPerBug: 0.0002,
} as const;

export const FREE_ACCOUNT = {
  maxTokensPerExtra: 50,
  tokenRegenPerExtra: 1.5,
} as const;

export const TOKENS = {
  baseMax: 120,
  baseRegen: 4,
  /** Min token reading below which the "low" warning shows. */
  lowWarnThreshold: 20,
} as const;

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

/** Phase boundaries (totalLoc → phase index 0..4). */
export const PHASE_THRESHOLDS = [5000, 500_000, 50_000_000, 5_000_000_000] as const;

// ─── Streaming / typing animation ──────────────────────────────────────────

export const STREAMING = {
  /** Pause before a user line appears (ms). */
  userLeadInMs: 240,
  /** Pause after a user line before the next entry begins (ms). */
  afterUserMs: 5000,
  /** Pause before AI streaming starts on a new entry (ms). */
  aiLeadInMs: 90,
  /** Per-character delay during AI streaming (ms): base + random extra. */
  charBaseMs: 26,
  charJitterMs: 26,
  /** Pause after an AI message finishes streaming (ms). */
  afterAiMs: 420,
  /** Spinner frame interval (ms). */
  spinnerMs: 80,
  /** Spinner verb cycles every N spinner frames. */
  spinnerVerbEvery: 20,
} as const;
