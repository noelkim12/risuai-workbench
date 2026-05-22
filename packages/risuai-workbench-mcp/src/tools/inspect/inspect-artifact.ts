/**
 * inspect_artifact tool handler.
 * Summarize artifact root contracts, marker files, and related docs.
 * @file packages/risuai-workbench-mcp/src/tools/inspect/inspect-artifact.ts
 */

import {
  getCustomExtensionArtifactContract,
  type CustomExtensionArtifact,
} from 'risu-workbench-core';
import { discoverCustomExtensionWorkspace } from 'risu-workbench-core/node';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export interface InspectArtifactInput {
  artifactRoot: string;
}

export interface ArtifactFileInfo {
  relativePath: string;
  artifact?: CustomExtensionArtifact;
}

export interface MarkerFileInfo {
  relativePath: string;
  kind: 'order' | 'folders';
}

export interface InspectArtifactResultData {
  canonicalFiles: ArtifactFileInfo[];
  contractSummaries: Array<{
    artifact: string;
    directory: string;
    markerFiles: string[];
    stemPolicy: string;
    suffix: string;
    supportedTargets: string[];
  }>;
  markerFiles: MarkerFileInfo[];
}

/**
 * handleInspectArtifact 함수.
 * artifact root의 contract, files, markers, docs를 요약함.
 *
 * @param input - artifact root의 workspace-relative path
 * @param workspace - workspace root 상태
 * @returns diagnostic envelope에 감싸진 artifact inspect 결과
 */
export async function handleInspectArtifact(
  input: InspectArtifactInput,
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
      tool: 'workbench.inspect_artifact',
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
      tool: 'workbench.inspect_artifact',
    });
  }

  const artifactRoot = safeResult.absolutePath;
  const discovery = discoverCustomExtensionWorkspace(artifactRoot);

  const canonicalFiles: ArtifactFileInfo[] = discovery.canonicalFiles.map((f) => ({
    artifact: f.artifact,
    relativePath: f.relativePath,
  }));

  const markerFiles: MarkerFileInfo[] = discovery.markerFiles.map((f) => ({
    kind: f.kind,
    relativePath: f.relativePath,
  }));

  const detectedArtifacts = new Set<CustomExtensionArtifact>();
  for (const cf of discovery.canonicalFiles) {
    detectedArtifacts.add(cf.artifact);
  }

  const contractSummaries = [...detectedArtifacts].map((artifact) => {
    const contract = getCustomExtensionArtifactContract(artifact);
    return {
      artifact: contract.artifact,
      directory: contract.directory,
      markerFiles: [...contract.markerFiles],
      stemPolicy: contract.stemPolicy,
      suffix: contract.suffix,
      supportedTargets: [...contract.supportedTargets],
    };
  });

  return createDiagnosticEnvelope({
    data: {
      canonicalFiles,
      contractSummaries,
      markerFiles,
    },
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.inspect_artifact',
  });
}
