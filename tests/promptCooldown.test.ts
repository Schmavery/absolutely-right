import { describe, expect, it } from 'vitest';
import { calcPromptCooldownMs } from '../src/game/rates';
import { getMove } from '../src/game/availability';
import { defaultState } from '../src/game/state';

describe('prompt cooldown', () => {
  it('starts at 5s before Faster Inference', () => {
    expect(calcPromptCooldownMs([])).toBe(5000);
  });

  it('drops to 1s with Faster Inference', () => {
    expect(calcPromptCooldownMs(['model_update_1'])).toBe(1000);
  });

  it('gates the prompt move on effective cooldown', () => {
    const state = {
      ...defaultState(),
      started: true,
      actionCooldowns: { prompt: Date.now() },
    };
    const move = getMove(state, 'prompt', Date.now())!;
    expect(move.legal).toBe(false);
    expect(move.waitMs).toBeGreaterThan(0);
    expect(move.waitMs).toBeLessThanOrEqual(5000);
  });
});
