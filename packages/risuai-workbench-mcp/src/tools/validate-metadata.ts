/**
 * validate_metadata tool handler.
 * Validate structured metadata owner and legacy/deferred surface.
 * @file packages/risuai-workbench-mcp/src/tools/validate-metadata.ts
 */

import fs from 'node:fs';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../project/resolve-root';
import { resolveSafeWorkspacePath } from '../project/safe-path';

export interface ValidateMetadataInput {
  path: string;
}

/**
 * handleValidateMetadata 함수.
 * structured metadata owner와 legacy/deferred surface를 판정함.
 *
 * @param input - 검증할 metadata JSON 파일의 workspace-relative path
 * @param workspace - workspace root 상태
 * @returns diagnostic envelope에 감싸진 metadata 검증 결과
 */
export async function handleValidateMetadata(
  input: ValidateMetadataInput,
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
      tool: 'workbench.validate_metadata',
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
      tool: 'workbench.validate_metadata',
    });
  }

  const absolutePath = safeResult.absolutePath;
  const diagnostics: WorkbenchDiagnostic[] = [];

  if (!fs.existsSync(absolutePath)) {
    diagnostics.push({
      category: 'metadata',
      id: 'METADATA_FILE_MISSING',
      message: `Metadata file "${input.path}" does not exist.`,
      path: input.path,
      ruleId: 'metadata.missing',
      severity: 'error',
    });
    return createDiagnosticEnvelope({
      diagnostics,
      status: 'domain_error',
      tool: 'workbench.validate_metadata',
    });
  }

  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf-8');
  } catch {
    diagnostics.push({
      category: 'metadata',
      id: 'METADATA_READ_FAILED',
      message: `Cannot read metadata file "${input.path}".`,
      path: input.path,
      ruleId: 'metadata.read-failed',
      severity: 'error',
    });
    return createDiagnosticEnvelope({
      diagnostics,
      status: 'domain_error',
      tool: 'workbench.validate_metadata',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    diagnostics.push({
      category: 'metadata',
      id: 'METADATA_MALFORMED_JSON',
      message: `Metadata file "${input.path}" contains malformed JSON.`,
      path: input.path,
      ruleId: 'metadata.malformed-json',
      severity: 'error',
    });
    return createDiagnosticEnvelope({
      diagnostics,
      status: 'domain_error',
      tool: 'workbench.validate_metadata',
    });
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    diagnostics.push({
      category: 'metadata',
      id: 'METADATA_NOT_OBJECT',
      message: `Metadata file "${input.path}" does not contain a JSON object.`,
      path: input.path,
      ruleId: 'metadata.not-object',
      severity: 'error',
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
    tool: 'workbench.validate_metadata',
  });
}
