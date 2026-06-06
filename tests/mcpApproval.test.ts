import { describe, expect, it, vi } from 'vitest';
import { buyUpgradeAction, promptAction } from '../src/game/actions';
import { computeFlags, hasFlag } from '../src/game/flags';
import { MCP } from '../src/game/constants';
import {
  advanceMcpTiming,
  maybeMcpApprovalAfterPrompt,
  mcpAllowAction,
  mcpAlwaysAllowAction,
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
import { MCP_TOOLS, mcpToolById } from '../src/game/data';
import { defaultState } from '../src/game/state';

describe('MCP approvals', () => {
  it('yolo_mode skips approval card and appends a tool log entry', () => {
    const flags = computeFlags(['mcp_tools', 'always_allow', 'yolo_mode']);
    expect(mcpToolsEnabled(flags)).toBe(true);
    expect(mcpApprovalsSuppressed(flags)).toBe(true);
    setRandom(() => 0);
    const prev = {
      ...defaultState(),
      upgrades: ['mcp_tools', 'always_allow', 'yolo_mode'],
      launched: true,
    };
    const next = maybeMcpApprovalAfterPrompt(prev, prev);
    expect(mcpApprovalPending(next)).toBe(false);
    expect(next.log).toHaveLength(1);
    expect(next.log[0]?.type).toBe('tool');
    expect(next.log[0]?.instant).toBe(true);
    expect(next.log[0]?.text).toMatch(/CallMcpTool|Shell|Read|Write/);
    expect(next.log[0]?.toolAck).toBeUndefined();
  });

  it('yolo beat does not block prompt', () => {
    setRandom(() => 0);
    const at = 2_000_000;
    const prev = {
      ...defaultState(),
      upgrades: ['mcp_tools', 'yolo_mode'],
      launched: true,
    };
    const next = maybeMcpApprovalAfterPrompt(prev, prev);
    expect(mcpBlocksPlay(next, at)).toBe(false);
    expect(getMove(next, 'prompt', at)!.legal).toBe(true);
    expect(getMove(next, 'mcp_allow', at)!.legal).toBe(false);
  });

  it('always_allow is not yolo — still rolls approval beats', () => {
    const flags = computeFlags(['mcp_tools', 'always_allow']);
    expect(mcpAutoApproves(flags)).toBe(true);
    expect(mcpApprovalsSuppressed(flags)).toBe(false);
  });

  it('always_allow shows manual card for safe and unsafe (no auto timer)', () => {
    setRandom(() => 0);
    const prev = {
      ...defaultState(),
      upgrades: ['mcp_tools', 'always_allow'],
      launched: true,
    };
    const safe = maybeMcpApprovalAfterPrompt(prev, prev);
    expect(mcpApprovalPending(safe)).toBe(true);
    expect(safe.mcpAutoApproveAt).toBeNull();
    expect(getMove(safe, 'mcp_always_allow', Date.now())!.legal).toBe(true);

    const usedSafe = {
      ...prev,
      usedEventIds: MCP_TOOLS.filter((t) => t.safe).map((t) => t.id),
    };
    setRandom(() => 0);
    const unsafe = maybeMcpApprovalAfterPrompt(usedSafe, usedSafe);
    expect(mcpApprovalPending(unsafe)).toBe(true);
    expect(unsafe.mcpAutoApproveAt).toBeNull();
    expect(getMove(unsafe, 'mcp_always_allow', Date.now())!.legal).toBe(true);
  });

  it('always allow on unsafe runs once like allow (no whitelist)', () => {
    const at = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(at);
    const prev = {
      ...defaultState(),
      loc: 60_000,
      upgrades: ['mcp_tools', 'always_allow'],
      mcpApprovalPending: 'Shell\ncommand: sudo rm -rf /',
      mcpActiveToolId: 'shell_rm_rf_root',
    };
    let allow = mcpAllowAction(prev);
    allow = advanceMcpTiming(allow, at + MCP.executeSpinnerMs);
    let always = mcpAlwaysAllowAction(prev);
    always = advanceMcpTiming(always, at + MCP.executeSpinnerMs);
    expect(allow.loc).toBe(30_000);
    expect(always.loc).toBe(30_000);
  });

  it('pending card omits Shell output until approved', () => {
    setRandom(() => 0);
    const prev = {
      ...defaultState(),
      upgrades: ['mcp_tools'],
      launched: true,
      usedEventIds: MCP_TOOLS.filter((t) => t.id !== 'shell_git_status').map((t) => t.id),
    };
    const next = maybeMcpApprovalAfterPrompt(prev, prev);
    expect(next.mcpApprovalPending).toContain('git status');
    expect(next.mcpApprovalPending).not.toMatch(/changed files/);
    const at = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(at);
    let done = mcpAllowAction(next);
    done = advanceMcpTiming(done, at + MCP.executeSpinnerMs);
    expect(done.log[0]?.text).toMatch(/changed files/);
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

  it('deny unsafe trims bugs', () => {
    const prev = {
      ...defaultState(),
      bugs: 40,
      mcpApprovalPending: 'Shell\ncommand: sudo rm -rf /',
      mcpActiveToolId: 'shell_rm_rf_root',
    };
    const next = mcpDenyAction(prev);
    expect(mcpApprovalPending(next)).toBe(false);
    expect(next.bugs).toBe(36);
  });

  it('deny safe does not change loc or bugs', () => {
    const prev = {
      ...defaultState(),
      loc: 12_000,
      totalLoc: 400_000,
      bugs: 10,
      mcpApprovalPending: 'Shell\ncommand: npm test',
      mcpActiveToolId: 'shell_npm_test',
    };
    const next = mcpDenyAction(prev);
    expect(next.loc).toBe(12_000);
    expect(next.totalLoc).toBe(400_000);
    expect(next.bugs).toBe(10);
  });

  it('allowing safe tool adds LOC', () => {
    const at = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(at);
    const prev = {
      ...defaultState(),
      loc: 5_000,
      totalLoc: 200_000,
      mcpApprovalPending: 'CallMcpTool\nserver: test',
      mcpActiveToolId: 'shell_npm_test',
    };
    let next = mcpAllowAction(prev);
    next = advanceMcpTiming(next, at + MCP.executeSpinnerMs);
    expect(next.loc).toBeGreaterThan(5_000);
    expect(next.totalLoc).toBeGreaterThan(200_000);
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

  it('yolo unsafe beat has no LOC leak or fallout log lines', () => {
    setRandom(() => 0);
    const prev = {
      ...defaultState(),
      loc: 100_000,
      totalLoc: 500_000,
      upgrades: ['mcp_tools', 'always_allow', 'yolo_mode'],
      launched: true,
      usedEventIds: MCP_TOOLS.filter((t) => t.safe).map((t) => t.id),
    };
    const next = maybeMcpApprovalAfterPrompt(prev, prev);
    expect(mcpApprovalPending(next)).toBe(false);
    expect(next.loc).toBe(100_000);
    expect(next.log).toHaveLength(1);
    expect(next.log[0]?.type).toBe('tool');
    expect(next.log[0]?.toolAck).toBeUndefined();
    expect(next.log.some((e) => e.text.includes('Data leak'))).toBe(false);
  });

  it('allowing unsafe tool leaks 50% of LOC buffer', () => {
    const at = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(at);
    const prev = {
      ...defaultState(),
      loc: 80_000,
      totalLoc: 200_000,
      mcpApprovalPending: 'Shell\ncommand: sudo rm -rf /',
      mcpActiveToolId: 'shell_rm_rf_root',
    };
    let next = mcpAllowAction(prev);
    next = advanceMcpTiming(next, at + MCP.executeSpinnerMs);
    expect(next.loc).toBe(40_000);
    expect(next.totalLoc).toBe(200_000);
    const leak = next.log.find((e) => e.text.includes('Data leak'));
    expect(leak?.type).toBe('bad');
    expect(next.log[0]?.toolAck).toMatch(/leak|exfil|off the machine|phoning home/i);
  });

  it('allowing safe tool adds LOC without leak log', () => {
    const at = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(at);
    const prev = {
      ...defaultState(),
      loc: 50_000,
      totalLoc: 50_000,
      mcpApprovalPending: 'CallMcpTool\nserver: test',
      mcpActiveToolId: 'shell_npm_test',
    };
    let next = mcpAllowAction(prev);
    next = advanceMcpTiming(next, at + MCP.executeSpinnerMs);
    expect(next.loc).toBeGreaterThan(prev.loc);
    expect(next.log.some((e) => e.text.includes('Data leak'))).toBe(false);
  });

  it('manual allow uses execute spinner then tool card in log', () => {
    const at = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(at);
    const prev = {
      ...defaultState(),
      mcpApprovalPending: 'CallMcpTool\nserver: test',
      mcpActiveToolId: 'shell_npm_test',
    };
    let next = mcpAllowAction(prev);
    expect(mcpApprovalPending(next)).toBe(false);
    expect(next.mcpActiveToolId).toBe('shell_npm_test');
    expect(next.mcpExecutingUntil).toBe(at + MCP.executeSpinnerMs);
    next = advanceMcpTiming(next, at + MCP.executeSpinnerMs);
    expect(mcpExecuting(next, at + MCP.executeSpinnerMs)).toBe(false);
    const tool = next.log[next.log.length - 1];
    expect(tool?.type).toBe('tool');
    expect(tool?.instant).toBe(true);
    expect(tool?.toolAck).toMatch(/tests green|one flake/i);
  });

  it('deny uses per-tool onDeny line', () => {
    setRandom(() => 0);
    const prev = {
      ...defaultState(),
      bugs: 10,
      mcpApprovalPending: 'Shell command: sudo rm -rf /',
      mcpActiveToolId: 'shell_rm_rf_root',
    };
    const next = mcpDenyAction(prev);
    expect(next.log[next.log.length - 1]?.text).toMatch(/no|ok/i);
    expect(next.bugs).toBeLessThan(10);
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
    expect(getMove(state, 'mcp_always_allow', t)!.legal).toBe(false);
  });

  it('mcp_always_allow legal only with always_allow upgrade', () => {
    const state = {
      ...defaultState(),
      upgrades: ['mcp_tools', 'always_allow'],
      mcpApprovalPending: 'CallMcpTool\nserver: test',
    };
    const t = Date.now();
    expect(getMove(state, 'mcp_always_allow', t)!.legal).toBe(true);
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
