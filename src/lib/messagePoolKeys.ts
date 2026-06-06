import type { ActionDef, EventDef } from '../types';
import { messageKey } from './messageKey';

/** String pools on `ActionDef` checked for slug collisions with MCP ack lines. */
export const ACTION_MESSAGE_POOL_KEYS = [
  'earlyPromptMsgs',
  'messages',
  'goodMessages',
  'badMessages',
  'neutralMessages',
  'firstPurchaseMsg',
  'runMsg',
  'introMsg',
] as const satisfies readonly (keyof ActionDef)[];

export type MessagePoolEntry = { label: string; source: string };

/** Templates whose slug keys must stay distinct (flavor vs MCP ack collision guard). */
export function collectUsedEventIdTemplates(
  events: readonly EventDef[],
  actions: readonly ActionDef[],
  mcpAck: readonly string[],
): MessagePoolEntry[] {
  const out: MessagePoolEntry[] = [];

  for (const e of events) {
    out.push({ label: `events.yaml@${e.minLoc}`, source: e.text });
  }

  for (const a of actions) {
    for (const field of ACTION_MESSAGE_POOL_KEYS) {
      const pool = a[field];
      if (typeof pool === 'string') {
        out.push({ label: `actions.yaml:${a.id}.${field}`, source: pool });
      } else if (Array.isArray(pool)) {
        for (const line of pool) {
          out.push({ label: `actions.yaml:${a.id}.${field}`, source: line });
        }
      }
    }
  }

  for (const line of mcpAck) {
    out.push({ label: 'mcp.yaml:unsafeAllowLeakAck', source: line });
  }

  return out;
}

export type MessageKeyCollision = { key: string; a: string; b: string };

export function findMessageKeyCollisions(entries: readonly MessagePoolEntry[]): MessageKeyCollision[] {
  const seen = new Map<string, string>();
  const collisions: MessageKeyCollision[] = [];

  for (const { label, source } of entries) {
    const key = messageKey(source);
    const prev = seen.get(key);
    if (prev) {
      collisions.push({ key, a: prev, b: label });
    } else {
      seen.set(key, label);
    }
  }

  return collisions;
}

/** Throws when any two templates in the shared pool slug to the same key. */
export function assertNoMessageKeyCollisions(entries: readonly MessagePoolEntry[]): void {
  const collisions = findMessageKeyCollisions(entries);
  if (collisions.length === 0) return;
  const { key, a, b } = collisions[0]!;
  throw new Error(`duplicate usedEventIds dedup key "${key}" (${a} vs ${b})`);
}
