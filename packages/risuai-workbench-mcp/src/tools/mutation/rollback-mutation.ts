/**
 * rollback_mutation high-risk journal rollback tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/rollback-mutation.ts
 */

import { copyFile, mkdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import { createMutationResultEnvelope, type ChangedFileResult, type MutationResultEnvelope } from '../../contracts/mutation-result';
import { computeFileHash } from '../../mutation/file-hash';
import { appendJournalEntry, readJournalEntries } from '../../mutation/journal';
import type { MutationMode } from '../../mutation/mode';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export type RollbackMutationToolResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface RollbackMutationInput {
  mutationId: string;
  mode: 'commit' | 'preview';
}

const TOOL_NAME = 'workbench.rollback_mutation';

/**
 * handleRollbackMutation 함수.
 * 충분한 inverse state가 journal에 있는 mutation만 되돌림.
 *
 * @param input - mutationId, mode
 * @param workspace - startup에서 계산한 workspace root 상태
 * @param mutationMode - 서버 mutation mode
 * @returns mutation result 또는 diagnostic envelope
 */
export async function handleRollbackMutation(input: unknown, workspace: WorkspaceRootStatus, mutationMode: MutationMode): Promise<RollbackMutationToolResult> {
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({ allowedKeys: ['mutationId', 'mode'], input, tool: TOOL_NAME });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;
  const parsed = parseRollbackMutationInput(input);
  if (!parsed.ok) return inputError(parsed.reason);
  const rollbackInput = parsed.input;
  if (!workspace.ok) return createDiagnosticEnvelope({ diagnostics: [workspaceDiagnostic(workspace.reason)], status: 'domain_error', tool: TOOL_NAME });

  const journalPath = path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl');
  const entry = (await readJournalEntries(journalPath)).reverse().find((candidate) => candidate.mutationId === rollbackInput.mutationId);
  if (!entry || !entry.rollbackAvailable || !entry.rollbackData) {
    return createMutationResultEnvelope({ changedFiles: [], postValidation: { diagnostics: [{ category: 'rollback', id: 'ROLLBACK_INSUFFICIENT_JOURNAL', message: `Mutation ${rollbackInput.mutationId} lacks sufficient inverse state for rollback.`, path: null, ruleId: 'rollback.insufficient-journal', severity: 'error' }], status: 'error' }, resourceLinks: [], status: 'rejected', tool: TOOL_NAME });
  }

  if (mutationMode === 'preview-only') {
    return createDiagnosticEnvelope({ data: { rollbackData: entry.rollbackData }, diagnostics: [], status: 'ok', tool: TOOL_NAME });
  }

  const targets = entry.rollbackData.kind === 'move-back'
    ? [{ expectedHash: entry.rollbackData.expectedCurrentHash, intent: 'write-existing' as const, path: entry.rollbackData.from }, { intent: 'create-missing' as const, path: entry.rollbackData.to }]
    : entry.rollbackData.files.map((file) => ({ intent: 'create-missing' as const, path: file.originalPath }));
  const safetyResult = await evaluateMutationSafetyGate({ mode: mutationMode, targets, toolName: TOOL_NAME, workspace });
  if (!safetyResult.ok) return createMutationResultEnvelope({ changedFiles: [], postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'ROLLBACK_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: null, ruleId: `rollback.${safetyResult.reason}`, severity: 'error' }], status: 'error' }, resourceLinks: [], status: 'rejected', tool: TOOL_NAME });

  let changedFiles: ChangedFileResult[];
  try {
    changedFiles = entry.rollbackData.kind === 'move-back'
      ? await rollbackMove(entry.rollbackData.from, entry.rollbackData.to, entry.rollbackData.expectedCurrentHash, workspace)
      : await rollbackBackup(entry.rollbackData.files, workspace);
  } catch (error) {
    return createMutationResultEnvelope({
      changedFiles: [],
      postValidation: { diagnostics: [{ category: 'rollback', id: 'ROLLBACK_PRECONDITION_FAILED', message: (error as Error).message, path: null, ruleId: 'rollback.precondition', severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'failed',
      tool: TOOL_NAME,
    });
  }
  const mutationId = `mutation:${Date.now().toString(36)}:rollback`;
  const postValidation = { diagnostics: [], status: 'ok' as const };
  await appendJournalEntry(journalPath, { affectedFiles: changedFiles.map((file) => file.path), changedFiles, mutationId, patchOperations: [{ kind: 'rollback', mutationId: rollbackInput.mutationId }], postValidation, rollbackAvailable: false, status: 'applied', toolName: TOOL_NAME });
  return createMutationResultEnvelope({ appliedAt: new Date().toISOString(), changedFiles, mutationId, postValidation, resourceLinks: [`risuai-workbench://mutations/journal/${mutationId}`], status: 'applied', tool: TOOL_NAME });
}

async function rollbackMove(from: string, to: string, expectedCurrentHash: string, workspace: WorkspaceRootStatus): Promise<ChangedFileResult[]> {
  const safeFrom = await resolveSafeWorkspacePath({ inputPath: from, intent: 'read-existing', workspace });
  const safeTo = await resolveSafeWorkspacePath({ inputPath: to, intent: 'create-missing', workspace });
  if (!safeFrom.ok || !safeTo.ok) throw new Error('Rollback move paths failed safe resolution.');
  const currentHash = await computeFileHash(safeFrom.absolutePath);
  if (currentHash !== expectedCurrentHash) throw new Error('Rollback current hash does not match journal expectation.');
  await mkdir(path.dirname(safeTo.absolutePath), { recursive: true });
  await rename(safeFrom.absolutePath, safeTo.absolutePath);
  return [{ beforeHash: currentHash, operationCount: 1, path: from }, { afterHash: await computeFileHash(safeTo.absolutePath), operationCount: 1, path: to }];
}

async function rollbackBackup(files: Array<{ backupPath: string; originalPath: string; restoredHash: string }>, workspace: WorkspaceRootStatus): Promise<ChangedFileResult[]> {
  const changedFiles: ChangedFileResult[] = [];
  for (const file of files) {
    const safeTarget = await resolveSafeWorkspacePath({ inputPath: file.originalPath, intent: 'create-missing', workspace });
    if (!safeTarget.ok) throw new Error(`Rollback target failed safe resolution: ${file.originalPath}.`);
    const currentHash = await computeFileHash(safeTarget.absolutePath).catch(() => null);
    if (currentHash) throw new Error(`Rollback target already exists: ${file.originalPath}.`);
    await readFile(file.backupPath, 'utf8');
    await mkdir(path.dirname(safeTarget.absolutePath), { recursive: true });
    await copyFile(file.backupPath, safeTarget.absolutePath);
    const afterHash = await computeFileHash(safeTarget.absolutePath);
    if (afterHash !== file.restoredHash) throw new Error(`Restored hash mismatch for ${file.originalPath}.`);
    changedFiles.push({ afterHash, operationCount: 1, path: file.originalPath });
  }
  return changedFiles;
}

function parseRollbackMutationInput(input: unknown): { input: RollbackMutationInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'Input must be an object.' };
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.mutationId !== 'string' || candidate.mutationId.trim() === '') return { ok: false, reason: 'mutationId must be a non-empty string.' };
  return { input: { mode: 'commit', mutationId: candidate.mutationId }, ok: true };
}
function inputError(reason: string): DiagnosticEnvelope { return createDiagnosticEnvelope({ diagnostics: [{ category: 'input', id: 'ROLLBACK_INPUT_INVALID', message: reason, path: null, ruleId: 'input.rollback-mutation', severity: 'error' }], status: 'domain_error', tool: TOOL_NAME }); }
function workspaceDiagnostic(reason: string | null): WorkbenchDiagnostic { return { category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${reason ?? 'unknown'}.`, path: null, ruleId: 'workspace.unavailable', severity: 'error' }; }
