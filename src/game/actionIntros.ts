import type { GameState } from '../types';
import { ACTIONS } from './data';
import { getMove } from './availability';
import { appendLog } from './log';
import { now } from './runtime';

/** One-shot AI lines when new actions become visible (see `introMsg` in actions.yaml). */
export function introduceUnseenActions(state: GameState): GameState {
  const introduced = new Set(state.actionsIntroduced ?? []);
  const t = now();
  let next = state;
  let changed = false;

  for (const def of ACTIONS) {
    if (!def.introMsg || introduced.has(def.id)) continue;
    const move = getMove(next, def.id, t);
    if (!move?.visible) continue;
    next = appendLog(next, def.introMsg, 'info');
    introduced.add(def.id);
    changed = true;
  }

  if (!changed) return state;
  return { ...next, actionsIntroduced: [...introduced] };
}
