import type { ActionDef, GameState, LogEntry } from '../types';
import { messageKey } from '../lib/messageKey';
import { render } from '../lib/template';
import { ACTIONS, EVENTS, MCP_TOOLS, MCP_UNSAFE_ALLOW_LEAK_ACK, NEWS } from './data';
import { eventKey } from './events';

const MESSAGE_POOL_KEYS = [
  'earlyPromptMsgs',
  'messages',
  'goodMessages',
  'badMessages',
  'neutralMessages',
  'firstPurchaseMsg',
  'runMsg',
] as const satisfies readonly (keyof ActionDef)[];

const PASTE_SUFFIX_RE = / \[Pasted text #\d+ · \d+ lines\]$/;

function logHasText(log: LogEntry[], text: string, opts?: { userLine?: boolean }): boolean {
  const t = text.trim();
  if (!t) return false;
  return log.some((e) => {
    const entry = e.text.trim();
    if (opts?.userLine || e.type === 'user') {
      return entry === t || (entry.startsWith(t) && PASTE_SUFFIX_RE.test(entry));
    }
    return entry === t;
  });
}

/** True when every checkable line from a template already appears in the log. */
function templateSeenInLog(source: string, log: LogEntry[]): boolean {
  const lines = source.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return false;

  for (const line of lines) {
    const isUser = line.trimStart().startsWith('>');
    if (isUser) {
      const clean = line.replace(/^\s*>\s*/, '').trim();
      if (!logHasText(log, clean, { userLine: true })) return false;
      continue;
    }
    if (line.includes('{{')) continue;
    if (!logHasText(log, render(line).trim())) return false;
  }
  return true;
}

function collectActionSources(a: ActionDef): string[] {
  const out: string[] = [];
  for (const key of MESSAGE_POOL_KEYS) {
    const pool = a[key];
    if (typeof pool === 'string') out.push(pool);
    else if (Array.isArray(pool)) out.push(...pool);
  }
  return out;
}

/**
 * Rebuild `usedEventIds` / `usedNewsIds` from the conversation log so pool
 * picks stay consistent after load or cross-tab reload.
 */
export function rehydratePoolUsage(state: GameState): GameState {
  const { log } = state;
  const usedEventIds = new Set(state.usedEventIds);
  const usedNewsIds = new Set(state.usedNewsIds);

  for (const ev of EVENTS) {
    if (templateSeenInLog(ev.text, log)) {
      usedEventIds.add(eventKey(ev));
    }
  }

  for (const item of NEWS) {
    if (templateSeenInLog(item.text, log)) {
      usedNewsIds.add(item.id);
    }
  }

  for (const a of ACTIONS) {
    for (const source of collectActionSources(a)) {
      if (templateSeenInLog(source, log)) {
        usedEventIds.add(messageKey(source));
      }
    }
  }

  for (const tool of MCP_TOOLS) {
    if (log.some((e) => e.type === 'tool' && e.text.includes(tool.id))) {
      usedEventIds.add(tool.id);
    }
  }

  for (const ack of MCP_UNSAFE_ALLOW_LEAK_ACK) {
    if (templateSeenInLog(ack, log)) {
      usedEventIds.add(messageKey(ack));
    }
  }

  return {
    ...state,
    usedEventIds: [...usedEventIds],
    usedNewsIds: [...usedNewsIds],
  };
}
