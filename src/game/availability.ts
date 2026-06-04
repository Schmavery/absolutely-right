/**
 * Single source of truth for "what can the player do right now?".
 *
 * `derive.ts` answers "should this section/button be **visible**?" — driven
 * by totalLoc / bugs / clicks / flags. This module answers "is the move
 * **firable** right now?" — adding cost (loc/tokens), cooldown, and the
 * special preconditions each reducer enforces (e.g. `paste_error` needs at
 * least one bug).
 *
 * Each move declares a **`gates`** list; `legal`, `waitMs`, and progress
 * bars are derived from that list so predicates and idle forecasts cannot
 * drift apart.
 *
 * Both React (via `ActionBar`, `Generators`, `Upgrades`) and the simulator
 * harness (`src/sim/`) read from here. The reducers in `actions.ts`
 * still no-op on illegal calls, so this module is a *predicate* layer, not
 * a guard — but routing UI and bots through it ensures they never disagree
 * about whether something is available.
 */

import type { GameState } from '../types';
import { INVESTOR, LAUNCH_LOC } from './constants';
import { canRaise, nextFundingRound } from './investor';
import { action, GENS, UPGRADES } from './data';
import { deriveGame } from './derive';
import {
  mcpAllowAction,
  mcpApprovalPending as mcpPending,
  mcpBlocksPlay,
  mcpDenyAction,
} from './mcpApproval';
import { calcBugPenalty, calcRates, calcTokenConfig, genCost } from './rates';
import {
  buyGenAction,
  buyUpgradeAction,
  bugBountyAction,
  clearContextAction,
  kickAgentAction,
  launchAction,
  lobstagramPostAction,
  raiseRoundAction,
  newFreeAccountAction,
  pasteErrorAction,
  promptAction,
  runTestsAction,
  runTestsCost,
  writeTestAction,
  writeTestCost,
} from './actions';
import { now as runtimeNow } from './runtime';

// ─── identifiers ───────────────────────────────────────────────────────────

/** Bot-friendly fixed move ids for non-parametric actions. */
export const ACTION_IDS = [
  'prompt',
  'paste_error',
  'write_test',
  'kick_agent',
  'run_tests',
  'clear_context',
  'launch',
  'mcp_allow',
  'mcp_deny',
  'bug_bounty',
  'new_free_account',
  'lobstagram_post',
  'raise_round',
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export type MoveKind = 'action' | 'buy_gen' | 'buy_upgrade';

/**
 * One precondition for firing a move. `legal` and `waitMs` are always
 * derived from the full gate list — do not set them by hand on `Move`.
 *
 * - **bool**: satisfied only by another player action (idle never helps).
 *   Contributes `waitMs: null` to the move forecast.
 * - **wait**: clears under pure idle in `waitMs` ms (0 if already `ok`).
 */
export type Gate =
  | { kind: 'bool'; ok: boolean }
  | {
      kind: 'wait';
      ok: boolean;
      /** Ms of idle until this gate clears; `null` if idle cannot clear it. */
      waitMs: number | null;
      /** Drives afford vs cooldown progress bars in the UI. */
      role?: 'afford' | 'cooldown';
      /** [0, 1] fill for this gate when `role` is set. */
      progress?: number;
    };

/** A discrete thing the player can attempt. */
export interface Move {
  id: string;
  kind: MoveKind;
  actionId?: ActionId;
  target?: string;
  visible: boolean;
  /** Preconditions; exposed for structural invariant tests. */
  gates: readonly Gate[];
  legal: boolean;
  affordProgress: number;
  cooldownProgress: number;
  /**
   * Pessimistic forecast: ms of pure idle waiting (no other player actions)
   * until `legal` would flip to true. `0` when already legal. `null` when
   * idle alone is insufficient. Derived from `gates` via closed-form helpers.
   */
  waitMs: number | null;
  apply(state: GameState): GameState;
}

// ─── gate derivation (canonical) ─────────────────────────────────────────────

export function legalFromGates(gates: readonly Gate[]): boolean {
  return gates.every((g) => g.ok);
}

export function waitMsFromGates(gates: readonly Gate[]): number | null {
  const waits: (number | null)[] = [];
  for (const g of gates) {
    if (g.kind === 'bool') {
      if (!g.ok) return null;
      continue;
    }
    if (g.waitMs === null) return null;
    waits.push(g.waitMs);
  }
  return combineWait(...waits);
}

function affordProgressFromGates(gates: readonly Gate[]): number {
  const afford = gates.filter((g) => g.kind === 'wait' && g.role === 'afford');
  if (afford.length === 0) return 1;
  return Math.min(...afford.map((g) => (g.kind === 'wait' ? (g.progress ?? 1) : 1)));
}

function cooldownProgressFromGates(gates: readonly Gate[]): number {
  const cd = gates.filter((g) => g.kind === 'wait' && g.role === 'cooldown');
  if (cd.length === 0) return 1;
  return Math.min(...cd.map((g) => (g.kind === 'wait' ? (g.progress ?? 1) : 1)));
}

/** True when a bool gate blocks the move (MCP pending, no bugs, etc.). */
export function boolBlocked(m: Move): boolean {
  return m.gates.some((g) => g.kind === 'bool' && !g.ok);
}

/** Bar fill for UI: wait-gate mins, and 0 when a bool gate blocks the move. */
export function displayProgress(m: Move): number {
  let p = Math.min(m.affordProgress, m.cooldownProgress);
  if (boolBlocked(m)) p = 0;
  return p;
}

/**
 * Progress for action buttons: show incremental fill while recharging
 * (cooldown / afford), omit when gated by a bool precondition.
 */
export function rechargeProgress(m: Move): number | undefined {
  if (boolBlocked(m)) return undefined;
  return displayProgress(m);
}

type BuildMoveOverlay = {
  /** `legal` also requires `base.visible` (section/row visibility). */
  requireVisible?: boolean;
  /** When not visible, `waitMs` is `null` (no idle forecast for hidden rows). */
  hideWaitWhenNotVisible?: boolean;
};

function buildMove(
  base: Omit<Move, 'gates' | 'legal' | 'waitMs' | 'affordProgress' | 'cooldownProgress'>,
  gates: Gate[],
  overlay?: BuildMoveOverlay,
): Move {
  const gateLegal = legalFromGates(gates);
  let waitMs = waitMsFromGates(gates);
  let legal = gateLegal;
  if (overlay?.requireVisible) {
    legal = base.visible && gateLegal;
    if (overlay.hideWaitWhenNotVisible && !base.visible) waitMs = null;
  }
  return {
    ...base,
    gates,
    legal,
    waitMs,
    affordProgress: affordProgressFromGates(gates),
    cooldownProgress: cooldownProgressFromGates(gates),
  };
}

// ─── helpers ───────────────────────────────────────────────────────────────

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function tokenAfford(state: GameState, cost: number | undefined): number {
  if (!cost) return 1;
  return clamp01(state.tokens / cost);
}

function locAfford(state: GameState, cost: number): number {
  if (cost <= 0) return 1;
  return clamp01(state.loc / cost);
}

function cooldownProgress(state: GameState, key: string, ms: number | undefined, t: number): number {
  if (!ms) return 1;
  const elapsed = t - (state.actionCooldowns[key] ?? 0);
  return clamp01(elapsed / ms);
}

function tokensOk(state: GameState, cost: number | undefined): boolean {
  return cost === undefined || state.tokens >= cost;
}

// ─── closed-form wait (forecast implementation) ────────────────────────────

function waitForCooldownMs(state: GameState, key: string, ms: number | undefined, t: number): number {
  if (!ms) return 0;
  const elapsed = t - (state.actionCooldowns[key] ?? 0);
  return Math.max(0, ms - elapsed);
}

function waitForBuffExpiryMs(state: GameState, t: number): number {
  return Math.max(0, (state.agentBuffExpires ?? 0) - t);
}

function waitForTokensMs(state: GameState, cost: number | undefined): number | null {
  if (!cost || state.tokens >= cost) return 0;
  const { tokenRegen } = calcTokenConfig(state.upgrades, state.freeAccounts);
  if (tokenRegen <= 0) return null;
  return ((cost - state.tokens) / tokenRegen) * 1000;
}

function waitForLocMs(state: GameState, target: number): number | null {
  if (state.loc >= target) return 0;
  const { locRate } = calcRates(state.genCounts, state.upgrades, state.tests);
  const effective = locRate * calcBugPenalty(state.bugs);
  if (effective <= 0) return null;
  return ((target - state.loc) / effective) * 1000;
}

function waitForTotalLocMs(state: GameState, target: number): number | null {
  if (state.totalLoc >= target) return 0;
  const { locRate } = calcRates(state.genCounts, state.upgrades, state.tests);
  const effective = locRate * calcBugPenalty(state.bugs);
  if (effective <= 0) return null;
  return ((target - state.totalLoc) / effective) * 1000;
}

function combineWait(...waits: (number | null)[]): number | null {
  let max = 0;
  for (const w of waits) {
    if (w === null) return null;
    if (w > max) max = w;
  }
  return max;
}

// ─── gate factories ──────────────────────────────────────────────────────────

function boolGate(ok: boolean): Gate {
  return { kind: 'bool', ok };
}

/** Block player actions while an MCP card or post-allow spinner is active. */
function mcpIdleGate(state: GameState, t: number): Gate {
  return boolGate(!mcpBlocksPlay(state, t));
}

function withMcpIdle(state: GameState, gates: Gate[], t: number): Gate[] {
  return [mcpIdleGate(state, t), ...gates];
}

function tokenGate(state: GameState, cost: number | undefined): Gate {
  const ok = tokensOk(state, cost);
  const waitMs = waitForTokensMs(state, cost);
  if (waitMs === null && !ok) return boolGate(false);
  return {
    kind: 'wait',
    ok,
    waitMs: waitMs ?? 0,
    role: 'afford',
    progress: tokenAfford(state, cost),
  };
}

function locGate(state: GameState, target: number): Gate {
  const ok = state.loc >= target;
  const waitMs = waitForLocMs(state, target);
  if (waitMs === null && !ok) return boolGate(false);
  return {
    kind: 'wait',
    ok,
    waitMs: waitMs ?? 0,
    role: 'afford',
    progress: locAfford(state, target),
  };
}

function totalLocGate(state: GameState, target: number): Gate {
  const ok = state.totalLoc >= target;
  const waitMs = waitForTotalLocMs(state, target);
  if (waitMs === null && !ok) return boolGate(false);
  return {
    kind: 'wait',
    ok,
    waitMs: waitMs ?? 0,
    role: 'afford',
    progress: clamp01(state.totalLoc / target),
  };
}

function cooldownGate(
  state: GameState,
  key: string,
  ms: number | undefined,
  t: number,
): Gate {
  const ok = !ms || t - (state.actionCooldowns[key] ?? 0) >= ms;
  return {
    kind: 'wait',
    ok,
    waitMs: waitForCooldownMs(state, key, ms, t),
    role: 'cooldown',
    progress: cooldownProgress(state, key, ms, t),
  };
}

function buffGate(state: GameState, t: number, buffMs: number): Gate {
  const active = t < (state.agentBuffExpires ?? 0);
  const waitMs = waitForBuffExpiryMs(state, t);
  return {
    kind: 'wait',
    ok: !active,
    waitMs,
    role: 'cooldown',
    progress: active ? clamp01(1 - waitMs / buffMs) : 1,
  };
}

// ─── per-action move builders ──────────────────────────────────────────────

interface Ctx {
  state: GameState;
  t: number;
  ui: ReturnType<typeof deriveGame>['ui'];
  thresholds: ReturnType<typeof deriveGame>['thresholds'];
}

function prompt(c: Ctx): Move {
  const a = action('prompt');
  return buildMove(
    {
      id: 'prompt',
      kind: 'action',
      actionId: 'prompt',
      visible: true,
      apply: promptAction,
    },
    withMcpIdle(c.state, [cooldownGate(c.state, 'prompt', a.cooldownMs, c.t)], c.t),
  );
}

function mcpAllow(c: Ctx): Move {
  return buildMove(
    {
      id: 'mcp_allow',
      kind: 'action',
      actionId: 'mcp_allow',
      visible: c.ui.showMcpApproval,
      apply: mcpAllowAction,
    },
    [boolGate(mcpPending(c.state))],
  );
}

function mcpDeny(c: Ctx): Move {
  return buildMove(
    {
      id: 'mcp_deny',
      kind: 'action',
      actionId: 'mcp_deny',
      visible: c.ui.showMcpApproval,
      apply: mcpDenyAction,
    },
    [boolGate(mcpPending(c.state))],
  );
}

function pasteError(c: Ctx): Move {
  const a = action('paste_error');
  const gates: Gate[] = withMcpIdle(
    c.state,
    [
      boolGate(c.state.bugs > 0),
      cooldownGate(c.state, 'paste_error', a.cooldownMs, c.t),
      tokenGate(c.state, a.tokenCost),
    ],
    c.t,
  );
  return buildMove(
    {
      id: 'paste_error',
      kind: 'action',
      actionId: 'paste_error',
      visible: c.ui.showPasteError,
      apply: pasteErrorAction,
    },
    gates,
  );
}

function writeTest(c: Ctx): Move {
  const a = action('write_test');
  const cost = writeTestCost(c.state.tests ?? 0);
  return buildMove(
    {
      id: 'write_test',
      kind: 'action',
      actionId: 'write_test',
      visible: c.ui.showWriteTests,
      apply: writeTestAction,
    },
    withMcpIdle(c.state, [locGate(c.state, cost), tokenGate(c.state, a.tokenCost)], c.t),
  );
}

function kickAgent(c: Ctx): Move {
  const a = action('kick_agent');
  return buildMove(
    {
      id: 'kick_agent',
      kind: 'action',
      actionId: 'kick_agent',
      visible: c.ui.showKickAgent,
      apply: kickAgentAction,
    },
    withMcpIdle(c.state, [tokenGate(c.state, a.tokenCost), buffGate(c.state, c.t, a.buffMs ?? 1)], c.t),
  );
}

function runTests(c: Ctx): Move {
  const a = action('run_tests');
  const cost = runTestsCost(c.state.totalLoc);
  const hasTests = (c.state.tests ?? 0) > 0;
  return buildMove(
    {
      id: 'run_tests',
      kind: 'action',
      actionId: 'run_tests',
      visible: c.ui.showRunTests,
      apply: runTestsAction,
    },
    withMcpIdle(
      c.state,
      [boolGate(hasTests), locGate(c.state, cost), tokenGate(c.state, a.tokenCost)],
      c.t,
    ),
  );
}

function clearContext(c: Ctx): Move {
  const a = action('clear_context');
  return buildMove(
    {
      id: 'clear_context',
      kind: 'action',
      actionId: 'clear_context',
      visible: c.ui.showClearContext,
      apply: clearContextAction,
    },
    withMcpIdle(c.state, [cooldownGate(c.state, 'clear_context', a.cooldownMs, c.t)], c.t),
  );
}

function lobstagramPost(c: Ctx): Move {
  const a = action('lobstagram_post');
  const buzzFull = (c.state.buzzMeter ?? 0) >= INVESTOR.buzzMax;
  return buildMove(
    {
      id: 'lobstagram_post',
      kind: 'action',
      actionId: 'lobstagram_post',
      visible: c.ui.showInvestor && !buzzFull,
      apply: lobstagramPostAction,
    },
    withMcpIdle(
      c.state,
      [
        boolGate(c.state.launched),
        boolGate(!buzzFull),
        cooldownGate(c.state, 'lobstagram_post', a.cooldownMs, c.t),
        tokenGate(c.state, a.tokenCost),
      ],
      c.t,
    ),
  );
}

function raiseRound(c: Ctx): Move {
  const hasRound = nextFundingRound(c.state) !== undefined;
  const ok = canRaise(c.state);
  return buildMove(
    {
      id: 'raise_round',
      kind: 'action',
      actionId: 'raise_round',
      visible: c.ui.showInvestor && hasRound,
      apply: raiseRoundAction,
    },
    withMcpIdle(c.state, [boolGate(ok)], c.t),
  );
}

function launch(c: Ctx): Move {
  // `showLaunchBtn` already requires `totalLoc >= LAUNCH_LOC` in `derive.ts`.
  const gates: Gate[] = withMcpIdle(
    c.state,
    [boolGate(!c.state.launched), boolGate(c.ui.showLaunchBtn)],
    c.t,
  );
  return buildMove(
    {
      id: 'launch',
      kind: 'action',
      actionId: 'launch',
      visible: c.ui.showLaunchBtn,
      apply: launchAction,
    },
    gates,
  );
}

function bugBounty(c: Ctx): Move {
  const a = action('bug_bounty');
  const gates: Gate[] = withMcpIdle(
    c.state,
    [
      boolGate(c.ui.showBugBounty),
      boolGate(c.state.bugs > 0),
      cooldownGate(c.state, 'bug_bounty', a.cooldownMs, c.t),
      tokenGate(c.state, a.tokenCost),
    ],
    c.t,
  );
  return buildMove(
    {
      id: 'bug_bounty',
      kind: 'action',
      actionId: 'bug_bounty',
      visible: c.ui.showBugBounty,
      apply: bugBountyAction,
    },
    gates,
  );
}

function newFreeAccount(c: Ctx): Move {
  const a = action('new_free_account');
  const visible =
    (c.state.totalTokensSpent ?? 0) >= c.thresholds.showNewFreeAccountTokens ||
    c.state.freeAccounts > 1;
  return buildMove(
    {
      id: 'new_free_account',
      kind: 'action',
      actionId: 'new_free_account',
      visible,
      apply: newFreeAccountAction,
    },
    withMcpIdle(c.state, [cooldownGate(c.state, 'free_account', a.cooldownMs, c.t)], c.t),
    { requireVisible: true, hideWaitWhenNotVisible: true },
  );
}

function buyGenMoves(c: Ctx): Move[] {
  return GENS.map((g) => {
    const owned = c.state.genCounts[g.id] ?? 0;
    const cost = genCost(g, owned);
    const visible =
      c.ui.showGenSection && c.state.totalLoc >= g.unlockAt * c.thresholds.generatorVisibleFraction;
    const visibleAt = g.unlockAt * c.thresholds.generatorVisibleFraction;
    return buildMove(
      {
        id: `buy_gen:${g.id}`,
        kind: 'buy_gen',
        target: g.id,
        visible,
        apply: (state: GameState) => buyGenAction(state, g.id),
      },
      withMcpIdle(c.state, [totalLocGate(c.state, visibleAt), locGate(c.state, cost)], c.t),
      { requireVisible: true },
    );
  });
}

function buyUpgradeMoves(c: Ctx): Move[] {
  return UPGRADES.map((u) => {
    const visible =
      c.ui.showUpgSection &&
      c.state.unlockedUpgrades.includes(u.id) &&
      !c.state.upgrades.includes(u.id);
    const owned = c.state.upgrades.includes(u.id);
    const gates: Gate[] = owned
      ? withMcpIdle(c.state, [boolGate(false)], c.t)
      : withMcpIdle(c.state, [boolGate(visible), locGate(c.state, u.cost)], c.t);
    return buildMove(
      {
        id: `buy_upgrade:${u.id}`,
        kind: 'buy_upgrade',
        target: u.id,
        visible,
        apply: (state: GameState) => buyUpgradeAction(state, u.id),
      },
      gates,
    );
  });
}

// ─── public API ────────────────────────────────────────────────────────────

export function moveTable(state: GameState, t: number = runtimeNow()): {
  byId: Record<string, Move>;
  all: Move[];
} {
  const { ui, thresholds } = deriveGame(state);
  const c: Ctx = { state, t, ui, thresholds };
  const all: Move[] = [
    prompt(c),
    pasteError(c),
    writeTest(c),
    kickAgent(c),
    runTests(c),
    clearContext(c),
    launch(c),
    lobstagramPost(c),
    raiseRound(c),
    mcpAllow(c),
    mcpDeny(c),
    bugBounty(c),
    newFreeAccount(c),
    ...buyGenMoves(c),
    ...buyUpgradeMoves(c),
  ];
  const byId: Record<string, Move> = {};
  for (const m of all) byId[m.id] = m;
  return { byId, all };
}

export function legalMoves(state: GameState, t: number = runtimeNow()): Move[] {
  return moveTable(state, t).all.filter((m) => m.visible && m.legal);
}

export function visibleMoves(state: GameState, t: number = runtimeNow()): Move[] {
  return moveTable(state, t).all.filter((m) => m.visible);
}

export function getMove(state: GameState, id: string, t: number = runtimeNow()): Move | undefined {
  return moveTable(state, t).byId[id];
}
