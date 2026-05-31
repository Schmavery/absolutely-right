import { describe, expect, it } from 'vitest';
import { PROMPT_EVENT } from '../src/game/constants';
import { calcPromptEventProbability } from '../src/game/rates';

const BASE = 0.12;

describe('calcPromptEventProbability', () => {
  it('starts at certainty right after scripted prompts', () => {
    expect(calcPromptEventProbability(BASE, 0)).toBe(1);
  });

  it('decays to the yaml floor', () => {
    expect(calcPromptEventProbability(BASE, 10)).toBeCloseTo(0.56, 2);
    expect(calcPromptEventProbability(BASE, PROMPT_EVENT.decayClicks)).toBe(BASE);
    expect(calcPromptEventProbability(BASE, 100)).toBe(BASE);
  });
});
