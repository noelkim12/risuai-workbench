/**
 * Thin handler for applying stored creative idea PatchPlans.
 * @file packages/risuai-workbench-mcp/src/tools/creative/apply-idea-patch-handlers.ts
 */

import { applyStoredIdeaPatch, type ApplyIdeaPatchContext, type ApplyIdeaPatchResult } from '../../creative/apply-idea-patch';

export async function handleApplyIdeaPatch(input: unknown, context: ApplyIdeaPatchContext): Promise<ApplyIdeaPatchResult> {
  return applyStoredIdeaPatch(input, context);
}
