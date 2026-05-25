/**
 * RisuLua reference resource provider.
 * Serves LUA_FOR_LLM.md-oriented host function knowledge as MCP resources.
 * @file packages/risuai-workbench-mcp/src/resources/risulua-reference.ts
 */

import {
  RISUAI_API,
  getRisuAiLuaRuntimeDocumentation,
  getRisuAiLuaRuntimeSignatures,
  type ApiMeta,
} from 'risu-workbench-core';

import {
  RISULUA_ACCESS_TIERS_MARKDOWN,
  RISULUA_ASYNC_MARKDOWN,
  RISULUA_COMMON_PATTERNS,
  RISULUA_LIFECYCLE_MARKDOWN,
  RISULUA_PATTERNS_MARKDOWN,
  RISULUA_PITFALLS_MARKDOWN,
} from './risulua-index-data';

const RISULUA_MARKDOWN_RESOURCES: Record<string, string> = {
  'access-tiers': RISULUA_ACCESS_TIERS_MARKDOWN,
  async: RISULUA_ASYNC_MARKDOWN,
  lifecycle: RISULUA_LIFECYCLE_MARKDOWN,
  patterns: RISULUA_PATTERNS_MARKDOWN,
  pitfalls: RISULUA_PITFALLS_MARKDOWN,
};

const CATEGORY_TITLES: Record<string, string> = {
  ai: 'AI and model calls',
  character: 'Character and persona data',
  chat: 'Chat read/write',
  control: 'Control flow',
  event: 'Lifecycle and edit events',
  lore: 'Lorebook access',
  network: 'Network access',
  state: 'Variables and state',
  ui: 'UI and alerts',
  utility: 'Utilities',
};

const documentationByName = getRisuAiLuaRuntimeDocumentation();
const signaturesByName = getRisuAiLuaRuntimeSignatures();

type RisuLuaResourceResult = { contents: Array<{ uri: string; mimeType: string; text: string }> };

function jsonResource(uri: string, payload: unknown): RisuLuaResourceResult {
  return { contents: [{ mimeType: 'application/json', text: JSON.stringify(payload, null, 2), uri }] };
}

function markdownResource(uri: string, text: string): RisuLuaResourceResult {
  return { contents: [{ mimeType: 'text/markdown', text, uri }] };
}

function decodeRisuLuaPath(uri: string): string | null {
  const prefix = 'risuai-workbench://risulua/';
  if (!uri.startsWith(prefix)) return null;
  return decodeURIComponent(uri.slice(prefix.length));
}

function allRuntimeNames(): string[] {
  return Array.from(new Set([...Object.keys(RISUAI_API), ...documentationByName.keys(), ...signaturesByName.keys()]))
    .sort((left, right) => left.localeCompare(right));
}

function apiMetaFor(name: string): ApiMeta | null {
  return RISUAI_API[name] ?? null;
}

function buildIndexPayload() {
  const runtimeNames = allRuntimeNames();
  const categoryIds = Object.keys(CATEGORY_TITLES).sort((left, right) => left.localeCompare(right));
  const categories = categoryIds
    .map((category) => ({
      functionCount: runtimeNames.filter((name) => apiMetaFor(name)?.cat === category).length,
      id: category,
      title: CATEGORY_TITLES[category],
      uri: `risuai-workbench://risulua/category/${category}`,
    }))
    .filter((category) => category.functionCount > 0);

  return {
    categories,
    commonPatterns: RISULUA_COMMON_PATTERNS.map((pattern) => ({
      detailUri: pattern.detailUri,
      functions: pattern.functions,
      id: pattern.id,
      title: pattern.title,
    })),
    functionCount: runtimeNames.length,
    resources: {
      accessTiersUri: 'risuai-workbench://risulua/access-tiers',
      asyncUri: 'risuai-workbench://risulua/async',
      categoryTemplate: 'risuai-workbench://risulua/category/{category}',
      functionTemplate: 'risuai-workbench://risulua/function/{name}',
      lifecycleUri: 'risuai-workbench://risulua/lifecycle',
      patternsUri: 'risuai-workbench://risulua/patterns',
      pitfallsUri: 'risuai-workbench://risulua/pitfalls',
    },
    schema: 'risuai-workbench-mcp.risulua-index' as const,
    schemaVersion: '0.1.0' as const,
  };
}

function summarizeFunction(name: string) {
  const meta = apiMetaFor(name);
  const documentation = documentationByName.get(name);
  return {
    access: meta?.access ?? null,
    category: meta?.cat ?? null,
    detailUri: `risuai-workbench://risulua/function/${encodeURIComponent(name)}`,
    name,
    readWrite: meta?.rw ?? null,
    summary: documentation?.summary ?? `RisuAI runtime global ${name}입니다.`,
  };
}

function buildCategoryPayload(category: string) {
  if (!Object.prototype.hasOwnProperty.call(CATEGORY_TITLES, category)) return null;
  const functions = allRuntimeNames()
    .filter((name) => apiMetaFor(name)?.cat === category)
    .map(summarizeFunction);
  if (functions.length === 0) return null;
  return {
    category,
    functionCount: functions.length,
    functions,
    schema: 'risuai-workbench-mcp.risulua-category' as const,
    schemaVersion: '0.1.0' as const,
    title: CATEGORY_TITLES[category],
  };
}

function buildFunctionPayload(name: string) {
  const runtimeName = allRuntimeNames().find((candidate) => candidate.toLowerCase() === name.toLowerCase().trim());
  if (!runtimeName) return null;
  const meta = apiMetaFor(runtimeName);
  const documentation = documentationByName.get(runtimeName) ?? null;
  const relatedFunctions = meta
    ? allRuntimeNames().filter((candidate) => candidate !== runtimeName && apiMetaFor(candidate)?.cat === meta.cat).slice(0, 12)
    : [];
  return {
    ...summarizeFunction(runtimeName),
    categoryUri: meta ? `risuai-workbench://risulua/category/${meta.cat}` : null,
    documentation,
    relatedFunctions,
    schema: 'risuai-workbench-mcp.risulua-function' as const,
    schemaVersion: '0.1.0' as const,
    signature: signaturesByName.get(runtimeName) ?? null,
  };
}

export function readRisuLuaResource(uri: string): RisuLuaResourceResult | null {
  const path = decodeRisuLuaPath(uri);
  if (path === 'index') {
    return jsonResource(uri, buildIndexPayload());
  }

  if (path?.startsWith('category/')) {
    const category = path.slice('category/'.length);
    const payload = buildCategoryPayload(category);
    return payload ? jsonResource(uri, payload) : null;
  }

  if (path?.startsWith('function/')) {
    const name = path.slice('function/'.length);
    const payload = buildFunctionPayload(name);
    return payload ? jsonResource(uri, payload) : null;
  }

  if (path && RISULUA_MARKDOWN_RESOURCES[path]) {
    return markdownResource(uri, RISULUA_MARKDOWN_RESOURCES[path]);
  }

  return null;
}
