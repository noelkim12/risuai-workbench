/**
 * CBS reference resource tests.
 * @file packages/risuai-workbench-mcp/tests/resources/cbs-reference.test.ts
 */

import { describe, expect, it } from 'vitest';

import { readCbsResource } from '../../src/resources/cbs-reference';

function textOf(uri: string): string {
  const result = readCbsResource(uri);
  expect(result).not.toBeNull();
  return result?.contents[0]?.text ?? '';
}

function jsonOf(uri: string): unknown {
  return JSON.parse(textOf(uri));
}

describe('CBS reference resources', () => {
  it('returns syntax guidance without reading a local docs path', () => {
    const text = textOf('risuai-workbench://cbs/syntax');

    expect(text).toContain('{{tag::arg}}');
    expect(text).toContain('{{#block}}');
    expect(text).toContain('{{:}}');
  });

  it('returns block guidance as a semantic markdown section', () => {
    const text = textOf('risuai-workbench://cbs/blocks');

    expect(text).toContain('{{#when');
    expect(text).toContain('{{#each');
    expect(text).toContain('{{/when}}');
  });

  it('returns a compact registry-backed CBS index', () => {
    const payload = jsonOf('risuai-workbench://cbs/index') as {
      categories: Array<{ id: string; tagCount: number; uri: string }>;
      resources: { categoryTemplate: string; tagTemplate: string };
      schema: string;
      syntax: { basic: string; block: string; separator: string };
    };

    expect(payload.schema).toBe('risuai-workbench-mcp.cbs-index');
    expect(payload.syntax.basic).toBe('{{tag}} or {{tag::arg1::arg2}}');
    expect(payload.resources.categoryTemplate).toBe('risuai-workbench://cbs/category/{category}');
    expect(payload.resources.tagTemplate).toBe('risuai-workbench://cbs/tag/{tagId}');
    expect(payload.categories.some((category) => category.id === 'identity' && category.tagCount > 0)).toBe(true);
    expect(payload.categories.some((category) => category.id === 'variable' && category.tagCount > 0)).toBe(true);
  });

  it('returns category resource from CBSBuiltinRegistry', () => {
    const payload = jsonOf('risuai-workbench://cbs/category/identity') as {
      category: string;
      tags: Array<{ name: string; aliases: string[]; detailUri: string }>;
    };

    expect(payload.category).toBe('identity');
    expect(payload.tags.some((tag) => tag.name === 'char' && tag.detailUri === 'risuai-workbench://cbs/tag/char')).toBe(true);
    expect(payload.tags.some((tag) => tag.aliases.includes('bot'))).toBe(true);
  });

  it('returns tag detail resource from CBSBuiltinRegistry', () => {
    const payload = jsonOf('risuai-workbench://cbs/tag/char') as {
      aliases: string[];
      category: string;
      name: string;
      relatedTags: string[];
    };

    expect(payload.name).toBe('char');
    expect(payload.aliases).toContain('bot');
    expect(payload.category).toBe('identity');
    expect(payload.relatedTags).toContain('user');
  });

  it('returns null for unknown CBS tag detail resource', () => {
    expect(readCbsResource('risuai-workbench://cbs/tag/not-a-real-tag')).toBeNull();
  });
});
