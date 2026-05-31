/**
 * RisuLua reference resource tests.
 * @file packages/risuai-workbench-mcp/tests/resources/risulua-reference.test.ts
 */

import { describe, expect, it } from 'vitest';

import { readRisuLuaResource } from '../../src/resources/risulua-reference';

function textOf(uri: string): string {
  const result = readRisuLuaResource(uri);
  expect(result).not.toBeNull();
  return result?.contents[0]?.text ?? '';
}

function jsonOf(uri: string): unknown {
  return JSON.parse(textOf(uri));
}

describe('RisuLua reference resources', () => {
  it('returns compact lifecycle guidance as markdown', () => {
    const text = textOf('risuai-workbench://risulua/lifecycle');

    expect(text).toContain('onInput(id)');
    expect(text).toContain('onButtonClick(id, data)');
    expect(text).toContain('listenEdit');
    expect(text).toContain('return false');
  });

  it('returns compact access-tier guidance as markdown', () => {
    const text = textOf('risuai-workbench://risulua/access-tiers');

    expect(text).toContain('Open');
    expect(text).toContain('Safe');
    expect(text).toContain('EditDisplay');
    expect(text).toContain('LowLevel');
  });

  it('returns a registry-backed RisuLua index', () => {
    const payload = jsonOf('risuai-workbench://risulua/index') as {
      categories: Array<{ id: string; functionCount: number; uri: string }>;
      resources: { categoryTemplate: string; functionTemplate: string };
      schema: string;
      functionCount: number;
    };

    expect(payload.schema).toBe('risuai-workbench-mcp.risulua-index');
    expect(payload.resources.categoryTemplate).toBe('risuai-workbench://risulua/category/{category}');
    expect(payload.resources.functionTemplate).toBe('risuai-workbench://risulua/function/{name}');
    expect(payload.categories.some((category) => category.id === 'state' && category.functionCount > 0)).toBe(true);
    expect(payload.categories.some((category) => category.id === 'chat' && category.functionCount > 0)).toBe(true);
    expect(payload.functionCount).toBeGreaterThan(20);
  });

  it('returns category resource from core Lua API metadata', () => {
    const payload = jsonOf('risuai-workbench://risulua/category/state') as {
      category: string;
      functions: Array<{ name: string; access: string; detailUri: string }>;
      schema: string;
    };

    expect(payload.schema).toBe('risuai-workbench-mcp.risulua-category');
    expect(payload.category).toBe('state');
    expect(payload.functions.some((fn) => fn.name === 'getState' && fn.detailUri === 'risuai-workbench://risulua/function/getState')).toBe(true);
    expect(payload.functions.some((fn) => fn.name === 'setChatVar' && fn.access === 'safe')).toBe(true);
  });

  it('returns function detail with documentation and signature', () => {
    const payload = jsonOf('risuai-workbench://risulua/function/LLM') as {
      access: string | null;
      category: string | null;
      documentation: { summary: string; examples: string[] };
      name: string;
      schema: string;
      signature: string | null;
    };

    expect(payload.schema).toBe('risuai-workbench-mcp.risulua-function');
    expect(payload.name).toBe('LLM');
    expect(payload.category).toBe('ai');
    expect(payload.access).toBe('low-level');
    expect(payload.documentation.summary).toContain('LLM');
    expect(payload.signature).toContain('LLM');
    expect(payload.documentation.examples.join('\n')).toContain('result.success');
  });

  it('returns null for unknown function detail resource', () => {
    expect(readRisuLuaResource('risuai-workbench://risulua/function/notAHostFunction')).toBeNull();
  });
});
