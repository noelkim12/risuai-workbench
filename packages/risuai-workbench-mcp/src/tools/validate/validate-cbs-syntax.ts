/**
 * CBS syntax validation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/validate/validate-cbs-syntax.ts
 */

import { CBSParser, CBSBuiltinRegistry } from 'risu-workbench-core';
import { DiagnosticsEngine } from 'cbs-language-server/analyzer/diagnostics';
import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { DiagnosticInfo } from 'risu-workbench-core';

export interface ValidateCbsSyntaxInput {
  readonly sourceText: string;
  readonly path?: string;
}

export interface ValidateCbsSyntaxData {
  /** CBS diagnostics from the LSP engine, preserved for range-aware consumers. */
  readonly diagnostics: readonly DiagnosticInfo[];
  readonly parsed: boolean;
  readonly tagCount: number;
  readonly unknownTags: readonly string[];
}

const parser = new CBSParser();
const registry = new CBSBuiltinRegistry();
const engine = new DiagnosticsEngine(registry);

export async function handleValidateCbsSyntax(
  input: ValidateCbsSyntaxInput,
): Promise<DiagnosticEnvelope<ValidateCbsSyntaxData>> {
  const sourceText = input.sourceText ?? '';

  if (sourceText.length === 0) {
    return createDiagnosticEnvelope({
      data: { diagnostics: [], parsed: true, tagCount: 0, unknownTags: [] },
      diagnostics: [],
      status: 'ok',
      tool: 'workbench.validate_cbs_syntax',
    });
  }

  const document = parser.parse(sourceText);
  const diagnostics = engine.analyze(document, sourceText);
  const envelopeDiagnostics = diagnostics.map((diagnostic) => ({
    category: 'cbs',
    id: diagnostic.code,
    message: diagnostic.message,
    path: input.path ?? null,
    ruleId: diagnostic.code,
    severity: diagnostic.severity,
  }));
  const status = envelopeDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
    ? 'domain_error'
    : envelopeDiagnostics.length > 0
      ? 'domain_warning'
      : 'ok';

  const unknownTags = diagnostics
    .filter((d) => d.code === 'CBS003')
    .map((d) => d.message.match(/unknown\s+tag\s+`?([^`\s]+)`?/i)?.[1] ?? '')
    .filter(Boolean);

  return createDiagnosticEnvelope({
    data: {
      diagnostics,
      parsed: document.diagnostics.length === 0 || !document.diagnostics.some((d) => d.severity === 'error'),
      tagCount: document.nodes.filter((n) => n.type !== 'PlainText').length,
      unknownTags,
    },
    diagnostics: envelopeDiagnostics,
    status,
    tool: 'workbench.validate_cbs_syntax',
  });
}
