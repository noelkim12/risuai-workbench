/**
 * CBS tag usage query tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/analyze/query-cbs-usage.ts
 */

import { CBSBuiltinRegistry } from '@risuai-workbench/core';
import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';

export interface QueryCbsUsageInput {
  readonly tag: string;
  readonly category?: string;
}

export interface QueryCbsUsageData {
  readonly found: boolean;
  readonly name: string | null;
  readonly canonicalName: string | null;
  readonly aliases: readonly string[];
  readonly arguments: readonly { name: string; required: boolean; variadic?: boolean }[];
  readonly deprecated: boolean | null;
  readonly replacement: string | null;
  readonly docOnly: boolean;
  readonly description: string | null;
  readonly category: string | null;
  readonly categoryUri: string | null;
  readonly detailUri: string | null;
  readonly relatedTags: readonly string[];
  readonly suggestions: readonly string[];
}

const registry = new CBSBuiltinRegistry();

export async function handleQueryCbsUsage(
  input: QueryCbsUsageInput,
): Promise<DiagnosticEnvelope<QueryCbsUsageData>> {
  const lookup = input.tag.toLowerCase().trim();
  const builtin = registry.get(lookup);

  if (!builtin) {
    const suggestions = registry
      .getSuggestions(lookup)
      .map((candidate) => candidate.name)
      .slice(0, 10);

    return createDiagnosticEnvelope({
      data: {
        found: false,
        name: null,
        canonicalName: null,
        aliases: [],
        arguments: [],
        deprecated: null,
        replacement: null,
        docOnly: false,
        description: null,
        category: null,
        categoryUri: null,
        detailUri: null,
        relatedTags: [],
        suggestions,
      },
      diagnostics: [],
      status: 'ok',
      tool: 'workbench.query_cbs_usage',
    });
  }

  const relatedTags = registry
    .getByCategory(builtin.category)
    .map((candidate) => candidate.name)
    .filter((name) => name !== builtin.name)
    .slice(0, 12);

  return createDiagnosticEnvelope({
    data: {
      found: true,
      name: builtin.name,
      // registry.get() already resolves aliases, so builtin.name is always the canonical name
      canonicalName: builtin.name,
      aliases: builtin.aliases ?? [],
      arguments: builtin.arguments.map((a) => ({
        name: a.name,
        required: a.required,
        variadic: a.variadic,
      })),
      deprecated: builtin.deprecated ? true : false,
      replacement: builtin.deprecated?.replacement ?? null,
      docOnly: builtin.docOnly ?? false,
      description: builtin.description ?? null,
      category: builtin.category,
      categoryUri: `risuai-workbench://cbs/category/${builtin.category}`,
      detailUri: `risuai-workbench://cbs/tag/${builtin.name}`,
      relatedTags,
      suggestions: [],
    },
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.query_cbs_usage',
  });
}
