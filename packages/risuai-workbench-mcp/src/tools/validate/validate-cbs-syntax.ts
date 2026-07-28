/**
 * CBS syntax validation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/validate/validate-cbs-syntax.ts
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { CBSParser, CBSBuiltinRegistry } from '@risuai-workbench/core';
import { DiagnosticsEngine } from '@risuai-workbench/cbs-language-server/analyzer/diagnostics';
import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';
import type { DiagnosticInfo } from '@risuai-workbench/core';

export interface ValidateCbsSyntaxInput {
  readonly path?: string;
  readonly sourcePath?: string;
  readonly sourceText?: string;
}

export interface ValidateCbsSyntaxData {
  /** CBS diagnostics from the LSP engine, preserved for range-aware consumers. */
  readonly diagnostics: readonly DiagnosticInfo[];
  readonly parsed: boolean;
  readonly sourceHash: string;
  readonly sourceMode: 'inline' | 'workspace-file';
  readonly sourcePath: string | null;
  readonly tagCount: number;
  readonly unknownTags: readonly string[];
}

const parser = new CBSParser();
const registry = new CBSBuiltinRegistry();
const engine = new DiagnosticsEngine(registry);

export async function handleValidateCbsSyntax(
  input: ValidateCbsSyntaxInput,
  workspace?: WorkspaceRootStatus,
): Promise<DiagnosticEnvelope<ValidateCbsSyntaxData>> {
  const hasSourcePath = input.sourcePath !== undefined;
  const hasSourceText = input.sourceText !== undefined;
  if (hasSourcePath === hasSourceText) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'input',
        id: 'CBS_SOURCE_INPUT_INVALID',
        message: 'Provide exactly one of sourcePath or sourceText.',
        path: input.path ?? input.sourcePath ?? null,
        ruleId: 'cbs.source-input',
        severity: 'error',
      }],
      status: 'domain_error',
      tool: 'workbench.validate_cbs_syntax',
    });
  }

  let sourceText: string;
  let sourcePath: string | null;
  let sourceMode: ValidateCbsSyntaxData['sourceMode'];
  let sourceHash: string;
  if (input.sourcePath !== undefined) {
    if (!workspace?.ok || path.isAbsolute(input.sourcePath)) {
      return createDiagnosticEnvelope({
        diagnostics: [{
          category: 'path',
          id: 'CBS_SOURCE_PATH_INVALID',
          message: 'sourcePath must be a workspace-relative existing file.',
          path: input.sourcePath,
          ruleId: 'cbs.source-path',
          severity: 'error',
        }],
        status: 'domain_error',
        tool: 'workbench.validate_cbs_syntax',
      });
    }
    const resolved = await resolveSafeWorkspacePath({
      inputPath: input.sourcePath,
      intent: 'read-existing',
      workspace,
    });
    if (!resolved.ok || path.isAbsolute(resolved.relativePath) || resolved.relativePath.startsWith('..')) {
      return createDiagnosticEnvelope({
        diagnostics: [{
          category: 'path',
          id: 'CBS_SOURCE_PATH_INVALID',
          message: `Could not resolve workspace-relative sourcePath: ${input.sourcePath}.`,
          path: input.sourcePath,
          ruleId: 'cbs.source-path',
          severity: 'error',
        }],
        status: 'domain_error',
        tool: 'workbench.validate_cbs_syntax',
      });
    }
    let sourceBytes: Buffer;
    try {
      const sourceStat = await stat(resolved.absolutePath);
      if (!sourceStat.isFile()) {
        return createDiagnosticEnvelope({
          diagnostics: [{
            category: 'path',
            id: 'CBS_SOURCE_READ_FAILED',
            message: `sourcePath is not a readable file: ${input.sourcePath}.`,
            path: input.sourcePath,
            ruleId: 'cbs.source-read',
            severity: 'error',
          }],
          status: 'domain_error',
          tool: 'workbench.validate_cbs_syntax',
        });
      }
      sourceBytes = await readFile(resolved.absolutePath);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return createDiagnosticEnvelope({
        diagnostics: [{
          category: 'path',
          id: 'CBS_SOURCE_READ_FAILED',
          message: `Could not read sourcePath ${input.sourcePath}: ${error.message}`,
          path: input.sourcePath,
          ruleId: 'cbs.source-read',
          severity: 'error',
        }],
        status: 'domain_error',
        tool: 'workbench.validate_cbs_syntax',
      });
    }
    sourceText = sourceBytes.toString('utf8');
    sourcePath = resolved.relativePath;
    sourceMode = 'workspace-file';
    sourceHash = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  } else {
    sourceText = input.sourceText ?? '';
    sourcePath = input.path ?? null;
    sourceMode = 'inline';
    sourceHash = `sha256:${createHash('sha256').update(sourceText).digest('hex')}`;
  }

  if (sourceText.length === 0) {
    return createDiagnosticEnvelope({
      data: { diagnostics: [], parsed: true, sourceHash, sourceMode, sourcePath, tagCount: 0, unknownTags: [] },
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
    path: sourcePath,
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
      sourceHash,
      sourceMode,
      sourcePath,
      tagCount: document.nodes.filter((n) => n.type !== 'PlainText').length,
      unknownTags,
    },
    diagnostics: envelopeDiagnostics,
    status,
    tool: 'workbench.validate_cbs_syntax',
  });
}
