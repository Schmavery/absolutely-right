import type { McpToolDef } from '../types';

export type FormatMcpToolOpts = {
  /** Shell/Write `output` lines — shown only after approve (default false). */
  includeOutput?: boolean;
};

/** Render templated fields (`{{rand}}`, etc.) then build the in-game tool card body. */
export function formatMcpToolCall(
  def: McpToolDef,
  renderField: (s: string) => string,
  opts?: FormatMcpToolOpts,
): string {
  const includeOutput = opts?.includeOutput ?? false;
  switch (def.tool) {
    case 'CallMcpTool':
      return [
        'CallMcpTool',
        `server: ${renderField(def.server)}`,
        `tool: ${renderField(def.toolName)}`,
        `args: ${renderField(def.args)}`,
      ].join('\n');
    case 'Shell': {
      const head = `Shell command: ${renderField(def.command)}`;
      return includeOutput && def.output
        ? [head, renderField(def.output)].join('\n')
        : head;
    }
    case 'Read': {
      const head = `Read path: ${renderField(def.path)}`;
      return def.snippet
        ? [head, renderField(def.snippet.trim())].join('\n')
        : head;
    }
    case 'Write': {
      const lines = [`Write path: ${renderField(def.path)}`];
      if (def.preview) lines.push(renderField(def.preview));
      if (includeOutput && def.output) lines.push(renderField(def.output));
      return lines.join('\n');
    }
  }
}
