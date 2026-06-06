/**
 * Metaplan: level-2 purchase search + level-1 rate-based cruise (`cruiseEstimate`).
 */

import { GENS, UPGRADES } from '../game/data';
import { THRESHOLDS } from '../game/constants';
import { defaultState } from '../game/state';
import { boolBlocked, moveTable, type Move } from '../game/availability';
import type { GameState } from '../types';
import { setClock, setRandom, resetClock, resetRandom } from '../game/runtime';
import { mulberry32 } from '../sim/Sim';
import { pickAdaptiveMove } from '../game/moveIntent';
import type { Bot } from '../sim/Sim';
import { genCost } from '../game/rates';
import {
  defaultCruiseStrategies,
  metaTargetToCruise,
  solveCruiseByEstimate,
  type CruiseStrategySpec,
} from './cruiseEstimate';
import {
  goalRequiresLaunchFirst,
  measureGoalProgress,
  type PlanGoal,
  type PlanStep,
} from './planReach';
import { defaultPlanHeuristic, type PlanHeuristicFn } from './planHeuristic';

export function metaStateKey(state: GameState): string {
  const gens = Object.entries(state.genCounts)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}:${n}`)
    .join(',');
  return [
    state.launched ? 'L' : 'l',
    [...state.upgrades].sort().join(',') || '-',
    [...state.unlockedUpgrades].sort().join(',') || '-',
    gens || '-',
    `fr${state.fundingRound ?? 0}`,
    state.mcpApprovalPending ? 'mcp' : '',
  ].join('|');
}

export function moveMetaKey(m: Move): string {
  return m.id;
}

export type MetaTarget =
  | { tag: 'purchase'; move: Move }
  | { tag: 'shopUnlock'; upgradeId: string };

function upgradePrereqAncestors(targetId: string): Set<string> {
  const anc = new Set<string>();
  const walk = (id: string) => {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return;
    for (const r of def.requires ?? []) {
      if (!anc.has(r)) {
        anc.add(r);
        walk(r);
      }
    }
  };
  walk(targetId);
  return anc;
}

function shopUnlockFrontier(state: GameState): string[] {
  const frac = THRESHOLDS.upgradeUnlockFraction;
  const pending = UPGRADES.filter(
    (u) =>
      !state.upgrades.includes(u.id) &&
      !state.unlockedUpgrades.includes(u.id) &&
      (state.launched || !u.requiresLaunch),
  )
    .map((u) => ({ id: u.id, at: u.unlockAt * frac }))
    .filter((x) => x.at > state.totalLoc + 1)
    .sort((a, b) => a.at - b.at);
  if (pending.length === 0) return [];
  const nearest = pending[0]!.at;
  return pending.filter((x) => x.at <= nearest * 1.001).map((x) => x.id);
}

function shopUnlockCandidates(state: GameState, goal: PlanGoal): string[] {
  if (goal.kind === 'upgrade') {
    const ids = upgradePrereqAncestors(goal.id);
    ids.add(goal.id);
    const frac = THRESHOLDS.upgradeUnlockFraction;
    return [...ids].filter((id) => {
      if (state.upgrades.includes(id) || state.unlockedUpgrades.includes(id)) return false;
      const u = UPGRADES.find((x) => x.id === id);
      return u != null && u.unlockAt * frac > state.totalLoc + 1;
    });
  }
  return shopUnlockFrontier(state);
}

function purchaseOnPath(m: Move, goal: PlanGoal, state: GameState): boolean {
  if (m.id === 'launch') {
    if (state.launched) return false;
    if (goal.kind === 'upgrade') {
      const def = UPGRADES.find((u) => u.id === goal.id);
      return Boolean(def?.requiresLaunch);
    }
    return true;
  }
  if (m.kind === 'buy_upgrade' && m.target) {
    const u = UPGRADES.find((x) => x.id === m.target);
    if (!u) return false;
    if (!state.launched && u.requiresLaunch) return false;
    if (goal.kind === 'upgrade') {
      const anc = upgradePrereqAncestors(goal.id);
      anc.add(goal.id);
      return anc.has(m.target);
    }
    return true;
  }
  return true;
}

function rankMetaTarget(target: MetaTarget, state: GameState): number {
  if (target.tag === 'purchase' && target.move.legal) return 0;
  if (target.tag === 'purchase' && target.move.id === 'launch') return 1;
  if (target.tag === 'shopUnlock') {
    const u = UPGRADES.find((x) => x.id === target.upgradeId);
    const at = (u?.unlockAt ?? 0) * THRESHOLDS.upgradeUnlockFraction;
    return 10 + Math.max(0, at - state.totalLoc);
  }
  if (target.tag === 'purchase') {
    const m = target.move;
    if (m.kind === 'buy_upgrade' && m.target) {
      const u = UPGRADES.find((x) => x.id === m.target);
      if (u) {
        const affordGap = Math.max(0, u.cost - state.loc);
        const unlockAt = u.unlockAt * THRESHOLDS.upgradeUnlockFraction;
        const unlockGap = state.unlockedUpgrades.includes(m.target)
          ? 0
          : Math.max(0, unlockAt - state.totalLoc);
        return 20 + affordGap + unlockGap * 0.3;
      }
    }
    if (m.kind === 'buy_gen' && m.target) {
      const g = GENS.find((x) => x.id === m.target);
      const owned = state.genCounts[m.target] ?? 0;
      const cost = g ? genCost(g, owned) : 1e9;
      return 30 + Math.max(0, cost - state.loc);
    }
    return 40;
  }
  return 100;
}

function capMetaTargets(
  targets: MetaTarget[],
  state: GameState,
  max: number,
): MetaTarget[] {
  if (targets.length <= max) return targets;
  const pinned: MetaTarget[] = [];
  const rest: MetaTarget[] = [];
  for (const tg of targets) {
    if (tg.tag === 'purchase' && tg.move.legal) pinned.push(tg);
    else rest.push(tg);
  }
  rest.sort((a, b) => rankMetaTarget(a, state) - rankMetaTarget(b, state));
  const room = Math.max(0, max - pinned.length);
  return [...pinned, ...rest.slice(0, room)];
}

export function metaTargets(state: GameState, t: number, goal: PlanGoal): MetaTarget[] {
  const out: MetaTarget[] = [];
  const seen = new Set<string>();

  for (const uid of shopUnlockCandidates(state, goal)) {
    out.push({ tag: 'shopUnlock', upgradeId: uid });
  }

  const moves = moveTable(state, t).all.filter((m) => {
    if (m.kind !== 'buy_upgrade' && m.kind !== 'buy_gen' && m.id !== 'launch') return false;
    if (boolBlocked(m)) return false;
    return purchaseOnPath(m, goal, state);
  });

  for (const m of moves) {
    const key = moveMetaKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tag: 'purchase', move: m });
  }
  return out;
}

export function rankedMetaTargets(
  state: GameState,
  t: number,
  goal: PlanGoal,
  maxBranches: number,
): MetaTarget[] {
  return capMetaTargets(metaTargets(state, t, goal), state, maxBranches);
}

export function metaTargetKey(target: MetaTarget): string {
  return target.tag === 'shopUnlock' ? `unlock:${target.upgradeId}` : moveMetaKey(target.move);
}

const cruiseCache = new Map<string, CruiseSegmentResult | null>();

export interface CruiseSegmentResult {
  ok: boolean;
  strategyId: string;
  startT: number;
  endT: number;
  endState: GameState;
  microMoves: { t: number; id: string; kind: string; target?: string }[];
}

export function solveCruiseSegment(
  startState: GameState,
  startT: number,
  target: MetaTarget,
  seed: number,
  opts: { budgetMs?: number } = {},
): CruiseSegmentResult | null {
  const cacheKey = `${metaStateKey(startState)}|${metaTargetKey(target)}|${seed}`;
  if (cruiseCache.has(cacheKey)) return cruiseCache.get(cacheKey)!;

  const est = solveCruiseByEstimate(startState, startT, metaTargetToCruise(target), {
    seed,
    budgetMs: opts.budgetMs ?? 3 * 3_600_000,
    recordMicro: false,
    probeMs: 30_000,
    eventDtMs: 120_000,
  });

  const best: CruiseSegmentResult | null = est
    ? {
        ok: est.ok,
        strategyId: est.strategyId,
        startT: est.startT,
        endT: est.endT,
        endState: est.endState,
        microMoves: est.microMoves,
      }
    : null;

  cruiseCache.set(cacheKey, best);
  return best;
}

export function clearMetaPlanCaches(): void {
  cruiseCache.clear();
}

export interface MetaPlanOpts {
  seed?: number;
  maxMetaStates?: number;
  maxMetaBranches?: number;
  maxTimeMs?: number;
  maxCruiseMs?: number;
  heuristic?: PlanHeuristicFn;
  heuristicWeight?: number;
  stagedLaunch?: boolean | 'auto';
}

export interface MetaPlanResult {
  goal: PlanGoal;
  totalMs: number;
  steps: PlanStep[];
  segments: { purchase: string; strategyId: string; cruiseMs: number }[];
  metaStatesVisited: number;
  truncated: boolean;
  endState: GameState;
}

interface MetaNode {
  t: number;
  prio: number;
  state: GameState;
  steps: PlanStep[];
  segments: MetaPlanResult['segments'];
}

function goalMet(state: GameState, goal: PlanGoal): boolean {
  return measureGoalProgress(state, goal).progress >= 1;
}

class MetaHeap {
  private a: MetaNode[] = [];
  get length() {
    return this.a.length;
  }
  push(n: MetaNode) {
    this.a.push(n);
    this.bubbleUp(this.a.length - 1);
  }
  pop(): MetaNode | undefined {
    if (this.a.length === 0) return undefined;
    const top = this.a[0]!;
    const last = this.a.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }
  private bubbleUp(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p]!.prio <= this.a[i]!.prio) break;
      [this.a[p], this.a[i]] = [this.a[i]!, this.a[p]!];
      i = p;
    }
  }
  private bubbleDown(i: number) {
    const n = this.a.length;
    while (true) {
      let s = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.a[l]!.prio < this.a[s]!.prio) s = l;
      if (r < n && this.a[r]!.prio < this.a[s]!.prio) s = r;
      if (s === i) break;
      [this.a[s], this.a[i]] = [this.a[i]!, this.a[s]!];
      i = s;
    }
  }
}

function runMetaSearchOnce(
  goal: PlanGoal,
  opts: MetaPlanOpts,
  startState: GameState,
  startT: number,
  startSteps: PlanStep[],
  startSegments: MetaPlanResult['segments'],
  stateBudget: number,
): MetaPlanResult | null {
  const seed = opts.seed ?? 42;
  const maxTimeMs = opts.maxTimeMs ?? 8 * 3_600_000;
  const maxCruiseMs = opts.maxCruiseMs ?? 3 * 3_600_000;
  const maxMetaBranches = opts.maxMetaBranches ?? 8;
  const hFn = opts.heuristic ?? defaultPlanHeuristic;
  const hW = opts.heuristicWeight ?? 1;

  if (goalMet(startState, goal)) {
    return {
      goal,
      totalMs: startT,
      steps: startSteps,
      segments: startSegments,
      metaStatesVisited: 0,
      truncated: false,
      endState: startState,
    };
  }

  const best = new Map<string, number>();
  const heap = new MetaHeap();
  const nodePrio = (t: number, state: GameState) => t + hFn(state, goal) * hW;

  heap.push({
    t: startT,
    prio: nodePrio(startT, startState),
    state: startState,
    steps: startSteps,
    segments: startSegments,
  });
  best.set(metaStateKey(startState), startT);

  let visited = 0;
  let result: MetaPlanResult | null = null;

  while (heap.length > 0 && visited < stateBudget) {
    const cur = heap.pop()!;
    const k = metaStateKey(cur.state);
    if (cur.t > (best.get(k) ?? Infinity)) continue;
    visited += 1;

    if (goalMet(cur.state, goal)) {
      result = {
        goal,
        totalMs: cur.t,
        steps: cur.steps,
        segments: cur.segments,
        metaStatesVisited: visited,
        truncated: false,
        endState: cur.state,
      };
      break;
    }

    if (cur.t >= maxTimeMs) continue;

    for (const target of rankedMetaTargets(cur.state, cur.t, goal, maxMetaBranches)) {
      if (target.tag === 'purchase' && target.move.legal) {
        setClock(() => cur.t);
        setRandom(mulberry32(seed));
        const next = target.move.apply(cur.state);
        if (next === cur.state) continue;
        const key = metaStateKey(next);
        const t = cur.t;
        if (best.get(key) != null && t >= best.get(key)!) continue;
        best.set(key, t);
        heap.push({
          t,
          prio: nodePrio(t, next),
          state: next,
          steps: [
            ...cur.steps,
            {
              t,
              waitMs: 0,
              moveId: target.move.id,
              moveKind: target.move.kind,
              target: target.move.target,
            },
          ],
          segments: [
            ...cur.segments,
            { purchase: metaTargetKey(target), strategyId: 'instant', cruiseMs: 0 },
          ],
        });
        continue;
      }

      const cruise = solveCruiseSegment(cur.state, cur.t, target, seed, {
        budgetMs: Math.min(maxCruiseMs, maxTimeMs - cur.t),
      });
      if (!cruise) continue;

      const key = metaStateKey(cruise.endState);
      if (best.get(key) != null && cruise.endT >= best.get(key)!) continue;
      best.set(key, cruise.endT);

      heap.push({
        t: cruise.endT,
        prio: nodePrio(cruise.endT, cruise.endState),
        state: cruise.endState,
        steps: cur.steps,
        segments: [
          ...cur.segments,
          {
            purchase: metaTargetKey(target),
            strategyId: cruise.strategyId,
            cruiseMs: cruise.endT - cur.t,
          },
        ],
      });
    }
  }

  if (!result && visited >= stateBudget) {
    return {
      goal,
      totalMs: 0,
      steps: [],
      segments: [],
      metaStatesVisited: visited,
      truncated: true,
      endState: startState,
    };
  }

  return result;
}

export function metaPlanShortestPath(goal: PlanGoal, opts: MetaPlanOpts = {}): MetaPlanResult | null {
  cruiseCache.clear();
  const maxMetaStates = opts.maxMetaStates ?? 400;
  const staged =
    opts.stagedLaunch === false
      ? false
      : opts.stagedLaunch === true
        ? true
        : goalRequiresLaunchFirst(goal, defaultState());

  setClock(() => 0);
  const fresh = defaultState();

  let out: MetaPlanResult | null;

  if (!staged || goal.kind === 'launched') {
    out = runMetaSearchOnce(goal, opts, fresh, 0, [], [], maxMetaStates);
  } else {
    const launchBudget = Math.floor(maxMetaStates * 0.4);
    const mainBudget = maxMetaStates - launchBudget;
    const launchPhase = runMetaSearchOnce(
      { kind: 'launched' },
      opts,
      fresh,
      0,
      [],
      [],
      launchBudget,
    );
    if (!launchPhase || launchPhase.truncated || !launchPhase.endState.launched) {
      resetClock();
      resetRandom();
      return launchPhase;
    }
    const main = runMetaSearchOnce(
      goal,
      opts,
      launchPhase.endState,
      launchPhase.totalMs,
      launchPhase.steps,
      launchPhase.segments,
      mainBudget,
    );
    out = main
      ? {
          ...main,
          metaStatesVisited: launchPhase.metaStatesVisited + main.metaStatesVisited,
          truncated: launchPhase.truncated || main.truncated,
        }
      : launchPhase;
  }

  resetClock();
  resetRandom();
  return out;
}

function strategyFromId(
  id: string,
  target: MetaTarget,
  state: GameState,
): CruiseStrategySpec {
  if (id === 'instant') {
    return defaultCruiseStrategies(state, metaTargetToCruise(target))[0]!;
  }
  return (
    defaultCruiseStrategies(state, metaTargetToCruise(target)).find((s) => s.id === id) ??
    defaultCruiseStrategies(state, metaTargetToCruise(target))[0]!
  );
}

function metaTargetFromKey(state: GameState, t: number, purchase: string): MetaTarget | null {
  if (purchase.startsWith('unlock:')) {
    return { tag: 'shopUnlock', upgradeId: purchase.slice(7) };
  }
  const m = moveTable(state, t).all.find((x) => moveMetaKey(x) === purchase);
  if (m) return { tag: 'purchase', move: m };
  return null;
}

export function metaPlanBot(goal: PlanGoal, opts: MetaPlanOpts = {}): Bot {
  const plan = metaPlanShortestPath(goal, { maxMetaBranches: 8, ...opts });
  const segments = plan?.segments ?? [];
  let segIdx = 0;

  return (ctx) => {
    if (segIdx >= segments.length) return null;

    const seg = segments[segIdx]!;
    const target = metaTargetFromKey(ctx.state, ctx.t, seg.purchase);
    if (!target) return null;

    if (target.tag === 'shopUnlock') {
      if (ctx.state.unlockedUpgrades.includes(target.upgradeId)) {
        segIdx += 1;
        return null;
      }
    } else {
      const m = moveTable(ctx.state, ctx.t).all.find((x) => x.id === target.move.id);
      if (m?.legal) {
        segIdx += 1;
        return m;
      }
    }

    const spec = strategyFromId(seg.strategyId, target, ctx.state);
    const targetKey = metaTargetKey(target);
    return pickAdaptiveMove(ctx, {
      weights: spec.weights,
      patienceMs: spec.patienceMs,
      tieBias: (m) => (moveMetaKey(m) === targetKey ? 40 : 0),
    });
  };
}
