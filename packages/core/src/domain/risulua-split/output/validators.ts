import fs from 'node:fs';
import path from 'node:path';

import { analyzeRisuLuaDistOutput, type RisuLuaDistDiagnostic } from '../../../cli/shared';
import {
  RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH,
  isForbiddenRisuLuaModuleTableMvpTarget,
  validateRisuLuaModuleTableRefactorMap,
  type RisuLuaModuleTableRefactorMapContract,
} from '../module-table/module-table-contracts';
import { serializeRisuLuaModuleTableRefactorMap } from '../module-table/module-table-rendering';
import type {
  LuaSourceRange,
  RisuLuaSplitPlan,
  RisuLuaSplitValidationFinding,
  RisuLuaSplitValidationSummary,
  RisuLuaValidatorSeverity,
} from '../shared/types';
import type { RisuLuaSplitDistBuildResult } from './dist-builder';
import type { RisuLuaWorkspaceFile } from './workspace-writer';

export interface ValidateRisuLuaSplitWorkspaceOptions {
  outputRoot: string;
  plan: RisuLuaSplitPlan;
  buildResult?: RisuLuaSplitDistBuildResult;
  source?: string;
  /** In-memory workspace files to avoid re-reading from disk. If provided, content is preferred for validation, but disk is still checked for consistency. */
  workspaceFiles?: RisuLuaWorkspaceFile[];
  /** In-memory refactor map for module-table validation. If provided, used for invariant checks, but disk refactor-map must still exist. */
  moduleTableRefactorMap?: RisuLuaModuleTableRefactorMapContract;
  /** Current working directory for path normalization in refactor-map comparison. Should match the cwd used during artifact writing. */
  cwd?: string;
}

const HOST_GLOBALS = [
  'getChatVar',
  'setChatVar',
  'getState',
  'setState',
  'getChat',
  'setChat',
  'addChat',
  'reloadDisplay',
  'alertNormal',
  'alertInput',
  'LLM',
  'request',
  'json',
  'Promise',
  'async',
] as const;

export function validateRisuLuaSplitWorkspace(
  options: ValidateRisuLuaSplitWorkspaceOptions,
): RisuLuaSplitValidationSummary {
  const findings = [
    ...validateLegacyOriginalExcluded(options.plan),
    ...validateSourceRanges(options),
    ...validateHostGlobalShadowing(options.outputRoot),
    ...validateStrategy(options),
    ...validateModuleTableProfile(options),
  ];
  const wroteDist = options.buildResult?.wroteDist ?? false;
  const distPath = resolveDistPath(options.outputRoot, options.plan);

  if (isDistStrategy(options.plan)) {
    findings.push(...validateDistProfile({ ...options, distPath }));
  } else {
    findings.push(...validateNoDistProfile({ ...options, distPath }));
  }

  const ok = !findings.some((finding) => finding.severity === 'error');
  return {
    ok,
    packable: ok && options.plan.packable && isDistStrategy(options.plan) && wroteDist,
    strategy: options.plan.buildStrategy,
    distPath: options.plan.distPath,
    wroteDist,
    findings,
  };
}

export function attachRisuLuaSplitValidation(
  plan: RisuLuaSplitPlan,
  validation: RisuLuaSplitValidationSummary,
): RisuLuaSplitPlan {
  return { ...plan, validation };
}

function validateLegacyOriginalExcluded(plan: RisuLuaSplitPlan): RisuLuaSplitValidationFinding[] {
  return plan.files
    .filter((file) => file.kind === 'legacy-original' && file.path.startsWith('lua/'))
    .map((file) => finding('legacy-original-in-source-graph', 'error', `Legacy original must stay outside lua source graph: ${file.path}`, file.path));
}

function validateSourceRanges(options: ValidateRisuLuaSplitWorkspaceOptions): RisuLuaSplitValidationFinding[] {
  const source = options.source ?? readLegacySource(options.outputRoot);
  if (source === null) return [];
  const lineCount = Math.max(1, source.split('\n').length);
  const findings: RisuLuaSplitValidationFinding[] = [];
  for (const file of options.plan.files) {
    for (const range of file.sourceRanges) {
      if (!isValidRange(range, source.length, lineCount)) {
        findings.push({
          code: 'source-range-invalid',
          severity: 'error',
          message: `Invalid source range in ${file.path}: offsets ${range.startOffset}-${range.endOffset}, lines ${range.startLine}-${range.endLine}`,
          filePath: file.path,
          sourceRanges: [range],
        });
      }
    }
  }
  return findings;
}

function validateHostGlobalShadowing(outputRoot: string): RisuLuaSplitValidationFinding[] {
  const findings: RisuLuaSplitValidationFinding[] = [];
  // Build combined regex once: matches any HOST_GLOBALS name in any of the three forms
  // Forms: local NAME, function NAME(, or line-start NAME =
  const escapedNames = HOST_GLOBALS.map(escapeRegExp).join('|');
  // Capture groups: (1) local name, (2) function name, (3) assignment name
  // Note: (?:^|\n) is non-capturing so assignment name is consistently at index 3
  const combinedRegex = new RegExp(
    `\\blocal\\s+(${escapedNames})\\b|\\bfunction\\s+(${escapedNames})\\s*\\(|(?:^|\\n)\\s*(${escapedNames})\\s*=`,
    'gu',
  );

  for (const filePath of listLuaFiles(path.join(outputRoot, 'lua'))) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativePath = toPosix(path.relative(outputRoot, filePath));

    // Reset regex state and find all matches in a single scan
    combinedRegex.lastIndex = 0;
    const matchedNames = new Set<string>();

    for (let match = combinedRegex.exec(source); match !== null; match = combinedRegex.exec(source)) {
      // Determine which capture group matched (local, function, or assignment)
      const name = match[1] ?? match[2] ?? match[3];
      if (name && !matchedNames.has(name)) {
        matchedNames.add(name);
        findings.push(finding('host-global-shadowed', 'warning', `Generated Lua shadows host global ${name} in ${relativePath}`, relativePath));
      }
    }
  }
  return findings;
}

function validateStrategy(options: ValidateRisuLuaSplitWorkspaceOptions): RisuLuaSplitValidationFinding[] {
  if (options.plan.buildStrategy === 'preload-recovery-no-dist') {
    return validatePreloadRecovery(options.plan);
  }
  if (options.plan.buildStrategy === 'report-only') {
    return [finding('dist-not-required', 'info', 'Report-only or high-risk preserve-first plan is terminal no-dist recovery.')];
  }
  return [];
}

function validatePreloadRecovery(plan: RisuLuaSplitPlan): RisuLuaSplitValidationFinding[] {
  const findings: RisuLuaSplitValidationFinding[] = [finding('preload-recovery-safe', 'info', 'Preload recovery validates recovered editing surfaces and intentionally skips dist self-containment.')];
  for (const duplicate of plan.preloadRecovery?.duplicateIds ?? []) {
    findings.push({
      code: 'preload-duplicate-id',
      severity: 'error',
      message: `Duplicate package.preload id blocks safe recovery: ${duplicate.preloadId}`,
      sourceRanges: duplicate.sourceRanges,
    });
  }
  for (const dynamicRequire of plan.preloadRecovery?.dynamicRequires ?? []) {
    findings.push({
      code: 'dynamic-require',
      severity: 'strong-warning',
      message: `Dynamic require in preload recovery requires manual review: ${dynamicRequire.expression}`,
      sourceRanges: [{ startLine: dynamicRequire.line, endLine: dynamicRequire.line, startOffset: 0, endOffset: 0 }],
    });
  }
  return findings;
}

function validateDistProfile(options: ValidateRisuLuaSplitWorkspaceOptions & { distPath: string | null }): RisuLuaSplitValidationFinding[] {
  const findings: RisuLuaSplitValidationFinding[] = [];
  const buildDiagnostics = options.buildResult?.diagnostics ?? [];
  for (const diagnostic of buildDiagnostics) {
    findings.push(distDiagnosticFinding(diagnostic, diagnostic.distRelativePath));
  }
  if (options.buildResult?.distBlocked) {
    return findings;
  }
  if (options.distPath === null || !fs.existsSync(options.distPath)) {
    findings.push(finding('missing-dist-output', 'error', `Expected generated dist output for ${options.plan.buildStrategy}.`));
    return findings;
  }

  const distRelativePath = options.plan.distPath ?? toPosix(path.relative(options.outputRoot, options.distPath));
  const code = fs.readFileSync(options.distPath, 'utf8');
  findings.push(finding('dist-written', 'info', `Generated dist output ${distRelativePath}.`, distRelativePath));
  for (const diagnostic of analyzeRisuLuaDistOutput({ code, distPath: options.distPath, distRelativePath })) {
    findings.push(distDiagnosticFinding(diagnostic, distRelativePath));
  }
  if (options.plan.mode === 'module-table' && code.includes('Build-time local helper fragments')) {
    findings.push(finding('module-table-build-time-fragment-marker', 'error', 'Module-table dist must use modular loader output instead of build-time local helper fragments.', distRelativePath));
  }
  for (const root of options.plan.detectedRoots) {
    if (!code.includes(root.name)) {
      findings.push({
        code: 'inbound-root-missing-from-dist',
        severity: 'strong-warning',
        message: `Detected inbound root ${root.name} was not found in generated dist ${distRelativePath}.`,
        filePath: distRelativePath,
        sourceRanges: [root.sourceRange],
      });
    }
  }
  return findings;
}

function distDiagnosticFinding(
  diagnostic: RisuLuaDistDiagnostic,
  distRelativePath: string,
): RisuLuaSplitValidationFinding {
  if (diagnostic.code === 'local_budget') {
    return finding('local-budget', diagnostic.severity ?? 'error', diagnostic.message, distRelativePath);
  }
  if (diagnostic.symbol === 'require') {
    return finding('executable-require-in-dist', diagnostic.severity ?? 'error', diagnostic.message, distRelativePath);
  }
  return finding('package-loader-mutation', diagnostic.severity ?? 'error', diagnostic.message, distRelativePath);
}

function validateModuleTableProfile(options: ValidateRisuLuaSplitWorkspaceOptions): RisuLuaSplitValidationFinding[] {
  if (options.plan.mode !== 'module-table') return [];
  const findings: RisuLuaSplitValidationFinding[] = [];

  // Build lookup for in-memory workspace files
  const workspaceFileMap = new Map<string, string>();
  if (options.workspaceFiles) {
    for (const file of options.workspaceFiles) {
      workspaceFileMap.set(file.path, file.content);
    }
  }

  for (const file of options.plan.files) {
    if (isForbiddenRisuLuaModuleTableMvpTarget(file.path)) {
      findings.push(finding('module-table-forbidden-output-path', 'error', `Module-table output path is forbidden: ${file.path}`, file.path));
    }
    if (file.kind === 'chunk-fragment') {
      findings.push(finding('module-table-stale-chunk-fragment', 'error', `Module-table output must not use stale chunk-fragment helper kind: ${file.path}`, file.path));
    }
    if (isModuleTableLuaModule(file.path)) {
      const outputPath = path.join(options.outputRoot, ...file.path.split('/'));
      const inMemoryContent = workspaceFileMap.get(file.path);
      const diskExists = fs.existsSync(outputPath);
      const diskContent = diskExists ? fs.readFileSync(outputPath, 'utf8') : null;

      // Use in-memory content for validation if available
      const contentToValidate = inMemoryContent ?? diskContent;
      if (contentToValidate !== null && contentToValidate.trim().length === 0) {
        findings.push(finding('module-table-empty-module', 'error', `Module-table generated module must not be empty: ${file.path}`, file.path));
      }

      // Fail-closed: if both exist but differ, report error
      if (inMemoryContent !== undefined && diskContent !== null && inMemoryContent !== diskContent) {
        findings.push(finding('module-table-content-mismatch', 'error', `Module-table in-memory content differs from disk for: ${file.path}`, file.path));
      }
    }
  }

  // Read disk refactor map (required for fail-closed behavior)
  const diskRefactorMap = readModuleTableRefactorMap(options.outputRoot);
  if (diskRefactorMap === null) {
    findings.push(finding('module-table-missing-refactor-map', 'error', `Module-table validation requires ${RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH}.`, RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH));
    return findings;
  }
  if (typeof diskRefactorMap === 'string') {
    findings.push(finding('module-table-refactor-map-invalid', 'error', diskRefactorMap, RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH));
    return findings;
  }

  // Determine which refactor map to use for invariant checks
  const inMemoryRefactorMap = options.moduleTableRefactorMap;
  const refactorMapToValidate = inMemoryRefactorMap ?? diskRefactorMap;

  // Fail-closed: if both exist but differ, report error
  // Compare serialized forms to ensure consistent path normalization (cwd → <repo-root>)
  if (inMemoryRefactorMap !== undefined) {
    const inMemorySerialized = serializeRisuLuaModuleTableRefactorMap(inMemoryRefactorMap, { cwd: options.cwd });
    const diskSerialized = fs.readFileSync(path.join(options.outputRoot, ...RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH.split('/')), 'utf8');
    if (inMemorySerialized !== diskSerialized) {
      findings.push(finding('module-table-refactor-map-mismatch', 'error', `Module-table in-memory refactor map differs from disk ${RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH}.`, RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH));
    }
  }

  for (const invariant of validateRisuLuaModuleTableRefactorMap(refactorMapToValidate)) {
    findings.push(finding('module-table-refactor-map-invalid', 'error', invariant.message, invariant.path ?? RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH));
  }

  const mappedModulePaths = new Set(refactorMapToValidate.modules.map((moduleContract) => moduleContract.path));
  for (const file of options.plan.files.filter((planned) => isRefactorMapOwnedModule(planned.path))) {
    if (!mappedModulePaths.has(file.path)) {
      findings.push(finding('module-table-refactor-map-missing-entry', 'error', `Module-table generated module lacks a docs/refactor-map.json module entry: ${file.path}`, file.path));
    }
  }
  return findings;
}

function validateNoDistProfile(options: ValidateRisuLuaSplitWorkspaceOptions & { distPath: string | null }): RisuLuaSplitValidationFinding[] {
  const findings = [finding('dist-not-required', 'info', `Strategy ${options.plan.buildStrategy} does not produce a dist output.`)];
  if (options.buildResult?.staleDistDetected || (options.distPath !== null && fs.existsSync(options.distPath))) {
    findings.push(finding('stale-dist-output', 'error', `Existing dist output is stale and must not be treated as newly written: ${options.plan.distPath ?? options.distPath}`, options.plan.distPath ?? undefined));
  }
  return findings;
}

function isDistStrategy(plan: RisuLuaSplitPlan): boolean {
  return plan.buildStrategy === 'concat-build-time-require' || plan.buildStrategy === 'section-order-concat';
}

function resolveDistPath(outputRoot: string, plan: RisuLuaSplitPlan): string | null {
  return plan.distPath === null ? null : path.join(outputRoot, ...plan.distPath.split('/'));
}

function readLegacySource(outputRoot: string): string | null {
  const legacyPath = path.join(outputRoot, 'legacy', 'original.risulua');
  return fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath, 'utf8') : null;
}

function readModuleTableRefactorMap(outputRoot: string): RisuLuaModuleTableRefactorMapContract | string | null {
  const refactorMapPath = path.join(outputRoot, ...RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH.split('/'));
  if (!fs.existsSync(refactorMapPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(refactorMapPath, 'utf8')) as RisuLuaModuleTableRefactorMapContract;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to parse ${RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH}: ${message}`;
  }
}

function isModuleTableLuaModule(filePath: string): boolean {
  return filePath.startsWith('lua/') && filePath !== 'lua/main.risulua' && filePath.endsWith('.risulua');
}

function isRefactorMapOwnedModule(filePath: string): boolean {
  return isModuleTableLuaModule(filePath) && !filePath.startsWith('lua/dist/');
}

function isValidRange(range: LuaSourceRange, sourceLength: number, lineCount: number): boolean {
  return Number.isInteger(range.startOffset)
    && Number.isInteger(range.endOffset)
    && range.startOffset >= 0
    && range.endOffset >= range.startOffset
    && range.endOffset <= sourceLength
    && Number.isInteger(range.startLine)
    && Number.isInteger(range.endLine)
    && range.startLine >= 1
    && range.endLine >= range.startLine
    && range.endLine <= lineCount;
}

function listLuaFiles(root: string): string[] {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listLuaFiles(candidate));
    if (entry.isFile() && entry.name.endsWith('.risulua')) files.push(candidate);
  }
  return files.sort();
}

function finding(
  code: RisuLuaSplitValidationFinding['code'],
  severity: RisuLuaValidatorSeverity,
  message: string,
  filePath?: string,
): RisuLuaSplitValidationFinding {
  return { code, severity, message, ...(filePath ? { filePath } : {}) };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
