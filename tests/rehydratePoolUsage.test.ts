import { describe, expect, it } from 'vitest';
import { NEWS } from '../src/game/data';
import { appendLog } from '../src/game/log';
import { rehydratePoolUsage } from '../src/game/rehydratePoolUsage';
import { defaultState } from '../src/game/state';
import { render } from '../src/lib/template';

describe('rehydratePoolUsage', () => {
  it('rebuilds usedNewsIds from headline text in the log', () => {
    const headline = NEWS[0]!;
    let state = defaultState();
    state = appendLog(state, render(headline.text), 'news');
    state = { ...state, usedNewsIds: [] };

    const next = rehydratePoolUsage(state);
    expect(next.usedNewsIds).toContain(headline.id);
  });

  it('does not touch usedEventIds', () => {
    const legacy = ['shell_git_status', 'old-key'];
    let state = { ...defaultState(), usedEventIds: legacy };
    state = appendLog(state, 'flavor line', 'info');

    expect(rehydratePoolUsage(state).usedEventIds).toEqual(legacy);
  });
});
