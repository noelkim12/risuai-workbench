/**
 * Patch plan apply engine for direct MCP mutations.
 * @file packages/risuai-workbench-mcp/src/mutation/apply-engine.ts
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseEditorFrontmatter } from 'risu-workbench-core';

import { createMutationResultEnvelope, type ChangedFileResult, type MutationResultEnvelope, type PostValidationResult } from '../contracts/mutation-result';
import type { PatchOperation, PatchPlan } from '../contracts/patch-plan';
import { buildMutationJournalUri } from '../contracts/resource-uri';
import type { WorkbenchDiagnostic } from '../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../project/resolve-root';
import type { SafePathIntent } from '../project/safe-path';

import { computeFileHash, verifyFileHashPrecondition } from './file-hash';
import { appendJournalEntry, type MutationJournalStatus } from './journal';
import { evaluateMutationSafetyGate } from './safety-gate';
import type { MutationMode } from './mode';

export interface ApplyPatchPlanEngineOptions {
  mutationMode: MutationMode;
  options?: {
    postValidate?: boolean;
    rollbackOnValidationError?: boolean;
  };
  patchPlan: PatchPlan;
  workspace: WorkspaceRootStatus;
}

interface TargetPlan {
  expectedHash?: string;
  intent: SafePathIntent;
  path: string;
}

interface ResolvedTargetPlan extends TargetPlan {
  absolutePath: string;
  relativePath: string;
}

const TOOL_NAME = 'workbench.apply_patch_plan';

/**
 * applyPatchPlan 함수.
 * 저장된 PatchPlan의 지원 operation을 파일에 적용함.
 *
 * @param options - patch plan, workspace, mutation mode 입력
 * @returns mutation result envelope
 */
export async function applyPatchPlan(options: ApplyPatchPlanEngineOptions): Promise<MutationResultEnvelope> {
  const mutationId = createMutationId(options.patchPlan.patchPlanId);
  const journalPath = getJournalPath(options.workspace);
  const unsupported = findUnsupportedOperations(options.patchPlan.operations);
  if (unsupported.length > 0) {
    return recordAndReturn(options, mutationId, journalPath, 'rejected', 'rejected', [], notRunValidation(), unsupported);
  }

  const targetsResult = buildTargetPlans(options.patchPlan);
  if (!targetsResult.ok) {
    return recordAndReturn(options, mutationId, journalPath, 'rejected', 'rejected', [], notRunValidation(), targetsResult.diagnostics);
  }

  const safetyResult = await evaluateMutationSafetyGate({
    mode: options.mutationMode,
    targets: targetsResult.targets.map((target) => ({ expectedHash: target.expectedHash, intent: target.intent, path: target.path })),
    toolName: TOOL_NAME,
    workspace: options.workspace,
  });

  if (!safetyResult.ok) {
    const diagnostics = [createDiagnosticFromReason(safetyResult.reason, safetyResult.status, options.patchPlan.patchPlanId)];
    return recordAndReturn(options, mutationId, journalPath, safetyResult.status === 'failed-precondition' ? 'failed' : 'rejected', safetyResult.status, [], notRunValidation(), diagnostics);
  }

  const resolvedTargets = safetyResult.targets.map((target, index): ResolvedTargetPlan => ({
    ...targetsResult.targets[index],
    absolutePath: target.absolutePath,
    relativePath: target.relativePath,
  }));
  const createPreconditionDiagnostics = await validateCreatePreconditions(resolvedTargets);
  if (createPreconditionDiagnostics.length > 0) {
    return recordAndReturn(options, mutationId, journalPath, 'failed', 'failed-precondition', [], notRunValidation(), createPreconditionDiagnostics);
  }

  const beforeHashes = await collectBeforeHashes(resolvedTargets);
  await applyOperations(options.patchPlan.operations, resolvedTargets);
  const changedFiles = await collectChangedFiles(options.patchPlan.operations, resolvedTargets, beforeHashes);
  const postValidation = await runPostValidation(options.patchPlan, resolvedTargets, options.options?.postValidate !== false);
  const resultStatus = postValidation.status === 'error' ? 'failed' : 'applied';
  const journalStatus: MutationJournalStatus = postValidation.status === 'error' ? 'failed-validation' : 'applied';
  return recordAndReturn(options, mutationId, journalPath, resultStatus, journalStatus, changedFiles, postValidation, postValidation.diagnostics);
}

/**
 * findUnsupportedOperations 함수.
 * Task 7 범위 밖 operation을 쓰기 전 domain diagnostic으로 거부함.
 *
 * @param operations - patch plan operation 목록
 * @returns unsupported operation diagnostics
 */
function findUnsupportedOperations(operations: readonly PatchOperation[]): WorkbenchDiagnostic[] {
  return operations
    .filter((operation) => operation.kind === 'file.delete' || operation.kind === 'file.move' || operation.kind === 'json.set' || operation.kind === 'json.remove')
    .map((operation) => ({
      category: 'patch',
      id: 'PATCH_OPERATION_UNSUPPORTED',
      message: `${operation.kind} is not supported by Task 7 apply_patch_plan.` ,
      path: getPrimaryOperationPath(operation),
      ruleId: 'patch.operation-supported',
      severity: 'error',
    }));
}

/**
 * buildTargetPlans 함수.
 * operation과 precondition path를 하나의 target 목록으로 병합함.
 *
 * @param patchPlan - 적용할 patch plan
 * @returns 안전성 gate에 전달할 target 계획
 */
function buildTargetPlans(patchPlan: PatchPlan): { ok: true; targets: TargetPlan[] } | { diagnostics: WorkbenchDiagnostic[]; ok: false } {
  const targets = new Map<string, TargetPlan>();
  for (const operation of patchPlan.operations) {
    const targetPath = getPrimaryOperationPath(operation);
    if (!targetPath) {
      return {
        diagnostics: [{ category: 'patch', id: 'PATCH_OPERATION_MISSING_PATH', message: `${operation.kind} does not identify a target path.`, path: null, ruleId: 'patch.operation-path', severity: 'error' }],
        ok: false,
      };
    }
    targets.set(targetPath, { intent: operation.kind === 'file.create' ? 'create-missing' : 'write-existing', path: targetPath });
  }

  for (const precondition of patchPlan.preconditions) {
    if (!precondition.path) continue;
    const previous = targets.get(precondition.path);
    const intent = precondition.kind === 'path.not-exists' ? 'create-missing' : previous?.intent ?? 'read-existing';
    targets.set(precondition.path, {
      expectedHash: previous?.expectedHash,
      intent,
      path: precondition.path,
    });
  }

  return { ok: true, targets: [...targets.values()] };
}

/**
 * validateCreatePreconditions 함수.
 * create target이 아직 존재하지 않는지 모든 write 전에 검증함.
 *
 * @param targets - safe path 검증을 통과한 target 목록
 * @returns create precondition diagnostics
 */
async function validateCreatePreconditions(targets: readonly ResolvedTargetPlan[]): Promise<WorkbenchDiagnostic[]> {
  const diagnostics: WorkbenchDiagnostic[] = [];
  for (const target of targets.filter((candidate) => candidate.intent === 'create-missing')) {
    const result = await verifyFileHashPrecondition({ operation: 'create', targetPath: target.absolutePath });
    if (!result.ok) {
      diagnostics.push(createDiagnosticFromReason(result.reason, 'failed-precondition', target.path));
    }
  }
  return diagnostics;
}

/**
 * applyOperations 함수.
 * precondition 통과 후 파일별 operation을 적용함.
 *
 * @param operations - patch operations
 * @param targets - resolved target 목록
 */
async function applyOperations(operations: readonly PatchOperation[], targets: readonly ResolvedTargetPlan[]): Promise<void> {
  const targetPaths = new Map(targets.map((target) => [target.path, target.absolutePath]));
  const operationsByPath = groupOperationsByPath(operations);
  for (const [relativePath, fileOperations] of operationsByPath) {
    const absolutePath = targetPaths.get(relativePath);
    if (!absolutePath) continue;
    if (fileOperations.some((operation) => operation.kind === 'file.create')) {
      const createOperation = fileOperations.find((operation): operation is Extract<PatchOperation, { kind: 'file.create' }> => operation.kind === 'file.create');
      if (createOperation) {
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, createOperation.content, 'utf8');
      }
      continue;
    }

    const source = await readFile(absolutePath, 'utf8');
    const textReplacements = fileOperations.filter((operation): operation is Extract<PatchOperation, { kind: 'text.replace' }> => operation.kind === 'text.replace');
    if (textReplacements.length > 0) {
      await writeFile(absolutePath, applyTextReplacements(source, textReplacements), 'utf8');
      continue;
    }

    if (fileOperations.some((operation) => operation.kind.startsWith('order.'))) {
      await writeFile(absolutePath, `${JSON.stringify(applyOrderOperations(JSON.parse(source) as unknown, fileOperations), null, 2)}\n`, 'utf8');
      continue;
    }

    if (fileOperations.some((operation) => operation.kind.startsWith('frontmatter.'))) {
      await writeFile(absolutePath, applyFrontmatterOperations(source, fileOperations), 'utf8');
    }
  }
}

/**
 * applyTextReplacements 함수.
 * source offset 기준 replacement를 뒤에서 앞으로 적용해 offset drift를 피함.
 *
 * @param source - 원문 파일 내용
 * @param replacements - text.replace operations
 * @returns replacement가 적용된 내용
 */
function applyTextReplacements(source: string, replacements: readonly Extract<PatchOperation, { kind: 'text.replace' }>[]): string {
  return [...replacements]
    .sort((left, right) => right.startOffset - left.startOffset)
    .reduce((text, replacement) => `${text.slice(0, replacement.startOffset)}${replacement.text}${text.slice(replacement.endOffset)}`, source);
}

/**
 * applyOrderOperations 함수.
 * `_order.json` string array에 structured order operation을 적용함.
 *
 * @param parsedOrder - JSON.parse 결과
 * @param operations - order operation 목록
 * @returns 다음 order array
 */
function applyOrderOperations(parsedOrder: unknown, operations: readonly PatchOperation[]): string[] {
  if (!Array.isArray(parsedOrder) || !parsedOrder.every((entry) => typeof entry === 'string')) {
    throw new Error('_order.json must be a string array before applying order operations.');
  }
  const next = [...parsedOrder];
  for (const operation of operations) {
    if (operation.kind === 'order.insert') {
      const index = operation.index === undefined ? next.length : Math.max(0, Math.min(operation.index, next.length));
      if (!next.includes(operation.entry)) next.splice(index, 0, operation.entry);
    } else if (operation.kind === 'order.move') {
      const currentIndex = next.indexOf(operation.entry);
      if (currentIndex !== -1) next.splice(currentIndex, 1);
      next.splice(Math.max(0, Math.min(operation.toIndex, next.length)), 0, operation.entry);
    } else if (operation.kind === 'order.remove') {
      const currentIndex = next.indexOf(operation.entry);
      if (currentIndex !== -1) next.splice(currentIndex, 1);
    }
  }
  return next;
}

/**
 * applyFrontmatterOperations 함수.
 * text.replace fallback이 없는 structured frontmatter operation을 보수적으로 적용함.
 *
 * @param source - 원문 파일 내용
 * @param operations - frontmatter operations
 * @returns 수정된 파일 내용
 */
function applyFrontmatterOperations(source: string, operations: readonly PatchOperation[]): string {
  const warnings: unknown[] = [];
  const block = parseEditorFrontmatter(source, warnings as never[]);
  if (!block) {
    throw new Error('Frontmatter block is required for structured frontmatter apply.');
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const fields = new Map<string, string>();
  for (const rawLine of block.raw.split(/\r?\n/)) {
    if (rawLine.trim() === '' || !rawLine.includes(':')) continue;
    fields.set(rawLine.slice(0, rawLine.indexOf(':')).trim(), rawLine.slice(rawLine.indexOf(':') + 1).trim());
  }
  for (const operation of operations) {
    if (operation.kind === 'frontmatter.set') fields.set(operation.key, operation.value);
    if (operation.kind === 'frontmatter.remove') fields.delete(operation.key);
  }
  const frontmatter = ['---', ...[...fields].map(([key, value]) => `${key}: ${value}`), '---'].join(newline);
  return `${frontmatter}${newline}${source.slice(block.range.endOffset)}`;
}

/**
 * runPostValidation 함수.
 * Task 7 범위에서 변경 파일의 기본 구조 상태를 확인하고 결과를 honest summary로 반환함.
 *
 * @param patchPlan - 적용한 patch plan
 * @param targets - resolved targets
 * @param enabled - post-validation 실행 여부
 * @returns post-validation result
 */
async function runPostValidation(patchPlan: PatchPlan, targets: readonly ResolvedTargetPlan[], enabled: boolean): Promise<PostValidationResult> {
  if (!enabled) return notRunValidation();
  const diagnostics: WorkbenchDiagnostic[] = [];
  for (const target of targets.filter((candidate) => candidate.intent !== 'create-missing' || patchPlan.preview.affectedFiles.some((file) => file.path === candidate.path))) {
    try {
      const content = await readFile(target.absolutePath, 'utf8');
      if (target.path.endsWith('_order.json')) validateOrderText(target.path, content, diagnostics);
      if (hasFrontmatterOperation(patchPlan.operations, target.path)) validateFrontmatterText(target.path, content, diagnostics);
    } catch (error) {
      diagnostics.push({ category: 'post-validation', id: 'POST_VALIDATION_READ_FAILED', message: `Post-validation could not read ${target.path}: ${(error as Error).message}`, path: target.path, ruleId: 'post-validation.read', severity: 'error' });
    }
  }
  return {
    diagnostics,
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'error' : diagnostics.some((diagnostic) => diagnostic.severity === 'warning') ? 'warning' : 'ok',
  };
}

/**
 * validateOrderText 함수.
 * `_order.json` post-validation을 JSON string array 수준으로 확인함.
 *
 * @param filePath - workspace-relative order path
 * @param content - 적용 후 파일 내용
 * @param diagnostics - diagnostics accumulator
 */
function validateOrderText(filePath: string, content: string, diagnostics: WorkbenchDiagnostic[]): void {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
      diagnostics.push({ category: 'order', id: 'ORDER_NOT_STRING_ARRAY', message: '_order.json must remain a JSON string array after apply.', path: filePath, ruleId: 'order.not-string-array', severity: 'error' });
    }
  } catch {
    diagnostics.push({ category: 'order', id: 'ORDER_FILE_MALFORMED_AFTER_APPLY', message: '_order.json is malformed after apply; rollback was not automatic.', path: filePath, ruleId: 'order.malformed-after-apply', severity: 'error' });
  }
}

/**
 * validateFrontmatterText 함수.
 * frontmatter post-validation을 core parser warning으로 요약함.
 *
 * @param filePath - workspace-relative artifact path
 * @param content - 적용 후 파일 내용
 * @param diagnostics - diagnostics accumulator
 */
function validateFrontmatterText(filePath: string, content: string, diagnostics: WorkbenchDiagnostic[]): void {
  const warnings: Array<{ code: string; message: string; severity: string }> = [];
  const block = parseEditorFrontmatter(content, warnings as never[]);
  if (!block) {
    diagnostics.push({ category: 'frontmatter', id: 'FRONTMATTER_MISSING_AFTER_APPLY', message: 'Frontmatter block could not be parsed after apply; rollback was not automatic.', path: filePath, ruleId: 'frontmatter.missing-after-apply', severity: 'error' });
  }
  for (const warning of warnings) {
    diagnostics.push({ category: 'frontmatter', id: warning.severity === 'error' ? 'FRONTMATTER_MALFORMED_AFTER_APPLY' : 'FRONTMATTER_WARNING_AFTER_APPLY', message: warning.message, path: filePath, ruleId: `frontmatter.${warning.code}`, severity: warning.severity === 'error' ? 'error' : 'warning' });
  }
}

/**
 * collectBeforeHashes 함수.
 * 모든 target의 write 전 hash를 기록함.
 *
 * @param targets - resolved target 목록
 * @returns relative path to hash/null map
 */
async function collectBeforeHashes(targets: readonly ResolvedTargetPlan[]): Promise<Map<string, string | null>> {
  const hashes = new Map<string, string | null>();
  for (const target of targets) hashes.set(target.path, await tryComputeFileHash(target.absolutePath));
  return hashes;
}

/**
 * collectChangedFiles 함수.
 * 적용 후 before/after hash와 operation count를 파일별로 구성함.
 *
 * @param operations - 적용한 operations
 * @param targets - resolved targets
 * @param beforeHashes - 적용 전 hash map
 * @returns changed file summaries
 */
async function collectChangedFiles(operations: readonly PatchOperation[], targets: readonly ResolvedTargetPlan[], beforeHashes: ReadonlyMap<string, string | null>): Promise<ChangedFileResult[]> {
  const operationCounts = new Map<string, number>();
  for (const operation of operations) {
    const targetPath = getPrimaryOperationPath(operation);
    if (targetPath) operationCounts.set(targetPath, (operationCounts.get(targetPath) ?? 0) + 1);
  }
  const changedFiles: ChangedFileResult[] = [];
  for (const target of targets.filter((candidate) => operationCounts.has(candidate.path))) {
    const beforeHash = beforeHashes.get(target.path) ?? null;
    const afterHash = await tryComputeFileHash(target.absolutePath);
    changedFiles.push({
      afterHash: afterHash ?? undefined,
      beforeHash: beforeHash ?? undefined,
      operationCount: operationCounts.get(target.path) ?? 0,
      path: target.path,
    });
  }
  return changedFiles.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * recordAndReturn 함수.
 * mutation journal entry를 append하고 mutation result envelope를 생성함.
 *
 * @param options - apply engine options
 * @param mutationId - 생성된 mutation id
 * @param journalPath - journal file path 또는 null
 * @param resultStatus - tool result status
 * @param journalStatus - journal status
 * @param changedFiles - changed file summaries
 * @param postValidation - post-validation summary
 * @param diagnostics - result diagnostics
 * @returns mutation result envelope
 */
async function recordAndReturn(
  options: ApplyPatchPlanEngineOptions,
  mutationId: string,
  journalPath: string | null,
  resultStatus: MutationResultEnvelope['status'],
  journalStatus: MutationJournalStatus,
  changedFiles: readonly ChangedFileResult[],
  postValidation: PostValidationResult,
  diagnostics: readonly WorkbenchDiagnostic[],
): Promise<MutationResultEnvelope> {
  if (journalPath) {
    await appendJournalEntry(journalPath, {
      affectedFiles: changedFiles.map((file) => file.path),
      mutationId,
      patchOperations: [...options.patchPlan.operations],
      postValidation,
      status: journalStatus,
      toolName: TOOL_NAME,
    });
  }
  const resourceLinks = [buildMutationJournalUri(mutationId)];
  return createMutationResultEnvelope({
    appliedAt: resultStatus === 'applied' || resultStatus === 'failed' ? new Date().toISOString() : undefined,
    changedFiles,
    mutationId,
    patchPlanId: options.patchPlan.patchPlanId,
    postValidation: diagnostics.length > 0 && postValidation.status === 'not_run' ? { diagnostics, status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'error' : 'warning' } : postValidation,
    resourceLinks,
    status: resultStatus,
    tool: TOOL_NAME,
  });
}

/**
 * groupOperationsByPath 함수.
 * operation을 primary target path별로 묶음.
 *
 * @param operations - patch operations
 * @returns path to operations map
 */
function groupOperationsByPath(operations: readonly PatchOperation[]): Map<string, PatchOperation[]> {
  const grouped = new Map<string, PatchOperation[]>();
  for (const operation of operations) {
    const targetPath = getPrimaryOperationPath(operation);
    if (!targetPath) continue;
    grouped.set(targetPath, [...(grouped.get(targetPath) ?? []), operation]);
  }
  return grouped;
}

/**
 * getPrimaryOperationPath 함수.
 * Task 7 supported operation의 primary target path를 얻음.
 *
 * @param operation - patch operation
 * @returns workspace-relative target path 또는 null
 */
function getPrimaryOperationPath(operation: PatchOperation): string | null {
  if (operation.kind === 'order.insert' || operation.kind === 'order.move' || operation.kind === 'order.remove') return operation.orderPath ?? null;
  if (operation.kind === 'file.move') return operation.from;
  return 'path' in operation ? operation.path : null;
}

/**
 * hasFrontmatterOperation 함수.
 * 특정 path에 frontmatter validation이 필요한지 판정함.
 *
 * @param operations - patch operations
 * @param targetPath - workspace-relative file path
 * @returns frontmatter validation 필요 여부
 */
function hasFrontmatterOperation(operations: readonly PatchOperation[], targetPath: string): boolean {
  return operations.some((operation) => getPrimaryOperationPath(operation) === targetPath && (operation.kind.startsWith('frontmatter.') || (operation.kind === 'text.replace' && /\.risu(?:lorebook|regex|prompt)$/.test(targetPath))));
}

/**
 * createDiagnosticFromReason 함수.
 * safety/precondition failure reason을 WorkbenchDiagnostic으로 변환함.
 *
 * @param reason - 실패 사유
 * @param status - safety/journal status
 * @param targetPath - 관련 path 또는 patch id
 * @returns diagnostic object
 */
function createDiagnosticFromReason(reason: string, status: string, targetPath: string | null): WorkbenchDiagnostic {
  return {
    category: status === 'failed-precondition' ? 'precondition' : 'mutation-safety',
    id: status === 'failed-precondition' ? 'PATCH_PRECONDITION_FAILED' : 'PATCH_APPLY_REJECTED',
    message: `Patch apply rejected before target writes: ${reason}.`,
    path: targetPath,
    ruleId: `patch.apply.${reason}`,
    severity: 'error',
  };
}

/**
 * tryComputeFileHash 함수.
 * 파일 hash를 계산하고 missing target은 null로 표현함.
 *
 * @param targetPath - absolute target path
 * @returns file hash 또는 null
 */
async function tryComputeFileHash(targetPath: string): Promise<string | null> {
  try {
    return await computeFileHash(targetPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOTDIR') return null;
    throw error;
  }
}

/**
 * getJournalPath 함수.
 * workspace 안 append-only journal file path를 계산함.
 *
 * @param workspace - workspace root status
 * @returns journal absolute path 또는 null
 */
function getJournalPath(workspace: WorkspaceRootStatus): string | null {
  return workspace.ok ? path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl') : null;
}

/**
 * notRunValidation 함수.
 * post-validation 미실행 summary를 생성함.
 *
 * @returns not_run validation result
 */
function notRunValidation(): PostValidationResult {
  return { diagnostics: [], status: 'not_run' };
}

/**
 * createMutationId 함수.
 * patchPlanId 기반 journal mutation id를 생성함.
 *
 * @param patchPlanId - 적용한 patch plan id
 * @returns mutation id
 */
function createMutationId(patchPlanId: string): string {
  const seed = `${patchPlanId}:${Date.now()}:${Math.random()}`;
  return `mutation:${createHash('sha256').update(seed).digest('hex').slice(0, 12)}`;
}
