import type { EventDef, GameState, LogEntry, LogEntryType, NewsDef } from '../types';
import { withBugs } from './state';
import { EVENTS, NEWS } from './data';
import { EVENT_COOLDOWN_MS, EVENT_MIX, THRESHOLDS } from './constants';
import { templateSeenInRecentLog } from '../lib/logTemplateMatch';
import { messageKey } from '../lib/messageKey';
import { render } from '../lib/template';
import { now, random } from './runtime';

export type AddLogFn = (prev: GameState, text: string, type: LogEntryType) => GameState;

type Gated = { minLoc: number; requiresLaunch?: boolean; requires?: string[] };

export function eventKey(e: EventDef): string {
  return messageKey(e.text);
}

function passesGates(item: Gated, prev: GameState): boolean {
  if (item.minLoc > prev.totalLoc) return false;
  if (item.requiresLaunch && !prev.launched) return false;
  if (item.requires && !item.requires.every((r) => prev.upgrades.includes(r))) return false;
  return true;
}

/** Bias toward higher `minLoc` entries so late-unlocked copy isn't drowned out. */
export function weightedPick<T extends { minLoc: number }>(pool: readonly T[], roll: number): T {
  let total = 0;
  const weights: number[] = [];
  for (const e of pool) {
    const w = Math.max(1, e.minLoc);
    weights.push(w);
    total += w;
  }
  let x = roll * total;
  for (let i = 0; i < pool.length; i++) {
    x -= weights[i]!;
    if (x < 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

function eligibleNews(prev: GameState): NewsDef[] {
  return NEWS.filter((n) => !prev.usedNewsIds.includes(n.id) && passesGates(n, prev));
}

function gatedEvents(prev: GameState): EventDef[] {
  return EVENTS.filter((e) => {
    if (e.freeAccountsDelta && e.freeAccountsDelta < 0 && (prev.freeAccounts ?? 1) <= 1) {
      return false;
    }
    return passesGates(e, prev);
  });
}

/** LOC-gated events not represented in the recent log window. */
function dialogueEventPool(prev: GameState): EventDef[] {
  return gatedEvents(prev).filter(
    (e) => !templateSeenInRecentLog(e.text, prev.log),
  );
}

function applyEventEffects(prev: GameState, ev: EventDef): GameState {
  let next = prev;
  if (ev.locDelta) next = { ...next, loc: Math.max(0, next.loc + ev.locDelta) };
  if (ev.locMult) next = { ...next, loc: next.loc * ev.locMult };
  if (ev.bugDelta && next.totalLoc >= THRESHOLDS.bugSpawnLoc) {
    next = { ...next, ...withBugs(next, next.bugs + ev.bugDelta) };
  }
  if (ev.freeAccountsDelta) {
    next = { ...next, freeAccounts: Math.max(1, (next.freeAccounts ?? 1) + ev.freeAccountsDelta) };
  }
  return next;
}

/**
 * Action-triggered random event. Returns a new state with the event's effects
 * applied (LOC/bug/account deltas, log entry) iff one fires; otherwise returns
 * `prev` unchanged. Respects a global event cooldown so consecutive actions
 * don't all trigger an event in a single tick.
 *
 * Headlines (`data/news.yaml`) fire at most once per save (by `id`). Dialogue
 * events skip lines that appear in the recent log window; empty pool → silence.
 *
 * @param prob  probability the action triggers an event at all (0–1)
 */
export function maybeFireEvent(prev: GameState, prob: number, addLog: AddLogFn): GameState {
  const t = now();
  if (t - prev.lastEventTime < EVENT_COOLDOWN_MS) return prev;
  if (random() > prob) return prev;

  const newsPool = eligibleNews(prev);
  const eventPool = dialogueEventPool(prev);
  if (newsPool.length === 0 && eventPool.length === 0) return prev;

  const pickNews =
    newsPool.length > 0 &&
    (eventPool.length === 0 || random() < EVENT_MIX.newsShare);

  let next = prev;
  let logType: LogEntry['type'];
  let text: string;
  let newsId: string | undefined;

  if (pickNews) {
    const item = weightedPick(newsPool, random());
    text = item.text;
    logType = 'news';
    newsId = item.id;
  } else {
    const ev = weightedPick(eventPool, random());
    next = applyEventEffects(next, ev);
    text = ev.text;
    // Dialogue events share normal reply styling; reserve `bad` for MCP fallout.
    logType = 'info';
  }

  next = addLog(next, render(text), logType);
  next = { ...next, lastEventTime: t };
  if (newsId) next = { ...next, usedNewsIds: [...next.usedNewsIds, newsId] };
  return next;
}
