/**
 * Tests for the shared hover content normalizer.
 * @file packages/cbs-lsp/tests/features/hover-content-normalizer.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeHoverContentToSnapshot,
  normalizeHoverContentToMarkdown,
  type NormalizeHoverToMarkdownOptions,
} from '../../src/features/hover/hover-content-normalizer';
import type { MarkupContent } from 'vscode-languageserver/node';

describe('normalizeHoverContentToSnapshot', () => {
  it('returns { kind: null, value } for plain string contents', () => {
    expect(normalizeHoverContentToSnapshot('hello world')).toEqual({
      kind: null,
      value: 'hello world',
    });
  });

  it('returns { kind: null, value } for MarkupContent markdown', () => {
    const contents: MarkupContent = { kind: 'markdown', value: '**bold**' };
    expect(normalizeHoverContentToSnapshot(contents)).toEqual({
      kind: 'markdown',
      value: '**bold**',
    });
  });

  it('returns { kind: null, value } for MarkupContent plaintext', () => {
    const contents: MarkupContent = { kind: 'plaintext', value: 'plain text' };
    expect(normalizeHoverContentToSnapshot(contents)).toEqual({
      kind: 'plaintext',
      value: 'plain text',
    });
  });

  it('returns { kind: null, value } for { language, value } MarkedString, extracting .value only', () => {
    expect(normalizeHoverContentToSnapshot({ language: 'lua', value: 'local x = 1' })).toEqual({
      kind: null,
      value: 'local x = 1',
    });
  });

  it('joins MarkedString array entries with \\n, extracting .value from object entries', () => {
    expect(
      normalizeHoverContentToSnapshot([
        'first line',
        { language: 'lua', value: 'local x = 1' },
        'third line',
      ]),
    ).toEqual({
      kind: null,
      value: 'first line\nlocal x = 1\nthird line',
    });
  });

  it('preserves array ordering exactly', () => {
    const result = normalizeHoverContentToSnapshot([
      { language: 'lua', value: 'a' },
      'b',
      { language: 'lua', value: 'c' },
    ]);
    expect(result.value).toBe('a\nb\nc');
  });

  it('returns { kind: null, value } for null kind in markup', () => {
    const contents = { value: 'text' } as MarkupContent;
    expect(normalizeHoverContentToSnapshot(contents)).toEqual({
      kind: null,
      value: 'text',
    });
  });
});

describe('normalizeHoverContentToMarkdown', () => {
  it('returns string contents as-is', () => {
    expect(normalizeHoverContentToMarkdown('hello')).toBe('hello');
  });

  it('extracts value from MarkupContent markdown', () => {
    const contents: MarkupContent = { kind: 'markdown', value: '**bold**' };
    expect(normalizeHoverContentToMarkdown(contents)).toBe('**bold**');
  });

  it('extracts value from MarkupContent plaintext', () => {
    const contents: MarkupContent = { kind: 'plaintext', value: 'plain' };
    expect(normalizeHoverContentToMarkdown(contents)).toBe('plain');
  });

  it('extracts .value from { language, value } MarkedString by default (no fenced blocks)', () => {
    expect(normalizeHoverContentToMarkdown({ language: 'lua', value: 'local x = 1' })).toBe(
      'local x = 1',
    );
  });

  it('converts { language, value } MarkedString to fenced code block when fencedCodeBlocks=true', () => {
    expect(
      normalizeHoverContentToMarkdown(
        { language: 'lua', value: 'local x = 1' },
        { fencedCodeBlocks: true },
      ),
    ).toBe('```lua\nlocal x = 1\n```');
  });

  it('joins array entries with \\n by default', () => {
    expect(normalizeHoverContentToMarkdown(['a', 'b', 'c'])).toBe('a\nb\nc');
  });

  it('joins array entries with custom separator', () => {
    expect(normalizeHoverContentToMarkdown(['a', 'b'], { arraySeparator: '\n\n' })).toBe('a\n\nb');
  });

  it('filters blank entries when filterBlank=true', () => {
    expect(normalizeHoverContentToMarkdown(['a', '', 'b', ''], { filterBlank: true })).toBe('a\nb');
  });

  it('preserves blank entries when filterBlank is not set', () => {
    expect(normalizeHoverContentToMarkdown(['a', '', 'b'])).toBe('a\n\nb');
  });

  it('recursively handles mixed MarkedString arrays with fenced code blocks and custom separator', () => {
    expect(
      normalizeHoverContentToMarkdown(
        [
          { language: 'lua', value: 'local x = 1' },
          'description',
          { language: 'typescript', value: 'const y = 2' },
        ],
        { fencedCodeBlocks: true, arraySeparator: '\n\n' },
      ),
    ).toBe('```lua\nlocal x = 1\n```\n\ndescription\n\n```typescript\nconst y = 2\n```');
  });

  it('recursively handles mixed arrays without fenced blocks', () => {
    expect(
      normalizeHoverContentToMarkdown([{ language: 'lua', value: 'local x = 1' }, 'text']),
    ).toBe('local x = 1\ntext');
  });

  it('returns empty string for unrecognized content shapes', () => {
    expect(normalizeHoverContentToMarkdown({} as never)).toBe('');
  });

  it('handles LuaLsResponseMerge semantics: fenced code blocks, blank filtering, double-newline separator', () => {
    const options: NormalizeHoverToMarkdownOptions = {
      fencedCodeBlocks: true,
      filterBlank: true,
      arraySeparator: '\n\n',
    };

    expect(
      normalizeHoverContentToMarkdown(
        [
          { language: 'lua', value: 'local user: string' },
          '',
          { language: 'lua', value: 'local name: string' },
        ],
        options,
      ),
    ).toBe('```lua\nlocal user: string\n```\n\n```lua\nlocal name: string\n```');
  });
});
