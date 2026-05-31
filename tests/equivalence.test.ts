/**
 * Equivalence between the two `Sim` drivers:
 *
 *   - `Sim.run`            — fixed 100ms ticks; mirrors what `Game.tsx`'s
 *                            `setInterval` does in production.
 *   - `Sim.runEventDriven` — jumps `dt` to the next interesting boundary
 *                            (move waitMs, buff expiry, action duration,
 *                            stop time, EVENT_MAX_DT cap).
 *
 * Same model, same `tickReducer(state, dt)` — different driver loop. We
 * pin them together here so the rest of the test suite is free to run
 * event-driven only without losing production-cadence parity.
 *
 * # Why a "lazy bot" baseline
 *
 * Active bots can't trivially equivalence-check: their decisions sample
 * (state, t) tuples at different points between drivers, so the move
 * sequences themselves diverge after the first decision. That's a
 * sampling artifact of the bot, not a model defect.
 *
 * Lazy bot makes no decisions, so the only thing exercised is the
 * tick-integrator + unlock + milestone logic. Under that regime,
 * `tickReducer(state, dt)` should be exactly `tickReducer × N` over
 * smaller `dt` slices (everything is linear in `dt`), so we can demand
 * near-bit-equality.
 *
 * # Documented divergence: `chatBusyUntil`
 *
 * `appendLog` extends `chatBusyUntil` via `Math.max(prev, now() + dur)`.
 * In a single big-`dt` event-driven tick, several milestones can fire
 * back-to-back at the *same* `now()` value, so the chat-busy stack ends
 * up `now() + max(dur_i)`. In fixed-tick mode the same milestones fire
 * on different ticks at different `now()`, so the stack accumulates
 * forward over time. The set of milestones (and resulting `hype`,
 * `milestonesSeen`, `log` length) is identical — only the streaming
 * timeline collapses. `chatBusyUntil` is therefore excluded from the
 * equivalence check; nothing else is.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { GameState } from '../src/types';
import { Sim } from './sim/Sim';
import { lazy } from './sim/bots';

afterEach(() => Sim.teardown());

const SEEDS = [1, 7, 42, 100];
/** 5 virtual minutes is enough to cross every default milestone. */
const HORIZON_MS = 5 * 60_000;

function expectPassiveEquivalent(a: GameState, b: GameState): void {
  // Discrete state — exact equality. Any divergence here is a real
  // semantic difference between the drivers.
  expect(a.upgrades).toEqual(b.upgrades);
  expect(a.unlockedUpgrades).toEqual(b.unlockedUpgrades);
  expect(a.milestonesSeen).toEqual(b.milestonesSeen);
  expect(a.usedEventIds).toEqual(b.usedEventIds);
  expect(a.usedNewsIds).toEqual(b.usedNewsIds);
  expect(a.launched).toBe(b.launched);
  expect(a.started).toBe(b.started);
  expect(a.tests).toBe(b.tests);
  expect(a.freeAccounts).toBe(b.freeAccounts);
  expect(a.totalClicks).toBe(b.totalClicks);
  expect(a.genCounts).toEqual(b.genCounts);
  expect(a.actionCooldowns).toEqual(b.actionCooldowns);
  expect(a.agentBuffExpires).toBe(b.agentBuffExpires);
  expect(a.lastEventTime).toBe(b.lastEventTime);
  expect(a.lastTestLogTime).toBe(b.lastTestLogTime);

  // Continuous state — small relative slack for FP accumulation across
  // many tiny `dt`s vs one big `dt`. Linear integrators agree exactly in
  // exact arithmetic; FP drifts by ~ulp × N.
  for (const k of [
    'loc',
    'bugs',
    'tokens',
    'money',
    'nines',
    'totalLoc',
    'totalTokensSpent',
    'minTokensSeen',
    'hype',
  ] as const) {
    const va = a[k] ?? 0;
    const vb = b[k] ?? 0;
    const slack = Math.max(1e-6, Math.abs(va) * 1e-6);
    expect(Math.abs(va - vb), `${k}: ${va} vs ${vb}`).toBeLessThan(slack);
  }

  // Log structure — same milestones fire in the same order, so id
  // sequence and length must match. Text content is also deterministic
  // here because milestone messages are seed-only (no `{{rand}}`).
  expect(a.logId).toBe(b.logId);
  expect(a.log.length).toBe(b.log.length);
  for (let i = 0; i < a.log.length; i++) {
    expect(a.log[i].id, `log[${i}].id`).toBe(b.log[i].id);
    expect(a.log[i].type, `log[${i}].type`).toBe(b.log[i].type);
    expect(a.log[i].text, `log[${i}].text`).toBe(b.log[i].text);
  }
}

describe('equivalence: fixed-tick vs event-driven (lazy bot)', () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}: passive integration matches across drivers`, () => {
      const fixed = new Sim({ seed }).run(lazy, HORIZON_MS);
      Sim.teardown();
      const event = new Sim({ seed }).runEventDriven(lazy, HORIZON_MS);
      expectPassiveEquivalent(fixed.state, event.state);
    });
  }
});
