/**
 * Headless game harness. Drives the *exact same* reducers and predicates
 * the React UI drives — `tickReducer`, the action functions, and
 * `availability.legalMoves` — over a virtual clock and a seeded RNG.
 *
 * No game logic lives here. Anything that smells like "is this legal?",
 * "what does this cost?", or "what's unlocked?" is delegated to
 * `src/game/availability.ts`. If a test ever needs to compute one of those
 * itself, that's a signal a predicate is missing from the model — fix it
 * there, not here.
 */

import type { GameState } from '../types';
import { ACTION_DURATION_MS, TICK_MS } from '../game/constants';
import { defaultState } from '../game/state';
import { tickReducer } from '../game/tick';
import { legalMoves, visibleMoves, type Move } from '../game/availability';
import { setClock, setRandom, resetClock, resetRandom } from '../game/runtime';

/** Mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BotContext {
  state: GameState;
  visible: Move[];
  legal: Move[];
  t: number;
}

export type Bot = (ctx: BotContext) => Move | null;

/** Small per-tick snapshot for debug traces (avoids cloning log arrays). */
export interface TraceSnapshot {
  totalLoc: number;
  upgrades: string[];
  genCounts: Record<string, number>;
  launched: boolean;
}

export function traceSnapshot(state: GameState): TraceSnapshot {
  return {
    totalLoc: state.totalLoc,
    upgrades: state.upgrades,
    genCounts: { ...state.genCounts },
    launched: state.launched,
  };
}

export interface TraceEntry {
  t: number;
  move?: { id: string; kind: Move['kind']; target?: string };
  snapshot: TraceSnapshot;
  /** Present only when `recordTrace: true` (full); tests use this for move-table checks. */
  state?: GameState;
}

/** `moves-only` — snapshot on bot actions, not passive ticks (cheaper long runs). */
export type TraceRecord = boolean | 'moves-only';

export interface SimOptions {
  seed: number;
  state?: GameState;
  tickMs?: number;
  actionDurationMs?: number;
  recordTrace?: TraceRecord;
  /** Cap per passive jump (default 30s; larger for long debug runs). */
  maxEventDtMs?: number;
  /** Fired after each successful bot move (cheap milestone tracking without a trace). */
  onAfterMove?: (e: {
    t: number;
    move: NonNullable<TraceEntry['move']>;
    snapshot: TraceSnapshot;
  }) => void;
}

export class Sim {
  state: GameState;
  t = 0;
  readonly tickMs: number;
  readonly actionDurationMs: number;
  readonly trace: TraceEntry[] = [];
  private readonly traceMode: 'off' | 'full' | 'moves-only';
  private readonly maxEventDtMs: number;
  private readonly onAfterMove?: SimOptions['onAfterMove'];
  private nextActionAt = 0;

  constructor(opts: SimOptions) {
    this.tickMs = opts.tickMs ?? TICK_MS;
    this.actionDurationMs = opts.actionDurationMs ?? ACTION_DURATION_MS;
    this.maxEventDtMs = opts.maxEventDtMs ?? EVENT_MAX_DT_MS;
    this.onAfterMove = opts.onAfterMove;
    this.traceMode =
      opts.recordTrace === 'moves-only'
        ? 'moves-only'
        : opts.recordTrace
          ? 'full'
          : 'off';
    this.state = opts.state ?? defaultState();
    setClock(() => this.t);
    setRandom(mulberry32(opts.seed));
  }

  static teardown(): void {
    resetClock();
    resetRandom();
  }

  tick(): void {
    this.t += this.tickMs;
    this.state = tickReducer(this.state, this.tickMs);
  }

  visible(): Move[] {
    return visibleMoves(this.state, this.t);
  }
  legal(): Move[] {
    return legalMoves(this.state, this.t);
  }

  run(bot: Bot, virtualMs: number): this {
    const stopAt = this.t + virtualMs;
    while (this.t < stopAt) {
      this.tick();
      let movePlayed: TraceEntry['move'];
      if (this.t >= this.nextActionAt) {
        const ctx: BotContext = {
          state: this.state,
          visible: this.visible(),
          legal: this.legal(),
          t: this.t,
        };
        const choice = bot(ctx);
        if (choice) {
          const next = choice.apply(this.state);
          if (next !== this.state) {
            this.state = next;
            movePlayed = { id: choice.id, kind: choice.kind, target: choice.target };
            this.nextActionAt = this.t + this.actionDurationMs;
          }
        }
      }
      this.maybePushTrace(movePlayed);
    }
    return this;
  }

  runEventDriven(
    bot: Bot,
    virtualMs: number,
    opts?: { stopWhen?: (state: GameState) => boolean },
  ): this {
    const stopAt = this.t + virtualMs;
    const shouldStop = () => opts?.stopWhen?.(this.state) ?? false;
    while (this.t < stopAt) {
      if (shouldStop()) break;
      let movePlayed: TraceEntry['move'];
      if (this.t >= this.nextActionAt) {
        const ctx: BotContext = {
          state: this.state,
          visible: this.visible(),
          legal: this.legal(),
          t: this.t,
        };
        const choice = bot(ctx);
        if (choice) {
          const next = choice.apply(this.state);
          if (next !== this.state) {
            this.state = next;
            movePlayed = { id: choice.id, kind: choice.kind, target: choice.target };
            this.nextActionAt = this.t + this.actionDurationMs;
            this.maybePushTrace(movePlayed);
            if (shouldStop()) break;
            continue;
          }
        }
      }
      const dt = this.nextEventDt(stopAt);
      if (dt <= 0) break;
      this.t += dt;
      this.state = tickReducer(this.state, dt);
      this.maybePushTrace();
    }
    return this;
  }

  private maybePushTrace(move?: TraceEntry['move']): void {
    const snapshot = traceSnapshot(this.state);
    if (move) this.onAfterMove?.({ t: this.t, move, snapshot });
    if (this.traceMode === 'off') return;
    if (this.traceMode === 'moves-only' && !move) return;
    const entry: TraceEntry = { t: this.t, move, snapshot };
    if (this.traceMode === 'full') entry.state = this.state;
    this.trace.push(entry);
  }

  private nextEventDt(stopAt: number): number {
    const candidates: number[] = [stopAt - this.t, this.maxEventDtMs];
    for (const m of this.visible()) {
      if (m.waitMs !== null && m.waitMs > 0) candidates.push(m.waitMs);
    }
    const buffRemaining = (this.state.agentBuffExpires ?? 0) - this.t;
    if (buffRemaining > 0) candidates.push(buffRemaining);
    const actionWait = this.nextActionAt - this.t;
    if (actionWait > 0) candidates.push(actionWait);
    return Math.max(this.tickMs, Math.min(...candidates));
  }
}

const EVENT_MAX_DT_MS = 30_000;
