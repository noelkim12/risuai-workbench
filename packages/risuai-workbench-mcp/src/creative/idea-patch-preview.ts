/**
 * Pure helpers for previewing stored creative idea PatchPlans.
 * Read-only: reads PatchPlanStore but never writes.
 * @file packages/risuai-workbench-mcp/src/creative/idea-patch-preview.ts
 */

import type { PatchOperation, PatchPlan } from '../contracts/patch-plan';
import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';
import { buildPatchPlanUri } from '../contracts/resource-uri';
import type { PatchPlanStore } from '../mutation/patch-store';

export type IdeaPatchPreviewResult = IdeaPatchPreviewEnvelope | DiagnosticEnvelope;

export interface IdeaPatchPreviewEnvelope {
  schema: 'risuai-workbench-mcp.creative.idea-patch';
  schemaVersion: '0.2.0';
  tool: string;
  status: 'ok';
  ideaId: string;
  patchPlanId: string;
  patchPlanResource: string;
  affectedFiles: readonly string[];
  operationKinds: readonly PatchOperation['kind'][];
  expectedDiagnostics: readonly { id: string; category: string; severity: string }[];
  preconditions: readonly { kind: string; message: string }[];
  safety: {
    destructive: boolean;
    touchesSourceArtifacts: boolean;
    touchesGeneratedOnly: boolean;
  };
  preApplyValidation: { required: readonly string[] };
  resourceLinks: readonly string[];
}

const TOOL_NAME = 'workbench.creative.preview_idea_patch' as const;

/**
 * previewStoredIdeaPatch reads a stored PatchPlan by patchPlanId and returns
 * a compact summary. It never mutates PatchPlanStore, session store, or source files.
 */
export function previewStoredIdeaPatch(
  input: unknown,
  patchStore?: PatchPlanStore,
): IdeaPatchPreviewResult {
  const record = recordOf(input);
  const patchPlanId = record ? firstString(record.patchPlanId, record.patchPlanRef, record.patchPlan) : undefined;

  if (!patchPlanId) {
    return notFoundEnvelope('Missing patchPlanId; supply the patchPlanId returned by turn_idea_into_patch_plan.');
  }

  const patchPlan = patchStore?.getPatchPlan(patchPlanId) ?? null;
  if (!patchPlan) {
    return notFoundEnvelope(`No stored PatchPlan found for patchPlanId "${patchPlanId}".`);
  }

  return buildPreviewEnvelope(patchPlan);
}

function buildPreviewEnvelope(patchPlan: PatchPlan): IdeaPatchPreviewEnvelope {
  const affectedFiles = patchPlan.preview.affectedFiles.map((file) => file.path);
  const operationKinds = [...new Set(patchPlan.operations.map((op) => op.kind))].sort() as PatchOperation['kind'][];
  const patchPlanResource = buildPatchPlanUri(patchPlan.patchPlanId);
  const preApplyValidation = extractPreApplyValidation(patchPlan);

  return {
    affectedFiles,
    expectedDiagnostics: patchPlan.expectedDiagnostics.map((d) => ({
      category: d.category,
      id: d.id,
      severity: d.severity,
    })),
    ideaId: extractIdeaId(patchPlan),
    operationKinds,
    patchPlanId: patchPlan.patchPlanId,
    patchPlanResource,
    preApplyValidation,
    preconditions: patchPlan.preconditions.map((p) => ({ kind: p.kind, message: p.message })),
    resourceLinks: patchPlan.preview.resourceLinks,
    safety: { ...patchPlan.safety },
    schema: 'risuai-workbench-mcp.creative.idea-patch',
    schemaVersion: '0.2.0',
    status: 'ok',
    tool: TOOL_NAME,
  };
}

function extractIdeaId(patchPlan: PatchPlan): string {
  const match = patchPlan.intent.match(/creative\s+idea\s+(\S+?)(?::\s|$)/i);
  return match?.[1] ?? patchPlan.patchPlanId;
}

function extractPreApplyValidation(patchPlan: PatchPlan): { required: readonly string[] } {
  const validationSteps: string[] = [];
  for (const precond of patchPlan.preconditions) {
    if (precond.kind === 'path.inside-workspace') validationSteps.push('validate_path');
    if (precond.kind === 'path.not-exists') validationSteps.push('validate_nonexistence');
  }
  for (const diag of patchPlan.expectedDiagnostics) {
    if (diag.id === 'CREATIVE_PATCH_PREVIEW_CREATED') validationSteps.push('query_token_budget');
  }
  return { required: [...new Set(validationSteps)] };
}

function notFoundEnvelope(message: string): DiagnosticEnvelope {
  const diagnostic: WorkbenchDiagnostic = {
    category: 'creative-patch-plan',
    id: 'CREATIVE_PATCH_PLAN_NOT_FOUND',
    message,
    path: null,
    ruleId: 'creative.patch-plan.not-found',
    severity: 'error',
  };
  return createDiagnosticEnvelope({
    diagnostics: [diagnostic],
    status: 'domain_error',
    tool: TOOL_NAME,
  });
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
