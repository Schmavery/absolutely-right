import { UPGRADES } from '../game/data';
import { LAUNCH_LOC } from '../game/constants';
import { calcUptime } from '../game/rates';
import { grantMcMinis } from '../game/investor';
import { prepareSaveProgressMarkers } from '../game/milestones';
import { getPhase } from '../game/phases';
import { defaultState, initState, saveState } from '../game/state';
import type { GameState } from '../types';

/** Merge parsed JSON over defaults (same rules as `initState`). */
export function hydrateSave(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') return defaultState();
  return { ...defaultState(), ...(raw as Partial<GameState>) };
}

export function loadEditableSave(): GameState {
  return initState();
}

/** Write editor draft to disk; returns new revision for baseline tracking. */
export function persistSave(state: GameState): number {
  return saveState(state, 'editor');
}

/** Pretty-printed save JSON (import box, agents, issues). */
export function serializeSaveJson(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

export function parseSaveJson(text: string): { ok: true; state: GameState } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as unknown;
    return { ok: true, state: hydrateSave(parsed) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid JSON';
    return { ok: false, error: msg };
  }
}

const UPG_IDS = new Set(UPGRADES.map((u) => u.id));

export function sanitizeUpgrades(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => UPG_IDS.has(id)))];
}

/**
 * Dev-only: reveal every upgrade whose prereqs are met, ignoring LOC afford gates.
 */
export function revealAllEligibleUpgrades(state: GameState): GameState {
  const unlocked = new Set(state.unlockedUpgrades);
  for (const u of UPGRADES) {
    if (state.upgrades.includes(u.id)) continue;
    if (u.requiresLaunch && !state.launched) continue;
    if (u.requires && !u.requires.every((r) => state.upgrades.includes(r))) continue;
    const uptimeNines = calcUptime(state.bugs).nines;
    if (u.unlockMinUptimeNines !== undefined && uptimeNines < u.unlockMinUptimeNines)
      continue;
    if (u.unlockMaxUptimeNines !== undefined && uptimeNines > u.unlockMaxUptimeNines)
      continue;
    unlocked.add(u.id);
  }
  return { ...state, unlockedUpgrades: [...unlocked] };
}

function maxUnlockAt(upgrades: string[]): number {
  let max = 0;
  for (const u of UPGRADES) {
    if (upgrades.includes(u.id)) max = Math.max(max, u.unlockAt);
  }
  return max;
}

function baseProgress(loc: number, totalLoc: number, upgrades: string[]): Partial<GameState> {
  const peak = Math.max(loc, totalLoc, maxUnlockAt(upgrades) * 1.2, LAUNCH_LOC);
  return {
    started: true,
    loc: peak,
    totalLoc: peak,
    tokens: 2000,
    minTokensSeen: 20,
    totalClicks: 80,
    lifetimeBugs: 12,
    bugs: 8,
    tests: 4,
    buzzMeter: 0,
    fundingRound: 0,
    mcMinis: 0,
    nines: 0,
    mcpApprovalPending: null,
    mcpAutoApproveAt: null,
    mcpExecutingUntil: null,
    mcpExecutingLine: null,
    mcpActiveToolId: null,
    log: [],
    logId: 0,
  };
}

export interface SavePreset {
  id: string;
  label: string;
  hint: string;
  apply: (prev: GameState) => GameState;
}

export const SAVE_PRESETS: SavePreset[] = [
  {
    id: 'fresh',
    label: 'Reset save',
    hint: 'Default new game (clears progression fields).',
    apply: () => defaultState(),
  },
  {
    id: 'prelaunch',
    label: 'Ch0 — pre-launch',
    hint: 'High LOC, early upgrades, launch not taken.',
    apply: (prev) => {
      const upgrades = sanitizeUpgrades([
        'model_update_1',
        'model_update_2',
        'better_prompts',
      ]);
      return revealAllEligibleUpgrades({
        ...prev,
        ...baseProgress(12_000, 15_000, upgrades),
        launched: false,
        upgrades,
      });
    },
  },
  {
    id: 'launched',
    label: 'Ch1 — launched',
    hint: 'Production live; CI / lint band.',
    apply: (prev) => {
      const upgrades = sanitizeUpgrades([
        'model_update_1',
        'model_update_2',
        'model_update_3',
        'better_prompts',
        'few_shot',
        'cicd',
        'eslint',
        'cot',
      ]);
      return revealAllEligibleUpgrades({
        ...prev,
        ...baseProgress(120_000, 180_000, upgrades),
        launched: true,
        upgrades,
        buzzMeter: 40,
      });
    },
  },
  {
    id: 'mid',
    label: 'Ch2 — scale / MCP',
    hint: 'Agents, MCP tools, paid plan.',
    apply: (prev) => {
      const upgrades = sanitizeUpgrades([
        'model_update_1',
        'model_update_2',
        'model_update_3',
        'better_prompts',
        'few_shot',
        'cicd',
        'eslint',
        'cot',
        'rotate_accounts',
        'multi_agent',
        'mcp_tools',
        'pro_plan',
      ]);
      let s = revealAllEligibleUpgrades({
        ...prev,
        ...baseProgress(600_000, 800_000, upgrades),
        launched: true,
        upgrades,
        buzzMeter: 60,
        fundingRound: 1,
        tokens: 2500,
      });
      s = grantMcMinis(s, 2);
      return s;
    },
  },
  {
    id: 'review',
    label: 'Ch3 — review',
    hint: 'MCP + uptime crisis; centaur policy → review chain.',
    apply: (prev) => {
      const upgrades = sanitizeUpgrades([
        'model_update_1',
        'model_update_2',
        'model_update_3',
        'better_prompts',
        'few_shot',
        'cicd',
        'multi_agent',
        'mcp_tools',
        'always_allow',
        'yolo_mode',
        'pro_plan',
        'upside_down_centaur_policy',
        'code_review',
        'code_review_review',
      ]);
      return revealAllEligibleUpgrades({
        ...prev,
        ...baseProgress(900_000, 1_200_000, upgrades),
        launched: true,
        upgrades,
        bugs: 1500,
        buzzMeter: 80,
        fundingRound: 2,
      });
    },
  },
  {
    id: 'nines',
    label: 'Ch4 — nines',
    hint: 'Status page revamp and nines meta.',
    apply: (prev) => {
      const upgrades = sanitizeUpgrades([
        'model_update_1',
        'model_update_2',
        'model_update_3',
        'better_prompts',
        'few_shot',
        'cicd',
        'multi_agent',
        'mcp_tools',
        'pro_plan',
        'upside_down_centaur_policy',
        'code_review',
        'code_review_review',
        'ai_review',
        'revamp_status_page',
        'five_nines_sla',
      ]);
      return revealAllEligibleUpgrades({
        ...prev,
        ...baseProgress(25_000_000, 30_000_000, upgrades),
        launched: true,
        upgrades,
        buzzMeter: 100,
        fundingRound: 3,
        nines: 5.2,
        bugs: 120,
        lifetimeBugs: 200,
      });
    },
  },
];

export function applyPreset(presetId: string, prev: GameState): GameState | null {
  const preset = SAVE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  return prepareSaveProgressMarkers(preset.apply(prev));
}

/** Recompute `milestonesSeen` from `totalLoc` (for editor apply / manual tweaks). */
export function finalizeSaveState(state: GameState): GameState {
  return prepareSaveProgressMarkers(state);
}

export function saveSummary(state: GameState): {
  phase: number;
  phaseLabel: string;
  upgradeCount: number;
  unlockedCount: number;
} {
  const phase = getPhase(state);
  return {
    phase,
    phaseLabel: `Chapter ${phase + 1}`,
    upgradeCount: state.upgrades.length,
    unlockedCount: state.unlockedUpgrades.length,
  };
}
