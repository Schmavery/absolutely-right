import type { GameState, LogEntry } from '../types';
import { HYPE, MAX_LOG } from './constants';
import { MILESTONES } from './data';
import { render } from '../lib/template';

/** Milestone `loc` keys the player has passed at `totalLoc` (same rule as the tick loop). */
export function milestoneLocsReached(totalLoc: number): number[] {
  return MILESTONES.filter((m) => totalLoc >= m.loc).map((m) => m.loc);
}

/**
 * Mark all milestones at or below `totalLoc` as seen without appending log lines.
 * Adds hype for newly marked milestones (same amount as the tick loop).
 */
export function syncMilestonesSeen(state: GameState): GameState {
  const reached = milestoneLocsReached(state.totalLoc);
  if (reached.length === 0) return state;

  const prevSet = new Set(state.milestonesSeen);
  const added = reached.filter((loc) => !prevSet.has(loc));
  if (added.length === 0) return state;

  const milestonesSeen = [...new Set([...state.milestonesSeen, ...reached])].sort(
    (a, b) => a - b,
  );
  return {
    ...state,
    milestonesSeen,
    hype: state.hype + added.length * HYPE.perMilestone,
  };
}

const FIRST_MILESTONE_LOC = MILESTONES[0]?.loc ?? 10;

/**
 * After a dev fast-forward with an empty log, the game still expects a milestone
 * entry for the post-startup prompt label. Inserts the first milestone only.
 */
export function ensureStartupMilestoneLog(state: GameState): GameState {
  if (!state.milestonesSeen.includes(FIRST_MILESTONE_LOC)) return state;
  if (state.log.some((e) => e.type === 'milestone')) return state;

  const m = MILESTONES[0];
  if (!m) return state;

  const entry: LogEntry = {
    id: state.logId + 1,
    text: render(m.text, { loc: m.loc }),
    type: 'milestone',
    streamMs: 0,
  };
  return {
    ...state,
    logId: entry.id,
    log: [...state.log, entry].slice(-MAX_LOG),
  };
}

/** Sync `milestonesSeen` (and hype) from `totalLoc`, then seed startup log if needed. */
export function prepareSaveProgressMarkers(state: GameState): GameState {
  return ensureStartupMilestoneLog(syncMilestonesSeen(state));
}
