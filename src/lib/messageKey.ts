/**
 * Stable slug from a log template's full body (pre-`render()`).
 * Used for collision checks in `messagePoolKeys` and legacy saves.
 */
export function messageKey(source: string): string {
  const body = source
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => l.trim())
    .join('\n');
  return body
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}
