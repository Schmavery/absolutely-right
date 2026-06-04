import { ACTION_DURATION_MS, LAUNCH_LOC, LOC_PER_CLICK_POWER, THRESHOLDS } from '../game/constants';
import { action, UPGRADES } from '../game/data';
import { defaultState, withBugs } from '../game/state';
import { getPhase } from '../game/phases';
import { moveTable, visibleMoves, type Move } from '../game/availability';
import type { GameState } from '../types';
import { setClock, setRandom, resetClock, resetRandom, now } from '../game/runtime';
import { tickReducer } from '../game/tick';
import { appendLog } from '../game/log';
import { calcClickBonus, calcClickPower, calcRates } from '../game/rates';
import { filterMovesForPlanner } from '../game/moveIntent';
import { render } from '../lib/template';
import { mulberry32 } from '../sim/Sim';
import { fmtLoc, fmtTime } from './traceAnalyze';

export type PlanGoal =
  | { kind: 'launched' }
  | { kind: 'upgrade'; id: string }
  | { kind: 'phase'; index: number };

export interface PlanStep {
  t: number;
  waitMs: number;
  /** Extra ms from planner `promptCostMult` / `promptPenaltyMs` (not sim physics). */
  promptFrictionMs?: number;
  moveId: string;
  moveKind: string;
  target?: string;
}

export interface PlanResult {
  goal: PlanGoal;
  totalMs: number;
  steps: PlanStep[];
  statesVisited: number;
  truncated: boolean;
  /** Witness from closest frontier when search budget ran out before the goal. */
  bestEffort?: boolean;
  /** Goal progress 0–1 when `bestEffort` (from `measureGoalProgress`). */
  progress?: number;
  progressLabel?: string;
}

export type PlanFailureReason = 'state_budget' | 'time_budget' | 'exhausted';

export interface PlanGoalProgress {
  /** 0–1 toward the goal (1 = satisfied). */
  progress: number;
  label: string;
}

export interface PlanClosestSnapshot {
  progress: PlanGoalProgress;
  totalMs: number;
  steps: PlanStep[];
  loc: number;
  totalLoc: number;
  tokens: number;
  phase: number;
  upgrades: string[];
  unlockedUpgrades: string[];
  launched: boolean;
  genCounts: Record<string, number>;
}

/**
 * Edge-cost tuning for the planner search (not in-game balance).
 * Dijkstra minimizes total virtual time; these shape how expensive each move feels.
 */
/** Worker-safe progress tick (no full witness steps). */
export interface PlanClosestStream {
  progress: PlanGoalProgress;
  totalMs: number;
  loc: number;
  totalLoc: number;
  tokens: number;
  phase: number;
  upgrades: string[];
  unlockedUpgrades: string[];
  launched: boolean;
  genCounts: Record<string, number>;
  stepCount: number;
}

export interface PlanSearchProgress {
  statesVisited: number;
  maxStates: number;
  closest: PlanClosestStream | null;
}

export interface PlanSearchOpts {
  maxStates?: number;
  maxTimeMs?: number;
  seed?: number;
  /**
   * Multiplier on prompt step duration (idle + cooldown + action).
   * 1 = model timing only; 2+ = discourage prompt spam vs kicks/gens/tests.
   */
  promptCostMult?: number;
  /** Flat virtual ms added after every prompt (click fatigue / approval UX). */
  promptPenaltyMs?: number;
  /** Report search progress every N states visited (worker / UI streaming). */
  progressEveryStates?: number;
  onProgress?: (p: PlanSearchProgress) => void;
  /** Drop low-value actions (keeps buys, launch, goal-relevant shop). Default true. */
  filterMoves?: boolean;
  /** Goal-directed upgrade shop pruning for `upgrade` goals. Default true. */
  pruneShop?: boolean;
  /** Expand by f = t + weight×h (weight above 1 = greedier, best-effort). Default true. */
  useAStar?: boolean;
  /** Heuristic scale on A* priority (default 1.35 — not admissible, finds goals faster). */
  heuristicWeight?: number;
  /** When search stops early, promote closest frontier if progress ≥ threshold. Default true. */
  acceptBestEffort?: boolean;
  /** Min goal progress 0–1 to accept a best-effort witness (default 0.06). */
  minBestEffortProgress?: number;
  /**
   * Post-launch goals: search to launch first, then continue from that witness.
   * `auto` = on when the goal needs `launched` from a fresh save. Default `auto`.
   */
  stagedLaunch?: boolean | 'auto';
  /** Fraction of `maxStates` for the launch phase (default 0.45). */
  launchPhaseStateFraction?: number;
}

export interface PlanSearchOutcome {
  result: PlanResult | null;
  /** Best frontier state when search fails (highest goal progress, then lowest time). */
  closest: PlanClosestSnapshot | null;
  statesVisited: number;
  maxStates: number;
  maxTimeMs: number;
  promptCostMult: number;
  promptPenaltyMs: number;
  truncated: boolean;
  exhausted: boolean;
  failureReason: PlanFailureReason | null;
  /** Search ran launch phase then goal phase from the launch witness. */
  stagedLaunch?: boolean;
  launchPhaseStatesVisited?: number;
}

interface SearchRestart {
  state: GameState;
  t: number;
  steps: PlanStep[];
}

interface PhaseSearchResult {
  result: PlanResult | null;
  closest: PlanClosestSnapshot | null;
  statesVisited: number;
  searchTruncated: boolean;
  exhausted: boolean;
  failureReason: PlanFailureReason | null;
  /** Best node to continue a staged search (prefer launched). */
  restart: SearchRestart | null;
}

function goalMet(state: GameState, goal: PlanGoal): boolean {
  return measureGoalProgress(state, goal).progress >= 1;
}

/** Monotone-ish distance to goal for ranking partial search frontiers. */
export function measureGoalProgress(state: GameState, goal: PlanGoal): PlanGoalProgress {
  switch (goal.kind) {
    case 'launched': {
      if (state.launched) return { progress: 1, label: 'launched' };
      const locFrac = Math.min(1, state.totalLoc / LAUNCH_LOC);
      const btn = state.totalLoc >= LAUNCH_LOC && !state.launched;
      const progress = Math.min(0.999, locFrac * (btn ? 0.95 : 0.85));
      return {
        progress,
        label: btn
          ? `launch ready · ${fmtLoc(state.totalLoc)} total LOC`
          : `${fmtLoc(state.totalLoc)} / ${fmtLoc(LAUNCH_LOC)} total LOC`,
      };
    }
    case 'upgrade': {
      const id = goal.id;
      if (state.upgrades.includes(id)) return { progress: 1, label: `owns ${id}` };
      const def = UPGRADES.find((u) => u.id === id);
      if (!def) return { progress: 0, label: `unknown upgrade ${id}` };

      const parts: string[] = [];
      let score = 0;

      const reqs = def.requires ?? [];
      if (reqs.length > 0) {
        const met = reqs.filter((r) => state.upgrades.includes(r)).length;
        const frac = met / reqs.length;
        score += 0.35 * frac;
        parts.push(`requires ${met}/${reqs.length}`);
      } else {
        score += 0.35;
      }

      const unlockAt = def.unlockAt * THRESHOLDS.upgradeUnlockFraction;
      const unlockFrac = Math.min(1, state.totalLoc / unlockAt);
      if (state.unlockedUpgrades.includes(id)) {
        score += 0.25;
        parts.push('in shop');
      } else {
        score += 0.25 * unlockFrac;
        parts.push(`${fmtLoc(state.totalLoc)} / ${fmtLoc(unlockAt)} reveal`);
      }

      const affordFrac = Math.min(1, state.loc / def.cost);
      score += 0.4 * affordFrac;
      parts.push(`${fmtLoc(state.loc)} / ${fmtLoc(def.cost)} wallet`);

      return {
        progress: Math.min(0.999, score),
        label: `${id} · ${parts.join(' · ')}`,
      };
    }
    case 'phase': {
      const phase = getPhase(state);
      if (phase >= goal.index) {
        return { progress: 1, label: `phase ${phase} (target ${goal.index})` };
      }
      const progress =
        goal.index <= 0 ? 0 : Math.min(0.999, phase / goal.index);
      return {
        progress,
        label: `phase ${phase} → ${goal.index}`,
      };
    }
  }
}

function nodeToClosest(node: Node, progress: PlanGoalProgress): PlanClosestSnapshot {
  const s = node.state;
  return {
    progress,
    totalMs: node.t,
    steps: node.steps,
    loc: s.loc,
    totalLoc: s.totalLoc,
    tokens: s.tokens,
    phase: getPhase(s),
    upgrades: [...s.upgrades],
    unlockedUpgrades: [...s.unlockedUpgrades],
    launched: s.launched,
    genCounts: { ...s.genCounts },
  };
}

function nodeToClosestStream(node: Node, progress: PlanGoalProgress): PlanClosestStream {
  const full = nodeToClosest(node, progress);
  const { steps, ...rest } = full;
  return { ...rest, stepCount: steps.length };
}

function emitProgress(
  statesVisited: number,
  maxStates: number,
  closest: { node: Node; progress: PlanGoalProgress } | null,
  onProgress: (p: PlanSearchProgress) => void,
): void {
  onProgress({
    statesVisited,
    maxStates,
    closest: closest ? nodeToClosestStream(closest.node, closest.progress) : null,
  });
}

function beatsClosest(
  cur: Node,
  curProgress: PlanGoalProgress,
  best: { node: Node; progress: PlanGoalProgress } | null,
): boolean {
  if (!best) return true;
  if (curProgress.progress > best.progress.progress) return true;
  if (curProgress.progress < best.progress.progress) return false;
  return cur.t < best.node.t;
}

/** Economic state — must not collapse distinct afford / cooldown futures. */
function stateKey(state: GameState, t: number): string {
  const gens = Object.entries(state.genCounts)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}:${n}`)
    .join(',');
  const loc = Math.floor(state.loc);
  const tok = Math.floor(state.tokens);
  const totalLoc = Math.floor(state.totalLoc);
  const buffLeft = Math.max(0, (state.agentBuffExpires ?? 0) - t);
  const unlocked = [...state.unlockedUpgrades].sort().join(',');
  const events = [...state.usedEventIds].sort().join(',');
  return `${state.launched ? 1 : 0}|${[...state.upgrades].sort().join(',')}|u:${unlocked}|${gens}|loc:${loc}|tl:${totalLoc}|tok:${tok}|bugs:${Math.floor(state.bugs)}|tests:${state.tests}|clk:${state.totalClicks}|buff:${buffLeft}|ev:${events}`;
}

function fastForward(state: GameState, t: number, dtMs: number): GameState {
  if (dtMs <= 0) return state;
  setClock(() => t + dtMs);
  return tickReducer(state, dtMs);
}

function isOnCooldown(prev: GameState, key: string, ms: number): boolean {
  return now() - (prev.actionCooldowns[key] ?? 0) < ms;
}

function startCooldown(prev: GameState, key: string): GameState {
  return {
    ...prev,
    actionCooldowns: { ...prev.actionCooldowns, [key]: now() },
  };
}

/**
 * Prompt for planner: scripted early lines only, no RNG bugs/events.
 * Keeps the search graph finite while modeling LOC grind + log stream cost.
 */
export function applyPlanPrompt(prev: GameState): GameState {
  const a = action('prompt');
  if (a.cooldownMs && isOnCooldown(prev, 'prompt', a.cooldownMs)) return prev;
  const power = calcClickPower(prev.upgrades);
  const locGain = power * LOC_PER_CLICK_POWER + calcClickBonus(prev.upgrades);
  let next: GameState = {
    ...prev,
    loc: prev.loc + locGain,
    ...withBugs(prev, prev.bugs),
    totalLoc: prev.totalLoc + locGain,
    totalClicks: prev.totalClicks + 1,
    started: true,
  };
  const scripted = a.earlyPromptMsgs ?? [];
  if (prev.totalClicks < scripted.length) {
    next = appendLog(next, render(scripted[prev.totalClicks]!), 'info');
  }
  if (a.cooldownMs) next = startCooldown(next, 'prompt');
  return next;
}

/** Deterministic kick: first message pool entry, no random events. */
export function applyPlanKick(prev: GameState): GameState {
  const a = action('kick_agent');
  if (a.tokenCost != null && prev.tokens < a.tokenCost) return prev;
  if (now() < (prev.agentBuffExpires ?? 0)) return prev;
  let next: GameState = {
    ...prev,
    tokens: prev.tokens - (a.tokenCost ?? 0),
    totalTokensSpent: (prev.totalTokensSpent ?? 0) + (a.tokenCost ?? 0),
    agentBuffExpires: now() + (a.buffMs ?? 0),
  };
  const msg = a.messages?.[0];
  if (msg) next = appendLog(next, render(msg), 'info');
  return next;
}

/** Caller must `setClock` to the step time before invoking. */
function applyPlanAction(state: GameState, move: Move): GameState {
  if (move.id === 'prompt') return applyPlanPrompt(state);
  if (move.id === 'kick_agent') return applyPlanKick(state);
  return move.apply(state);
}

interface StepCostOpts {
  promptCostMult: number;
  promptPenaltyMs: number;
}

function stepMove(
  state: GameState,
  t: number,
  move: Move,
  cost: StepCostOpts,
): {
  state: GameState;
  t: number;
  waitMs: number;
  promptFrictionMs: number;
} | null {
  const startT = t;
  const table = moveTable(state, t);
  const m = table.byId[move.id];
  if (!m || !m.visible) return null;

  let s = state;
  let curT = t;
  let waitMs = 0;

  setClock(() => curT);
  const gate = moveTable(s, curT).byId[move.id];
  if (!gate) return null;

  if (!gate.legal) {
    if (gate.waitMs == null || gate.waitMs === Infinity) return null;
    waitMs = gate.waitMs;
    s = fastForward(s, curT, waitMs);
    curT += waitMs;
    setClock(() => curT);
    const again = moveTable(s, curT).byId[move.id];
    if (!again?.legal) return null;
  }

  const before = s;
  setClock(() => curT);
  const resolved = moveTable(s, curT).byId[move.id];
  if (!resolved?.legal) return null;
  s = applyPlanAction(s, move);
  if (s === before) return null;

  const actionDt =
    move.id === 'prompt'
      ? action('prompt').cooldownMs ?? ACTION_DURATION_MS
      : ACTION_DURATION_MS;
  if (actionDt > 0) {
    s = fastForward(s, curT, actionDt);
    curT += actionDt;
  }

  let promptFrictionMs = 0;
  if (move.id === 'prompt') {
    const baseDt = curT - startT;
    const scaledT = startT + Math.round(baseDt * cost.promptCostMult) + cost.promptPenaltyMs;
    promptFrictionMs = scaledT - curT;
    curT = scaledT;
  }

  return { state: s, t: curT, waitMs, promptFrictionMs };
}

/** All `requires` ancestors for an upgrade (not including the target). */
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

/** Optimistic lower bound on ms left (current rates only — guides A*, not game balance). */
function planHeuristic(state: GameState, goal: PlanGoal): number {
  if (goalMet(state, goal)) return 0;
  const { locRate } = calcRates(state.genCounts, state.upgrades, state.tests ?? 0);
  const prompt = action('prompt');
  const cd = Math.max(1, prompt.cooldownMs ?? 4000);
  const clickLoc =
    calcClickPower(state.upgrades) * LOC_PER_CLICK_POWER + calcClickBonus(state.upgrades);
  const locPerMs = locRate / 1000 + clickLoc / cd;
  const floor = locPerMs > 1e-6 ? locPerMs : 0.02;

  switch (goal.kind) {
    case 'launched': {
      const gap = Math.max(0, LAUNCH_LOC - state.totalLoc);
      return gap / floor;
    }
    case 'upgrade': {
      const def = UPGRADES.find((u) => u.id === goal.id);
      if (!def) return 0;
      let gap = Math.max(0, def.cost - state.loc);
      const unlockAt = def.unlockAt * THRESHOLDS.upgradeUnlockFraction;
      gap = Math.max(gap, Math.max(0, unlockAt - state.totalLoc) * 0.35);
      for (const r of def.requires ?? []) {
        if (!state.upgrades.includes(r)) {
          const rd = UPGRADES.find((u) => u.id === r);
          if (rd) gap += rd.cost;
        }
      }
      if (def.requiresLaunch && !state.launched) {
        gap += Math.max(0, LAUNCH_LOC - state.totalLoc) * 0.5;
      }
      return gap / floor;
    }
    case 'phase': {
      const cur = getPhase(state);
      const gap = Math.max(0, goal.index - cur);
      return (gap * LAUNCH_LOC * 0.35) / floor;
    }
  }
}

function pruneUpgradeShop(moves: Move[], goal: PlanGoal): Move[] {
  if (goal.kind === 'upgrade') {
    const ancestors = upgradePrereqAncestors(goal.id);
    return moves.filter((m) => {
      if (m.kind !== 'buy_upgrade' || !m.target) return true;
      return m.target === goal.id || ancestors.has(m.target);
    });
  }
  if (goal.kind === 'launched') {
    return moves.filter((m) => {
      if (m.kind !== 'buy_upgrade' || !m.target) return true;
      const u = UPGRADES.find((x) => x.id === m.target);
      if (!u) return false;
      if (u.requiresLaunch) return false;
      if (u.cost > 250_000) return false;
      return true;
    });
  }
  return moves;
}

function searchCandidates(
  state: GameState,
  t: number,
  goal: PlanGoal,
  filterMoves: boolean,
  pruneShop: boolean,
): Move[] {
  let moves = visibleMoves(state, t);
  if (filterMoves) moves = filterMovesForPlanner(moves, state, t, { minScore: 0.2 });
  if (pruneShop) moves = pruneUpgradeShop(moves, goal);
  return moves;
}

const LAUNCH_PLAN_GOAL: PlanGoal = { kind: 'launched' };

/** True when a fresh run must reach launch before the stated goal is meaningful. */
export function goalRequiresLaunchFirst(goal: PlanGoal, state: GameState): boolean {
  if (state.launched) return false;
  if (goal.kind === 'launched') return false;
  if (goal.kind === 'phase' && goal.index >= 2) return true;
  if (goal.kind === 'upgrade') {
    const def = UPGRADES.find((u) => u.id === goal.id);
    if (!def) return false;
    if (def.requiresLaunch) return true;
    for (const id of upgradePrereqAncestors(goal.id)) {
      if (UPGRADES.find((u) => u.id === id)?.requiresLaunch) return true;
    }
  }
  return false;
}

function nodeToRestart(node: Node): SearchRestart {
  return {
    state: node.state,
    t: node.t,
    steps: node.steps,
  };
}

function pickLaunchRestart(phase: PhaseSearchResult): SearchRestart | null {
  if (phase.restart?.state.launched) return phase.restart;
  return null;
}

function shouldStageLaunch(goal: PlanGoal, opts: PlanSearchOpts): boolean {
  const mode = opts.stagedLaunch ?? 'auto';
  if (mode === false) return false;
  if (mode === true) return goalRequiresLaunchFirst(goal, defaultState());
  return goalRequiresLaunchFirst(goal, defaultState());
}

function launchPhaseBudget(maxStates: number, fraction: number): number {
  const launch = Math.floor(maxStates * fraction);
  return Math.min(Math.max(2000, launch), maxStates - 1000);
}

/** Priority-queue node: `prio` is sort key (f = t + h for A*, else t). */
interface Node {
  t: number;
  prio: number;
  state: GameState;
  steps: PlanStep[];
}

class MinHeap {
  private a: Node[] = [];

  get length(): number {
    return this.a.length;
  }

  push(n: Node): void {
    this.a.push(n);
    this.bubbleUp(this.a.length - 1);
  }

  pop(): Node | undefined {
    if (this.a.length === 0) return undefined;
    const top = this.a[0]!;
    const last = this.a.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p]!.prio <= this.a[i]!.prio) break;
      [this.a[p], this.a[i]] = [this.a[i]!, this.a[p]!];
      i = p;
    }
  }

  private bubbleDown(i: number): void {
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

function resolveLaunchRestart(
  result: PlanResult | null,
  goalNode: Node | null,
  closest: { node: Node; progress: PlanGoalProgress } | null,
  closestPlayed: { node: Node; progress: PlanGoalProgress } | null,
): SearchRestart | null {
  if (goalNode?.state.launched) return nodeToRestart(goalNode);
  if (closestPlayed?.node.state.launched) return nodeToRestart(closestPlayed.node);
  if (closest?.node.state.launched) return nodeToRestart(closest.node);
  if (result && closestPlayed) return nodeToRestart(closestPlayed.node);
  return null;
}

function runPlanSearchOnce(
  goal: PlanGoal,
  opts: PlanSearchOpts,
  restart: SearchRestart,
  stateBudget: number,
  progressOffset: number,
): PhaseSearchResult {
  const maxTimeMs = opts.maxTimeMs ?? 10 * 3_600_000;
  const promptCostMult = Math.max(1, opts.promptCostMult ?? 1);
  const promptPenaltyMs = Math.max(0, opts.promptPenaltyMs ?? 0);
  const progressEvery = Math.max(50, opts.progressEveryStates ?? 500);
  const onProgress = opts.onProgress;
  const maxStatesTotal = opts.maxStates ?? 8000;
  const filterMoves = opts.filterMoves ?? true;
  const pruneShop = opts.pruneShop ?? true;
  const useAStar = opts.useAStar ?? true;
  const hWeight = opts.heuristicWeight ?? 1.15;
  const acceptBestEffort = opts.acceptBestEffort ?? true;
  const minBestEffortProgress = opts.minBestEffortProgress ?? 0.001;
  const stepCost: StepCostOpts = { promptCostMult, promptPenaltyMs };

  const nodePrio = (t: number, state: GameState) => {
    if (!useAStar) return t;
    return t + planHeuristic(state, goal) * hWeight;
  };

  const start = restart.state;
  const startT = restart.t;
  if (goalMet(start, goal)) {
    return {
      result: {
        goal,
        totalMs: startT,
        steps: restart.steps,
        statesVisited: 0,
        truncated: false,
      },
      closest: null,
      statesVisited: 0,
      searchTruncated: false,
      exhausted: false,
      failureReason: null,
      restart: nodeToRestart({
        t: startT,
        prio: startT,
        state: start,
        steps: restart.steps,
      }),
    };
  }

  const best = new Map<string, number>();
  const heap = new MinHeap();
  heap.push({
    t: startT,
    prio: nodePrio(startT, start),
    state: start,
    steps: restart.steps,
  });
  best.set(stateKey(start, startT), startT);

  let statesVisited = 0;
  let result: PlanResult | null = null;
  let goalNode: Node | null = null;
  let closest: { node: Node; progress: PlanGoalProgress } | null = null;
  let closestPlayed: { node: Node; progress: PlanGoalProgress } | null = null;

  const push = (n: Omit<Node, 'prio'>) => {
    const norm = { ...n };
    const k = stateKey(norm.state, norm.t);
    const prev = best.get(k);
    if (prev != null && norm.t >= prev) return;
    best.set(k, norm.t);
    heap.push({ ...norm, prio: nodePrio(norm.t, norm.state) });
  };

  while (heap.length > 0 && statesVisited < stateBudget) {
    const cur = heap.pop()!;
    const k = stateKey(cur.state, cur.t);
    if (cur.t > (best.get(k) ?? Infinity)) continue;
    statesVisited += 1;

    const curProgress = measureGoalProgress(cur.state, goal);
    if (beatsClosest(cur, curProgress, closest)) {
      closest = { node: cur, progress: curProgress };
      if (onProgress) {
        emitProgress(
          progressOffset + statesVisited,
          maxStatesTotal,
          closest,
          onProgress,
        );
      }
    }
    if (cur.steps.length > 0 && beatsClosest(cur, curProgress, closestPlayed)) {
      closestPlayed = { node: cur, progress: curProgress };
    }
    if (onProgress && statesVisited % progressEvery === 0) {
      emitProgress(progressOffset + statesVisited, maxStatesTotal, closest, onProgress);
    }

    if (goalMet(cur.state, goal)) {
      goalNode = cur;
      result = {
        goal,
        totalMs: cur.t,
        steps: cur.steps,
        statesVisited: progressOffset + statesVisited,
        truncated: false,
      };
      break;
    }

    if (cur.t >= maxTimeMs) continue;

    setClock(() => cur.t);
    const candidates = searchCandidates(cur.state, cur.t, goal, filterMoves, pruneShop);

    for (const m of candidates) {
      if (m.waitMs === null && !m.legal) continue;
      const next = stepMove(cur.state, cur.t, m, stepCost);
      if (!next) continue;
      if (next.t > maxTimeMs) continue;
      push({
        t: next.t,
        state: next.state,
        steps: [
          ...cur.steps,
          {
            t: next.t,
            waitMs: next.waitMs,
            promptFrictionMs:
              next.promptFrictionMs > 0 ? next.promptFrictionMs : undefined,
            moveId: m.id,
            moveKind: m.kind,
            target: m.target,
          },
        ],
      });
    }
  }

  const searchTruncated = !result && statesVisited >= stateBudget;
  const exhausted = !result && heap.length === 0;
  let failureReason: PlanFailureReason | null = null;

  const witness = closestPlayed ?? closest;
  if (!result && acceptBestEffort && witness) {
    const snap = nodeToClosest(witness.node, witness.progress);
    if (snap.steps.length > 0 && snap.progress.progress >= minBestEffortProgress) {
      result = {
        goal,
        totalMs: snap.totalMs,
        steps: snap.steps,
        statesVisited: progressOffset + statesVisited,
        truncated: true,
        bestEffort: true,
        progress: snap.progress.progress,
        progressLabel: snap.progress.label,
      };
    }
  }

  if (!result) {
    if (searchTruncated) failureReason = 'state_budget';
    else if (exhausted) failureReason = 'exhausted';
    else failureReason = 'time_budget';
  }

  const phaseRestart = resolveLaunchRestart(result, goalNode, closest, closestPlayed);

  return {
    result,
    closest: result
      ? null
      : closest
        ? nodeToClosest(closest.node, closest.progress)
        : null,
    statesVisited,
    searchTruncated,
    exhausted,
    failureReason,
    restart: phaseRestart,
  };
}

function phaseToOutcome(
  phase: PhaseSearchResult,
  opts: PlanSearchOpts,
): Pick<
  PlanSearchOutcome,
  | 'result'
  | 'closest'
  | 'statesVisited'
  | 'truncated'
  | 'exhausted'
  | 'failureReason'
> {
  const truncated = phase.searchTruncated || Boolean(phase.result?.bestEffort);
  return {
    result: phase.result,
    closest: phase.closest,
    statesVisited: phase.result?.statesVisited ?? phase.statesVisited,
    truncated,
    exhausted: phase.exhausted,
    failureReason: phase.failureReason,
  };
}

/**
 * Best-effort goal planner: weighted A* on virtual time, pruned move set, optional
 * closest-frontier witness when the state budget runs out. Post-launch goals use a
 * staged launch phase by default to trim pre-launch state explosion.
 */
export function planShortestPath(
  goal: PlanGoal,
  opts: PlanSearchOpts = {},
): PlanSearchOutcome {
  const maxStates = opts.maxStates ?? 8000;
  const maxTimeMs = opts.maxTimeMs ?? 10 * 3_600_000;
  const seed = opts.seed ?? 42;
  const promptCostMult = Math.max(1, opts.promptCostMult ?? 1);
  const promptPenaltyMs = Math.max(0, opts.promptPenaltyMs ?? 0);
  const launchFrac = opts.launchPhaseStateFraction ?? 0.45;

  setClock(() => 0);
  setRandom(mulberry32(seed));

  const fresh = defaultState();
  const initial: SearchRestart = {
    state: fresh,
    t: 0,
    steps: [],
  };

  if (goalMet(fresh, goal)) {
    resetClock();
    resetRandom();
    return {
      result: { goal, totalMs: 0, steps: [], statesVisited: 1, truncated: false },
      closest: null,
      statesVisited: 1,
      maxStates,
      maxTimeMs,
      truncated: false,
      exhausted: false,
      failureReason: null,
      promptCostMult,
      promptPenaltyMs,
    };
  }

  if (!shouldStageLaunch(goal, opts)) {
    const phase = runPlanSearchOnce(goal, opts, initial, maxStates, 0);
    resetClock();
    resetRandom();
    return {
      ...phaseToOutcome(phase, opts),
      maxStates,
      maxTimeMs,
      promptCostMult,
      promptPenaltyMs,
    };
  }

  const launchBudget = launchPhaseBudget(maxStates, launchFrac);
  const mainBudget = maxStates - launchBudget;

  const launchPhase = runPlanSearchOnce(LAUNCH_PLAN_GOAL, opts, initial, launchBudget, 0);
  const launchRestart = pickLaunchRestart(launchPhase);

  if (!launchRestart) {
    resetClock();
    resetRandom();
    return {
      ...phaseToOutcome(launchPhase, opts),
      statesVisited: launchPhase.statesVisited,
      maxStates,
      maxTimeMs,
      promptCostMult,
      promptPenaltyMs,
      stagedLaunch: true,
      launchPhaseStatesVisited: launchPhase.statesVisited,
    };
  }

  const mainPhase = runPlanSearchOnce(goal, opts, launchRestart, mainBudget, launchPhase.statesVisited);
  resetClock();
  resetRandom();

  let mergedResult: PlanResult | null = null;
  if (mainPhase.result) {
    mergedResult = {
      ...mainPhase.result,
      statesVisited: launchPhase.statesVisited + mainPhase.statesVisited,
    };
  } else if (launchPhase.result && !mainPhase.result) {
    mergedResult = {
      ...launchPhase.result,
      goal,
      bestEffort: true,
      progress: mainPhase.closest?.progress.progress ?? measureGoalProgress(launchRestart.state, goal).progress,
      progressLabel:
        mainPhase.closest?.progress.label ?? measureGoalProgress(launchRestart.state, goal).label,
      statesVisited: launchPhase.statesVisited + mainPhase.statesVisited,
    };
  }

  const totalVisited = launchPhase.statesVisited + mainPhase.statesVisited;
  const truncated =
    launchPhase.searchTruncated ||
    mainPhase.searchTruncated ||
    Boolean(mergedResult?.bestEffort);

  return {
    result: mergedResult,
    closest: mergedResult ? null : mainPhase.closest ?? launchPhase.closest,
    statesVisited: totalVisited,
    maxStates,
    maxTimeMs,
    truncated,
    exhausted: mainPhase.exhausted && !mergedResult,
    failureReason: mergedResult ? null : mainPhase.failureReason ?? launchPhase.failureReason,
    promptCostMult,
    promptPenaltyMs,
    stagedLaunch: true,
    launchPhaseStatesVisited: launchPhase.statesVisited,
  };
}

export const PLAN_GOALS: { id: string; goal: PlanGoal; label: string }[] = [
  { id: 'launch', goal: { kind: 'launched' }, label: 'Launch (deploy)' },
  { id: 'phase-2', goal: { kind: 'phase', index: 2 }, label: 'Flavor phase 2 (scale / multi_agent)' },
  { id: 'multi_agent', goal: { kind: 'upgrade', id: 'multi_agent' }, label: 'Own multi_agent' },
  { id: 'pro_plan', goal: { kind: 'upgrade', id: 'pro_plan' }, label: 'Own pro_plan' },
  { id: 'code_review', goal: { kind: 'upgrade', id: 'code_review' }, label: 'Own code_review' },
  { id: 'revamp', goal: { kind: 'upgrade', id: 'revamp_status_page' }, label: 'Own revamp_status_page' },
];

export function formatPlanStep(step: PlanStep): string {
  const parts: string[] = [];
  if (step.waitMs > 0) parts.push(`${fmtTime(step.waitMs)} idle`);
  const wait = parts.length > 0 ? `after ${parts.join(' + ')} · ` : '';
  const friction =
    step.promptFrictionMs && step.promptFrictionMs > 0
      ? ` (+${fmtTime(step.promptFrictionMs)} prompt friction)`
      : '';
  const target = step.target ? ` → ${step.target}` : '';
  return `${fmtTime(step.t)} · ${wait}${step.moveId}${target}${friction}`;
}
