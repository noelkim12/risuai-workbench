import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RISULUA_SPLIT_PLAN_PATH,
  RISULUA_SPLIT_REPORT_PATH,
  attachRisuLuaSplitValidation,
  buildRisuLuaSplitDist,
  createRisuLuaMixedPreserveArtifacts,
  createRisuLuaPlainCoarseArtifacts,
  createRisuLuaPreloadRecoveryArtifacts,
  createRisuLuaReportOnlyArtifacts,
  createRisuLuaSectionRecoveryArtifacts,
  detectRisuLuaSourceProfile,
  validateRisuLuaSplitWorkspace,
  writeRisuLuaMixedPreserveWorkspace,
  writeRisuLuaPlainCoarseWorkspace,
  writeRisuLuaPreloadRecoveryWorkspace,
  writeRisuLuaSectionRecoveryWorkspace,
  writeRisuLuaSplitPlan,
  writeRisuLuaSplitReport,
  type RisuLuaSplitPlan,
  type RisuLuaSplitReportContext,
} from '@/domain/risulua-split';

import { runModuleTableDryRunAsync } from './risulua-module-table-dry-run';

export type RisuLuaSplitCliMode = 'none' | 'report' | 'coarse' | 'module-table';

export interface ParsedRisuLuaSplitMode {
  mode: RisuLuaSplitCliMode | null;
  strippedArgv: string[];
}

export interface RunRisuLuaSplitOptions {
  mode: RisuLuaSplitCliMode;
  outputRoot: string;
  source: string;
  sourcePath: string;
  targetName: string;
  cwd?: string;
}

export const RISULUA_SPLIT_FLAG = '--risulua-split';
export const RISULUA_SPLIT_HELP_LINE =
  '    --risulua-split <none|report|coarse|module-table>  추출된 RisuLua split 산출물 생성 방식 (기본: none)';

const VALID_SPLIT_MODES: readonly string[] = ['none', 'report', 'coarse', 'module-table'];
const SPLIT_OUTPUT_ROOTS = ['lua', 'legacy', 'dist', 'docs'] as const;

export function parseRisuLuaSplitMode(argv: readonly string[]): ParsedRisuLuaSplitMode {
  const idx = argv.indexOf(RISULUA_SPLIT_FLAG);
  if (idx < 0) return { mode: null, strippedArgv: [...argv] };

  const value = argv[idx + 1];
  if (!value || !VALID_SPLIT_MODES.includes(value)) {
    throw new Error(
      `Invalid ${RISULUA_SPLIT_FLAG} value: "${value ?? ''}". Must be "none", "report", "coarse", or "module-table".`,
    );
  }

  const strippedArgv = [...argv];
  strippedArgv.splice(idx, 2);
  return { mode: value as RisuLuaSplitCliMode, strippedArgv };
}

export async function runRisuLuaSplitExtract(options: RunRisuLuaSplitOptions): Promise<void> {
  if (options.mode === 'none') return;

  if (options.mode === 'module-table') {
    await runModuleTableExtract(options);
    return;
  }

  const tempRoot = createTempRoot(options.outputRoot);
  let keepTemp = false;
  try {
    if (options.mode === 'report') {
      writeReportOnlyArtifacts(options, tempRoot);
      moveDocsOnly(tempRoot, options.outputRoot);
      return;
    }

    const artifacts = createCoarseArtifacts(options);
    writeCoarseArtifacts(artifacts, tempRoot, options.cwd);
    const buildResult = buildRisuLuaSplitDist({ outputRoot: tempRoot, plan: artifacts.plan });
    const validation = validateRisuLuaSplitWorkspace({
      outputRoot: tempRoot,
      plan: artifacts.plan,
      buildResult,
      source: options.source,
    });
    const validatedPlan = attachRisuLuaSplitValidation(artifacts.plan, validation);
    const validatedContext = { ...artifacts, plan: validatedPlan };
    rewriteDiagnostics(validatedContext, tempRoot, options.cwd);

    if (!validation.ok) {
      moveDocsOnly(tempRoot, options.outputRoot);
      throw new Error(`RisuLua split validation failed; diagnostics were written to docs/.`);
    }

    moveSplitWorkspace(tempRoot, options.outputRoot);
  } catch (error) {
    keepTemp = false;
    throw error;
  } finally {
    if (!keepTemp) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function runModuleTableExtract(options: RunRisuLuaSplitOptions): Promise<void> {
  const tempRoot = createTempRoot(options.outputRoot);
  try {
    await runModuleTableDryRunAsync({ ...options, outputRoot: tempRoot });
    moveSplitWorkspace(tempRoot, options.outputRoot);
  } catch (error) {
    moveDocsOnly(tempRoot, options.outputRoot);
    throw error;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function writeReportOnlyArtifacts(options: RunRisuLuaSplitOptions, outputRoot: string): void {
  const artifacts = createRisuLuaReportOnlyArtifacts({
    source: options.source,
    sourcePath: options.sourcePath,
    targetName: options.targetName,
  });
  writeRisuLuaSplitPlan(artifacts.plan, { outputRoot, cwd: options.cwd });
  writeRisuLuaSplitReport(artifacts, { outputRoot });
}

function createCoarseArtifacts(options: RunRisuLuaSplitOptions): RisuLuaSplitReportContext & { plan: RisuLuaSplitPlan } {
  const input = {
    source: options.source,
    sourcePath: options.sourcePath,
    targetName: options.targetName,
  };
  const profile = detectRisuLuaSourceProfile(options.source).profile;
  if (profile === 'plain-single') return createRisuLuaPlainCoarseArtifacts(input);
  if (profile === 'section-bundle') return createRisuLuaSectionRecoveryArtifacts(input);
  if (profile === 'preload-bundle') return createRisuLuaPreloadRecoveryArtifacts(input);
  return createRisuLuaMixedPreserveArtifacts(input);
}

function writeCoarseArtifacts(
  artifacts: RisuLuaSplitReportContext & { plan: RisuLuaSplitPlan },
  outputRoot: string,
  cwd: string | undefined,
): void {
  if (artifacts.plan.sourceProfile === 'plain-single') {
    writeRisuLuaPlainCoarseWorkspace(artifacts as ReturnType<typeof createRisuLuaPlainCoarseArtifacts>, { outputRoot, cwd });
    return;
  }
  if (artifacts.plan.sourceProfile === 'section-bundle') {
    writeRisuLuaSectionRecoveryWorkspace(artifacts as ReturnType<typeof createRisuLuaSectionRecoveryArtifacts>, { outputRoot, cwd });
    return;
  }
  if (artifacts.plan.sourceProfile === 'preload-bundle') {
    writeRisuLuaPreloadRecoveryWorkspace(artifacts as ReturnType<typeof createRisuLuaPreloadRecoveryArtifacts>, { outputRoot, cwd });
    return;
  }
  writeRisuLuaMixedPreserveWorkspace(artifacts as ReturnType<typeof createRisuLuaMixedPreserveArtifacts>, { outputRoot, cwd });
}

function rewriteDiagnostics(
  context: RisuLuaSplitReportContext & { plan: RisuLuaSplitPlan },
  outputRoot: string,
  cwd: string | undefined,
): void {
  writeRisuLuaSplitPlan(context.plan, { outputRoot, cwd });
  writeRisuLuaSplitReport(context, { outputRoot });
}

function createTempRoot(outputRoot: string): string {
  const parentDir = path.dirname(outputRoot);
  fs.mkdirSync(parentDir, { recursive: true });
  return fs.mkdtempSync(path.join(parentDir, `.tmp-risulua-split-${path.basename(outputRoot)}-`));
}

function moveDocsOnly(tempRoot: string, outputRoot: string): void {
  moveRelative(tempRoot, outputRoot, RISULUA_SPLIT_PLAN_PATH);
  moveRelative(tempRoot, outputRoot, RISULUA_SPLIT_REPORT_PATH);
}

function moveSplitWorkspace(tempRoot: string, outputRoot: string): void {
  for (const relativePath of SPLIT_OUTPUT_ROOTS) {
    const sourcePath = path.join(tempRoot, relativePath);
    if (fs.existsSync(sourcePath)) moveRelative(tempRoot, outputRoot, relativePath);
  }
}

function moveRelative(tempRoot: string, outputRoot: string, relativePath: string): void {
  const sourcePath = path.join(tempRoot, ...relativePath.split('/'));
  if (!fs.existsSync(sourcePath)) return;
  const targetPath = path.join(outputRoot, ...relativePath.split('/'));
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.renameSync(sourcePath, targetPath);
}

export function cleanupRisuLuaSplitTemps(outputRoot: string): void {
  const parentDir = path.dirname(outputRoot);
  if (!fs.existsSync(parentDir)) return;
  const prefix = `.tmp-risulua-split-${path.basename(outputRoot)}-`;
  for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(prefix)) {
      fs.rmSync(path.join(parentDir, entry.name), { recursive: true, force: true });
    }
  }
}

export function uniqueRisuLuaSplitTargetName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_') || 'main';
}

export function getTempDirectoryRoot(): string {
  return os.tmpdir();
}
