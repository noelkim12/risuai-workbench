/**
 * suggest_order_patch tool handler.
 * Creates preview-only structured _order.json patch plans without writing files.
 * @file packages/risuai-workbench-mcp/src/tools/patch/suggest-order-patch.ts
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { readJson } from 'risu-workbench-core/node';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { PatchOperation } from '../../contracts/patch-plan';
import { computeFileHash } from '../../mutation/file-hash';
import { buildUnifiedDiff, createFileHashPrecondition, createInsideWorkspacePrecondition, createPatchPlan } from '../../mutation/patch-preview';
import type { PatchPlanStore } from '../../mutation/patch-store';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export type OrderPatchOperationInput =
  | { kind: 'insert'; entry: string; index?: number }
  | { kind: 'move'; entry: string; toIndex: number }
  | { kind: 'remove'; entry: string };

export interface SuggestOrderPatchInput {
  directory: string;
  intent?: string;
  operations: readonly OrderPatchOperationInput[];
}

/**
 * handleSuggestOrderPatch 함수.
 * `_order.json` 변경을 full-file rewrite 대신 structured order operation patch plan으로 미리보기함.
 *
 * @param input - order directory와 structured order operations
 * @param workspace - workspace root 상태
 * @param patchStore - 생성한 patch plan을 apply 단계까지 보존할 store
 * @returns preview-only PatchPlan을 data에 담은 diagnostic envelope
 */
export async function handleSuggestOrderPatch(
  input: SuggestOrderPatchInput,
  workspace: WorkspaceRootStatus,
  patchStore?: PatchPlanStore,
): Promise<DiagnosticEnvelope> {
  const tool = 'workbench.suggest_order_patch';
  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${workspace.reason}`, path: input.directory, ruleId: 'workspace.root-unavailable', severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  const orderRelativePath = path.posix.join(input.directory, '_order.json');
  const safeResult = await resolveSafeWorkspacePath({ inputPath: orderRelativePath, intent: 'read-existing', workspace });
  if (!safeResult.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'PATH_RESOLVE_FAILED', message: `Path resolution failed: ${safeResult.reason}`, path: orderRelativePath, ruleId: `path.${safeResult.reason}`, severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  let order: unknown;
  try {
    order = readJson(safeResult.absolutePath);
  } catch {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'order', id: 'ORDER_FILE_MALFORMED', message: `_order.json in ${input.directory} is malformed and cannot be previewed safely.`, path: orderRelativePath, ruleId: 'order.malformed', severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  if (!Array.isArray(order) || !order.every((entry) => typeof entry === 'string')) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'order', id: 'ORDER_NOT_STRING_ARRAY', message: '_order.json must be a JSON string array for structured order previews.', path: orderRelativePath, ruleId: 'order.not-string-array', severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  const operations = input.operations.map((operation): PatchOperation => {
    if (operation.kind === 'insert') {
      return { entry: operation.entry, index: operation.index, kind: 'order.insert', orderPath: safeResult.relativePath };
    }
    if (operation.kind === 'move') {
      return { entry: operation.entry, kind: 'order.move', orderPath: safeResult.relativePath, toIndex: operation.toIndex };
    }
    return { entry: operation.entry, kind: 'order.remove', orderPath: safeResult.relativePath };
  });
  const before = await readFile(safeResult.absolutePath, 'utf8');
  const after = `${JSON.stringify(applyOrderPreview(order as string[], input.operations), null, 2)}\n`;
  const expectedHash = await computeFileHash(safeResult.absolutePath);
  const patchPlan = createPatchPlan({
    expectedDiagnostics: [{ category: 'order', id: 'ORDER_PATCH_PREVIEW', severity: 'info' }],
    intent: input.intent ?? `Preview structured order changes for ${safeResult.relativePath}`,
    operations,
    preconditions: [createInsideWorkspacePrecondition(safeResult.relativePath), createFileHashPrecondition(safeResult.relativePath, expectedHash)],
    unifiedDiff: buildUnifiedDiff(safeResult.relativePath, before, after),
    workspaceRoot: safeResult.rootPath,
  });
  patchStore?.savePatchPlan(patchPlan);

  return createDiagnosticEnvelope({
    data: { patchPlan, previewOrder: applyOrderPreview(order as string[], input.operations), writePolicy: 'preview-only' },
    diagnostics: [{ category: 'order', id: 'ORDER_PATCH_PREVIEW_CREATED', message: `Preview generated for ${safeResult.relativePath}; no files were written.`, path: safeResult.relativePath, ruleId: 'order.preview-only', severity: 'info' }],
    status: 'ok',
    tool,
  });
}

/**
 * applyOrderPreview 함수.
 * in-memory order 배열에 structured operation을 적용해 preview 결과만 계산함.
 *
 * @param order - 현재 order entry 목록
 * @param operations - 적용할 preview operation 목록
 * @returns preview order entry 목록
 */
function applyOrderPreview(order: readonly string[], operations: readonly OrderPatchOperationInput[]): string[] {
  const next = [...order];
  for (const operation of operations) {
    if (operation.kind === 'insert') {
      const index = operation.index === undefined ? next.length : Math.max(0, Math.min(operation.index, next.length));
      if (!next.includes(operation.entry)) next.splice(index, 0, operation.entry);
    } else if (operation.kind === 'move') {
      const currentIndex = next.indexOf(operation.entry);
      if (currentIndex !== -1) next.splice(currentIndex, 1);
      const targetIndex = Math.max(0, Math.min(operation.toIndex, next.length));
      next.splice(targetIndex, 0, operation.entry);
    } else {
      const currentIndex = next.indexOf(operation.entry);
      if (currentIndex !== -1) next.splice(currentIndex, 1);
    }
  }
  return next;
}
