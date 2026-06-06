import { describe, expect, it } from 'vitest';
import {
  affordWaitMs,
  boolBlocked,
  legalIgnoringCooldown,
  moveTable,
} from '../src/game/availability';
import { defaultState } from '../src/game/state';
import { setClock, resetClock } from '../src/game/runtime';

describe('planner cooldown as cost', () => {
  it('treats prompt cooldown as non-blocking when afford gates pass', () => {
    setClock(() => 1000);
    const state = {
      ...defaultState(),
      started: true,
      actionCooldowns: { prompt: 500 },
    };
    const prompt = moveTable(state, 1000).byId.prompt!;
    expect(prompt.legal).toBe(false);
    expect(legalIgnoringCooldown(prompt)).toBe(true);
    resetClock();
  });

  it('still bool-blocks when afford is fine but preconditions fail', () => {
    setClock(() => 0);
    const state = {
      ...defaultState(),
      started: true,
      bugs: 0,
      lifetimeBugs: 0,
      tokens: 100,
    };
    const paste = moveTable(state, 0).byId.paste_error!;
    expect(paste.legal).toBe(false);
    expect(boolBlocked(paste)).toBe(true);
    expect(affordWaitMs(paste)).toBeNull();
    resetClock();
  });
});
