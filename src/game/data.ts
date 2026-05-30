/**
 * Typed re-exports of the YAML content under `data/`. Importers should pull
 * from here instead of reaching into `@data/*.yaml` directly so the cast is
 * defined exactly once.
 */

import GENS_DATA from '@data/generators.yaml';
import UPGRADES_DATA from '@data/upgrades.yaml';
import EVENTS_DATA from '@data/events.yaml';
import MILESTONES_DATA from '@data/milestones.yaml';
import ACTIONS_DATA from '@data/actions.yaml';
import UI_DATA from '@data/ui.yaml';

import type { ActionDef, EventDef, GenDef, UpgDef } from '../types';

export const GENS = GENS_DATA as GenDef[];
export const UPGRADES = UPGRADES_DATA as UpgDef[];
export const EVENTS = EVENTS_DATA as EventDef[];
export const MILESTONES = MILESTONES_DATA as { loc: number; text: string }[];

interface UiData {
  phases: string[];
  spinFrames: string[];
  spinVerbs: string[];
}
export const UI = UI_DATA as UiData;

const ACTIONS = ACTIONS_DATA as ActionDef[];
const ACTION_MAP = new Map<string, ActionDef>(ACTIONS.map((a) => [a.id, a]));

/**
 * Look up an action's data record by id. Throws if the id is unknown so
 * typos surface immediately rather than as silent `undefined`s deep in
 * reducer math.
 */
export function action(id: string): ActionDef {
  const a = ACTION_MAP.get(id);
  if (!a) throw new Error(`Unknown action id: ${id}`);
  return a;
}
