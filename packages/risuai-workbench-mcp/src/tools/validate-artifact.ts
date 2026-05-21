/**
 * validate_artifact tool handler.
 * Validate full artifact root structure.
 * @file packages/risuai-workbench-mcp/src/tools/validate-artifact.ts
 */

import {
  getCustomExtensionArtifactContract,
  type CustomExtensionArtifact,
} from 'risu-workbench-core';
import { discoverCustomExtensionWorkspace } from 'risu-workbench-core/node';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../project/resolve-root';
import { resolveSafeWorkspacePath } from '../project/safe-path';

export interface ValidateArtifactInput {
  artifactRoot: string;
}

/**
 * handleValidateArtifact 함수.
 * artifact root 전체 구조를 검증함.
 *
 * @param input - artifact root의 workspace-relative path
 * @param workspace - workspace root 상태
 * @returns diagnostic envelope에 감싸진 artifact 검증 결과
 */
export async function handleValidateArtifact(
  input: ValidateArtifactInput,
  workspace: WorkspaceRootStatus,
): Promise<DiagnosticEnvelope> {
  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [
        {
          category: 'workspace',
          id: 'WORKSPACE_ROOT_UNAVAILABLE',
          message: `Workspace root is unavailable: ${workspace.reason}`,
          path: input.artifactRoot,
          ruleId: 'workspace.root-unavailable',
          severity: 'error',
        },
      ],
      status: 'domain_error',
      tool: 'workbench.validate_artifact',
    });
  }

  const safeResult = await resolveSafeWorkspacePath({
    inputPath: input.artifactRoot,
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
          path: input.artifactRoot,
          ruleId: `path.${safeResult.reason}`,
          severity: 'error',
        },
      ],
      status: 'domain_error',
      tool: 'workbench.validate_artifact',
    });
  }

  const artifactRoot = safeResult.absolutePath;
  const discovery = discoverCustomExtensionWorkspace(artifactRoot);
  const diagnostics: WorkbenchDiagnostic[] = [];

  const artifacts = new Set<CustomExtensionArtifact>();
  for (const cf of discovery.canonicalFiles) {
    artifacts.add(cf.artifact);
  }

  for (const artifact of artifacts) {
    const contract = getCustomExtensionArtifactContract(artifact);
    for (const markerKind of contract.markerFiles) {
      const hasMarker = discovery.markerFiles.some((m) => m.kind === markerKind);
      if (!hasMarker) {
        diagnostics.push({
          category: 'artifact',
          id: 'MISSING_MARKER_FILE',
          message: `Missing expected marker file ${markerKind} for artifact ${artifact}.`,
          path: `${input.artifactRoot}/${contract.directory}`,
          ruleId: 'artifact.missing-marker',
          severity: 'warning',
        });
      }
    }
  }

  const status = diagnostics.some((d) => d.severity === 'error')
    ? 'domain_error'
    : diagnostics.some((d) => d.severity === 'warning')
      ? 'domain_warning'
      : 'ok';

  return createDiagnosticEnvelope({
    diagnostics,
    status,
    tool: 'workbench.validate_artifact',
  });
}
