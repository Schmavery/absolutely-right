import type { LogEntry, McpToolDef } from '../types';
import { MESSAGE_POOL } from '../game/constants';
import { formatMcpToolCall } from './formatMcpTool';
import { render } from './template';
import { random } from '../game/runtime';

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

/** True when every checkable line from a template already appears in `log`. */
export function templateSeenInLog(source: string, log: LogEntry[]): boolean {
  const lines = source.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return false;

  let checked = 0;
  for (const line of lines) {
    const isUser = line.trimStart().startsWith('>');
    if (isUser) {
      const clean = line.replace(/^\s*>\s*/, '').trim();
      if (!logHasText(log, clean, { userLine: true })) return false;
      checked++;
      continue;
    }
    if (line.includes('{{')) continue;
    if (!logHasText(log, render(line).trim())) return false;
    checked++;
  }
  return checked > 0;
}

/** Same as `templateSeenInLog`, but only the last `window` log entries count. */
export function templateSeenInRecentLog(
  source: string,
  log: LogEntry[],
  window: number = MESSAGE_POOL.recentWindow,
): boolean {
  return templateSeenInLog(source, log.slice(-window));
}

/** First log line for an MCP tool card (rendered when possible). */
export function mcpToolHead(def: McpToolDef): string | null {
  try {
    return formatMcpToolCall(def, (s) => render(s)).split('\n')[0]!.trim();
  } catch {
    switch (def.tool) {
      case 'Shell':
        return `Shell command: ${def.command}`.trim();
      case 'Read':
        return `Read path: ${def.path}`.trim();
      case 'Write':
        return `Write path: ${def.path}`.trim();
      case 'CallMcpTool':
        return `CallMcpTool\nserver: ${def.server}\ntool: ${def.toolName}`;
      default:
        return null;
    }
  }
}

/** True when this MCP tool card (pending or approved) is in the recent log window. */
export function mcpToolSeenInRecentLog(
  def: McpToolDef,
  log: LogEntry[],
  window: number = MESSAGE_POOL.recentWindow,
): boolean {
  const head = mcpToolHead(def);
  if (!head) return false;
  const recent = log.slice(-window);
  return recent.some((e) => e.type === 'tool' && e.text.trim().startsWith(head));
}

/**
 * Uniform random pick from `pool`, excluding templates in the recent log
 * window. Returns `undefined` when nothing is eligible (no fallback repeat).
 */
export function pickFromPool<T extends string>(
  pool: readonly T[],
  log: LogEntry[],
  window: number = MESSAGE_POOL.recentWindow,
): T | undefined {
  if (pool.length === 0) return undefined;
  const fresh = pool.filter((item) => !templateSeenInRecentLog(item, log, window));
  if (fresh.length === 0) return undefined;
  return fresh[Math.floor(random() * fresh.length)]!;
}

export function pickMcpTool(
  pool: readonly McpToolDef[],
  log: LogEntry[],
  window: number = MESSAGE_POOL.recentWindow,
): McpToolDef | undefined {
  if (pool.length === 0) return undefined;
  const fresh = pool.filter((t) => !mcpToolSeenInRecentLog(t, log, window));
  if (fresh.length === 0) return undefined;
  return fresh[Math.floor(random() * fresh.length)]!;
}
