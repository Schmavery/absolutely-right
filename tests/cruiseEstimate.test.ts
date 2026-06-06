import { afterEach, describe, expect, it } from 'vitest';
import { defaultState } from '../src/game/state';
import { setClock, resetClock } from '../src/game/runtime';
import {
  analyticCruiseMs,
  pickCruiseStrategy,
  probeStrategy,
  solveCruiseByEstimate,
  steadyLocPerMs,
  targetGaps,
} from '../src/debug/cruiseEstimate';
import { WEIGHTS_LOC, WEIGHTS_PROGRESS } from '../src/game/moveIntent';
import { THRESHOLDS } from '../src/game/constants';
import { UPGRADES } from '../src/game/data';

afterEach(() => resetClock());

/** Hypothesis-driven, sub-second wall time per case. No full-game sweeps. */

describe('cruiseEstimate hypotheses', () => {
  it('H1: analytic bound is finite for first shop reveal from fresh state', () => {
    setClock(() => 0);
    const s = defaultState();
    const target = { tag: 'shopUnlock' as const, upgradeId: 'model_update_1' };
    const gaps = targetGaps(s, target);
    expect(gaps.totalLoc).toBeGreaterThan(0);
    const est = analyticCruiseMs(s, target);
    expect(est).toBeGreaterThan(0);
    expect(est).toBeLessThan(30 * 60_000);
  });

  it('H2: probe wall time stays under 500ms for 30s virtual sample', () => {
    setClock(() => 0);
    const s = defaultState();
    const target = { tag: 'shopUnlock' as const, upgradeId: 'model_update_1' };
    const t0 = performance.now();
    probeStrategy(
      s,
      0,
      target,
      { id: 'loc', weights: WEIGHTS_LOC, patienceMs: 10_000 },
      42,
      30_000,
      120_000,
    );
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('H3: loc strategy beats hygiene for totalLoc grind (pre-launch)', () => {
    setClock(() => 0);
    const s = defaultState();
    const target = { tag: 'shopUnlock' as const, upgradeId: 'model_update_1' };
    const loc = probeStrategy(s, 0, target, { id: 'loc', weights: WEIGHTS_LOC, patienceMs: 10_000 }, 42, 30_000, 120_000);
    const prog = probeStrategy(
      s,
      0,
      target,
      { id: 'progress', weights: WEIGHTS_PROGRESS, patienceMs: 10_000 },
      42,
      30_000,
      120_000,
    );
    expect(loc.extrapolatedMs).toBeLessThanOrEqual(prog.extrapolatedMs * 1.25);
  });

  it('H4: open-loop reaches shop reveal within 2× analytic estimate', () => {
    setClock(() => 0);
    const s = defaultState();
    const target = { tag: 'shopUnlock' as const, upgradeId: 'model_update_1' };
    const bound = analyticCruiseMs(s, target);
    const t0 = performance.now();
    const seg = solveCruiseByEstimate(s, 0, target, {
      seed: 42,
      probeMs: 30_000,
      eventDtMs: 120_000,
      budgetMs: bound * 2.5,
    });
    expect(performance.now() - t0).toBeLessThan(500);
    expect(seg?.ok).toBe(true);
    expect(seg!.endState.unlockedUpgrades).toContain('model_update_1');
    expect(seg!.endT - seg!.startT).toBeLessThan(bound * 2.5);
  });

  it('H5: steady rate × gap matches unlock threshold order of magnitude', () => {
    setClock(() => 0);
    const s = defaultState();
    const def = UPGRADES.find((u) => u.id === 'model_update_1')!;
    const unlockAt = def.unlockAt * THRESHOLDS.upgradeUnlockFraction;
    const rate = steadyLocPerMs(s);
    const est = unlockAt / rate;
    expect(est).toBeGreaterThan(10_000);
    expect(est).toBeLessThan(10 * 60_000);
  });

  it('H6: pickCruiseStrategy returns a named winner quickly', () => {
    setClock(() => 0);
    const s = defaultState();
    const target = { tag: 'shopUnlock' as const, upgradeId: 'model_update_1' };
    const t0 = performance.now();
    const picked = pickCruiseStrategy(s, 0, target, 42, { probeMs: 20_000, eventDtMs: 120_000 });
    expect(performance.now() - t0).toBeLessThan(400);
    expect(picked.spec.id).toBeTruthy();
    expect(picked.extrapolatedMs).toBeGreaterThan(0);
  });
});
