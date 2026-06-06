import { afterEach, describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/Sim';
import { strategyBot } from '../src/sim/bots';

afterEach(() => Sim.teardown());

/** Long sim — enable with `RUN_BOT_STRATEGIES=1 npm test`. */
describe.skipIf(!process.env.RUN_BOT_STRATEGIES)('LOC strategy', () => {
  it('buys upgrades when affordable (not only gens/prompt)', () => {
    const budget = 4 * 3_600_000;
    const loc = new Sim({ seed: 42 });
    loc.runEventDriven(strategyBot('loc'), budget);
    const progress = new Sim({ seed: 42 });
    progress.runEventDriven(strategyBot('progress'), budget);
    expect(loc.state.upgrades.length).toBeGreaterThan(0);
    expect(progress.state.upgrades.length).toBeGreaterThan(0);
  });
});
