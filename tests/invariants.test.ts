/**
 * Bot-driven invariants. Every assertion here is a property the game
 * should satisfy *under any policy*, *for any seed*. The harness exercises
 * the same code paths the React UI does — `tickReducer`, the action
 * reducers, and `availability.legalMoves` — so a regression in any of
 * those surfaces here without us having to reimplement game logic.
 *
 * Determinism note: `Sim` swaps the global `runtime.now` and
 * `runtime.random` for the duration of each test. We restore them in
 * `afterEach` to keep tests independent.
 *
 * Sim runs are cached per file so each (policy, budget) trace is built
 * once and reused across describe blocks. One random seed per file run;
 * set `INVARIANT_SEED` to reproduce a failure.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Sim, type Bot } from '../src/sim/Sim';
import { greedyPlayer, lazy, spammer, randomBot } from '../src/sim/bots';
import { calcTokenConfig } from '../src/game/rates';
import { MESSAGE_POOL } from '../src/game/constants';
import { ACTIONS, EVENTS, MCP_UNSAFE_ALLOW_LEAK_ACK } from '../src/game/data';
import {
  legalFromGates,
  moveTable,
  waitMsFromGates,
  type Gate,
} from '../src/game/availability';
import type { LogEntry } from '../src/types';
import { messageKey } from '../src/lib/messageKey';
import {
  collectUsedEventIdTemplates,
  findMessageKeyCollisions,
} from '../src/lib/messagePoolKeys';

afterEach(() => Sim.teardown());

const INVARIANT_SEED = (() => {
  const fromEnv = process.env.INVARIANT_SEED;
  if (fromEnv != null && fromEnv !== '') {
    const n = Number(fromEnv);
    if (Number.isFinite(n)) return n >>> 0;
  }
  return ((Math.random() * 0x7fffffff) >>> 0) || 1;
})();

// eslint-disable-next-line no-console
console.info(
  `[invariants] seed=${INVARIANT_SEED} — repro: INVARIANT_SEED=${INVARIANT_SEED} npm test -- --run tests/invariants.test.ts`,
);

const VIRTUAL_MIN = 60_000;        // 1 virtual minute — quick smoke runs
const VIRTUAL_LONG = 5 * 60_000;   // 5 virtual minutes — for reach tests

const POLICIES = [
  ['lazy', lazy],
  ['greedy', greedyPlayer],
  ['spammer', spammer],
  ['random', randomBot(0xdeadbeef)],
] as const;

// ─── shared sim cache (one run per key per file) ───────────────────────────

const smokeRuns = new Map<string, Sim>();
const traceRuns = new Map<string, Sim>();

/** Final-state run — no trace. */
function getSmokeRun(name: string, bot: Bot): Sim {
  const key = `smoke:${name}`;
  let sim = smokeRuns.get(key);
  if (!sim) {
    sim = new Sim({ seed: INVARIANT_SEED }).run(bot, VIRTUAL_MIN);
    smokeRuns.set(key, sim);
  }
  return sim;
}

/** Traced run — `recordTrace: true`. */
function getTraceRun(key: string, bot: Bot, ms: number): Sim {
  let sim = traceRuns.get(key);
  if (!sim) {
    sim = new Sim({ seed: INVARIANT_SEED, recordTrace: true }).run(bot, ms);
    traceRuns.set(key, sim);
  }
  return sim;
}

// ─── helpers (test-local; never duplicate game logic) ──────────────────────

const FLAVOR_TYPES = new Set<LogEntry['type']>(['info', 'bad', 'event']);

/**
 * Walk every entry in `state.log` and assert no Handlebars template made
 * it into the rendered text. We intentionally do not enumerate template
 * syntax forms — any `{{` is suspicious for a rendered string.
 */
function assertNoUnrenderedTemplates(state: { log: { text: string }[] }) {
  for (const e of state.log) {
    expect(e.text).not.toMatch(/\{\{/);
  }
}

/** No flavor line repeats within the recent-log dedup window. */
function assertNoRecentFlavorDuplicates(log: LogEntry[], window: number) {
  for (let i = 0; i < log.length; i++) {
    const entry = log[i]!;
    if (!FLAVOR_TYPES.has(entry.type)) continue;
    const text = entry.text.trim();
    if (!text) continue;
    const start = Math.max(0, i - window);
    for (let j = start; j < i; j++) {
      const prev = log[j]!;
      if (prev.type === entry.type && prev.text.trim() === text) {
        expect.fail(
          `seed=${INVARIANT_SEED}: duplicate ${entry.type} within recent window ` +
            `(indices ${j} and ${i}): ${text.slice(0, 80)}`,
        );
      }
    }
  }
}

function isFiniteNumber(x: unknown): boolean {
  return typeof x === 'number' && Number.isFinite(x);
}

function hasBlockingBool(gates: readonly Gate[]): boolean {
  return gates.some((g) => g.kind === 'bool' && !g.ok);
}

const GATE_TRACE_KEY = 'gates:greedy';
const SNAPSHOT_STRIDE = 40;

function gateTraceSamples(sim: Sim) {
  return sim.trace.filter((_, i) => i % SNAPSHOT_STRIDE === 0 || i === sim.trace.length - 1);
}

// ─── static template keys ──────────────────────────────────────────────────

describe('invariants: template keys', () => {
  const templates = collectUsedEventIdTemplates(EVENTS, ACTIONS, MCP_UNSAFE_ALLOW_LEAK_ACK);

  it('assigns a unique slug to every flavor/MCP ack template', () => {
    expect(findMessageKeyCollisions(templates)).toEqual([]);
  });

  it('keeps paste_error beats with shared user prompts distinct', () => {
    const paste = ACTIONS.find((a) => a.id === 'paste_error')!;
    const bad = paste.badMessages!.find((m) => m.startsWith("> here's the error"))!;
    const neutral = paste.neutralMessages!.find((m) => m.startsWith("> here's the error"))!;
    expect(messageKey(bad)).not.toBe(messageKey(neutral));
  });
});

// ─── bot-driven (single random seed per file) ──────────────────────────────

describe(`invariants @ seed=${INVARIANT_SEED}`, () => {
  describe('numeric sanity', () => {
    for (const [name, bot] of POLICIES) {
      it(`${name}: no NaN/Infinity in numeric state`, () => {
        const s = getSmokeRun(name, bot).state;
        for (const k of [
          'loc', 'bugs', 'lifetimeBugs', 'buzzMeter', 'fundingRound', 'mcMinis', 'tests', 'freeAccounts',
          'totalLoc', 'totalClicks', 'totalTokensSpent', 'minTokensSeen',
          'tokens', 'agentBuffExpires', 'nines',
          'lastEventTime', 'lastTestLogTime', 'logId',
        ] as const) {
          expect(isFiniteNumber(s[k]), `${k} = ${s[k]}`).toBe(true);
        }
        for (const v of Object.values(s.genCounts)) {
          expect(isFiniteNumber(v) && v >= 0).toBe(true);
        }
        for (const v of Object.values(s.actionCooldowns)) {
          expect(isFiniteNumber(v)).toBe(true);
        }
      });
    }
  });

  describe('bounds', () => {
    for (const [name, bot] of POLICIES) {
      it(`${name}: tokens never exceed maxTokens, never negative`, () => {
        const sim = new Sim({ seed: INVARIANT_SEED });
        for (let elapsed = 0; elapsed < VIRTUAL_MIN; elapsed += 1000) {
          sim.run(bot, 1000);
          const { maxTokens } = calcTokenConfig(sim.state.upgrades, sim.state.freeAccounts);
          expect(sim.state.tokens).toBeGreaterThanOrEqual(0);
          expect(sim.state.tokens).toBeLessThanOrEqual(maxTokens + 1e-9);
        }
      });

      it(`${name}: bugs and loc are non-negative`, () => {
        const s = getSmokeRun(name, bot).state;
        expect(s.bugs).toBeGreaterThanOrEqual(0);
        expect(s.loc).toBeGreaterThanOrEqual(0);
      });
    }
  });

  describe('monotonicity', () => {
    for (const [name, bot] of POLICIES) {
      it(`${name}: cumulative counters never decrease across any tick`, () => {
        const sim = getTraceRun(`mono:${name}`, bot, VIRTUAL_MIN);
        let prev = sim.trace[0]!.state!;
        for (const entry of sim.trace.slice(1)) {
          const s = entry.state!;
          expect(s.totalLoc).toBeGreaterThanOrEqual(prev.totalLoc - 1e-9);
          expect(s.totalClicks).toBeGreaterThanOrEqual(prev.totalClicks);
          expect(s.totalTokensSpent ?? 0).toBeGreaterThanOrEqual(prev.totalTokensSpent ?? 0);
          expect(s.tests ?? 0).toBeGreaterThanOrEqual(prev.tests ?? 0);
          expect(s.freeAccounts).toBeGreaterThanOrEqual(prev.freeAccounts);
          expect(s.upgrades.length).toBeGreaterThanOrEqual(prev.upgrades.length);
          expect(s.unlockedUpgrades.length).toBeGreaterThanOrEqual(prev.unlockedUpgrades.length);
          expect(s.usedNewsIds.length).toBeGreaterThanOrEqual(prev.usedNewsIds.length);
          expect(s.milestonesSeen.length).toBeGreaterThanOrEqual(prev.milestonesSeen.length);
          if (prev.launched) expect(s.launched).toBe(true);
          prev = s;
        }
      });
    }
  });

  describe('log integrity', () => {
    for (const [name, bot] of POLICIES) {
      it(`${name}: every log entry rendered (no leaked {{...}})`, () => {
        assertNoUnrenderedTemplates(getSmokeRun(name, bot).state);
      });

      it(`${name}: log ids are strictly increasing and unique`, () => {
        const ids = getSmokeRun(name, bot).state.log.map((e) => e.id);
        const sorted = [...ids].sort((a, b) => a - b);
        expect(ids).toEqual(sorted);
        expect(new Set(ids).size).toBe(ids.length);
      });
    }
  });

  describe('flavor dedup', () => {
    for (const [name, bot] of POLICIES) {
      it(`${name}: no flavor line repeats within recent window`, () => {
        const log = getSmokeRun(name, bot).state.log;
        assertNoRecentFlavorDuplicates(log, MESSAGE_POOL.recentWindow);
      });
    }
  });

  describe('canonical gates', () => {
    it('legal and waitMs are derived from gates (with visibility overlay where applicable)', () => {
      const sim = getTraceRun(GATE_TRACE_KEY, greedyPlayer, VIRTUAL_MIN);
      for (const { state, t } of gateTraceSamples(sim)) {
        for (const m of moveTable(state!, t).all) {
          const gateLegal = legalFromGates(m.gates);
          const gateWait = waitMsFromGates(m.gates);
          const visibilityOverlay =
            m.id === 'new_free_account' || m.kind === 'buy_gen';
          if (visibilityOverlay) {
            expect(m.legal, `${m.id} @ t=${t}`).toBe(m.visible && gateLegal);
          } else {
            expect(m.legal, `${m.id} @ t=${t}`).toBe(gateLegal);
          }
          if (m.id === 'new_free_account' && !m.visible) {
            expect(m.waitMs, `${m.id} @ t=${t}`).toBe(null);
          } else {
            expect(m.waitMs, `${m.id} @ t=${t}`).toBe(gateWait);
          }
        }
      }
    });

    it('legal visible moves always report waitMs === 0', () => {
      const sim = getTraceRun(GATE_TRACE_KEY, greedyPlayer, VIRTUAL_MIN);
      for (const { state, t } of gateTraceSamples(sim)) {
        for (const m of moveTable(state!, t).all) {
          if (m.visible && m.legal) {
            expect(m.waitMs, `${m.id} @ t=${t}`).toBe(0);
          }
        }
      }
    });

    it('any unsatisfied bool gate forces waitMs === null', () => {
      const sim = getTraceRun(GATE_TRACE_KEY, greedyPlayer, VIRTUAL_MIN);
      for (const { state, t } of gateTraceSamples(sim)) {
        for (const m of moveTable(state!, t).all) {
          if (hasBlockingBool(m.gates)) {
            expect(m.waitMs, `${m.id} @ t=${t}`).toBe(null);
          }
        }
      }
    });
  });

  describe('legality contract', () => {
    it('every move ever offered to the greedy bot, when applied, changes state', () => {
      const sim = getTraceRun('legal:greedy', greedyPlayer, VIRTUAL_LONG);
      const moveTicks = sim.trace.filter((t) => t.move);
      expect(moveTicks.length).toBeGreaterThan(0);
      for (const t of moveTicks) {
        expect(t.move?.id).toBeTruthy();
      }
    });
  });
});

// ─── determinism (fixed seed — not the file's random draw) ─────────────────

describe('invariants: determinism', () => {
  const factories = [
    ['lazy', () => lazy],
    ['greedy', () => greedyPlayer],
    ['spammer', () => spammer],
    ['random', () => randomBot(0xdeadbeef)],
  ] as const;

  for (const [name, make] of factories) {
    it(`${name}: same seed → byte-identical state after long run`, () => {
      const a = new Sim({ seed: 12345 }).run(make(), VIRTUAL_LONG);
      Sim.teardown();
      const b = new Sim({ seed: 12345 }).run(make(), VIRTUAL_LONG);
      const norm = (s: typeof a.state) => ({
        ...s,
        log: s.log.map((e) => ({ id: e.id, type: e.type, len: e.text.length })),
      });
      expect(norm(a.state)).toEqual(norm(b.state));
    });
  }
});
