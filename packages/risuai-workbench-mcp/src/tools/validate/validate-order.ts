/**
 * validate_order tool handler.
 * Validate _order.json entries against actual canonical files.
 * @file packages/risuai-workbench-mcp/src/tools/validate/validate-order.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { discoverCustomExtensionWorkspace, readJson } from 'risu-workbench-core/node';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export interface ValidateOrderInput {
  directory: string;
}

/**
 * handleValidateOrder 함수.
 * `_order.json` 항목과 실제 canonical 파일 간의 일관성을 검증함.
 *
 * @param input - `_order.json`이 있는 디렉토리의 workspace-relative path
 * @param workspace - workspace root 상태
 * @returns diagnostic envelope에 감싸진 order 검증 결과
 */
export async function handleValidateOrder(
  input: ValidateOrderInput,
  workspace: WorkspaceRootStatus,
): Promise<DiagnosticEnvelope> {
  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [
        {
          category: 'workspace',
          id: 'WORKSPACE_ROOT_UNAVAILABLE',
          message: `Workspace root is unavailable: ${workspace.reason}`,
          path: input.directory,
          ruleId: 'workspace.root-unavailable',
          severity: 'error',
        },
      ],
      status: 'domain_error',
      tool: 'workbench.validate_order',
    });
  }

  const safeResult = await resolveSafeWorkspacePath({
    inputPath: input.directory,
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
          path: input.directory,
          ruleId: `path.${safeResult.reason}`,
          severity: 'error',
        },
      ],
      status: 'domain_error',
      tool: 'workbench.validate_order',
    });
  }

  const dirPath = safeResult.absolutePath;
  const orderPath = path.join(dirPath, '_order.json');
  const diagnostics: WorkbenchDiagnostic[] = [];

  if (!fs.existsSync(orderPath)) {
    diagnostics.push({
      category: 'order',
      id: 'ORDER_FILE_MISSING',
      message: `_order.json not found in ${input.directory}.`,
      path: input.directory,
      ruleId: 'order.missing',
      severity: 'warning',
    });
    return createDiagnosticEnvelope({
      diagnostics,
      status: 'domain_warning',
      tool: 'workbench.validate_order',
    });
  }

  let order: unknown;
  try {
    order = readJson(orderPath);
  } catch {
    diagnostics.push({
      category: 'order',
      id: 'ORDER_FILE_MALFORMED',
      message: `_order.json in ${input.directory} is malformed and cannot be parsed.`,
      path: `${input.directory}/_order.json`,
      ruleId: 'order.malformed',
      severity: 'error',
    });
    return createDiagnosticEnvelope({
      diagnostics,
      status: 'domain_error',
      tool: 'workbench.validate_order',
    });
  }

  if (!Array.isArray(order)) {
    diagnostics.push({
      category: 'order',
      id: 'ORDER_NOT_ARRAY',
      message: `_order.json in ${input.directory} does not contain a JSON array.`,
      path: `${input.directory}/_order.json`,
      ruleId: 'order.not-array',
      severity: 'error',
    });
    return createDiagnosticEnvelope({
      diagnostics,
      status: 'domain_error',
      tool: 'workbench.validate_order',
    });
  }

  const discovery = discoverCustomExtensionWorkspace(dirPath);
  const canonicalRelativePaths = new Set(discovery.canonicalFiles.map((f) => f.relativePath));
  const orderEntries = new Set<string>();

  for (const entry of order) {
    if (typeof entry !== 'string') {
      diagnostics.push({
        category: 'order',
        id: 'ORDER_ENTRY_NOT_STRING',
        message: `_order.json contains a non-string entry: ${JSON.stringify(entry)}.`,
        path: `${input.directory}/_order.json`,
        ruleId: 'order.entry-not-string',
        severity: 'warning',
      });
      continue;
    }
    orderEntries.add(entry);
    if (!canonicalRelativePaths.has(entry)) {
      diagnostics.push({
        category: 'order',
        id: 'ORDER_LISTS_MISSING_FILE',
        message: `_order.json references "${entry}" but the file does not exist in ${input.directory}.`,
        path: `${input.directory}/${entry}`,
        ruleId: 'order.listed-file-missing',
        severity: 'warning',
      });
    }
  }

  for (const canonicalPath of canonicalRelativePaths) {
    if (!orderEntries.has(canonicalPath)) {
      diagnostics.push({
        category: 'order',
        id: 'ORDER_UNLISTED_CANONICAL_FILE',
        message: `Canonical file "${canonicalPath}" exists but is not listed in _order.json.`,
        path: `${input.directory}/${canonicalPath}`,
        ruleId: 'order.unlisted-canonical',
        severity: 'warning',
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
    tool: 'workbench.validate_order',
  });
}
