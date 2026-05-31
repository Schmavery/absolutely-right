import { useMemo, useState } from 'react';
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
        <span className="text-[10px] uppercase tracking-wider text-yellow font-semibold">
          Phase {row.phaseIndex}
        </span>
        <p className="text-[11px] text-yellow leading-snug font-medium mt-0.5">{row.phaseLabel}</p>
        <p className="text-[10px] text-dim mt-0.5 leading-snug line-clamp-2">{row.rule}</p>
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

function GridTimelineBody({
  botIds,
  grid,
}: {
  botIds: DebugBotId[];
  grid: TimelineGridRow[];
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (grid.length === 0) {
    return <p className="debug-prose text-[12px] p-4">No events yet.</p>;
  }

  return (
    <div
      className="grid text-[11px] min-w-full"
      style={{
        gridTemplateColumns: `88px repeat(${botIds.length}, minmax(200px, 1fr))`,
        gridTemplateRows: `repeat(${grid.length}, auto)`,
      }}
    >
      {grid.map((slot, rowIdx) => {
        const surface = rowSurfaceClass(rowIdx);
        const gridRow = rowIdx + 1;

        if (slot.kind === 'gap') {
          return (
            <div key={`gap-${slot.beforeT}`} className="contents">
              <div
                className={`sticky left-0 z-[1] border-r border-b flex flex-col items-end justify-center px-2 py-2 min-h-[28px] ${surface}`}
                style={{ gridColumn: 1, gridRow, borderColor: 'var(--debug-border)' }}
              >
                <span className="text-[10px] text-purple font-semibold tabular-nums">
                  +{fmtTime(slot.gapMs)}
                </span>
                <span className="text-[9px] text-dim">idle</span>
              </div>
              {botIds.map((botId, colIdx) => (
                <div
                  key={`gap-${slot.beforeT}-${botId}`}
                  className={`border-b border-r ${surface}`}
                  style={{
                    gridColumn: colIdx + 2,
                    gridRow,
                    borderColor: 'var(--debug-border)',
                    background: 'color-mix(in srgb, var(--purple) 6%, var(--debug-surface))',
                  }}
                  aria-hidden
                />
              ))}
            </div>
          );
        }

        return (
          <div key={`t-${slot.t}`} className="contents">
            <div
              className={`sticky left-0 z-[1] border-r border-b ${surface}`}
              style={{ gridColumn: 1, gridRow, borderColor: 'var(--debug-border)' }}
            >
              <TimeCell slot={slot} />
            </div>
            {slot.cells.map((cell, colIdx) => (
              <div
                key={`${slot.t}-${botIds[colIdx]}`}
                className={`border-b border-r flex items-center justify-center min-h-[36px] px-1 ${surface} ${
                  cell == null ? 'bg-[color:var(--debug-surface-2)]/20' : ''
                }`}
                style={{
                  gridColumn: colIdx + 2,
                  gridRow,
                  borderColor: 'var(--debug-border)',
                }}
              >
                <CellStack cell={cell} expandedKey={expandedKey} setExpandedKey={setExpandedKey} />
              </div>
            ))}
          </div>
        );
      })}
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

  const eventCount = useMemo(
    () => aligned.reduce((n, r) => n + r.cells.filter((c) => c != null).length, 0),
    [aligned],
  );

  const gapSpacerCount = useMemo(() => grid.filter((r) => r.kind === 'gap').length, [grid]);

  const anyRun = botIds.some((id) => runsByBot.has(id));

  return (
    <div className="debug-panel overflow-hidden flex flex-col">
      <div className="debug-legend px-3 pt-3 shrink-0">
        <span className="leg-phase">
          <i /> phase
        </span>
        <span className="leg-upgrade">
          <i /> upgrade
        </span>
        <span className="leg-launch">
          <i /> launch
        </span>
        <span className="leg-move">
          <i /> action
        </span>
        <span className="leg-basic">
          <i /> basic
        </span>
        <span className="leg-tests">
          <i /> tests
        </span>
        <span className="leg-gen">
          <i /> generator
        </span>
      </div>
      <div
        className="flex justify-between text-[11px] text-dim px-3 py-2 border-t border-b shrink-0"
        style={{ borderColor: 'var(--debug-border)' }}
      >
        <span>
          seed {simSeed} · {botIds.length} bots · one row per event time · purple = idle gap
        </span>
        <span>budget {fmtTime(budgetMs)}</span>
      </div>

      <div
        className="grid shrink-0 border-b text-[11px] font-semibold"
        style={{
          gridTemplateColumns: `88px repeat(${botIds.length}, minmax(200px, 1fr))`,
          borderColor: 'var(--debug-border)',
          background: 'var(--debug-surface-2)',
        }}
      >
        <div className="px-2 py-2 text-dim border-r" style={{ borderColor: 'var(--debug-border)' }}>
          time / gap
        </div>
        {botIds.map((botId, colIdx) => {
          const run = runsByBot.get(botId);
          const streamStatus = columnStreamStatus(botId, run, simStatus, botProgress);
          const label = DEBUG_BOTS[botId]?.label ?? botId;
          const patienceHint =
            botId === 'progress'
              ? 'State-based: launch/buys when affordable; token/bug fixes by pressure.'
              : botId === 'loc'
                ? 'State-based: favors LOC and purchases over hygiene.'
                : botId === 'hygiene'
                  ? 'State-based: favors tests and bug tools when bugs are high.'
                  : undefined;
          return (
            <div
              key={botId}
              className="px-2 py-2 border-r last:border-r-0"
              style={{ borderColor: 'var(--debug-border)' }}
            >
              <span
                className={`inline-block px-1.5 py-0.5 rounded border ${botPillClass(colIdx)}`}
                title={patienceHint}
              >
                {label}
              </span>
              {run && (
                <span className="text-dim font-normal ml-1 tabular-nums">
                  {run.moves.length.toLocaleString()} moves
                </span>
              )}
              {streamStatus && (
                <p
                  className={`text-[10px] font-normal mt-1 leading-snug tabular-nums ${
                    streamStatus.startsWith('Complete')
                      ? 'text-green'
                      : streamStatus === 'Queued…'
                        ? 'text-dim'
                        : 'text-purple animate-pulse'
                  }`}
                  aria-live="polite"
                >
                  {streamStatus}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="overflow-y-auto max-h-[min(72vh,760px)] overflow-x-auto">
        {!anyRun ? (
          <p className="debug-prose text-[12px] p-4">Waiting for first chunk…</p>
        ) : (
          <GridTimelineBody botIds={botIds} grid={grid} />
        )}
      </div>
      {anyRun && grid.length > 0 && (
        <p
          className="debug-prose text-[10px] px-3 py-2 border-t shrink-0"
          style={{ borderColor: 'var(--debug-border)' }}
        >
          {aligned.length.toLocaleString()} event times · {eventCount.toLocaleString()} cells
          {gapSpacerCount > 0 &&
            ` · ${gapSpacerCount} gap row${gapSpacerCount === 1 ? '' : 's'} (≥15m idle)`}
        </p>
      )}
    </div>
  );
}
