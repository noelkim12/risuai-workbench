/**
 * move_artifact high-risk mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/move-artifact.ts
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import { createMutationResultEnvelope, type ChangedFileResult, type MutationResultEnvelope, type PostValidationResult } from '../../contracts/mutation-result';
import { computeFileHash } from '../../mutation/file-hash';
import { appendJournalEntry } from '../../mutation/journal';
import type { MutationMode } from '../../mutation/mode';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export type MoveArtifactToolResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface MoveArtifactInput {
  from: string;
  toStem: string;
  mode: 'commit' | 'preview';
  confirmation?: { accepted: boolean; confirmationText?: string };
  updateOrder?: boolean;
  expectedHash?: string;
  postValidate?: boolean;
}

const TOOL_NAME = 'workbench.move_artifact';

/**
 * handleMoveArtifact 함수.
 * artifact suffix와 같은 directory ownership을 보존하며 rename/move를 수행함.
 *
 * @param input - from/toStem과 confirmation/options
 * @param workspace - startup에서 계산한 workspace root 상태
 * @param mutationMode - 서버 mutation mode
 * @returns mutation result 또는 diagnostic envelope
 */
export async function handleMoveArtifact(input: unknown, workspace: WorkspaceRootStatus, mutationMode: MutationMode): Promise<MoveArtifactToolResult> {
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({ allowedKeys: ['from', 'toStem', 'mode', 'confirmation', 'updateOrder', 'expectedHash', 'postValidate'], input, tool: TOOL_NAME });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;
  const parsed = parseMoveArtifactInput(input);
  if (!parsed.ok) return inputError(parsed.reason);
  const moveInput = parsed.input;

  if (!workspace.ok) return createDiagnosticEnvelope({ diagnostics: [workspaceDiagnostic(workspace.reason)], status: 'domain_error', tool: TOOL_NAME });
  if (moveInput.toStem.includes('/') || moveInput.toStem.includes('\\') || moveInput.toStem.trim() === '') return inputError('toStem must be a file stem, not a path.');

  const fromDir = path.posix.dirname(moveInput.from);
  const suffix = path.posix.extname(moveInput.from);
  if (!suffix) return inputError('from must include an artifact suffix.');
  const to = `${fromDir}/${moveInput.toStem}${suffix}`;
  const safeFrom = await resolveSafeWorkspacePath({ inputPath: moveInput.from, intent: 'read-existing', workspace });
  if (!safeFrom.ok) return pathError(moveInput.from, safeFrom.reason);
  const safeTo = await resolveSafeWorkspacePath({ inputPath: to, intent: 'create-missing', workspace });
  if (!safeTo.ok) return pathError(to, safeTo.reason);
  const targetHash = await computeFileHash(safeTo.absolutePath).catch(() => null);
  if (targetHash) return createDiagnosticEnvelope({ diagnostics: [{ category: 'move-artifact', id: 'MOVE_TARGET_EXISTS', message: `Move target already exists: ${to}.`, path: to, ruleId: 'move-artifact.target-exists', severity: 'error' }], status: 'domain_error', tool: TOOL_NAME });

  const beforeHash = await computeFileHash(safeFrom.absolutePath);
  const effectiveHash = moveInput.expectedHash ?? beforeHash;
  const orderPath = `${fromDir}/_order.json`;
  const orderState = moveInput.updateOrder === true ? await readOrderState(orderPath, workspace) : null;

  if (mutationMode === 'preview-only') {
    return createDiagnosticEnvelope({ data: { afterResource: `risuai-workbench://workspace/${to}`, beforeResource: `risuai-workbench://workspace/${moveInput.from}`, confirmationText: `MOVE ${moveInput.from} TO ${to}`, preview: true, to }, diagnostics: [], status: 'ok', tool: TOOL_NAME });
  }

  const safetyTargets = [{ expectedHash: effectiveHash, intent: 'write-existing' as const, path: moveInput.from }, { intent: 'create-missing' as const, path: to }];
  if (orderState) safetyTargets.push({ expectedHash: orderState.beforeHash, intent: 'write-existing' as const, path: orderState.relativePath });
  const safetyResult = await evaluateMutationSafetyGate({ confirmation: moveInput.confirmation, expectedConfirmationText: `MOVE ${moveInput.from} TO ${to}`, mode: mutationMode, risk: 'high', targets: safetyTargets, toolName: TOOL_NAME, workspace });
  if (!safetyResult.ok) return createMutationResultEnvelope({ changedFiles: [], postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'MOVE_ARTIFACT_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: moveInput.from, ruleId: `move-artifact.${safetyResult.reason}`, severity: 'error' }], status: 'error' }, resourceLinks: [], status: 'rejected', tool: TOOL_NAME });

  await mkdir(path.dirname(safeTo.absolutePath), { recursive: true });
  await rename(safeFrom.absolutePath, safeTo.absolutePath);
  const afterHash = await computeFileHash(safeTo.absolutePath);
  const changedFiles: ChangedFileResult[] = [{ afterHash, beforeHash, operationCount: 1, path: moveInput.from }, { afterHash, operationCount: 1, path: to }];
  if (orderState) {
    const nextOrder = orderState.entries.map((entry) => entry === path.posix.basename(moveInput.from) ? path.posix.basename(to) : entry);
    await writeFile(orderState.absolutePath, `${JSON.stringify(nextOrder, null, 2)}\n`, 'utf8');
    changedFiles.push({ afterHash: await computeFileHash(orderState.absolutePath), beforeHash: orderState.beforeHash, operationCount: 1, path: orderState.relativePath });
  }
  const postValidation = moveInput.postValidate !== false ? await runMovePostValidation(to, safeTo.absolutePath, orderState, path.posix.basename(moveInput.from)) : { diagnostics: [], status: 'not_run' as const };
  const mutationId = `mutation:${Date.now().toString(36)}:move-artifact`;
  await appendJournalEntry(path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl'), { affectedFiles: changedFiles.map((file) => file.path), changedFiles, mutationId, patchOperations: [{ expectedHash: beforeHash, from: moveInput.from, kind: 'file.move', to }], postValidation, rollbackAvailable: !orderState, rollbackData: !orderState ? { expectedCurrentHash: afterHash, from: to, kind: 'move-back', to: moveInput.from } : undefined, status: postValidation.status === 'error' ? 'failed-validation' : 'applied', toolName: TOOL_NAME });
  return createMutationResultEnvelope({ appliedAt: new Date().toISOString(), changedFiles, mutationId, postValidation, resourceLinks: [`risuai-workbench://mutations/journal/${mutationId}`, `risuai-workbench://workspace/${moveInput.from}`, `risuai-workbench://workspace/${to}`], status: postValidation.status === 'error' ? 'failed' : 'applied', tool: TOOL_NAME });
}

interface OrderState { absolutePath: string; beforeHash: string; entries: string[]; relativePath: string }

async function readOrderState(orderPath: string, workspace: WorkspaceRootStatus): Promise<OrderState | null> {
  const safeOrder = await resolveSafeWorkspacePath({ inputPath: orderPath, intent: 'read-existing', workspace });
  if (!safeOrder.ok) return null;
  const parsed = JSON.parse(await readFile(safeOrder.absolutePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) return null;
  return { absolutePath: safeOrder.absolutePath, beforeHash: await computeFileHash(safeOrder.absolutePath), entries: parsed, relativePath: orderPath };
}

async function runMovePostValidation(to: string, absoluteTo: string, orderState: OrderState | null, oldEntry: string): Promise<PostValidationResult> {
  const diagnostics: WorkbenchDiagnostic[] = [];
  try { await readFile(absoluteTo, 'utf8'); } catch { diagnostics.push({ category: 'post-validation', id: 'MOVE_TARGET_MISSING', message: `${to} is missing after move.`, path: to, ruleId: 'move-artifact.target-missing', severity: 'error' }); }
  if (orderState) {
    const order = JSON.parse(await readFile(orderState.absolutePath, 'utf8')) as unknown;
    if (Array.isArray(order) && order.includes(oldEntry)) diagnostics.push({ category: 'order', id: 'MOVE_ORDER_OLD_ENTRY_PRESENT', message: `_order.json still references old entry ${oldEntry}.`, path: orderState.relativePath, ruleId: 'move-artifact.order-old-entry', severity: 'warning' });
  }
  return { diagnostics, status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'error' : diagnostics.some((diagnostic) => diagnostic.severity === 'warning') ? 'warning' : 'ok' };
}

function parseMoveArtifactInput(input: unknown): { input: MoveArtifactInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'Input must be an object.' };
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.from !== 'string' || candidate.from.trim() === '') return { ok: false, reason: 'from must be a non-empty string.' };
  if (typeof candidate.toStem !== 'string' || candidate.toStem.trim() === '') return { ok: false, reason: 'toStem must be a non-empty string.' };
  return { input: { confirmation: isConfirmation(candidate.confirmation) ? candidate.confirmation : undefined, expectedHash: typeof candidate.expectedHash === 'string' ? candidate.expectedHash : undefined, from: candidate.from,   mode: 'commit', postValidate: typeof candidate.postValidate === 'boolean' ? candidate.postValidate : undefined, toStem: candidate.toStem, updateOrder: typeof candidate.updateOrder === 'boolean' ? candidate.updateOrder : undefined }, ok: true };
}

function isConfirmation(value: unknown): value is { accepted: boolean; confirmationText?: string } { return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'accepted' in value); }
function inputError(reason: string): DiagnosticEnvelope { return createDiagnosticEnvelope({ diagnostics: [{ category: 'input', id: 'MOVE_ARTIFACT_INPUT_INVALID', message: reason, path: null, ruleId: 'input.move-artifact', severity: 'error' }], status: 'domain_error', tool: TOOL_NAME }); }
function pathError(targetPath: string, reason: string): DiagnosticEnvelope { return createDiagnosticEnvelope({ diagnostics: [{ category: 'path', id: 'PATH_RESOLVE_FAILED', message: `Path resolution failed: ${targetPath} (${reason}).`, path: targetPath, ruleId: `path.${reason}`, severity: 'error' }], status: 'domain_error', tool: TOOL_NAME }); }
function workspaceDiagnostic(reason: string | null): WorkbenchDiagnostic { return { category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${reason ?? 'unknown'}.`, path: null, ruleId: 'workspace.unavailable', severity: 'error' }; }
