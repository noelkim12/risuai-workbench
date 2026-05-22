/**
 * inspect_path tool handler.
 * Resolves a workspace-relative path to its artifact/root/marker/metadata role.
 * @file packages/risuai-workbench-mcp/src/tools/inspect/inspect-path.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  CUSTOM_EXTENSION_ARTIFACT_CONTRACTS,
  CUSTOM_EXTENSION_MARKER_FILES,
  parseCustomExtensionArtifactFromSuffix,
  type CustomExtensionArtifact,
} from 'risu-workbench-core';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import { resolveSafeWorkspacePath, type SafePathResult } from '../../project/safe-path';
import type { WorkspaceRootStatus } from '../../project/resolve-root';

export interface InspectPathInput {
  path: string;
}

export interface InspectPathResultData {
  relativePath: string;
  exists: boolean;
  role: 'canonical-file' | 'order-marker' | 'folders-marker' | 'structured-json' | 'directory' | 'unknown' | 'outside-workspace' | 'workspace-root';
  artifact?: CustomExtensionArtifact;
  contract?: {
    artifact: string;
    directory: string;
    suffix: string;
    supportedTargets: readonly string[];
  };
  directoryEntries?: string[];
}

/**
 * handleInspectPath 함수.
 * workspace-relative path가 어떤 artifact/root/marker/metadata 역할인지 설명함.
 *
 * @param input - 검사할 workspace-relative path
 * @param workspace - workspace root 상태
 * @returns diagnostic envelope에 감싸진 inspect 결과
 */
export async function handleInspectPath(
  input: InspectPathInput,
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
      tool: 'workbench.inspect_path',
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
      tool: 'workbench.inspect_path',
    });
  }

  const result = await resolvePathRole(safeResult);
  const diagnostics: WorkbenchDiagnostic[] = [];

  if (result.role === 'unknown') {
    diagnostics.push({
      category: 'inspect',
      id: 'PATH_ROLE_UNKNOWN',
      message: `Path does not match any known artifact, marker, or metadata role.`,
      path: result.relativePath,
      ruleId: 'inspect.unknown-role',
      severity: 'info',
    });
  }

  return createDiagnosticEnvelope({
    data: result,
    diagnostics,
    status: diagnostics.some((d) => d.severity === 'error') ? 'domain_error' : 'ok',
    tool: 'workbench.inspect_path',
  });
}

/**
 * resolvePathRole 함수.
 * safe path 결과에서 artifact/root/marker/metadata 역할을 판정함.
 *
 * @param safeResult - resolve된 안전한 path
 * @returns inspect 결과 데이터
 */
async function resolvePathRole(safeResult: SafePathResult & { ok: true }): Promise<InspectPathResultData> {
  const { absolutePath, relativePath, rootPath } = safeResult;

  if (absolutePath === rootPath) {
    return { exists: true, relativePath: '.', role: 'workspace-root' };
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(absolutePath).sort();
    return { directoryEntries: entries, exists: true, relativePath, role: 'directory' };
  }

  const basename = path.basename(relativePath);
  const ext = path.extname(basename).toLowerCase();

  if (basename === CUSTOM_EXTENSION_MARKER_FILES.order) {
    return { exists: true, relativePath, role: 'order-marker' };
  }

  if (basename === CUSTOM_EXTENSION_MARKER_FILES.folders) {
    return { exists: true, relativePath, role: 'folders-marker' };
  }

  if (ext.startsWith('.risu')) {
    try {
      const artifact = parseCustomExtensionArtifactFromSuffix(ext);
      const contract = CUSTOM_EXTENSION_ARTIFACT_CONTRACTS[artifact];
      return {
        artifact,
        contract: {
          artifact: contract.artifact,
          directory: contract.directory,
          suffix: contract.suffix,
          supportedTargets: [...contract.supportedTargets],
        },
        exists: true,
        relativePath,
        role: 'canonical-file',
      };
    } catch {
      return { exists: true, relativePath, role: 'unknown' };
    }
  }

  if (ext === '.json') {
    return { exists: true, relativePath, role: 'structured-json' };
  }

  return { exists: true, relativePath, role: 'unknown' };
}
