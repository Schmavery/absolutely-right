import { action } from '../game/data';
import { GEN_BY_ID, genHoverTitle } from './genMeta';
import { UPGRADE_BY_ID, upgradeHoverTitle } from './upgradeMeta';

/** In-game button / panel labels for trace timeline (actions.yaml has no `name`). */
const ACTION_TITLES: Record<string, string> = {
  new_free_account: 'Free Account',
  bug_bounty: 'Run bug bounty',
  launch: 'Ship to production',
  prompt: 'Prompt',
  paste_error: 'Paste the error',
  kick_agent: 'Kick off an agent',
  clear_context: 'Clear the context',
  write_test: 'Write a test',
  run_tests: 'Run tests',
  mcp_allow: 'Allow MCP',
  mcp_deny: 'Deny MCP',
};

export function actionDisplayName(moveId: string): string {
  if (moveId.startsWith('buy_gen:')) {
    const id = moveId.slice('buy_gen:'.length);
    return GEN_BY_ID.get(id)?.name ?? id;
  }
  if (moveId.startsWith('buy_upgrade:')) {
    const id = moveId.slice('buy_upgrade:'.length);
    return UPGRADE_BY_ID.get(id)?.name ?? id;
  }
  return ACTION_TITLES[moveId] ?? moveId;
}

export function actionHoverTitle(moveId: string): string | undefined {
  if (moveId.startsWith('buy_gen:')) {
    const id = moveId.slice('buy_gen:'.length);
    const g = GEN_BY_ID.get(id);
    return g ? genHoverTitle(g) : undefined;
  }
  if (moveId.startsWith('buy_upgrade:')) {
    const id = moveId.slice('buy_upgrade:'.length);
    const u = UPGRADE_BY_ID.get(id);
    return u ? upgradeHoverTitle(u) : undefined;
  }
  try {
    const a = action(moveId);
    const first = a.messages?.[0];
    return first?.split('\n')[0]?.replace(/^>\s*/, '').trim();
  } catch {
    return undefined;
  }
}
