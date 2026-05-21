/**
 * Wiki patch preview tools for generated-surface planning and diff boundaries.
 * @file packages/risuai-workbench-mcp/src/tools/wiki-patch-preview.ts
 */

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';
import { createPatchPlan } from '../mutation/patch-preview';
import type { PatchPlanStore } from '../mutation/patch-store';
import type { WorkspaceRootStatus } from '../project/resolve-root';

export interface PlanWikiUpdateInput {
  artifactKey?: string;
}

export interface DiffWikiInput {
  paths?: readonly string[];
}

/**
 * handlePlanWikiUpdate 함수.
 * generated wiki refresh write 범위를 preview-only patch plan으로 설명함.
 *
 * @param input - 선택적 artifact key
 * @param workspace - workspace root 상태
 * @param patchStore - 생성한 patch plan을 apply 단계까지 보존할 store
 * @returns generated wiki patch plan preview envelope
 */
export async function handlePlanWikiUpdate(
  input: PlanWikiUpdateInput,
  workspace: WorkspaceRootStatus,
  patchStore?: PatchPlanStore,
): Promise<DiagnosticEnvelope> {
  const tool = 'workbench.plan_wiki_update';
  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${workspace.reason}`, path: null, ruleId: 'workspace.root-unavailable', severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  const artifactKey = input.artifactKey ?? '<artifactKey>';
  const targets = [`wiki/artifacts/${artifactKey}/_generated/**`, 'wiki/SCHEMA.md', 'wiki/_schema/**', 'wiki/_index.md marker block', 'wiki/_log.md'];
  const patchPlan = createPatchPlan({
    expectedDiagnostics: [{ category: 'wiki', id: 'WIKI_UPDATE_PLAN_PREVIEW', severity: 'info' }],
    intent: `Preview generated wiki refresh scope for ${artifactKey}`,
    operations: [],
    preconditions: [],
    safety: { touchesGeneratedOnly: true, touchesSourceArtifacts: false },
    workspaceRoot: workspace.path,
  });
  patchStore?.savePatchPlan(patchPlan);

  return createDiagnosticEnvelope({
    data: { patchPlan, protectedPaths: ['wiki/notes/**', 'wiki/domain/**', 'source artifact files', 'workspace.yaml'], targets, writePolicy: 'preview-only' },
    diagnostics: [{ category: 'wiki', id: 'WIKI_UPDATE_PLAN_PREVIEW_CREATED', message: 'Generated wiki update scope preview created; no files were written.', path: null, ruleId: 'wiki.preview-only', severity: 'info' }],
    status: 'ok',
    tool,
  });
}

/**
 * handleDiffWiki 함수.
 * diff 대상이 generated wiki write-protect boundary 안인지 검사하고 write 없이 요약함.
 *
 * @param input - diff를 요청한 wiki path 목록
 * @param workspace - workspace root 상태
 * @returns boundary diagnostics와 diff summary preview
 */
export async function handleDiffWiki(input: DiffWikiInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const tool = 'workbench.diff_wiki';
  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${workspace.reason}`, path: null, ruleId: 'workspace.root-unavailable', severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  const requested = input.paths ?? [];
  const diagnostics: WorkbenchDiagnostic[] = requested
    .filter((candidate) => !isGeneratedWikiWritable(candidate))
    .map((candidate) => ({ category: 'wiki', id: 'WIKI_DIFF_PROTECTED_PATH', message: `${candidate} is outside generated wiki write-protect boundaries.`, path: candidate, ruleId: 'wiki.protected-path', severity: 'error' }));

  return createDiagnosticEnvelope({
    data: { allowedPaths: requested.filter(isGeneratedWikiWritable), protectedPaths: requested.filter((candidate) => !isGeneratedWikiWritable(candidate)), writePolicy: 'preview-only' },
    diagnostics: diagnostics.length > 0 ? diagnostics : [{ category: 'wiki', id: 'WIKI_DIFF_PREVIEW_CREATED', message: 'Generated wiki diff preview created; no files were written.', path: null, ruleId: 'wiki.diff-preview-only', severity: 'info' }],
    status: diagnostics.length > 0 ? 'domain_error' : 'ok',
    tool,
  });
}

/**
 * isGeneratedWikiWritable 함수.
 * proposal의 generated wiki write-protect boundary에 들어오는 path인지 판정함.
 *
 * @param candidate - workspace-relative candidate path
 * @returns generated wiki mutation 허용 영역 여부
 */
function isGeneratedWikiWritable(candidate: string): boolean {
  return (
    /^wiki\/artifacts\/[^/]+\/_generated(?:\/|$)/.test(candidate) ||
    candidate === 'wiki/SCHEMA.md' ||
    candidate.startsWith('wiki/_schema/') ||
    candidate === 'wiki/_index.md' ||
    candidate === 'wiki/_log.md'
  );
}
