/**
 * Thin handler for previewing stored creative idea PatchPlans.
 * @file packages/risuai-workbench-mcp/src/tools/creative/idea-patch-preview-handlers.ts
 */

import { previewStoredIdeaPatch, type IdeaPatchPreviewResult } from '../../creative/idea-patch-preview';
import type { PatchPlanStore } from '../../mutation/patch-store';

export async function handlePreviewIdeaPatch(
  input: unknown,
  patchStore?: PatchPlanStore,
): Promise<IdeaPatchPreviewResult> {
  return previewStoredIdeaPatch(input, patchStore);
}
