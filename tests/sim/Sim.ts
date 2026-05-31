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

import type { GameState } from '../../src/types';
import { ACTION_DURATION_MS, TICK_MS } from '../../src/game/constants';
import { defaultState } from '../../src/game/state';
import { tickReducer } from '../../src/game/tick';
import { legalMoves, visibleMoves, type Move } from '../../src/game/availability';
import { setClock, setRandom, resetClock, resetRandom } from '../../src/game/runtime';

// ─── seeded RNG ────────────────────────────────────────────────────────────

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

// ─── bot interface ─────────────────────────────────────────────────────────

export interface BotContext {
  state: GameState;
  /** All moves the player would *see* (visible buttons), legal or not. */
  visible: Move[];
  /** Subset of `visible` that would actually do something on click. */
  legal: Move[];
  /** Virtual now (ms). */
  t: number;
}

/** A bot returns at most one move to play this tick, or `null` to wait. */
export type Bot = (ctx: BotContext) => Move | null;

// ─── trace ─────────────────────────────────────────────────────────────────

export interface TraceEntry {
  /** Virtual ms at which this snapshot was taken (post-tick, pre-action). */
  t: number;
  /** Move played at this tick, if any. */
  move?: { id: string; kind: Move['kind']; target?: string };
  /** Snapshot of the state after the tick + any move. */
  state: GameState;
}

export interface SimOptions {
  seed: number;
  /** Initial state; defaults to `defaultState()`. */
  state?: GameState;
  /** Tick size in ms. Defaults to `TICK_MS` (the production rate). */
  tickMs?: number;
  /**
   * Virtual time charged to a successful bot action; mimics the human
   * read-decide-press loop so trace pacing matches a real session rather
   * than running at full tick speed. Defaults to `ACTION_DURATION_MS`.
   */
  actionDurationMs?: number;
  /** If true, record a `TraceEntry` every tick. */
  recordTrace?: boolean;
}

export class Sim {
  state: GameState;
  t = 0;
  readonly tickMs: number;
  readonly actionDurationMs: number;
  readonly trace: TraceEntry[] = [];
  private readonly recordTrace: boolean;
  /** Virtual time at which the bot is next allowed to act. */
  private nextActionAt = 0;

  constructor(opts: SimOptions) {
    this.tickMs = opts.tickMs ?? TICK_MS;
    this.actionDurationMs = opts.actionDurationMs ?? ACTION_DURATION_MS;
    this.recordTrace = !!opts.recordTrace;
    this.state = opts.state ?? defaultState();
    setClock(() => this.t);
    setRandom(mulberry32(opts.seed));
  }

  /** Restore the global runtime hooks back to their production defaults. */
  static teardown(): void {
    resetClock();
    resetRandom();
  }

  /** Advance virtual time by `tickMs` and apply `tickReducer`. */
  tick(): void {
    this.t += this.tickMs;
    this.state = tickReducer(this.state, this.tickMs);
  }

  /** Snapshot the current move table without mutating state. */
  visible(): Move[] {
    return visibleMoves(this.state, this.t);
  }
  legal(): Move[] {
    return legalMoves(this.state, this.t);
  }

  /**
   * Run a bot for at most `virtualMs` of virtual time at the production
   * tick rate. Each successful action consumes `actionDurationMs` of
   * virtual time before the bot gets another chance to act — passive
   * ticks continue running during that interval, so generators / token
   * regen / cooldowns / chat-busy unwinding all proceed naturally.
   *
   * Use this mode when test fidelity to the real React tick cadence
   * matters. Use `runEventDriven` when you want the same observable
   * semantics in far fewer reducer calls.
   */
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
          // The reducers no-op on illegal calls, but bots are expected to
          // pick from `ctx.legal`. We don't second-guess them here — that
          // would be re-implementing legality.
          const next = choice.apply(this.state);
          if (next !== this.state) {
            this.state = next;
            movePlayed = { id: choice.id, kind: choice.kind, target: choice.target };
            this.nextActionAt = this.t + this.actionDurationMs;
          }
        }
      }
      if (this.recordTrace) {
        this.trace.push({ t: this.t, move: movePlayed, state: this.state });
      }
    }
    return this;
  }

  /**
   * Event-driven variant of `run`: between bot decisions, advance virtual
   * time straight to the next interesting boundary instead of stepping at
   * `tickMs`. The boundary is the minimum positive of:
   *
   *   - any visible move's `waitMs` (next legality flip)
   *   - `agentBuffExpires - t` (rate semantics inside `tickReducer`)
   *   - `nextActionAt - t` (when bot may act again)
   *   - the run's stop time
   *   - `EVENT_MAX_DT_MS` (safety cap so unlock checks happen often enough)
   *
   * Floored at `tickMs` so we never advance by 0. Each advance applies
   * exactly one `tickReducer(state, dt)`, which is linear in `dt` for the
   * resource integrators.
   */
  runEventDriven(bot: Bot, virtualMs: number): this {
    const stopAt = this.t + virtualMs;
    while (this.t < stopAt) {
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
            if (this.recordTrace) {
              this.trace.push({ t: this.t, move: movePlayed, state: this.state });
            }
            continue;
          }
        }
      }
      const dt = this.nextEventDt(stopAt);
      if (dt <= 0) break;
      this.t += dt;
      this.state = tickReducer(this.state, dt);
      if (this.recordTrace) {
        this.trace.push({ t: this.t, state: this.state });
      }
    }
    return this;
  }

  private nextEventDt(stopAt: number): number {
    const candidates: number[] = [stopAt - this.t, EVENT_MAX_DT_MS];
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

/** Hard cap on a single event-driven dt — keeps unlock/milestone checks
 *  running on a sane cadence even when nothing is forecastable. */
const EVENT_MAX_DT_MS = 30_000;
