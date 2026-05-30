import type { EventDef, GameState, LogEntry, LogEntryType } from '../types';
import { EVENTS } from './data';
import { COOLDOWNS, THRESHOLDS } from './constants';

export type AddLogFn = (prev: GameState, text: string, type: LogEntryType) => GameState;

/**
 * Stable per-event dedup key derived from the event's first non-empty line.
 * Slug-based so authors don't have to maintain explicit ids — editing an
 * event's first line resets dedup for that event, which matches the
 * authoring intent (a meaningfully changed line is effectively a new event).
 */
function eventKey(e: EventDef): string {
  const firstLine = e.text.split('\n').find((l) => l.trim().length > 0) ?? e.text;
  return firstLine
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * Action-triggered random event. Returns a new state with the event's effects
 * applied (LOC/bug/account deltas, log entry) iff one fires; otherwise returns
 * `prev` unchanged. Respects a global event cooldown so consecutive actions
 * don't all trigger an event in a single tick.
 *
 * @param prob  probability the action triggers an event at all (0–1)
 */
export function maybeFireEvent(prev: GameState, prob: number, addLog: AddLogFn): GameState {
  const now = Date.now();
  if (now - prev.lastEventTime < COOLDOWNS.globalEvent) return prev;
  if (Math.random() > prob) return prev;

  const eligible = EVENTS.filter((e) => {
    if (prev.usedEventIds.includes(eventKey(e))) return false;
    if (e.minLoc > prev.totalLoc) return false;
    if (e.requiresLaunch && !prev.launched) return false;
    if (e.freeAccountsDelta && e.freeAccountsDelta < 0 && (prev.freeAccounts ?? 1) <= 1) return false;
    if (e.requires && !e.requires.every((r) => prev.upgrades.includes(r))) return false;
    return true;
  });

  // Once we run out of fresh events, keep firing the early ones so the log
  // never goes silent.
  const repeatable = EVENTS.filter(
    (e) =>
      e.minLoc <= prev.totalLoc &&
      e.minLoc < THRESHOLDS.repeatableEventMaxLoc &&
      !(e.requiresLaunch && !prev.launched),
  );

  const pool = eligible.length > 0 ? eligible : repeatable;
  if (pool.length === 0) return prev;

  const ev = pool[Math.floor(Math.random() * pool.length)];
  let next = prev;
  if (ev.locDelta) next = { ...next, loc: Math.max(0, next.loc + ev.locDelta) };
  if (ev.locMult) next = { ...next, loc: next.loc * ev.locMult };
  if (ev.bugDelta && next.totalLoc >= THRESHOLDS.bugSpawnLoc) {
    next = { ...next, bugs: Math.max(0, next.bugs + ev.bugDelta) };
  }
  if (ev.freeAccountsDelta) {
    next = { ...next, freeAccounts: Math.max(1, (next.freeAccounts ?? 1) + ev.freeAccountsDelta) };
  }

  const logType: LogEntry['type'] =
    ev.type === 'news' ? 'news' : ev.type === 'bad' ? 'bad' : ev.type === 'event' ? 'event' : 'info';
  next = addLog(next, ev.text, logType);
  next = { ...next, lastEventTime: now };
  if (eligible.length > 0) next = { ...next, usedEventIds: [...next.usedEventIds, eventKey(ev)] };
  return next;
}
