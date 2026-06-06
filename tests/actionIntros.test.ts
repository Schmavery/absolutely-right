import { describe, expect, it } from 'vitest';
import { action } from '../src/game/data';
import { introduceUnseenActions } from '../src/game/actionIntros';
import { deriveGame } from '../src/game/derive';
import { defaultState } from '../src/game/state';
import { tickReducer } from '../src/game/tick';
import { THRESHOLDS } from '../src/game/constants';

describe('action intros', () => {
  it('shows write_test intro once when bugs reach the threshold', () => {
    const prev = {
      ...defaultState(),
      started: true,
      bugs: THRESHOLDS.showWriteTestsBugs,
      lifetimeBugs: THRESHOLDS.showWriteTestsBugs,
    };
    const next = introduceUnseenActions(prev);
    expect(next.actionsIntroduced).toContain('write_test');
    expect(next.log.at(-1)?.text).toBe(action('write_test').introMsg);
    expect(next.log.at(-1)?.type).toBe('system');
    expect(next.log.at(-1)?.priority).toBe(true);
    expect(introduceUnseenActions(next)).toBe(next);
  });

  it('shows run_tests intro once when tests reach the run threshold', () => {
    const prev = {
      ...defaultState(),
      started: true,
      tests: THRESHOLDS.showRunTestsTests,
      actionsIntroduced: ['write_test'],
    };
    const next = introduceUnseenActions(prev);
    expect(next.actionsIntroduced).toContain('run_tests');
    expect(next.log.at(-1)?.text).toBe(action('run_tests').introMsg);
  });

  it('shows paste_error intro when the action becomes visible', () => {
    const prev = {
      ...defaultState(),
      started: true,
      lifetimeBugs: 1,
      bugs: 1,
    };
    const next = introduceUnseenActions(prev);
    expect(next.actionsIntroduced).toContain('paste_error');
    expect(next.log.at(-1)?.text).toBe(action('paste_error').introMsg);
  });

  it('fires from tick when bugs are already at the write_test threshold', () => {
    const prev = {
      ...defaultState(),
      started: true,
      bugs: THRESHOLDS.showWriteTestsBugs,
      lifetimeBugs: THRESHOLDS.showWriteTestsBugs,
      totalLoc: 500,
      genCounts: { autocomplete: 1 },
    };
    const next = tickReducer(prev, 1);
    expect(next.actionsIntroduced).toContain('write_test');
  });
});

describe('bug counter vs paste_error', () => {
  it('shows bugs and paste_error together on the first lifetime bug', () => {
    const ui = deriveGame({
      ...defaultState(),
      lifetimeBugs: 1,
      bugs: 1,
    }).ui;
    expect(ui.showPasteError).toBe(true);
    expect(ui.showBugs).toBe(true);
  });

  it('keeps paste_error visible after bugs are fixed (lifetime sticky)', () => {
    const ui = deriveGame({
      ...defaultState(),
      lifetimeBugs: 3,
      bugs: 0,
    }).ui;
    expect(ui.showPasteError).toBe(true);
    expect(ui.showBugs).toBe(true);
  });
});
