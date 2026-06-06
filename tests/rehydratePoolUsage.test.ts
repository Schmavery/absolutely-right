import { describe, expect, it } from 'vitest';
import { action } from '../src/game/data';
import { appendLog } from '../src/game/log';
import { rehydratePoolUsage } from '../src/game/rehydratePoolUsage';
import { defaultState } from '../src/game/state';
import { messageKey } from '../src/lib/messageKey';

describe('rehydratePoolUsage', () => {
  it('marks early prompt templates seen in the log', () => {
    const scripted = action('prompt').earlyPromptMsgs![0]!;
    let state = defaultState();
    state = appendLog(state, scripted, 'info');
    state = { ...state, usedEventIds: [] };

    const next = rehydratePoolUsage(state);
    expect(next.usedEventIds).toContain(messageKey(scripted));
  });
});
