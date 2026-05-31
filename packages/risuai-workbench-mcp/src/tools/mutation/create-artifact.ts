/**
 * create_artifact direct mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/create-artifact.ts
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildCanonicalArtifactPath,
  isCustomExtensionTarget,
  isCustomExtensionArtifact,
  type CustomExtensionTarget,
  type CustomExtensionArtifact,
} from 'risu-workbench-core';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import type { PatchOperation, MutationMode as PatchPlanMutationMode } from '../../contracts/patch-plan';
import { createMutationResultEnvelope, type MutationResultEnvelope, type ChangedFileResult, type PostValidationResult } from '../../contracts/mutation-result';
import { computeFileHash } from '../../mutation/file-hash';
import { appendJournalEntry, type MutationJournalStatus } from '../../mutation/journal';
import type { MutationMode } from '../../mutation/mode';
import { createPatchPlan, createNonexistencePrecondition, createInsideWorkspacePrecondition } from '../../mutation/patch-preview';
import type { PatchPlanStore } from '../../mutation/patch-store';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export type CreateArtifactToolResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface CreateArtifactInput {
  target: string;
  artifact: string;
  root: string;
  stem: string;
  initialFrontmatter?: Record<string, string>;
  body?: string;
  order?: { insert: boolean; index?: number };
  mode: PatchPlanMutationMode;
  confirmation?: { accepted: boolean; confirmationText?: string };
  postValidate?: boolean;
}

const TOOL_NAME = 'workbench.create_artifact';

/**
 * handleCreateArtifact 함수.
 * canonical path에 새 artifact 파일을 생성하고 필요하면 `_order.json`에 추가함.
 *
 * @param input - target, artifact, root, stem, initialFrontmatter, body, order, mode
 * @param workspace - workspace root 상태
 * @param mutationMode - 서버 mutation mode
 * @param patchStore - 공유 patch plan store
 * @returns mutation result 또는 diagnostic envelope
 */
export async function handleCreateArtifact(
  input: unknown,
  workspace: WorkspaceRootStatus,
  mutationMode: MutationMode,
  patchStore: PatchPlanStore,
): Promise<CreateArtifactToolResult> {
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({
    allowedKeys: ['target', 'artifact', 'root', 'stem', 'initialFrontmatter', 'body', 'order', 'mode', 'confirmation', 'postValidate'],
    input,
    tool: TOOL_NAME,
  });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  const parsed = parseCreateArtifactInput(input);
  if (!parsed.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'input', id: 'CREATE_ARTIFACT_INPUT_INVALID', message: parsed.reason, path: null, ruleId: 'input.create-artifact', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const createInput = parsed.input;

  if (!isCustomExtensionTarget(createInput.target)) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'create-artifact', id: 'INVALID_TARGET', message: `"${createInput.target}" is not a valid target.`, path: null, ruleId: 'create-artifact.invalid-target', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  if (!isCustomExtensionArtifact(createInput.artifact)) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'create-artifact', id: 'INVALID_ARTIFACT', message: `"${createInput.artifact}" is not a valid artifact type.`, path: null, ruleId: 'create-artifact.invalid-artifact', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: 'Workspace root is not available.', path: null, ruleId: 'workspace.unavailable', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const canonicalPath = buildCanonicalArtifactPath({
    artifact: createInput.artifact as CustomExtensionArtifact,
    stem: createInput.stem,
    target: createInput.target as CustomExtensionTarget,
    targetName: createInput.root,
  });

  const safeTargetPath = await resolveSafeWorkspacePath({ inputPath: canonicalPath, intent: 'create-missing', workspace });
  if (!safeTargetPath.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'PATH_OUTSIDE_WORKSPACE', message: `Path resolves outside workspace: ${canonicalPath} (${safeTargetPath.reason}).`, path: canonicalPath, ruleId: 'path.boundary', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  let targetExists = false;
  try {
    await readFile(safeTargetPath.absolutePath, 'utf8');
    targetExists = true;
  } catch {
    targetExists = false;
  }

  if (targetExists) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'create-artifact', id: 'FILE_ALREADY_EXISTS', message: `File already exists at ${canonicalPath}.`, path: canonicalPath, ruleId: 'create-artifact.already-exists', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const fileContent = buildArtifactContent(createInput.initialFrontmatter, createInput.body);
  const operations: PatchOperation[] = [
    { kind: 'file.create', path: canonicalPath, content: fileContent },
  ];

  const preconditions = [
    createNonexistencePrecondition(canonicalPath),
    createInsideWorkspacePrecondition(canonicalPath),
  ];

  let orderPath: string | undefined;
  let safeOrderPath: { absolutePath: string } | undefined;
  if (createInput.order?.insert) {
    const dir = path.dirname(canonicalPath);
    orderPath = `${dir}/_order.json`;
    operations.push({ kind: 'order.insert', orderPath, entry: path.basename(canonicalPath), index: createInput.order.index });
    const safeOrder = await resolveSafeWorkspacePath({ inputPath: orderPath, intent: 'read-existing', workspace });
    let orderExists = false;
    if (safeOrder.ok) {
      try {
        await readFile(safeOrder.absolutePath, 'utf8');
        orderExists = true;
      } catch {
        orderExists = false;
      }
    }
    safeOrderPath = safeOrder.ok ? safeOrder : undefined;
    if (orderExists && safeOrderPath) {
      const orderHash = await computeFileHash(safeOrderPath.absolutePath);
      preconditions.push({ kind: 'file.hash' as const, path: orderPath, expectedHash: orderHash, message: `Order file hash must match at apply time.` });
    } else {
      operations.push({ kind: 'file.create', path: orderPath, content: `${JSON.stringify([path.basename(canonicalPath)], null, 2)}\n` });
      preconditions.push(createNonexistencePrecondition(orderPath));
    }
    preconditions.push(createInsideWorkspacePrecondition(orderPath));
  }

  const patchPlan = createPatchPlan({
    expectedDiagnostics: [],
    intent: `create_artifact: ${canonicalPath}`,
    operations,
    preconditions,
    safety: { destructive: false, requiresConfirmation: true, touchesGeneratedOnly: false, touchesSourceArtifacts: true },
    workspaceRoot: workspace.path,
  });

  patchStore.savePatchPlan(patchPlan);

  if (mutationMode === 'preview-only') {
    return createDiagnosticEnvelope({
      data: { canonicalPath, patchPlan, preview: true },
      diagnostics: [],
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  const safetyTargets: Array<{ expectedHash?: string; intent: 'create-missing' | 'write-existing'; path: string }> = [{ path: canonicalPath, intent: 'create-missing' }];
  if (orderPath && safeOrderPath) {
    let orderExistsForIntent = false;
    try {
      await readFile(safeOrderPath.absolutePath, 'utf8');
      orderExistsForIntent = true;
    } catch {
      orderExistsForIntent = false;
    }
    safetyTargets.push({ path: orderPath, intent: orderExistsForIntent ? 'write-existing' : 'create-missing' });
  }

  const safetyResult = await evaluateMutationSafetyGate({
    confirmation: createInput.confirmation ? { accepted: createInput.confirmation.accepted, confirmationText: createInput.confirmation.confirmationText } : undefined,
    expectedConfirmationText: `APPLY ${patchPlan.patchPlanId}`,
    mode: mutationMode,
    risk: 'medium',
    targets: safetyTargets,
    toolName: TOOL_NAME,
    workspace,
  });

  if (!safetyResult.ok) {
    return createMutationResultEnvelope({
      changedFiles: [],
      patchPlanId: patchPlan.patchPlanId,
      postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'CREATE_ARTIFACT_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: canonicalPath, ruleId: `create-artifact.${safetyResult.reason}`, severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'rejected',
      tool: TOOL_NAME,
    });
  }

  const beforeHash = await computeFileHash(safeTargetPath.absolutePath).catch(() => null);
  await mkdir(path.dirname(safeTargetPath.absolutePath), { recursive: true });
  await writeFile(safeTargetPath.absolutePath, fileContent, 'utf8');
  const afterHash = await computeFileHash(safeTargetPath.absolutePath);

  const changedFiles: ChangedFileResult[] = [
    { path: canonicalPath, operationCount: 1, beforeHash: beforeHash ?? undefined, afterHash },
  ];

  if (orderPath && safeOrderPath) {
    const orderAbsolutePath = safeOrderPath.absolutePath;
    const orderBeforeHash = await computeFileHash(orderAbsolutePath).catch(() => null);
    let nextOrder: string[];
    if (orderBeforeHash) {
      const existingOrder = JSON.parse(await readFile(orderAbsolutePath, 'utf8')) as string[];
      nextOrder = [...existingOrder];
      const entry = path.basename(canonicalPath);
      if (!nextOrder.includes(entry)) {
        const index = createInput.order?.index ?? nextOrder.length;
        nextOrder.splice(Math.max(0, Math.min(index, nextOrder.length)), 0, entry);
      }
    } else {
      nextOrder = [path.basename(canonicalPath)];
    }
    await mkdir(path.dirname(orderAbsolutePath), { recursive: true });
    await writeFile(orderAbsolutePath, `${JSON.stringify(nextOrder, null, 2)}\n`, 'utf8');
    const orderAfterHash = await computeFileHash(orderAbsolutePath);
    changedFiles.push({ path: orderPath, operationCount: 1, beforeHash: orderBeforeHash ?? undefined, afterHash: orderAfterHash });
  }

  const postValidation = createInput.postValidate !== false
    ? await runCreatePostValidation(canonicalPath, safeTargetPath.absolutePath, orderPath, safeOrderPath, workspace)
    : { diagnostics: [], status: 'not_run' as const };

  const resultStatus = postValidation.status === 'error' ? 'failed' : 'applied';
  const journalStatus: MutationJournalStatus = postValidation.status === 'error' ? 'failed-validation' : 'applied';
  const journalPath = path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl');
  const mutationId = `mutation:${Date.now().toString(36)}:${canonicalPath.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 20)}`;

  await appendJournalEntry(journalPath, {
    affectedFiles: changedFiles.map((f) => f.path),
    mutationId,
    patchOperations: [...patchPlan.operations],
    postValidation,
    status: journalStatus,
    toolName: TOOL_NAME,
  });

  return createMutationResultEnvelope({
    appliedAt: new Date().toISOString(),
    changedFiles,
    mutationId,
    patchPlanId: patchPlan.patchPlanId,
    postValidation,
    resourceLinks: [`risuai-workbench://mutations/journal/${mutationId}`],
    status: resultStatus,
    tool: TOOL_NAME,
  });
}

/**
 * buildArtifactContent 함수.
 * initialFrontmatter와 body로부터 파일 내용을 조립함.
 *
 * @param frontmatter - 초기 frontmatter field
 * @param body - 파일 본문
 * @returns 조립된 파일 내용
 */
function buildArtifactContent(frontmatter: Record<string, string> | undefined, body: string | undefined): string {
  const parts: string[] = [];
  if (frontmatter && Object.keys(frontmatter).length > 0) {
    parts.push('---');
    for (const [key, value] of Object.entries(frontmatter)) {
      parts.push(`${key}: ${value}`);
    }
    parts.push('---');
  }
  if (body) {
    parts.push(body);
  }
  return parts.join('\n');
}

/**
 * runCreatePostValidation 함수.
 * 생성된 artifact에 대해 경로 및 구조 유효성 검사를 실행함.
 *
 * @param relativePath - workspace-relative path
 * @param absolutePath - absolute path
 * @param orderPath - workspace-relative _order.json path
 * @param workspace - workspace root 상태
 * @returns post-validation result
 */
async function runCreatePostValidation(
  relativePath: string,
  absolutePath: string,
  orderPath: string | undefined,
  safeOrderPath: { absolutePath: string } | undefined,
  _workspace: WorkspaceRootStatus,
): Promise<PostValidationResult> {
  const diagnostics: WorkbenchDiagnostic[] = [];
  try {
    const content = await readFile(absolutePath, 'utf8');
    if (content.trim().length === 0) {
      diagnostics.push({ category: 'post-validation', id: 'CREATE_ARTIFACT_EMPTY', message: `Created file is empty: ${relativePath}.`, path: relativePath, ruleId: 'create-artifact.empty', severity: 'warning' });
    }
  } catch (error) {
    diagnostics.push({ category: 'post-validation', id: 'POST_VALIDATION_READ_FAILED', message: `Post-validation could not read ${relativePath}: ${(error as Error).message}`, path: relativePath, ruleId: 'post-validation.read', severity: 'error' });
  }

  if (orderPath && safeOrderPath) {
    try {
      const orderContent = await readFile(safeOrderPath.absolutePath, 'utf8');
      const parsed = JSON.parse(orderContent) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
        diagnostics.push({ category: 'order', id: 'ORDER_NOT_STRING_ARRAY', message: `_order.json is not a string array after create.`, path: orderPath, ruleId: 'order.not-string-array', severity: 'error' });
      }
    } catch (error) {
      diagnostics.push({ category: 'post-validation', id: 'POST_VALIDATION_READ_FAILED', message: `Post-validation could not read ${orderPath}: ${(error as Error).message}`, path: orderPath, ruleId: 'post-validation.read', severity: 'error' });
    }
  }

  return {
    diagnostics,
    status: diagnostics.some((d) => d.severity === 'error') ? 'error' : diagnostics.some((d) => d.severity === 'warning') ? 'warning' : 'ok',
  };
}

/**
 * parseCreateArtifactInput 함수.
 * unknown raw input을 CreateArtifactInput으로 검증함.
 *
 * @param input - raw tool input
 * @returns parsed input 또는 reject reason
 */
function parseCreateArtifactInput(input: unknown): { input: CreateArtifactInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'Input must be an object.' };
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.target !== 'string' || candidate.target.trim() === '') {
    return { ok: false, reason: 'target must be a non-empty string.' };
  }
  if (typeof candidate.artifact !== 'string' || candidate.artifact.trim() === '') {
    return { ok: false, reason: 'artifact must be a non-empty string.' };
  }
  if (typeof candidate.root !== 'string' || candidate.root.trim() === '') {
    return { ok: false, reason: 'root must be a non-empty string.' };
  }
  if (typeof candidate.stem !== 'string' || candidate.stem.trim() === '') {
    return { ok: false, reason: 'stem must be a non-empty string.' };
  }
  const mode: PatchPlanMutationMode = 'commit';
  const confirmation = candidate.confirmation as CreateArtifactInput['confirmation'] | undefined;
  const order = candidate.order as CreateArtifactInput['order'] | undefined;
  return {
    input: {
      artifact: candidate.artifact as string,
      body: typeof candidate.body === 'string' ? candidate.body : undefined,
      confirmation: confirmation ? { accepted: !!confirmation.accepted, confirmationText: confirmation.confirmationText } : undefined,
      initialFrontmatter: candidate.initialFrontmatter && typeof candidate.initialFrontmatter === 'object' ? candidate.initialFrontmatter as Record<string, string> : undefined,
      mode,
      order: order ? { insert: !!order.insert, index: typeof order.index === 'number' ? order.index : undefined } : undefined,
      postValidate: typeof candidate.postValidate === 'boolean' ? candidate.postValidate : undefined,
      root: candidate.root as string,
      stem: candidate.stem as string,
      target: candidate.target as string,
    },
    ok: true,
  };
}
