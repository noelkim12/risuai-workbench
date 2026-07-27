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
import fs from 'node:fs';
import path from 'node:path';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';
import { isArchiveArtifactPath } from '../artifact-input-kind';

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
  allowedRootMarkers: readonly ['.risuchar', '.risumodule'];
  artifactKind: 'module' | 'character' | 'canonical-directory' | 'archive';
  canonicalFiles: ArtifactFileInfo[];
  contractSummaries: Array<{
    artifact: string;
    directory: string;
    markerFiles: string[];
    stemPolicy: string;
    suffix: string;
    supportedTargets: string[];
  }>;
  inputKind: 'directory' | 'archive' | 'file';
  markerFiles: MarkerFileInfo[];
  resolutionStage: 'artifact-root-kind' | 'canonical-discovery';
  resolvedPath: string;
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
): Promise<DiagnosticEnvelope<InspectArtifactResultData>> {
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
  if (!fs.statSync(artifactRoot).isDirectory()) {
    const isArchive = isArchiveArtifactPath(artifactRoot);
    return createDiagnosticEnvelope({
      data: {
        allowedRootMarkers: ['.risuchar', '.risumodule'],
        artifactKind: isArchive ? 'archive' : 'canonical-directory',
        canonicalFiles: [],
        contractSummaries: [],
        inputKind: isArchive ? 'archive' : 'file',
        markerFiles: [],
        resolutionStage: 'artifact-root-kind',
        resolvedPath: artifactRoot,
      },
      diagnostics: [{
        category: 'artifact',
        id: isArchive ? 'ARCHIVE_REQUIRES_EXTRACTION' : 'ARTIFACT_ROOT_NOT_DIRECTORY',
        message: isArchive
          ? 'A .risum archive is an extraction input, not a canonical workspace root. Use core.run_extract first.'
          : `Artifact root must be a directory: ${safeResult.relativePath}.`,
        path: safeResult.relativePath,
        ruleId: isArchive ? 'artifact.archive-requires-extraction' : 'artifact.root-not-directory',
        severity: 'error',
      }],
      status: 'domain_error',
      tool: 'workbench.inspect_artifact',
    });
  }

  const discovery = discoverCustomExtensionWorkspace(artifactRoot);
  const hasModuleMarker = fs.existsSync(path.join(artifactRoot, '.risumodule'));
  const hasCharacterMarker = fs.existsSync(path.join(artifactRoot, '.risuchar'));

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
      allowedRootMarkers: ['.risuchar', '.risumodule'],
      artifactKind: hasModuleMarker
        ? 'module'
        : hasCharacterMarker
          ? 'character'
          : 'canonical-directory',
      canonicalFiles,
      contractSummaries,
      inputKind: 'directory',
      markerFiles,
      resolutionStage: 'canonical-discovery',
      resolvedPath: artifactRoot,
    },
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.inspect_artifact',
  });
}
