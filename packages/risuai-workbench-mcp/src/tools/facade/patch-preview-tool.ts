/**
 * Facade patch_preview tool — safe preview path for patch plans.
 * @file packages/risuai-workbench-mcp/src/tools/facade/patch-preview-tool.ts
 */

import { z } from 'zod';

import type { ActionRegistry } from '../../actions/registry';
import type { ActionExecutionContext } from '../../actions/types';
import {
  createUnknownActionError,
  createBlockedMutationError,
  createInvalidArgsError,
  type ActionErrorResult,
} from '../../actions/errors';
import { ContextStore } from '../../context/context-store';
import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { PatchPlan } from '../../contracts/patch-plan';

export const PatchPreviewInputSchema = z.object({
  actionId: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  patchPlan: z.record(z.string(), z.unknown()).optional(),
  contextId: z.string().optional(),
}).catchall(z.unknown());

export type PatchPreviewInput = z.infer<typeof PatchPreviewInputSchema>;

export type PatchPreviewResult = DiagnosticEnvelope | ActionErrorResult;

/**
 * Convert Zod error issues to concise ActionErrorIssue entries.
 */
function zodIssuesToActionIssues(error: z.ZodError): Array<{ path: readonly string[]; message: string }> {
  return error.issues.map((issue) => ({
    message: issue.message,
    path: issue.path.map(String),
  }));
}

/**
 * handlePatchPreview 함수.
 * Safe facade entry for patch previews. Supports:
 * 1. actionId + args → execute a registered preview action
 * 2. patchPlan pass-through → validate, store, and return
 *
 * @param input - patch preview request
 * @param registry - ActionRegistry to look up preview actions
 * @param executionContext - shared action execution context
 * @param contextStore - optional context store for hydration
 * @returns preview diagnostic envelope or structured error
 */
export async function handlePatchPreview(
  input: PatchPreviewInput,
  registry: ActionRegistry,
  executionContext: ActionExecutionContext,
  contextStore?: ContextStore,
): Promise<PatchPreviewResult> {
  const tool = 'workbench.patch_preview';

  // PatchPlan pass-through path
  if (input.patchPlan) {
    const validated = validatePassThroughPatchPlan(input.patchPlan);
    if (!validated.ok) {
      return createDiagnosticEnvelope({
        diagnostics: [{
          category: 'input',
          id: 'PATCH_PREVIEW_INVALID_PLAN',
          message: validated.reason,
          path: null,
          ruleId: 'patch-preview.invalid-plan',
          severity: 'error',
        }],
        status: 'domain_error',
        tool,
      });
    }
    executionContext.patchStore.savePatchPlan(validated.plan);
    return createDiagnosticEnvelope({
      data: { patchPlan: validated.plan, writePolicy: 'preview-only' },
      diagnostics: [{
        category: 'patch',
        id: 'PATCH_PREVIEW_STORED',
        message: 'Supplied patch plan validated and stored; no files were written.',
        path: null,
        ruleId: 'patch-preview.stored',
        severity: 'info',
      }],
      status: 'ok',
      tool,
    });
  }

  // actionId + args path
  if (!input.actionId) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'input',
        id: 'PATCH_PREVIEW_MISSING_INPUT',
        message: 'Provide actionId + args or a patchPlan object.',
        path: null,
        ruleId: 'patch-preview.missing-input',
        severity: 'error',
      }],
      status: 'domain_error',
      tool,
    });
  }

  const action = registry.get(input.actionId);
  if (!action) {
    let suggestions = registry.search({ query: input.actionId, limit: 4 });
    if (suggestions.length === 0) {
      suggestions = registry.list().slice(0, 4);
    }
    return createUnknownActionError(input.actionId, suggestions);
  }

  // Block commit_mutation actions at the patch preview boundary
  if (action.risk === 'commit_mutation') {
    return createBlockedMutationError(action.id);
  }

  const args = input.args ?? {};

  if (input.contextId && contextStore && !contextStore.has(input.contextId)) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'input',
        id: 'PATCH_PREVIEW_CONTEXT_NOT_FOUND',
        message: `Context not found: ${input.contextId}`,
        path: null,
        ruleId: 'patch-preview.context-not-found',
        severity: 'error',
      }],
      status: 'domain_error',
      tool,
    });
  }

  const hydratedArgs = contextStore
    ? contextStore.hydrateArgs(input.contextId, args)
    : args;

  const parsed = action.inputSchema.safeParse(hydratedArgs);
  if (!parsed.success) {
    return createInvalidArgsError(action, zodIssuesToActionIssues(parsed.error));
  }

  const result = await action.execute(parsed.data, executionContext);
  return result as DiagnosticEnvelope;
}

interface ValidatePatchPlanResult {
  ok: true;
  plan: PatchPlan;
}

interface ValidatePatchPlanError {
  ok: false;
  reason: string;
}

/**
 * validatePassThroughPatchPlan 함수.
 * Validates a caller-supplied patch plan object before storing it.
 * Only accepts plans that look like valid PatchPlan envelopes.
 *
 * @param candidate - raw patch plan object from caller
 * @returns validated plan or rejection reason
 */
function validatePassThroughPatchPlan(candidate: Record<string, unknown>): ValidatePatchPlanResult | ValidatePatchPlanError {
  if (typeof candidate.patchPlanId !== 'string' || candidate.patchPlanId.trim() === '') {
    return { ok: false, reason: 'patchPlan.patchPlanId must be a non-empty string.' };
  }
  if (!Array.isArray(candidate.operations)) {
    return { ok: false, reason: 'patchPlan.operations must be an array.' };
  }
  if (typeof candidate.intent !== 'string') {
    return { ok: false, reason: 'patchPlan.intent must be a string.' };
  }
  if (typeof candidate.workspaceRoot !== 'string') {
    return { ok: false, reason: 'patchPlan.workspaceRoot must be a string.' };
  }

  // Reconstruct a minimal valid PatchPlan envelope
  const previewCandidate = candidate.preview as Record<string, unknown> | undefined;
  const safetyCandidate = candidate.safety as Record<string, unknown> | undefined;

  const plan: PatchPlan = {
    schema: 'risuai-workbench-mcp.patch-plan',
    schemaVersion: '0.2.0',
    patchPlanId: candidate.patchPlanId,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
    workspaceRoot: candidate.workspaceRoot,
    intent: candidate.intent,
    operations: candidate.operations as PatchPlan['operations'],
    preconditions: Array.isArray(candidate.preconditions) ? candidate.preconditions as PatchPlan['preconditions'] : [],
    expectedDiagnostics: Array.isArray(candidate.expectedDiagnostics) ? candidate.expectedDiagnostics as PatchPlan['expectedDiagnostics'] : [],
    preview: {
      affectedFiles: Array.isArray(previewCandidate?.affectedFiles) ? previewCandidate.affectedFiles as PatchPlan['preview']['affectedFiles'] : [],
      resourceLinks: Array.isArray(previewCandidate?.resourceLinks) ? previewCandidate.resourceLinks as PatchPlan['preview']['resourceLinks'] : [],
      unifiedDiff: typeof previewCandidate?.unifiedDiff === 'string' ? previewCandidate.unifiedDiff : undefined,
    },
    safety: {
      destructive: typeof safetyCandidate?.destructive === 'boolean' ? safetyCandidate.destructive : false,
      requiresConfirmation: typeof safetyCandidate?.requiresConfirmation === 'boolean' ? safetyCandidate.requiresConfirmation : true,
      touchesGeneratedOnly: typeof safetyCandidate?.touchesGeneratedOnly === 'boolean' ? safetyCandidate.touchesGeneratedOnly : false,
      touchesSourceArtifacts: typeof safetyCandidate?.touchesSourceArtifacts === 'boolean' ? safetyCandidate.touchesSourceArtifacts : true,
    },
  };

  return { ok: true, plan };
}
