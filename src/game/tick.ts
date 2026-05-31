import type { GameState } from '../types';
import { AGENT_BUFF, TICK_MS } from './constants';
import { MILESTONES, UPGRADES } from './data';
import { computeFlags, effectiveThresholds, hasFlag } from './flags';
import {
  calcAgentLocMult,
  calcAutoBugDrainRate,
  calcBugPenalty,
  calcClickPower,
  calcMoneyRate,
  calcNinesRate,
  calcRates,
  calcTokenConfig,
  calcUptime,
} from './rates';
import { LOC_PER_CLICK_POWER, HYPE } from './constants';
import { appendLog } from './log';
import { render } from '../lib/template';
import { now } from './runtime';

/**
 * Advance the game state by `dtMs` of virtual time (default `TICK_MS`).
 *
 * Pure: takes prev, returns next. The React `setState` wrapper passes a
 * single state arg, so the default kicks in and behavior matches the
 * historical 100ms tick. The simulator harness passes an explicit `dtMs`
 * so an event-driven loop can take big jumps to the next interesting
 * boundary instead of stepping at full tick rate.
 *
 * Big-dt safety:
 *   - All passive deltas are linear in `dt` (loc, bugs, tokens, money,
 *     nines), so a single big tick equals N small ticks for those.
 *   - The unlock loop and milestone loop are threshold-based and run
 *     once per call regardless of `dt`, so any thresholds crossed during
 *     `dt` fire on this call. (Same as today when rates are high.)
 *   - Buff/cooldown semantics are sampled at end-of-tick `now()`. Crossing
 *     a buff-expiry boundary mid-`dt` slightly mis-attributes the dt to
 *     "post-expiry"; the event-driven sim mitigates by inserting buff
 *     expiry into its next-event boundary list.
 */
export function tickReducer(prev: GameState, dtMs: number = TICK_MS): GameState {
  const dt = dtMs / 1000;
  const flags = computeFlags(prev.upgrades);
  const thresholds = effectiveThresholds(prev.upgrades);
  const { locRate, bugRate, fixRate } = calcRates(prev.genCounts, prev.upgrades, prev.tests);
  const { maxTokens, tokenRegen } = calcTokenConfig(prev.upgrades, prev.freeAccounts);
  const bugPenalty = calcBugPenalty(prev.bugs);
  const agentBuffActive = now() < (prev.agentBuffExpires ?? 0);

  // Agent contributes its own base LOC rate, scaled by any agent upgrades.
  const agentMult = calcAgentLocMult(prev.upgrades);
  const agentBaseRate = agentBuffActive
    ? calcClickPower(prev.upgrades) * LOC_PER_CLICK_POWER * agentMult
    : 0;
  const effectiveLoc = (locRate + agentBaseRate) * bugPenalty * dt;
  const effectiveBugRate =
    prev.totalLoc >= thresholds.bugSpawnLoc
      ? bugRate * (agentBuffActive ? AGENT_BUFF.bugRateMult : 1)
      : 0;
  const uptime = calcUptime(prev.bugs);
  const moneyDelta = calcMoneyRate(prev.upgrades, locRate, uptime.fraction, prev.launched) * dt;

  const ninesTracking = hasFlag(flags, 'nines_tracking');
  const ninesRate = ninesTracking ? calcNinesRate(prev.upgrades, prev.bugs) : 0;
  const autoBugDrain = calcAutoBugDrainRate(prev.upgrades) * prev.bugs * dt;

  let next: GameState = {
    ...prev,
    loc: prev.loc + effectiveLoc,
    bugs: Math.max(0, prev.bugs + (effectiveBugRate - fixRate) * dt - autoBugDrain),
    totalLoc: prev.totalLoc + effectiveLoc,
    tokens: Math.min(maxTokens, prev.tokens + tokenRegen * dt),
    minTokensSeen: Math.min(prev.minTokensSeen ?? 9999, prev.tokens),
    money: prev.money + moneyDelta,
    nines: ninesTracking
      ? (prev.nines || AGENT_BUFF.ninesFloorFallback) + ninesRate * dt
      : prev.nines,
  };

  // Reveal upgrades as the player approaches them so they don't pop in
  // immediately at full cost.
  for (const u of UPGRADES) {
    if (next.unlockedUpgrades.includes(u.id)) continue;
    if (next.upgrades.includes(u.id)) continue;
    if (next.totalLoc < u.unlockAt * thresholds.upgradeUnlockFraction) continue;
    if (next.loc < u.cost * thresholds.upgradeAffordFraction) continue;
    if (u.requiresLaunch && !next.launched) continue;
    if (u.requires && !u.requires.every((r) => next.upgrades.includes(r))) continue;
    if (
      u.unlockMinUptimeNines !== undefined &&
      calcUptime(next.bugs).nines < u.unlockMinUptimeNines
    )
      continue;
    next = { ...next, unlockedUpgrades: [...next.unlockedUpgrades, u.id] };
  }

  // Milestones — one-shot observer-voice messages keyed by totalLoc thresholds.
  for (const m of MILESTONES) {
    if (next.totalLoc >= m.loc && !prev.milestonesSeen.includes(m.loc)) {
      next = appendLog(next, render(m.text, { loc: m.loc }), 'milestone');
      next = {
        ...next,
        milestonesSeen: [...next.milestonesSeen, m.loc],
        hype: next.hype + HYPE.perMilestone,
      };
    }
  }

  return next;
}
