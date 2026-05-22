/**
 * Shared hover content normalization for CBS LSP hover snapshot/merge helpers.
 * @file packages/cbs-lsp/src/features/hover/hover-content-normalizer.ts
 */

import type { Hover } from 'vscode-languageserver/node';

/**
 * Normalized hover content in `{ kind, value }` snapshot shape.
 * Used by hover.ts and lualsProxy.ts snapshot normalizers.
 */
export interface NormalizedHoverContentSnapshot {
  kind: string | null;
  value: string;
}

/**
 * Options controlling how hover content is normalized to a markdown string.
 */
export interface NormalizeHoverToMarkdownOptions {
  /**
   * Join separator for array entries. Default: `'\n'`.
   * `LuaLsResponseMerge.ts` uses `'\n\n'`; others use `'\n'`.
   */
  readonly arraySeparator?: string;

  /**
   * When true, filter out blank/empty parts before joining. Default: `false`.
   * `LuaLsResponseMerge.ts` filters blanks; others do not.
   */
  readonly filterBlank?: boolean;

  /**
   * When true, convert `{ language, value }` MarkedString to fenced code blocks.
   * Default: `false` (extract `.value` only, matching snapshot behavior).
   * `LuaLsResponseMerge.ts` sets this to `true`.
   */
  readonly fencedCodeBlocks?: boolean;
}

/**
 * normalizeHoverContentToSnapshot 함수.
 * LSP `Hover.contents`를 `{ kind, value }` snapshot shape으로 정규화함.
 * Array entries are joined with `\n`; `{ language, value }` MarkedString objects
 * are reduced to `.value` to match existing snapshot semantics.
 *
 * @param contents - LSP Hover.contents payload
 * @returns snapshot-friendly `{ kind, value }` pair
 */
export function normalizeHoverContentToSnapshot(
  contents: Hover['contents'],
): NormalizedHoverContentSnapshot {
  if (typeof contents === 'string') {
    return { kind: null, value: contents };
  }

  if (Array.isArray(contents)) {
    return {
      kind: null,
      value: contents.map((entry) => (typeof entry === 'string' ? entry : entry.value)).join('\n'),
    };
  }

  const markup = contents as { kind?: string; value: string };

  if (typeof markup === 'string') {
    return { kind: null, value: markup };
  }

  return {
    kind: 'kind' in markup ? (markup.kind ?? null) : null,
    value: markup.value,
  };
}

/**
 * normalizeHoverContentToMarkdown 함수.
 * LSP `Hover.contents`를 markdown 병합용 평면 문자열로 정규화함.
 *
 * Supports configurable join separator, blank filtering, and fenced code block
 * conversion for `{ language, value }` MarkedString entries.
 *
 * @param contents - LSP Hover.contents payload
 * @param options - normalization behavior options
 * @returns markdown string (empty string if content is empty after filtering)
 */
export function normalizeHoverContentToMarkdown(
  contents: Hover['contents'],
  options: NormalizeHoverToMarkdownOptions = {},
): string {
  const { arraySeparator = '\n', filterBlank = false, fencedCodeBlocks = false } = options;

  if (typeof contents === 'string') {
    return contents;
  }

  if (Array.isArray(contents)) {
    const parts = contents.map((entry) => normalizeHoverContentToMarkdown(entry, options));
    const filtered = filterBlank ? parts.filter(Boolean) : parts;
    return filtered.join(arraySeparator);
  }

  if (typeof contents === 'object' && contents !== null) {
    const record = contents as Record<string, unknown>;

    // { language, value } MarkedString → fenced code block or plain value
    if (typeof record.language === 'string' && typeof record.value === 'string') {
      if (fencedCodeBlocks) {
        return `\`\`\`${record.language}\n${record.value}\n\`\`\``;
      }
      return record.value;
    }

    // MarkupContent or { value } MarkedString
    if (typeof record.value === 'string') {
      return record.value;
    }
  }

  return '';
}
