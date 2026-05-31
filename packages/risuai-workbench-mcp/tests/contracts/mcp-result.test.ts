/**
 * MCP tool result helper tests.
 * @file packages/risuai-workbench-mcp/tests/contracts/mcp-result.test.ts
 */

import { describe, expect, it } from 'vitest';

import { createJsonToolResult } from '../../src/contracts/mcp-result';

describe('createJsonToolResult', () => {
  it('returns text JSON and structuredContent for object payloads', () => {
    const payload = { schema: 'example.schema', status: 'ok', value: 7 };

    const result = createJsonToolResult(payload);

    expect(result.content).toEqual([{ text: JSON.stringify(payload), type: 'text' }]);
    expect(result.structuredContent).toBe(payload);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(payload);
  });
});
