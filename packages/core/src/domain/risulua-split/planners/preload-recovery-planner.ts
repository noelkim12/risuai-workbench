import { evaluateLuaRuntimeRiskPolicy } from '../profiling/lua-runtime-risk-policy';
import { detectRisuLuaSourceProfile } from '../profiling/source-profile';
import { extractRisuLuaPreloadModules, type RisuLuaExtractedPreloadModule } from '../extractors/preload-extractor';
import { writeRisuLuaSplitPlan } from '../output/plan-writer';
import { writeRisuLuaSplitReport } from '../output/report-writer';
import { writeRisuLuaWorkspaceFiles, type RisuLuaWorkspaceFile } from '../output/workspace-writer';
import type {
  LuaDetectedRoot,
  LuaHostApiSummary,
  LuaPlanRisk,
  LuaPlannedFile,
  LuaSourceRange,
  RisuLuaPreloadRecoveryMetadata,
  RisuLuaSplitPlan,
  SourceProfileResult,
  SourceProfileSummary,
} from '../shared/types';

export interface CreateRisuLuaPreloadRecoveryInput {
  source: string;
  sourcePath: string;
  targetName?: string;
}

export interface RisuLuaPreloadRecoveryPlan extends RisuLuaSplitPlan {
  sourceProfileResult: SourceProfileResult;
  preloadRecovery: RisuLuaPreloadRecoveryMetadata;
}

export interface RisuLuaPreloadRecoveryArtifacts {
  plan: RisuLuaPreloadRecoveryPlan;
  workspaceFiles: RisuLuaWorkspaceFile[];
  profileMap: string[];
  pureCandidates: string[];
  runtimeCoupledHelpers: string[];
  riskyBlocks: string[];
  dynamicPatterns: string[];
  refactorTasks: string[];
  verificationSuggestions: string[];
  modules: RisuLuaExtractedPreloadModule[];
}

export interface WriteRisuLuaPreloadRecoveryWorkspaceOptions {
  outputRoot: string;
  cwd?: string;
}

const PRELOAD_ENTRY_PATH = 'lua/main.risulua' as const;

export function createRisuLuaPreloadRecoveryArtifacts(
  input: CreateRisuLuaPreloadRecoveryInput,
): RisuLuaPreloadRecoveryArtifacts {
  const sourceProfileResult = detectRisuLuaSourceProfile(input.source);
  const extraction = extractRisuLuaPreloadModules(input.source);
  const targetName = input.targetName ?? inferTargetName(input.sourcePath);
  const metadata = buildPreloadMetadata(extraction.modules);
  const risks = buildPreloadRisks(sourceProfileResult, extraction.modules, metadata);
  const plan: RisuLuaPreloadRecoveryPlan = {
    version: 1,
    mode: 'coarse',
    sourceProfile: sourceProfileResult.profile,
    sourceProfileSummary: summarizeProfile(sourceProfileResult),
    sourceProfileResult,
    sourcePath: normalizeSourcePath(input.sourcePath),
    targetName,
    entryPath: PRELOAD_ENTRY_PATH,
    distPath: null,
    packable: false,
    buildStrategy: 'preload-recovery-no-dist',
    files: [
      {
        path: PRELOAD_ENTRY_PATH,
        kind: 'entry-tail',
        sourceRanges: extraction.tailRanges,
        confidence: 'high',
        reason: 'Recovered remaining non-preload tail chunk; v1 preserves require semantics and writes no dist.',
        preserveOrderIndex: -1,
      },
      ...extraction.modules.map(moduleToPlannedFile),
      {
        path: 'legacy/original.risulua',
        kind: 'legacy-original',
        sourceRanges: [wholeSourceRange(input.source)],
        confidence: 'high',
        reason: 'Original preload bundle preserved outside the lua source graph for recovery and audit.',
        preserveOrderIndex: extraction.modules.length,
      },
    ],
    risks,
    detectedRoots: detectPreloadRoots(extraction.modules),
    hostApiSummary: summarizeHostApis(input.source),
    preloadRecovery: metadata,
  };

  return {
    plan,
    workspaceFiles: [
      { path: PRELOAD_ENTRY_PATH, content: renderPreloadMain(extraction.modules, extraction.tail) },
      ...extraction.modules.map((module) => ({ path: module.path, content: renderPreloadModule(module) })),
      { path: 'legacy/original.risulua', content: input.source },
    ],
    profileMap: extraction.modules.map((module) => `Preload module \`${module.preloadId}\` → \`${module.path}\` (lines ${module.sourceRange.startLine}-${module.sourceRange.endLine}).`),
    pureCandidates: [],
    runtimeCoupledHelpers: ['Recovered preload files contain wrapper function bodies; top-level return values are module exports and must remain local to those files.'],
    riskyBlocks: risks.map((risk) => `${risk.severity}: ${risk.message}`),
    dynamicPatterns: buildDynamicPatterns(sourceProfileResult, extraction.modules),
    refactorTasks: ['Do not rename preload ids in plan metadata; file paths are only safe projections.', 'Resolve duplicate, unresolved, or dynamic requires before designing any future require-free dist conversion.'],
    verificationSuggestions: ['Verify `dist/<target>.risulua` is absent for preload-bundle v1.', 'Review `preloadRecovery.modules` in plan JSON before using recovered files as editing surfaces.'],
    modules: extraction.modules,
  };
}

export function writeRisuLuaPreloadRecoveryWorkspace(
  artifacts: RisuLuaPreloadRecoveryArtifacts,
  options: WriteRisuLuaPreloadRecoveryWorkspaceOptions,
): void {
  writeRisuLuaWorkspaceFiles(artifacts.workspaceFiles, { outputRoot: options.outputRoot });
  writeRisuLuaSplitPlan(artifacts.plan, { outputRoot: options.outputRoot, cwd: options.cwd });
  writeRisuLuaSplitReport(artifacts, { outputRoot: options.outputRoot });
}

export function renderPreloadMain(modules: RisuLuaExtractedPreloadModule[], tail: string): string {
  const preloadLines = modules.map((module) => `-- preload: ${module.preloadId} -> ${module.path.replace(/^lua\/preload\//, 'preload/')}`);
  return [
    '-- @generated by risuai-workbench',
    '-- risulua-split=coarse',
    '-- source-profile=preload-bundle',
    '-- dist-build-strategy=preload-recovery-no-dist',
    '-- packable=false',
    ...preloadLines,
    '',
    tail,
  ].join('\n');
}

function renderPreloadModule(module: RisuLuaExtractedPreloadModule): string {
  return [
    '-- @generated by risuai-workbench',
    '-- source-profile=preload-bundle',
    '-- module-kind=preload-module',
    `-- preload-id=${module.preloadId}`,
    `-- original-range=L${module.sourceRange.startLine}-L${module.sourceRange.endLine}`,
    '',
    module.body,
  ].join('\n');
}

function moduleToPlannedFile(module: RisuLuaExtractedPreloadModule): LuaPlannedFile {
  return {
    path: module.path,
    kind: 'preload-module',
    sourceRanges: [module.sourceRange, module.bodyRange],
    preloadId: module.preloadId,
    confidence: 'high',
    reason: 'Recovered from the exact package.preload wrapper body without AST reprint or Lua formatting.',
    preserveOrderIndex: module.preserveOrderIndex,
  };
}

function buildPreloadMetadata(modules: RisuLuaExtractedPreloadModule[]): RisuLuaPreloadRecoveryMetadata {
  const preloadIds = new Set(modules.map((module) => module.preloadId));
  const duplicateIds = findDuplicateIds(modules);
  const unresolvedRequires = modules
    .map((module) => ({ preloadId: module.preloadId, requires: module.requires.filter((id) => !preloadIds.has(id)) }))
    .filter((item) => item.requires.length > 0);
  return {
    modules: modules.map((module) => ({
      preloadId: module.preloadId,
      path: module.path,
      sourceRange: module.sourceRange,
      bodyRange: module.bodyRange,
      requires: module.requires,
      unresolvedRequires: module.requires.filter((id) => !preloadIds.has(id)),
      dynamicRequires: module.dynamicRequires,
    })),
    duplicateIds,
    dynamicRequires: modules.flatMap((module) => module.dynamicRequires),
    unresolvedRequires,
  };
}

function buildPreloadRisks(
  result: SourceProfileResult,
  modules: RisuLuaExtractedPreloadModule[],
  metadata: RisuLuaPreloadRecoveryMetadata,
): LuaPlanRisk[] {
  const risks: LuaPlanRisk[] = [
    {
      id: 'preload-recovery-no-dist',
      severity: 'info',
      message: 'preload-bundle recovery preserves package.preload require semantics and intentionally writes no dist output in v1.',
      sourceRanges: modules.map((module) => module.sourceRange),
      riskFlags: ['preload-recovery-no-dist', 'packable-false'],
    },
    ...evaluateLuaRuntimeRiskPolicy(result).map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      message: finding.message,
      sourceRanges: [lineOnlyRange(finding.line)],
      riskFlags: [finding.level, finding.id],
    })),
  ];

  for (const duplicate of metadata.duplicateIds) {
    risks.push({
      id: 'duplicate-preload-id',
      severity: 'error',
      message: `Duplicate package.preload id detected: ${duplicate.preloadId}`,
      sourceRanges: duplicate.sourceRanges,
      riskFlags: ['duplicate-preload-id'],
    });
  }
  for (const item of metadata.unresolvedRequires) {
    risks.push({
      id: 'unresolved-preload-require',
      severity: 'strong-warning',
      message: `Preload module ${item.preloadId} requires ids not recovered in this bundle: ${item.requires.join(', ')}`,
      sourceRanges: modules.filter((module) => module.preloadId === item.preloadId).map((module) => module.sourceRange),
      riskFlags: ['unresolved-preload-require'],
    });
  }
  for (const dynamicRequire of metadata.dynamicRequires) {
    risks.push({
      id: 'dynamic-require',
      severity: 'strong-warning',
      message: `Dynamic require expression requires manual review: ${dynamicRequire.expression}`,
      sourceRanges: [lineOnlyRange(dynamicRequire.line)],
      riskFlags: ['dynamic-require', 'preload-bundle'],
    });
  }
  if (result.profile !== 'preload-bundle') {
    risks.push({
      id: 'preload-profile-mismatch',
      severity: 'strong-warning',
      message: `Preload recovery expected preload-bundle profile but detected ${result.profile}.`,
      sourceRanges: modules.map((module) => module.sourceRange),
      riskFlags: ['profile-mismatch'],
    });
  }
  return risks;
}

function findDuplicateIds(modules: RisuLuaExtractedPreloadModule[]): RisuLuaPreloadRecoveryMetadata['duplicateIds'] {
  const grouped = new Map<string, LuaSourceRange[]>();
  for (const module of modules) {
    grouped.set(module.preloadId, [...(grouped.get(module.preloadId) ?? []), module.sourceRange]);
  }
  return [...grouped.entries()]
    .filter(([, ranges]) => ranges.length > 1)
    .map(([preloadId, sourceRanges]) => ({ preloadId, sourceRanges }));
}

function detectPreloadRoots(modules: RisuLuaExtractedPreloadModule[]): LuaDetectedRoot[] {
  return modules.map((module) => ({
    name: module.preloadId,
    kind: 'preload-module',
    sourceRange: module.sourceRange,
  }));
}

function summarizeProfile(result: SourceProfileResult): SourceProfileSummary {
  return {
    profile: result.profile,
    confidence: result.confidence,
    reasons: result.reasons,
    preloadModuleCount: result.preloadModules.length,
    sectionMarkerCount: result.sectionMarkers.length,
    staticRequireCount: result.staticRequires.length,
    dynamicRequireCount: result.dynamicRequires.length,
  };
}

function summarizeHostApis(source: string): LuaHostApiSummary {
  return {
    reads: collectPresent(source, ['getChatVar', 'getState', 'getChat']),
    writes: collectPresent(source, ['setChatVar', 'setState', 'setChat', 'addChat', 'reloadDisplay', 'alertNormal', 'alertInput', 'LLM', 'request']),
    asyncCalls: collectPresent(source, ['LLM', 'request', 'Promise', 'async']),
    unknownGlobals: [],
  };
}

function buildDynamicPatterns(result: SourceProfileResult, modules: RisuLuaExtractedPreloadModule[]): string[] {
  return [
    ...modules.flatMap((module) => module.dynamicRequires.map((item) => `Dynamic require in ${module.preloadId} on line ${item.line}: \`${item.expression}\`.`)),
    ...result.runtimeLoads.map((item) => `${item.kind} on line ${item.line}: \`${item.expression}\`.`),
    ...result.packagePathMutations.map((item) => `Package loader mutation on line ${item.line}: \`${item.expression}\`.`),
  ];
}

function wholeSourceRange(source: string): LuaSourceRange {
  return { startLine: 1, endLine: Math.max(1, source.split('\n').length), startOffset: 0, endOffset: source.length };
}

function lineOnlyRange(line: number): LuaSourceRange {
  return { startLine: line, endLine: line, startOffset: 0, endOffset: 0 };
}

function collectPresent(source: string, names: string[]): string[] {
  return names.filter((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(source));
}

function inferTargetName(sourcePath: string): string {
  const fileName = normalizeSourcePath(sourcePath).split('/').pop() ?? 'main.risulua';
  return fileName.replace(/\.risulua$/i, '') || 'main';
}

function normalizeSourcePath(sourcePath: string): string {
  return sourcePath.replace(/\\/g, '/');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
