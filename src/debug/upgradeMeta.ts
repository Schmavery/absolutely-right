import { UPGRADES } from '../game/data';
import type { UpgDef } from '../types';
import { UI } from '../game/data';
import { PHASE_RULES } from '../game/phases';
import { fmtLoc } from './traceAnalyze';

/** Mechanical chapter index (aligned with `getPhase` / PHASES.md). */
export const CHAPTER_STYLES: readonly {
  index: number;
  label: string;
  rowBorder: string;
  chip: string;
}[] = [
  { index: 0, label: 'Ch1 early', rowBorder: 'border-l-blue/70', chip: 'bg-blue/20 text-blue border-blue/50' },
  { index: 1, label: 'Ch2 prod', rowBorder: 'border-l-log-news/70', chip: 'bg-log-news/15 text-log-news border-log-news/45' },
  { index: 2, label: 'Ch3 scale', rowBorder: 'border-l-purple/70', chip: 'bg-purple/20 text-purple border-purple/50' },
  { index: 3, label: 'Ch4 review', rowBorder: 'border-l-yellow/70', chip: 'bg-yellow/20 text-yellow border-yellow/55' },
  { index: 4, label: 'Ch5 nines', rowBorder: 'border-l-green/70', chip: 'bg-green/20 text-green border-green/50' },
] as const;

const CHAPTER_BY_ID: Record<string, number> = {
  model_update_1: 0,
  model_update_2: 0,
  model_update_3: 0,
  model_update_4: 0,
  better_prompts: 0,
  few_shot: 0,
  unit_tests: 0,
  cicd: 1,
  eslint: 1,
  typescript: 1,
  cot: 1,
  xml_tags: 1,
  extended_thinking: 1,
  rotate_accounts: 1,
  multi_agent: 2,
  mcp_tools: 2,
  always_allow: 2,
  yolo_mode: 2,
  pro_plan: 2,
  team_plan: 2,
  code_review: 3,
  ai_review: 3,
  revamp_status_page: 4,
  five_nines_sla: 4,
  six_nines_guarantee: 4,
  seven_nines_engineering: 4,
  eight_nines_protocol: 4,
  auto_bug_bounty: 4,
  enhanced_bug_bounty: 4,
  chaos_engineering: 4,
};

export function upgradeChapter(u: UpgDef): number {
  if (CHAPTER_BY_ID[u.id] != null) return CHAPTER_BY_ID[u.id]!;
  if (u.unlockAt >= 500_000) return 4;
  if (u.unlockAt >= 80_000) return 3;
  if (u.unlockAt >= 15_000) return 2;
  if (u.unlockAt >= 2_500) return 1;
  return 0;
}

export function chapterStyle(index: number) {
  return CHAPTER_STYLES[Math.min(Math.max(0, index), CHAPTER_STYLES.length - 1)]!;
}

export function phaseRuleShort(index: number): string {
  return PHASE_RULES.find((r) => r.index === index)?.rule ?? `phase ${index}`;
}

export function flavorSubtitle(index: number): string {
  return UI.phases[index] ?? `Phase ${index}`;
}

export interface UpgradeRowMeta {
  def: UpgDef;
  chapter: number;
  chapterLabel: string;
  flavor: string;
  phaseRule: string;
}

export function upgradeRowMeta(u: UpgDef): UpgradeRowMeta {
  const chapter = upgradeChapter(u);
  const style = chapterStyle(chapter);
  return {
    def: u,
    chapter,
    chapterLabel: style.label,
    flavor: flavorSubtitle(chapter),
    phaseRule: phaseRuleShort(chapter),
  };
}

export function fmtUpgradeCost(cost: number): string {
  return fmtLoc(cost);
}

export const SORTED_UPGRADES = [...UPGRADES].sort((a, b) => a.unlockAt - b.unlockAt);

export const UPGRADE_BY_ID = new Map<string, UpgDef>(UPGRADES.map((u) => [u.id, u]));

export function upgradeHoverTitle(u: UpgDef): string {
  return [
    u.desc,
    `shop ${fmtLoc(u.unlockAt)} · buy ${fmtUpgradeCost(u.cost)}`,
    u.requires?.length ? `requires ${u.requires.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
