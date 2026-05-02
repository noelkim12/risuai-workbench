/**
 * parser/tokenizer diagnostics 정규화와 registry suggestion 보강 수집기.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/collectors/parser-diagnostic.collector.ts
 */

import type { DiagnosticInfo } from 'risu-workbench-core';

import type { DiagnosticsContext } from '../context';
import { normalizeBuiltinLookupKey, sliceRange } from '../builtin-helpers';
import { normalizeDiagnosticInfo } from '../diagnostic-info';
import {
  appendDiagnosticFixes,
  createDiagnosticFixExplanation,
  createReplacementQuickFix,
  createSuggestionQuickFix,
  type DiagnosticQuickFixSuggestion,
} from '../quick-fix';
import { DiagnosticCode } from '../taxonomy';

/**
 * collectParserDiagnostics 함수.
 * document.diagnostics를 taxonomy shape로 정규화하고 unknown builtin suggestion metadata를 보강함.
 *
 * @param context - diagnostics 실행 문맥
 * @returns parser/tokenizer 단계 diagnostics 목록
 */
export function collectParserDiagnostics(context: DiagnosticsContext): DiagnosticInfo[] {
  return context.document.diagnostics.map((diagnostic) => {
    return enrichDiagnosticMetadata(context, normalizeDiagnosticInfo(diagnostic));
  });
}

/**
 * enrichDiagnosticMetadata 함수.
 * unknown builtin diagnostic에 registry suggestion quick fix metadata를 붙임.
 *
 * @param context - registry와 source text를 제공하는 diagnostics 문맥
 * @param diagnostic - 보강할 normalized diagnostic
 * @returns quick fix metadata가 보강된 diagnostic
 */
function enrichDiagnosticMetadata(
  context: DiagnosticsContext,
  diagnostic: DiagnosticInfo,
): DiagnosticInfo {
  if (diagnostic.code !== DiagnosticCode.UnknownFunction || !context.hasSourceText) {
    return diagnostic;
  }

  const rawName = sliceRange(context.sourceText, diagnostic.range).trim();
  if (rawName.length === 0) {
    return diagnostic;
  }

  const suggestions = Array.from(
    new Map(
      context.registry
        .getSuggestions(rawName)
        .map((builtin) => [normalizeBuiltinLookupKey(builtin.name), builtin] as const),
    ).values(),
  ).map((builtin) => ({
    value: builtin.name,
    detail: builtin.description,
  }) satisfies DiagnosticQuickFixSuggestion);

  if (suggestions.length === 0) {
    return diagnostic;
  }

  if (suggestions.length === 1) {
    return appendDiagnosticFixes(diagnostic, [
      createReplacementQuickFix(
        `Replace with ${JSON.stringify(suggestions[0].value)}`,
        suggestions[0].value,
        createDiagnosticFixExplanation(
          `registry-suggestion:${normalizeBuiltinLookupKey(rawName)}:single:${normalizeBuiltinLookupKey(suggestions[0].value)}`,
          `Registry suggestions resolved a single canonical builtin replacement for the unknown name ${rawName}.`,
        ),
      ),
    ]);
  }

  return appendDiagnosticFixes(diagnostic, [
    createSuggestionQuickFix(
      'Replace with a known CBS builtin',
      suggestions,
      createDiagnosticFixExplanation(
        `registry-suggestion:${normalizeBuiltinLookupKey(rawName)}:multiple:${suggestions.length}`,
        `Registry suggestions found ${suggestions.length} viable builtin replacements for the unknown name ${rawName}.`,
      ),
    ),
  ]);
}
