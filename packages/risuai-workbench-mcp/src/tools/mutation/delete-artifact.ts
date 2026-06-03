/**
 * delete_artifact high-risk mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/delete-artifact.ts
 */

import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import { createMutationResultEnvelope, type ChangedFileResult, type MutationResultEnvelope, type PostValidationResult } from '../../contracts/mutation-result';
import { computeFileHash } from '../../mutation/file-hash';
import { appendJournalEntry } from '../../mutation/journal';
import type { MutationMode } from '../../mutation/mode';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export type DeleteArtifactToolResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface DeleteArtifactInput {
  path: string;
  mode: 'commit' | 'preview';
  updateOrder?: boolean;
  createBackup?: boolean;
  expectedHash?: string;
  postValidate?: boolean;
}

const TOOL_NAME = 'workbench.delete_artifact';

/**
 * handleDeleteArtifact 함수.
 * isolated workspace 안 artifact file만 삭제하고 선택적으로 order를 정리함.
 *
 * @param input - 삭제 대상 path와 options
 * @param workspace - startup에서 계산한 workspace root 상태
 * @param mutationMode - 서버 mutation mode
 * @returns mutation result 또는 diagnostic envelope
 */
export async function handleDeleteArtifact(input: unknown, workspace: WorkspaceRootStatus, mutationMode: MutationMode): Promise<DeleteArtifactToolResult> {
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({
    allowedKeys: ['path', 'mode', 'updateOrder', 'createBackup', 'expectedHash', 'postValidate'],
    input,
    tool: TOOL_NAME,
  });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  const parsed = parseDeleteArtifactInput(input);
  if (!parsed.ok) return inputError(parsed.reason);
  const deleteInput = parsed.input;

  if (!workspace.ok) {
    return createDiagnosticEnvelope({ diagnostics: [workspaceDiagnostic(workspace.reason)], status: 'domain_error', tool: TOOL_NAME });
  }

  const safePath = await resolveSafeWorkspacePath({ inputPath: deleteInput.path, intent: 'read-existing', workspace });
  if (!safePath.ok) return pathError(deleteInput.path, safePath.reason);

  const beforeHash = await computeFileHash(safePath.absolutePath);
  const effectiveHash = deleteInput.expectedHash ?? beforeHash;
  const orderPath = `${path.posix.dirname(deleteInput.path)}/_order.json`;
  const orderState = deleteInput.updateOrder === true ? await readOrderState(orderPath, workspace) : null;

  if (mutationMode === 'preview-only') {
    return createDiagnosticEnvelope({
      data: { orderPath: orderState?.relativePath ?? null, preview: true, target: deleteInput.path },
      diagnostics: [{ category: 'mutation-safety', id: 'DELETE_ARTIFACT_PREVIEW', message: 'Delete preview created; no files were changed.', path: deleteInput.path, ruleId: 'delete-artifact.preview', severity: 'info' }],
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  const safetyTargets = [{ expectedHash: effectiveHash, intent: 'write-existing' as const, path: deleteInput.path }];
  if (orderState) safetyTargets.push({ expectedHash: orderState.beforeHash, intent: 'write-existing' as const, path: orderState.relativePath });

  const safetyResult = await evaluateMutationSafetyGate({
    mode: mutationMode,
    targets: safetyTargets,
    toolName: TOOL_NAME,
    workspace,
  });

  if (!safetyResult.ok) {
    return createMutationResultEnvelope({
      changedFiles: [],
      postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'DELETE_ARTIFACT_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: deleteInput.path, ruleId: `delete-artifact.${safetyResult.reason}`, severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'rejected',
      tool: TOOL_NAME,
    });
  }

  const mutationId = createMutationId(deleteInput.path);
  const backupPath = deleteInput.createBackup === true ? path.join(workspace.path, '.risuai-workbench-mcp', 'backups', mutationId, path.basename(deleteInput.path)) : null;
  if (backupPath) {
    await mkdir(path.dirname(backupPath), { recursive: true });
    await copyFile(safePath.absolutePath, backupPath);
  }

  await unlink(safePath.absolutePath);
  const changedFiles: ChangedFileResult[] = [{ beforeHash, operationCount: 1, path: deleteInput.path }];

  if (orderState) {
    const nextOrder = orderState.entries.filter((entry) => entry !== path.posix.basename(deleteInput.path));
    await writeFile(orderState.absolutePath, `${JSON.stringify(nextOrder, null, 2)}\n`, 'utf8');
    const orderAfterHash = await computeFileHash(orderState.absolutePath);
    changedFiles.push({ afterHash: orderAfterHash, beforeHash: orderState.beforeHash, operationCount: 1, path: orderState.relativePath });
  }

  const postValidation = deleteInput.postValidate !== false ? await runDeletePostValidation(deleteInput.path, safePath.absolutePath, orderState) : { diagnostics: [], status: 'not_run' as const };
  const rollbackAvailable = Boolean(backupPath && !orderState);
  await appendJournalEntry(path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl'), {
    affectedFiles: changedFiles.map((file) => file.path),
    backupFiles: backupPath ? [{ backupPath, originalPath: deleteInput.path }] : undefined,
    changedFiles,
    mutationId,
    patchOperations: [{ expectedHash: beforeHash, kind: 'file.delete', path: deleteInput.path }],
    postValidation,
    rollbackAvailable,
    rollbackData: rollbackAvailable && backupPath ? { files: [{ backupPath, originalPath: deleteInput.path, restoredHash: beforeHash }], kind: 'restore-from-backup' } : undefined,
    status: postValidation.status === 'error' ? 'failed-validation' : 'applied',
    toolName: TOOL_NAME,
  });

  return createMutationResultEnvelope({
    appliedAt: new Date().toISOString(),
    changedFiles,
    mutationId,
    postValidation,
    resourceLinks: [`risuai-workbench://mutations/journal/${mutationId}`],
    status: postValidation.status === 'error' ? 'failed' : 'applied',
    tool: TOOL_NAME,
  });
}

interface OrderState {
  absolutePath: string;
  beforeHash: string;
  entries: string[];
  relativePath: string;
}

/**
 * readOrderState 함수.
 * 같은 디렉터리의 `_order.json` 상태를 읽고 없으면 order 정리를 건너뜀.
 *
 * @param orderPath - workspace-relative `_order.json` path
 * @param workspace - workspace root 상태
 * @returns order 상태 또는 null
 */
async function readOrderState(orderPath: string, workspace: WorkspaceRootStatus): Promise<OrderState | null> {
  const safeOrder = await resolveSafeWorkspacePath({ inputPath: orderPath, intent: 'read-existing', workspace });
  if (!safeOrder.ok) return null;
  const content = await readFile(safeOrder.absolutePath, 'utf8');
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) return null;
  return { absolutePath: safeOrder.absolutePath, beforeHash: await computeFileHash(safeOrder.absolutePath), entries: parsed, relativePath: orderPath };
}

/**
 * runDeletePostValidation 함수.
 * 삭제 대상 부재와 선택적 order cleanup 결과를 확인함.
 *
 * @param targetPath - workspace-relative 삭제 path
 * @param absolutePath - 삭제 path absolute path
 * @param orderState - cleanup 대상 order 상태
 * @returns post-validation 결과
 */
async function runDeletePostValidation(targetPath: string, absolutePath: string, orderState: OrderState | null): Promise<PostValidationResult> {
  const diagnostics: WorkbenchDiagnostic[] = [];
  try {
    await readFile(absolutePath, 'utf8');
    diagnostics.push({ category: 'post-validation', id: 'DELETE_ARTIFACT_STILL_EXISTS', message: `${targetPath} still exists after delete.`, path: targetPath, ruleId: 'delete-artifact.still-exists', severity: 'error' });
  } catch {
    // Missing target is the expected result after delete.
  }
  if (orderState) {
    const order = JSON.parse(await readFile(orderState.absolutePath, 'utf8')) as unknown;
    if (Array.isArray(order) && order.includes(path.posix.basename(targetPath))) {
      diagnostics.push({ category: 'order', id: 'DELETE_ARTIFACT_ORDER_NOT_CLEANED', message: `_order.json still references ${targetPath}.`, path: orderState.relativePath, ruleId: 'delete-artifact.order-cleanup', severity: 'warning' });
    }
  }
  return { diagnostics, status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'error' : diagnostics.some((diagnostic) => diagnostic.severity === 'warning') ? 'warning' : 'ok' };
}

/**
 * parseDeleteArtifactInput 함수.
 * unknown raw input을 DeleteArtifactInput으로 검증함.
 *
 * @param input - raw tool input
 * @returns parsed input 또는 reject reason
 */
function parseDeleteArtifactInput(input: unknown): { input: DeleteArtifactInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'Input must be an object.' };
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.path !== 'string' || candidate.path.trim() === '') return { ok: false, reason: 'path must be a non-empty string.' };
  return {
    input: {
      createBackup: typeof candidate.createBackup === 'boolean' ? candidate.createBackup : undefined,
      expectedHash: typeof candidate.expectedHash === 'string' ? candidate.expectedHash : undefined,
      mode: 'commit',
      path: candidate.path,
      postValidate: typeof candidate.postValidate === 'boolean' ? candidate.postValidate : undefined,
      updateOrder: typeof candidate.updateOrder === 'boolean' ? candidate.updateOrder : undefined,
    },
    ok: true,
  };
}

/**
 * createMutationId 함수.
 * 삭제 journal에 사용할 mutation id를 생성함.
 *
 * @param targetPath - mutation 대상 path
 * @returns mutation id
 */
function createMutationId(targetPath: string): string {
  return `mutation:${Date.now().toString(36)}:${targetPath.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 24)}`;
}

function inputError(reason: string): DiagnosticEnvelope {
  return createDiagnosticEnvelope({ diagnostics: [{ category: 'input', id: 'DELETE_ARTIFACT_INPUT_INVALID', message: reason, path: null, ruleId: 'input.delete-artifact', severity: 'error' }], status: 'domain_error', tool: TOOL_NAME });
}

function pathError(targetPath: string, reason: string): DiagnosticEnvelope {
  return createDiagnosticEnvelope({ diagnostics: [{ category: 'path', id: 'PATH_RESOLVE_FAILED', message: `Path resolution failed: ${targetPath} (${reason}).`, path: targetPath, ruleId: `path.${reason}`, severity: 'error' }], status: 'domain_error', tool: TOOL_NAME });
}

function workspaceDiagnostic(reason: string | null): WorkbenchDiagnostic {
  return { category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${reason ?? 'unknown'}.`, path: null, ruleId: 'workspace.unavailable', severity: 'error' };
}
