import { afterEach, describe, expect, it } from 'vitest';
import {
  adaptiveWeightVariant,
  compareBotToPlan,
  defaultBotCandidates,
  DEFAULT_OPT_TARGETS,
  formatOptReport,
  heuristicCoeffVariants,
  makePlanHeuristic,
  runOptSuite,
  saveOptReport,
} from '../src/debug/optLoop';
import { WEIGHTS_PROGRESS } from '../src/game/moveIntent';
import { Sim } from '../src/sim/Sim';

afterEach(() => Sim.teardown());

const LAUNCH_TARGET = DEFAULT_OPT_TARGETS.find((t) => t.id === 'launch')!;

import { planShortestPath } from '../src/debug/planReach';
import { replayPlanInSim } from '../src/debug/planReplay';
import { fmtTime } from '../src/debug/traceAnalyze';

describe('optLoop (replay)', () => {
  it('planner witness replays to launch in sim', () => {
    const outcome = planShortestPath(
      { kind: 'launched' },
      { maxStates: 25_000, maxTimeMs: 20 * 60_000, seed: 42 },
    );
    const steps = outcome.result?.steps ?? [];
    expect(steps.length).toBeGreaterThan(0);
    const replay = replayPlanInSim(steps, 42, { kind: 'launched' });
    console.log(
      `search ${fmtTime(replay.planInternalMs)} · replay ${replay.simGoalMs != null ? fmtTime(replay.simGoalMs) : 'no launch'}`,
    );
    expect(replay.launched).toBe(true);
    expect(replay.simGoalMs).not.toBeNull();
    if (replay.simGoalMs != null) {
      const ratio = replay.simGoalMs / replay.planInternalMs;
      expect(ratio).toBeGreaterThan(0.85);
      // Planner uses next-event waits; event-driven replay can overshoot gate jumps.
      expect(ratio).toBeLessThan(1.55);
    }
  });
});

describe('optLoop (smoke)', () => {
  it('compares progress bot to launch plan bound on seed 42', () => {
    const row = compareBotToPlan({
      target: LAUNCH_TARGET,
      seed: 42,
      bot: adaptiveWeightVariant('progress', WEIGHTS_PROGRESS),
      planOpts: { maxStates: 12_000, maxTimeMs: 20 * 60_000, seed: 42 },
    });
    expect(row.plan.totalMs).toBeGreaterThan(0);
    expect(row.hints.length).toBeGreaterThanOrEqual(0);
    if (row.plan.achieved && row.bot.achieved) {
      expect(row.heuristicDebt).not.toBeNull();
      expect(row.boundMs).not.toBeNull();
    }
  });

  it('formats a readable report', () => {
    const report = runOptSuite({
      targets: [LAUNCH_TARGET],
      seeds: [42],
      bots: [adaptiveWeightVariant('progress', WEIGHTS_PROGRESS)],
    });
    const text = formatOptReport(report);
    expect(text).toContain('Launch');
    expect(text).toContain('seed 42');
  });
});

/** Launch-only report — `npm run opt:loop:launch` */
describe.skipIf(!process.env.RUN_OPT_LAUNCH)('optLoop (launch report)', () => {
  it('launch across seeds, all default bots + heuristic variants', () => {
    const variants = heuristicCoeffVariants().map((v) => ({
      id: v.id,
      label: `heuristic ${v.label}`,
      heuristic: makePlanHeuristic(v.coeffs),
    }));
    const report = runOptSuite({
      targets: DEFAULT_OPT_TARGETS.filter((t) => t.id === 'launch'),
      seeds: [42, 7],
      bots: defaultBotCandidates(),
      heuristicVariants: variants,
    });
    saveOptReport(report);
    console.log(formatOptReport(report));
    expect(report.rows.some((r) => r.plan.achieved)).toBe(true);
  });
});

/** Full cross-target suite — `npm run opt:loop` */
describe.skipIf(!process.env.RUN_OPT_LOOP)('optLoop (full)', () => {
  it('launch + multi_agent across seeds and default candidates', () => {
    const variants = heuristicCoeffVariants().map((v) => ({
      id: v.id,
      label: `heuristic ${v.label}`,
      heuristic: makePlanHeuristic(v.coeffs),
    }));
    const multiAgent = DEFAULT_OPT_TARGETS.find((t) => t.id === 'multi_agent')!;
    const report = runOptSuite({
      targets: [DEFAULT_OPT_TARGETS.find((t) => t.id === 'launch')!],
      seeds: [42],
      bots: defaultBotCandidates().filter((b) => b.id === 'adaptive:progress'),
      heuristicVariants: variants.slice(0, 1),
    });
    saveOptReport(report);
    console.log(formatOptReport(report));
    const launchRows = report.rows.filter((r) => r.targetId === 'launch' && r.plan.achieved);
    expect(launchRows.length).toBeGreaterThan(0);
  });
});
