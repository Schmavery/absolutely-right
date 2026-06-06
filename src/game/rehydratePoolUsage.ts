import type { GameState } from '../types';
import { templateSeenInLog } from '../lib/logTemplateMatch';
import { NEWS } from './data';

/**
 * Rebuild `usedNewsIds` from the conversation log after load.
 * Events, flavor, and MCP pools dedupe from the recent log window at pick time.
 */
export function rehydratePoolUsage(state: GameState): GameState {
  const usedNewsIds = new Set(state.usedNewsIds);

  for (const item of NEWS) {
    if (templateSeenInLog(item.text, state.log)) {
      usedNewsIds.add(item.id);
    }
  }

  return {
    ...state,
    usedNewsIds: [...usedNewsIds],
  };
}
