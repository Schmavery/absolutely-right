import { useMemo, useState } from 'react';
import { TraceBotColumns } from './TraceBotColumns';
import { UpgradeHeatmap } from './UpgradeHeatmap';
import { fmtTime, virtualHoursToMs } from '../debug/traceAnalyze';
import { MS_PER_VIRTUAL_HOUR } from '../debug/traceTypes';
import { useTraceSim } from '../debug/useTraceSim';
import type { TraceRunConfig } from '../debug/traceTypes';
import { DEBUG_BOTS, DEFAULT_TRACE_BOTS, type DebugBotId } from '../sim/bots';
import { DebugSection, DebugShell } from './DebugShell';

const DEFAULT_SEED = 42;
const DEFAULT_BOTS = DEFAULT_TRACE_BOTS;
const DEFAULT_HOURS = 10;
const DEFAULT_FIRST_CHUNK_MIN = 10;
const DEFAULT_CHUNK_HOURS = 1;

const ALL_BOT_IDS = Object.keys(DEBUG_BOTS) as DebugBotId[];

function parseBots(raw: string): DebugBotId[] {
  const ids = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s): s is DebugBotId => ALL_BOT_IDS.includes(s as DebugBotId));
  return ids.length > 0 ? [...new Set(ids)] : DEFAULT_BOTS;
}

function buildRunConfig(
  seed: number,
  botIds: DebugBotId[],
  budgetHours: number,
  firstChunkMin: number,
  chunkHours: number,
): TraceRunConfig {
  const budgetMs = virtualHoursToMs(budgetHours);
  const firstChunkMs = firstChunkMin * 60_000;
  const chunkMs = chunkHours * MS_PER_VIRTUAL_HOUR;
  return {
    runKey: `seed${seed}|${botIds.join(',')}|${budgetMs}|${firstChunkMs}|${chunkMs}`,
    seed,
    botIds,
    budgetMs,
    firstChunkMs,
    chunkMs,
  };
}

function TraceLoading({
  message,
  budgetHours,
  firstChunkMin,
  chunkHours,
  fromCache,
}: {
  message: string;
  budgetHours: number;
  firstChunkMin: number;
  chunkHours: number;
  fromCache?: boolean;
}) {
  return (
    <div className="debug-panel p-10 text-center" role="status" aria-live="polite">
      <p className="text-blue text-[15px] tracking-wide animate-pulse">
        {fromCache ? 'Loaded from cache' : 'Running parallel sims…'}
      </p>
      <p className="debug-prose mt-3 text-[13px]">{message}</p>
      <p className="debug-prose mt-4 text-[11px] max-w-md mx-auto leading-relaxed">
        One column per bot (same sim seed). Workers post after the first {firstChunkMin}m, then every{' '}
        {chunkHours}h until the full {budgetHours}h budget.
      </p>
    </div>
  );
}

export function TraceDebug() {
  const [simSeed, setSimSeed] = useState(DEFAULT_SEED);
  const [botsText, setBotsText] = useState(DEFAULT_BOTS.join(','));
  const [budgetHours, setBudgetHours] = useState(DEFAULT_HOURS);
  const [firstChunkMin, setFirstChunkMin] = useState(DEFAULT_FIRST_CHUNK_MIN);
  const [chunkHours, setChunkHours] = useState(DEFAULT_CHUNK_HOURS);

  const botIds = useMemo(() => parseBots(botsText), [botsText]);
  const botsValid = botIds.length > 0;

  const [applied, setApplied] = useState<TraceRunConfig>(() =>
    buildRunConfig(DEFAULT_SEED, DEFAULT_BOTS, DEFAULT_HOURS, DEFAULT_FIRST_CHUNK_MIN, DEFAULT_CHUNK_HOURS),
  );

  const sim = useTraceSim(applied);
  const budgetMs = applied.budgetMs;

  const runsByBot = useMemo(() => {
    const m = new Map<DebugBotId, (typeof sim.runs)[0]>();
    for (const r of sim.runs) m.set(r.botId, r);
    return m;
  }, [sim.runs]);

  const totalMoves = sim.runs.reduce((n, r) => n + r.moves.length, 0);
  const hasBotProgress = Object.keys(sim.botProgress).length > 0;
  const showColumns =
    applied.botIds.length > 0 &&
    (sim.runs.length > 0 || sim.status === 'streaming' || (sim.status === 'loading' && hasBotProgress));
  const showHeatmap = !!sim.heatmap;
  const loading =
    (sim.status === 'loading' || (sim.status === 'streaming' && sim.runs.length === 0)) &&
    !showColumns;

  function runSims() {
    if (!botsValid) return;
    setApplied(buildRunConfig(simSeed, botIds, budgetHours, firstChunkMin, chunkHours));
  }

  const formDirty =
    applied.seed !== simSeed ||
    applied.botIds.join(',') !== botIds.join(',') ||
    virtualHoursToMs(budgetHours) !== applied.budgetMs ||
    applied.firstChunkMs !== firstChunkMin * 60_000 ||
    applied.chunkMs !== chunkHours * MS_PER_VIRTUAL_HOUR;

  return (
    <DebugShell active="trace">
      <DebugSection title="Sim controls" className="mb-6">
        <div className="debug-panel p-4">
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[12px]"
            onSubmit={(e) => {
              e.preventDefault();
              runSims();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-dim">Sim seed (RNG)</span>
              <input
                type="number"
                className="debug-input rounded px-2 py-1.5 bg-[var(--debug-surface-2)] border border-[var(--debug-border)] tabular-nums"
                value={simSeed}
                onChange={(e) => setSimSeed(parseInt(e.target.value, 10) || DEFAULT_SEED)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-dim">Budget (hours)</span>
              <input
                type="number"
                min={0.5}
                max={48}
                step={0.5}
                className="debug-input rounded px-2 py-1.5 bg-[var(--debug-surface-2)] border border-[var(--debug-border)] tabular-nums"
                value={budgetHours}
                onChange={(e) => setBudgetHours(parseFloat(e.target.value) || DEFAULT_HOURS)}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-dim">Bots (comma-separated)</span>
              <input
                type="text"
                className="debug-input rounded px-2 py-1.5 bg-[var(--debug-surface-2)] border border-[var(--debug-border)]"
                value={botsText}
                onChange={(e) => setBotsText(e.target.value)}
                placeholder="progress_30s,loc_rank,greedy_rank or progress,hygiene_rank,…"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-dim">First chunk (min)</span>
              <input
                type="number"
                min={1}
                max={120}
                step={1}
                className="debug-input rounded px-2 py-1.5 bg-[var(--debug-surface-2)] border border-[var(--debug-border)] tabular-nums"
                value={firstChunkMin}
                onChange={(e) => setFirstChunkMin(parseFloat(e.target.value) || DEFAULT_FIRST_CHUNK_MIN)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-dim">Chunk interval (hours)</span>
              <input
                type="number"
                min={0.25}
                max={4}
                step={0.25}
                className="debug-input rounded px-2 py-1.5 bg-[var(--debug-surface-2)] border border-[var(--debug-border)] tabular-nums"
                value={chunkHours}
                onChange={(e) => setChunkHours(parseFloat(e.target.value) || DEFAULT_CHUNK_HOURS)}
              />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={!botsValid}
                className="debug-nav-active px-4 py-1.5 rounded border disabled:opacity-40"
              >
                {formDirty ? 'Run with new params' : 'Re-run'}
              </button>
            </div>
          </form>
          {sim.runs.length > 0 && sim.status !== 'loading' && (
            <dl
              className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mt-4 pt-3 border-t text-[12px]"
              style={{ borderColor: 'var(--debug-border)' }}
            >
              <dt className="text-dim">seed</dt>
              <dd className="text-blue tabular-nums">{applied.seed}</dd>
              <dt className="text-dim">bots</dt>
              <dd className="debug-value">
                {applied.botIds.map((id) => DEBUG_BOTS[id]?.label ?? id).join(', ')}
              </dd>
              <dt className="text-dim">budget</dt>
              <dd className="debug-value">
                {budgetMs / MS_PER_VIRTUAL_HOUR}h ({fmtTime(budgetMs)})
                {sim.fromCache && <span className="text-purple"> · cached</span>}
              </dd>
              <dt className="text-dim">stream</dt>
              <dd className="debug-value">
                first {fmtTime(applied.firstChunkMs)}, then every {fmtTime(applied.chunkMs)} ·{' '}
                {sim.runs.length}/{applied.botIds.length} bots · {totalMoves.toLocaleString()} moves
              </dd>
            </dl>
          )}
        </div>
      </DebugSection>

      {loading && (
        <TraceLoading
          message={sim.progress}
          budgetHours={budgetMs / MS_PER_VIRTUAL_HOUR}
          firstChunkMin={applied.firstChunkMs / 60_000}
          chunkHours={applied.chunkMs / MS_PER_VIRTUAL_HOUR}
          fromCache={sim.fromCache}
        />
      )}

      {sim.status === 'error' && <p className="debug-error">Sim failed: {sim.error}</p>}

      {showColumns && (
        <DebugSection title="Timelines">
          <p className="debug-prose text-[12px] mb-3">
            One column per bot (same seed). Rows align by event time; purple spacers mark long idle
            gaps. Repeated actions collapse to ×N; consecutive basic and test actions merge into
            one row labeled e.g. basic 40 · tests 5 with per-action detail underneath. Each column is an
            progress@30s (adaptive), LOC rank, and greedy rank by default — edit bots to compare others.
          </p>
          <TraceBotColumns
            botIds={applied.botIds}
            runsByBot={runsByBot}
            budgetMs={budgetMs}
            simSeed={applied.seed}
            simStatus={sim.status}
            botProgress={sim.botProgress}
          />
        </DebugSection>
      )}

      <DebugSection title="Upgrade purchase heatmap">
        {!showHeatmap && sim.status !== 'error' && (
          <p className="debug-prose text-[12px] debug-panel p-4">Waiting for sims…</p>
        )}
        {showHeatmap && sim.heatmap && (
          <UpgradeHeatmap heatmap={sim.heatmap} budgetMs={budgetMs} botIds={applied.botIds} />
        )}
      </DebugSection>
    </DebugShell>
  );
}
