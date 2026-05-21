/**
 * Generic suggest_patch tool handler for preview-only PatchPlan construction.
 * @file packages/risuai-workbench-mcp/src/tools/suggest-patch.ts
 */

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../contracts/diagnostics';
import type { PatchOperation } from '../contracts/patch-plan';
import { createPatchPlan } from '../mutation/patch-preview';
import type { PatchPlanStore } from '../mutation/patch-store';
import type { WorkspaceRootStatus } from '../project/resolve-root';

export interface SuggestPatchInput {
  intent: string;
  operations: readonly PatchOperation[];
}

/**
 * handleSuggestPatch 함수.
 * 이미 구조화된 operation 묶음을 write 없이 PatchPlan envelope로 감쌈.
 *
 * @param input - patch intent와 operation 목록
 * @param workspace - workspace root 상태
 * @param patchStore - 생성한 patch plan을 apply 단계까지 보존할 store
 * @returns preview-only PatchPlan diagnostic envelope
 */
export async function handleSuggestPatch(
  input: SuggestPatchInput,
  workspace: WorkspaceRootStatus,
  patchStore?: PatchPlanStore,
): Promise<DiagnosticEnvelope> {
  const tool = 'workbench.suggest_patch';
  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${workspace.reason}`, path: null, ruleId: 'workspace.root-unavailable', severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  const patchPlan = createPatchPlan({
    expectedDiagnostics: [{ category: 'patch', id: 'PATCH_PREVIEW_CREATED', severity: 'info' }],
    intent: input.intent,
    operations: input.operations,
    preconditions: [],
    workspaceRoot: workspace.path,
  });
  patchStore?.savePatchPlan(patchPlan);

  return createDiagnosticEnvelope({
    data: { patchPlan, writePolicy: 'preview-only' },
    diagnostics: [{ category: 'patch', id: 'PATCH_PREVIEW_CREATED', message: 'Generic patch preview generated; no files were written.', path: null, ruleId: 'patch.preview-only', severity: 'info' }],
    status: 'ok',
    tool,
  });
}
