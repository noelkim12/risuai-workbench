/**
 * Shared helpers for wrapping risu-core CLI workflows as MCP mutation tools.
 * @file packages/risuai-workbench-mcp/src/tools/mutation/core-workflow-cli.ts
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { ChangedFileResult, PostValidationResult } from '../../contracts/mutation-result';
import type { WorkbenchDiagnostic } from '../../contracts/diagnostics';
import { computeFileHash } from '../../mutation/file-hash';

const requireFromHere = createRequire(__filename);
const MAX_CAPTURED_OUTPUT_LENGTH = 12_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;

export type RisuLuaModeInput = 'classic' | 'modular';
export type RisuLuaRecoveryInput = 'none' | 'full-source';
export type RisuLuaSplitInput = 'none' | 'report' | 'coarse' | 'module-table';
export type RisuLuaDomainGenerationInput = 'report' | 'validated';

export interface RisuCoreCommandResult {
  args: readonly string[];
  cancelled: boolean;
  command: string;
  cwd: string;
  exitCode: number;
  timedOut: boolean;
  stderr: string;
  stdout: string;
}

export interface RunRisuCoreCommandOptions {
  signal?: AbortSignal;
}

/**
 * resolveRisuCoreBinPath 함수.
 * public package boundary는 지키되 bin entrypoint를 실행하기 위한 절대 경로를 찾음.
 *
 * @returns risu-core binary absolute path
 */
export function resolveRisuCoreBinPath(): string {
  const mainEntryPath = requireFromHere.resolve('@risuai-workbench/core');
  return path.join(path.dirname(mainEntryPath), '..', 'bin', 'risu-core.js');
}

/**
 * runRisuCoreCommand 함수.
 * MCP stdio stdout 오염을 피하기 위해 child stdout/stderr를 내부 캡처함.
 *
 * @param args - risu-core에 전달할 argv
 * @param cwd - command working directory
 * @returns exit code와 bounded stdout/stderr
 */
export async function runRisuCoreCommand(
  args: readonly string[],
  cwd: string,
  options: RunRisuCoreCommandOptions = {},
): Promise<RisuCoreCommandResult> {
  const binPath = resolveRisuCoreBinPath();
  if (options.signal?.aborted) {
    return {
      args,
      cancelled: true,
      command: process.execPath,
      cwd,
      exitCode: 130,
      stderr: 'risu-core command cancelled before start.',
      stdout: '',
      timedOut: false,
    };
  }
  return await new Promise<RisuCoreCommandResult>((resolve) => {
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    const onAbort = () => {
      if (settled) return;
      cancelled = true;
      stderr = appendBounded(stderr, '\nrisu-core command cancelled by MCP request.');
      child.kill('SIGTERM');
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr = appendBounded(stderr, chunk);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      stderr = appendBounded(stderr, `\nrisu-core command timed out after ${DEFAULT_COMMAND_TIMEOUT_MS}ms.`);
      child.kill('SIGTERM');
    }, DEFAULT_COMMAND_TIMEOUT_MS);
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      stderr = appendBounded(stderr, `\n${error.message}`);
      resolve({ args, cancelled, command: process.execPath, cwd, exitCode: 1, stderr, stdout, timedOut });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      resolve({ args, cancelled, command: process.execPath, cwd, exitCode: cancelled ? 130 : timedOut ? 124 : code ?? 1, stderr, stdout, timedOut });
    });
  });
}

/**
 * ensureOutputDirectoryMissing 함수.
 * workflow wrapper가 기존 디렉터리에 파일을 섞거나 덮어쓰지 않도록 보장함.
 *
 * @param absolutePath - output directory absolute path
 * @returns missing 여부와 reject reason
 */
export async function ensureOutputDirectoryMissing(absolutePath: string): Promise<{ ok: true } | { ok: false; reason: 'output-path-exists' | 'output-path-check-failed'; message: string }> {
  try {
    await stat(absolutePath);
    return { ok: false, reason: 'output-path-exists', message: 'Output path already exists.' };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOTDIR') return { ok: true };
    return { ok: false, reason: 'output-path-check-failed', message: nodeError.message };
  }
}

/**
 * collectChangedFiles 함수.
 * workflow output directory 아래 생성된 파일을 mutation result changedFiles로 정규화함.
 *
 * @param absoluteRoot - output root absolute path
 * @param relativeRoot - workspace-relative output root
 * @returns changed file 결과 목록
 */
export async function collectChangedFiles(absoluteRoot: string, relativeRoot: string): Promise<ChangedFileResult[]> {
  const files = await listFilesRecursive(absoluteRoot);
  const changedFiles: ChangedFileResult[] = [];
  for (const absolutePath of files) {
    const relativePath = joinPortable(relativeRoot, path.relative(absoluteRoot, absolutePath));
    changedFiles.push({
      afterHash: await computeFileHash(absolutePath),
      path: relativePath,
      operationCount: 1,
    });
  }
  return changedFiles.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * createWorkflowPostValidation 함수.
 * output directory 생성 여부와 marker 파일 존재를 검증함.
 *
 * @param options - 검증 대상 정보
 * @returns post-validation result
 */
export async function createWorkflowPostValidation(options: {
  absoluteRoot: string;
  expectedMarkerPaths: readonly string[];
  relativeRoot: string;
  tool: string;
}): Promise<PostValidationResult> {
  const diagnostics: WorkbenchDiagnostic[] = [];
  try {
    const rootStat = await stat(options.absoluteRoot);
    if (!rootStat.isDirectory()) {
      diagnostics.push({ category: 'post-validation', id: 'WORKFLOW_OUTPUT_NOT_DIRECTORY', message: `Workflow output is not a directory: ${options.relativeRoot}.`, path: options.relativeRoot, ruleId: `${options.tool}.output-not-directory`, severity: 'error' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push({ category: 'post-validation', id: 'WORKFLOW_OUTPUT_MISSING', message: `Workflow output directory is missing: ${options.relativeRoot} (${message}).`, path: options.relativeRoot, ruleId: `${options.tool}.output-missing`, severity: 'error' });
  }

  for (const markerPath of options.expectedMarkerPaths) {
    try {
      await stat(path.join(options.absoluteRoot, markerPath));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push({ category: 'post-validation', id: 'WORKFLOW_MARKER_MISSING', message: `Expected workflow marker is missing: ${joinPortable(options.relativeRoot, markerPath)} (${message}).`, path: joinPortable(options.relativeRoot, markerPath), ruleId: `${options.tool}.marker-missing`, severity: 'warning' });
    }
  }

  return {
    diagnostics,
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'error' : diagnostics.some((diagnostic) => diagnostic.severity === 'warning') ? 'warning' : 'ok',
  };
}

/**
 * sanitizeDefaultOutputName 함수.
 * core scaffold의 기본 outDir 계산과 같은 filename sanitizer를 적용함.
 *
 * @param name - source name
 * @returns sanitized filename
 */
export function sanitizeDefaultOutputName(name: string): string {
  const cleaned = [...name]
    .map((ch) => (/[<>:"/\\|?*]/.test(ch) || ch.charCodeAt(0) < 32 ? '_' : ch))
    .join('')
    .replace(/\.\./g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .substring(0, 100);
  return cleaned || 'unnamed';
}

export function buildRisuLuaArgs(input: {
  risuluaDomainGeneration?: RisuLuaDomainGenerationInput;
  risuluaMode?: RisuLuaModeInput;
  risuluaRecovery?: RisuLuaRecoveryInput;
  risuluaSplit?: RisuLuaSplitInput;
}): string[] {
  const args: string[] = [];
  if (input.risuluaMode) args.push('--risulua-mode', input.risuluaMode);
  if (input.risuluaRecovery) args.push('--risulua-recovery', input.risuluaRecovery);
  if (input.risuluaSplit) args.push('--risulua-split', input.risuluaSplit);
  if (input.risuluaDomainGeneration) args.push('--risulua-domain-generation', input.risuluaDomainGeneration);
  return args;
}

export function appendBounded(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= MAX_CAPTURED_OUTPUT_LENGTH) return next;
  return `${next.slice(0, MAX_CAPTURED_OUTPUT_LENGTH)}\n[output truncated]`;
}

export function getStringField(candidate: Record<string, unknown>, key: string): string | undefined {
  const value = candidate[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export function getBooleanField(candidate: Record<string, unknown>, key: string): boolean | undefined {
  const value = candidate[key];
  return typeof value === 'boolean' ? value : undefined;
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

function joinPortable(root: string, child: string): string {
  return path.posix.join(root.split(path.sep).join('/'), child.split(path.sep).join('/'));
}
