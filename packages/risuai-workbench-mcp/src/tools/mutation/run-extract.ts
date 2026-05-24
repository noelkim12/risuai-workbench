/**
 * run_extract core workflow mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/run-extract.ts
 */

import path from 'node:path';

import { createCancellationDiagnostic, isCancellationRequested, throwIfCancellationRequested } from '../../cancellation';
import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { MutationMode as PatchPlanMutationMode } from '../../contracts/patch-plan';
import { createMutationResultEnvelope, type MutationResultEnvelope } from '../../contracts/mutation-result';
import { appendJournalEntry } from '../../mutation/journal';
import type { MutationMode } from '../../mutation/mode';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import type { ProgressReporter } from '../../progress';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { resolveSafeWorkspacePath } from '../../project/safe-path';

import {
  buildRisuLuaArgs,
  collectChangedFiles,
  ensureOutputDirectoryMissing,
  createWorkflowPostValidation,
  getBooleanField,
  getConfirmationField,
  getStringField,
  resolveRisuCoreBinPath,
  runRisuCoreCommand,
  sanitizeDefaultOutputName,
  type RisuCoreCommandResult,
  type RisuLuaDomainGenerationInput,
  type RisuLuaModeInput,
  type RisuLuaRecoveryInput,
  type RisuLuaSplitInput,
} from './core-workflow-cli';

export type RunExtractToolResult = DiagnosticEnvelope | MutationResultEnvelope;

type ExtractType = 'character' | 'module' | 'preset';

export interface RunExtractInput {
  confirmation?: { accepted: boolean; confirmationText?: string };
  mode: PatchPlanMutationMode;
  outDir?: string;
  postValidate?: boolean;
  risuluaDomainGeneration?: RisuLuaDomainGenerationInput;
  risuluaMode?: RisuLuaModeInput;
  risuluaRecovery?: RisuLuaRecoveryInput;
  risuluaSplit?: RisuLuaSplitInput;
  sourcePath: string;
  type?: ExtractType;
}

const TOOL_NAME = 'workbench.run_extract';
const VALID_TYPES = new Set<ExtractType>(['character', 'module', 'preset']);

export async function handleRunExtract(
  input: unknown,
  workspace: WorkspaceRootStatus,
  mutationMode: MutationMode,
  progress?: ProgressReporter,
  signal?: AbortSignal,
): Promise<RunExtractToolResult> {
  await progress?.report(1, 8, 'Validating run_extract input.');
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({
    allowedKeys: ['sourcePath', 'type', 'outDir', 'risuluaMode', 'risuluaRecovery', 'risuluaSplit', 'risuluaDomainGeneration', 'mode', 'confirmation', 'postValidate'],
    input,
    tool: TOOL_NAME,
  });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  const parsed = parseRunExtractInput(input);
  if (!parsed.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'input', id: 'RUN_EXTRACT_INPUT_INVALID', message: parsed.reason, path: null, ruleId: 'input.run-extract', severity: 'error' }],
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

  const extractInput = parsed.input;
  await progress?.report(2, 8, 'Resolving run_extract workspace paths.');
  const safeSource = await resolveSafeWorkspacePath({ inputPath: extractInput.sourcePath, intent: 'read-existing', workspace });
  if (!safeSource.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'RUN_EXTRACT_SOURCE_UNSAFE', message: `Source path is not safe for extract: ${extractInput.sourcePath} (${safeSource.reason}).`, path: extractInput.sourcePath, ruleId: 'run-extract.source-boundary', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const sourceDir = path.dirname(safeSource.relativePath);
  const sourceBase = sanitizeDefaultOutputName(path.basename(safeSource.relativePath, path.extname(safeSource.relativePath)));
  const defaultOutDir = extractInput.outDir
    ? extractInput.outDir
    : sourceDir === '.' ? `./${sourceBase}` : `${sourceDir}/${sourceBase}`;

  let safeOutDir = await resolveSafeWorkspacePath({ inputPath: defaultOutDir, intent: 'create-missing', workspace });
  if (!safeOutDir.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'RUN_EXTRACT_OUTDIR_UNSAFE', message: `Output directory is not safe for extract: ${defaultOutDir} (${safeOutDir.reason}).`, path: defaultOutDir, ruleId: 'run-extract.outdir-boundary', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  let missingOutput = await ensureOutputDirectoryMissing(safeOutDir.absolutePath);
  if (!missingOutput.ok) {
    // outDir이 이미 존재하면 자동으로 sourceBase 서브디렉토리를 생성
    const fallbackOutDir = path.posix.join(safeOutDir.relativePath, sourceBase);
    const safeFallback = await resolveSafeWorkspacePath({ inputPath: fallbackOutDir, intent: 'create-missing', workspace });
    if (!safeFallback.ok) {
      return createDiagnosticEnvelope({
        diagnostics: [{ category: 'path', id: 'RUN_EXTRACT_OUTDIR_UNSAFE', message: `Fallback output directory is not safe for extract: ${fallbackOutDir} (${safeFallback.reason}).`, path: fallbackOutDir, ruleId: 'run-extract.outdir-boundary', severity: 'error' }],
        status: 'domain_error',
        tool: TOOL_NAME,
      });
    }
    const missingFallback = await ensureOutputDirectoryMissing(safeFallback.absolutePath);
    if (!missingFallback.ok) {
      return createDiagnosticEnvelope({
        diagnostics: [{ category: 'path', id: 'RUN_EXTRACT_OUTDIR_EXISTS', message: `${missingFallback.message}: ${safeFallback.relativePath}.`, path: safeFallback.relativePath, ruleId: `run-extract.${missingFallback.reason}`, severity: 'error' }],
        status: 'domain_error',
        tool: TOOL_NAME,
      });
    }
    safeOutDir = safeFallback;
    missingOutput = missingFallback;
  }

  if (isCancellationRequested(signal)) {
    return createDiagnosticEnvelope({
      diagnostics: [createCancellationDiagnostic(TOOL_NAME, safeOutDir.relativePath)],
      status: 'domain_warning',
      tool: TOOL_NAME,
    });
  }

  await progress?.report(3, 8, 'Preparing run_extract command preview.');
  const argv = buildExtractArgs(extractInput, safeSource.relativePath, safeOutDir.relativePath);
  const confirmationText = `RUN_EXTRACT ${safeSource.relativePath} TO ${safeOutDir.relativePath}`;
  if (mutationMode === 'preview-only') {
    await progress?.report(4, 8, 'run_extract preview complete.');
    return createDiagnosticEnvelope({
      data: { command: process.execPath, args: [resolveRisuCoreBinPath(), ...argv], cwd: workspace.path, expectedConfirmationText: confirmationText, preview: true, source: safeSource.relativePath, target: safeOutDir.relativePath },
      diagnostics: [],
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  await progress?.report(4, 8, 'Checking run_extract mutation safety.');
  const safetyResult = await evaluateMutationSafetyGate({
    confirmation: extractInput.confirmation,
    expectedConfirmationText: confirmationText,
    mode: mutationMode,
    risk: 'medium',
    targets: [{ intent: 'read-existing', path: safeSource.relativePath }, { intent: 'create-missing', path: safeOutDir.relativePath }],
    toolName: TOOL_NAME,
    workspace,
  });
  if (!safetyResult.ok) {
    return createMutationResultEnvelope({
      changedFiles: [],
      postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'RUN_EXTRACT_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: safeOutDir.relativePath, ruleId: `run-extract.${safetyResult.reason}`, severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'rejected',
      tool: TOOL_NAME,
    });
  }

  await progress?.report(5, 8, 'Running risu-core extract.');
  try {
    throwIfCancellationRequested(signal, TOOL_NAME);
  } catch (error) {
    return createDiagnosticEnvelope({
      diagnostics: [createCancellationDiagnostic(TOOL_NAME, safeOutDir.relativePath)],
      status: 'domain_warning',
      tool: TOOL_NAME,
    });
  }
  const commandResult = await runRisuCoreCommand(argv, workspace.path, { signal });
  await progress?.report(6, 8, 'Collecting run_extract changed files.');
  const changedFiles = await collectChangedFiles(safeOutDir.absolutePath, safeOutDir.relativePath).catch(() => []);
  await progress?.report(7, 8, 'Validating run_extract output.');
  const postValidation = extractInput.postValidate !== false
    ? await createWorkflowPostValidation({ absoluteRoot: safeOutDir.absolutePath, expectedMarkerPaths: expectedExtractMarkers(extractInput.type), relativeRoot: safeOutDir.relativePath, tool: TOOL_NAME })
    : { diagnostics: [], status: 'not_run' as const };
  const commandDiagnostics = buildCommandDiagnostics(commandResult, safeOutDir.relativePath);
  const effectivePostValidation = commandResult.exitCode === 0
    ? { diagnostics: [...postValidation.diagnostics, ...commandDiagnostics], status: postValidation.status }
    : { diagnostics: [...postValidation.diagnostics, ...commandDiagnostics], status: 'error' as const };
  const mutationId = `mutation:${Date.now().toString(36)}:${safeOutDir.relativePath.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 20)}`;

  await appendJournalEntry(path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl'), {
    affectedFiles: changedFiles.map((file) => file.path),
    changedFiles: [...changedFiles],
    mutationId,
    patchOperations: [{ kind: 'file.create', path: safeOutDir.relativePath, content: '[risu-core extract workflow output directory]' }],
    postValidation: effectivePostValidation,
    status: commandResult.exitCode === 0 && effectivePostValidation.status !== 'error' ? 'applied' : 'failed-validation',
    toolName: TOOL_NAME,
  });

  await progress?.report(8, 8, 'run_extract complete.');
  return createMutationResultEnvelope({
    appliedAt: new Date().toISOString(),
    changedFiles,
    mutationId,
    postValidation: effectivePostValidation,
    resourceLinks: [`risuai-workbench://mutations/journal/${mutationId}`],
    status: commandResult.exitCode === 0 && effectivePostValidation.status !== 'error' ? 'applied' : 'failed',
    tool: TOOL_NAME,
  });
}

function parseRunExtractInput(input: unknown): { input: RunExtractInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'Input must be an object.' };
  const candidate = input as Record<string, unknown>;
  const sourcePath = getStringField(candidate, 'sourcePath');
  if (!sourcePath) return { ok: false, reason: 'sourcePath must be a non-empty workspace-relative string.' };
  const outDir = getStringField(candidate, 'outDir');
  // outDir is now optional; if omitted, it will be derived from sourcePath
  const type = getStringField(candidate, 'type');
  if (type !== undefined && !VALID_TYPES.has(type as ExtractType)) return { ok: false, reason: 'type must be character, module, or preset.' };
  const mode: PatchPlanMutationMode = 'commit';
  const risuluaMode = candidate.risuluaMode;
  if (risuluaMode !== undefined && risuluaMode !== 'classic' && risuluaMode !== 'modular') return { ok: false, reason: 'risuluaMode must be classic or modular.' };
  const risuluaRecovery = candidate.risuluaRecovery;
  if (risuluaRecovery !== undefined && risuluaRecovery !== 'none' && risuluaRecovery !== 'full-source') return { ok: false, reason: 'risuluaRecovery must be none or full-source.' };
  const risuluaSplit = candidate.risuluaSplit;
  if (risuluaSplit !== undefined && risuluaSplit !== 'none' && risuluaSplit !== 'report' && risuluaSplit !== 'coarse' && risuluaSplit !== 'module-table') return { ok: false, reason: 'risuluaSplit must be none, report, coarse, or module-table.' };
  const risuluaDomainGeneration = candidate.risuluaDomainGeneration;
  if (risuluaDomainGeneration !== undefined && risuluaDomainGeneration !== 'report' && risuluaDomainGeneration !== 'validated') return { ok: false, reason: 'risuluaDomainGeneration must be report or validated.' };
  return {
    input: {
      confirmation: getConfirmationField(candidate),
      mode,
      outDir,
      postValidate: getBooleanField(candidate, 'postValidate'),
      risuluaDomainGeneration,
      risuluaMode,
      risuluaRecovery,
      risuluaSplit,
      sourcePath,
      type: type as ExtractType | undefined,
    },
    ok: true,
  };
}

function buildExtractArgs(input: RunExtractInput, sourcePath: string, outDir: string): string[] {
  const args = ['extract', sourcePath, '--out', outDir, ...buildRisuLuaArgs({ risuluaDomainGeneration: input.risuluaDomainGeneration, risuluaMode: input.risuluaMode, risuluaRecovery: input.risuluaRecovery, risuluaSplit: input.risuluaSplit })];
  if (input.type) args.push('--type', input.type);
  return args;
}

function expectedExtractMarkers(type: ExtractType | undefined): string[] {
  if (type === 'character') return ['.risuchar'];
  if (type === 'module') return ['.risumodule'];
  if (type === 'preset') return ['metadata.json'];
  return [];
}

function buildCommandDiagnostics(commandResult: RisuCoreCommandResult, targetPath: string) {
  const diagnostics = [];
  if (commandResult.stdout.trim() !== '') diagnostics.push({ category: 'workflow', id: 'RUN_EXTRACT_STDOUT', message: commandResult.stdout, path: targetPath, ruleId: 'run-extract.stdout', severity: 'info' as const });
  if (commandResult.stderr.trim() !== '') diagnostics.push({ category: 'workflow', id: 'RUN_EXTRACT_STDERR', message: commandResult.stderr, path: targetPath, ruleId: 'run-extract.stderr', severity: commandResult.exitCode === 0 ? 'warning' as const : 'error' as const });
  if (commandResult.exitCode !== 0) diagnostics.push({ category: 'workflow', id: 'RUN_EXTRACT_EXIT_NONZERO', message: `risu-core extract exited with code ${commandResult.exitCode}.`, path: targetPath, ruleId: 'run-extract.exit-code', severity: 'error' as const });
  if (commandResult.timedOut) diagnostics.push({ category: 'workflow', id: 'RUN_EXTRACT_TIMEOUT', message: 'risu-core extract command timed out and was terminated.', path: targetPath, ruleId: 'run-extract.timeout', severity: 'error' as const });
  if (commandResult.cancelled) diagnostics.push({ category: 'cancellation', id: 'RUN_EXTRACT_CANCELLED', message: 'risu-core extract was cancelled by the MCP request.', path: targetPath, ruleId: 'run-extract.cancelled', severity: 'warning' as const });
  return diagnostics;
}
