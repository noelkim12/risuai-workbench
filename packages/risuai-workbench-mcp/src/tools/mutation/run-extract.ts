/**
 * run_extract core workflow mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/run-extract.ts
 */

import path from 'node:path';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { MutationMode as PatchPlanMutationMode } from '../../contracts/patch-plan';
import { createMutationResultEnvelope, type MutationResultEnvelope } from '../../contracts/mutation-result';
import { appendJournalEntry } from '../../mutation/journal';
import type { MutationMode } from '../../mutation/mode';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
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
  outDir: string;
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
): Promise<RunExtractToolResult> {
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
  const safeSource = await resolveSafeWorkspacePath({ inputPath: extractInput.sourcePath, intent: 'read-existing', workspace });
  if (!safeSource.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'RUN_EXTRACT_SOURCE_UNSAFE', message: `Source path is not safe for extract: ${extractInput.sourcePath} (${safeSource.reason}).`, path: extractInput.sourcePath, ruleId: 'run-extract.source-boundary', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const safeOutDir = await resolveSafeWorkspacePath({ inputPath: extractInput.outDir, intent: 'create-missing', workspace });
  if (!safeOutDir.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'RUN_EXTRACT_OUTDIR_UNSAFE', message: `Output directory is not safe for extract: ${extractInput.outDir} (${safeOutDir.reason}).`, path: extractInput.outDir, ruleId: 'run-extract.outdir-boundary', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const missingOutput = await ensureOutputDirectoryMissing(safeOutDir.absolutePath);
  if (!missingOutput.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'RUN_EXTRACT_OUTDIR_EXISTS', message: `${missingOutput.message}: ${safeOutDir.relativePath}.`, path: safeOutDir.relativePath, ruleId: `run-extract.${missingOutput.reason}`, severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const argv = buildExtractArgs(extractInput, safeSource.relativePath, safeOutDir.relativePath);
  const confirmationText = `RUN_EXTRACT ${safeSource.relativePath} TO ${safeOutDir.relativePath}`;
  if (extractInput.mode === 'preview') {
    return createDiagnosticEnvelope({
      data: { command: process.execPath, args: [resolveRisuCoreBinPath(), ...argv], cwd: workspace.path, expectedConfirmationText: confirmationText, preview: true, source: safeSource.relativePath, target: safeOutDir.relativePath },
      diagnostics: [],
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  const safetyResult = await evaluateMutationSafetyGate({
    confirmation: extractInput.confirmation,
    expectedConfirmationText: confirmationText,
    mode: mutationMode,
    risk: 'high',
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

  const commandResult = await runRisuCoreCommand(argv, workspace.path);
  const changedFiles = await collectChangedFiles(safeOutDir.absolutePath, safeOutDir.relativePath).catch(() => []);
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
  if (!outDir) return { ok: false, reason: 'outDir must be a non-empty workspace-relative string.' };
  const type = getStringField(candidate, 'type');
  if (type !== undefined && !VALID_TYPES.has(type as ExtractType)) return { ok: false, reason: 'type must be character, module, or preset.' };
  const mode: PatchPlanMutationMode = candidate.mode === 'commit' ? 'commit' : 'preview';
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
  return diagnostics;
}
