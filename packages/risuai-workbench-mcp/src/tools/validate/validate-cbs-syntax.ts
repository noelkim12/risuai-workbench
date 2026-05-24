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
  /**
   * CBS diagnostics from the LSP engine (DiagnosticInfo shape).
   * Note: These are placed inside `data.diagnostics`, not the envelope-level
   * `diagnostics` field, because DiagnosticInfo and WorkbenchDiagnostic have
   * different shapes (e.g., `code` vs `id`). Consumers must read from
   * `result.data.diagnostics`, not `result.diagnostics`.
   */
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
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.validate_cbs_syntax',
  });
}
