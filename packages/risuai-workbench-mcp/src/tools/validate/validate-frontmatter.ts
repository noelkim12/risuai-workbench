/**
 * validate_frontmatter tool handler.
 * Validate frontmatter delimiter, field schema, and round-trip risk.
 * @file packages/risuai-workbench-mcp/src/tools/validate/validate-frontmatter.ts
 */

import fs from 'node:fs';

import { parseEditorFrontmatter, type EditorDocumentWarning } from 'risu-workbench-core';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export interface ValidateFrontmatterInput {
  path: string;
}

/**
 * handleValidateFrontmatter 함수.
 * YAML frontmatter delimiter/field/round-trip 위험을 검증함.
 *
 * @param input - 검증할 파일의 workspace-relative path
 * @param workspace - workspace root 상태
 * @returns diagnostic envelope에 감싸진 frontmatter 검증 결과
 */
export async function handleValidateFrontmatter(
  input: ValidateFrontmatterInput,
  workspace: WorkspaceRootStatus,
): Promise<DiagnosticEnvelope> {
  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [
        {
          category: 'workspace',
          id: 'WORKSPACE_ROOT_UNAVAILABLE',
          message: `Workspace root is unavailable: ${workspace.reason}`,
          path: input.path,
          ruleId: 'workspace.root-unavailable',
          severity: 'error',
        },
      ],
      status: 'domain_error',
      tool: 'workbench.validate_frontmatter',
    });
  }

  const safeResult = await resolveSafeWorkspacePath({
    inputPath: input.path,
    intent: 'read-existing',
    workspace,
  });

  if (!safeResult.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [
        {
          category: 'path',
          id: 'PATH_RESOLVE_FAILED',
          message: `Path resolution failed: ${safeResult.reason}`,
          path: input.path,
          ruleId: `path.${safeResult.reason}`,
          severity: 'error',
        },
      ],
      status: 'domain_error',
      tool: 'workbench.validate_frontmatter',
    });
  }

  const absolutePath = safeResult.absolutePath;
  const diagnostics: WorkbenchDiagnostic[] = [];

  if (!fs.existsSync(absolutePath)) {
    diagnostics.push({
      category: 'frontmatter',
      id: 'FILE_MISSING',
      message: `File "${input.path}" does not exist.`,
      path: input.path,
      ruleId: 'frontmatter.file-missing',
      severity: 'error',
    });
    return createDiagnosticEnvelope({
      diagnostics,
      status: 'domain_error',
      tool: 'workbench.validate_frontmatter',
    });
  }

  const source = fs.readFileSync(absolutePath, 'utf-8');
  const warnings: EditorDocumentWarning[] = [];
  const block = parseEditorFrontmatter(source, warnings);

  if (block === null) {
    for (const w of warnings) {
      diagnostics.push({
        category: 'frontmatter',
        id: w.code === 'missing-frontmatter' ? 'FRONTMATTER_MISSING' : 'FRONTMATTER_MALFORMED',
        message: w.message,
        path: input.path,
        ruleId: `frontmatter.${w.code}`,
        severity: w.severity as 'error' | 'warning' | 'info',
      });
    }
    const status = diagnostics.some((d) => d.severity === 'error') ? 'domain_error' : 'domain_warning';
    return createDiagnosticEnvelope({
      diagnostics,
      status,
      tool: 'workbench.validate_frontmatter',
    });
  }

  for (const w of warnings) {
    diagnostics.push({
      category: 'frontmatter',
      id: 'FRONTMATTER_FIELD_WARNING',
      message: w.message,
      path: input.path,
      ruleId: `frontmatter.${w.code}`,
      severity: w.severity as 'error' | 'warning' | 'info',
    });
  }

  if (block.unknownFields.length > 0) {
    diagnostics.push({
      category: 'frontmatter',
      id: 'FRONTMATTER_UNKNOWN_FIELDS',
      message: `Frontmatter contains unknown fields: ${block.unknownFields.map((f) => f.key).join(', ')}. These may be lost during round-trip.`,
      path: input.path,
      ruleId: 'frontmatter.unknown-fields',
      severity: 'warning',
    });
  }

  const roundTripRisk = !source.startsWith('---\n') && source.startsWith('---\r\n');
  if (roundTripRisk) {
    diagnostics.push({
      category: 'frontmatter',
      id: 'FRONTMATTER_CRLF_RISK',
      message: 'Frontmatter uses CRLF line endings which may affect round-trip fidelity.',
      path: input.path,
      ruleId: 'frontmatter.crlf-risk',
      severity: 'info',
    });
  }

  const status = diagnostics.some((d) => d.severity === 'error')
    ? 'domain_error'
    : diagnostics.some((d) => d.severity === 'warning')
      ? 'domain_warning'
      : 'ok';

  return createDiagnosticEnvelope({
    diagnostics,
    status,
    tool: 'workbench.validate_frontmatter',
  });
}
