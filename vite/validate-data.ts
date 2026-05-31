/**
 * Build-time validation for `data/*.yaml`. Called from the Vite YAML plugin
 * so bad content fails `npm run dev` / `npm run build`, not mid-gameplay.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** Action ids referenced from `src/game/actions.ts` and UI. */
export const ACTION_IDS = [
  'prompt',
  'kick_agent',
  'paste_error',
  'clear_context',
  'run_tests',
  'bug_bounty',
  'mcp_allow',
  'mcp_deny',
  'launch',
  'new_free_account',
  'write_test',
  'buy_gen',
  'buy_upgrade',
] as const;

const gameFlagId = z.enum([
  'ai_review',
  'nines_tracking',
  'auto_bug_bounty',
  'mcp_tools',
  'mcp_auto_approve',
  'yolo_mode',
]);

const thresholdOverrideKey = z.enum([
  'showGeneratorsLoc',
  'showUpgradesLoc',
  'showPasteErrorBugs',
  'showKickAgentClicks',
  'showWriteTestsBugs',
  'showRunTestsBugs',
  'showClearContextLoc',
  'showClearContextMinTokens',
  'showBugBountyBugs',
  'showStatsLoc',
  'showNewFreeAccountTokens',
]);

const genSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    desc: z.string().min(1),
    locPerSec: z.number(),
    bugsPerSec: z.number(),
    fixPerSec: z.number(),
    baseCost: z.number().positive(),
    costMult: z.number().positive(),
    unlockAt: z.number().nonnegative(),
  })
  .passthrough();

const upgradeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    desc: z.string().min(1),
    cost: z.number().nonnegative(),
    unlockAt: z.number().nonnegative(),
    requires: z.array(z.string().min(1)).optional(),
    requiresLaunch: z.boolean().optional(),
    flags: z.array(gameFlagId).optional(),
    thresholdOverrides: z.record(thresholdOverrideKey, z.number()).optional(),
  })
  .passthrough();

const eventSchema = z
  .object({
    text: z.string().min(1),
    type: z.enum(['info', 'bad', 'event']),
    minLoc: z.number().nonnegative(),
    requiresLaunch: z.boolean().optional(),
    requires: z.array(z.string().min(1)).optional(),
    locMult: z.number().optional(),
    locDelta: z.number().optional(),
    bugDelta: z.number().optional(),
    freeAccountsDelta: z.number().optional(),
  })
  .passthrough();

const newsSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  minLoc: z.number().nonnegative(),
  requiresLaunch: z.boolean().optional(),
  requires: z.array(z.string().min(1)).optional(),
});

const milestoneSchema = z.object({
  loc: z.number().nonnegative(),
  text: z.string().min(1),
});

const actionSchema = z
  .object({
    id: z.enum(ACTION_IDS),
  })
  .passthrough();

const uiSchema = z.object({
  phases: z.array(z.string().min(1)).min(1),
  spinFrames: z.array(z.string().min(1)).min(1),
  spinVerbs: z.array(z.string().min(1)).min(1),
});

const DATA_FILES = [
  'generators.yaml',
  'upgrades.yaml',
  'events.yaml',
  'news.yaml',
  'milestones.yaml',
  'actions.yaml',
  'ui.yaml',
] as const;

function assertUniqueIds(file: string, items: { id: string }[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`[data/${file}] duplicate id: ${item.id}`);
    }
    seen.add(item.id);
  }
}

function assertUniqueLocs(file: string, items: { loc: number }[]): void {
  const seen = new Set<number>();
  for (const item of items) {
    if (seen.has(item.loc)) {
      throw new Error(`[data/${file}] duplicate loc threshold: ${item.loc}`);
    }
    seen.add(item.loc);
  }
}

function loadDataDir(dataDir: string): Record<(typeof DATA_FILES)[number], unknown> {
  const out = {} as Record<(typeof DATA_FILES)[number], unknown>;
  for (const file of DATA_FILES) {
    const full = path.join(dataDir, file);
    out[file] = parseYaml(fs.readFileSync(full, 'utf8'));
  }
  return out;
}

/** Validate every file under `data/`. Throws on first problem. */
export function validateGameDataDir(dataDir: string): void {
  const raw = loadDataDir(dataDir);

  const gens = z.array(genSchema).parse(raw['generators.yaml']);
  assertUniqueIds('generators.yaml', gens);

  const upgrades = z.array(upgradeSchema).parse(raw['upgrades.yaml']);
  assertUniqueIds('upgrades.yaml', upgrades);
  const upgradeIds = new Set(upgrades.map((u) => u.id));
  for (const u of upgrades) {
    for (const req of u.requires ?? []) {
      if (!upgradeIds.has(req)) {
        throw new Error(
          `[data/upgrades.yaml] upgrade "${u.id}" requires unknown id "${req}"`,
        );
      }
    }
  }

  const events = z.array(eventSchema).parse(raw['events.yaml']);
  for (const e of events) {
    for (const req of e.requires ?? []) {
      if (!upgradeIds.has(req)) {
        throw new Error(
          `[data/events.yaml] event requires unknown upgrade id "${req}"`,
        );
      }
    }
  }

  const news = z.array(newsSchema).parse(raw['news.yaml']);
  assertUniqueIds('news.yaml', news);
  for (const n of news) {
    for (const req of n.requires ?? []) {
      if (!upgradeIds.has(req)) {
        throw new Error(
          `[data/news.yaml] headline requires unknown upgrade id "${req}"`,
        );
      }
    }
  }

  const milestones = z.array(milestoneSchema).parse(raw['milestones.yaml']);
  assertUniqueLocs('milestones.yaml', milestones);

  const actions = z.array(actionSchema).parse(raw['actions.yaml']);
  assertUniqueIds('actions.yaml', actions);

  uiSchema.parse(raw['ui.yaml']);
}

let lastValidatedKey = '';

/**
 * Validate all game YAML when any `data/*.yaml` file is transformed.
 * Skips repeat work when mtimes are unchanged (common during unrelated HMR).
 */
export function validateGameDataDirIfStale(dataDir: string): void {
  const key = DATA_FILES.map((f) => {
    const p = path.join(dataDir, f);
    try {
      const s = fs.statSync(p);
      return `${f}:${s.mtimeMs}`;
    } catch {
      return `${f}:missing`;
    }
  }).join('|');
  if (key === lastValidatedKey) return;
  validateGameDataDir(dataDir);
  lastValidatedKey = key;
}
