/**
 * MCP tool-call approval beats (mid chapter). `mcp_tools` enables rolls after
 * prompts; `always_allow` auto-approves without blocking; `yolo_mode` skips
 * approvals entirely (no prompt, no Allow/Deny).
 */

import type { GameState } from '../types';
import { appendLog } from './log';
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

const AUTO_ALLOW_LINES = [
  'Tool call auto-approved (always-allow policy). Running it now.',
  'Skipping the approval card — always-allow is enabled for MCP tools.',
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

/** YOLO mode — no approval beats, no Allow/Deny UI. */
export function mcpApprovalsSuppressed(flags: ReadonlySet<GameFlag>): boolean {
  return hasFlag(flags, 'yolo_mode');
}

export function mcpAutoApproves(flags: ReadonlySet<GameFlag>): boolean {
  return hasFlag(flags, 'mcp_auto_approve');
}

export function mcpApprovalPending(state: GameState): boolean {
  return state.mcpApprovalPending != null && state.mcpApprovalPending !== '';
}

export function clearMcpApproval(state: GameState): GameState {
  if (!mcpApprovalPending(state)) return state;
  return { ...state, mcpApprovalPending: null };
}

/** After a successful prompt, maybe start an approval beat. */
export function maybeMcpApprovalAfterPrompt(prev: GameState, next: GameState): GameState {
  if (mcpApprovalPending(next)) return next;
  const flags = computeFlags(next.upgrades);
  if (!mcpToolsEnabled(flags) || mcpApprovalsSuppressed(flags)) return next;
  if (random() >= MCP_APPROVAL_CHANCE) return next;

  const line = render(pick(REQUEST_LINES));
  if (mcpAutoApproves(flags)) {
    const ack = render(pick(AUTO_ALLOW_LINES));
    return appendLog(appendLog(next, line, 'event'), ack, 'info');
  }

  return { ...next, mcpApprovalPending: line };
}

export function mcpAllowAction(prev: GameState): GameState {
  if (!mcpApprovalPending(prev)) return prev;
  let next = clearMcpApproval(prev);
  next = appendLog(next, render(pick(ALLOW_LINES)), 'info');
  return next;
}

export function mcpDenyAction(prev: GameState): GameState {
  if (!mcpApprovalPending(prev)) return prev;
  let next = clearMcpApproval(prev);
  next = appendLog(next, render(pick(DENY_LINES)), 'info');
  if (prev.bugs > 0) {
    const fixed = Math.max(1, Math.floor(prev.bugs * DENY_BUG_FIX_FRACTION));
    next = { ...next, ...withBugs(next, next.bugs - fixed) };
  }
  return next;
}
