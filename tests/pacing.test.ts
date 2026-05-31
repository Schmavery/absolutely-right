/**
 * Pacing invariants. These are the deliberately small, high-signal
 * properties:
 *
 *   1. Termination — long bot runs finish in bounded wall-clock time
 *      (vitest's per-test timeout would otherwise let an infinite-loop
 *      manifest as a hang, but we tighten the bar here with explicit
 *      virtual-budget vs wall-clock asserts).
 *   2. Forward progress — under non-trivial policies, the player's
 *      `totalLoc` actually grows. A regression that softlocks the
 *      economy fails this immediately.
 *   3. Outlier waits — early-game players never face a state where the
 *      cheapest forecastable next move is hours away. This catches
 *      pricing/unlock pathology on YAML edits.
 *
 * Driver: event-driven only. `tests/equivalence.test.ts` pins fixed-tick
 * `Sim.run` (production-cadence parity with `Game.tsx`) to event-driven
 * `Sim.runEventDriven`, so anything that holds for one driver under
 * passive ticks holds for the other. Bot-driven pacing only needs the
 * faster driver.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Sim, type Bot } from '../src/sim/Sim';
import { greedyPlayer } from '../src/sim/bots';
import { moveTable } from '../src/game/availability';

afterEach(() => Sim.teardown());

// A small seed set keeps these tests under a few seconds in CI without
// sacrificing failure-surface coverage — invariants.test.ts already
// drives the wider seed list.
const SEEDS = [1, 7, 42];

const VIRTUAL_BUDGET_MS = 10 * 60_000; // 10 virtual minutes
const EARLY_GAME_MS = 5 * 60_000;
const HUGE_WAIT_MS = 5 * 60_000;       // anything cheaper than 5 virtual min is fine

/** Bot factories — fresh internal state per run for stateful policies. */
const BOTS: ReadonlyArray<readonly [string, () => Bot]> = [['greedy', () => greedyPlayer]];

// ─── 1. termination ────────────────────────────────────────────────────────

describe('pacing: termination', () => {
  // Event-driven advances 10 virtual min in dozens of reducer calls;
  // 1.5s gives plenty of headroom even on a slow CI box.
  const WALL_CAP_MS = 1_500;

  for (const [botName, makeBot] of BOTS) {
    for (const seed of SEEDS) {
      it(`${botName}/seed=${seed}: 10 virtual min finishes in bounded wall-clock`, () => {
        const sim = new Sim({ seed });
        const start = performance.now();
        sim.runEventDriven(makeBot(), VIRTUAL_BUDGET_MS);
        const elapsed = performance.now() - start;
        expect(elapsed, `wall-clock ${elapsed.toFixed(0)}ms`).toBeLessThan(WALL_CAP_MS);
        expect(sim.t).toBeGreaterThanOrEqual(VIRTUAL_BUDGET_MS);
      });
    }
  }
});

// ─── 2. forward progress ───────────────────────────────────────────────────

describe('pacing: forward progress', () => {
  for (const [botName, makeBot] of BOTS) {
    for (const seed of SEEDS) {
      it(`${botName}/seed=${seed}: totalLoc grows over the run`, () => {
        const sim = new Sim({ seed });
        sim.runEventDriven(makeBot(), VIRTUAL_BUDGET_MS);
        // A 10-virtual-minute run from default state under any active
        // policy should comfortably accumulate `LAUNCH_LOC`-class
        // numbers; we use a far weaker bar (1k) so this fails only on
        // real softlocks, not balance retunes.
        expect(sim.state.totalLoc).toBeGreaterThan(1_000);
      });
    }
  }
});

// ─── 3. outlier waits (early game) ─────────────────────────────────────────

describe('pacing: outlier waits', () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}: early-game player always has a sub-${HUGE_WAIT_MS / 60_000}min forecastable next step`, () => {
      const sim = new Sim({ seed, recordTrace: true });
      sim.runEventDriven(greedyPlayer, EARLY_GAME_MS);

      let worst = { t: 0, value: 0, moveId: '' as string | null };
      for (const { state, t } of sim.trace) {
        // "Best" next step under idle = min positive waitMs across
        // visible moves, with legal moves treated as 0.
        let best: number | null = null;
        let bestId: string | null = null;
        for (const m of moveTable(state!, t).all) {
          if (!m.visible) continue;
          const w = m.legal ? 0 : m.waitMs;
          if (w === null) continue;
          if (best === null || w < best) {
            best = w;
            bestId = m.id;
          }
        }
        // No forecastable visible move at all → softlock candidate.
        expect(best, `no forecastable visible move @ t=${t}`).not.toBe(null);
        if (best! > worst.value) worst = { t, value: best!, moveId: bestId };
      }

      expect(
        worst.value,
        `worst min-wait ${worst.value}ms (move=${worst.moveId}) @ t=${worst.t}`,
      ).toBeLessThanOrEqual(HUGE_WAIT_MS);
    });
  }
});
