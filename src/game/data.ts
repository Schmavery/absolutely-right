/**
 * Typed re-exports of the YAML content under `data/`. Importers should pull
 * from here instead of reaching into `@data/*.yaml` directly so the cast is
 * defined exactly once.
 */

import GENS_DATA from '@data/generators.yaml';
import UPGRADES_DATA from '@data/upgrades.yaml';
import EVENTS_DATA from '@data/events.yaml';
import MILESTONES_DATA from '@data/milestones.yaml';
import MESSAGES_DATA from '@data/messages.yaml';
import UI_DATA from '@data/ui.yaml';

import type { GenDef, UpgDef, EventDef } from '../types';

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

export interface MessagesData {
  pasteErrorGood: string[];
  pasteErrorBad: string[];
  pasteErrorNeutral: string[];
  agentMsgs: string[];
  yoloMergeMsgs: string[];
  clearContextMsgs: string[];
  newAccountMsgs: string[];
  testMessages: string[];
}
export const MESSAGES = MESSAGES_DATA as MessagesData;
