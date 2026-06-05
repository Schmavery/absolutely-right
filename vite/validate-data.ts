/**
 * Build-time validation for `data/*.yaml`. Called from the Vite YAML plugin
 * so bad content fails `npm run dev` / `npm run build`, not mid-gameplay.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { messageKey } from '../src/lib/messageKey';

/** Action ids referenced from `src/game/actions.ts` and UI. */
export const ACTION_IDS = [
  'prompt',
  'kick_agent',
  'paste_error',
  'clear_context',
  'run_tests',
  'bug_bounty',
  'mcp_allow',
  'mcp_always_allow',
  'mcp_deny',
  'launch',
  'lobstagram_post',
  'raise_round',
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

const mcpToolKind = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('CallMcpTool'),
    server: z.string().min(1),
    toolName: z.string().min(1),
    args: z.string().min(1),
  }),
  z.object({
    tool: z.literal('Shell'),
    command: z.string().min(1),
    note: z.string().min(1).optional(),
  }),
  z.object({
    tool: z.literal('Read'),
    path: z.string().min(1),
    snippet: z.string().min(1).optional(),
  }),
  z.object({
    tool: z.literal('Write'),
    path: z.string().min(1),
    preview: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
  }),
]);

const mcpToolDef = z
  .object({
    id: z.string().min(1),
    safe: z.boolean(),
    onAllow: z.string().min(1),
    onDeny: z.string().min(1).optional(),
  })
  .and(mcpToolKind);

const mcpSchema = z.object({
  unsafeAllowLeakAck: z.array(z.string().min(1)).min(3),
  tools: z.array(mcpToolDef).min(1),
});

/**
 * Story order for shop `cost` — each id must cost more than the previous (data/PHASES.md).
 * Parallel branches use their own spine arrays below.
 */
export const UPGRADE_NARRATIVE_SPINE = [
  'multi_agent',
  'mcp_tools',
  'always_allow',
  'yolo_mode',
  'upside_down_centaur_policy',
  'code_review',
  'code_review_review',
  'ai_review',
  'revamp_status_page',
  'five_nines_sla',
  'six_nines_guarantee',
  'seven_nines_engineering',
  'eight_nines_protocol',
  'chaos_engineering',
] as const;

export const UPGRADE_BRANCH_SPINES: readonly (readonly string[])[] = [
  ['model_update_1', 'model_update_2', 'model_update_3', 'model_update_4'],
  ['better_prompts', 'few_shot', 'xml_tags'],
  ['cot', 'extended_thinking'],
  ['pro_plan', 'team_plan'],
  ['auto_bug_bounty', 'enhanced_bug_bounty'],
];

const DATA_FILES = [
  'generators.yaml',
  'upgrades.yaml',
  'events.yaml',
  'news.yaml',
  'milestones.yaml',
  'actions.yaml',
  'mcp.yaml',
  'ui.yaml',
] as const;

function assertUniqueMessageKeys(file: string, field: string, lines: string[]): void {
  const seen = new Set<string>();
  for (const line of lines) {
    const key = messageKey(line);
    if (seen.has(key)) {
      throw new Error(`[data/${file}] duplicate ${field} dedup key "${key}"`);
    }
    seen.add(key);
  }
}

function assertUniqueIds(file: string, items: { id: string }[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`[data/${file}] duplicate id: ${item.id}`);
    }
    seen.add(item.id);
  }
}

function assertUpgradeNarrativeCosts(
  upgrades: { id: string; cost: number; requires?: string[] }[],
): void {
  const byId = new Map(upgrades.map((u) => [u.id, u]));

  const assertSpine = (spine: readonly string[], label: string) => {
    for (let i = 1; i < spine.length; i++) {
      const prev = byId.get(spine[i - 1]!);
      const next = byId.get(spine[i]!);
      if (!prev || !next) {
        throw new Error(`[data/upgrades.yaml] ${label} spine missing id "${spine[i - 1]}" or "${spine[i]}"`);
      }
      if (next.cost <= prev.cost) {
        throw new Error(
          `[data/upgrades.yaml] ${label}: "${next.id}" cost ${next.cost} must exceed "${prev.id}" cost ${prev.cost}`,
        );
      }
    }
  };

  assertSpine(UPGRADE_NARRATIVE_SPINE, 'main');
  for (const spine of UPGRADE_BRANCH_SPINES) assertSpine(spine, 'branch');

  for (const u of upgrades) {
    const req = u.requires;
    if (!req || req.length !== 1) continue;
    const parent = byId.get(req[0]!);
    if (!parent) continue;
    if (u.cost <= parent.cost) {
      throw new Error(
        `[data/upgrades.yaml] "${u.id}" cost ${u.cost} must exceed requires "${parent.id}" cost ${parent.cost}`,
      );
    }
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
  assertUpgradeNarrativeCosts(upgrades);

  const events = z.array(eventSchema).parse(raw['events.yaml']);
  const eventKeys = new Set<string>();
  for (const e of events) {
    for (const req of e.requires ?? []) {
      if (!upgradeIds.has(req)) {
        throw new Error(
          `[data/events.yaml] event requires unknown upgrade id "${req}"`,
        );
      }
    }
    const key = messageKey(e.text);
    if (eventKeys.has(key)) {
      throw new Error(`[data/events.yaml] duplicate event dedup key "${key}"`);
    }
    eventKeys.add(key);
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

  const mcp = mcpSchema.parse(raw['mcp.yaml']);
  assertUniqueMessageKeys('mcp.yaml', 'unsafeAllowLeakAck', mcp.unsafeAllowLeakAck);
  assertUniqueIds('mcp.yaml', mcp.tools);
  if (!mcp.tools.some((t) => t.safe)) {
    throw new Error('[data/mcp.yaml] tools: need at least one entry with safe: true');
  }
  if (!mcp.tools.some((t) => !t.safe)) {
    throw new Error('[data/mcp.yaml] tools: need at least one entry with safe: false');
  }
  for (const t of mcp.tools) {
    if (!t.safe && !t.onDeny) {
      throw new Error(`[data/mcp.yaml] unsafe tool "${t.id}" must define onDeny`);
    }
  }

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
