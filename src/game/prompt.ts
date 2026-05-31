import type { GameState } from '../types';
import { action } from './data';

export function scriptedPromptCount(): number {
  return action('prompt').earlyPromptMsgs?.length ?? 0;
}

/** True while cycling through `earlyPromptMsgs` (token panel hidden). */
export function inEarlyPromptScript(state: GameState): boolean {
  return state.totalClicks < scriptedPromptCount();
}
