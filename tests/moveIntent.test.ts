import { describe, expect, it } from 'vitest';
import { defaultState } from '../src/game/state';
import { assessNeeds, moveHelps, scoreMove, WEIGHTS_HYGIENE, WEIGHTS_LOC } from '../src/game/moveIntent';
import type { Move } from '../src/game/availability';

function actionMove(id: string): Move {
  return {
    id,
    kind: 'action',
    actionId: id,
    visible: true,
    legal: true,
    waitMs: 0,
    apply: (s) => s,
  };
}

describe('assessNeeds', () => {
  it('raises token pressure when tokens are low', () => {
    const state = defaultState();
    state.tokens = 5;
    state.minTokensSeen = 5;
    state.totalLoc = 5000;
    const needs = assessNeeds(state, 0);
    expect(needs.tokens).toBeGreaterThan(0.5);
  });

  it('raises bugs pressure when many bugs', () => {
    const state = defaultState();
    state.bugs = 30;
    state.totalLoc = 5000;
    const needs = assessNeeds(state, 0);
    expect(needs.bugs).toBeGreaterThan(0.4);
  });
});

describe('scoreMove', () => {
  it('prefers clear_context when tokens are urgent', () => {
    const state = defaultState();
    state.tokens = 8;
    state.minTokensSeen = 8;
    state.loc = 50_000;
    state.totalLoc = 8000;
    const needs = assessNeeds(state, 0);
    expect(needs.tokens).toBeGreaterThan(needs.loc);
    const clear = scoreMove(actionMove('clear_context'), needs, WEIGHTS_LOC);
    const prompt = scoreMove(actionMove('prompt'), needs, WEIGHTS_LOC);
    expect(clear).toBeGreaterThan(prompt);
  });

  it('prefers run_tests over prompt when bugs are high', () => {
    const state = defaultState();
    state.bugs = 25;
    state.tests = 5;
    state.totalLoc = 8000;
    state.tokens = 80;
    const needs = assessNeeds(state, 0);
    const tests = scoreMove(actionMove('run_tests'), needs, WEIGHTS_HYGIENE);
    const prompt = scoreMove(actionMove('prompt'), needs, WEIGHTS_HYGIENE);
    expect(tests).toBeGreaterThan(prompt);
  });
});

describe('moveHelps', () => {
  it('tags token and bug actions', () => {
    expect(moveHelps(actionMove('new_free_account')).tokens).toBe(1);
    expect(moveHelps(actionMove('write_test')).tests).toBe(1);
  });
});
