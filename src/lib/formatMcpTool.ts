import type { McpToolDef } from '../types';

/** Render templated fields (`{{rand}}`, etc.) then build the in-game tool card body. */
export function formatMcpToolCall(def: McpToolDef, renderField: (s: string) => string): string {
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
      return def.note ? [head, renderField(def.note)].join('\n') : head;
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
      if (def.note) lines.push(renderField(def.note));
      return lines.join('\n');
    }
  }
}
