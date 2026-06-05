import { describe, expect, it } from 'vitest';
import type { McpToolDef } from '../src/types';
import { formatMcpToolCall } from '../src/lib/formatMcpTool';

const id = (def: Omit<McpToolDef, 'id' | 'safe'>): McpToolDef =>
  ({ id: 'test', safe: true, ...def }) as McpToolDef;

describe('formatMcpToolCall', () => {
  it('formats Shell on one line', () => {
    expect(
      formatMcpToolCall(id({ tool: 'Shell', command: 'npm test' }), (s) => s),
    ).toBe('Shell command: npm test');
  });

  it('omits Shell output until includeOutput', () => {
    const def = id({ tool: 'Shell', command: 'npm test', output: '(exit 0)' });
    expect(formatMcpToolCall(def, (s) => s)).toBe('Shell command: npm test');
    expect(formatMcpToolCall(def, (s) => s, { includeOutput: true })).toBe(
      'Shell command: npm test\n(exit 0)',
    );
  });

  it('formats Read with snippet as fake file body', () => {
    expect(
      formatMcpToolCall(
        id({ tool: 'Read', path: '.env.local', snippet: 'API_KEY=sk-abc' }),
        (s) => s,
      ),
    ).toBe('Read path: .env.local\nAPI_KEY=sk-abc');
  });

  it('formats CallMcpTool with server, tool, and args', () => {
    expect(
      formatMcpToolCall(
        id({
          tool: 'CallMcpTool',
          server: 'plugin-linear-linear',
          toolName: 'create_issue',
          args: '{ "title": "x" }',
        }),
        (s) => s,
      ),
    ).toBe(
      'CallMcpTool\nserver: plugin-linear-linear\ntool: create_issue\nargs: { "title": "x" }',
    );
  });
});
