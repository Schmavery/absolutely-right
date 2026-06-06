/**
 * Rate-based cruise: estimate resource/time rates for a loadout, probe strategies
 * for a fixed virtual window, pick the best extrapolation, open-loop to target.
 */

import { LAUNCH_LOC, THRESHOLDS, TICK_MS } from '../game/constants';
import { GENS, UPGRADES } from '../game/data';
import { legalMoves, moveTable, visibleMoves } from '../game/availability';
import type { GameState } from '../types';
import { tickReducer } from '../game/tick';
import { setClock, setRandom } from '../game/runtime';
import { mulberry32 } from '../sim/Sim';
import {
  assessNeeds,
  pickAdaptiveMove,
  WEIGHTS_LOC,
  WEIGHTS_PROGRESS,
  type NeedWeights,
} from '../game/moveIntent';
import { calcBugPenalty, calcRates, genCost } from '../game/rates';
import { TRACE_PATIENCE_MS } from '../sim/bots';
import { locIncomePerMs } from './planHeuristic';

export type CruiseTarget =
  | { tag: 'shopUnlock'; upgradeId: string }
  | { tag: 'purchase'; moveId: string };

export interface CruiseStrategySpec {
  id: string;
  weights: NeedWeights;
  patienceMs: number;
}

export interface CruiseSegmentResult {
  ok: boolean;
  strategyId: string;
  startT: number;
  endT: number;
  endState: GameState;
  estimateMs: number;
  microMoves: { t: number; id: string; kind: string; target?: string }[];
}

export interface CruiseEstimateOpts {
  seed?: number;
  budgetMs?: number;
  probeMs?: number;
  eventDtMs?: number;
  recordMicro?: boolean;
  strategies?: CruiseStrategySpec[];
}

const DEFAULT_PROBE_MS = 45_000;
const DEFAULT_EVENT_DT_MS = 120_000;

export function steadyLocPerMs(state: GameState, minLocPerMs = 0.02): number {
  return locIncomePerMs(state, minLocPerMs);
}

export interface TargetGaps {
  walletLoc: number;
  totalLoc: number;
}

export function targetGaps(state: GameState, target: CruiseTarget): TargetGaps {
  if (target.tag === 'shopUnlock') {
    const def = UPGRADES.find((u) => u.id === target.upgradeId);
    const unlockAt = (def?.unlockAt ?? 0) * THRESHOLDS.upgradeUnlockFraction;
    return { walletLoc: 0, totalLoc: Math.max(0, unlockAt - state.totalLoc) };
  }
  if (target.moveId === 'launch') {
    return { walletLoc: 0, totalLoc: Math.max(0, LAUNCH_LOC - state.totalLoc) };
  }
  if (target.moveId.startsWith('buy_gen:')) {
    const genId = target.moveId.slice('buy_gen:'.length);
    const g = GENS.find((x) => x.id === genId);
    const cost = g ? genCost(g, state.genCounts[genId] ?? 0) : 0;
    return { walletLoc: Math.max(0, cost - state.loc), totalLoc: 0 };
  }
  const upgradeId = target.moveId.replace(/^buy_upgrade:/, '');
  const def = UPGRADES.find((u) => u.id === upgradeId);
  if (!def) return { walletLoc: 0, totalLoc: 0 };
  const unlockAt = def.unlockAt * THRESHOLDS.upgradeUnlockFraction;
  const inShop = state.unlockedUpgrades.includes(upgradeId);
  return {
    walletLoc: Math.max(0, def.cost - state.loc),
    totalLoc: inShop ? 0 : Math.max(0, unlockAt - state.totalLoc),
  };
}

/** Analytic ms-left from steady rates (optimistic lower bound). */
export function analyticCruiseMs(state: GameState, target: CruiseTarget, locPerMs?: number): number {
  const rate = locPerMs ?? steadyLocPerMs(state);
  if (rate <= 0) return Infinity;
  const gaps = targetGaps(state, target);
  const walletMs = gaps.walletLoc > 0 ? gaps.walletLoc / rate : 0;
  const totalMs = gaps.totalLoc > 0 ? gaps.totalLoc / rate : 0;
  return Math.max(walletMs, totalMs);
}

export function defaultCruiseStrategies(state: GameState, target: CruiseTarget): CruiseStrategySpec[] {
  const needs = assessNeeds(state);
  const wantsLaunch = target.tag === 'purchase' && target.moveId === 'launch';
  const needScaled: NeedWeights = {
    loc: 1 + needs.loc * 2,
    economy: 1 + needs.economy * 2,
    launch: 1 + needs.launch * 2,
    tokens: 1 + needs.tokens * 1.5,
    bugs: 1 + needs.bugs,
    tests: 1 + needs.tests,
  };
  return [
    { id: 'loc', weights: WEIGHTS_LOC, patienceMs: TRACE_PATIENCE_MS },
    { id: 'progress', weights: WEIGHTS_PROGRESS, patienceMs: TRACE_PATIENCE_MS },
    {
      id: 'loc-heavy',
      weights: {
        loc: 2.4,
        economy: 2.2,
        launch: wantsLaunch ? 2.5 : 1,
        tokens: 0.55,
        bugs: 0.35,
        tests: 0.3,
      },
      patienceMs: TRACE_PATIENCE_MS,
    },
    { id: 'need-scaled', weights: needScaled, patienceMs: TRACE_PATIENCE_MS },
  ];
}

function targetKey(target: CruiseTarget): string {
  return target.tag === 'shopUnlock' ? `unlock:${target.upgradeId}` : target.moveId;
}

function targetMet(state: GameState, t: number, target: CruiseTarget): boolean {
  if (target.tag === 'shopUnlock') {
    return state.unlockedUpgrades.includes(target.upgradeId);
  }
  const m = moveTable(state, t).all.find((x) => x.id === target.moveId);
  return m?.legal ?? false;
}

function tryApplyPurchase(
  state: GameState,
  t: number,
  target: CruiseTarget,
  recordMicro: boolean,
  microMoves: CruiseSegmentResult['microMoves'],
): GameState | null {
  if (target.tag === 'shopUnlock') return null;
  const m = moveTable(state, t).all.find((x) => x.id === target.moveId);
  if (!m?.legal) return null;
  const next = m.apply(state);
  if (next === state) return null;
  if (recordMicro) microMoves.push({ t, id: m.id, kind: m.kind, target: m.target });
  return next;
}

function nextEventDt(
  state: GameState,
  t: number,
  stopAt: number,
  maxEventDtMs: number,
): number {
  const candidates: number[] = [stopAt - t, maxEventDtMs];
  for (const m of visibleMoves(state, t)) {
    if (m.waitMs !== null && m.waitMs > 0) candidates.push(m.waitMs);
  }
  const buffRemaining = (state.agentBuffExpires ?? 0) - t;
  if (buffRemaining > 0) candidates.push(buffRemaining);
  return Math.max(TICK_MS, Math.min(...candidates));
}

export interface ProbeSample {
  spec: CruiseStrategySpec;
  locPerMs: number;
  totalLocPerMs: number;
  extrapolatedMs: number;
}

/** Fixed-window sample: measure actual deltas, extrapolate time-to-target. */
export function probeStrategy(
  startState: GameState,
  startT: number,
  target: CruiseTarget,
  spec: CruiseStrategySpec,
  seed: number,
  probeMs: number,
  eventDtMs: number,
): ProbeSample {
  const key = targetKey(target);
  let state = structuredClone(startState);
  let t = startT;
  const loc0 = state.loc;
  const totalLoc0 = state.totalLoc;

  setClock(() => t);
  setRandom(mulberry32((seed ^ spec.id.charCodeAt(0)) >>> 0));

  const stopAt = startT + probeMs;
  while (t < stopAt && !targetMet(state, t, target)) {
    const ctx = {
      state,
      visible: visibleMoves(state, t),
      legal: legalMoves(state, t),
      t,
    };
    const choice = pickAdaptiveMove(ctx, {
      weights: spec.weights,
      patienceMs: spec.patienceMs,
      tieBias: (m) => (m.id === key || (target.tag === 'purchase' && m.id === target.moveId) ? 40 : 0),
    });
    if (choice) {
      const next = choice.apply(state);
      if (next !== state) {
        state = next;
        continue;
      }
    }
    const dt = nextEventDt(state, t, stopAt, eventDtMs);
    if (dt <= 0) break;
    t += dt;
    setClock(() => t);
    state = tickReducer(state, dt);
  }

  const elapsed = Math.max(1, t - startT);
  const locPerMs = Math.max(0, (state.loc - loc0) / elapsed);
  const { locRate } = calcRates(state.genCounts, state.upgrades, state.tests ?? 0);
  const passive = (locRate * calcBugPenalty(state.bugs)) / 1000;
  const totalLocPerMs = Math.max(locPerMs, passive, (state.totalLoc - totalLoc0) / elapsed);
  const gaps = targetGaps(state, target);
  const walletMs = gaps.walletLoc > 0 && locPerMs > 0 ? gaps.walletLoc / locPerMs : 0;
  const totalMs = gaps.totalLoc > 0 && totalLocPerMs > 0 ? gaps.totalLoc / totalLocPerMs : 0;
  const extrapolatedMs = Math.max(walletMs, totalMs);

  return { spec, locPerMs, totalLocPerMs, extrapolatedMs };
}

export function pickCruiseStrategy(
  startState: GameState,
  startT: number,
  target: CruiseTarget,
  seed: number,
  opts: Pick<CruiseEstimateOpts, 'probeMs' | 'eventDtMs' | 'strategies'> = {},
): ProbeSample {
  const probeMs = opts.probeMs ?? DEFAULT_PROBE_MS;
  const eventDtMs = opts.eventDtMs ?? DEFAULT_EVENT_DT_MS;
  const strategies = opts.strategies ?? defaultCruiseStrategies(startState, target);

  let best: ProbeSample | null = null;
  for (const spec of strategies) {
    const sample = probeStrategy(startState, startT, target, spec, seed, probeMs, eventDtMs);
    if (!best || sample.extrapolatedMs < best.extrapolatedMs) best = sample;
  }
  return best!;
}

function runOpenLoop(
  startState: GameState,
  startT: number,
  target: CruiseTarget,
  spec: CruiseStrategySpec,
  seed: number,
  budgetMs: number,
  eventDtMs: number,
  recordMicro: boolean,
): CruiseSegmentResult | null {
  const key = targetKey(target);
  let state = structuredClone(startState);
  let t = startT;
  setClock(() => t);
  setRandom(mulberry32((seed ^ spec.id.charCodeAt(0)) >>> 0));
  const microMoves: CruiseSegmentResult['microMoves'] = [];
  const stopAt = startT + budgetMs;

  const applied = tryApplyPurchase(state, t, target, recordMicro, microMoves);
  if (applied) {
    return {
      ok: true,
      strategyId: spec.id,
      startT,
      endT: t,
      endState: applied,
      estimateMs: 0,
      microMoves,
    };
  }
  if (targetMet(state, t, target)) {
    return {
      ok: true,
      strategyId: spec.id,
      startT,
      endT: t,
      endState: state,
      estimateMs: 0,
      microMoves,
    };
  }

  while (t < stopAt) {
    const ctx = {
      state,
      visible: visibleMoves(state, t),
      legal: legalMoves(state, t),
      t,
    };
    const choice = pickAdaptiveMove(ctx, {
      weights: spec.weights,
      patienceMs: spec.patienceMs,
      tieBias: (m) => (m.id === key || (target.tag === 'purchase' && m.id === target.moveId) ? 40 : 0),
    });
    if (choice) {
      const next = choice.apply(state);
      if (next !== state) {
        state = next;
        if (recordMicro) {
          microMoves.push({ t, id: choice.id, kind: choice.kind, target: choice.target });
        }
        const bought = tryApplyPurchase(state, t, target, recordMicro, microMoves);
        if (bought) {
          return {
            ok: true,
            strategyId: spec.id,
            startT,
            endT: t,
            endState: bought,
            estimateMs: 0,
            microMoves,
          };
        }
        if (targetMet(state, t, target)) {
          return {
            ok: true,
            strategyId: spec.id,
            startT,
            endT: t,
            endState: state,
            estimateMs: analyticCruiseMs(startState, target),
            microMoves,
          };
        }
        continue;
      }
    }
    const dt = nextEventDt(state, t, stopAt, eventDtMs);
    if (dt <= 0) break;
    t += dt;
    setClock(() => t);
    state = tickReducer(state, dt);
    if (targetMet(state, t, target)) {
      const bought = tryApplyPurchase(state, t, target, recordMicro, microMoves);
      return {
        ok: true,
        strategyId: spec.id,
        startT,
        endT: t,
        endState: bought ?? state,
        estimateMs: analyticCruiseMs(startState, target),
        microMoves,
      };
    }
  }
  return null;
}

/** Probe → pick strategy → open-loop until target (or budget). */
export function solveCruiseByEstimate(
  startState: GameState,
  startT: number,
  target: CruiseTarget,
  opts: CruiseEstimateOpts = {},
): CruiseSegmentResult | null {
  const seed = opts.seed ?? 42;
  const budgetMs = opts.budgetMs ?? 3 * 3_600_000;
  const probeMs = opts.probeMs ?? DEFAULT_PROBE_MS;
  const eventDtMs = opts.eventDtMs ?? DEFAULT_EVENT_DT_MS;
  const recordMicro = opts.recordMicro ?? false;

  const picked = pickCruiseStrategy(startState, startT, target, seed, {
    probeMs,
    eventDtMs,
    strategies: opts.strategies,
  });

  const seg = runOpenLoop(
    startState,
    startT,
    target,
    picked.spec,
    seed,
    budgetMs,
    eventDtMs,
    recordMicro,
  );
  if (!seg) return null;
  return { ...seg, estimateMs: picked.extrapolatedMs };
}

export function metaTargetToCruise(target: {
  tag: 'shopUnlock';
  upgradeId: string;
} | {
  tag: 'purchase';
  move: { id: string };
}): CruiseTarget {
  if (target.tag === 'shopUnlock') return { tag: 'shopUnlock', upgradeId: target.upgradeId };
  return { tag: 'purchase', moveId: target.move.id };
}
