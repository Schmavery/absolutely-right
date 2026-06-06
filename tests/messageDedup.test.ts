import { describe, expect, it, afterEach } from 'vitest';
import { action, ACTIONS, EVENTS, MCP_UNSAFE_ALLOW_LEAK_ACK } from '../src/game/data';
import { maybeFireEvent } from '../src/game/events';
import { appendLog } from '../src/game/log';
import { messageKey, pickUnused } from '../src/lib/messageKey';
import {
  collectUsedEventIdTemplates,
  findMessageKeyCollisions,
} from '../src/lib/messagePoolKeys';
import { defaultState } from '../src/game/state';
import { promptAction } from '../src/game/actions';
import { scriptedPromptCount } from '../src/game/prompt';
import { setClock, setRandom, resetClock, resetRandom } from '../src/game/runtime';

afterEach(() => {
  resetClock();
  resetRandom();
});

describe('messageKey on real game data', () => {
  const templates = collectUsedEventIdTemplates(EVENTS, ACTIONS, MCP_UNSAFE_ALLOW_LEAK_ACK);

  it('assigns a unique dedup key to every template in the shared usedEventIds pool', () => {
    expect(findMessageKeyCollisions(templates)).toEqual([]);
  });

  it('keeps paste_error bad and neutral lines distinct when they share a user prompt', () => {
    const paste = action('paste_error');
    const bad = paste.badMessages!.find((m) => m.startsWith("> here's the error"))!;
    const neutral = paste.neutralMessages!.find((m) => m.startsWith("> here's the error"))!;
    expect(messageKey(bad)).not.toBe(messageKey(neutral));
  });

  it('keeps the paste_error bad beat distinct from the gated event at 3000 LOC', () => {
    const paste = action('paste_error').badMessages!.find((m) => m.startsWith("> it's still broken"))!;
    const event = EVENTS.find((e) => e.minLoc === 3000 && e.text.includes("> it's still broken"))!;
    expect(paste).toBeDefined();
    expect(event).toBeDefined();
    expect(messageKey(paste!)).not.toBe(messageKey(event!.text));
  });

  it('exhausts every paste_error good message before pickUnused repeats', () => {
    setRandom(() => 0);
    const pool = action('paste_error').goodMessages!;
    const used: string[] = [];
    const keys: string[] = [];
    for (let i = 0; i < pool.length; i++) {
      const item = pickUnused(pool, used)!;
      keys.push(messageKey(item));
      used.push(messageKey(item));
    }
    expect(new Set(keys).size).toBe(pool.length);
  });
});

describe('pickUnused', () => {
  const pool = ['> alpha', '> beta', '> gamma'] as const;

  it('does not repeat until the pool is exhausted', () => {
    const used: string[] = [];
    const keys: string[] = [];
    for (let i = 0; i < pool.length; i++) {
      const item = pickUnused(pool, used)!;
      keys.push(messageKey(item));
      used.push(messageKey(item));
    }
    expect(new Set(keys).size).toBe(pool.length);
  });

  it('allows repeats after the pool is exhausted', () => {
    const used = pool.map((p) => messageKey(p));
    const again = pickUnused(pool, used)!;
    expect(pool).toContain(again);
  });
});

describe('maybeFireEvent dialogue dedup', () => {
  it('can repeat after every gated line at this LOC has been seen', () => {
    const ev = EVENTS[0]!;
    let r = 0;
    setRandom(() => {
      const seq = [0, 0, 0];
      return seq[r++ % seq.length] ?? 0;
    });
    let t = 0;
    setClock(() => t);

    const gatedAtLoc = EVENTS.filter((e) => e.minLoc <= ev.minLoc);
    const base = {
      ...defaultState(),
      totalLoc: ev.minLoc,
      lastEventTime: -60_000,
      usedEventIds: gatedAtLoc.map((e) => messageKey(e.text)),
    };

    const repeat = maybeFireEvent(base, 1, appendLog);
    expect(repeat.log.length).toBeGreaterThan(0);
  });
});

describe('early prompt scripted messages', () => {
  it('records each scripted beat so events cannot repeat it early', () => {
    let t = 0;
    setClock(() => t);
    setRandom(() => 0);

    const scripted = scriptedPromptCount();
    let s = defaultState();
    for (let i = 0; i < scripted; i++) {
      t += 5000;
      s = promptAction(s);
    }
    expect(s.totalClicks).toBe(scripted);
    expect(s.usedEventIds.length).toBe(scripted);
  });
});
