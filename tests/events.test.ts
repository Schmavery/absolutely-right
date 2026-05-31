import { describe, expect, it, afterEach } from 'vitest';
import { NEWS } from '../src/game/data';
import { maybeFireEvent, weightedPick } from '../src/game/events';
import { appendLog } from '../src/game/log';
import { defaultState } from '../src/game/state';
import { setClock, setRandom, resetClock, resetRandom } from '../src/game/runtime';

describe('weightedPick', () => {
  const pool = [
    { minLoc: 100, label: 'early' },
    { minLoc: 10_000, label: 'late' },
  ] as const;

  it('favors higher minLoc when roll is high', () => {
    expect(weightedPick(pool, 0.99).label).toBe('late');
    expect(weightedPick(pool, 0.001).label).toBe('early');
  });
});

describe('maybeFireEvent news', () => {
  afterEach(() => {
    resetClock();
    resetRandom();
  });

  it('records headline id and does not fire the same headline twice', () => {
    const headline = NEWS[0]!;
    let r = 0;
    setRandom(() => {
      // cooldown pass, fire pass, pick news, weighted pick first item
      const seq = [0, 0, 0, 0];
      return seq[r++ % seq.length] ?? 0;
    });
    let t = 0;
    setClock(() => t);

    const base = {
      ...defaultState(),
      totalLoc: headline.minLoc,
      lastEventTime: -60_000,
      usedNewsIds: [],
    };

    const once = maybeFireEvent(base, 1, appendLog);
    expect(once.usedNewsIds).toContain(headline.id);
    expect(once.log.some((e) => e.type === 'news')).toBe(true);

    t += 60_000;
    const twice = maybeFireEvent(once, 1, appendLog);
    expect(twice.usedNewsIds.filter((id) => id === headline.id)).toHaveLength(1);
  });
});
