import { describe, expect, it } from 'vitest';
import { action, EVENTS } from '../src/game/data';
import { eventKey } from '../src/game/events';
import { appendLog } from '../src/game/log';
import { rehydratePoolUsage } from '../src/game/rehydratePoolUsage';
import { defaultState } from '../src/game/state';
import { messageKey } from '../src/lib/messageKey';
import { render } from '../src/lib/template';

describe('rehydratePoolUsage', () => {
  it('marks early prompt templates seen in the log', () => {
    const scripted = action('prompt').earlyPromptMsgs![0]!;
    let state = defaultState();
    state = appendLog(state, scripted, 'info');
    state = { ...state, usedEventIds: [] };

    const next = rehydratePoolUsage(state);
    expect(next.usedEventIds).toContain(messageKey(scripted));
  });

  it('marks multi-line gated events from split log entries', () => {
    const ev = EVENTS.find((e) => e.minLoc === 250)!;
    let state = defaultState();
    state = appendLog(state, render(ev.text), 'info');
    state = { ...state, usedEventIds: [] };

    const next = rehydratePoolUsage(state);
    expect(next.usedEventIds).toContain(eventKey(ev));
  });

  it('marks paste_error templates when the user line has a paste suffix', () => {
    const source = action('paste_error').goodMessages![0]!;
    const suffixed = render(source).replace(
      /^(>[^\n]*)/,
      '$1 [Pasted text #3 · 5 lines]',
    );
    let state = defaultState();
    state = appendLog(state, suffixed, 'info');
    state = { ...state, usedEventIds: [] };

    const next = rehydratePoolUsage(state);
    expect(next.usedEventIds).toContain(messageKey(source));
  });
});
