/**
 * MCP tool-call approval beats (mid chapter).
 * - `mcp_tools`: rolls after prompts; request shows as an in-scroll card (not log).
 * - `always_allow`: same card, auto-allows after a short beat, then execute spinner.
 * - `yolo_mode`: no beats, no card, no Allow/Deny.
 */

import type { GameState } from '../types';
import { MCP } from './constants';
import { appendLog, appendLogInstant } from './log';
import { withBugs } from './state';
import { computeFlags, hasFlag, type GameFlag } from './flags';
import { pick, render } from '../lib/template';
import { random } from './runtime';

/** Chance a post-prompt beat requests approval once MCP tools are owned. */
export const MCP_APPROVAL_CHANCE = 0.22;

const REQUEST_LINES = [
  'CallMcpTool\nserver: plugin-linear-linear\ntool: create_issue\nargs: { "title": "Fix flaky CI on main", "team": "ENG" }',
  'Shell\ncommand: npm run test -- --run tests/{{rand 2 9}}.test.ts',
  'Read\npath: .env.local\n({{rand 48 120}} lines — includes API keys)',
  'CallMcpTool\nserver: plugin-datadog-datadog\ntool: query_metrics\nargs: { "query": "avg:trace.errors{env:prod}", "from": "now-1h" }',
  'CallMcpTool\nserver: cursor-ide-browser\ntool: browser_navigate\nargs: { "url": "https://app.staging.internal/deployments" }',
  'Write\npath: src/config.ts\npreview: export const DEBUG = true; // temporary',
  'CallMcpTool\nserver: dashboard-team-1-Sentry\ntool: update_issue\nargs: { "id": "{{rand 100000 999999}}", "status": "resolved" }',
  'Shell\ncommand: git push origin main\n({{rand 3 24}} commits, {{rand 8 140}} files)',
];

const ALLOW_LINES = [
  'Approved. Tool finished; I have not summarized the output yet.',
  'Allowed — executing the MCP call now.',
];

const DENY_LINES = [
  'Denied. I will retry with a smaller scope.',
  'Skipped that tool call. Trying a different approach.',
];

/** Share of outstanding bugs cleared when blocking a risky tool call. */
const DENY_BUG_FIX_FRACTION = 0.12;

export function mcpToolsEnabled(flags: ReadonlySet<GameFlag>): boolean {
  return hasFlag(flags, 'mcp_tools');
}

/** YOLO mode — no approval beats, no card, no Allow/Deny. */
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

/** Prompt and other actions stay blocked while a card or execute spinner is active. */
export function mcpBlocksPlay(state: GameState, at: number = Date.now()): boolean {
  return mcpApprovalPending(state) || mcpExecuting(state, at);
}

export function clearMcpApproval(state: GameState): GameState {
  if (
    !mcpApprovalPending(state) &&
    state.mcpAutoApproveAt == null &&
    state.mcpExecutingUntil == null
  ) {
    return state;
  }
  return {
    ...state,
    mcpApprovalPending: null,
    mcpAutoApproveAt: null,
    mcpExecutingUntil: null,
    mcpExecutingLine: null,
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
  let next: GameState = {
    ...prev,
    mcpExecutingUntil: null,
    mcpExecutingLine: null,
  };
  next = appendLogInstant(next, render(pick(ALLOW_LINES)), 'info');
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
    next = startMcpExecution(next, at);
  }
  return next;
}

/** After a successful prompt, maybe start an approval beat. */
export function maybeMcpApprovalAfterPrompt(prev: GameState, next: GameState): GameState {
  if (mcpBlocksPlay(next)) return next;
  const flags = computeFlags(next.upgrades);
  if (!mcpToolsEnabled(flags) || mcpApprovalsSuppressed(flags)) return next;
  if (random() >= MCP_APPROVAL_CHANCE) return next;

  const line = render(pick(REQUEST_LINES));
  const at = Date.now();
  if (mcpAutoApproves(flags)) {
    return {
      ...next,
      mcpApprovalPending: line,
      mcpAutoApproveAt: at + MCP.autoApproveDelayMs,
      mcpExecutingUntil: null,
    };
  }

  return {
    ...next,
    mcpApprovalPending: line,
    mcpAutoApproveAt: null,
    mcpExecutingUntil: null,
  };
}

export function mcpAllowAction(prev: GameState): GameState {
  if (!mcpApprovalPending(prev) || mcpExecuting(prev)) return prev;
  return startMcpExecution(prev, Date.now());
}

export function mcpDenyAction(prev: GameState): GameState {
  if (!mcpApprovalPending(prev) || mcpExecuting(prev)) return prev;
  let next = clearMcpApproval(prev);
  next = appendLog(next, render(pick(DENY_LINES)), 'info');
  if (prev.bugs > 0) {
    const fixed = Math.max(1, Math.floor(prev.bugs * DENY_BUG_FIX_FRACTION));
    next = { ...next, ...withBugs(next, next.bugs - fixed) };
  }
  return next;
}
