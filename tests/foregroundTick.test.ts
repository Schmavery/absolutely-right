import { describe, expect, it } from 'vitest';
import { defaultState } from '../src/game/state';
import { advanceTick, catchupDtMs } from '../src/game/foregroundTick';
import { TICK_MS } from '../src/game/constants';

describe('foregroundTick', () => {
  it('catchupDtMs clamps to max and ignores non-positive', () => {
    expect(catchupDtMs(0)).toBe(0);
    expect(catchupDtMs(-100)).toBe(0);
    expect(catchupDtMs(500, 1000)).toBe(500);
    expect(catchupDtMs(5000, 1000)).toBe(1000);
  });

  it('advanceTick applies passive progress proportional to elapsed', () => {
    const prev = {
      ...defaultState(),
      started: true,
      totalLoc: 500,
      loc: 500,
      genCounts: { autocomplete: 1 },
    };
    const next = advanceTick(prev, TICK_MS * 10);
    expect(next.totalLoc).toBeGreaterThan(prev.totalLoc);
    expect(next.loc).toBeGreaterThan(prev.loc);
  });

  it('advanceTick is a no-op for zero elapsed', () => {
    const prev = defaultState();
    expect(advanceTick(prev, 0)).toBe(prev);
  });
});
