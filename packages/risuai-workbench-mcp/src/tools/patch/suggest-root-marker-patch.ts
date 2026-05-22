/**
 * suggest_root_marker_patch tool handler.
 * Previews root marker creation/repair without writing marker files.
 * @file packages/risuai-workbench-mcp/src/tools/patch/suggest-root-marker-patch.ts
 */

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import { createInsideWorkspacePrecondition, createNonexistencePrecondition, createPatchPlan } from '../../mutation/patch-preview';
import type { PatchPlanStore } from '../../mutation/patch-store';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export interface SuggestRootMarkerPatchInput {
  markerPath: string;
  content?: string;
  intent?: string;
}

/**
 * handleSuggestRootMarkerPatch 함수.
 * root marker create preview를 file.create operation으로 표현함.
 *
 * @param input - 생성/수리할 marker path
 * @param workspace - workspace root 상태
 * @param patchStore - 생성한 patch plan을 apply 단계까지 보존할 store
 * @returns preview-only PatchPlan diagnostic envelope
 */
export async function handleSuggestRootMarkerPatch(
  input: SuggestRootMarkerPatchInput,
  workspace: WorkspaceRootStatus,
  patchStore?: PatchPlanStore,
): Promise<DiagnosticEnvelope> {
  const tool = 'workbench.suggest_root_marker_patch';
  const safeResult = await resolveSafeWorkspacePath({ inputPath: input.markerPath, intent: 'create-missing', workspace });
  if (!safeResult.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'PATH_RESOLVE_FAILED', message: `Path resolution failed: ${safeResult.reason}`, path: input.markerPath, ruleId: `path.${safeResult.reason}`, severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  const patchPlan = createPatchPlan({
    expectedDiagnostics: [{ category: 'root-marker', id: 'ROOT_MARKER_PATCH_PREVIEW', severity: 'info' }],
    intent: input.intent ?? `Preview root marker creation for ${safeResult.relativePath}`,
    operations: [{ content: input.content ?? '{}\n', kind: 'file.create', overwrite: false, path: safeResult.relativePath }],
    preconditions: [createInsideWorkspacePrecondition(safeResult.relativePath), createNonexistencePrecondition(safeResult.relativePath)],
    workspaceRoot: safeResult.rootPath,
  });
  patchStore?.savePatchPlan(patchPlan);

  return createDiagnosticEnvelope({
    data: { patchPlan, writePolicy: 'preview-only' },
    diagnostics: [{ category: 'root-marker', id: 'ROOT_MARKER_PATCH_PREVIEW_CREATED', message: `Preview generated for ${safeResult.relativePath}; no files were written.`, path: safeResult.relativePath, ruleId: 'root-marker.preview-only', severity: 'info' }],
    status: 'ok',
    tool,
  });
}
