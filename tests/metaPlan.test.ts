import { afterEach, describe, expect, it } from 'vitest';
import {
  clearMetaPlanCaches,
  metaPlanShortestPath,
  metaPlanBot,
  metaStateKey,
  metaTargets,
  solveCruiseSegment,
} from '../src/debug/metaPlan';
import { UPGRADES } from '../src/game/data';
import { defaultState } from '../src/game/state';
import { setClock, resetClock } from '../src/game/runtime';
import { Sim } from '../src/sim/Sim';
import { runUntilGoalMs } from '../src/debug/optLoop';

afterEach(() => {
  Sim.teardown();
  resetClock();
  clearMetaPlanCaches();
});

describe('metaPlan', () => {
  it('metaStateKey ignores loc/tok but tracks shop unlocks', () => {
    const a = defaultState();
    const b = { ...a, loc: 999, tokens: 50 };
    expect(metaStateKey(a)).toBe(metaStateKey(b));
    const c = { ...a, unlockedUpgrades: ['model_update_1'] };
    expect(metaStateKey(c)).not.toBe(metaStateKey(a));
  });

  it('offers shop-unlock and purchase metatargets from fresh state', () => {
    setClock(() => 0);
    const s = defaultState();
    const targets = metaTargets(s, 0, { kind: 'launched' });
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.some((x) => x.tag === 'shopUnlock')).toBe(true);
  });

  it('launched goal uses frontier shop unlocks, not a hardcoded upgrade list', () => {
    setClock(() => 0);
    const s = defaultState();
    const targets = metaTargets(s, 0, { kind: 'launched' });
    const unlocks = targets
      .filter((x) => x.tag === 'shopUnlock')
      .map((x) => (x as { tag: 'shopUnlock'; upgradeId: string }).upgradeId);
    expect(unlocks.length).toBeGreaterThanOrEqual(1);
    for (const id of unlocks) {
      const u = UPGRADES.find((x) => x.id === id);
      expect(u?.requiresLaunch).toBeFalsy();
    }
  });

  it('solveCruiseSegment unlocks shop entry', () => {
    setClock(() => 0);
    const s = defaultState();
    const unlock = metaTargets(s, 0, { kind: 'launched' }).find(
      (x) => x.tag === 'shopUnlock',
    )!;
    const seg = solveCruiseSegment(s, 0, unlock, 42, { budgetMs: 30 * 60_000 });
    expect(seg?.ok).toBe(true);
    expect(seg!.endState.unlockedUpgrades.length).toBeGreaterThan(0);
  });
});

/** Full metaplan launch path — `RUN_METAPLAN_INTEGRATION=1 npm run test:metaplan` */
describe.skipIf(!process.env.RUN_METAPLAN_INTEGRATION)('metaPlan integration', () => {
  it('metaPlan reaches launch', () => {
    const plan = metaPlanShortestPath(
      { kind: 'launched' },
      {
        seed: 42,
        maxMetaStates: 30,
        maxMetaBranches: 6,
        maxTimeMs: 25 * 60_000,
        maxCruiseMs: 25 * 60_000,
      },
    );
    expect(plan).not.toBeNull();
    expect(plan!.truncated).toBe(false);
    expect(plan!.endState.launched).toBe(true);
  });

  it('metaPlanBot reaches launch in sim', () => {
    const run = runUntilGoalMs(
      42,
      metaPlanBot(
        { kind: 'launched' },
        {
          seed: 42,
          maxMetaStates: 30,
          maxMetaBranches: 6,
          maxTimeMs: 25 * 60_000,
        },
      ),
      { kind: 'launched' },
      30 * 60_000,
    );
    expect(run.final.launched).toBe(true);
    expect(run.goalT).not.toBeNull();
  });
});
