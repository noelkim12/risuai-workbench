/**
 * CBS reference resource provider.
 * Serves CBS_FOR_LLM.md knowledge as MCP resources.
 * @file packages/risuai-workbench-mcp/src/resources/cbs-reference.ts
 */

import { CBSBuiltinRegistry } from 'risu-workbench-core';
import type { FunctionCategory } from 'risu-workbench-core';

import {
  CBS_BLOCKS_MARKDOWN,
  CBS_COMMON_PATTERNS,
  CBS_PATTERNS_MARKDOWN,
  CBS_PITFALLS_MARKDOWN,
  CBS_SYNTAX_MARKDOWN,
} from './cbs-index-data';

const CBS_MARKDOWN_RESOURCES: Record<string, string> = {
  blocks: CBS_BLOCKS_MARKDOWN,
  patterns: CBS_PATTERNS_MARKDOWN,
  pitfalls: CBS_PITFALLS_MARKDOWN,
  syntax: CBS_SYNTAX_MARKDOWN,
};

const registry = new CBSBuiltinRegistry();

const CATEGORY_TITLES: Record<FunctionCategory, string> = {
  array: 'Arrays',
  asset: 'Display-only assets',
  block: 'Block constructs',
  comparison: 'Comparison and boolean',
  display: 'Display and formatting',
  encoding: 'Encoding and encryption',
  escape: 'Escape characters',
  history: 'Chat history',
  identity: 'Identity and persona',
  math: 'Math',
  prompt: 'Prompts and notes',
  random: 'Randomization',
  string: 'String operations',
  time: 'Date and time',
  utility: 'Misc and advanced',
  variable: 'Variables',
};

function buildCbsIndexPayload() {
  const all = registry.getAll();
  const categories = (Object.keys(CATEGORY_TITLES) as FunctionCategory[]).map((category) => {
    const tagCount = registry.getByCategory(category).length;
    return {
      id: category,
      title: CATEGORY_TITLES[category],
      tagCount,
      uri: `risuai-workbench://cbs/category/${category}`,
    };
  }).filter((category) => category.tagCount > 0);

  return {
    categories,
    commonPatterns: CBS_COMMON_PATTERNS.map((pattern) => ({
      detailUri: pattern.detailUri,
      id: pattern.id,
      tags: pattern.tags,
      title: pattern.title,
    })),
    resources: {
      blocksUri: 'risuai-workbench://cbs/blocks',
      categoryTemplate: 'risuai-workbench://cbs/category/{category}',
      patternsUri: 'risuai-workbench://cbs/patterns',
      pitfallsUri: 'risuai-workbench://cbs/pitfalls',
      syntaxUri: 'risuai-workbench://cbs/syntax',
      tagTemplate: 'risuai-workbench://cbs/tag/{tagId}',
    },
    schema: 'risuai-workbench-mcp.cbs-index' as const,
    schemaVersion: '0.1.0' as const,
    syntax: {
      basic: '{{tag}} or {{tag::arg1::arg2}}',
      block: '{{#block}}...{{/block}}',
      escapeColon: '{{:}}',
      separator: '::',
    },
    tagCount: all.length,
  };
}

function jsonResource(uri: string, payload: unknown): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return { contents: [{ mimeType: 'application/json', text: JSON.stringify(payload, null, 2), uri }] };
}

function decodeCbsPath(uri: string): string | null {
  const prefix = 'risuai-workbench://cbs/';
  if (!uri.startsWith(prefix)) return null;
  return decodeURIComponent(uri.slice(prefix.length));
}

function markdownResource(uri: string, text: string): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return { contents: [{ mimeType: 'text/markdown', text, uri }] };
}

function summarizeBuiltin(builtin: ReturnType<CBSBuiltinRegistry['getAll']>[number]) {
  return {
    aliases: builtin.aliases,
    argumentCount: builtin.arguments.length,
    category: builtin.category,
    deprecated: Boolean(builtin.deprecated),
    detailUri: `risuai-workbench://cbs/tag/${builtin.name}`,
    docOnly: Boolean(builtin.docOnly),
    isBlock: builtin.isBlock,
    name: builtin.name,
    returnType: builtin.returnType,
    summary: builtin.description,
  };
}

function buildCategoryPayload(category: FunctionCategory) {
  const tags = registry.getByCategory(category).map(summarizeBuiltin);
  if (tags.length === 0) return null;
  return {
    category,
    schema: 'risuai-workbench-mcp.cbs-category' as const,
    schemaVersion: '0.1.0' as const,
    tagCount: tags.length,
    tags,
    title: CATEGORY_TITLES[category],
  };
}

function buildTagPayload(tagId: string) {
  const builtin = registry.get(tagId.toLowerCase().trim());
  if (!builtin) return null;
  const relatedTags = registry
    .getByCategory(builtin.category)
    .map((candidate) => candidate.name)
    .filter((name) => name !== builtin.name)
    .slice(0, 12);

  return {
    ...summarizeBuiltin(builtin),
    arguments: builtin.arguments.map((argument) => ({
      name: argument.name,
      required: argument.required,
      variadic: argument.variadic,
    })),
    categoryUri: `risuai-workbench://cbs/category/${builtin.category}`,
    contextual: Boolean(builtin.contextual),
    deprecatedMessage: builtin.deprecated?.message ?? null,
    replacement: builtin.deprecated?.replacement ?? null,
    relatedTags,
    schema: 'risuai-workbench-mcp.cbs-tag' as const,
    schemaVersion: '0.1.0' as const,
  };
}

export function readCbsResource(uri: string): { contents: Array<{ uri: string; mimeType: string; text: string }> } | null {
  const path = decodeCbsPath(uri);
  if (path === 'index') {
    return jsonResource(uri, buildCbsIndexPayload());
  }

  if (path?.startsWith('category/')) {
    const category = path.slice('category/'.length) as FunctionCategory;
    if (!Object.prototype.hasOwnProperty.call(CATEGORY_TITLES, category)) return null;
    const payload = buildCategoryPayload(category);
    return payload ? jsonResource(uri, payload) : null;
  }

  if (path?.startsWith('tag/')) {
    const tagId = path.slice('tag/'.length);
    const payload = buildTagPayload(tagId);
    return payload ? jsonResource(uri, payload) : null;
  }

  if (path && CBS_MARKDOWN_RESOURCES[path]) {
    return markdownResource(uri, CBS_MARKDOWN_RESOURCES[path]);
  }

  return null;
}
