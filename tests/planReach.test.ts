import { describe, expect, it } from 'vitest';
import { extendChatBusyUntil, streamMsForNewEntries } from '../src/debug/planBusy';
import { appendLog } from '../src/game/log';
import {
  goalRequiresLaunchFirst,
  PLANNER_MIN_WAIT_DT_MS,
  plannerNextWaitDt,
  plannerWaitDeltas,
  planShortestPath,
} from '../src/debug/planReach';
import { visibleMoves } from '../src/game/availability';
import { promptAction } from '../src/game/actions';
import { defaultState } from '../src/game/state';
import { setClock, setRandom, resetClock, resetRandom } from '../src/game/runtime';
import { mulberry32 } from '../src/sim/Sim';

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

describe('planner graph', () => {
  it('next wait edge matches sim-style gate jump (≥2s)', () => {
    setClock(() => 0);
    const s = defaultState();
    const dt = plannerNextWaitDt(s, 0);
    expect(dt).toBeGreaterThanOrEqual(PLANNER_MIN_WAIT_DT_MS);
    expect(plannerWaitDeltas(s, 0)).toEqual([dt]);
    resetClock();
  });
});

describe('planShortestPath', () => {
  // TODO: planner needs smarter post-launch search before this is reliable (phase-2 goals).
  it.skip('uses staged launch for post-launch goals', () => {
    const outcome = planShortestPath(
      { kind: 'upgrade', id: 'multi_agent' },
      { maxStates: 8000, maxTimeMs: 8 * 3_600_000, seed: 42, promptCostMult: 1 },
    );
    expect(outcome.stagedLaunch).toBe(true);
    expect(outcome.launchPhaseStatesVisited).toBeGreaterThan(0);
    expect(outcome.launchPhaseStatesVisited).toBeLessThan(outcome.statesVisited);
  });

  it.skipIf(!process.env.RUN_PLAN_INTEGRATION)('fastest launch plan kicks agents', () => {
    const outcome = planShortestPath(
      { kind: 'launched' },
      { maxStates: 25_000, maxTimeMs: 20 * 60_000, seed: 42, promptCostMult: 1 },
    );
    const kicks = outcome.result?.steps.filter((s) => s.moveId === 'kick_agent').length ?? 0;
    expect(outcome.result, 'planner should reach launch').not.toBeNull();
    expect(kicks, 'optimal launch uses parallel subagent buffs').toBeGreaterThanOrEqual(2);
  });

  it.skipIf(!process.env.RUN_PLAN_INTEGRATION)('reaches model_update_1 or a strong frontier witness', () => {
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
    const goal = { kind: 'upgrade' as const, id: 'model_update_1' };
    const outcome = planShortestPath(goal, {
      maxStates: 800,
      maxTimeMs: 10 * 3_600_000,
      seed: 42,
      stagedLaunch: false,
    });
    expect(outcome.result).not.toBeNull();
    expect(outcome.result!.steps.length).toBeGreaterThan(0);
    if (outcome.result!.bestEffort) {
      expect(outcome.result!.progress).toBeGreaterThan(0.001);
      expect(outcome.closest).toBeNull();
    } else {
      expect(outcome.failureReason).toBeNull();
    }
  });

  it.skip('reaches multi_agent or returns a strong best-effort witness', () => {
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

  it('promptAction is deterministic under fixed clock and RNG', () => {
    setClock(() => 10_000);
    setRandom(mulberry32(42));
    const a = promptAction(defaultState());
    const b = promptAction(defaultState());
    expect(a.totalClicks).toBe(1);
    expect(b).toEqual(a);
    resetClock();
    resetRandom();
  });
});
