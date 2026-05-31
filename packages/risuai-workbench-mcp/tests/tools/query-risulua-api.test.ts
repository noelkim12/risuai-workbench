/**
 * RisuLua API query tool tests.
 * @file packages/risuai-workbench-mcp/tests/tools/query-risulua-api.test.ts
 */

import { describe, expect, it } from 'vitest';

import { handleQueryRisuLuaApi } from '../../src/tools/analyze/query-risulua-api';

describe('query RisuLua API tool', () => {
  it('returns documentation, signature, resource links, and related functions for a known host function', async () => {
    const result = await handleQueryRisuLuaApi({ symbol: 'getState' });

    expect(result.status).toBe('ok');
    expect(result.tool).toBe('workbench.query_risulua_api');
    expect(result.data).toMatchObject({
      access: 'wrapper',
      category: 'state',
      categoryUri: 'risuai-workbench://risulua/category/state',
      detailUri: 'risuai-workbench://risulua/function/getState',
      found: true,
      name: 'getState',
      readWrite: 'read',
    });
    expect(result.data?.referenceUris).toContain('risuai-workbench://risulua/function/getState');
    expect(JSON.stringify(result.data)).toContain('getChatVar');
    expect(JSON.stringify(result.data)).toContain('RisuAI');
    expect(JSON.stringify(result.data)).toContain('getState(');
  });

  it('matches function names case-insensitively', async () => {
    const result = await handleQueryRisuLuaApi({ symbol: 'llm' });

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({
      access: 'low-level',
      category: 'ai',
      found: true,
      name: 'LLM',
    });
  });

  it('returns category-filtered suggestions for unknown symbols', async () => {
    const result = await handleQueryRisuLuaApi({ category: 'state', symbol: 'getStat' });

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({
      found: false,
      name: null,
      symbol: 'getStat',
    });
    expect(result.data?.suggestions).toContain('getState');
    expect(result.data?.suggestions).toContain('setState');
  });
});
