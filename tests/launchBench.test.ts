import { afterEach, describe, expect, it } from 'vitest';
import {
  BENCH_PHASE_2,
  LAUNCH_BENCH_BUDGET_MS,
  LAUNCH_BENCH_SEEDS,
  launchTimeMsForBot,
  logMedianTable,
  medianLaunchRow,
  medianPhase2Row,
  phase2TimeMsForBot,
  runPatienceSweep,
  runPhase2PatienceSweep,
} from '../src/debug/launchBenchCore';
import { fmtTime } from '../src/debug/traceAnalyze';
import { Sim } from '../src/sim/Sim';
import { DEBUG_BOTS, type DebugBotId } from '../src/sim/bots';

afterEach(() => Sim.teardown());

const BOTS = [
  'progress',
  'loc',
  'hygiene',
  'progress_rank',
  'loc_rank',
  'hygiene_rank',
  'greedy_rank',
  'instant_rank',
  'patient_rank',
] as DebugBotId[];

describe('launch time (smoke)', () => {
  it('hygiene launches on seed 42 under 30m virtual', () => {
    const t = launchTimeMsForBot(42, DEBUG_BOTS.hygiene!.make(42));
    expect(t).not.toBeNull();
    expect(t!).toBeLessThanOrEqual(LAUNCH_BENCH_BUDGET_MS);
    expect(t!).toBeLessThan(30 * 60_000);
  });

  it(
    `progress reaches flavor phase ${BENCH_PHASE_2} on seed 42 within 10h`,
    () => {
      const t = phase2TimeMsForBot(42, DEBUG_BOTS.progress_30s!.make(42));
      expect(t).not.toBeNull();
      expect(t!).toBeLessThan(LAUNCH_BENCH_BUDGET_MS);
    },
    90_000,
  );
});

const BENCH_IT_MS = 90_000;

/** Full median + patience tables — `npm run bench:launch` */
describe.skipIf(!process.env.RUN_LAUNCH_BENCH)('launch time (bench)', () => {
  it(
    'seed 42 all default bots',
    () => {
    const seed = 42;
    for (const botId of BOTS) {
      const t = launchTimeMsForBot(seed, DEBUG_BOTS[botId]!.make(seed));
      console.log(
        `${botId.padEnd(16)} ${t == null ? 'no launch in 10h' : fmtTime(t) + ` (${(t / 3_600_000).toFixed(2)}h)`}`,
      );
    }
    },
    BENCH_IT_MS,
  );

  it(
    'median launch default bots',
    () => {
    const rows = BOTS.map((botId) =>
      medianLaunchRow(botId, LAUNCH_BENCH_SEEDS, (seed) => DEBUG_BOTS[botId]!.make(seed)),
    );
    logMedianTable(
      `Median launch (10h cap), default bots, seeds ${LAUNCH_BENCH_SEEDS.join(', ')}:`,
      rows,
      3,
    );
    expect(rows[0]!.medianMs).toBeLessThan(LAUNCH_BENCH_BUDGET_MS);
    },
    BENCH_IT_MS,
  );

  it(
    'median launch adaptive × patience + rank bots',
    () => {
    const rows = runPatienceSweep();
    const ranked = [...rows].sort((a, b) => a.medianMs - b.medianMs);
    expect(ranked[0]!.medianMs).toBeLessThan(LAUNCH_BENCH_BUDGET_MS);
    expect(ranked.filter((r) => r.launches === LAUNCH_BENCH_SEEDS.length).length).toBeGreaterThan(0);
    },
    BENCH_IT_MS,
  );
});

/** `npm run bench:phase2` */
describe.skipIf(!process.env.RUN_PHASE2_BENCH)('phase 2 time (bench)', () => {
  it(
    'median phase 2 adaptive × patience + rank bots',
    () => {
      const rows = runPhase2PatienceSweep();
      const ranked = [...rows].sort((a, b) => a.medianMs - b.medianMs);
      expect(ranked.some((r) => r.launches > 0)).toBe(true);
    },
    BENCH_IT_MS * 15,
  );
});
