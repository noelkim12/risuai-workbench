/**
 * ensure_wiki_root generated wiki bootstrap mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/wiki/ensure-wiki-root.ts
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import { createMutationResultEnvelope, type ChangedFileResult, type MutationResultEnvelope, type PostValidationResult } from '../../contracts/mutation-result';
import { computeFileHash } from '../../mutation/file-hash';
import { appendJournalEntry } from '../../mutation/journal';
import type { MutationMode } from '../../mutation/mode';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import { isGeneratedMutationAllowedPath } from '../../mutation/validation-allowlist';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

export type EnsureWikiRootToolResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface EnsureWikiRootInput {
  mode: 'commit' | 'preview';
  postValidate?: boolean;
  wikiRoot?: string;
}

interface BootstrapFile {
  content: string;
  path: string;
}

const TOOL_NAME = 'workbench.ensure_wiki_root';
const DEFAULT_WIKI_ROOT = 'wiki';

/**
 * handleEnsureWikiRoot 함수.
 * wiki root가 없거나 bootstrap 파일이 누락된 경우 generated-only allowlist 안의 최소 wiki 파일만 생성함.
 *
 * @param input - wikiRoot, mode, postValidate 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @param mutationMode - 서버 mutation mode
 * @returns diagnostic preview/no-op 또는 mutation result
 */
export async function handleEnsureWikiRoot(input: unknown, workspace: WorkspaceRootStatus, mutationMode: MutationMode): Promise<EnsureWikiRootToolResult> {
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({
    allowedKeys: ['wikiRoot', 'mode', 'postValidate'],
    input,
    tool: TOOL_NAME,
  });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  const parsed = parseEnsureWikiRootInput(input);
  if (!parsed.ok) return inputError(parsed.reason);
  const ensureInput = parsed.input;

  if (!workspace.ok) return createDiagnosticEnvelope({ diagnostics: [workspaceDiagnostic(workspace.reason)], status: 'domain_error', tool: TOOL_NAME });
  if (ensureInput.wikiRoot !== DEFAULT_WIKI_ROOT) {
    return createDiagnosticEnvelope({
      data: { supportedWikiRoot: DEFAULT_WIKI_ROOT, wikiRoot: ensureInput.wikiRoot },
      diagnostics: [{ category: 'wiki', id: 'ENSURE_WIKI_ROOT_UNSUPPORTED_ROOT', message: 'ensure_wiki_root currently supports only the default wiki root: wiki.', path: ensureInput.wikiRoot, ruleId: 'wiki.unsupported-root', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const bootstrapFiles = createBootstrapFiles(ensureInput.wikiRoot);
  const protectedFiles = bootstrapFiles.filter((file) => !isGeneratedMutationAllowedPath(file.path));
  if (protectedFiles.length > 0) {
    return createDiagnosticEnvelope({
      data: { protectedPaths: protectedFiles.map((file) => file.path), writePolicy: 'generated-only' },
      diagnostics: protectedFiles.map((file) => ({ category: 'wiki', id: 'ENSURE_WIKI_ROOT_PROTECTED_PATH', message: `${file.path} is outside generated wiki write-protect boundaries.`, path: file.path, ruleId: 'wiki.protected-path', severity: 'error' })),
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const resolvedFiles = [] as Array<{ absolutePath: string; exists: boolean; file: BootstrapFile }>;
  for (const file of bootstrapFiles) {
    const safePath = await resolveSafeWorkspacePath({ inputPath: file.path, intent: 'create-missing', workspace });
    if (!safePath.ok) return pathError(file.path, safePath.reason);
    resolvedFiles.push({ absolutePath: safePath.absolutePath, exists: await fileExists(safePath.absolutePath), file });
  }

  const missingFiles = resolvedFiles.filter((target) => !target.exists);
  const existingPaths = resolvedFiles.filter((target) => target.exists).map((target) => target.file.path);
  if (ensureInput.mode === 'preview' || mutationMode === 'preview-only') {
    return createDiagnosticEnvelope({
      data: { existingPaths, plannedWrites: missingFiles.map((target) => target.file.path), preview: true, wikiRoot: ensureInput.wikiRoot, writePolicy: 'generated-only' },
      diagnostics: [{ category: 'wiki', id: 'ENSURE_WIKI_ROOT_PREVIEW', message: 'Initial wiki root preview created; no files were changed.', path: ensureInput.wikiRoot, ruleId: 'wiki.ensure-root-preview', severity: 'info' }],
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  if (missingFiles.length === 0) {
    return createDiagnosticEnvelope({
      data: { existingPaths, plannedWrites: [], preview: false, wikiRoot: ensureInput.wikiRoot, writePolicy: 'generated-only' },
      diagnostics: [{ category: 'wiki', id: 'ENSURE_WIKI_ROOT_ALREADY_EXISTS', message: 'Initial wiki root already exists; no files were changed.', path: ensureInput.wikiRoot, ruleId: 'wiki.ensure-root-already-exists', severity: 'info' }],
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  const safetyResult = await evaluateMutationSafetyGate({
    mode: mutationMode,
    targets: missingFiles.map((target) => ({ intent: 'create-missing' as const, path: target.file.path })),
    toolName: TOOL_NAME,
    workspace,
  });
  if (!safetyResult.ok) {
    return createMutationResultEnvelope({
      changedFiles: [],
      postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'ENSURE_WIKI_ROOT_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: ensureInput.wikiRoot, ruleId: `ensure-wiki-root.${safetyResult.reason}`, severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'rejected',
      tool: TOOL_NAME,
    });
  }

  await applyBootstrapWrites(missingFiles);
  const changedFiles = await Promise.all(missingFiles.map(async (target): Promise<ChangedFileResult> => ({ afterHash: await computeFileHash(target.absolutePath), operationCount: 1, path: target.file.path })));
  const postValidation = ensureInput.postValidate !== false ? await runEnsurePostValidation(missingFiles) : { diagnostics: [], status: 'not_run' as const };
  const mutationId = `mutation:${Date.now().toString(36)}:ensure-wiki-root`;

  await appendJournalEntry(path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl'), {
    affectedFiles: changedFiles.map((file) => file.path),
    changedFiles,
    mutationId,
    patchOperations: missingFiles.map((target) => ({ content: target.file.content, kind: 'file.create', path: target.file.path })),
    postValidation,
    rollbackAvailable: false,
    status: postValidation.status === 'error' ? 'failed-validation' : 'applied',
    toolName: TOOL_NAME,
  });

  return createMutationResultEnvelope({
    appliedAt: new Date().toISOString(),
    changedFiles,
    mutationId,
    postValidation,
    resourceLinks: [`risuai-workbench://mutations/journal/${mutationId}`, `risuai-workbench://wiki/${ensureInput.wikiRoot}`],
    status: postValidation.status === 'error' ? 'failed' : 'applied',
    tool: TOOL_NAME,
  });
}

function createBootstrapFiles(wikiRoot: string): readonly BootstrapFile[] {
  return [
    { content: '# RisuAI Workbench Wiki Schema\n\nGenerated wiki metadata and schema files live here.\n', path: `${wikiRoot}/SCHEMA.md` },
    { content: '# RisuAI Workbench Wiki\n\n<!-- BEGIN:artifacts -->\n<!-- END:artifacts -->\n', path: `${wikiRoot}/_index.md` },
    { content: `## ensure_wiki_root\n- initialized: ${new Date(0).toISOString()}\n`, path: `${wikiRoot}/_log.md` },
    { content: '# Generated Schema\n\nThis directory is reserved for generated wiki schema files.\n', path: `${wikiRoot}/_schema/README.md` },
  ];
}

async function applyBootstrapWrites(targets: ReadonlyArray<{ absolutePath: string; file: BootstrapFile }>): Promise<void> {
  for (const target of targets) {
    await mkdir(path.dirname(target.absolutePath), { recursive: true });
    await writeFile(target.absolutePath, target.file.content, 'utf8');
  }
}

async function runEnsurePostValidation(targets: ReadonlyArray<{ absolutePath: string; file: BootstrapFile }>): Promise<PostValidationResult> {
  const diagnostics: WorkbenchDiagnostic[] = [];
  for (const target of targets) {
    try {
      await readFile(target.absolutePath, 'utf8');
    } catch (error) {
      diagnostics.push({ category: 'post-validation', id: 'ENSURE_WIKI_ROOT_TARGET_MISSING', message: `Bootstrap target missing after write: ${(error as Error).message}`, path: target.file.path, ruleId: 'wiki.target-missing', severity: 'error' });
    }
  }
  return { diagnostics, status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'error' : 'ok' };
}

function parseEnsureWikiRootInput(input: unknown): { input: EnsureWikiRootInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'Input must be an object.' };
  const candidate = input as Record<string, unknown>;
  const mode = candidate.mode === 'preview' || candidate.mode === 'commit' ? candidate.mode : 'commit';
  const wikiRoot = typeof candidate.wikiRoot === 'string' && candidate.wikiRoot.length > 0 ? candidate.wikiRoot : DEFAULT_WIKI_ROOT;
  return { input: { mode, postValidate: typeof candidate.postValidate === 'boolean' ? candidate.postValidate : undefined, wikiRoot }, ok: true };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOTDIR') return false;
    throw error;
  }
}

function inputError(reason: string): DiagnosticEnvelope {
  return createDiagnosticEnvelope({ diagnostics: [{ category: 'input', id: 'ENSURE_WIKI_ROOT_INPUT_INVALID', message: reason, path: null, ruleId: 'input.ensure-wiki-root', severity: 'error' }], status: 'domain_error', tool: TOOL_NAME });
}

function pathError(targetPath: string, reason: string): DiagnosticEnvelope {
  return createDiagnosticEnvelope({ diagnostics: [{ category: 'path', id: 'PATH_OUTSIDE_WORKSPACE', message: `Path resolves outside workspace: ${targetPath} (${reason}).`, path: targetPath, ruleId: 'path.boundary', severity: 'error' }], status: 'domain_error', tool: TOOL_NAME });
}

function workspaceDiagnostic(reason: string | null): WorkbenchDiagnostic {
  return { category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${reason ?? 'unknown'}.`, path: null, ruleId: 'workspace.root-unavailable', severity: 'error' };
}
