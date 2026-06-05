import { describe, expect, it, afterEach } from 'vitest';
import { EVENTS } from '../src/game/data';
import { maybeFireEvent } from '../src/game/events';
import { appendLog } from '../src/game/log';
import { messageKey, pickUnused } from '../src/lib/messageKey';
import { defaultState } from '../src/game/state';
import { promptAction } from '../src/game/actions';
import { scriptedPromptCount } from '../src/game/prompt';
import { setClock, setRandom, resetClock, resetRandom } from '../src/game/runtime';

afterEach(() => {
  resetClock();
  resetRandom();
});

describe('pickUnused', () => {
  const pool = ['> alpha', '> beta', '> gamma'] as const;

  it('does not repeat until the pool is exhausted', () => {
    const used: string[] = [];
    const keys: string[] = [];
    for (let i = 0; i < pool.length; i++) {
      const item = pickUnused(pool, used)!;
      keys.push(messageKey(item));
      used.push(messageKey(item));
    }
    expect(new Set(keys).size).toBe(pool.length);
  });

  it('allows repeats after the pool is exhausted', () => {
    const used = pool.map((p) => messageKey(p));
    const again = pickUnused(pool, used)!;
    expect(pool).toContain(again);
  });
});

describe('maybeFireEvent dialogue dedup', () => {
  it('can repeat after every gated line at this LOC has been seen', () => {
    const ev = EVENTS[0]!;
    let r = 0;
    setRandom(() => {
      const seq = [0, 0, 0];
      return seq[r++ % seq.length] ?? 0;
    });
    let t = 0;
    setClock(() => t);

    const gatedAtLoc = EVENTS.filter((e) => e.minLoc <= ev.minLoc);
    const base = {
      ...defaultState(),
      totalLoc: ev.minLoc,
      lastEventTime: -60_000,
      usedEventIds: gatedAtLoc.map((e) => messageKey(e.text)),
    };

    const repeat = maybeFireEvent(base, 1, appendLog);
    expect(repeat.log.length).toBeGreaterThan(0);
  });
});

describe('early prompt scripted messages', () => {
  it('records each scripted beat so events cannot repeat it early', () => {
    let t = 0;
    setClock(() => t);
    setRandom(() => 0);

    const scripted = scriptedPromptCount();
    let s = defaultState();
    for (let i = 0; i < scripted; i++) {
      t += 3000;
      s = promptAction(s);
    }
    expect(s.totalClicks).toBe(scripted);
    expect(s.usedEventIds.length).toBe(scripted);
  });
});
