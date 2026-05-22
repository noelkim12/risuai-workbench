/**
 * Thin handlers for selected idea implementation-plan and PatchPlan conversion.
 * @file packages/risuai-workbench-mcp/src/tools/creative/idea-to-patch-handlers.ts
 */

import { turnIdeaIntoImplementationPlan, turnIdeaIntoStoredPatchPlan, type TurnIdeaIntoPatchPlanResult, type TurnIdeaIntoPlanResult } from '../../creative/idea-to-patch-plan';
import type { PatchPlanStore } from '../../mutation/patch-store';
import type { WorkspaceRootStatus } from '../../project/resolve-root';

export async function handleTurnIdeaIntoPlan(input: unknown): Promise<TurnIdeaIntoPlanResult> {
  return turnIdeaIntoImplementationPlan(input);
}

export async function handleTurnIdeaIntoPatchPlan(
  input: unknown,
  workspace: WorkspaceRootStatus,
  patchStore?: PatchPlanStore,
): Promise<TurnIdeaIntoPatchPlanResult> {
  return turnIdeaIntoStoredPatchPlan(input, { patchStore, workspaceRoot: workspace.ok ? workspace.path : undefined });
}
