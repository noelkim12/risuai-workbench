/**
 * run_scaffold core workflow mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/run-scaffold.ts
 */

import path from 'node:path';

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
  type RisuLuaModeInput,
} from './core-workflow-cli';

export type RunScaffoldToolResult = DiagnosticEnvelope | MutationResultEnvelope;

type ScaffoldType = 'charx' | 'module' | 'preset';

export interface RunScaffoldInput {
  confirmation?: { accepted: boolean; confirmationText?: string };
  creator?: string;
  mode: PatchPlanMutationMode;
  name: string;
  namespace?: string;
  outDir?: string;
  postValidate?: boolean;
  risuluaMode?: RisuLuaModeInput;
  type: ScaffoldType;
}

const TOOL_NAME = 'workbench.run_scaffold';
const VALID_TYPES = new Set<ScaffoldType>(['charx', 'module', 'preset']);

export async function handleRunScaffold(
  input: unknown,
  workspace: WorkspaceRootStatus,
  mutationMode: MutationMode,
  progress?: ProgressReporter,
): Promise<RunScaffoldToolResult> {
  await progress?.report(1, 8, 'Validating run_scaffold input.');
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({
    allowedKeys: ['type', 'name', 'outDir', 'creator', 'namespace', 'risuluaMode', 'mode', 'confirmation', 'postValidate'],
    input,
    tool: TOOL_NAME,
  });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  const parsed = parseRunScaffoldInput(input);
  if (!parsed.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'input', id: 'RUN_SCAFFOLD_INPUT_INVALID', message: parsed.reason, path: null, ruleId: 'input.run-scaffold', severity: 'error' }],
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

  const scaffoldInput = parsed.input;
  const targetOutDir = scaffoldInput.outDir ?? `./${sanitizeDefaultOutputName(scaffoldInput.name)}`;
  await progress?.report(2, 8, 'Resolving run_scaffold workspace paths.');
  const safeOutDir = await resolveSafeWorkspacePath({ inputPath: targetOutDir, intent: 'create-missing', workspace });
  if (!safeOutDir.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'RUN_SCAFFOLD_OUTDIR_UNSAFE', message: `Output directory is not safe for scaffold: ${targetOutDir} (${safeOutDir.reason}).`, path: targetOutDir, ruleId: 'run-scaffold.outdir-boundary', severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const missingOutput = await ensureOutputDirectoryMissing(safeOutDir.absolutePath);
  if (!missingOutput.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{ category: 'path', id: 'RUN_SCAFFOLD_OUTDIR_EXISTS', message: `${missingOutput.message}: ${safeOutDir.relativePath}.`, path: safeOutDir.relativePath, ruleId: `run-scaffold.${missingOutput.reason}`, severity: 'error' }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  await progress?.report(3, 8, 'Preparing run_scaffold command preview.');
  const argv = buildScaffoldArgs(scaffoldInput, safeOutDir.relativePath);
  const confirmationText = `RUN_SCAFFOLD ${safeOutDir.relativePath}`;
  if (scaffoldInput.mode === 'preview') {
    await progress?.report(4, 8, 'run_scaffold preview complete.');
    return createDiagnosticEnvelope({
      data: { command: process.execPath, args: [resolveRisuCoreBinPath(), ...argv], cwd: workspace.path, expectedConfirmationText: confirmationText, preview: true, target: safeOutDir.relativePath },
      diagnostics: [],
      status: 'ok',
      tool: TOOL_NAME,
    });
  }

  await progress?.report(4, 8, 'Checking run_scaffold mutation safety.');
  const safetyResult = await evaluateMutationSafetyGate({
    confirmation: scaffoldInput.confirmation,
    expectedConfirmationText: confirmationText,
    mode: mutationMode,
    risk: 'high',
    targets: [{ intent: 'create-missing', path: safeOutDir.relativePath }],
    toolName: TOOL_NAME,
    workspace,
  });
  if (!safetyResult.ok) {
    return createMutationResultEnvelope({
      changedFiles: [],
      postValidation: { diagnostics: [{ category: 'mutation-safety', id: 'RUN_SCAFFOLD_SAFETY_REJECTED', message: `Safety gate rejected: ${safetyResult.reason}.`, path: safeOutDir.relativePath, ruleId: `run-scaffold.${safetyResult.reason}`, severity: 'error' }], status: 'error' },
      resourceLinks: [],
      status: 'rejected',
      tool: TOOL_NAME,
    });
  }

  await progress?.report(5, 8, 'Running risu-core scaffold.');
  const commandResult = await runRisuCoreCommand(argv, workspace.path);
  await progress?.report(6, 8, 'Collecting run_scaffold changed files.');
  const changedFiles = await collectChangedFiles(safeOutDir.absolutePath, safeOutDir.relativePath).catch(() => []);
  await progress?.report(7, 8, 'Validating run_scaffold output.');
  const postValidation = scaffoldInput.postValidate !== false
    ? await createWorkflowPostValidation({ absoluteRoot: safeOutDir.absolutePath, expectedMarkerPaths: expectedScaffoldMarkers(scaffoldInput.type), relativeRoot: safeOutDir.relativePath, tool: TOOL_NAME })
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
    patchOperations: [{ kind: 'file.create', path: safeOutDir.relativePath, content: '[risu-core scaffold workflow output directory]' }],
    postValidation: effectivePostValidation,
    status: commandResult.exitCode === 0 && effectivePostValidation.status !== 'error' ? 'applied' : 'failed-validation',
    toolName: TOOL_NAME,
  });

  await progress?.report(8, 8, 'run_scaffold complete.');
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

function parseRunScaffoldInput(input: unknown): { input: RunScaffoldInput; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'Input must be an object.' };
  const candidate = input as Record<string, unknown>;
  const type = getStringField(candidate, 'type');
  if (!type || !VALID_TYPES.has(type as ScaffoldType)) return { ok: false, reason: 'type must be one of charx, module, preset.' };
  const name = getStringField(candidate, 'name');
  if (!name) return { ok: false, reason: 'name must be a non-empty string.' };
  const mode: PatchPlanMutationMode = candidate.mode === 'commit' ? 'commit' : 'preview';
  const risuluaMode = candidate.risuluaMode;
  if (risuluaMode !== undefined && risuluaMode !== 'classic' && risuluaMode !== 'modular') return { ok: false, reason: 'risuluaMode must be classic or modular.' };
  return {
    input: {
      confirmation: getConfirmationField(candidate),
      creator: getStringField(candidate, 'creator'),
      mode,
      name,
      namespace: getStringField(candidate, 'namespace'),
      outDir: getStringField(candidate, 'outDir'),
      postValidate: getBooleanField(candidate, 'postValidate'),
      risuluaMode,
      type: type as ScaffoldType,
    },
    ok: true,
  };
}

function buildScaffoldArgs(input: RunScaffoldInput, outDir: string): string[] {
  const args = ['scaffold', input.type, '--name', input.name, '--out', outDir, ...buildRisuLuaArgs({ risuluaMode: input.risuluaMode })];
  if (input.creator) args.push('--creator', input.creator);
  if (input.namespace) args.push('--namespace', input.namespace);
  return args;
}

function expectedScaffoldMarkers(type: ScaffoldType): string[] {
  if (type === 'charx') return ['.risuchar'];
  if (type === 'module') return ['.risumodule'];
  return ['metadata.json'];
}

function buildCommandDiagnostics(commandResult: RisuCoreCommandResult, targetPath: string) {
  const diagnostics = [];
  if (commandResult.stdout.trim() !== '') diagnostics.push({ category: 'workflow', id: 'RUN_SCAFFOLD_STDOUT', message: commandResult.stdout, path: targetPath, ruleId: 'run-scaffold.stdout', severity: 'info' as const });
  if (commandResult.stderr.trim() !== '') diagnostics.push({ category: 'workflow', id: 'RUN_SCAFFOLD_STDERR', message: commandResult.stderr, path: targetPath, ruleId: 'run-scaffold.stderr', severity: commandResult.exitCode === 0 ? 'warning' as const : 'error' as const });
  if (commandResult.exitCode !== 0) diagnostics.push({ category: 'workflow', id: 'RUN_SCAFFOLD_EXIT_NONZERO', message: `risu-core scaffold exited with code ${commandResult.exitCode}.`, path: targetPath, ruleId: 'run-scaffold.exit-code', severity: 'error' as const });
  if (commandResult.timedOut) diagnostics.push({ category: 'workflow', id: 'RUN_SCAFFOLD_TIMEOUT', message: 'risu-core scaffold command timed out and was terminated.', path: targetPath, ruleId: 'run-scaffold.timeout', severity: 'error' as const });
  return diagnostics;
}
