/**
 * suggest_frontmatter_patch tool handler.
 * Builds preview-only frontmatter patch plans while preserving body text by default.
 * @file packages/risuai-workbench-mcp/src/tools/patch/suggest-frontmatter-patch.ts
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { parseEditorFrontmatter, type EditorDocumentWarning } from '@risuai-workbench/core';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import type { PatchOperation } from '../../contracts/patch-plan';
import { computeFileHash } from '../../mutation/file-hash';
import { buildUnifiedDiff, createFileHashPrecondition, createInsideWorkspacePrecondition, createPatchPlan } from '../../mutation/patch-preview';
import type { PatchPlanStore } from '../../mutation/patch-store';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export interface SuggestFrontmatterPatchInput {
  path: string;
  set?: Record<string, string>;
  remove?: readonly string[];
  preserveBody?: boolean;
  intent?: string;
}

/**
 * handleSuggestFrontmatterPatch 함수.
 * frontmatter field 변경/repair preview를 만들고 원문 body 보존 여부를 data로 증명함.
 *
 * @param input - target path와 frontmatter field 변경 요청
 * @param workspace - workspace root 상태
 * @param patchStore - 생성한 patch plan을 apply 단계까지 보존할 store
 * @returns preview-only PatchPlan을 data에 담은 diagnostic envelope
 */
export async function handleSuggestFrontmatterPatch(
  input: SuggestFrontmatterPatchInput,
  workspace: WorkspaceRootStatus,
  patchStore?: PatchPlanStore,
): Promise<DiagnosticEnvelope> {
  const tool = 'workbench.suggest_frontmatter_patch';
  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${workspace.reason}`, path: input.path, ruleId: 'workspace.root-unavailable', severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  const safeResult = await resolveSafeWorkspacePath({ inputPath: input.path, intent: 'read-existing', workspace });
  if (!safeResult.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'PATH_RESOLVE_FAILED', message: `Path resolution failed: ${safeResult.reason}`, path: input.path, ruleId: `path.${safeResult.reason}`, severity: 'error' }],
      status: 'domain_error',
      tool,
    });
  }

  const source = await readFile(safeResult.absolutePath, 'utf8');
  const warnings: EditorDocumentWarning[] = [];
  const block = parseEditorFrontmatter(source, warnings);
  const diagnostics = warnings.map((warning): WorkbenchDiagnostic => ({
    category: 'frontmatter',
    id: warning.severity === 'error' ? 'FRONTMATTER_MALFORMED' : 'FRONTMATTER_REPAIR_PREVIEW',
    message: warning.message,
    path: safeResult.relativePath,
    ruleId: `frontmatter.${warning.code}`,
    severity: warning.severity as 'error' | 'warning' | 'info',
  }));

  if (block === null) {
    const patchPlan = createPatchPlan({
      expectedDiagnostics: diagnostics.map((diagnostic) => ({ category: diagnostic.category, id: diagnostic.id, severity: diagnostic.severity })),
      intent: input.intent ?? `Preview frontmatter repair for ${safeResult.relativePath}`,
      operations: [],
      preconditions: [createInsideWorkspacePrecondition(safeResult.relativePath), createFileHashPrecondition(safeResult.relativePath, await computeFileHash(safeResult.absolutePath))],
      workspaceRoot: safeResult.rootPath,
    });
    patchStore?.savePatchPlan(patchPlan);
    return createDiagnosticEnvelope({
      data: { patchPlan, repairPreviewOnly: true, writePolicy: 'preview-only' },
      diagnostics,
      status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'domain_error' : 'domain_warning',
      tool,
    });
  }

  const nextSource = renderFrontmatterPreview(source, block, input);
  const bodyBefore = source.slice(block.range.endOffset);
  const bodyAfter = nextSource.slice(nextSource.length - bodyBefore.length);
  const operations = buildFrontmatterOperations(safeResult.relativePath, input, source, nextSource, block.range.endOffset, bodyBefore.length);
  const expectedHash = await computeFileHash(safeResult.absolutePath);
  const patchPlan = createPatchPlan({
    expectedDiagnostics: diagnostics.map((diagnostic) => ({ category: diagnostic.category, id: diagnostic.id, severity: diagnostic.severity })),
    intent: input.intent ?? `Preview frontmatter changes for ${safeResult.relativePath}`,
    operations,
    preconditions: [createInsideWorkspacePrecondition(safeResult.relativePath), createFileHashPrecondition(safeResult.relativePath, expectedHash)],
    unifiedDiff: buildUnifiedDiff(safeResult.relativePath, source, nextSource),
    workspaceRoot: safeResult.rootPath,
  });
  patchStore?.savePatchPlan(patchPlan);

  return createDiagnosticEnvelope({
    data: {
      bodyPreserved: hashText(bodyBefore) === hashText(bodyAfter),
      patchPlan,
      previewText: nextSource,
      repairPreviewOnly: diagnostics.length > 0,
      writePolicy: 'preview-only',
    },
    diagnostics: diagnostics.length > 0 ? diagnostics : [{ category: 'frontmatter', id: 'FRONTMATTER_PATCH_PREVIEW_CREATED', message: `Preview generated for ${safeResult.relativePath}; no files were written.`, path: safeResult.relativePath, ruleId: 'frontmatter.preview-only', severity: 'info' }],
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? 'domain_error'
      : diagnostics.some((diagnostic) => diagnostic.severity === 'warning')
        ? 'domain_warning'
        : 'ok',
    tool,
  });
}

type ParsedFrontmatterBlock = NonNullable<ReturnType<typeof parseEditorFrontmatter>>;

/**
 * renderFrontmatterPreview 함수.
 * frontmatter block만 재조립하고 body slice는 원문 그대로 보존함.
 *
 * @param source - 전체 원문
 * @param block - parse된 frontmatter block
 * @param input - field 변경 요청
 * @returns preview source text
 */
function renderFrontmatterPreview(source: string, block: ParsedFrontmatterBlock, input: SuggestFrontmatterPatchInput): string {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const setEntries = new Map(Object.entries(input.set ?? {}));
  const removeEntries = new Set(input.remove ?? []);
  const emitted = new Set<string>();
  const lines: string[] = [];

  for (const rawLine of block.raw.split(/\r?\n/)) {
    if (rawLine.trim() === '' || !rawLine.includes(':')) continue;
    const key = rawLine.slice(0, rawLine.indexOf(':')).trim();
    if (removeEntries.has(key)) continue;
    if (setEntries.has(key)) {
      lines.push(`${key}: ${setEntries.get(key)}`);
      emitted.add(key);
    } else {
      lines.push(rawLine);
    }
  }

  for (const [key, value] of setEntries) {
    if (!emitted.has(key) && !removeEntries.has(key)) lines.push(`${key}: ${value}`);
  }

  return `---${newline}${lines.join(newline)}${newline}---${newline}${source.slice(block.range.endOffset)}`;
}

/**
 * buildFrontmatterOperations 함수.
 * structured frontmatter operations와 malformed block repair fallback을 구성함.
 *
 * @param filePath - workspace-relative file path
 * @param input - field 변경 요청
 * @param source - 원문
 * @param nextSource - preview 원문
 * @param frontmatterEndOffset - frontmatter block end offset
 * @returns patch operation 목록
 */
function buildFrontmatterOperations(
  filePath: string,
  input: SuggestFrontmatterPatchInput,
  source: string,
  nextSource: string,
  frontmatterEndOffset: number,
  bodyLength: number,
): PatchOperation[] {
  const operations: PatchOperation[] = [];
  for (const [key, value] of Object.entries(input.set ?? {})) {
    operations.push({ key, kind: 'frontmatter.set', path: filePath, value });
  }
  for (const key of input.remove ?? []) {
    operations.push({ key, kind: 'frontmatter.remove', path: filePath });
  }
  const nextFrontmatterEndOffset = nextSource.length - bodyLength;
  if (source.slice(0, frontmatterEndOffset) !== nextSource.slice(0, nextFrontmatterEndOffset)) {
    operations.push({ endOffset: frontmatterEndOffset, kind: 'text.replace', path: filePath, startOffset: 0, text: nextSource.slice(0, nextFrontmatterEndOffset) });
  }
  return operations;
}

/**
 * hashText 함수.
 * body 보존 여부 비교용 sha256 digest를 계산함.
 *
 * @param text - 비교할 text
 * @returns sha256 hex digest
 */
function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
