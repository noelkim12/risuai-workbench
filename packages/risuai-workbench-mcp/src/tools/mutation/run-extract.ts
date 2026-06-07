/**
 * run_extract core workflow mutation tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/run-extract.ts
 */

import path from 'node:path';

import { createCancellationDiagnostic, isCancellationRequested, throwIfCancellationRequested } from '../../cancellation';
import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
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
  getStringField,
  runRisuCoreCommand,
  sanitizeDefaultOutputName,
  type RisuCoreCommandResult,
  type RisuLuaDomainGenerationInput,
  type RisuLuaRecoveryInput,
  type RisuLuaSplitInput,
} from './core-workflow-cli';

export type RunExtractToolResult = DiagnosticEnvelope | MutationResultEnvelope;

type ExtractType = 'character' | 'module' | 'preset';

export interface RunExtractInput {
  outDir?: string;
  postValidate?: boolean;
  risuluaDomainGeneration?: RisuLuaDomainGenerationInput;
  /** Always 'modular'. Classic is fallback-only and not caller-selectable. */
  risuluaMode?: 'modular';
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
  await progress?.report(1, 9, 'Validating run_extract input.');
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({
    allowedKeys: ['sourcePath', 'type', 'outDir', 'risuluaMode', 'risuluaRecovery', 'risuluaSplit', 'risuluaDomainGeneration', 'postValidate'],
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
  await progress?.report(2, 9, 'Resolving run_extract workspace paths.');
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

  await progress?.report(3, 9, 'Preparing run_extract command.');
  const defaultWikiRelativePath = defaultPostExtractWikiPath(safeOutDir.relativePath);
  const argv = buildExtractArgs(extractInput, safeSource.relativePath, safeOutDir.relativePath);
  const analyzeArgv = buildPostExtractAnalyzeArgs(extractInput, safeOutDir.relativePath, defaultWikiRelativePath);

  await progress?.report(4, 9, 'Checking run_extract mutation safety.');
  const safetyResult = await evaluateMutationSafetyGate({
    mode: mutationMode,
    targets: [{ intent: 'read-existing', path: safeSource.relativePath }, { intent: 'create-missing', path: safeOutDir.relativePath }, { intent: 'create-missing', path: defaultWikiRelativePath }],
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

  await progress?.report(5, 9, 'Running risu-core extract.');
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
  await progress?.report(6, 9, 'Running post-extract analyze and wiki generation.');
  const analyzeResult = commandResult.exitCode === 0
    ? await runRisuCoreCommand(analyzeArgv, workspace.path, { signal })
    : createSkippedCommandResult(analyzeArgv, workspace.path);
  await progress?.report(7, 9, 'Collecting run_extract changed files.');
  const changedFiles = await collectChangedFiles(safeOutDir.absolutePath, safeOutDir.relativePath).catch(() => []);
  await progress?.report(8, 9, 'Validating run_extract output.');
  const postValidation = extractInput.postValidate !== false
    ? await createWorkflowPostValidation({ absoluteRoot: safeOutDir.absolutePath, expectedMarkerPaths: expectedExtractMarkers(extractInput.type), relativeRoot: safeOutDir.relativePath, tool: TOOL_NAME })
    : { diagnostics: [], status: 'not_run' as const };
  const commandDiagnostics = [
    ...buildCommandDiagnostics(commandResult, safeOutDir.relativePath, 'extract', 'RUN_EXTRACT', 'run-extract'),
    ...buildCommandDiagnostics(analyzeResult, safeOutDir.relativePath, 'post-extract analyze/wiki', 'RUN_EXTRACT_ANALYZE', 'run-extract.analyze'),
  ];
  const workflowSummary = buildRunExtractWorkflowSummary({
    analyzeResult,
    analyzeArgv,
    commandResult,
    extractArgv: argv,
    outDir: safeOutDir.relativePath,
    sourcePath: safeSource.relativePath,
    wikiRoot: defaultWikiRelativePath,
  });
  const effectivePostValidationDiagnostics = [...postValidation.diagnostics, ...commandDiagnostics];
  const effectivePostValidation = commandResult.exitCode === 0 && analyzeResult.exitCode === 0
    ? { diagnostics: effectivePostValidationDiagnostics, status: aggregatePostValidationStatus(postValidation.status, effectivePostValidationDiagnostics) }
    : { diagnostics: effectivePostValidationDiagnostics, status: 'error' as const };
  const mutationId = `mutation:${Date.now().toString(36)}:${safeOutDir.relativePath.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 20)}`;

  await appendJournalEntry(path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl'), {
    affectedFiles: changedFiles.map((file) => file.path),
    changedFiles: [...changedFiles],
    mutationId,
    patchOperations: [{ kind: 'file.create', path: safeOutDir.relativePath, content: '[risu-core extract workflow output directory]' }],
    postValidation: effectivePostValidation,
    status: commandResult.exitCode === 0 && analyzeResult.exitCode === 0 && effectivePostValidation.status !== 'error' ? 'applied' : 'failed-validation',
    toolName: TOOL_NAME,
    workflowSummary,
  });

  await progress?.report(9, 9, 'run_extract complete.');
  return createMutationResultEnvelope({
    appliedAt: new Date().toISOString(),
    changedFiles,
    mutationId,
    postValidation: effectivePostValidation,
    resourceLinks: [`risuai-workbench://mutations/journal/${mutationId}`, `risuai-workbench://wiki/${defaultWikiRelativePath}`],
    status: commandResult.exitCode === 0 && analyzeResult.exitCode === 0 && effectivePostValidation.status !== 'error' ? 'applied' : 'failed',
    tool: TOOL_NAME,
    workflowSummary,
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
  // risuluaMode is hardcoded to 'modular'. Caller input is ignored.
  const risuluaRecovery = candidate.risuluaRecovery;
  if (risuluaRecovery !== undefined && risuluaRecovery !== 'none' && risuluaRecovery !== 'full-source') return { ok: false, reason: 'risuluaRecovery must be none or full-source.' };
  const risuluaSplitRaw = candidate.risuluaSplit;
  if (risuluaSplitRaw !== undefined && risuluaSplitRaw !== 'none' && risuluaSplitRaw !== 'report' && risuluaSplitRaw !== 'coarse' && risuluaSplitRaw !== 'module-table') return { ok: false, reason: 'risuluaSplit must be none, report, coarse, or module-table.' };
  // Default to module-table when omitted, same as risuluaMode defaults to modular.
  const risuluaSplit: RisuLuaSplitInput = (risuluaSplitRaw === 'none' || risuluaSplitRaw === 'report' || risuluaSplitRaw === 'coarse' || risuluaSplitRaw === 'module-table')
    ? risuluaSplitRaw
    : 'module-table';
  const risuluaDomainGeneration = candidate.risuluaDomainGeneration;
  if (risuluaDomainGeneration !== undefined && risuluaDomainGeneration !== 'report' && risuluaDomainGeneration !== 'validated') return { ok: false, reason: 'risuluaDomainGeneration must be report or validated.' };
  return {
    input: {
      outDir,
      postValidate: getBooleanField(candidate, 'postValidate'),
      risuluaDomainGeneration,
      risuluaMode: 'modular' as const,
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

function buildPostExtractAnalyzeArgs(input: RunExtractInput, outDir: string, wikiRoot: string): string[] {
  const args = ['analyze'];
  const analyzeType = extractTypeToAnalyzeType(input.type);
  if (analyzeType) args.push('--type', analyzeType);
  args.push(outDir, '--wiki', '--wiki-root', wikiRoot);
  return args;
}

function extractTypeToAnalyzeType(type: ExtractType | undefined): 'charx' | 'module' | 'preset' | undefined {
  if (type === 'character') return 'charx';
  return type;
}

function defaultPostExtractWikiPath(outDir: string): string {
  return path.posix.join(outDir, 'wiki');
}

function createSkippedCommandResult(args: readonly string[] = [], cwd = process.cwd()): RisuCoreCommandResult {
  return { args, cancelled: false, command: process.execPath, cwd, exitCode: 0, stderr: '', stdout: '', timedOut: false };
}

function expectedExtractMarkers(type: ExtractType | undefined): string[] {
  if (type === 'character') return ['.risuchar'];
  if (type === 'module') return ['.risumodule'];
  if (type === 'preset') return ['metadata.json'];
  return [];
}

function buildCommandDiagnostics(commandResult: RisuCoreCommandResult, targetPath: string, label: string, idPrefix: string, rulePrefix: string) {
  const diagnostics = [];
  diagnostics.push({ category: 'workflow', id: `${idPrefix}_COMMAND_SUMMARY`, message: summarizeCommandForDiagnostic(commandResult, label), path: targetPath, ruleId: `${rulePrefix}.summary`, severity: commandResult.exitCode === 0 ? 'info' as const : 'error' as const });
  for (const line of extractNotableCommandLines(commandResult)) diagnostics.push({ category: 'workflow', id: `${idPrefix}_NOTE`, message: line, path: targetPath, ruleId: `${rulePrefix}.notable-output`, severity: severityForCommandLine(line, commandResult) });
  if (commandResult.stderr.trim() !== '' && extractNotableLines(commandResult.stderr).length === 0) diagnostics.push({ category: 'workflow', id: `${idPrefix}_STDERR_SUMMARY`, message: summarizeOutput('stderr', commandResult.stderr), path: targetPath, ruleId: `${rulePrefix}.stderr`, severity: commandResult.exitCode === 0 ? 'warning' as const : 'error' as const });
  if (commandResult.exitCode !== 0) diagnostics.push({ category: 'workflow', id: `${idPrefix}_EXIT_NONZERO`, message: `risu-core ${label} exited with code ${commandResult.exitCode}.`, path: targetPath, ruleId: `${rulePrefix}.exit-code`, severity: 'error' as const });
  if (commandResult.timedOut) diagnostics.push({ category: 'workflow', id: `${idPrefix}_TIMEOUT`, message: `risu-core ${label} command timed out and was terminated.`, path: targetPath, ruleId: `${rulePrefix}.timeout`, severity: 'error' as const });
  if (commandResult.cancelled) diagnostics.push({ category: 'cancellation', id: `${idPrefix}_CANCELLED`, message: `risu-core ${label} was cancelled by the MCP request.`, path: targetPath, ruleId: `${rulePrefix}.cancelled`, severity: 'warning' as const });
  return diagnostics;
}

function buildRunExtractWorkflowSummary(input: {
  analyzeArgv: readonly string[];
  analyzeResult: RisuCoreCommandResult;
  commandResult: RisuCoreCommandResult;
  extractArgv: readonly string[];
  outDir: string;
  sourcePath: string;
  wikiRoot: string;
}): Record<string, unknown> {
  return {
    commands: [
      summarizeCommand('extract', input.commandResult),
      summarizeCommand('post-extract analyze/wiki', input.analyzeResult),
    ],
    extractArgs: input.extractArgv,
    notableOutput: [
      ...extractNotableCommandLines(input.commandResult),
      ...extractNotableCommandLines(input.analyzeResult),
    ],
    outDir: input.outDir,
    sourcePath: input.sourcePath,
    wikiRoot: input.wikiRoot,
    analyzeArgs: input.analyzeArgv,
  };
}

function summarizeCommand(label: string, result: RisuCoreCommandResult): Record<string, unknown> {
  return {
    args: result.args,
    cancelled: result.cancelled,
    exitCode: result.exitCode,
    label,
    stderrBytes: result.stderr.length,
    stdoutBytes: result.stdout.length,
    timedOut: result.timedOut,
  };
}

function summarizeCommandForDiagnostic(result: RisuCoreCommandResult, label: string): string {
  const command = ['risu-core', ...result.args].join(' ');
  return `${command} (${label}) exited ${result.exitCode}; stdout=${result.stdout.length} chars, stderr=${result.stderr.length} chars.`;
}

function summarizeOutput(label: string, output: string): string {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  const preview = lines.slice(0, 5).join('\n');
  const omitted = Math.max(0, lines.length - 5);
  return omitted > 0 ? `${label} (${lines.length} lines, showing first 5):\n${preview}\n[${omitted} lines omitted]` : `${label}:\n${preview}`;
}

function extractNotableCommandLines(result: RisuCoreCommandResult): string[] {
  return [...extractNotableLines(result.stdout), ...extractNotableLines(result.stderr)];
}

function extractNotableLines(output: string): string[] {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const notable = lines.filter(isNotableWorkflowLine);
  return [...new Set(notable)].slice(0, 20);
}

function isNotableWorkflowLine(line: string): boolean {
  return /(?:⚠️|❌|failed|failure|error|warning|timeout|cancelled|RisuLua split failed|Diagnostics written)/i.test(line);
}

function severityForCommandLine(line: string, result: RisuCoreCommandResult): 'error' | 'warning' | 'info' {
  if (result.exitCode !== 0) return 'error';
  if (/(?:⚠️|warning|cancelled|RisuLua split failed|continuing extract)/i.test(line)) return 'warning';
  if (/(?:❌|error|failed|failure|timeout)/i.test(line)) return 'error';
  return 'info';
}

function aggregatePostValidationStatus(
  currentStatus: 'ok' | 'warning' | 'error' | 'not_run',
  diagnostics: readonly { severity: 'error' | 'warning' | 'info' }[],
): 'ok' | 'warning' | 'error' | 'not_run' {
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return 'error';
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'warning')) return 'warning';
  return currentStatus;
}
