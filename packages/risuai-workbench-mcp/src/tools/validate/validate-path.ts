/**
 * validate_path tool handler.
 * Validate canonical directory, suffix, and stem policy.
 * @file packages/risuai-workbench-mcp/src/tools/validate/validate-path.ts
 */

import path from 'node:path';

import {
  CUSTOM_EXTENSION_ARTIFACT_CONTRACTS,
  parseCustomExtensionArtifactFromSuffix,
  type CustomExtensionArtifact,
} from '@risuai-workbench/core';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import { resolveSafeWorkspacePath } from '../../project/safe-path';
import type { WorkspaceRootStatus } from '../../project/resolve-root';

export interface ValidatePathInput {
  path: string;
}

/**
 * handleValidatePath 함수.
 * canonical directory, suffix, stem policy를 검증함.
 *
 * @param input - 검증할 workspace-relative path
 * @param workspace - workspace root 상태
 * @returns diagnostic envelope에 감싸진 path 검증 결과
 */
export async function handleValidatePath(
  input: ValidatePathInput,
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
      tool: 'workbench.validate_path',
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
      tool: 'workbench.validate_path',
    });
  }

  const diagnostics: WorkbenchDiagnostic[] = [];
  const relativePath = safeResult.relativePath;
  const ext = path.extname(relativePath).toLowerCase();

  if (!ext.startsWith('.risu')) {
    diagnostics.push({
      category: 'path',
      id: 'PATH_NOT_CANONICAL_SUFFIX',
      message: `File "${relativePath}" does not have a canonical .risu* extension.`,
      path: relativePath,
      ruleId: 'path.not-canonical-suffix',
      severity: 'warning',
    });
  } else {
    let artifact: CustomExtensionArtifact;
    try {
      artifact = parseCustomExtensionArtifactFromSuffix(ext);
    } catch {
      diagnostics.push({
        category: 'path',
        id: 'PATH_UNKNOWN_SUFFIX',
        message: `File extension "${ext}" is not a recognized canonical artifact suffix.`,
        path: relativePath,
        ruleId: 'path.unknown-suffix',
        severity: 'error',
      });
      return createDiagnosticEnvelope({
        diagnostics,
        status: 'domain_error',
        tool: 'workbench.validate_path',
      });
    }

    const contract = CUSTOM_EXTENSION_ARTIFACT_CONTRACTS[artifact];
    const dirName = path.dirname(relativePath);
    const expectedDir = contract.directory;

    const portableDir = dirName.split(path.sep).join('/');
    const portableExpectedDir = expectedDir.split(path.sep).join('/');
    const isInsideExpectedDirectory = portableDir === portableExpectedDir
      || portableDir.startsWith(`${portableExpectedDir}/`)
      || portableDir.includes(`/${portableExpectedDir}/`)
      || portableDir.endsWith(`/${portableExpectedDir}`);

    if (!isInsideExpectedDirectory && dirName !== '.') {
      diagnostics.push({
        category: 'path',
        id: 'PATH_DIRECTORY_MISMATCH',
        message: `Artifact "${artifact}" should be in directory "${expectedDir}" but found in "${dirName}".`,
        path: relativePath,
        ruleId: 'path.directory-mismatch',
        severity: 'warning',
      });
    }

    const stem = path.basename(relativePath, ext);
    if (stem.trim() === '') {
      diagnostics.push({
        category: 'path',
        id: 'PATH_EMPTY_STEM',
        message: `File has an empty stem (filename before extension).`,
        path: relativePath,
        ruleId: 'path.empty-stem',
        severity: 'error',
      });
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
    tool: 'workbench.validate_path',
  });
}
