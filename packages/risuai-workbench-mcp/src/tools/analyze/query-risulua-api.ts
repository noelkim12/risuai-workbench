/**
 * RisuLua host function/API query tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/analyze/query-risulua-api.ts
 */

import {
  RISUAI_API,
  getRisuAiLuaRuntimeDocumentation,
  getRisuAiLuaRuntimeSignatures,
} from 'risu-workbench-core';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';

export interface QueryRisuLuaApiInput {
  readonly symbol: string;
  readonly category?: string;
}

export interface QueryRisuLuaApiData {
  readonly found: boolean;
  readonly symbol: string;
  readonly name: string | null;
  readonly category: string | null;
  readonly access: string | null;
  readonly readWrite: 'read' | 'write' | null;
  readonly signature: string | null;
  readonly documentation: unknown | null;
  readonly detailUri: string | null;
  readonly categoryUri: string | null;
  readonly relatedFunctions: readonly string[];
  readonly suggestions: readonly string[];
  readonly referenceUris: readonly string[];
}

const documentationByName = getRisuAiLuaRuntimeDocumentation();
const signaturesByName = getRisuAiLuaRuntimeSignatures();

function runtimeNames(): string[] {
  return Array.from(new Set([...Object.keys(RISUAI_API), ...documentationByName.keys(), ...signaturesByName.keys()]))
    .sort((left, right) => left.localeCompare(right));
}

function findRuntimeName(symbol: string): string | null {
  const normalized = symbol.toLowerCase().trim();
  return runtimeNames().find((name) => name.toLowerCase() === normalized) ?? null;
}

function sharedPrefixLength(left: string, right: string): number {
  let count = 0;
  while (count < left.length && count < right.length && left[count] === right[count]) {
    count += 1;
  }
  return count;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}

function suggestionsFor(symbol: string, category?: string): string[] {
  const normalized = symbol.toLowerCase().trim();
  const pool = runtimeNames().filter((name) => {
    if (!category) return true;
    return RISUAI_API[name]?.cat === category;
  });

  return pool
    .map((name) => {
      const candidate = name.toLowerCase();
      const distance = editDistance(candidate, normalized);
      const score = candidate.includes(normalized) || normalized.includes(candidate)
        ? 100
        : Math.max(sharedPrefixLength(candidate, normalized), distance <= 3 ? 10 - distance : 0);
      return { name, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .map((candidate) => candidate.name)
    .slice(0, 10);
}

export async function handleQueryRisuLuaApi(
  input: QueryRisuLuaApiInput,
): Promise<DiagnosticEnvelope<QueryRisuLuaApiData>> {
  const symbol = input.symbol.trim();
  const runtimeName = findRuntimeName(symbol);

  if (!runtimeName) {
    return createDiagnosticEnvelope({
      data: {
        access: null,
        category: null,
        categoryUri: null,
        detailUri: null,
        documentation: null,
        found: false,
        name: null,
        readWrite: null,
        referenceUris: ['risuai-workbench://risulua/index'],
        relatedFunctions: [],
        signature: null,
        suggestions: suggestionsFor(symbol, input.category),
        symbol,
      },
      diagnostics: [],
      status: 'ok',
      tool: 'workbench.query_risulua_api',
    });
  }

  const meta = RISUAI_API[runtimeName] ?? null;
  const relatedFunctions = meta
    ? runtimeNames().filter((name) => name !== runtimeName && RISUAI_API[name]?.cat === meta.cat).slice(0, 12)
    : [];
  const categoryUri = meta ? `risuai-workbench://risulua/category/${meta.cat}` : null;
  const detailUri = `risuai-workbench://risulua/function/${encodeURIComponent(runtimeName)}`;

  return createDiagnosticEnvelope({
    data: {
      access: meta?.access ?? null,
      category: meta?.cat ?? null,
      categoryUri,
      detailUri,
      documentation: documentationByName.get(runtimeName) ?? null,
      found: true,
      name: runtimeName,
      readWrite: meta?.rw ?? null,
      referenceUris: [
        detailUri,
        categoryUri,
        'risuai-workbench://risulua/lifecycle',
        'risuai-workbench://risulua/access-tiers',
      ].filter((uri): uri is string => Boolean(uri)),
      relatedFunctions,
      signature: signaturesByName.get(runtimeName) ?? null,
      suggestions: [],
      symbol,
    },
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.query_risulua_api',
  });
}
