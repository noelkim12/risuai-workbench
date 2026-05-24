/**
 * edit_frontmatter direct mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/edit-frontmatter.ts
 */

import { readFile } from 'node:fs/promises';

import { parseEditorFrontmatter } from 'risu-workbench-core';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { PatchOperation, MutationMode as PatchPlanMutationMode } from '../../contracts/patch-plan';
import { createMutationResultEnvelope, type MutationResultEnvelope } from '../../contracts/mutation-result';
import { applyPatchPlan } from '../../mutation/apply-engine';
import { computeFileHash } from '../../mutation/file-hash';
import type { MutationMode } from '../../mutation/mode';
import { createPatchPlan, createFileHashPrecondition, createInsideWorkspacePrecondition, buildUnifiedDiff } from '../../mutation/patch-preview';
import type { PatchPlanStore } from '../../mutation/patch-store';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export type EditFrontmatterToolResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface FrontmatterOperationInput {
  kind: 'set' | 'remove';
  key: string;
  value?: string;
}

export interface EditFrontmatterInput {
  path: string;
  operations: readonly FrontmatterOperationInput[];
  mode: PatchPlanMutationMode;
  preserveBody?: boolean;
  confirmation?: { accepted: boolean; confirmationText?: string };
  postValidate?: boolean;
  expectedHash?: string;
  force?: boolean;
}

const TOOL_NAME = 'workbench.edit_frontmatter';

/**
 * handleEditFrontmatter 함수.
 * artifact frontmatter에 대해 structured field operation을 preview/commit으로 실행함.
 *
 * @param input - path, operations, mode, confirmation, preserveBody, force
 * @param workspace - workspace root 상태
 * @param mutationMode - 서버 mutation mode
 * @param patchStore - 공유 patch plan store
 * @returns mutation result 또는 diagnostic envelope
 */
export async function handleEditFrontmatter(
  input: unknown,
  workspace: WorkspaceRootStatus,
  mutationMode: MutationMode,
  patchStore: PatchPlanStore,
): Promise<EditFrontmatterToolResult> {
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({
    allowedKeys: ['path', 'operations', 'mode', 'preserveBody', 'confirmation', 'postValidate', 'expectedHash', 'force'],
    input,
    tool: TOOL_NAME,
  });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  const parsed = parseEditFrontmatterInput(input);
  if (!parsed.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'input', id: 'EDIT_FRONTMATTER_INPUT_INVALID', message: parsed.reason, path: null, ruleId: 'input.edit-frontmatter', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const editInput = parsed.input;

  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: 'Workspace root is not available.', path: null, ruleId: 'workspace.unavailable', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const safePath = await resolveSafeWorkspacePath({ inputPath: editInput.path, intent: 'read-existing', workspace });
  if (!safePath.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'PATH_OUTSIDE_WORKSPACE', message: `Path resolves outside workspace: ${editInput.path} (${safePath.reason}).`, path: editInput.path, ruleId: 'path.boundary', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  let currentContent = '';
  let currentHash: string | undefined;
  try {
    currentContent = await readFile(safePath.absolutePath, 'utf8');
    currentHash = await computeFileHash(safePath.absolutePath);
  } catch {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'frontmatter', id: 'FILE_MISSING', message: `Cannot read file at ${editInput.path}.`, path: editInput.path, ruleId: 'frontmatter.missing', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const warnings: Array<{ code: string; message: string; severity: string }> = [];
  const block = parseEditorFrontmatter(currentContent, warnings as never[]);
  if (!block) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'frontmatter', id: 'FRONTMATTER_MISSING_DELIMITER', message: `File at ${editInput.path} has no parseable frontmatter block.`, path: editInput.path, ruleId: 'frontmatter.missing-delimiter', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const hasParserWarnings = warnings.length > 0;
  if (hasParserWarnings && editInput.mode === 'commit' && !editInput.force) {
    return createDiagnosticEnvelope({
      data: { hasParserWarnings: true, previewOnly: true },
      diagnostics: [
        { category: 'frontmatter', id: 'FRONTMATTER_UNSAFE_COMMIT', message: 'Malformed frontmatter detected. Use preview mode first or set force=true.', path: editInput.path, ruleId: 'frontmatter.unsafe-commit', severity: 'error' },
        ...warnings.map((w) => ({ category: 'frontmatter' as const, id: `FRONTMATTER_${w.code.toUpperCase()}` as string, message: w.message, path: editInput.path as string | null, ruleId: `frontmatter.${w.code}` as string, severity: (w.severity === 'error' ? 'error' : 'warning') as 'error' | 'warning' })),
      ],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const preserveBody = editInput.preserveBody !== false;
  const patchOperations: PatchOperation[] = editInput.operations.map((operation) => {
    if (operation.kind === 'set') return { kind: 'frontmatter.set' as const, path: editInput.path, key: operation.key, value: operation.value ?? '' };
    return { kind: 'frontmatter.remove' as const, path: editInput.path, key: operation.key };
  });

  const previewContent = buildFrontmatterPreview(currentContent, block, editInput.operations, preserveBody);
  const effectiveHash = editInput.expectedHash ?? currentHash;

  const patchPlan = createPatchPlan({
    expectedDiagnostics: [],
    intent: `edit_frontmatter: ${editInput.operations.map((o) => `${o.kind} ${o.key}`).join(', ')}`,
    operations: patchOperations,
    preconditions: [
      createFileHashPrecondition(editInput.path, effectiveHash ?? ''),
      createInsideWorkspacePrecondition(editInput.path),
    ],
    safety: { destructive: editInput.operations.some((o) => o.kind === 'remove'), requiresConfirmation: true, touchesGeneratedOnly: false, touchesSourceArtifacts: true },
    unifiedDiff: buildUnifiedDiff(editInput.path, currentContent, previewContent),
    workspaceRoot: workspace.path,
  });

  patchStore.savePatchPlan(patchPlan);

  if (mutationMode === 'preview-only') {
    return createDiagnosticEnvelope({
      data: { bodyPreserved: preserveBody, patchPlan, preview: true },
      diagnostics: warnings.map((w) => ({ category: 'frontmatter' as const, id: `FRONTMATTER_${w.code.toUpperCase()}` as string, message: w.message, path: editInput.path as string | null, ruleId: `frontmatter.${w.code}` as string, severity: (w.severity === 'error' ? 'warning' : 'info') as 'warning' | 'info' })),
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  const safetyResult = await evaluateMutationSafetyGate({
    confirmation: editInput.confirmation ? { accepted: editInput.confirmation.accepted, confirmationText: editInput.confirmation.confirmationText } : undefined,
    expectedConfirmationText: `APPLY ${patchPlan.patchPlanId}`,
    mode: mutationMode,
    risk: 'medium',
    targets: [{ expectedHash: effectiveHash, intent: 'write-existing' as const, path: editInput.path }],
    toolName: TOOL_NAME,
    workspace,
  });

  if (!safetyResult.ok) {
    return createMutationResultEnvelope({
      changedFiles: [],
      patchPlanId: patchPlan.patchPlanId,
      postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'EDIT_FRONTMATTER_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: editInput.path, ruleId: `edit-frontmatter.${safetyResult.reason}`, severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'rejected',
      tool: TOOL_NAME,
    });
  }

  return applyPatchPlan({
    confirmation: editInput.confirmation ? { accepted: editInput.confirmation.accepted, confirmationText: editInput.confirmation.confirmationText } : undefined,
    mutationMode,
    options: { postValidate: editInput.postValidate !== false },
    patchPlan,
    workspace,
  });
}

/**
 * buildFrontmatterPreview 함수.
 * frontmatter operation을 적용한 preview 내용을 생성함.
 *
 * @param source - 원문 파일 내용
 * @param block - parseEditorFrontmatter 결과
 * @param operations - frontmatter operations
 * @param preserveBody - 본문 보존 여부
 * @returns 수정된 내용
 */
function buildFrontmatterPreview(
  source: string,
  block: { raw: string; range: { endOffset: number } },
  operations: readonly FrontmatterOperationInput[],
  preserveBody: boolean,
): string {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const fields = new Map<string, string>();
  for (const rawLine of block.raw.split(/\r?\n/)) {
    if (rawLine.trim() === '' || !rawLine.includes(':')) continue;
    fields.set(rawLine.slice(0, rawLine.indexOf(':')).trim(), rawLine.slice(rawLine.indexOf(':') + 1).trim());
  }
  for (const operation of operations) {
    if (operation.kind === 'set') fields.set(operation.key, operation.value ?? '');
    if (operation.kind === 'remove') fields.delete(operation.key);
  }
  const frontmatter = ['---', ...[...fields].map(([key, value]) => `${key}: ${value}`), '---'].join(newline);
  if (preserveBody) {
    return `${frontmatter}${newline}${source.slice(block.range.endOffset)}`;
  }
  return frontmatter;
}

/**
 * parseEditFrontmatterInput 함수.
 * unknown raw input을 EditFrontmatterInput으로 검증함.
 *
 * @param input - raw tool input
 * @returns parsed input 또는 reject reason
 */
function parseEditFrontmatterInput(input: unknown): { input: EditFrontmatterInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'Input must be an object.' };
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.path !== 'string' || candidate.path.trim() === '') {
    return { ok: false, reason: 'path must be a non-empty string.' };
  }
  if (!Array.isArray(candidate.operations) || candidate.operations.length === 0) {
    return { ok: false, reason: 'operations must be a non-empty array.' };
  }
  for (const operation of candidate.operations as FrontmatterOperationInput[]) {
    if (operation.kind !== 'set' && operation.kind !== 'remove') {
      return { ok: false, reason: `Invalid operation kind: ${operation.kind}.` };
    }
    if (typeof operation.key !== 'string') {
      return { ok: false, reason: 'Each operation must have a string key.' };
    }
  }
  const mode: PatchPlanMutationMode = 'commit';
  const confirmation = candidate.confirmation as EditFrontmatterInput['confirmation'] | undefined;
  return {
    input: {
      confirmation: confirmation ? { accepted: !!confirmation.accepted, confirmationText: confirmation.confirmationText } : undefined,
      expectedHash: typeof candidate.expectedHash === 'string' ? candidate.expectedHash : undefined,
      force: typeof candidate.force === 'boolean' ? candidate.force : undefined,
      mode,
      operations: candidate.operations as FrontmatterOperationInput[],
      path: candidate.path as string,
      postValidate: typeof candidate.postValidate === 'boolean' ? candidate.postValidate : undefined,
      preserveBody: typeof candidate.preserveBody === 'boolean' ? candidate.preserveBody : undefined,
    },
    ok: true,
  };
}
