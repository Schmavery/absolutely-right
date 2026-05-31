import type { GameState } from '../types';
import { SAVE_KEY } from './constants';

/** Apply a bug count and accrue positive deltas into `lifetimeBugs`. */
export function withBugs(prev: GameState, bugs: number): Pick<GameState, 'bugs' | 'lifetimeBugs'> {
  const b = Math.max(0, bugs);
  const gained = Math.max(0, b - prev.bugs);
  return {
    bugs: b,
    lifetimeBugs: (prev.lifetimeBugs ?? 0) + gained,
  };
}

export function defaultState(): GameState {
  return {
    loc: 0,
    bugs: 0,
    lifetimeBugs: 0,
    totalLoc: 0,
    totalClicks: 0,
    genCounts: {},
    upgrades: [],
    log: [],
    logId: 0,
    lastEventTime: 0,
    lastTestLogTime: 0,
    actionCooldowns: {},
    hype: 0,
    tests: 0,
    freeAccounts: 1,
    totalTokensSpent: 0,
    minTokensSeen: 9999,
    milestonesSeen: [],
    started: false,
    launched: false,
    usedEventIds: [],
    usedNewsIds: [],
    tokens: 120,
    money: 0,
    agentBuffExpires: 0,
    unlockedUpgrades: [],
    nines: 0,
    chatBusyUntil: 0,
  };
}

export function initState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    // ignored — bad save data falls back to default state
  }
  return defaultState();
}

export function saveState(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // ignored — quota / privacy mode
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignored
  }
}
