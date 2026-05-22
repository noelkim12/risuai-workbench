/**
 * edit_metadata direct mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/edit-metadata.ts
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { PatchOperation, MutationMode as PatchPlanMutationMode } from '../../contracts/patch-plan';
import { createMutationResultEnvelope, type MutationResultEnvelope, type ChangedFileResult } from '../../contracts/mutation-result';
import { computeFileHash } from '../../mutation/file-hash';
import { appendJournalEntry } from '../../mutation/journal';
import type { MutationMode } from '../../mutation/mode';
import { createPatchPlan, createFileHashPrecondition, createInsideWorkspacePrecondition, buildUnifiedDiff } from '../../mutation/patch-preview';
import type { PatchPlanStore } from '../../mutation/patch-store';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export type EditMetadataToolResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface MetadataOperationInput {
  kind: 'json.set';
  jsonPointer: string;
  value: unknown;
}

export interface EditMetadataInput {
  path: string;
  operations: readonly MetadataOperationInput[];
  mode: PatchPlanMutationMode;
  confirmation?: { accepted: boolean; confirmationText?: string };
  postValidate?: boolean;
  expectedHash?: string;
  allowedFields?: readonly string[];
}

const TOOL_NAME = 'workbench.edit_metadata';

/**
 * handleEditMetadata 함수.
 * structured metadata JSON에 대해 json.set operation을 preview/commit으로 실행함.
 *
 * @param input - path, operations, mode, confirmation, allowedFields
 * @param workspace - workspace root 상태
 * @param mutationMode - 서버 mutation mode
 * @param patchStore - 공유 patch plan store
 * @returns mutation result 또는 diagnostic envelope
 */
export async function handleEditMetadata(
  input: unknown,
  workspace: WorkspaceRootStatus,
  mutationMode: MutationMode,
  patchStore: PatchPlanStore,
): Promise<EditMetadataToolResult> {
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({
    allowedKeys: ['path', 'operations', 'mode', 'confirmation', 'postValidate', 'expectedHash', 'allowedFields'],
    input,
    tool: TOOL_NAME,
  });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  const parsed = parseEditMetadataInput(input);
  if (!parsed.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'input', id: 'EDIT_METADATA_INPUT_INVALID', message: parsed.reason, path: null, ruleId: 'input.edit-metadata', severity: 'error' }],
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
      diagnostics: [{ category: 'metadata', id: 'FILE_MISSING', message: `Cannot read file at ${editInput.path}.`, path: editInput.path, ruleId: 'metadata.missing', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(currentContent);
  } catch {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'metadata', id: 'METADATA_JSON_PARSE_FAILED', message: `File at ${editInput.path} is not valid JSON.`, path: editInput.path, ruleId: 'metadata.json-parse', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  if (editInput.allowedFields && editInput.allowedFields.length > 0) {
    const unknownFields = checkUnknownFields(parsedJson, editInput.operations, editInput.allowedFields);
    if (unknownFields.length > 0) {
      return createDiagnosticEnvelope({
        diagnostics: [{ category: 'metadata', id: 'METADATA_UNKNOWN_FIELD', message: `Unknown fields rejected by schema policy: ${unknownFields.join(', ')}.`, path: editInput.path, ruleId: 'metadata.unknown-field', severity: 'error' }],
        status: 'domain_error',
        tool: TOOL_NAME,
      });
    }
  }

  const patchOperations: PatchOperation[] = editInput.operations.map((operation) => ({
    kind: 'json.set' as const,
    path: editInput.path,
    jsonPointer: operation.jsonPointer,
    value: operation.value,
  }));

  const previewContent = buildMetadataPreview(currentContent, editInput.operations);
  const effectiveHash = editInput.expectedHash ?? currentHash;

  const patchPlan = createPatchPlan({
    expectedDiagnostics: [],
    intent: `edit_metadata: ${editInput.operations.map((o) => o.jsonPointer).join(', ')}`,
    operations: patchOperations,
    preconditions: [
      createFileHashPrecondition(editInput.path, effectiveHash ?? ''),
      createInsideWorkspacePrecondition(editInput.path),
    ],
    safety: { destructive: false, requiresConfirmation: true, touchesGeneratedOnly: false, touchesSourceArtifacts: true },
    unifiedDiff: previewContent ? buildUnifiedDiff(editInput.path, currentContent, previewContent) : undefined,
    workspaceRoot: workspace.path,
  });

  patchStore.savePatchPlan(patchPlan);

  if (editInput.mode === 'preview') {
    return createDiagnosticEnvelope({
      data: { patchPlan, preview: true },
      diagnostics: [],
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
      postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'EDIT_METADATA_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: editInput.path, ruleId: `edit-metadata.${safetyResult.reason}`, severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'rejected',
      tool: TOOL_NAME,
    });
  }

  const afterContent = buildMetadataPreview(currentContent, editInput.operations);
  if (!afterContent) {
    return createMutationResultEnvelope({
      changedFiles: [],
      patchPlanId: patchPlan.patchPlanId,
      postValidation: { diagnostics: [{ category: 'metadata', id: 'METADATA_PREVIEW_FAILED', message: 'Could not compute metadata preview.', path: editInput.path, ruleId: 'metadata.preview-failed', severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'failed',
      tool: TOOL_NAME,
    });
  }

  await writeFile(safePath.absolutePath, afterContent, 'utf8');
  const afterHash = await computeFileHash(safePath.absolutePath);

  const changedFiles: ChangedFileResult[] = [
    { path: editInput.path, operationCount: editInput.operations.length, beforeHash: currentHash ?? undefined, afterHash },
  ];

  const journalPath = path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl');
  const mutationId = `mutation:${Date.now().toString(36)}:${editInput.path.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 20)}`;
  await appendJournalEntry(journalPath, {
    affectedFiles: [editInput.path],
    mutationId,
    patchOperations: [...patchPlan.operations],
    postValidation: { diagnostics: [], status: 'ok' },
    status: 'applied',
    toolName: TOOL_NAME,
  });

  return createMutationResultEnvelope({
    appliedAt: new Date().toISOString(),
    changedFiles,
    mutationId,
    patchPlanId: patchPlan.patchPlanId,
    postValidation: { diagnostics: [], status: 'ok' },
    resourceLinks: [`risuai-workbench://mutations/journal/${mutationId}`],
    status: 'applied',
    tool: TOOL_NAME,
  });
}

/**
 * checkUnknownFields 함수.
 * json.set operation이 schema policy에 정의되지 않은 field를 수정하는지 검사함.
 *
 * @param parsedJson - 현재 JSON 내용
 * @param operations - json.set operations
 * @param allowedFields - schema에서 허용하는 field 목록
 * @returns 거부된 field 이름 목록
 */
function checkUnknownFields(_parsedJson: unknown, operations: readonly MetadataOperationInput[], allowedFields: readonly string[]): string[] {
  const unknown: string[] = [];
  for (const operation of operations) {
    if (operation.jsonPointer.startsWith('/')) {
      const field = operation.jsonPointer.split('/')[1];
      if (field && !allowedFields.includes(field)) {
        unknown.push(field);
      }
    }
  }
  return [...new Set(unknown)];
}

/**
 * buildMetadataPreview 함수.
 * json.set operation을 적용한 preview JSON 내용을 생성함.
 *
 * @param currentContent - 현재 JSON 내용
 * @param operations - json.set operations
 * @returns 수정된 JSON 문자열 또는 null
 */
function buildMetadataPreview(currentContent: string, operations: readonly MetadataOperationInput[]): string | null {
  try {
    const parsed = JSON.parse(currentContent) as Record<string, unknown>;
    const next = { ...parsed };
    for (const operation of operations) {
      if (operation.jsonPointer.startsWith('/')) {
        const segments = operation.jsonPointer.split('/').slice(1);
        let target: Record<string, unknown> = next;
        for (let i = 0; i < segments.length - 1; i++) {
          const segment = segments[i];
          if (typeof target[segment] !== 'object' || target[segment] === null) {
            target[segment] = {};
          }
          target = target[segment] as Record<string, unknown>;
        }
        target[segments[segments.length - 1]] = operation.value;
      }
    }
    return `${JSON.stringify(next, null, 2)}\n`;
  } catch {
    return null;
  }
}

/**
 * parseEditMetadataInput 함수.
 * unknown raw input을 EditMetadataInput으로 검증함.
 *
 * @param input - raw tool input
 * @returns parsed input 또는 reject reason
 */
function parseEditMetadataInput(input: unknown): { input: EditMetadataInput; ok: true } | { ok: false; reason: string } {
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
  for (const operation of candidate.operations as MetadataOperationInput[]) {
    if (operation.kind !== 'json.set') {
      return { ok: false, reason: `Invalid operation kind: ${operation.kind}. Only json.set is supported.` };
    }
    if (typeof operation.jsonPointer !== 'string' || !operation.jsonPointer.startsWith('/')) {
      return { ok: false, reason: 'Each operation must have a jsonPointer starting with /.' };
    }
  }
  const mode: PatchPlanMutationMode = candidate.mode === 'commit' ? 'commit' : 'preview';
  const confirmation = candidate.confirmation as EditMetadataInput['confirmation'] | undefined;
  return {
    input: {
      allowedFields: Array.isArray(candidate.allowedFields) ? candidate.allowedFields as string[] : undefined,
      confirmation: confirmation ? { accepted: !!confirmation.accepted, confirmationText: confirmation.confirmationText } : undefined,
      expectedHash: typeof candidate.expectedHash === 'string' ? candidate.expectedHash : undefined,
      mode,
      operations: candidate.operations as MetadataOperationInput[],
      path: candidate.path as string,
      postValidate: typeof candidate.postValidate === 'boolean' ? candidate.postValidate : undefined,
    },
    ok: true,
  };
}
