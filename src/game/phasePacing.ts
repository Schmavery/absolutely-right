/**
 * Cumulative virtual-ms budget for the progress bot (`greedyPlayer`) to reach
 * each `getPhase()` index from a fresh save.
 *
 * Design targets (active play): phase 1 · 5m, phase 2 · 15m, phase 3 · 30m,
 * phase 4 · 2h — edit when retuning YAML. Pacing tests enforce
 * `PHASE_TIME_CURVE_ENFORCED`.
 */
export const PHASE_TIME_CURVE_MS: Readonly<Record<number, number>> = {
  /** launch — design target: 5m */
  1: 15 * 60_000,
  /** additional capacity (multi_agent / mcp / money) */
  2: 15 * 60_000,
  /** review theater */
  3: 30 * 60_000,
  /** nines meta */
  4: 2 * 3_600_000,
};

/** Phase indices enforced in CI. Add 2–4 when mid/late pacing meets the curve. */
export const PHASE_TIME_CURVE_ENFORCED: readonly number[] = [1];
