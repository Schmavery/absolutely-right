import { afterEach, describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/Sim';
import { strategyBot } from '../src/sim/bots';

afterEach(() => Sim.teardown());

describe('LOC strategy', () => {
  it(
    'buys upgrades when affordable (not only gens/prompt)',
    () => {
      const loc = new Sim({ seed: 42 });
      loc.runEventDriven(strategyBot('loc'), 4 * 3_600_000);
      const progress = new Sim({ seed: 42 });
      progress.runEventDriven(strategyBot('progress'), 4 * 3_600_000);
      expect(loc.state.upgrades.length).toBeGreaterThan(0);
      expect(progress.state.upgrades.length).toBeGreaterThan(0);
    },
    60_000,
  );
});
