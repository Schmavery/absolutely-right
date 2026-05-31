import { useCallback, useState } from 'react';
import {
  PLAN_GOALS,
  formatPlanStep,
  type PlanClosestSnapshot,
  type PlanClosestStream,
  type PlanGoal,
  type PlanSearchOutcome,
  type PlanStep,
} from '../debug/planReach';
import { usePlanSearch } from '../debug/usePlanSearch';
import { fmtLoc, fmtTime, virtualHoursToMs } from '../debug/traceAnalyze';
import { UI } from '../game/data';
import { debugHref } from '../debug/routes';
import { DebugSection, DebugShell } from './DebugShell';

const DEFAULT_MAX_STATES = 8000;
const DEFAULT_MAX_HOURS = 10;
const DEFAULT_PROMPT_COST_MULT = 2;
const DEFAULT_PROMPT_PENALTY_MS = 0;

function failureMessage(outcome: PlanSearchOutcome): string {
  if (outcome.failureReason === 'state_budget') {
    return `Search stopped after ${outcome.statesVisited.toLocaleString()} states (limit ${outcome.maxStates.toLocaleString()}). Raise max states or try a nearer goal.`;
  }
  if (outcome.failureReason === 'exhausted') {
    return `No path reached the goal within ${fmtTime(outcome.maxTimeMs)} and ${outcome.maxStates.toLocaleString()} states. Try Deep search, a nearer goal, or check whether the milestone needs actions beyond prompt/buy/launch.`;
  }
  if (outcome.failureReason === 'time_budget') {
    return `Explored ${outcome.statesVisited.toLocaleString()} states but no completing path finished before the time horizon (${fmtTime(outcome.maxTimeMs)}). Increase max hours or pick a nearer goal.`;
  }
  return 'No path found.';
}

function ClosestFrontierPanel({
  closest,
  steps,
  live,
}: {
  closest: PlanClosestSnapshot | PlanClosestStream;
  steps?: PlanStep[];
  live?: boolean;
}) {
  const stepCount = steps?.length ?? ('stepCount' in closest ? closest.stepCount : 0);
  return (
    <div className="mt-4 pt-4 border-t border-[var(--debug-border)]">
      <p className="text-[12px] mb-2 text-log-news">
        {live ? 'Searching — closest so far' : 'Closest frontier'} (
        {Math.round(closest.progress.progress * 100)}% toward goal)
      </p>
      <p className="debug-prose text-[11px] mb-3">{closest.progress.label}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px] mb-3">
        <dt className="text-dim">at time</dt>
        <dd className="text-blue tabular-nums">{fmtTime(closest.totalMs)}</dd>
        <dt className="text-dim">wallet LOC</dt>
        <dd className="tabular-nums">{fmtLoc(closest.loc)}</dd>
        <dt className="text-dim">total LOC</dt>
        <dd className="tabular-nums">{fmtLoc(closest.totalLoc)}</dd>
        <dt className="text-dim">tokens</dt>
        <dd className="tabular-nums">{Math.floor(closest.tokens)}</dd>
        <dt className="text-dim">phase</dt>
        <dd>
          {closest.phase} · {UI.phases[closest.phase] ?? '—'}
        </dd>
        <dt className="text-dim">launched</dt>
        <dd>{closest.launched ? 'yes' : 'no'}</dd>
        <dt className="text-dim">upgrades</dt>
        <dd className="break-all">
          {closest.upgrades.length > 0 ? closest.upgrades.join(', ') : '—'}
        </dd>
        <dt className="text-dim">generators</dt>
        <dd className="break-all">
          {Object.keys(closest.genCounts).length > 0
            ? Object.entries(closest.genCounts)
                .map(([k, n]) => `${k}×${n}`)
                .join(', ')
            : '—'}
        </dd>
        {live && stepCount > 0 && (
          <>
            <dt className="text-dim">witness steps</dt>
            <dd className="tabular-nums">{stepCount.toLocaleString()} (full list when done)</dd>
          </>
        )}
      </dl>
      {steps && steps.length > 0 && (
        <>
          <p className="text-dim text-[10px] mb-1">
            Witness to closest ({steps.length} steps)
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-[11px] max-h-[240px] overflow-y-auto">
            {steps.map((step, i) => (
              <li key={i} className="text-dim">
                <span className="text-blue">{formatPlanStep(step)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export function PlannerDebug() {
  const [goalId, setGoalId] = useState(PLAN_GOALS[0]!.id);
  const [seed, setSeed] = useState(42);
  const [maxStates, setMaxStates] = useState(DEFAULT_MAX_STATES);
  const [maxHours, setMaxHours] = useState(DEFAULT_MAX_HOURS);
  const [promptCostMult, setPromptCostMult] = useState(DEFAULT_PROMPT_COST_MULT);
  const [promptPenaltyMs, setPromptPenaltyMs] = useState(DEFAULT_PROMPT_PENALTY_MS);

  const { state: search, run, cancel } = usePlanSearch();

  const goalDef = PLAN_GOALS.find((g) => g.id === goalId) ?? PLAN_GOALS[0]!;
  const goal: PlanGoal = goalDef.goal;

  const startSearch = useCallback(() => {
    run(goal, {
      seed,
      maxStates,
      maxTimeMs: virtualHoursToMs(maxHours),
      promptCostMult,
      promptPenaltyMs,
    });
  }, [goal, seed, maxStates, maxHours, promptCostMult, promptPenaltyMs, run]);

  const outcome = search.outcome;
  const result = outcome?.result ?? null;
  const searching = search.status === 'searching';

  return (
    <DebugShell active="planner">
      <DebugSection title="Goal planner (best effort)">
        <p className="debug-prose text-[12px] mb-4 max-w-[640px]">
          Greedy A* in a worker — not guaranteed optimal. Pruned moves and shop branches keep the
          graph small; if the state budget runs out, you still get a witness to the closest frontier.
          Tune prompt friction; progress streams while searching. Click Recompute — nothing runs on
          page load. Compare with{' '}
          <a href={debugHref('trace')} className="text-blue underline">
            bot trace
          </a>
          .
        </p>
        <div className="debug-panel p-4 grid gap-3 sm:grid-cols-2 text-[12px]">
          <label className="flex flex-col gap-1">
            <span className="text-dim">Goal</span>
            <select
              className="debug-input rounded px-2 py-1.5 bg-[var(--debug-surface-2)] border border-[var(--debug-border)]"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              {PLAN_GOALS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-dim">Planner RNG seed</span>
            <input
              type="number"
              className="debug-input rounded px-2 py-1.5 tabular-nums bg-[var(--debug-surface-2)] border border-[var(--debug-border)]"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value, 10) || 42)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-dim">Max states explored</span>
            <input
              type="number"
              min={500}
              max={100_000}
              step={500}
              className="debug-input rounded px-2 py-1.5 tabular-nums bg-[var(--debug-surface-2)] border border-[var(--debug-border)]"
              value={maxStates}
              onChange={(e) => setMaxStates(parseInt(e.target.value, 10) || DEFAULT_MAX_STATES)}
            />
            <span className="text-[10px] text-dim">Search cap; raise if plans stop early.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-dim">Max sim hours</span>
            <input
              type="number"
              min={0.5}
              max={48}
              step={0.5}
              className="debug-input rounded px-2 py-1.5 tabular-nums bg-[var(--debug-surface-2)] border border-[var(--debug-border)]"
              value={maxHours}
              onChange={(e) => setMaxHours(parseFloat(e.target.value) || DEFAULT_MAX_HOURS)}
            />
            <span className="text-[10px] text-dim">Paths longer than this horizon are discarded.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-dim">Prompt cost ×</span>
            <input
              type="number"
              min={1}
              max={20}
              step={0.5}
              className="debug-input rounded px-2 py-1.5 tabular-nums bg-[var(--debug-surface-2)] border border-[var(--debug-border)]"
              value={promptCostMult}
              onChange={(e) => setPromptCostMult(parseFloat(e.target.value) || 1)}
            />
            <span className="text-[10px] text-dim">
              Multiplier on each prompt step duration (1 = raw model time).
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-dim">Prompt penalty (ms)</span>
            <input
              type="number"
              min={0}
              max={600_000}
              step={1000}
              className="debug-input rounded px-2 py-1.5 tabular-nums bg-[var(--debug-surface-2)] border border-[var(--debug-border)]"
              value={promptPenaltyMs}
              onChange={(e) => setPromptPenaltyMs(parseInt(e.target.value, 10) || 0)}
            />
            <span className="text-[10px] text-dim">
              Flat extra time per prompt (approval fatigue, misclicks).
            </span>
          </label>
          <div className="sm:col-span-2 flex flex-wrap gap-2 items-center">
            <button
              type="button"
              className="debug-nav-active px-4 py-1.5 rounded border"
              onClick={startSearch}
              disabled={searching}
            >
              {searching ? 'Searching…' : 'Recompute'}
            </button>
            {searching && (
              <button
                type="button"
                className="debug-nav-idle px-3 py-1.5 rounded border text-[11px]"
                onClick={cancel}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              className="debug-nav-idle px-3 py-1.5 rounded border text-[11px]"
              disabled={searching}
              onClick={() => {
                setMaxStates(20_000);
                setMaxHours(24);
                run(goal, {
                  seed,
                  maxStates: 20_000,
                  maxTimeMs: virtualHoursToMs(24),
                  promptCostMult,
                  promptPenaltyMs,
                });
              }}
            >
              Deep search (20k states, 24h)
            </button>
          </div>
        </div>
      </DebugSection>

      <DebugSection title="Witness path">
        {search.status === 'idle' && (
          <p className="debug-prose text-[12px]">Set options and click Recompute to run the planner.</p>
        )}

        {search.status === 'error' && (
          <p className="debug-error text-[12px]">Planner failed: {search.error}</p>
        )}

        {searching && (
          <div className="debug-panel p-4">
            <p className="text-purple text-[12px] mb-2 animate-pulse">
              Searching… {search.statesVisited.toLocaleString()} /{' '}
              {search.maxStates.toLocaleString()} states
            </p>
            {search.streamingClosest && (
              <ClosestFrontierPanel closest={search.streamingClosest} live />
            )}
          </div>
        )}

        {search.status === 'ready' && outcome && !result && (
          <div className="debug-panel p-4">
            <p className="text-log-bad text-[12px] mb-2">{failureMessage(outcome)}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
              <dt className="text-dim">states visited</dt>
              <dd className="tabular-nums">
                {outcome.statesVisited.toLocaleString()} / {outcome.maxStates.toLocaleString()}
              </dd>
              <dt className="text-dim">time horizon</dt>
              <dd className="tabular-nums">{fmtTime(outcome.maxTimeMs)}</dd>
            </dl>
            {outcome.closest && (
              <ClosestFrontierPanel closest={outcome.closest} steps={outcome.closest.steps} />
            )}
          </div>
        )}

        {search.status === 'ready' && outcome && result && (
          <div className="debug-panel p-4">
            {result.bestEffort && (
              <p className="text-log-news text-[12px] mb-3">
                Best effort — search stopped before the goal (
                {Math.round((result.progress ?? 0) * 100)}%: {result.progressLabel ?? '—'}). Witness
                is the deepest frontier found, not a proven shortest path.
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px] mb-4">
              <dt className="text-dim">total time</dt>
              <dd className="text-blue tabular-nums font-medium">{fmtTime(result.totalMs)}</dd>
              <dt className="text-dim">steps</dt>
              <dd className="debug-value">{result.steps.length}</dd>
              <dt className="text-dim">states visited</dt>
              <dd className="debug-value">
                {result.statesVisited.toLocaleString()} / {outcome.maxStates.toLocaleString()}
                {result.truncated && !result.bestEffort && (
                  <span className="text-log-bad"> · truncated</span>
                )}
              </dd>
              <dt className="text-dim">limits</dt>
              <dd className="text-dim tabular-nums">{fmtTime(outcome.maxTimeMs)} horizon</dd>
              <dt className="text-dim">prompt friction</dt>
              <dd className="text-dim tabular-nums">
                ×{outcome.promptCostMult}
                {outcome.promptPenaltyMs > 0
                  ? ` + ${fmtTime(outcome.promptPenaltyMs)}/prompt`
                  : ''}
              </dd>
            </dl>
            {result.steps.length === 0 ? (
              <p className="debug-prose text-[12px]">Already satisfied at t=0.</p>
            ) : (
              <ol className="list-decimal pl-5 space-y-1 text-[11px]">
                {result.steps.map((step, i) => (
                  <li key={i} className="text-dim">
                    <span className="text-blue">{formatPlanStep(step)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </DebugSection>

      <p className="debug-prose text-[11px] max-w-[640px]">
        Prompt friction is planner-only (does not change the game). Set ×1 for a physics lower bound;
        raise it to match how much you hate clicking prompt in real play.
      </p>
    </DebugShell>
  );
}
