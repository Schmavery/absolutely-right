import { afterEach, describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/Sim';
import { WEIGHTS_HYGIENE, WEIGHTS_LOC, WEIGHTS_PROGRESS } from '../src/game/moveIntent';
import { adaptiveBot, strategyBot, type BotStrategyId } from '../src/sim/bots';

afterEach(() => Sim.teardown());

/** One-off sweep; enable with RUN_PATIENCE_SWEEP=1 */
describe.skipIf(!process.env.RUN_PATIENCE_SWEEP)('patience sweep (manual)', () => {
  it('logs launch times by patience and strategy', () => {
      const SEEDS = [1, 7, 42, 99, 4242];
      const BUDGET = 12 * 3_600_000;
      const PATIENCES = [0, 3000, 5000, 10000, 20000, 60000];
      const strategies: BotStrategyId[] = ['progress', 'loc', 'hygiene'];

      const weightByStrategy = {
        progress: WEIGHTS_PROGRESS,
        loc: WEIGHTS_LOC,
        hygiene: WEIGHTS_HYGIENE,
      } as const;
      for (const strategy of strategies) {
        console.log(`\n=== ${strategy} ===`);
        for (const p of PATIENCES) {
          const bot = adaptiveBot(weightByStrategy[strategy], p);
          const hrs: number[] = [];
          for (const seed of SEEDS) {
            const sim = new Sim({ seed });
            sim.runEventDriven(bot, BUDGET);
            hrs.push(
              sim.state.launched ? sim.t / 3_600_000 : Number.POSITIVE_INFINITY,
            );
            Sim.teardown();
          }
          const ok = hrs.filter((h) => Number.isFinite(h));
          const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
          const min = ok.length ? Math.min(...ok) : NaN;
          console.log(
            `  ${String(p).padStart(5)}ms: launch ${ok.length}/${SEEDS.length} avg ${avg.toFixed(3)}h min ${min.toFixed(3)}h`,
          );
        }
      }
      expect(true).toBe(true);
  });
});

/** 12h virtual sim — `RUN_BOT_LAUNCH_SMOKE=1 vitest run tests/patienceSweep.test.ts` */
describe.skipIf(!process.env.RUN_BOT_LAUNCH_SMOKE)('strategy launch (smoke)', () => {
  it('progress reaches launch on seed 42', () => {
    const sim = new Sim({ seed: 42 });
    sim.runEventDriven(strategyBot('progress'), 12 * 3_600_000);
    expect(sim.state.launched).toBe(true);
  });
});
