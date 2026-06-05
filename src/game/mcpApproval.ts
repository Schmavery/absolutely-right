/**
 * MCP tool-call approval beats (mid chapter).
 * - `mcp_tools`: rolls after prompts; pending request shows as an in-scroll approval card.
 * - `always_allow`: deny / allow / always allow on every card; unsafe always-allow is one-time.
 * - `yolo_mode`: no approval card; tool cards only (no ack line, no LOC leak).
 */

import type { GameState, McpToolDef } from '../types';
import { MCP } from './constants';
import { MCP_TOOLS, MCP_UNSAFE_ALLOW_LEAK_ACK, mcpToolById, mcpToolIsSafe } from './data';
import { fmt } from '../lib/format';
import { appendLog, appendMcpToolLog } from './log';
import { withBugs } from './state';
import { computeFlags, hasFlag, type GameFlag } from './flags';
import { formatMcpToolCall } from '../lib/formatMcpTool';
import { markIdUsed, markMessageUsed, pickUnused, pickUnusedById } from '../lib/messageKey';
import { render } from '../lib/template';
import { random } from './runtime';

/** Chance a post-prompt beat requests approval once MCP tools are owned. */
export const MCP_APPROVAL_CHANCE = 0.22;

/** Share of outstanding bugs cleared when blocking a risky tool call. */
const DENY_BUG_FIX_FRACTION = 0.12;

/** YOLO skips LOC leak, leak log, and per-tool `onAllow` ack under the card. */
function mcpYoloSilencesFallout(flags: ReadonlySet<GameFlag>): boolean {
  return hasFlag(flags, 'yolo_mode');
}

function unsafeAllowLocLeak(prev: GameState): number {
  if (prev.loc <= 0) return 0;
  return Math.floor(prev.loc * MCP.unsafeAllowLocLeakFraction);
}

function safeAllowLocGain(prev: GameState): number {
  return Math.max(
    MCP.safeAllowLocMin,
    Math.floor(prev.totalLoc * MCP.safeAllowLocFraction),
  );
}

function applySafeAllowReward(prev: GameState): GameState {
  const gain = safeAllowLocGain(prev);
  return {
    ...prev,
    loc: prev.loc + gain,
    totalLoc: prev.totalLoc + gain,
  };
}

function applyUnsafeAllowPenalty(prev: GameState, def: McpToolDef): GameState {
  if (def.safe) return prev;
  const leaked = unsafeAllowLocLeak(prev);
  if (leaked <= 0) return prev;
  return { ...prev, loc: Math.max(0, prev.loc - leaked) };
}

function appendUnsafeLeakLog(prev: GameState, def: McpToolDef, leaked: number): GameState {
  if (def.safe || leaked <= 0) return prev;
  const pct = Math.round(MCP.unsafeAllowLocLeakFraction * 100);
  return appendLog(
    prev,
    `Data leak after that tool call. −${fmt(leaked)} LOC (${pct}% of your buffer).`,
    'info',
  );
}

/** Persist an approved tool: card only in YOLO; ack + unsafe fallout otherwise. */
function finalizeApprovedToolLog(prev: GameState, toolText: string, def: McpToolDef): GameState {
  const flags = computeFlags(prev.upgrades);
  if (mcpYoloSilencesFallout(flags)) {
    let next = appendMcpToolLog(prev, toolText);
    if (def.safe) next = applySafeAllowReward(next);
    return next;
  }
  const { ack, state } = buildAllowAck(prev, def);
  if (!def.safe) {
    const leaked = unsafeAllowLocLeak(prev);
    let next = applyUnsafeAllowPenalty(state, def);
    next = appendMcpToolLog(next, toolText, ack);
    return appendUnsafeLeakLog(next, def, leaked);
  }
  let next = appendMcpToolLog(state, toolText, ack);
  return applySafeAllowReward(next);
}

/** `always_allow` never schedules auto-approve for `safe: false` tools. */
export function mcpMayAutoApprove(def: McpToolDef, flags: ReadonlySet<GameFlag>): boolean {
  return mcpAutoApproves(flags) && def.safe;
}

/** Pending card + execute spinner — no Shell/Write `output` yet. */
function renderToolLine(def: McpToolDef): string {
  return formatMcpToolCall(def, (s) => render(s));
}

/** Approved log card — includes post-run `output` when defined. */
function renderApprovedToolLine(def: McpToolDef): string {
  return formatMcpToolCall(def, (s) => render(s), { includeOutput: true });
}

function buildAllowAck(
  prev: GameState,
  def: McpToolDef,
): { ack: string; state: GameState } {
  let ack = render(def.onAllow);
  let state = prev;
  if (def.safe || mcpYoloSilencesFallout(computeFlags(prev.upgrades))) {
    return { ack, state };
  }
  const leakLine = pickUnused(MCP_UNSAFE_ALLOW_LEAK_ACK, state.usedEventIds);
  if (leakLine) {
    ack = `${ack}\n${render(leakLine)}`;
    state = { ...state, usedEventIds: markMessageUsed(state, leakLine) };
  }
  return { ack, state };
}

function denyLineFor(def: McpToolDef): string | undefined {
  return def.onDeny ? render(def.onDeny) : undefined;
}

function pickToolBeat(prev: GameState): { next: GameState; def?: McpToolDef } {
  const def = pickUnusedById(MCP_TOOLS, prev.usedEventIds);
  if (!def) return { next: prev };
  return { next: { ...prev, usedEventIds: markIdUsed(prev, def.id) }, def };
}

export function mcpToolsEnabled(flags: ReadonlySet<GameFlag>): boolean {
  return hasFlag(flags, 'mcp_tools');
}

/** YOLO mode — no approval card, Allow/Deny, or execute spinner. */
export function mcpApprovalsSuppressed(flags: ReadonlySet<GameFlag>): boolean {
  return hasFlag(flags, 'yolo_mode');
}

export function mcpAutoApproves(flags: ReadonlySet<GameFlag>): boolean {
  return hasFlag(flags, 'mcp_auto_approve');
}

export function mcpApprovalPending(state: GameState): boolean {
  return state.mcpApprovalPending != null && state.mcpApprovalPending !== '';
}

export function mcpExecuting(state: GameState, at: number = Date.now()): boolean {
  const until = state.mcpExecutingUntil;
  return until != null && until > at;
}

/** Prompt and other actions stay blocked while a manual/auto card or execute spinner is active. */
export function mcpBlocksPlay(state: GameState, at: number = Date.now()): boolean {
  if (mcpExecuting(state, at)) return true;
  if (!mcpApprovalPending(state)) return false;
  return !mcpApprovalsSuppressed(computeFlags(state.upgrades));
}

export function clearMcpApproval(state: GameState): GameState {
  if (
    !mcpApprovalPending(state) &&
    state.mcpAutoApproveAt == null &&
    state.mcpExecutingUntil == null &&
    state.mcpActiveToolId == null
  ) {
    return state;
  }
  return {
    ...state,
    mcpApprovalPending: null,
    mcpAutoApproveAt: null,
    mcpExecutingUntil: null,
    mcpExecutingLine: null,
    mcpActiveToolId: null,
  };
}

function startMcpExecution(prev: GameState, at: number): GameState {
  const line = prev.mcpApprovalPending ?? '';
  return {
    ...prev,
    mcpApprovalPending: null,
    mcpAutoApproveAt: null,
    mcpExecutingUntil: at + MCP.executeSpinnerMs,
    mcpExecutingLine: line,
  };
}

function finishMcpExecution(prev: GameState): GameState {
  const def = prev.mcpActiveToolId ? mcpToolById(prev.mcpActiveToolId) : undefined;
  let next: GameState = {
    ...prev,
    mcpExecutingUntil: null,
    mcpExecutingLine: null,
    mcpActiveToolId: null,
  };
  if (def) return finalizeApprovedToolLog(next, renderApprovedToolLine(def), def);
  return next;
}

/** Advance auto-allow and post-approve spinner; call from `tickReducer`. */
export function advanceMcpTiming(prev: GameState, at: number = Date.now()): GameState {
  let next = prev;
  if (next.mcpExecutingUntil != null && at >= next.mcpExecutingUntil) {
    next = finishMcpExecution(next);
  }
  if (
    mcpApprovalPending(next) &&
    next.mcpAutoApproveAt != null &&
    at >= next.mcpAutoApproveAt &&
    !mcpExecuting(next, at)
  ) {
    const def = next.mcpActiveToolId ? mcpToolById(next.mcpActiveToolId) : undefined;
    const flags = computeFlags(next.upgrades);
    if (def && mcpMayAutoApprove(def, flags)) {
      next = startMcpExecution(next, at);
    } else {
      next = { ...next, mcpAutoApproveAt: null };
    }
  }
  return next;
}

/** After a successful prompt, maybe start an approval beat. */
export function maybeMcpApprovalAfterPrompt(prev: GameState, next: GameState): GameState {
  if (mcpBlocksPlay(next)) return next;
  const flags = computeFlags(next.upgrades);
  if (!mcpToolsEnabled(flags)) return next;
  if (random() >= MCP_APPROVAL_CHANCE) return next;

  const picked = pickToolBeat(next);
  if (!picked.def) return picked.next;
  next = picked.next;
  const def = picked.def;
  const line = renderToolLine(def);

  if (mcpApprovalsSuppressed(flags)) {
    return finalizeApprovedToolLog(next, renderApprovedToolLine(def), def);
  }

  return {
    ...next,
    mcpApprovalPending: line,
    mcpActiveToolId: def.id,
    mcpAutoApproveAt: null,
    mcpExecutingUntil: null,
  };
}

export function mcpAllowAction(prev: GameState): GameState {
  if (!mcpApprovalPending(prev) || mcpExecuting(prev)) return prev;
  return startMcpExecution(prev, Date.now());
}

/** Same execution as Allow; unsafe tools are never added to a persistent allowlist. */
export function mcpAlwaysAllowAction(prev: GameState): GameState {
  return mcpAllowAction(prev);
}

export function mcpDenyAction(prev: GameState): GameState {
  if (!mcpApprovalPending(prev) || mcpExecuting(prev)) return prev;
  const def = prev.mcpActiveToolId ? mcpToolById(prev.mcpActiveToolId) : undefined;
  let next = clearMcpApproval(prev);
  const deny = def ? denyLineFor(def) : undefined;
  if (deny) next = appendLog(next, deny, 'info');
  if (def && !def.safe && prev.bugs > 0) {
    const fixed = Math.max(1, Math.floor(prev.bugs * DENY_BUG_FIX_FRACTION));
    next = { ...next, ...withBugs(next, next.bugs - fixed) };
  }
  return next;
}
