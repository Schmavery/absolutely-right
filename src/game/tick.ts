import type { GameState } from '../types';
import { withBugs } from './state';
import { AGENT_BUFF, INVESTOR, TICK_MS } from './constants';
import { MILESTONES, UPGRADES } from './data';
import { computeFlags, effectiveThresholds, hasFlag } from './flags';
import {
  buzzGainPerSec,
  mcMiniTokenDrainPerSec,
  normalizeMcMiniLanes,
} from './investor';
import {
  calcAgentLocMult,
  calcAutoBugDrainRate,
  calcBugPenalty,
  calcClickPower,
  calcMcMiniCodeLocRate,
  calcNinesRate,
  calcRates,
  calcTokenConfig,
  calcUptime,
  snapRate,
} from './rates';
import { appendLog } from './log';
import { advanceMcpTiming } from './mcpApproval';
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
 *   - All passive deltas are linear in `dt` (loc, bugs, tokens,
 *     nines, buzz), so a single big tick equals N small ticks for those.
 *   - The unlock loop and milestone loop are threshold-based and run
 *     once per call regardless of `dt`, so any thresholds crossed during
 *     `dt` fire on this call. (Same as today when rates are high.)
 */
export function tickReducer(state: GameState, dtMs: number = TICK_MS): GameState {
  let prev = advanceMcpTiming(state, now());
  const dt = dtMs / 1000;
  const flags = computeFlags(prev.upgrades);
  const thresholds = effectiveThresholds(prev.upgrades);
  const { locRate, bugRate, fixRate } = calcRates(prev.genCounts, prev.upgrades, prev.tests);
  const { maxTokens, tokenRegen } = calcTokenConfig(prev.upgrades, prev.freeAccounts);
  const bugPenalty = calcBugPenalty(prev.bugs);
  const mcMinis = prev.mcMinis ?? 0;
  const lanes = normalizeMcMiniLanes(mcMinis, prev.mcMiniLanes);
  const agentMult = calcAgentLocMult(prev.upgrades);
  const mcMiniCodeRate =
    mcMinis > 0 ? calcMcMiniCodeLocRate(lanes.code, prev.upgrades) * bugPenalty : 0;
  const effectiveLocRate = snapRate(locRate + mcMiniCodeRate);
  const effectiveLoc = effectiveLocRate * dt;
  const mcMiniBugs =
    mcMinis > 0 && prev.totalLoc >= thresholds.bugSpawnLoc && lanes.code > 0
      ? bugRate * INVESTOR.codeBugRateMult * lanes.code
      : 0;
  const effectiveBugRate = snapRate(
    prev.totalLoc >= thresholds.bugSpawnLoc ? bugRate + mcMiniBugs : 0,
  );

  const ninesTracking = hasFlag(flags, 'nines_tracking');
  const ninesRate = ninesTracking ? calcNinesRate(prev.upgrades, prev.bugs) : 0;
  const autoBugDrain = calcAutoBugDrainRate(prev.upgrades) * prev.bugs * dt;

  const tokenDrain = mcMiniTokenDrainPerSec(lanes);
  const netTokenRegen = tokenRegen - tokenDrain;
  const buzzGain =
    prev.launched && (prev.buzzMeter ?? 0) < INVESTOR.buzzMax
      ? buzzGainPerSec(lanes) * dt
      : 0;

  const netBugDeltaRate = snapRate(effectiveBugRate - fixRate);
  const newBugs = prev.bugs + netBugDeltaRate * dt - autoBugDrain;
  let next: GameState = {
    ...prev,
    mcMiniLanes: lanes,
    loc: prev.loc + effectiveLoc,
    ...withBugs(prev, newBugs),
    totalLoc: prev.totalLoc + effectiveLoc,
    tokens: Math.min(maxTokens, Math.max(0, prev.tokens + netTokenRegen * dt)),
    minTokensSeen: Math.min(prev.minTokensSeen ?? 9999, prev.tokens),
    buzzMeter: Math.min(INVESTOR.buzzMax, (prev.buzzMeter ?? 0) + buzzGain),
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
    const uptimeNines = calcUptime(next.bugs).nines;
    if (u.unlockMinUptimeNines !== undefined && uptimeNines < u.unlockMinUptimeNines)
      continue;
    if (u.unlockMaxUptimeNines !== undefined && uptimeNines > u.unlockMaxUptimeNines)
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
      };
    }
  }

  return next;
}
