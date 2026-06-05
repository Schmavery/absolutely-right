import { random } from '../game/runtime';

/**
 * Stable dedup key from a log template's first non-empty line (pre-`render()`).
 * `{{rand}}` and other variables do not split keys across fires.
 */
export function messageKey(source: string): string {
  const firstLine = source.split('\n').find((l) => l.trim().length > 0) ?? source;
  return firstLine
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * Uniform random pick from `pool`, preferring entries not in `used`.
 * Once every pool line has been seen, picks from the full pool again.
 */
export function pickUnused<T extends string>(pool: readonly T[], used: readonly string[]): T | undefined {
  if (pool.length === 0) return undefined;
  const fresh = pool.filter((item) => !used.includes(messageKey(item)));
  const list = fresh.length > 0 ? fresh : pool;
  return list[Math.floor(random() * list.length)]!;
}

export function markMessageUsed(prev: { usedEventIds: string[] }, source: string): string[] {
  const key = messageKey(source);
  if (prev.usedEventIds.includes(key)) return prev.usedEventIds;
  return [...prev.usedEventIds, key];
}

/** Uniform random pick from a pool keyed by `id` (MCP tools, allow/deny lines). */
export function pickUnusedById<T extends { id: string }>(
  pool: readonly T[],
  used: readonly string[],
): T | undefined {
  if (pool.length === 0) return undefined;
  const fresh = pool.filter((item) => !used.includes(item.id));
  const list = fresh.length > 0 ? fresh : pool;
  return list[Math.floor(random() * list.length)]!;
}

export function markIdUsed(prev: { usedEventIds: string[] }, id: string): string[] {
  if (prev.usedEventIds.includes(id)) return prev.usedEventIds;
  return [...prev.usedEventIds, id];
}
