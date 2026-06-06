/**
 * Typed re-exports of the YAML content under `data/`. Importers should pull
 * from here instead of reaching into `@data/*.yaml` directly so the cast is
 * defined exactly once.
 */

import GENS_DATA from '@data/generators.yaml';
import UPGRADES_DATA from '@data/upgrades.yaml';
import EVENTS_DATA from '@data/events.yaml';
import NEWS_DATA from '@data/news.yaml';
import MILESTONES_DATA from '@data/milestones.yaml';
import ACTIONS_DATA from '@data/actions.yaml';
import MCP_DATA from '@data/mcp.yaml';
import UI_DATA from '@data/ui.yaml';

import type { ActionDef, EventDef, GenDef, McpCopy, McpToolDef, NewsDef, UpgDef } from '../types';

export const GENS = GENS_DATA as GenDef[];
export const UPGRADES = UPGRADES_DATA as UpgDef[];
export const EVENTS = EVENTS_DATA as EventDef[];
export const NEWS = NEWS_DATA as NewsDef[];
export const MILESTONES = MILESTONES_DATA as { loc: number; text: string }[];
export const MCP_COPY = MCP_DATA as McpCopy;

export const MCP_TOOLS = MCP_COPY.tools;
export const MCP_UNSAFE_ALLOW_LEAK_ACK = MCP_COPY.unsafeAllowLeakAck;

const MCP_TOOL_BY_ID = new Map(MCP_TOOLS.map((t) => [t.id, t]));

export function mcpToolById(id: string): McpToolDef | undefined {
  return MCP_TOOL_BY_ID.get(id);
}

export function mcpToolIsSafe(id: string): boolean {
  return MCP_TOOL_BY_ID.get(id)?.safe ?? false;
}

interface UiData {
  phases: string[];
  spinFrames: string[];
  /** One verb list per flavor phase index (`phases.length` entries). */
  spinVerbs: string[][];
}
export const UI = UI_DATA as UiData;

/** Spinner copy for the current flavor phase; falls back to phase 0. */
export function spinVerbsForPhase(phase: number): readonly string[] {
  const list = UI.spinVerbs[phase] ?? UI.spinVerbs[0];
  return list?.length ? list : UI.spinVerbs[0];
}

export const ACTIONS = ACTIONS_DATA as ActionDef[];
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
