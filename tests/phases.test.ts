import { describe, expect, it } from 'vitest';
import { getPhase } from '../src/game/phases';
import { defaultState } from '../src/game/state';

describe('getPhase', () => {
  it('early before launch', () => {
    expect(getPhase(defaultState())).toBe(0);
  });

  it('early mid after launch only', () => {
    expect(getPhase({ ...defaultState(), launched: true })).toBe(1);
  });

  it('mid after launch with multi_agent', () => {
    expect(
      getPhase({ ...defaultState(), launched: true, upgrades: ['multi_agent'] }),
    ).toBe(2);
  });

  it('mid after launch with paid plan', () => {
    expect(
      getPhase({ ...defaultState(), launched: true, upgrades: ['pro_plan'] }),
    ).toBe(2);
  });

  it('min-late with code review', () => {
    expect(
      getPhase({
        ...defaultState(),
        launched: true,
        upgrades: ['multi_agent', 'code_review'],
      }),
    ).toBe(3);
  });

  it('late with status page revamp', () => {
    expect(
      getPhase({
        ...defaultState(),
        launched: true,
        upgrades: ['ai_review', 'revamp_status_page'],
      }),
    ).toBe(4);
  });

  it('nines beats review when both owned', () => {
    expect(
      getPhase({
        ...defaultState(),
        launched: true,
        upgrades: ['code_review', 'ai_review', 'revamp_status_page'],
      }),
    ).toBe(4);
  });
});
