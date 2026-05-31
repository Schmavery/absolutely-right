import { describe, expect, it, vi } from 'vitest';
import { buyUpgradeAction, promptAction } from '../src/game/actions';
import { computeFlags, hasFlag } from '../src/game/flags';
import { MCP } from '../src/game/constants';
import {
  advanceMcpTiming,
  maybeMcpApprovalAfterPrompt,
  mcpAllowAction,
  mcpApprovalPending,
  mcpApprovalsSuppressed,
  mcpAutoApproves,
  mcpBlocksPlay,
  mcpDenyAction,
  mcpExecuting,
  mcpToolsEnabled,
} from '../src/game/mcpApproval';
import { setRandom } from '../src/game/runtime';
import { getMove, rechargeProgress } from '../src/game/availability';
import { defaultState } from '../src/game/state';

describe('MCP approvals', () => {
  it('yolo_mode suppresses approval rolls', () => {
    const flags = computeFlags(['mcp_tools', 'always_allow', 'yolo_mode']);
    expect(mcpToolsEnabled(flags)).toBe(true);
    expect(mcpApprovalsSuppressed(flags)).toBe(true);
  });

  it('always_allow is not yolo — still rolls approval beats', () => {
    const flags = computeFlags(['mcp_tools', 'always_allow']);
    expect(mcpAutoApproves(flags)).toBe(true);
    expect(mcpApprovalsSuppressed(flags)).toBe(false);
  });

  it('always_allow queues card + auto-approve schedule (no immediate log)', () => {
    setRandom(() => 0);
    const prev = {
      ...defaultState(),
      upgrades: ['mcp_tools', 'always_allow'],
      launched: true,
    };
    const next = maybeMcpApprovalAfterPrompt(prev, prev);
    expect(mcpApprovalPending(next)).toBe(true);
    expect(next.mcpAutoApproveAt).not.toBeNull();
    expect(next.log.length).toBe(prev.log.length);
  });

  it('pending approval does not append the request to the log', () => {
    setRandom(() => 0);
    const prev = {
      ...defaultState(),
      upgrades: ['mcp_tools'],
      launched: true,
    };
    const next = maybeMcpApprovalAfterPrompt(prev, prev);
    expect(mcpApprovalPending(next)).toBe(true);
    expect(next.log.length).toBe(prev.log.length);
    expect(next.mcpApprovalPending).toBeTruthy();
  });

  it('deny clears pending and trims bugs', () => {
    const prev = {
      ...defaultState(),
      bugs: 40,
      mcpApprovalPending: 'Allow deploy?',
    };
    const next = mcpDenyAction(prev);
    expect(mcpApprovalPending(next)).toBe(false);
    expect(next.bugs).toBeLessThan(prev.bugs);
    expect(next.bugs).toBe(36);
  });

  it('omits recharge bar when bool-gated but keeps it on cooldown', () => {
    const t = 1_000_000;
    const onCooldown = {
      ...defaultState(),
      started: true,
      actionCooldowns: { prompt: t - 500 },
    };
    const cooling = getMove(onCooldown, 'prompt', t)!;
    expect(cooling.legal).toBe(false);
    const p = rechargeProgress(cooling);
    expect(p).toBeDefined();
    expect(p!).toBeGreaterThan(0);
    expect(p!).toBeLessThan(1);

    const mcpBlocked = {
      ...onCooldown,
      upgrades: ['mcp_tools'],
      mcpApprovalPending: 'CallMcpTool\nserver: test',
    };
    expect(rechargeProgress(getMove(mcpBlocked, 'prompt', t)!)).toBeUndefined();
  });

  it('blocks prompt while MCP execute spinner runs', () => {
    const at = 50_000;
    const state = {
      ...defaultState(),
      launched: true,
      upgrades: ['mcp_tools'],
      mcpExecutingUntil: at + MCP.executeSpinnerMs,
      mcpExecutingLine: 'Shell\ncommand: rm -rf /',
    };
    expect(mcpExecuting(state, at)).toBe(true);
    expect(mcpBlocksPlay(state, at)).toBe(true);
    expect(getMove(state, 'prompt', at)!.legal).toBe(false);
    expect(getMove(state, 'mcp_allow', at)!.legal).toBe(false);
  });

  it('manual allow uses execute spinner then instant ack in log', () => {
    const at = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(at);
    const prev = {
      ...defaultState(),
      mcpApprovalPending: 'CallMcpTool\nserver: test',
    };
    let next = mcpAllowAction(prev);
    expect(mcpApprovalPending(next)).toBe(false);
    expect(next.mcpExecutingUntil).toBe(at + MCP.executeSpinnerMs);
    next = advanceMcpTiming(next, at + MCP.executeSpinnerMs);
    expect(mcpExecuting(next, at + MCP.executeSpinnerMs)).toBe(false);
    const ack = next.log[next.log.length - 1];
    expect(ack?.instant).toBe(true);
    expect(ack?.text.length).toBeGreaterThan(0);
  });

  it('blocks all player actions except allow/deny while approval pending', () => {
    const state = {
      ...defaultState(),
      loc: 50_000,
      totalLoc: 50_000,
      bugs: 5,
      tests: 3,
      tokens: 100,
      upgrades: ['mcp_tools'],
      launched: true,
      mcpApprovalPending: 'CallMcpTool\nserver: test',
    };
    const t = Date.now();
    expect(getMove(state, 'prompt', t)!.legal).toBe(false);
    expect(getMove(state, 'paste_error', t)!.legal).toBe(false);
    expect(getMove(state, 'run_tests', t)!.legal).toBe(false);
    expect(getMove(state, 'mcp_allow', t)!.legal).toBe(true);
    expect(getMove(state, 'mcp_deny', t)!.legal).toBe(true);
  });

  it('clears pending when yolo_mode purchased', () => {
    let state = {
      ...defaultState(),
      loc: 5_000_000,
      upgrades: ['mcp_tools', 'always_allow'],
      unlockedUpgrades: ['yolo_mode'],
      mcpApprovalPending: 'pending',
    };
    state = buyUpgradeAction(state, 'yolo_mode');
    expect(mcpApprovalPending(state)).toBe(false);
    expect(hasFlag(computeFlags(state.upgrades), 'yolo_mode')).toBe(true);
  });
});

describe('prompt + MCP (smoke)', () => {
  it('does not throw with mcp_tools owned', () => {
    const prev = {
      ...defaultState(),
      totalClicks: 10,
      upgrades: ['mcp_tools'],
      launched: true,
    };
    const next = promptAction(prev);
    expect(next.totalClicks).toBe(prev.totalClicks + 1);
  });
});
