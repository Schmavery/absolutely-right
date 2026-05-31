/**
 * Reference bot policies. Each is a `Bot` (see `Sim.ts`) — given the legal
 * move list, return one to play (or null to idle this tick).
 *
 * **Bots must never reach into `src/game` for predicates.** Their *only*
 * input about the world is `ctx.legal`. If a policy needs to ask "would
 * this move help?" it computes that from `ctx.state` only — which is OK,
 * because `state` is part of the public model contract.
 */

import type { Bot, BotContext } from './Sim';
import type { Move } from '../../src/game/availability';

const PRIORITY: Record<string, number> = {
  // Highest priority: irreversible progression.
  launch: 1000,
  // Strong: anything that converts standing resources into permanent caps.
  buy_upgrade: 900,
  buy_gen: 800,
  // Medium: tactical pressers that improve state.
  bug_bounty: 700,
  run_tests: 600,
  paste_error: 500,
  write_test: 400,
  kick_agent: 300,
  clear_context: 200,
  new_free_account: 150,
  // Last resort: just press the prompt button.
  prompt: 100,
};

function priority(m: Move): number {
  return PRIORITY[m.kind === 'action' ? m.actionId! : m.kind] ?? 0;
}

/**
 * "Get any upgrades you can afford, perform any action possible." Greedy
 * over priority, then ties broken by id for determinism.
 */
export const naiveGreedy: Bot = (ctx: BotContext): Move | null => {
  if (ctx.legal.length === 0) return null;
  return [...ctx.legal].sort((a, b) => {
    const pd = priority(b) - priority(a);
    if (pd !== 0) return pd;
    return a.id.localeCompare(b.id);
  })[0];
};

/** Never presses anything — useful for testing pure tick-driven progression. */
export const lazy: Bot = (): null => null;

/**
 * Press every legal action in order this tick. Sim only applies one move
 * per tick, so over many ticks this approximates "click everything as fast
 * as possible". Stresses the economy envelope.
 */
export const spammer: Bot = (ctx: BotContext): Move | null => {
  if (ctx.legal.length === 0) return null;
  return ctx.legal[0];
};

/**
 * Patience-aware greedy. When something is legal, prefer it (same
 * priority order as `naiveGreedy`). But if a *higher-priority visible
 * move* is forecast to clear within `patienceMs` (via `Move.waitMs`),
 * idle this turn so the simulator (event-driven mode especially) can
 * fast-forward to it.
 *
 * Returning `null` to idle is the right contract — `Sim.runEventDriven`
 * advances to the next boundary on its own using `waitMs`, so the bot
 * never has to "fast-forward" itself. Under fixed-tick `Sim.run`, idling
 * just delays the choice by one tick.
 */
export function patientGreedy(opts: { patienceMs?: number } = {}): Bot {
  const patience = opts.patienceMs ?? 5000;
  return (ctx: BotContext): Move | null => {
    const sortedLegal = [...ctx.legal].sort((a, b) => {
      const pd = priority(b) - priority(a);
      if (pd !== 0) return pd;
      return a.id.localeCompare(b.id);
    });
    const bestLegal = sortedLegal[0];
    const bestLegalP = bestLegal ? priority(bestLegal) : -Infinity;

    let upgrade: Move | null = null;
    let upgradeP = bestLegalP;
    for (const m of ctx.visible) {
      if (m.legal) continue;
      if (m.waitMs === null || m.waitMs <= 0 || m.waitMs > patience) continue;
      const p = priority(m);
      if (p > upgradeP) {
        upgrade = m;
        upgradeP = p;
      }
    }
    if (upgrade) return null; // idle and let the sim advance to it
    return bestLegal ?? null;
  };
}

/** Random legal move; uses a per-bot seed independent of the sim's RNG. */
export function randomBot(seed: number): Bot {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
    t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
  return (ctx: BotContext): Move | null => {
    if (ctx.legal.length === 0) return null;
    return ctx.legal[Math.floor(next() * ctx.legal.length)];
  };
}
