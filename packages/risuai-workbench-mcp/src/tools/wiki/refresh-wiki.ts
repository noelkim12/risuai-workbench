/**
 * refresh_wiki generated wiki mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/wiki/refresh-wiki.ts
 */

import { lstat, mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { appendLogEntry, rewriteIndexArtifactsSection, writeArtifactFiles, writeSchemaIfChanged } from 'risu-workbench-core/node';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../../contracts/diagnostics';
import { createMutationResultEnvelope, type ChangedFileResult, type MutationResultEnvelope, type PostValidationResult } from '../../contracts/mutation-result';
import { computeFileHash } from '../../mutation/file-hash';
import { appendJournalEntry } from '../../mutation/journal';
import type { MutationMode } from '../../mutation/mode';
import { isGeneratedMutationAllowedPath } from '../../mutation/validation-allowlist';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';
import { runRisuCoreCommand } from '../mutation/core-workflow-cli';

export type RefreshWikiToolResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface RefreshWikiFileInput {
  path: string;
  content: string;
}

export interface RefreshWikiInput {
  wikiRoot?: string;
  target?: string;
  mode: 'commit' | 'preview';
  generatedFiles?: readonly RefreshWikiFileInput[];
  postValidate?: boolean;
}

const TOOL_NAME = 'workbench.refresh_wiki';

/**
 * handleRefreshWiki 함수.
 * core wiki write-protect helper만 사용해 proposal-approved generated wiki paths를 갱신함.
 *
 * @param input - wikiRoot, generatedFiles, mode
 * @param workspace - startup에서 계산한 workspace root 상태
 * @param mutationMode - 서버 mutation mode
 * @returns mutation result 또는 diagnostic envelope
 */
export async function handleRefreshWiki(input: unknown, workspace: WorkspaceRootStatus, mutationMode: MutationMode): Promise<RefreshWikiToolResult> {
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({
    allowedKeys: ['wikiRoot', 'target', 'mode', 'generatedFiles', 'postValidate'],
    input,
    tool: TOOL_NAME,
  });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  const parsed = parseRefreshWikiInput(input);
  if (!parsed.ok) return inputError(parsed.reason);
  const refreshInput = parsed.input;

  if (!workspace.ok) return createDiagnosticEnvelope({ diagnostics: [workspaceDiagnostic(workspace.reason)], status: 'domain_error', tool: TOOL_NAME });

  if (!refreshInput.generatedFiles || refreshInput.generatedFiles.length === 0) {
    return runAnalyzerRefresh(refreshInput, workspace, mutationMode);
  }

  const requestedFiles = refreshInput.generatedFiles;
  const protectedFiles = requestedFiles.filter((file) => !isGeneratedMutationAllowedPath(file.path));
  if (protectedFiles.length > 0) {
    return createDiagnosticEnvelope({
      data: { protectedPaths: protectedFiles.map((file) => file.path), writePolicy: 'generated-only' },
      diagnostics: protectedFiles.map((file) => ({ category: 'wiki', id: 'REFRESH_WIKI_PROTECTED_PATH', message: `${file.path} is outside generated wiki write-protect boundaries.`, path: file.path, ruleId: 'wiki.protected-path', severity: 'error' })),
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const resolvedTargets = [] as Array<{ absolutePath: string; beforeHash: string | null; file: RefreshWikiFileInput }>;
  for (const file of requestedFiles) {
    const safePath = await resolveSafeWorkspacePath({ inputPath: file.path, intent: 'create-missing', workspace });
    if (!safePath.ok) return pathError(file.path, safePath.reason);
    resolvedTargets.push({ absolutePath: safePath.absolutePath, beforeHash: await computeFileHash(safePath.absolutePath).catch(() => null), file });
  }

  if (mutationMode === 'preview-only') {
    return createDiagnosticEnvelope({
      data: { preview: true, target: refreshInput.target ?? 'all', writePolicy: 'generated-only', writeTargets: requestedFiles.map((file) => file.path) },
      diagnostics: [{ category: 'wiki', id: 'REFRESH_WIKI_PREVIEW', message: 'Generated wiki refresh preview created; no files were changed.', path: null, ruleId: 'wiki.refresh-preview', severity: 'info' }],
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  const safetyResult = await evaluateMutationSafetyGate({
    mode: mutationMode,
    targets: resolvedTargets.map((target) => ({ expectedHash: target.beforeHash ?? undefined, intent: target.beforeHash ? 'write-existing' as const : 'create-missing' as const, path: target.file.path })),
    toolName: TOOL_NAME,
    workspace,
  });
  if (!safetyResult.ok) {
    return createMutationResultEnvelope({
      changedFiles: [],
      postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'REFRESH_WIKI_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: null, ruleId: `refresh-wiki.${safetyResult.reason}`, severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'rejected',
      tool: TOOL_NAME,
    });
  }

  await applyWikiWrites(resolvedTargets);
  const changedFiles = await Promise.all(resolvedTargets.map(async (target): Promise<ChangedFileResult> => ({ afterHash: await computeFileHash(target.absolutePath), beforeHash: target.beforeHash ?? undefined, operationCount: 1, path: target.file.path })));
  const postValidation = refreshInput.postValidate !== false ? await runRefreshPostValidation(resolvedTargets) : { diagnostics: [], status: 'not_run' as const };
  const mutationId = `mutation:${Date.now().toString(36)}:refresh-wiki`;

  await appendJournalEntry(path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl'), {
    affectedFiles: changedFiles.map((file) => file.path),
    changedFiles,
    mutationId,
    patchOperations: requestedFiles.map((file) => ({ kind: 'text.replace', path: file.path })),
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
    resourceLinks: [`risuai-workbench://mutations/journal/${mutationId}`],
    status: postValidation.status === 'error' ? 'failed' : 'applied',
    tool: TOOL_NAME,
  });
}

async function runAnalyzerRefresh(
  input: RefreshWikiInput,
  workspace: Extract<WorkspaceRootStatus, { ok: true }>,
  mutationMode: MutationMode,
): Promise<RefreshWikiToolResult> {
  const safeWikiRoot = await resolveSafeWorkspacePath({
    inputPath: input.wikiRoot ?? 'wiki',
    intent: 'create-missing',
    workspace,
  });
  if (!safeWikiRoot.ok) return pathError(input.wikiRoot ?? 'wiki', safeWikiRoot.reason);

  if (!await isContainedWikiRoot(safeWikiRoot.absolutePath, workspace.path)) {
    return createDiagnosticEnvelope({
      data: { protectedPaths: [safeWikiRoot.relativePath], writePolicy: 'generated-only' },
      diagnostics: [{ category: 'wiki', id: 'REFRESH_WIKI_PROTECTED_PATH', message: `${safeWikiRoot.relativePath} resolves outside the workspace generated wiki boundary.`, path: safeWikiRoot.relativePath, ruleId: 'wiki.protected-path', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  if (await hasGeneratedWikiSymlink(safeWikiRoot.absolutePath)) {
    return createDiagnosticEnvelope({
      data: { protectedPaths: [safeWikiRoot.relativePath], writePolicy: 'generated-only' },
      diagnostics: [{ category: 'wiki', id: 'REFRESH_WIKI_PROTECTED_PATH', message: `${safeWikiRoot.relativePath} contains a symlink in an analyzer-owned write path.`, path: safeWikiRoot.relativePath, ruleId: 'wiki.protected-path', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const policyProbe = path.posix.join(safeWikiRoot.relativePath, '_log.md');
  if (!isGeneratedMutationAllowedPath(policyProbe)) {
    return createDiagnosticEnvelope({
      data: { protectedPaths: [safeWikiRoot.relativePath], writePolicy: 'generated-only' },
      diagnostics: [{ category: 'wiki', id: 'REFRESH_WIKI_PROTECTED_PATH', message: `${safeWikiRoot.relativePath} is outside generated wiki write-protect boundaries.`, path: safeWikiRoot.relativePath, ruleId: 'wiki.protected-path', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const args = await buildAnalyzeArgs(workspace.path, safeWikiRoot.absolutePath);
  if (mutationMode === 'preview-only') {
    return createDiagnosticEnvelope({
      data: { analyzeArgs: args, preview: true, target: input.target ?? 'all', wikiRoot: safeWikiRoot.relativePath, writePolicy: 'generated-only' },
      diagnostics: [{ category: 'wiki', id: 'REFRESH_WIKI_PREVIEW', message: 'Analyzer-backed wiki refresh preview created; no files were changed.', path: safeWikiRoot.relativePath, ruleId: 'wiki.refresh-preview', severity: 'info' }],
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  const before = await snapshotGeneratedWiki(safeWikiRoot.absolutePath, safeWikiRoot.relativePath);
  const commandResult = await runRisuCoreCommand(args, workspace.path);
  const after = await snapshotGeneratedWiki(safeWikiRoot.absolutePath, safeWikiRoot.relativePath);
  const changedFiles = diffWikiSnapshots(before, after);
  const commandFailed = commandResult.exitCode !== 0;
  const missingGeneratedOutput = ![...after.keys()].some((filePath) => filePath.includes('/_generated/'));
  const diagnostics: WorkbenchDiagnostic[] = [];
  if (commandFailed) {
    diagnostics.push({ category: 'workflow', id: 'REFRESH_WIKI_ANALYZE_FAILED', message: `risu-core analyze exited with code ${commandResult.exitCode}.`, path: safeWikiRoot.relativePath, ruleId: 'wiki.refresh-analyze-exit', severity: 'error' });
  } else if (missingGeneratedOutput) {
    diagnostics.push({ category: 'post-validation', id: 'REFRESH_WIKI_GENERATED_OUTPUT_MISSING', message: 'Analyzer completed without producing any _generated wiki files.', path: safeWikiRoot.relativePath, ruleId: 'wiki.generated-output-missing', severity: 'error' });
  }
  const postValidation: PostValidationResult = input.postValidate === false
    ? { diagnostics, status: diagnostics.length > 0 ? 'error' : 'not_run' }
    : { diagnostics, status: diagnostics.length > 0 ? 'error' : 'ok' };
  const mutationId = `mutation:${Date.now().toString(36)}:refresh-wiki`;
  const status = postValidation.status === 'error' ? 'failed' : 'applied';

  await appendJournalEntry(path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl'), {
    affectedFiles: changedFiles.map((file) => file.path),
    changedFiles,
    mutationId,
    patchOperations: [{ kind: 'text.replace', path: safeWikiRoot.relativePath }],
    postValidation,
    rollbackAvailable: false,
    status: status === 'applied' ? 'applied' : 'failed-validation',
    toolName: TOOL_NAME,
    workflowSummary: { analyzeArgs: args, exitCode: commandResult.exitCode, stderr: commandResult.stderr, stdout: commandResult.stdout },
  });

  return createMutationResultEnvelope({
    appliedAt: new Date().toISOString(),
    changedFiles,
    mutationId,
    postValidation,
    resourceLinks: [`risuai-workbench://mutations/journal/${mutationId}`],
    status,
    tool: TOOL_NAME,
    workflowSummary: { analyzeArgs: args, exitCode: commandResult.exitCode, timedOut: commandResult.timedOut },
  });
}

async function isContainedWikiRoot(wikiRoot: string, workspaceRoot: string): Promise<boolean> {
  const resolvedWorkspaceRoot = await realpath(workspaceRoot);
  let existingAncestor = wikiRoot;
  while (true) {
    try {
      existingAncestor = await realpath(existingAncestor);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) return false;
      existingAncestor = parent;
    }
  }
  const relative = path.relative(resolvedWorkspaceRoot, existingAncestor);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function hasGeneratedWikiSymlink(wikiRoot: string): Promise<boolean> {
  const analyzerOwnedPaths = [
    wikiRoot,
    path.join(wikiRoot, 'artifacts'),
    path.join(wikiRoot, '_schema'),
    path.join(wikiRoot, 'SCHEMA.md'),
    path.join(wikiRoot, '_index.md'),
    path.join(wikiRoot, '_log.md'),
  ];
  if (await isSymlink(wikiRoot)) return true;
  for (const ownedPath of analyzerOwnedPaths.slice(1)) {
    if (await containsSymlink(ownedPath)) return true;
  }
  return false;
}

async function containsSymlink(targetPath: string): Promise<boolean> {
  let targetStat;
  try {
    targetStat = await lstat(targetPath);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
  if (targetStat.isSymbolicLink()) return true;
  if (!targetStat.isDirectory()) return false;
  const entries = await readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) return true;
    if (entry.isDirectory() && await containsSymlink(path.join(targetPath, entry.name))) return true;
  }
  return false;
}

async function isSymlink(targetPath: string): Promise<boolean> {
  try {
    return (await lstat(targetPath)).isSymbolicLink();
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

async function buildAnalyzeArgs(workspaceRoot: string, wikiRoot: string): Promise<string[]> {
  try {
    await stat(path.join(wikiRoot, 'workspace.yaml'));
    return ['analyze', '--all', '--wiki-only', '--wiki-root', wikiRoot];
  } catch {
    return ['analyze', workspaceRoot, '--wiki-only', '--wiki-root', wikiRoot];
  }
}

async function snapshotGeneratedWiki(wikiRoot: string, relativeWikiRoot: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  const pending = [wikiRoot];
  while (pending.length > 0) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      const relativePath = path.posix.join(relativeWikiRoot, path.relative(wikiRoot, absolutePath).split(path.sep).join('/'));
      if (isGeneratedMutationAllowedPath(relativePath)) snapshot.set(relativePath, await computeFileHash(absolutePath));
    }
  }
  return snapshot;
}

function diffWikiSnapshots(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): ChangedFileResult[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((filePath) => before.get(filePath) !== after.get(filePath))
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => ({ afterHash: after.get(filePath), beforeHash: before.get(filePath), operationCount: 1, path: filePath }));
}

/**
 * applyWikiWrites 함수.
 * core write-protect helper별 의미에 맞춰 generated wiki file을 쓴다.
 *
 * @param targets - safe path가 검증된 write 대상
 */
async function applyWikiWrites(targets: ReadonlyArray<{ absolutePath: string; file: RefreshWikiFileInput }>): Promise<void> {
  const generatedGroups = new Map<string, RefreshWikiFileInput[]>();
  for (const target of targets) {
    const generatedMatch = target.file.path.match(/^(.*\/artifacts\/[^/]+\/_generated)\/(.+)$/);
    if (generatedMatch) {
      const [, , relativePath] = generatedMatch;
      const generatedDir = target.absolutePath.slice(0, target.absolutePath.length - relativePath.length - 1);
      generatedGroups.set(generatedDir, [...(generatedGroups.get(generatedDir) ?? []), { content: target.file.content, path: relativePath }]);
      continue;
    }
    await mkdir(path.dirname(target.absolutePath), { recursive: true });
    if (target.file.path.endsWith('/_log.md')) appendLogEntry(target.absolutePath, target.file.content);
    else if (target.file.path.endsWith('/_index.md')) rewriteIndexArtifactsSection(target.absolutePath, target.file.content);
    else writeSchemaIfChanged(target.absolutePath, target.file.content);
  }
  for (const [generatedDir, files] of generatedGroups) {
    writeArtifactFiles(generatedDir, files.map((file) => ({ content: file.content, relativePath: file.path })));
  }
}

/**
 * runRefreshPostValidation 함수.
 * refresh 후 대상 파일이 존재하며 boundary 밖 쓰기가 없었는지 다시 확인함.
 *
 * @param targets - refresh 대상 목록
 * @returns post-validation 결과
 */
async function runRefreshPostValidation(targets: ReadonlyArray<{ absolutePath: string; file: RefreshWikiFileInput }>): Promise<PostValidationResult> {
  const diagnostics: WorkbenchDiagnostic[] = [];
  for (const target of targets) {
    if (!isGeneratedMutationAllowedPath(target.file.path)) {
      diagnostics.push({ category: 'wiki', id: 'REFRESH_WIKI_BOUNDARY_BROKEN', message: `${target.file.path} is not an allowed generated wiki target.`, path: target.file.path, ruleId: 'wiki.boundary', severity: 'error' });
      continue;
    }
    try {
      await readFile(target.absolutePath, 'utf8');
    } catch (error) {
      diagnostics.push({ category: 'post-validation', id: 'REFRESH_WIKI_TARGET_MISSING', message: `Refresh target missing after write: ${(error as Error).message}`, path: target.file.path, ruleId: 'wiki.target-missing', severity: 'error' });
    }
  }
  return { diagnostics, status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'error' : diagnostics.some((diagnostic) => diagnostic.severity === 'warning') ? 'warning' : 'ok' };
}

/**
 * parseRefreshWikiInput 함수.
 * unknown raw input을 RefreshWikiInput으로 검증함.
 *
 * @param input - raw tool input
 * @returns parsed input 또는 reject reason
 */
function parseRefreshWikiInput(input: unknown): { input: RefreshWikiInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'Input must be an object.' };
  const candidate = input as Record<string, unknown>;
  const generatedFiles = Array.isArray(candidate.generatedFiles) ? candidate.generatedFiles as RefreshWikiFileInput[] : undefined;
  if (generatedFiles?.some((file) => typeof file.path !== 'string' || typeof file.content !== 'string')) return { ok: false, reason: 'generatedFiles must contain path/content strings.' };
  return { input: { generatedFiles, mode: 'commit', postValidate: typeof candidate.postValidate === 'boolean' ? candidate.postValidate : undefined, target: typeof candidate.target === 'string' ? candidate.target : undefined, wikiRoot: typeof candidate.wikiRoot === 'string' ? candidate.wikiRoot : undefined }, ok: true };
}
function inputError(reason: string): DiagnosticEnvelope {
  return createDiagnosticEnvelope({ diagnostics: [{ category: 'input', id: 'REFRESH_WIKI_INPUT_INVALID', message: reason, path: null, ruleId: 'input.refresh-wiki', severity: 'error' }], status: 'domain_error', tool: TOOL_NAME });
}

function pathError(targetPath: string, reason: string): DiagnosticEnvelope {
  return createDiagnosticEnvelope({ diagnostics: [{ category: 'path', id: 'PATH_OUTSIDE_WORKSPACE', message: `Path resolves outside workspace: ${targetPath} (${reason}).`, path: targetPath, ruleId: 'path.boundary', severity: 'error' }], status: 'domain_error', tool: TOOL_NAME });
}

function workspaceDiagnostic(reason: string | null): WorkbenchDiagnostic {
  return { category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${reason ?? 'unknown'}.`, path: null, ruleId: 'workspace.unavailable', severity: 'error' };
}
