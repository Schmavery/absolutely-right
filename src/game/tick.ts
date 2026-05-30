import type { GameState } from '../types';
import { AGENT_BUFF, THRESHOLDS, TICK_MS } from './constants';
import { MILESTONES, UPGRADES } from './data';
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

/**
 * Advance the game state by one tick. Pure: takes prev, returns next. The
 * React `setState` wrapper just calls this and the streaming-log effect
 * picks up any new log entries by id.
 */
export function tickReducer(prev: GameState): GameState {
  const dt = TICK_MS / 1000;
  const { locRate, bugRate, fixRate } = calcRates(prev.genCounts, prev.upgrades, prev.tests);
  const { maxTokens, tokenRegen } = calcTokenConfig(prev.upgrades, prev.freeAccounts);
  const bugPenalty = calcBugPenalty(prev.bugs);
  const agentBuffActive = Date.now() < (prev.agentBuffExpires ?? 0);

  // Agent contributes its own base LOC rate, scaled by any agent upgrades.
  const agentMult = calcAgentLocMult(prev.upgrades);
  const agentBaseRate = agentBuffActive
    ? calcClickPower(prev.upgrades) * LOC_PER_CLICK_POWER * agentMult
    : 0;
  const effectiveLoc = (locRate + agentBaseRate) * bugPenalty * dt;
  const effectiveBugRate =
    prev.totalLoc >= THRESHOLDS.bugSpawnLoc
      ? bugRate * (agentBuffActive ? AGENT_BUFF.bugRateMult : 1)
      : 0;
  const uptime = calcUptime(prev.bugs);
  const moneyDelta = calcMoneyRate(prev.upgrades, locRate, uptime.fraction, prev.launched) * dt;

  const statusRevamped = prev.upgrades.includes('revamp_status_page');
  const ninesRate = statusRevamped ? calcNinesRate(prev.upgrades, prev.bugs) : 0;
  const autoBugDrain = calcAutoBugDrainRate(prev.upgrades) * prev.bugs * dt;

  let next: GameState = {
    ...prev,
    loc: prev.loc + effectiveLoc,
    bugs: Math.max(0, prev.bugs + (effectiveBugRate - fixRate) * dt - autoBugDrain),
    totalLoc: prev.totalLoc + effectiveLoc,
    tokens: Math.min(maxTokens, prev.tokens + tokenRegen * dt),
    minTokensSeen: Math.min(prev.minTokensSeen ?? 9999, prev.tokens),
    money: prev.money + moneyDelta,
    nines: statusRevamped
      ? (prev.nines || AGENT_BUFF.ninesFloorFallback) + ninesRate * dt
      : prev.nines,
  };

  // Reveal upgrades as the player approaches them so they don't pop in
  // immediately at full cost.
  for (const u of UPGRADES) {
    if (next.unlockedUpgrades.includes(u.id)) continue;
    if (next.upgrades.includes(u.id)) continue;
    if (next.totalLoc < u.unlockAt * THRESHOLDS.upgradeUnlockFraction) continue;
    if (next.loc < u.cost * THRESHOLDS.upgradeAffordFraction) continue;
    if (u.requiresLaunch && !next.launched) continue;
    if (u.requires && !u.requires.every((r) => next.upgrades.includes(r))) continue;
    if (u.id === 'revamp_status_page' && calcUptime(next.bugs).nines < THRESHOLDS.revampMinNines)
      continue;
    next = { ...next, unlockedUpgrades: [...next.unlockedUpgrades, u.id] };
  }

  // Milestones — one-shot observer-voice messages keyed by totalLoc thresholds.
  for (const m of MILESTONES) {
    if (next.totalLoc >= m.loc && !prev.milestonesSeen.includes(m.loc)) {
      next = appendLog(next, m.text, 'milestone');
      next = {
        ...next,
        milestonesSeen: [...next.milestonesSeen, m.loc],
        hype: next.hype + HYPE.perMilestone,
      };
    }
  }

  return next;
}
