import type { MoveKind } from '../game/availability';
import { UI } from '../game/data';
import type { TraceEntry, TraceSnapshot } from '../sim/Sim';
import { getPhase, PHASE_RULES } from '../game/phases';
import type { SerializedRun } from './traceTypes';

function snap(entry: TraceEntry): TraceSnapshot {
  return entry.snapshot;
}

export interface TraceMilestone {
  kind: 'upgrade' | 'gen' | 'launch' | 'phase';
  t: number;
  totalLoc: number;
  id?: string;
  phaseIndex?: number;
}

export interface ActionRun {
  moveId: string;
  kind: MoveKind;
  target?: string;
  count: number;
  startT: number;
  endT: number;
  startLoc: number;
  endLoc: number;
}

function moveKey(m: NonNullable<TraceEntry['move']>): string {
  return `${m.kind}:${m.id}:${m.target ?? ''}`;
}

/** One seed column: phase bands plus milestones and moves in sim time order. */
export type SeedColumnRow =
  | {
      key: string;
      kind: 'phase-band';
      phaseIndex: number;
      phaseLabel: string;
      rule: string;
      t: number;
    }
  | { key: string; kind: 'launch'; t: number; loc: number }
  | { key: string; kind: 'upgrade'; id: string; t: number; loc: number }
  | { key: string; kind: 'gen'; id: string; t: number; loc: number }
  | {
      key: string;
      kind: 'move';
      moveId: string;
      moveKind: MoveKind;
      target?: string;
      t: number;
      loc: number;
      /** Set when consecutive identical moves are collapsed. */
      count?: number;
      endT?: number;
      endLoc?: number;
    }
  | {
      key: string;
      kind: 'routine-actions';
      t: number;
      loc: number;
      endT: number;
      endLoc: number;
      count: number;
      basicCounts: Partial<Record<BasicActionId, number>>;
      testCounts: Partial<Record<TestActionId, number>>;
    };

export type AlignedTimelineRow = {
  t: number;
  /** Sim ms since the previous aligned row (0 for the first). */
  gapMs: number;
  /** One cell per column (same order as `botIds`); multiple events at once become an array. */
  cells: (SeedColumnRow | SeedColumnRow[] | null)[];
};

/** Grid row showing idle time before the next event row. */
export type TimelineGapRow = {
  kind: 'gap';
  gapMs: number;
  beforeT: number;
};

export type TimelineGridRow =
  | TimelineGapRow
  | ({ kind: 'events' } & AlignedTimelineRow);

/** Insert spacer rows before events when the prior gap is large. */
export function expandTimelineWithGapRows(
  aligned: AlignedTimelineRow[],
  spacerThresholdMs = 15 * 60_000,
): TimelineGridRow[] {
  const out: TimelineGridRow[] = [];
  for (const slot of aligned) {
    if (slot.gapMs >= spacerThresholdMs) {
      out.push({ kind: 'gap', gapMs: slot.gapMs, beforeT: slot.t });
    }
    out.push({ kind: 'events', ...slot });
  }
  return out;
}

function phaseRuleText(index: number): string {
  return PHASE_RULES.find((r) => r.index === index)?.rule ?? `phase ${index}`;
}

function phaseBandRow(columnKey: string, phaseIndex: number, t: number): SeedColumnRow {
  return {
    key: `${columnKey}-phase-${phaseIndex}-${t}`,
    kind: 'phase-band',
    phaseIndex,
    phaseLabel: UI.phases[phaseIndex] ?? `Phase ${phaseIndex}`,
    rule: phaseRuleText(phaseIndex),
    t,
  };
}

function purchaseIdFromMoveId(moveId: string, prefix: string): string | undefined {
  if (!moveId.startsWith(prefix)) return undefined;
  return moveId.slice(prefix.length);
}

/** Milestones already surface buys/launch; skip the duplicate move row. */
export function moveRedundantWithMilestone(
  mv: { t: number; id: string; kind: MoveKind; target?: string },
  milestoneKeys: Set<string>,
): boolean {
  if (mv.kind === 'buy_gen') {
    const id = mv.target ?? purchaseIdFromMoveId(mv.id, 'buy_gen:');
    return id != null && milestoneKeys.has(`${mv.t}|gen|${id}`);
  }
  if (mv.kind === 'buy_upgrade') {
    const id = mv.target ?? purchaseIdFromMoveId(mv.id, 'buy_upgrade:');
    return id != null && milestoneKeys.has(`${mv.t}|up|${id}`);
  }
  if (mv.id === 'launch') {
    return milestoneKeys.has(`${mv.t}|launch`);
  }
  return false;
}

export function milestonePurchaseKeys(milestones: TraceMilestone[]): Set<string> {
  const keys = new Set<string>();
  for (const m of milestones) {
    if (m.kind === 'gen' && m.id) keys.add(`${m.t}|gen|${m.id}`);
    else if (m.kind === 'upgrade' && m.id) keys.add(`${m.t}|up|${m.id}`);
    else if (m.kind === 'launch') keys.add(`${m.t}|launch`);
  }
  return keys;
}

/** Build timeline rows for a single bot column (not interleaved with other bots). */
export function buildSeedColumnRows(run: SerializedRun | undefined, columnKey: string): SeedColumnRow[] {
  if (!run) return [];

  const purchaseKeys = milestonePurchaseKeys(run.milestones);
  const events: SeedColumnRow[] = [phaseBandRow(columnKey, 0, 0)];

  for (const m of run.milestones) {
    if (m.kind === 'phase' && m.phaseIndex != null) {
      events.push(phaseBandRow(columnKey, m.phaseIndex, m.t));
    } else if (m.kind === 'launch') {
      events.push({
        key: `${columnKey}-launch-${m.t}`,
        kind: 'launch',
        t: m.t,
        loc: m.totalLoc,
      });
    } else if (m.kind === 'upgrade' && m.id) {
      events.push({
        key: `${columnKey}-up-${m.id}-${m.t}`,
        kind: 'upgrade',
        id: m.id,
        t: m.t,
        loc: m.totalLoc,
      });
    } else if (m.kind === 'gen' && m.id) {
      events.push({
        key: `${columnKey}-gen-${m.id}-${m.t}`,
        kind: 'gen',
        id: m.id,
        t: m.t,
        loc: m.totalLoc,
      });
    }
  }
  for (let i = 0; i < run.moves.length; i++) {
    const mv = run.moves[i]!;
    if (moveRedundantWithMilestone(mv, purchaseKeys)) continue;
    events.push({
      key: `${columnKey}-mv-${i}-${mv.t}-${mv.id}`,
      kind: 'move',
      moveId: mv.id,
      moveKind: mv.kind,
      target: mv.target,
      t: mv.t,
      loc: mv.loc,
    });
  }

  events.sort((a, b) => a.t - b.t || a.key.localeCompare(b.key));

  const deduped: SeedColumnRow[] = [];
  let lastPhase = -1;
  for (const row of events) {
    if (row.kind === 'phase-band') {
      if (row.phaseIndex === lastPhase) continue;
      lastPhase = row.phaseIndex;
    }
    deduped.push(row);
  }
  return deduped;
}

/** Low-priority chat/actions often dominate traces; group for readability. */
export const BASIC_ACTION_IDS = [
  'prompt',
  'paste_error',
  'kick_agent',
  'clear_context',
] as const;

export type BasicActionId = (typeof BASIC_ACTION_IDS)[number];

export const TEST_ACTION_IDS = ['write_test', 'run_tests'] as const;

export type TestActionId = (typeof TEST_ACTION_IDS)[number];

const BASIC_ACTION_SET = new Set<string>(BASIC_ACTION_IDS);
const TEST_ACTION_SET = new Set<string>(TEST_ACTION_IDS);
const ROUTINE_ACTION_SET = new Set<string>([...BASIC_ACTION_IDS, ...TEST_ACTION_IDS]);

function isRoutineMove(row: SeedColumnRow): row is Extract<SeedColumnRow, { kind: 'move' }> {
  return row.kind === 'move' && ROUTINE_ACTION_SET.has(row.moveId);
}

function moveCollapseKey(row: Extract<SeedColumnRow, { kind: 'move' }>): string {
  return `${row.moveKind}:${row.moveId}:${row.target ?? ''}`;
}

/** Merge consecutive identical moves into one row with a repeat count. */
export function collapseSeedColumnRows(rows: SeedColumnRow[]): SeedColumnRow[] {
  const out: SeedColumnRow[] = [];
  for (const row of rows) {
    if (row.kind !== 'move') {
      out.push(row);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev?.kind === 'move' && moveCollapseKey(prev) === moveCollapseKey(row)) {
      prev.count = (prev.count ?? 1) + 1;
      prev.endT = row.t;
      prev.endLoc = row.loc;
      continue;
    }
    out.push({
      ...row,
      count: 1,
      endT: row.t,
      endLoc: row.loc,
    });
  }
  return out;
}

export function formatBucketCounts(
  ids: readonly string[],
  counts: Partial<Record<string, number>>,
): string {
  return ids
    .filter((id) => (counts[id] ?? 0) > 0)
    .map((id) => `${id} ${counts[id]}`)
    .join(', ');
}

export function formatBasicActionCounts(
  counts: Partial<Record<BasicActionId, number>>,
): string {
  return formatBucketCounts(BASIC_ACTION_IDS, counts);
}

export function formatTestActionCounts(counts: Partial<Record<TestActionId, number>>): string {
  return formatBucketCounts(TEST_ACTION_IDS, counts);
}

export function sumBucketCounts(counts: Partial<Record<string, number>>): number {
  let n = 0;
  for (const v of Object.values(counts)) n += v ?? 0;
  return n;
}

/** Primary timeline label: separate basic vs test totals on one collapsed row. */
export function routineActionLabel(
  basicCounts: Partial<Record<BasicActionId, number>>,
  testCounts: Partial<Record<TestActionId, number>>,
): string {
  const parts: string[] = [];
  const basicN = sumBucketCounts(basicCounts);
  const testN = sumBucketCounts(testCounts);
  if (basicN > 0) parts.push(`basic ${basicN}`);
  if (testN > 0) parts.push(`tests ${testN}`);
  return parts.length > 0 ? parts.join(' · ') : 'basic · tests';
}

export function formatRoutineActionBreakdown(
  basicCounts: Partial<Record<BasicActionId, number>>,
  testCounts: Partial<Record<TestActionId, number>>,
): string {
  const parts: string[] = [];
  const basic = formatBasicActionCounts(basicCounts);
  const tests = formatTestActionCounts(testCounts);
  if (basic) parts.push(basic);
  if (tests) parts.push(tests);
  return parts.join(' · ');
}

function routineActionsRow(
  first: Extract<SeedColumnRow, { kind: 'move' }>,
  last: Extract<SeedColumnRow, { kind: 'move' }>,
  basicCounts: Partial<Record<BasicActionId, number>>,
  testCounts: Partial<Record<TestActionId, number>>,
  count: number,
): SeedColumnRow {
  const prefix = first.key.includes('-mv-') ? first.key.split('-mv-')[0]! : first.key;
  return {
    key: `${prefix}-routine-${first.t}-${last.endT ?? last.t}`,
    kind: 'routine-actions',
    t: first.t,
    loc: first.loc,
    endT: last.endT ?? last.t,
    endLoc: last.endLoc ?? last.loc,
    count,
    basicCounts,
    testCounts,
  };
}

/** Merge consecutive basic + test actions into one row (separate sub-counts). */
export function collapseRoutineActions(rows: SeedColumnRow[]): SeedColumnRow[] {
  const out: SeedColumnRow[] = [];
  let groupFirst: Extract<SeedColumnRow, { kind: 'move' }> | null = null;
  let groupLast: Extract<SeedColumnRow, { kind: 'move' }> | null = null;
  const basicCounts: Partial<Record<BasicActionId, number>> = {};
  const testCounts: Partial<Record<TestActionId, number>> = {};
  let total = 0;

  const flush = () => {
    if (!groupFirst || !groupLast || total === 0) {
      groupFirst = null;
      groupLast = null;
      return;
    }
    out.push(
      routineActionsRow(groupFirst, groupLast, { ...basicCounts }, { ...testCounts }, total),
    );
    groupFirst = null;
    groupLast = null;
    for (const k of Object.keys(basicCounts)) delete basicCounts[k as BasicActionId];
    for (const k of Object.keys(testCounts)) delete testCounts[k as TestActionId];
    total = 0;
  };

  for (const row of rows) {
    if (!isRoutineMove(row)) {
      flush();
      out.push(row);
      continue;
    }
    const n = row.count ?? 1;
    if (!groupFirst) groupFirst = row;
    groupLast = row;
    if (BASIC_ACTION_SET.has(row.moveId)) {
      const id = row.moveId as BasicActionId;
      basicCounts[id] = (basicCounts[id] ?? 0) + n;
    } else {
      const id = row.moveId as TestActionId;
      testCounts[id] = (testCounts[id] ?? 0) + n;
    }
    total += n;
  }
  flush();
  return out;
}

/** Identical moves, then routine (basic + test) groups. */
export function collapseTimelineRows(rows: SeedColumnRow[]): SeedColumnRow[] {
  return collapseRoutineActions(collapseSeedColumnRows(rows));
}

/**
 * Rows keyed by sim time so events at the same `t` line up across bot columns.
 */
export function buildAlignedTimeline(
  botIds: string[],
  runsByBot: Map<string, SerializedRun>,
): AlignedTimelineRow[] {
  const entries: { t: number; colIdx: number; row: SeedColumnRow }[] = [];

  for (let colIdx = 0; colIdx < botIds.length; colIdx++) {
    const botId = botIds[colIdx]!;
    const raw = buildSeedColumnRows(runsByBot.get(botId), botId);
    const rows = collapseTimelineRows(raw);
    for (const row of rows) {
      entries.push({ t: row.t, colIdx, row });
    }
  }

  entries.sort((a, b) => a.t - b.t || a.colIdx - b.colIdx);

  const aligned: AlignedTimelineRow[] = [];
  let i = 0;
  let prevT = 0;
  while (i < entries.length) {
    const t = entries[i]!.t;
    const cells: AlignedTimelineRow['cells'] = botIds.map(() => null);
    while (i < entries.length && entries[i]!.t === t) {
      const { colIdx, row } = entries[i]!;
      const cur = cells[colIdx];
      if (cur == null) cells[colIdx] = row;
      else if (Array.isArray(cur)) cur.push(row);
      else cells[colIdx] = [cur, row];
      i += 1;
    }
    aligned.push({ t, gapMs: Math.max(0, t - prevT), cells });
    prevT = t;
  }
  return aligned;
}

export function compressActionRuns(trace: TraceEntry[]): ActionRun[] {
  const runs: ActionRun[] = [];
  for (const entry of trace) {
    if (!entry.move) continue;
    const key = moveKey(entry.move);
    const prev = runs[runs.length - 1];
    const prevKey = prev ? `${prev.kind}:${prev.moveId}:${prev.target ?? ''}` : '';
    if (prev && prevKey === key) {
      prev.count += 1;
      prev.endT = entry.t;
      prev.endLoc = snap(entry).totalLoc;
      continue;
    }
    runs.push({
      moveId: entry.move.id,
      kind: entry.move.kind,
      target: entry.move.target,
      count: 1,
      startT: entry.t,
      endT: entry.t,
      startLoc: snap(entry).totalLoc,
      endLoc: snap(entry).totalLoc,
    });
  }
  return runs;
}

export function milestonesBetween(
  prev: TraceSnapshot,
  next: TraceSnapshot,
  t: number,
): TraceMilestone[] {
  const out: TraceMilestone[] = [];
  if (!prev.launched && next.launched) {
    out.push({ kind: 'launch', t, totalLoc: next.totalLoc });
  }
  const prevPhase = getPhase(prev);
  const nextPhase = getPhase(next);
  if (prevPhase !== nextPhase) {
    out.push({ kind: 'phase', t, totalLoc: next.totalLoc, phaseIndex: nextPhase });
  }
  for (const id of next.upgrades) {
    if (!prev.upgrades.includes(id)) {
      out.push({ kind: 'upgrade', id, t, totalLoc: next.totalLoc });
    }
  }
  for (const id of Object.keys(next.genCounts)) {
    const prevN = prev.genCounts[id] ?? 0;
    const nextN = next.genCounts[id] ?? 0;
    if (nextN > prevN) {
      out.push({ kind: 'gen', id, t, totalLoc: next.totalLoc });
    }
  }
  return out;
}

/** State deltas worth drawing on a timeline (upgrades, gens, launch, flavor phase). */
export function extractMilestones(trace: TraceEntry[]): TraceMilestone[] {
  if (trace.length === 0) return [];
  const out: TraceMilestone[] = [];
  let prev = snap(trace[0]);
  for (const entry of trace) {
    const next = snap(entry);
    out.push(...milestonesBetween(prev, next, entry.t));
    prev = next;
  }
  return out;
}

export function fmtVirtualMs(t: number): string {
  if (t >= 3_600_000) return `${(t / 3_600_000).toFixed(1)}h`;
  if (t >= 60_000) return `${(t / 60_000).toFixed(1)}m`;
  if (t >= 1000) return `${(t / 1000).toFixed(1)}s`;
  return `${t}ms`;
}

/** Display sim clock in debug UI (same units as fmtVirtualMs). */
export const fmtTime = fmtVirtualMs;

export const MS_PER_VIRTUAL_HOUR = 3_600_000;

/** Default vertical scale for trace timeline (px per sim hour). */
export const TRACE_PX_PER_HOUR = 360;

export function virtualHoursToMs(hours: number): number {
  return hours * MS_PER_VIRTUAL_HOUR;
}

export function traceCanvasHeightPx(budgetMs: number, pxPerHour = TRACE_PX_PER_HOUR): number {
  const hours = budgetMs / MS_PER_VIRTUAL_HOUR;
  return Math.max(480, Math.ceil(hours * pxPerHour));
}

export function timeToTopPx(t: number, budgetMs: number, canvasPx: number): number {
  if (budgetMs <= 0) return 0;
  return (t / budgetMs) * canvasPx;
}

/** Gaps between distinct event times (any seed) worth labeling on the axis. */
export function collectTimelineGaps(
  rowSets: SeedColumnRow[][],
  thresholdMs = 10 * 60_000,
): { midT: number; gapMs: number }[] {
  const times = new Set<number>();
  for (const rows of rowSets) {
    for (const r of rows) {
      times.add(r.t);
      if (
        (r.kind === 'move' || r.kind === 'routine-actions') &&
        r.endT != null &&
        r.endT > r.t
      ) {
        times.add(r.endT);
      }
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  const gaps: { midT: number; gapMs: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gapMs = sorted[i]! - sorted[i - 1]!;
    if (gapMs >= thresholdMs) {
      gaps.push({ midT: (sorted[i]! + sorted[i - 1]!) / 2, gapMs });
    }
  }
  return gaps;
}

/** More bins for long runs so heatmap cells stay readable. */
export function heatmapBinCount(budgetMs: number): number {
  return budgetMs >= 3_600_000 ? 48 : 24;
}

export function fmtLoc(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Per-upgrade purchase times (virtual ms) across many runs. */
export function collectUpgradePurchaseTimes(
  traces: { seed: number; milestones: TraceMilestone[] }[],
): Map<string, { seed: number; t: number; loc: number }[]> {
  const map = new Map<string, { seed: number; t: number; loc: number }[]>();
  for (const { seed, milestones } of traces) {
    for (const m of milestones) {
      if (m.kind !== 'upgrade' || !m.id) continue;
      const list = map.get(m.id) ?? [];
      list.push({ seed, t: m.t, loc: m.totalLoc });
      map.set(m.id, list);
    }
  }
  return map;
}

export interface HeatmapBin {
  label: string;
  startMs: number;
  endMs: number;
  count: number;
}

/** Histogram of when an upgrade was first bought (one dot per seed run). */
export function binPurchaseTimes(
  times: number[],
  budgetMs: number,
  binCount = 24,
): HeatmapBin[] {
  const binMs = budgetMs / binCount;
  const bins: HeatmapBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const startMs = i * binMs;
    bins.push({
      label: fmtVirtualMs(startMs),
      startMs,
      endMs: startMs + binMs,
      count: 0,
    });
  }
  for (const t of times) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor(t / binMs)));
    bins[idx].count += 1;
  }
  return bins;
}
