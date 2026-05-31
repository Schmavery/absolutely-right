import { afterEach, describe, expect, it } from 'vitest';
import { LAUNCH_LOC } from '../src/game/constants';
import { Sim } from '../src/sim/Sim';
import { DEBUG_BOTS, type DebugBotId } from '../src/sim/bots';
import { fmtTime } from '../src/debug/traceAnalyze';

afterEach(() => Sim.teardown());

/** Same default as TraceDebug. */
const BUDGET_MS = 10 * 3_600_000;

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

function launchTimeMs(seed: number, botId: DebugBotId): number | null {
  const sim = new Sim({ seed });
  sim.runEventDriven(DEBUG_BOTS[botId]!.make(seed), BUDGET_MS);
  if (!sim.state.launched) return null;
  const trace = sim.trace;
  for (const e of trace) {
    if (e.move?.id === 'launch') return e.t;
  }
  return sim.t;
}

describe('launch time (trace budget)', () => {
  it('seed 42 launch times match trace-scale virtual clock', () => {
    const seed = 42;
    for (const botId of BOTS) {
      const t = launchTimeMs(seed, botId);
      console.log(
        `${botId.padEnd(16)} ${t == null ? 'no launch in 10h' : fmtTime(t) + ` (${(t / 3_600_000).toFixed(2)}h)`}  totalLoc@end would need check`,
      );
    }
    const hygiene = launchTimeMs(seed, 'hygiene');
    expect(hygiene).not.toBeNull();
    expect(hygiene!).toBeLessThan(BUDGET_MS);
    expect(hygiene!).toBeLessThan(30 * 60_000);
  });

  it('median launch over seeds (10h budget)', () => {
    const seeds = [1, 7, 42, 99, 4242];
    const rows: { bot: DebugBotId; medianMs: number; times: string[] }[] = [];

    for (const botId of BOTS) {
      const ms: number[] = [];
      for (const seed of seeds) {
        const t = launchTimeMs(seed, botId);
        if (t != null) ms.push(t);
        Sim.teardown();
      }
      const sorted = [...ms].sort((a, b) => a - b);
      const medianMs = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : Infinity;
      rows.push({
        bot: botId,
        medianMs,
        times: ms.map((t) => fmtTime(t)),
      });
    }
    rows.sort((a, b) => a.medianMs - b.medianMs);
    console.log(`\nMedian launch @ ${LAUNCH_LOC} LOC (10h budget), seeds ${seeds.join(', ')}:`);
    for (const r of rows) {
      console.log(
        `  ${r.bot.padEnd(16)} ${r.medianMs === Infinity ? '—' : fmtTime(r.medianMs)}  [${r.times.join(', ')}]`,
      );
    }
    console.log('\nFastest 3:', rows.filter((r) => r.medianMs < Infinity).slice(0, 3).map((r) => r.bot).join(', '));

    expect(rows[0]!.medianMs).toBeLessThan(BUDGET_MS);
  });
});
