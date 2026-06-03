/**
 * Facade patch_apply tool for stored patch plans.
 * @file packages/risuai-workbench-mcp/src/tools/facade/patch-apply-tool.ts
 */

import { z } from 'zod';

import type { ActionExecutionContext } from '../../actions/types';
import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { MutationResultEnvelope } from '../../contracts/mutation-result';
import { handleApplyPatchPlan } from '../../tools/patch/apply-patch-plan';

export const PatchApplyInputSchema = z.object({
  patchPlanId: z.string(),
  options: z.object({
    createBackup: z.boolean().optional(),
    postValidate: z.boolean().optional(),
    rollbackOnValidationError: z.boolean().optional(),
  }).optional(),
}).catchall(z.unknown());

export type PatchApplyInput = z.infer<typeof PatchApplyInputSchema>;

export type PatchApplyResult = DiagnosticEnvelope | MutationResultEnvelope;

/**
 * handlePatchApply 함수.
 * Facade entry for applying stored patch plans.
 *
 * @param input - patch apply request
 * @param executionContext - shared action execution context
 * @returns mutation result envelope or diagnostic envelope
 */
export async function handlePatchApply(
  input: PatchApplyInput,
  executionContext: ActionExecutionContext,
): Promise<PatchApplyResult> {
  const tool = 'workbench.patch_apply';

  // Validate input schema
  const parsed = PatchApplyInputSchema.safeParse(input);
  if (!parsed.success) {
    return createDiagnosticEnvelope({
      diagnostics: parsed.error.issues.map((issue) => ({
        category: 'input',
        id: 'PATCH_APPLY_INPUT_INVALID',
        message: issue.message,
        path: issue.path.join('.'),
        ruleId: 'patch-apply.input-invalid',
        severity: 'error',
      })),
      status: 'domain_error',
      tool,
    });
  }

  // Route to canonical apply handler.
  return handleApplyPatchPlan(parsed.data, {
    mutationMode: executionContext.mutationMode,
    patchStore: executionContext.patchStore,
    workspace: executionContext.workspace,
  });
}
