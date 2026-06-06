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
 *   3. Shop waits — when generators/upgrades are visible, the next
 *      affordable shop row is never hours away (prompt is excluded —
 *      it is always visible and trivially legal).
 *   4. Phase progression — active play (progress bot) hits each enforced
 *      flavor phase within `PHASE_TIME_CURVE_MS` (see `src/game/phasePacing.ts`).
 *   5. Token pressure — progress bot that skips token-capacity upgrades
 *      regularly dips below `THRESHOLDS.showClearContextMinTokens` so
 *      clear-context / paid plans feel necessary.
 *
 * Driver: event-driven only. `tests/equivalence.test.ts` pins fixed-tick
 * `Sim.run` (production-cadence parity with `Game.tsx`) to event-driven
 * `Sim.runEventDriven`, so anything that holds for one driver under
 * passive ticks holds for the other. Bot-driven pacing only needs the
 * faster driver.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Sim, type Bot, type BotContext } from '../src/sim/Sim';
import { greedyPlayer } from '../src/sim/bots';
import { moveTable, type Move } from '../src/game/availability';
import { THRESHOLDS } from '../src/game/constants';
import { getPhase } from '../src/game/phases';
import {
  PHASE_TIME_CURVE_ENFORCED,
  PHASE_TIME_CURVE_MS,
} from '../src/game/phasePacing';

afterEach(() => Sim.teardown());

// A small seed set keeps these tests under a few seconds in CI without
// sacrificing failure-surface coverage — invariants.test.ts already
// drives the wider seed list.
const SEEDS = [1, 42];

const VIRTUAL_BUDGET_MS = 10 * 60_000; // 10 virtual minutes
const TRACE_MS = 5 * 60_000; // early-game shop-wait scan

const budgetRuns = new Map<number, Sim>();
const shopTraceRuns = new Map<number, Sim>();

/** One event-driven budget run per seed — shared by termination and progress tests. */
function getBudgetRun(seed: number): Sim {
  let sim = budgetRuns.get(seed);
  if (!sim) {
    sim = new Sim({ seed });
    sim.runEventDriven(greedyPlayer, VIRTUAL_BUDGET_MS);
    budgetRuns.set(seed, sim);
  }
  return sim;
}

/** One traced early-game run per seed — shared if shop-wait tests expand. */
function getShopTraceRun(seed: number): Sim {
  let sim = shopTraceRuns.get(seed);
  if (!sim) {
    sim = new Sim({ seed, recordTrace: true });
    sim.runEventDriven(greedyPlayer, TRACE_MS);
    shopTraceRuns.set(seed, sim);
  }
  return sim;
}

/** Max virtual idle before any visible shop row becomes affordable. */
const SHOP_WAIT_CAP_MS = 60 * 60_000; // 1 virtual hour

/** Upgrades that add max tokens or regen — excluded from token-pressure bot. */
const TOKEN_CAPACITY_UPGRADE_IDS = new Set(['rotate_accounts', 'pro_plan', 'team_plan']);

function withoutTokenCapacityMoves(moves: Move[]): Move[] {
  return moves.filter(
    (m) =>
      !(m.kind === 'buy_upgrade' && m.target && TOKEN_CAPACITY_UPGRADE_IDS.has(m.target)) &&
      m.actionId !== 'new_free_account',
  );
}

/** Progress bot that never buys token headroom (no subs, rotation, or free accounts). */
const greedyNoTokenUpgrades: Bot = (ctx: BotContext) =>
  greedyPlayer({
    ...ctx,
    legal: withoutTokenCapacityMoves(ctx.legal),
    visible: withoutTokenCapacityMoves(ctx.visible),
  });

/** Bot factories — fresh internal state per run for stateful policies. */
const BOTS: ReadonlyArray<readonly [string, () => Bot]> = [['greedy', () => greedyPlayer]];

function shopMoves(moves: readonly Move[]): Move[] {
  return moves.filter((m) => m.visible && (m.kind === 'buy_gen' || m.kind === 'buy_upgrade'));
}

function minShopWaitMs(moves: readonly Move[]): number | null {
  const shop = shopMoves(moves);
  if (shop.length === 0) return null;
  let best: number | null = null;
  for (const m of shop) {
    const w = m.legal ? 0 : m.waitMs;
    if (w === null) continue;
    if (best === null || w < best) best = w;
  }
  return best;
}

// ─── 1. termination ────────────────────────────────────────────────────────

describe('pacing: termination', () => {
  // Event-driven advances 10 virtual min in dozens of reducer calls;
  // 4s headroom for slower early prompt cooldown on a slow CI box.
  const WALL_CAP_MS = 4_000;

  for (const [botName, makeBot] of BOTS) {
    for (const seed of SEEDS) {
      it(`${botName}/seed=${seed}: 10 virtual min finishes in bounded wall-clock`, () => {
        const start = performance.now();
        const sim = botName === 'greedy' ? getBudgetRun(seed) : new Sim({ seed });
        if (botName !== 'greedy') sim.runEventDriven(makeBot(), VIRTUAL_BUDGET_MS);
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
        const sim =
          botName === 'greedy'
            ? getBudgetRun(seed)
            : (() => {
                const s = new Sim({ seed });
                s.runEventDriven(makeBot(), VIRTUAL_BUDGET_MS);
                return s;
              })();
        // A 10-virtual-minute run from default state under any active
        // policy should comfortably accumulate `LAUNCH_LOC`-class
        // numbers; we use a far weaker bar (1k) so this fails only on
        // real softlocks, not balance retunes.
        expect(sim.state.totalLoc).toBeGreaterThan(1_000);
      });
    }
  }
});

// ─── 3. shop waits (early game) ────────────────────────────────────────────

describe('pacing: shop waits', () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}: visible shop rows are never >1 virtual hour away`, () => {
      const sim = getShopTraceRun(seed);

      let sawShop = false;
      let worst = { t: 0, value: 0, moveId: '' as string | null };
      for (const { state, t } of sim.trace) {
        const best = minShopWaitMs(moveTable(state!, t).all);
        if (best === null) continue;
        sawShop = true;
        if (best > worst.value) worst = { t, value: best, moveId: null };
      }

      expect(sawShop, 'progress bot should expose shop rows within 5 virtual min').toBe(true);
      expect(
        worst.value,
        `worst shop min-wait ${worst.value}ms @ t=${worst.t}`,
      ).toBeLessThanOrEqual(SHOP_WAIT_CAP_MS);
    });
  }
});

// ─── 4. phase progression ────────────────────────────────────────────────

describe('pacing: phase progression', () => {
  for (const phaseIndex of PHASE_TIME_CURVE_ENFORCED) {
    const budgetMs = PHASE_TIME_CURVE_MS[phaseIndex]!;
    const budgetMin = budgetMs / 60_000;
    for (const seed of SEEDS) {
      it(`seed=${seed}: progress bot reaches phase ${phaseIndex} within ${budgetMin} virtual min`, () => {
        const sim = new Sim({ seed });
        sim.runEventDriven(greedyPlayer, budgetMs);
        expect(
          getPhase(sim.state),
          `phase curve allows ${budgetMin}m virtual — edit src/game/phasePacing.ts if retuning`,
        ).toBeGreaterThanOrEqual(phaseIndex);
      });
    }
  }
});

// ─── 5. token pressure ─────────────────────────────────────────────────────

describe('pacing: token pressure', () => {
  const limit = THRESHOLDS.showClearContextMinTokens;
  const phase1BudgetMs = PHASE_TIME_CURVE_MS[1]!;

  for (const seed of SEEDS) {
    it(`seed=${seed}: phase-1 playthrough without token upgrades dips below ${limit}`, () => {
      const sim = new Sim({ seed });
      sim.runEventDriven(greedyNoTokenUpgrades, phase1BudgetMs, {
        stopWhen: (state) => getPhase(state) > 1,
      });
      expect(
        getPhase(sim.state),
        'bot should reach launch (phase 1) within the phase-1 budget',
      ).toBeGreaterThanOrEqual(1);
      expect(
        sim.state.minTokensSeen,
        `during phase 1 without rotate_accounts / pro_plan / team_plan / free accounts, ` +
          `min tokens should drop below ${limit}`,
      ).toBeLessThan(limit);
    });
  }
});
