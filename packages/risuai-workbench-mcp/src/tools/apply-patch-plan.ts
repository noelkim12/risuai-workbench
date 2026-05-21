/**
 * apply_patch_plan direct mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/apply-patch-plan.ts
 */

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope } from '../contracts/diagnostics';
import type { ApplyPatchPlanInput } from '../contracts/patch-plan';
import { createMutationResultEnvelope, type MutationResultEnvelope } from '../contracts/mutation-result';
import { applyPatchPlan } from '../mutation/apply-engine';
import type { MutationMode } from '../mutation/mode';
import type { PatchPlanStore } from '../mutation/patch-store';
import type { WorkspaceRootStatus } from '../project/resolve-root';

export type ApplyPatchPlanToolResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface ApplyPatchPlanHandlerContext {
  mutationMode: MutationMode;
  patchStore: PatchPlanStore;
  workspace: WorkspaceRootStatus;
}

/**
 * handleApplyPatchPlan 함수.
 * patchPlanId로 저장 plan을 조회하고 confirmation/safety/precondition을 통과한 경우에만 적용함.
 *
 * @param input - apply_patch_plan raw input
 * @param context - workspace, mutation mode, patch store
 * @returns mutation result 또는 input diagnostic envelope
 */
export async function handleApplyPatchPlan(input: unknown, context: ApplyPatchPlanHandlerContext): Promise<ApplyPatchPlanToolResult> {
  const tool = 'workbench.apply_patch_plan';
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({ allowedKeys: ['confirmation', 'options', 'patchPlanId'], input, tool });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  const parsedInput = parseApplyPatchPlanInput(input);
  if (!parsedInput.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'input', id: 'APPLY_PATCH_PLAN_INPUT_INVALID', message: parsedInput.reason, path: null, ruleId: 'input.apply-patch-plan', severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  const patchPlan = context.patchStore.getPatchPlan(parsedInput.input.patchPlanId);
  if (!patchPlan) {
    return createMutationResultEnvelope({
      changedFiles: [],
      patchPlanId: parsedInput.input.patchPlanId,
      postValidation: {
        diagnostics: [{ category: 'patch-store', id: 'PATCH_PLAN_NOT_FOUND', message: `Patch plan not found: ${parsedInput.input.patchPlanId}.`, path: null, ruleId: 'patch-store.not-found', severity: 'error' }],
        status: 'error',
      },
      resourceLinks: [],
      status: 'rejected',
      tool,
    });
  }

  return applyPatchPlan({
    confirmation: parsedInput.input.confirmation,
    mutationMode: context.mutationMode,
    options: parsedInput.input.options,
    patchPlan,
    workspace: context.workspace,
  });
}

/**
 * parseApplyPatchPlanInput 함수.
 * unknown raw input을 mutation transport exception 없이 ApplyPatchPlanInput으로 검증함.
 *
 * @param input - raw tool input
 * @returns parsed input 또는 reject reason
 */
function parseApplyPatchPlanInput(input: unknown): { input: ApplyPatchPlanInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'Input must be an object.' };
  }
  const candidate = input as Partial<ApplyPatchPlanInput>;
  if (typeof candidate.patchPlanId !== 'string' || candidate.patchPlanId.trim() === '') {
    return { ok: false, reason: 'patchPlanId must be a non-empty string.' };
  }
  if (!candidate.confirmation || typeof candidate.confirmation !== 'object' || Array.isArray(candidate.confirmation)) {
    return { ok: false, reason: 'confirmation object is required.' };
  }
  const confirmation = candidate.confirmation as ApplyPatchPlanInput['confirmation'];
  if (typeof confirmation.accepted !== 'boolean') {
    return { ok: false, reason: 'confirmation.accepted must be boolean.' };
  }
  if (confirmation.confirmationText !== undefined && typeof confirmation.confirmationText !== 'string') {
    return { ok: false, reason: 'confirmation.confirmationText must be a string when provided.' };
  }
  return {
    input: {
      confirmation: { accepted: confirmation.accepted, confirmationText: confirmation.confirmationText },
      options: candidate.options,
      patchPlanId: candidate.patchPlanId,
    },
    ok: true,
  };
}
