/**
 * edit_order direct mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/edit-order.ts
 */

import { readFile } from 'node:fs/promises';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { PatchOperation, MutationMode as PatchPlanMutationMode } from '../../contracts/patch-plan';
import { createMutationResultEnvelope, type MutationResultEnvelope } from '../../contracts/mutation-result';
import { applyPatchPlan } from '../../mutation/apply-engine';
import { computeFileHash } from '../../mutation/file-hash';
import type { MutationMode } from '../../mutation/mode';
import { createPatchPlan, createFileHashPrecondition, createInsideWorkspacePrecondition, buildUnifiedDiff } from '../../mutation/patch-preview';
import type { PatchPlanStore } from '../../mutation/patch-store';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export type EditOrderToolResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface OrderOperationInput {
  kind: 'insert' | 'move' | 'remove';
  entry: string;
  index?: number;
  toIndex?: number;
}

export interface EditOrderInput {
  orderPath: string;
  operations: readonly OrderOperationInput[];
  mode: PatchPlanMutationMode;
  confirmation?: { accepted: boolean; confirmationText?: string };
  postValidate?: boolean;
  expectedHash?: string;
}

const TOOL_NAME = 'workbench.edit_order';

/**
 * handleEditOrder 함수.
 * `_order.json`에 대해 structured order operation을 preview/commit으로 실행함.
 *
 * @param input - orderPath, operations, mode, confirmation
 * @param workspace - workspace root 상태
 * @param mutationMode - 서버 mutation mode
 * @param patchStore - 공유 patch plan store
 * @returns mutation result 또는 diagnostic envelope
 */
export async function handleEditOrder(
  input: unknown,
  workspace: WorkspaceRootStatus,
  mutationMode: MutationMode,
  patchStore: PatchPlanStore,
): Promise<EditOrderToolResult> {
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({
    allowedKeys: ['orderPath', 'operations', 'mode', 'confirmation', 'postValidate', 'expectedHash'],
    input,
    tool: TOOL_NAME,
  });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  const parsed = parseEditOrderInput(input);
  if (!parsed.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'input', id: 'EDIT_ORDER_INPUT_INVALID', message: parsed.reason, path: null, ruleId: 'input.edit-order', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const editInput = parsed.input;
  const patchOperations: PatchOperation[] = editInput.operations.map((operation) => {
    if (operation.kind === 'insert') return { kind: 'order.insert' as const, orderPath: editInput.orderPath, entry: operation.entry, index: operation.index };
    if (operation.kind === 'move') return { kind: 'order.move' as const, orderPath: editInput.orderPath, entry: operation.entry, toIndex: operation.toIndex ?? 0 };
    return { kind: 'order.remove' as const, orderPath: editInput.orderPath, entry: operation.entry };
  });

  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: 'Workspace root is not available.', path: null, ruleId: 'workspace.unavailable', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const safePath = await resolveSafeWorkspacePath({ inputPath: editInput.orderPath, intent: 'read-existing', workspace });
  if (!safePath.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'PATH_OUTSIDE_WORKSPACE', message: `Path resolves outside workspace: ${editInput.orderPath} (${safePath.reason}).`, path: editInput.orderPath, ruleId: 'path.boundary', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  let currentContent = '';
  let currentHash: string | undefined;
  try {
    currentContent = await readFile(safePath.absolutePath, 'utf8');
    currentHash = await computeFileHash(safePath.absolutePath);
  } catch {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'order', id: 'ORDER_FILE_MISSING', message: `Cannot read _order.json at ${editInput.orderPath}.`, path: editInput.orderPath, ruleId: 'order.missing', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const effectiveHash = editInput.expectedHash ?? currentHash;
  const patchPlan = createPatchPlan({
    expectedDiagnostics: [],
    intent: `edit_order: ${editInput.operations.map((o) => o.kind).join(', ')}`,
    operations: patchOperations,
    preconditions: [
      createFileHashPrecondition(editInput.orderPath, effectiveHash ?? ''),
      createInsideWorkspacePrecondition(editInput.orderPath),
    ],
    safety: { destructive: editInput.operations.some((o) => o.kind === 'remove'), requiresConfirmation: true, touchesGeneratedOnly: false, touchesSourceArtifacts: true },
    unifiedDiff: buildOrderDiff(editInput.orderPath, currentContent, patchOperations),
    workspaceRoot: workspace.path,
  });

  patchStore.savePatchPlan(patchPlan);

  if (mutationMode === 'preview-only') {
    return createDiagnosticEnvelope({
      data: { patchPlan, preview: true },
      diagnostics: [],
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  const safetyResult = await evaluateMutationSafetyGate({
    confirmation: editInput.confirmation ? { accepted: editInput.confirmation.accepted, confirmationText: editInput.confirmation.confirmationText } : undefined,
    expectedConfirmationText: `APPLY ${patchPlan.patchPlanId}`,
    mode: mutationMode,
    risk: editInput.operations.length > 1 ? 'medium' : 'low',
    targets: [{ expectedHash: effectiveHash, intent: 'write-existing' as const, path: editInput.orderPath }],
    toolName: TOOL_NAME,
    workspace,
  });

  if (!safetyResult.ok) {
    return createMutationResultEnvelope({
      changedFiles: [],
      patchPlanId: patchPlan.patchPlanId,
      postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'EDIT_ORDER_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: editInput.orderPath, ruleId: `edit-order.${safetyResult.reason}`, severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'rejected',
      tool: TOOL_NAME,
    });
  }

  return applyPatchPlan({
    confirmation: editInput.confirmation ? { accepted: editInput.confirmation.accepted, confirmationText: editInput.confirmation.confirmationText } : undefined,
    mutationMode,
    options: { postValidate: editInput.postValidate !== false },
    patchPlan,
    workspace,
  });
}

/**
 * buildOrderDiff 함수.
 * order operation에 대한 preview unified diff를 생성함.
 *
 * @param orderPath - workspace-relative _order.json path
 * @param currentContent - 현재 파일 내용
 * @param operations - order patch operations
 * @returns unified diff 문자열
 */
function buildOrderDiff(orderPath: string, currentContent: string, operations: readonly PatchOperation[]): string {
  try {
    const parsed = JSON.parse(currentContent) as string[];
    const next = [...parsed];
    for (const operation of operations) {
      if (operation.kind === 'order.insert') {
        const index = operation.index === undefined ? next.length : Math.max(0, Math.min(operation.index, next.length));
        if (!next.includes(operation.entry)) next.splice(index, 0, operation.entry);
      } else if (operation.kind === 'order.move') {
        const currentIndex = next.indexOf(operation.entry);
        if (currentIndex !== -1) next.splice(currentIndex, 1);
        next.splice(Math.max(0, Math.min(operation.toIndex, next.length)), 0, operation.entry);
      } else if (operation.kind === 'order.remove') {
        const currentIndex = next.indexOf(operation.entry);
        if (currentIndex !== -1) next.splice(currentIndex, 1);
      }
    }
    return buildUnifiedDiff(orderPath, `${JSON.stringify(parsed, null, 2)}\n`, `${JSON.stringify(next, null, 2)}\n`);
  } catch {
    return `--- a/${orderPath}\n+++ b/${orderPath}\n@@ preview @@\n`;
  }
}

/**
 * parseEditOrderInput 함수.
 * unknown raw input을 EditOrderInput으로 검증함.
 *
 * @param input - raw tool input
 * @returns parsed input 또는 reject reason
 */
function parseEditOrderInput(input: unknown): { input: EditOrderInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'Input must be an object.' };
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.orderPath !== 'string' || candidate.orderPath.trim() === '') {
    return { ok: false, reason: 'orderPath must be a non-empty string.' };
  }
  if (!Array.isArray(candidate.operations) || candidate.operations.length === 0) {
    return { ok: false, reason: 'operations must be a non-empty array.' };
  }
  for (const operation of candidate.operations as OrderOperationInput[]) {
    if (operation.kind !== 'insert' && operation.kind !== 'move' && operation.kind !== 'remove') {
      return { ok: false, reason: `Invalid operation kind: ${operation.kind}.` };
    }
    if (typeof operation.entry !== 'string') {
      return { ok: false, reason: 'Each operation must have a string entry.' };
    }
  }
  const mode: PatchPlanMutationMode = 'commit';
  const confirmation = candidate.confirmation as EditOrderInput['confirmation'] | undefined;
  return {
    input: {
      confirmation: confirmation ? { accepted: !!confirmation.accepted, confirmationText: confirmation.confirmationText } : undefined,
      expectedHash: typeof candidate.expectedHash === 'string' ? candidate.expectedHash : undefined,
      mode,
      operations: candidate.operations as OrderOperationInput[],
      orderPath: candidate.orderPath as string,
      postValidate: typeof candidate.postValidate === 'boolean' ? candidate.postValidate : undefined,
    },
    ok: true,
  };
}
