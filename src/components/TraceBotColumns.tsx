import {
  Fragment,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  buildAlignedTimeline,
  expandTimelineWithGapRows,
  fmtLoc,
  fmtTime,
  formatBasicActionCounts,
  formatRoutineActionBreakdown,
  routineActionLabel,
  formatTestActionCounts,
  type SeedColumnRow,
  type TimelineGridRow,
} from '../debug/traceAnalyze';
import { actionDisplayName, actionHoverTitle } from '../debug/actionMeta';
import { GEN_BY_ID, genHoverTitle } from '../debug/genMeta';
import { UPGRADE_BY_ID, upgradeHoverTitle } from '../debug/upgradeMeta';
import { DEBUG_BOTS, type DebugBotId } from '../sim/bots';
import type { TraceSimStatus } from '../debug/useTraceSim';
import type { SerializedRun } from '../debug/traceTypes';
import { botPillClass } from './debugUi';
import { UI } from '../game/data';
import { PHASE_COUNT, PHASE_RULES } from '../game/phases';

function eventLabel(row: SeedColumnRow): string {
  switch (row.kind) {
    case 'phase-band':
      return row.phaseLabel;
    case 'launch':
      return 'Launched';
    case 'upgrade':
      return UPGRADE_BY_ID.get(row.id)?.name ?? row.id;
    case 'gen':
      return GEN_BY_ID.get(row.id)?.name ?? row.id;
    case 'routine-actions':
      return routineActionLabel(row.basicCounts, row.testCounts);
    case 'move': {
      const base = row.target
        ? `${actionDisplayName(row.moveId)} → ${row.target}`
        : actionDisplayName(row.moveId);
      const n = row.count ?? 1;
      return n > 1 ? `${base} × ${n}` : base;
    }
  }
}

const EVENT_CLASS: Record<Exclude<SeedColumnRow['kind'], 'phase-band'>, string> = {
  launch: 'text-purple',
  upgrade: 'text-green font-medium',
  gen: 'text-log-news',
  move: 'text-blue',
  'routine-actions': 'text-dim',
};

function routineActionsDurationHint(
  row: Extract<SeedColumnRow, { kind: 'routine-actions' }>,
): string | undefined {
  const breakdown = formatRoutineActionBreakdown(row.basicCounts, row.testCounts);
  if (row.count <= 1 || row.endT <= row.t) return breakdown;
  return `${row.count} moves · ${fmtTime(row.t)}–${fmtTime(row.endT)} · ${fmtLoc(row.loc)}→${fmtLoc(row.endLoc)} LOC · ${breakdown}`;
}

function moveDurationHint(row: Extract<SeedColumnRow, { kind: 'move' }>): string | undefined {
  const n = row.count ?? 1;
  if (n <= 1 || row.endT == null) return undefined;
  return `${n} moves · ${fmtTime(row.t)}–${fmtTime(row.endT)} · ${fmtLoc(row.loc)}→${fmtLoc(row.endLoc ?? row.loc)} LOC`;
}

function UpgradeTimelineCell({ row }: { row: Extract<SeedColumnRow, { kind: 'upgrade' }> }) {
  const def = UPGRADE_BY_ID.get(row.id);
  const title = def
    ? `${upgradeHoverTitle(def)}\n@${fmtTime(row.t)} · ${fmtLoc(row.loc)} LOC`
    : `@${fmtTime(row.t)} · ${fmtLoc(row.loc)} LOC`;
  return (
    <div className={EVENT_CLASS.upgrade} title={title}>
      <div className="font-semibold leading-tight">{def?.name ?? row.id}</div>
      <div className="text-dim text-[10px] leading-tight font-normal">{row.id}</div>
    </div>
  );
}

function MoveTimelineCell({ row }: { row: Extract<SeedColumnRow, { kind: 'move' }> }) {
  const name = actionDisplayName(row.moveId);
  const hint = actionHoverTitle(row.moveId);
  const duration = moveDurationHint(row);
  const title = [hint, duration, `@${fmtTime(row.t)} · ${fmtLoc(row.loc)} LOC`]
    .filter(Boolean)
    .join('\n');
  const n = row.count ?? 1;
  return (
    <div className={EVENT_CLASS.move} title={title || undefined}>
      <div className="font-semibold leading-tight">
        {n > 1 ? `${name} × ${n}` : name}
      </div>
      <div className="text-dim text-[10px] leading-tight font-normal">{row.moveId}</div>
      {row.target && (
        <div className="text-dim text-[10px] leading-tight font-normal">{row.target}</div>
      )}
    </div>
  );
}

function GenTimelineCell({ row }: { row: Extract<SeedColumnRow, { kind: 'gen' }> }) {
  const def = GEN_BY_ID.get(row.id);
  const title = def
    ? `${genHoverTitle(def)}\n@${fmtTime(row.t)} · ${fmtLoc(row.loc)} LOC`
    : `@${fmtTime(row.t)} · ${fmtLoc(row.loc)} LOC`;
  return (
    <div className={EVENT_CLASS.gen} title={title}>
      <div className="font-semibold leading-tight">{def?.name ?? row.id}</div>
      <div className="text-dim text-[10px] leading-tight font-normal">{row.id}</div>
    </div>
  );
}

function PhaseBandContent({
  row,
  oneLine = false,
}: {
  row: Extract<SeedColumnRow, { kind: 'phase-band' }>;
  oneLine?: boolean;
}) {
  const tip = `${row.phaseLabel}\n${row.rule}`;
  if (oneLine) {
    return (
      <span
        className="flex min-w-0 items-center gap-1.5 truncate text-[10px] leading-none"
        title={tip}
      >
        <span className="shrink-0 font-semibold uppercase tracking-wide text-yellow tabular-nums">
          P{row.phaseIndex}
        </span>
        <span className="min-w-0 truncate font-medium text-yellow">{row.phaseLabel}</span>
      </span>
    );
  }
  return (
    <>
      <span className="text-[10px] uppercase tracking-wider text-yellow font-semibold">
        Phase {row.phaseIndex}
      </span>
      <p className="text-[11px] text-yellow leading-snug font-medium mt-0.5">{row.phaseLabel}</p>
      <p className="text-[10px] text-dim mt-0.5 leading-snug line-clamp-2">{row.rule}</p>
    </>
  );
}

function splitCellPhase(
  cell: SeedColumnRow | SeedColumnRow[] | null,
): {
  phase: Extract<SeedColumnRow, { kind: 'phase-band' }> | null;
  rest: SeedColumnRow | SeedColumnRow[] | null;
} {
  if (cell == null) return { phase: null, rest: null };
  const rows = Array.isArray(cell) ? cell : [cell];
  const phase = rows.find((r): r is Extract<SeedColumnRow, { kind: 'phase-band' }> => r.kind === 'phase-band') ?? null;
  const restRows = rows.filter((r) => r.kind !== 'phase-band');
  if (restRows.length === 0) return { phase, rest: null };
  return { phase, rest: restRows.length === 1 ? restRows[0] : restRows };
}

function TimelineCell({
  row,
  expandedKey,
  setExpandedKey,
}: {
  row: SeedColumnRow;
  expandedKey: string | null;
  setExpandedKey: (key: string | null) => void;
}) {
  if (row.kind === 'phase-band') {
    return (
      <div className="trace-phase-band rounded px-2 py-2 w-full">
        <PhaseBandContent row={row} />
      </div>
    );
  }

  const expanded = expandedKey === row.key;
  return (
    <div className="py-1 px-1 text-[11px] w-full">
      {row.kind === 'upgrade' ? (
        <UpgradeTimelineCell row={row} />
      ) : row.kind === 'gen' ? (
        <GenTimelineCell row={row} />
      ) : row.kind === 'move' ? (
        (row.count ?? 1) > 1 ? (
          <button
            type="button"
            className="text-left w-full"
            title={moveDurationHint(row)}
            onClick={() => setExpandedKey(expanded ? null : row.key)}
          >
            <MoveTimelineCell row={row} />
          </button>
        ) : (
          <MoveTimelineCell row={row} />
        )
      ) : row.kind === 'routine-actions' ? (
        <span
          className={EVENT_CLASS['routine-actions']}
          title={routineActionsDurationHint(row)}
        >
          {eventLabel(row)}
        </span>
      ) : (
        <span className={EVENT_CLASS[row.kind]}>{eventLabel(row)}</span>
      )}
      {row.kind === 'routine-actions' && formatRoutineActionBreakdown(row.basicCounts, row.testCounts) && (
        <p className="text-dim text-[10px] mt-0.5 leading-snug">
          {formatRoutineActionBreakdown(row.basicCounts, row.testCounts)}
        </p>
      )}
    </div>
  );
}

function CellStack({
  cell,
  expandedKey,
  setExpandedKey,
}: {
  cell: SeedColumnRow | SeedColumnRow[] | null;
  expandedKey: string | null;
  setExpandedKey: (key: string | null) => void;
}) {
  if (cell == null) return null;
  const rows = Array.isArray(cell) ? cell : [cell];
  return (
    <div className="flex flex-col gap-1 justify-center w-full">
      {rows.map((row) => (
        <TimelineCell key={row.key} row={row} expandedKey={expandedKey} setExpandedKey={setExpandedKey} />
      ))}
    </div>
  );
}

function gapLabelClass(gapMs: number): string {
  if (gapMs >= 15 * 60_000) return 'text-purple font-semibold';
  if (gapMs >= 60_000) return 'text-purple';
  if (gapMs >= 5_000) return 'text-dim';
  return 'text-dim opacity-60';
}

function TimeCell({ slot }: { slot: Extract<TimelineGridRow, { kind: 'events' }> }) {
  const showInlineGap = slot.gapMs >= 60_000 && slot.gapMs < 15 * 60_000;
  const showSmallGap = slot.gapMs >= 5_000 && slot.gapMs < 60_000;
  return (
    <div className="flex flex-col items-end justify-center gap-0.5 py-2 pr-2 min-h-[36px]">
      {(showInlineGap || showSmallGap) && (
        <span className={`text-[9px] tabular-nums ${gapLabelClass(slot.gapMs)}`}>
          +{fmtTime(slot.gapMs)}
        </span>
      )}
      <time className="text-[11px] text-dim tabular-nums font-medium">{fmtTime(slot.t)}</time>
    </div>
  );
}

function rowSurfaceClass(rowIdx: number): string {
  return rowIdx % 2 === 0 ? 'bg-[var(--debug-surface)]' : 'bg-[var(--debug-surface-2)]/55';
}

const TIMELINE_GRID_COLUMNS = (columnCount: number) =>
  `88px repeat(${columnCount}, minmax(0, 1fr))`;

function phaseSpanAt(spans: ColumnPhaseSpan[], rowIdx: number): ColumnPhaseSpan | undefined {
  return spans.find((s) => rowIdx >= s.startRow && rowIdx < s.endRow);
}

type ColumnPhaseSpan = {
  startRow: number;
  endRow: number;
  phase: Extract<SeedColumnRow, { kind: 'phase-band' }>;
};

/** Row ranges per column so phase bands can sticky across every row in a phase (CSS subgrid). */
function buildPhaseSpansByColumn(
  grid: TimelineGridRow[],
  columnIds: readonly string[],
): Map<string, ColumnPhaseSpan[]> {
  const byColumn = new Map<string, ColumnPhaseSpan[]>();

  columnIds.forEach((colId, colIdx) => {
    const spans: ColumnPhaseSpan[] = [];
    let spanStart = 0;
    let spanPhase: Extract<SeedColumnRow, { kind: 'phase-band' }> | null = null;
    let lastPhaseIndex = -1;

    const closeSpan = (endRow: number) => {
      if (spanPhase && endRow > spanStart) {
        spans.push({ startRow: spanStart, endRow, phase: spanPhase });
      }
    };

    for (let rowIdx = 0; rowIdx < grid.length; rowIdx++) {
      const slot = grid[rowIdx];
      if (slot.kind !== 'events') continue;

      const cell = slot.cells[colIdx];
      if (cell == null) continue;

      let newBand: Extract<SeedColumnRow, { kind: 'phase-band' }> | null = null;
      for (const row of Array.isArray(cell) ? cell : [cell]) {
        if (row.kind === 'phase-band' && row.phaseIndex > lastPhaseIndex) {
          newBand = row;
        }
      }
      if (!newBand) continue;

      closeSpan(rowIdx);
      spanStart = rowIdx;
      spanPhase = newBand;
      lastPhaseIndex = newBand.phaseIndex;
    }

    closeSpan(grid.length);
    byColumn.set(colId, spans);
  });

  return byColumn;
}

/** Earliest grid row where any column first entered `phaseIndex`. */
function buildEarliestPhaseRows(
  grid: TimelineGridRow[],
  columnIds: readonly string[],
): ReadonlyMap<number, number> {
  const byColumn = buildPhaseSpansByColumn(grid, columnIds);
  const earliest = new Map<number, number>();
  for (const spans of byColumn.values()) {
    for (const { startRow, phase } of spans) {
      const idx = phase.phaseIndex;
      const prev = earliest.get(idx);
      if (prev === undefined || startRow < prev) {
        earliest.set(idx, startRow);
      }
    }
  }
  return earliest;
}

function TimelinePhaseJumpBar({
  grid,
  columnIds,
  scrollRef,
}: {
  grid: TimelineGridRow[];
  columnIds: readonly string[];
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const earliest = useMemo(
    () => buildEarliestPhaseRows(grid, columnIds),
    [grid, columnIds],
  );

  const jumpToRow = useCallback(
    (rowIdx: number) => {
      const root = scrollRef.current;
      if (!root) return;
      root
        .querySelector<HTMLElement>(`[data-timeline-row="${rowIdx}"]`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    [scrollRef],
  );

  return (
    <nav
      className="debug-phase-jumps px-3 pt-3 shrink-0 border-b"
      style={{ borderColor: 'var(--debug-border)' }}
      aria-label="Jump to phase"
    >
      {Array.from({ length: PHASE_COUNT }, (_, phaseIndex) => {
        const rowIdx = earliest.get(phaseIndex);
        const enabled = rowIdx !== undefined;
        const label = UI.phases[phaseIndex] ?? `Phase ${phaseIndex}`;
        const rule = PHASE_RULES.find((r) => r.index === phaseIndex)?.rule;
        const title = enabled
          ? `Jump to first bot at ${label}${rule ? ` (${rule})` : ''}`
          : `${label}${rule ? ` (${rule})` : ''} — not reached yet`;

        return (
          <button
            key={phaseIndex}
            type="button"
            disabled={!enabled}
            className="debug-phase-jump"
            title={title}
            onClick={() => enabled && jumpToRow(rowIdx)}
          >
            <span className="debug-phase-jump-index">P{phaseIndex}</span>
            <span className="debug-phase-jump-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function timelineRowShellClass(rowIdx: number, slot: TimelineGridRow): string {
  const surface = rowSurfaceClass(rowIdx);
  const minH = slot.kind === 'gap' ? 'min-h-[28px]' : 'min-h-[36px]';
  return `border-b ${minH} ${surface}`;
}

function TimelineColumnHeaders({
  columnIds,
  columns,
}: {
  columnIds: readonly string[];
  columns: DebugTimelineColumn[];
}) {
  return (
    <div
      className="grid w-full shrink-0 border-b text-[11px] font-semibold"
      style={{
        gridTemplateColumns: TIMELINE_GRID_COLUMNS(columnIds.length),
        borderColor: 'var(--debug-border)',
        background: 'var(--debug-surface-2)',
      }}
    >
      <div
        className="sticky left-0 z-[1] px-2 py-2 text-dim border-r bg-[var(--debug-surface-2)]"
        style={{ borderColor: 'var(--debug-border)' }}
      >
        time / gap
      </div>
      {columns.map((col) => (
        <div
          key={col.id}
          className="px-2 py-2 border-r last:border-r-0 min-w-0"
          style={{ borderColor: 'var(--debug-border)' }}
        >
          <span
            className={`inline-block px-1.5 py-0.5 rounded border ${
              col.pillClass ?? 'debug-nav-idle'
            }`}
            title={col.title}
          >
            {col.label}
          </span>
          {col.meta && (
            <span className="text-dim font-normal ml-1 tabular-nums">{col.meta}</span>
          )}
          {col.status && (
            <p
              className={`text-[10px] font-normal mt-1 leading-snug tabular-nums ${
                col.status.startsWith('Complete')
                  ? 'text-green'
                  : col.status === 'Queued…'
                    ? 'text-dim'
                    : 'text-purple animate-pulse'
              }`}
              aria-live="polite"
            >
              {col.status}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Sticky phase band only — event cells are separate grid items so rows stay aligned. */
function PhaseStickyOverlay({ span, colIdx }: { span: ColumnPhaseSpan; colIdx: number }) {
  const gridRowSpan = `${span.startRow + 1} / ${span.endRow + 1}`;
  return (
    <div
      className="timeline-phase-overlay relative z-[2] border-r min-w-0 pointer-events-none"
      style={{ gridColumn: colIdx + 2, gridRow: gridRowSpan }}
    >
      <div className="sticky top-0 px-1 pt-1 pointer-events-auto">
        <div className="trace-phase-band trace-phase-band--sticky rounded px-2 py-1 shadow-[0_1px_0_var(--debug-border)]">
          <PhaseBandContent row={span.phase} oneLine />
        </div>
      </div>
    </div>
  );
}

function padBelowPhaseBand(
  spans: ColumnPhaseSpan[],
  rowIdx: number,
  slot: TimelineGridRow,
): boolean {
  const span = phaseSpanAt(spans, rowIdx);
  return span != null && span.startRow === rowIdx && slot.kind !== 'gap';
}

export type DebugTimelineColumn = {
  id: string;
  label: string;
  pillClass?: string;
  title?: string;
  meta?: string;
  status?: string | null;
};

export function DebugTimeline({
  columns,
  grid,
  footer,
  showLegend = true,
  headerNote,
}: {
  columns: DebugTimelineColumn[];
  grid: TimelineGridRow[];
  footer?: ReactNode;
  showLegend?: boolean;
  headerNote?: string;
}) {
  const columnIds = useMemo(() => columns.map((c) => c.id), [columns]);
  const eventCount = useMemo(
    () =>
      grid.reduce((n, slot) => {
        if (slot.kind !== 'events') return n;
        return n + slot.cells.filter((c) => c != null).length;
      }, 0),
    [grid],
  );
  const gapSpacerCount = useMemo(() => grid.filter((r) => r.kind === 'gap').length, [grid]);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="debug-panel flex flex-col min-h-0">
      {showLegend && (
        <TimelinePhaseJumpBar grid={grid} columnIds={columnIds} scrollRef={scrollRef} />
      )}
      {headerNote && (
        <div
          className="text-[11px] text-dim px-3 py-2 border-t border-b shrink-0"
          style={{ borderColor: 'var(--debug-border)' }}
        >
          {headerNote}
        </div>
      )}
      <TimelineColumnHeaders columnIds={columnIds} columns={columns} />
      <div ref={scrollRef} className="overflow-y-auto max-h-[min(72vh,760px)] min-h-0">
        {grid.length === 0 ? (
          <p className="debug-prose text-[12px] p-4">No events yet.</p>
        ) : (
          <TimelineScrollBody columnIds={columnIds} grid={grid} />
        )}
      </div>
      {footer ??
        (grid.length > 0 && (
          <p
            className="debug-prose text-[10px] px-3 py-2 border-t shrink-0"
            style={{ borderColor: 'var(--debug-border)' }}
          >
            {eventCount.toLocaleString()} event
            {eventCount === 1 ? '' : 's'}
            {gapSpacerCount > 0 &&
              ` · ${gapSpacerCount} gap row${gapSpacerCount === 1 ? '' : 's'} (≥15m idle)`}
          </p>
        ))}
    </div>
  );
}

function TimelineScrollBody({
  columnIds,
  grid,
}: {
  columnIds: readonly string[];
  grid: TimelineGridRow[];
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const segmentsPerColIdx = useMemo(() => {
    const byColumn = buildPhaseSpansByColumn(grid, columnIds);
    return columnIds.map((id) => byColumn.get(id) ?? []);
  }, [grid, columnIds]);

  return (
    <div
      className="timeline-grid grid w-full text-[11px]"
      style={{
        gridTemplateColumns: TIMELINE_GRID_COLUMNS(columnIds.length),
        gridTemplateRows: `repeat(${grid.length}, auto)`,
      }}
    >
      {grid.map((slot, rowIdx) => {
        const gridRow = rowIdx + 1;
        const surface = rowSurfaceClass(rowIdx);

        const timeCell =
          slot.kind === 'gap' ? (
            <div
              key={`time-gap-${slot.beforeT}`}
              data-timeline-row={rowIdx}
              className={`sticky left-0 z-[1] border-r border-b flex flex-col items-end justify-center px-2 py-2 ${surface}`}
              style={{ gridColumn: 1, gridRow, borderColor: 'var(--debug-border)' }}
            >
              <span className="text-[10px] text-purple font-semibold tabular-nums">
                +{fmtTime(slot.gapMs)}
              </span>
              <span className="text-[9px] text-dim">idle</span>
            </div>
          ) : (
            <div
              key={`time-${slot.t}`}
              data-timeline-row={rowIdx}
              className={`sticky left-0 z-[1] border-r border-b flex items-center justify-end pr-2 ${surface}`}
              style={{ gridColumn: 1, gridRow, borderColor: 'var(--debug-border)' }}
            >
              <TimeCell slot={slot} />
            </div>
          );

        const botCells = columnIds.map((colId, colIdx) => {
          const spans = segmentsPerColIdx[colIdx];

          if (slot.kind === 'gap') {
            return (
              <div
                key={`gap-${slot.beforeT}-${colId}`}
                className={`${timelineRowShellClass(rowIdx, slot)} border-r`}
                style={{
                  gridColumn: colIdx + 2,
                  gridRow,
                  borderColor: 'var(--debug-border)',
                  background: 'color-mix(in srgb, var(--purple) 6%, var(--debug-surface))',
                }}
                aria-hidden
              />
            );
          }

          const { rest } = splitCellPhase(slot.cells[colIdx]);
          const phasePad = padBelowPhaseBand(spans, rowIdx, slot);
          return (
            <div
              key={`${slot.t}-${colId}`}
              className={`${timelineRowShellClass(rowIdx, slot)} relative z-0 flex items-center justify-center px-1 ${
                phasePad ? 'pt-7' : ''
              } ${rest == null ? 'bg-[color:var(--debug-surface-2)]/20' : ''}`}
              style={{
                gridColumn: colIdx + 2,
                gridRow,
                borderColor: 'var(--debug-border)',
              }}
            >
              {rest != null && (
                <CellStack cell={rest} expandedKey={expandedKey} setExpandedKey={setExpandedKey} />
              )}
            </div>
          );
        });

        return (
          <Fragment key={slot.kind === 'gap' ? `row-gap-${slot.beforeT}` : `row-t-${slot.t}`}>
            {timeCell}
            {botCells}
          </Fragment>
        );
      })}
      {columnIds.flatMap((colId, colIdx) =>
        segmentsPerColIdx[colIdx].map((span) => (
          <PhaseStickyOverlay
            key={`phase-${colId}-${span.startRow}`}
            span={span}
            colIdx={colIdx}
          />
        )),
      )}
    </div>
  );
}

function columnStreamStatus(
  botId: DebugBotId,
  run: SerializedRun | undefined,
  simStatus: TraceSimStatus | undefined,
  botProgress: Partial<Record<DebugBotId, string>> | undefined,
): string | null {
  if (simStatus === 'ready' || simStatus === 'error' || simStatus === undefined) return null;
  const line = botProgress?.[botId];
  if (line) return line;
  if (run) return 'Starting…';
  return 'Queued…';
}

export function TraceBotColumns({
  botIds,
  runsByBot,
  budgetMs,
  simSeed,
  simStatus,
  botProgress,
}: {
  botIds: DebugBotId[];
  runsByBot: Map<DebugBotId, SerializedRun>;
  budgetMs: number;
  simSeed: number;
  simStatus?: TraceSimStatus;
  botProgress?: Partial<Record<DebugBotId, string>>;
}) {
  const aligned = useMemo(
    () => buildAlignedTimeline(botIds, runsByBot),
    [botIds, runsByBot],
  );

  const grid = useMemo(() => expandTimelineWithGapRows(aligned), [aligned]);

  const anyRun = botIds.some((id) => runsByBot.has(id));

  const columns: DebugTimelineColumn[] = botIds.map((botId, colIdx) => {
    const run = runsByBot.get(botId);
    const streamStatus = columnStreamStatus(botId, run, simStatus, botProgress);
    const label = DEBUG_BOTS[botId]?.label ?? botId;
    const patienceHint =
      botId === 'progress_30s'
        ? 'Adaptive progress (30s): launch/buys; waits for soon-unlocks — default trace column.'
        : botId === 'progress'
          ? 'Adaptive progress (10s): launch/buys; token/bug fixes by pressure.'
          : botId === 'loc_rank'
          ? 'Fixed LOC priority table; 10s patience.'
          : botId === 'greedy_rank'
            ? 'Fixed progress table; 5s patience (fast launch).'
            : botId === 'loc'
              ? 'State-based: favors LOC and purchases over hygiene.'
              : botId === 'hygiene'
                ? 'State-based: favors tests and bug tools when bugs are high.'
                : undefined;
    return {
      id: botId,
      label,
      pillClass: botPillClass(colIdx),
      title: patienceHint,
      meta: run ? `${run.moves.length.toLocaleString()} moves` : undefined,
      status: streamStatus,
    };
  });

  if (!anyRun) {
    return (
      <div className="debug-panel p-4">
        <p className="debug-prose text-[12px]">Waiting for first chunk…</p>
      </div>
    );
  }

  return (
    <DebugTimeline
      columns={columns}
      grid={grid}
      headerNote={`seed ${simSeed} · ${botIds.length} bots · one row per event time · purple = idle gap · budget ${fmtTime(budgetMs)}`}
      footer={
        grid.length > 0 ? (
          <p
            className="debug-prose text-[10px] px-3 py-2 border-t shrink-0"
            style={{ borderColor: 'var(--debug-border)' }}
          >
            {aligned.length.toLocaleString()} event times · purple = idle gap (≥15m)
          </p>
        ) : undefined
      }
    />
  );
}
