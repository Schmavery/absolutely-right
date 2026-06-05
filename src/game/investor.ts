import type { GameState, McMiniLanes } from '../types';
import { INVESTOR } from './constants';
import { calcInfraBurnPerSec } from './rates';

export type McMiniLane = keyof McMiniLanes;

export const EMPTY_MC_MINI_LANES: McMiniLanes = { code: 0, growth: 0, tests: 0 };

export function totalMcMiniLanes(lanes: McMiniLanes): number {
  return lanes.code + lanes.growth + lanes.tests;
}

/** Keep lane counts aligned with `mcMinis`; new capacity defaults to code. */
export function normalizeMcMiniLanes(mcMinis: number, lanes: McMiniLanes | undefined): McMiniLanes {
  const l = lanes ?? EMPTY_MC_MINI_LANES;
  let { code, growth, tests } = l;
  let sum = code + growth + tests;
  if (sum > mcMinis) {
    let over = sum - mcMinis;
    for (const key of ['tests', 'growth', 'code'] as const) {
      const drop = Math.min(l[key], over);
      if (key === 'code') code -= drop;
      if (key === 'growth') growth -= drop;
      if (key === 'tests') tests -= drop;
      over -= drop;
      if (over <= 0) break;
    }
  } else if (sum < mcMinis) {
    code += mcMinis - sum;
  }
  return { code, growth, tests };
}

export function grantMcMinis(state: GameState, count: number): GameState {
  const mcMinis = (state.mcMinis ?? 0) + count;
  const mcMiniLanes = normalizeMcMiniLanes(mcMinis, state.mcMiniLanes);
  return { ...state, mcMinis, mcMiniLanes };
}

export function shiftMcMiniLane(prev: GameState, from: McMiniLane, to: McMiniLane): GameState {
  if (from === to) return prev;
  const lanes = normalizeMcMiniLanes(prev.mcMinis ?? 0, prev.mcMiniLanes);
  if (lanes[from] <= 0) return prev;
  return {
    ...prev,
    mcMiniLanes: {
      ...lanes,
      [from]: lanes[from] - 1,
      [to]: lanes[to] + 1,
    },
  };
}

export function nextFundingRound(state: GameState) {
  const idx = state.fundingRound ?? 0;
  return INVESTOR.fundingRounds[idx];
}

export function canRaise(state: GameState): boolean {
  const round = nextFundingRound(state);
  if (!round || !state.launched) return false;
  const buzz = state.buzzMeter ?? 0;
  if (buzz < INVESTOR.buzzMax) return false;
  return calcInfraBurnPerSec(state.upgrades) >= round.minBurnPerSec;
}

export function raiseRoundRequirementsLabel(round: { minBurnPerSec: number }): string {
  const burn = round.minBurnPerSec > 0 ? `≥ $${round.minBurnPerSec}/s burn · ` : '';
  return `${burn}100% buzz`;
}

export function raiseBlockReason(state: GameState): string | null {
  const round = nextFundingRound(state);
  if (!round) return 'no rounds left';
  if (!state.launched) return 'not launched';
  if ((state.buzzMeter ?? 0) < INVESTOR.buzzMax) return 'buzz meter not full';
  const burn = calcInfraBurnPerSec(state.upgrades);
  if (burn < round.minBurnPerSec) {
    return `need burn ≥ $${round.minBurnPerSec}/s (have $${burn}/s)`;
  }
  return null;
}

export function mcMiniTokenDrainPerSec(lanes: McMiniLanes): number {
  return (
    lanes.code * INVESTOR.tokenDrainPerCodeMini +
    lanes.growth * INVESTOR.tokenDrainPerGrowthMini +
    lanes.tests * INVESTOR.tokenDrainPerTestsMini
  );
}

export function buzzGainPerSec(lanes: McMiniLanes): number {
  return lanes.growth * INVESTOR.buzzPerSecPerGrowthMini;
}
