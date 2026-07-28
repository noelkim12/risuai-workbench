/**
 * validate_artifact tool handler.
 * Validate full artifact root structure.
 * @file packages/risuai-workbench-mcp/src/tools/validate/validate-artifact.ts
 */

import {
  getCustomExtensionArtifactContract,
  type CustomExtensionArtifact,
} from 'risu-workbench-core';
import fs from 'node:fs';
import path from 'node:path';
import { discoverCustomExtensionWorkspace, parseRisumoduleManifest } from 'risu-workbench-core/node';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';
import { isArchiveArtifactPath } from '../artifact-input-kind';

export interface ValidateArtifactInput {
  artifactRoot: string;
}

export interface ValidateArtifactData {
  readonly allowedRootMarkers: readonly ['.risuchar', '.risumodule'];
  readonly artifactKind: 'module' | 'character' | 'canonical-directory' | 'archive';
  readonly canonicalFileCount: number;
  readonly inputKind: 'directory' | 'archive' | 'file';
  readonly markerFiles: readonly string[];
  readonly resolutionStage: 'artifact-root-kind' | 'canonical-discovery';
  readonly resolvedPath: string;
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
): Promise<DiagnosticEnvelope<ValidateArtifactData>> {
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
  const diagnostics: WorkbenchDiagnostic[] = [];

  if (!fs.statSync(artifactRoot).isDirectory()) {
    const isArchive = isArchiveArtifactPath(artifactRoot);
    diagnostics.push({
      category: 'artifact',
      id: isArchive ? 'ARCHIVE_REQUIRES_EXTRACTION' : 'ARTIFACT_ROOT_NOT_DIRECTORY',
      message: isArchive
        ? 'A .risum archive is an extraction input, not a canonical workspace root. Use core.run_extract first.'
        : `Artifact root must be a directory: ${safeResult.relativePath}.`,
      path: safeResult.relativePath,
      ruleId: isArchive ? 'artifact.archive-requires-extraction' : 'artifact.root-not-directory',
      severity: 'error',
    });
    return createDiagnosticEnvelope({
      data: {
        allowedRootMarkers: ['.risuchar', '.risumodule'],
        artifactKind: isArchive ? 'archive' : 'canonical-directory',
        canonicalFileCount: 0,
        inputKind: isArchive ? 'archive' : 'file',
        markerFiles: [],
        resolutionStage: 'artifact-root-kind',
        resolvedPath: artifactRoot,
      },
      diagnostics,
      status: 'domain_error',
      tool: 'workbench.validate_artifact',
    });
  }

  const moduleMarkerPath = path.join(artifactRoot, '.risumodule');
  const characterMarkerPath = path.join(artifactRoot, '.risuchar');
  const hasModuleMarker = fs.existsSync(moduleMarkerPath);
  const hasCharacterMarker = fs.existsSync(characterMarkerPath);
  const markerFiles = [
    ...(hasModuleMarker ? ['.risumodule'] : []),
    ...(hasCharacterMarker ? ['.risuchar'] : []),
  ];

  if (hasModuleMarker && hasCharacterMarker) {
    diagnostics.push({
      category: 'artifact',
      id: 'CONFLICTING_ROOT_MARKERS',
      message: 'A canonical workspace root cannot contain both .risumodule and .risuchar.',
      path: safeResult.relativePath,
      ruleId: 'artifact.conflicting-root-markers',
      severity: 'error',
    });
  }

  if (hasModuleMarker) {
    try {
      parseRisumoduleManifest(fs.readFileSync(moduleMarkerPath, 'utf8'), moduleMarkerPath);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      diagnostics.push({
        category: 'artifact',
        id: 'INVALID_RISUMODULE_MARKER',
        message: error.message,
        path: path.join(input.artifactRoot, '.risumodule'),
        ruleId: 'artifact.invalid-risumodule-marker',
        severity: 'error',
      });
    }
  }

  const discovery = discoverCustomExtensionWorkspace(artifactRoot);

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
    data: {
      allowedRootMarkers: ['.risuchar', '.risumodule'],
      artifactKind: hasModuleMarker
        ? 'module'
        : hasCharacterMarker
          ? 'character'
          : 'canonical-directory',
      canonicalFileCount: discovery.canonicalFiles.length,
      inputKind: 'directory',
      markerFiles,
      resolutionStage: 'canonical-discovery',
      resolvedPath: artifactRoot,
    },
    diagnostics,
    status,
    tool: 'workbench.validate_artifact',
  });
}
