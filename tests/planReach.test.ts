import { describe, expect, it } from 'vitest';
import { extendChatBusyUntil, streamMsForNewEntries } from '../src/debug/planBusy';
import {
  applyPlanPrompt,
  goalRequiresLaunchFirst,
  planShortestPath,
} from '../src/debug/planReach';
import { defaultState } from '../src/game/state';
import { appendLog } from '../src/game/log';
import { setClock, resetClock } from '../src/game/runtime';

describe('planBusy', () => {
  it('sums streamMs for multi-line append', () => {
    setClock(() => 0);
    const prev = defaultState();
    const next = appendLog(prev, '> hi\nAI reply here', 'info');
    expect(streamMsForNewEntries(prev, next)).toBeGreaterThan(1000);
    resetClock();
  });

  it('extendChatBusyUntil stacks at same timestamp via max', () => {
    expect(extendChatBusyUntil(0, 100, 500)).toBe(600);
    expect(extendChatBusyUntil(800, 100, 500)).toBe(800);
  });
});

describe('goalRequiresLaunchFirst', () => {
  it('is true for post-launch upgrade goals from fresh state', () => {
    expect(
      goalRequiresLaunchFirst({ kind: 'upgrade', id: 'multi_agent' }, defaultState()),
    ).toBe(true);
    expect(goalRequiresLaunchFirst({ kind: 'upgrade', id: 'model_update_1' }, defaultState())).toBe(
      false,
    );
  });
});

describe('planShortestPath', () => {
  it('uses staged launch for post-launch goals', { timeout: 90_000 }, () => {
    const outcome = planShortestPath(
      { kind: 'upgrade', id: 'multi_agent' },
      { maxStates: 8000, maxTimeMs: 8 * 3_600_000, seed: 42, promptCostMult: 1 },
    );
    expect(outcome.stagedLaunch).toBe(true);
    expect(outcome.launchPhaseStatesVisited).toBeGreaterThan(0);
    expect(outcome.launchPhaseStatesVisited).toBeLessThan(outcome.statesVisited);
  });

  it('reaches model_update_1 or a strong frontier witness', { timeout: 120_000 }, () => {
    const outcome = planShortestPath(
      { kind: 'upgrade', id: 'model_update_1' },
      { maxStates: 40_000, maxTimeMs: 6 * 3_600_000, seed: 42 },
    );
    const steps = outcome.result?.steps ?? outcome.closest?.steps ?? [];
    expect(steps.length).toBeGreaterThan(0);
    const progress = outcome.result ? 1 : (outcome.closest?.progress.progress ?? 0);
    expect(progress).toBeGreaterThan(0.85);
  });

  it('reports closest frontier when search budget is tiny and best-effort is off', () => {
    const goal = { kind: 'upgrade' as const, id: 'revamp_status_page' };
    const outcome = planShortestPath(goal, {
      maxStates: 50,
      maxTimeMs: 60_000,
      seed: 42,
      acceptBestEffort: false,
      stagedLaunch: false,
    });
    expect(outcome.result).toBeNull();
    expect(outcome.closest).not.toBeNull();
    expect(outcome.closest!.progress.progress).toBeGreaterThan(0);
    expect(outcome.closest!.progress.label).toContain('revamp_status_page');
    expect(outcome.failureReason).not.toBeNull();
  });

  it('returns best-effort witness when search budget is tiny', () => {
    const goal = { kind: 'upgrade' as const, id: 'revamp_status_page' };
    const outcome = planShortestPath(goal, {
      maxStates: 200,
      maxTimeMs: 10 * 3_600_000,
      seed: 42,
      stagedLaunch: false,
    });
    expect(outcome.result).not.toBeNull();
    expect(outcome.result!.bestEffort).toBe(true);
    expect(outcome.result!.steps.length).toBeGreaterThan(0);
    expect(outcome.result!.progress).toBeGreaterThan(0.05);
    expect(outcome.failureReason).toBeNull();
    expect(outcome.closest).toBeNull();
  });

  it('reaches multi_agent or returns a strong best-effort witness', { timeout: 90_000 }, () => {
    const outcome = planShortestPath(
      { kind: 'upgrade', id: 'multi_agent' },
      { maxStates: 8000, maxTimeMs: 8 * 3_600_000, seed: 42, promptCostMult: 1 },
    );
    expect(outcome.result).not.toBeNull();
    if (outcome.result!.bestEffort) {
      expect(outcome.result!.progress).toBeGreaterThan(0.35);
    } else {
      expect(outcome.result!.steps.some((s) => s.moveId === 'launch')).toBe(true);
      expect(outcome.result!.steps.some((s) => s.target === 'multi_agent')).toBe(true);
    }
  });

  it('applyPlanPrompt is deterministic', () => {
    setClock(() => 10_000);
    const a = applyPlanPrompt(defaultState());
    const b = applyPlanPrompt(defaultState());
    expect(a.totalClicks).toBe(1);
    expect(b).toEqual(a);
    resetClock();
  });
});
