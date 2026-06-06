import type { GameState } from '../types';
import { SAVE_KEY } from './constants';
import { EMPTY_MC_MINI_LANES, normalizeMcMiniLanes } from './investor';
import { clearSaveStorage, writeSaveWithMeta, type SaveSource } from './saveSync';

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
    buzzMeter: 0,
    fundingRound: 0,
    mcMinis: 0,
    mcMiniLanes: { ...EMPTY_MC_MINI_LANES },
    agentBuffExpires: 0,
    unlockedUpgrades: [],
    nines: 0,
    mcpApprovalPending: null,
    mcpAutoApproveAt: null,
    mcpExecutingUntil: null,
    mcpExecutingLine: null,
    mcpActiveToolId: null,
  };
}

export function initState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameState>;
      const base = defaultState();
      const mcMinis = parsed.mcMinis ?? base.mcMinis;
      return {
        ...base,
        ...parsed,
        mcMinis,
        mcMiniLanes: normalizeMcMiniLanes(mcMinis, parsed.mcMiniLanes ?? base.mcMiniLanes),
        buzzMeter: parsed.buzzMeter ?? base.buzzMeter,
        fundingRound: parsed.fundingRound ?? base.fundingRound,
        usedEventIds: Array.isArray(parsed.usedEventIds) ? parsed.usedEventIds : base.usedEventIds,
        usedNewsIds: Array.isArray(parsed.usedNewsIds) ? parsed.usedNewsIds : base.usedNewsIds,
      };
    }
  } catch {
    // ignored — bad save data falls back to default state
  }
  return defaultState();
}

export function saveState(
  s: GameState,
  source: SaveSource = 'game',
  writerSessionId?: string | null,
): number {
  return writeSaveWithMeta(s, source, writerSessionId);
}

export function clearSave(): void {
  clearSaveStorage();
}
