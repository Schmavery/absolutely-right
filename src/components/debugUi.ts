/** Per-seed pill colors for trace timeline (cycles by seed mod length). */
export const SEED_PILL_CLASSES = [
  'bg-blue/25 text-blue border-blue/60',
  'bg-purple/25 text-purple border-purple/60',
  'bg-yellow/20 text-yellow border-yellow/55',
  'bg-green/20 text-green border-green/55',
  'bg-log-news/20 text-log-news border-log-news/50',
] as const;

export function seedPillClass(seed: number): string {
  return SEED_PILL_CLASSES[Math.abs(seed) % SEED_PILL_CLASSES.length]!;
}

/** Per-bot column colors in trace compare view. */
export function botPillClass(columnIndex: number): string {
  return SEED_PILL_CLASSES[Math.abs(columnIndex) % SEED_PILL_CLASSES.length]!;
}

export function heatmapFill(count: number, max: number): string | undefined {
  if (count <= 0) return undefined;
  const pct = count / max;
  const mix = Math.round(25 + pct * 55);
  return `color-mix(in srgb, var(--blue) ${mix}%, var(--debug-surface-2))`;
}
