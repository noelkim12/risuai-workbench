/**
 * validate_root_markers tool handler.
 * Validate .risuchar/.risumodule conflicts and schema.
 * @file packages/risuai-workbench-mcp/src/tools/validate/validate-root-markers.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export interface ValidateRootMarkersInput {
  path: string;
}

const ROOT_MARKER_FILES = ['.risuchar', '.risumodule'] as const;

/**
 * handleValidateRootMarkers 함수.
 * 루트 마커 파일 충돌과 스키마를 검증함.
 *
 * @param input - 검증할 workspace-relative 디렉토리 경로
 * @param workspace - workspace root 상태
 * @returns diagnostic envelope에 감싸진 root marker 검증 결과
 */
export async function handleValidateRootMarkers(
  input: ValidateRootMarkersInput,
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
      tool: 'workbench.validate_root_markers',
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
      tool: 'workbench.validate_root_markers',
    });
  }

  const targetDir = safeResult.absolutePath;
  const diagnostics: WorkbenchDiagnostic[] = [];

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    diagnostics.push({
      category: 'root-markers',
      id: 'TARGET_NOT_DIRECTORY',
      message: `Path "${input.path}" is not a directory or does not exist.`,
      path: input.path,
      ruleId: 'root-markers.not-directory',
      severity: 'error',
    });
    return createDiagnosticEnvelope({
      diagnostics,
      status: 'domain_error',
      tool: 'workbench.validate_root_markers',
    });
  }

  const present = new Set<string>();
  for (const marker of ROOT_MARKER_FILES) {
    const markerPath = path.join(targetDir, marker);
    if (fs.existsSync(markerPath)) {
      present.add(marker);
    }
  }

  if (present.size === 0) {
    diagnostics.push({
      category: 'root-markers',
      id: 'NO_ROOT_MARKER',
      message: `No root marker files found in "${input.path}".`,
      path: input.path,
      ruleId: 'root-markers.none-found',
      severity: 'info',
    });
  }

  if (present.has('.risuchar') && present.has('.risumodule')) {
    diagnostics.push({
      category: 'root-markers',
      id: 'CONFLICTING_ROOT_MARKERS',
      message: `Both .risuchar and .risumodule exist in "${input.path}". A directory should have only one root marker.`,
      path: input.path,
      ruleId: 'root-markers.conflict',
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
    tool: 'workbench.validate_root_markers',
  });
}
