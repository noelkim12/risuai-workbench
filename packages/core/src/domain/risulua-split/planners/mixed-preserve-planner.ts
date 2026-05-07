import luaparse from 'luaparse';

import { evaluateLuaRuntimeRiskPolicy } from '../profiling/lua-runtime-risk-policy';
import { writeRisuLuaSplitPlan } from '../output/plan-writer';
import { extractRisuLuaPreloadModules, type RisuLuaExtractedPreloadModule } from '../extractors/preload-extractor';
import { writeRisuLuaSplitReport } from '../output/report-writer';
import { buildLineStarts, lineAtOffset } from '../shared/range-utils';
import { extractRisuLuaSections, type RisuLuaExtractedSection } from '../extractors/section-extractor';
import { detectRisuLuaSourceProfile } from '../profiling/source-profile';
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

export interface CreateRisuLuaMixedPreserveInput {
  source: string;
  sourcePath: string;
  targetName?: string;
}

export interface RisuLuaMixedPreservePlan extends RisuLuaSplitPlan {
  sourceProfileResult: SourceProfileResult;
  preloadRecovery?: RisuLuaPreloadRecoveryMetadata;
}

export interface RisuLuaMixedPreserveArtifacts {
  plan: RisuLuaMixedPreservePlan;
  workspaceFiles: RisuLuaWorkspaceFile[];
  profileMap: string[];
  pureCandidates: string[];
  runtimeCoupledHelpers: string[];
  riskyBlocks: string[];
  dynamicPatterns: string[];
  refactorTasks: string[];
  verificationSuggestions: string[];
  sections: RisuLuaExtractedSection[];
  modules: RisuLuaExtractedPreloadModule[];
}

export interface WriteRisuLuaMixedPreserveWorkspaceOptions {
  outputRoot: string;
  cwd?: string;
}

const MIXED_ENTRY_PATH = 'lua/main.risulua' as const;

export function createRisuLuaMixedPreserveArtifacts(
  input: CreateRisuLuaMixedPreserveInput,
): RisuLuaMixedPreserveArtifacts {
  const detectedProfile = detectRisuLuaSourceProfile(input.source);
  const parseFailure = detectParseFailure(input.source);
  const sourceProfileResult = parseFailure === null ? detectedProfile : forceUnknownProfile(detectedProfile);
  const targetName = input.targetName ?? inferTargetName(input.sourcePath);
  const sections = sourceProfileResult.profile === 'mixed-bundle' ? extractRisuLuaSections(input.source).sections : [];
  const modules = sourceProfileResult.profile === 'mixed-bundle' ? extractRisuLuaPreloadModules(input.source).modules : [];
  const preloadRecovery = modules.length > 0 ? buildPreloadMetadata(modules) : undefined;
  const risks = buildRisks(sourceProfileResult, sections, modules, parseFailure, preloadRecovery);

  const plan: RisuLuaMixedPreservePlan = {
    version: 1,
    mode: 'coarse',
    sourceProfile: sourceProfileResult.profile,
    sourceProfileSummary: summarizeProfile(sourceProfileResult),
    sourceProfileResult,
    sourcePath: normalizeSourcePath(input.sourcePath),
    targetName,
    entryPath: MIXED_ENTRY_PATH,
    distPath: null,
    packable: false,
    buildStrategy: 'report-only',
    files: [
      mainPlannedFile(input.source, sourceProfileResult.profile),
      ...sections.map(sectionToPlannedFile),
      ...modules.map(moduleToPlannedFile),
      legacyPlannedFile(input.source, sections.length + modules.length),
    ],
    risks,
    detectedRoots: [...detectSectionRoots(sections), ...detectPreloadRoots(modules)],
    hostApiSummary: summarizeHostApis(input.source),
    ...(preloadRecovery ? { preloadRecovery } : {}),
  };

  return {
    plan,
    workspaceFiles: [
      { path: MIXED_ENTRY_PATH, content: renderMixedPreserveMain(input.source, sourceProfileResult.profile, sections, modules, parseFailure) },
      ...sections.map((section) => ({ path: section.path, content: section.content })),
      ...modules.map((module) => ({ path: module.path, content: renderPreloadModule(module) })),
      { path: 'legacy/original.risulua', content: input.source },
    ],
    profileMap: buildProfileMap(sourceProfileResult, sections, modules),
    pureCandidates: [],
    runtimeCoupledHelpers: ['Mixed and unknown preserve-first workspaces intentionally avoid semantic regrouping and build-time require synthesis.'],
    riskyBlocks: risks.map((risk) => `${risk.severity}: ${risk.message}`),
    dynamicPatterns: buildDynamicPatterns(sourceProfileResult, modules),
    refactorTasks: buildRefactorTasks(sourceProfileResult),
    verificationSuggestions: buildVerificationSuggestions(sourceProfileResult),
    sections,
    modules,
  };
}

export function writeRisuLuaMixedPreserveWorkspace(
  artifacts: RisuLuaMixedPreserveArtifacts,
  options: WriteRisuLuaMixedPreserveWorkspaceOptions,
): void {
  writeRisuLuaWorkspaceFiles(artifacts.workspaceFiles, { outputRoot: options.outputRoot });
  writeRisuLuaSplitPlan(artifacts.plan, { outputRoot: options.outputRoot, cwd: options.cwd });
  writeRisuLuaSplitReport(artifacts, { outputRoot: options.outputRoot });
}

export function renderMixedPreserveMain(
  source: string,
  profile: SourceProfileResult['profile'],
  sections: RisuLuaExtractedSection[],
  modules: RisuLuaExtractedPreloadModule[],
  parseFailure: string | null = null,
): string {
  const lines = [
    '-- @generated by risuai-workbench',
    '-- risulua-split=coarse',
    `-- source-profile=${profile}`,
    '-- dist-build-strategy=report-only',
    '-- packable=false',
    '-- high-risk gate: no dist output is generated for mixed/unknown preserve-first recovery.',
  ];
  if (parseFailure !== null) lines.push(`-- parse-failure=${parseFailure}`);
  for (const section of sections) lines.push(`-- recovered-section: ${section.sectionLabel} -> ${section.path}`);
  for (const module of modules) lines.push(`-- recovered-preload: ${module.preloadId} -> ${module.path}`);
  lines.push('', '-- Preserved source follows verbatim for audit and manual recovery.', source);
  return `${lines.join('\n')}\n`;
}

function mainPlannedFile(source: string, profile: SourceProfileResult['profile']): LuaPlannedFile {
  return {
    path: MIXED_ENTRY_PATH,
    kind: 'coarse-block',
    sourceRanges: [wholeSourceRange(source)],
    confidence: profile === 'unknown' ? 'very-low' : 'low',
    reason: 'Preserve-first fallback keeps uncertain mixed/unknown source verbatim and writes no dist output.',
    preserveOrderIndex: -1,
  };
}

function sectionToPlannedFile(section: RisuLuaExtractedSection): LuaPlannedFile {
  return {
    path: section.path,
    kind: 'chunk-fragment',
    sourceRanges: [section.sourceRange],
    sectionLabel: section.sectionLabel,
    confidence: 'high',
    reason: 'Certain [BUNDLE] marker boundary recovered as an exact source slice for review only; no dist is generated.',
    preserveOrderIndex: section.preserveOrderIndex,
  };
}

function moduleToPlannedFile(module: RisuLuaExtractedPreloadModule): LuaPlannedFile {
  return {
    path: module.path,
    kind: 'preload-module',
    sourceRanges: [module.sourceRange, module.bodyRange],
    preloadId: module.preloadId,
    confidence: 'high',
    reason: 'Certain package.preload wrapper body recovered for review only; runtime require semantics remain preserved in main/original.',
    preserveOrderIndex: module.preserveOrderIndex,
  };
}

function legacyPlannedFile(source: string, preserveOrderIndex: number): LuaPlannedFile {
  return {
    path: 'legacy/original.risulua',
    kind: 'legacy-original',
    sourceRanges: [wholeSourceRange(source)],
    confidence: 'high',
    reason: 'Original source preserved exactly outside the lua source graph for recovery and audit.',
    preserveOrderIndex,
  };
}

function buildRisks(
  result: SourceProfileResult,
  sections: RisuLuaExtractedSection[],
  modules: RisuLuaExtractedPreloadModule[],
  parseFailure: string | null,
  preloadRecovery: RisuLuaPreloadRecoveryMetadata | undefined,
): LuaPlanRisk[] {
  const risks: LuaPlanRisk[] = [
    {
      id: result.profile === 'unknown' ? 'unknown-fail-closed-preserved' : 'mixed-preserve-first-no-dist',
      severity: 'error',
      message: result.profile === 'unknown'
        ? 'Unknown or malformed RisuLua source failed closed: preserve-only workspace, packable=false, distPath=null.'
        : 'Mixed bundle is high-risk: certain boundaries are recovered for review, uncertain source is preserved, and dist generation is disabled.',
      sourceRanges: [...sections.map((section) => section.sourceRange), ...modules.map((module) => module.sourceRange)],
      riskFlags: ['packable-false', 'dist-disabled', result.profile],
    },
    ...evaluateLuaRuntimeRiskPolicy(result).map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      message: finding.message,
      sourceRanges: [lineOnlyRange(finding.line)],
      riskFlags: [finding.level, finding.id],
    })),
    ...result.dynamicRequires.map((dynamicRequire) => ({
      id: 'dynamic-require',
      severity: 'strong-warning' as const,
      message: `Dynamic require expression requires manual review before any packable dist: ${dynamicRequire.expression}`,
      sourceRanges: [lineOnlyRange(dynamicRequire.line)],
      riskFlags: ['dynamic-require', 'dist-disabled'],
    })),
  ];

  if (parseFailure !== null) {
    risks.push({
      id: 'lua-ast-analysis-failed',
      severity: 'strong-warning',
      message: `AST analysis failed; unknown preserve-first fallback keeps source unsplit. ${parseFailure}`,
      sourceRanges: [],
      riskFlags: ['ast-analysis-failed', 'unknown', 'semantic-split-disabled'],
    });
  }

  if (sections.length > 0 && modules.length > 0) {
    risks.push({
      id: 'mixed-boundary-overlap-review',
      severity: 'strong-warning',
      message: 'Mixed package.preload and [BUNDLE] boundaries may overlap; recovered files are review aids and lua/main.risulua remains the preserved source of truth.',
      sourceRanges: [...sections.map((section) => section.sourceRange), ...modules.map((module) => module.sourceRange)],
      riskFlags: ['mixed-bundle', 'boundary-overlap-review'],
    });
  }

  if (preloadRecovery) {
    for (const dynamicRequire of preloadRecovery.dynamicRequires) {
      risks.push({
        id: 'dynamic-require',
        severity: 'strong-warning',
        message: `Dynamic require in recovered preload body requires manual review: ${dynamicRequire.expression}`,
        sourceRanges: [lineOnlyRange(dynamicRequire.line)],
        riskFlags: ['dynamic-require', 'preload-body', 'dist-disabled'],
      });
    }
  }

  return risks;
}

function buildPreloadMetadata(modules: RisuLuaExtractedPreloadModule[]): RisuLuaPreloadRecoveryMetadata {
  const preloadIds = new Set(modules.map((module) => module.preloadId));
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
    duplicateIds: findDuplicateIds(modules),
    dynamicRequires: modules.flatMap((module) => module.dynamicRequires),
    unresolvedRequires: modules
      .map((module) => ({ preloadId: module.preloadId, requires: module.requires.filter((id) => !preloadIds.has(id)) }))
      .filter((item) => item.requires.length > 0),
  };
}

function findDuplicateIds(modules: RisuLuaExtractedPreloadModule[]): RisuLuaPreloadRecoveryMetadata['duplicateIds'] {
  const grouped = new Map<string, LuaSourceRange[]>();
  for (const module of modules) grouped.set(module.preloadId, [...(grouped.get(module.preloadId) ?? []), module.sourceRange]);
  return [...grouped.entries()]
    .filter(([, ranges]) => ranges.length > 1)
    .map(([preloadId, sourceRanges]) => ({ preloadId, sourceRanges }));
}

function renderPreloadModule(module: RisuLuaExtractedPreloadModule): string {
  return [
    '-- @generated by risuai-workbench',
    '-- source-profile=mixed-bundle',
    '-- module-kind=preload-module',
    `-- preload-id=${module.preloadId}`,
    `-- original-range=L${module.sourceRange.startLine}-L${module.sourceRange.endLine}`,
    '-- review-only=true',
    '',
    module.body,
  ].join('\n');
}

function buildProfileMap(
  result: SourceProfileResult,
  sections: RisuLuaExtractedSection[],
  modules: RisuLuaExtractedPreloadModule[],
): string[] {
  if (result.profile === 'unknown') return ['Unknown/malformed source is preserved verbatim in `lua/main.risulua` and `legacy/original.risulua`; no semantic split is attempted.'];
  return [
    ...sections.map((section) => `Certain section boundary \`${section.sectionLabel}\` → \`${section.path}\` (review-only).`),
    ...modules.map((module) => `Certain preload boundary \`${module.preloadId}\` → \`${module.path}\` (review-only).`),
    'Uncertain mixed source remains preserved verbatim in `lua/main.risulua` and `legacy/original.risulua`.',
  ];
}

function buildDynamicPatterns(result: SourceProfileResult, modules: RisuLuaExtractedPreloadModule[]): string[] {
  return [
    ...result.dynamicRequires.map((item) => `Dynamic require on line ${item.line}: \`${item.expression}\`.`),
    ...modules.flatMap((module) => module.dynamicRequires.map((item) => `Dynamic require in ${module.preloadId} on line ${item.line}: \`${item.expression}\`.`)),
    ...result.runtimeLoads.map((item) => `${item.kind} on line ${item.line}: \`${item.expression}\`.`),
    ...result.packagePathMutations.map((item) => `Package loader mutation on line ${item.line}: \`${item.expression}\`.`),
  ];
}

function buildRefactorTasks(result: SourceProfileResult): string[] {
  if (result.profile === 'unknown') {
    return ['Fix Lua parse/profile ambiguity first, then rerun risulua-split before attempting semantic extraction.'];
  }
  return [
    'Review package.preload and [BUNDLE] boundary overlap before deciding which structure is authoritative.',
    'Keep `legacy/original.risulua` as the source of truth until validators prove a packable strategy safe.',
  ];
}

function buildVerificationSuggestions(result: SourceProfileResult): string[] {
  return [
    'Verify `dist/` is absent and plan has `packable=false`, `distPath=null`, and `buildStrategy=report-only`.',
    'Compare `legacy/original.risulua` byte-for-byte with the input source.',
    result.profile === 'unknown'
      ? 'Confirm no semantic split files such as `lua/sections/` or `lua/preload/` were generated for unknown fallback.'
      : 'Treat recovered boundary files as review aids only; do not pack from them in v1.',
  ];
}

function forceUnknownProfile(result: SourceProfileResult): SourceProfileResult {
  return {
    ...result,
    profile: 'unknown',
    confidence: 'very-low',
    reasons: [...result.reasons, 'AST parse failed; forced unknown preserve-first fallback.'],
  };
}

function detectParseFailure(source: string): string | null {
  try {
    luaparse.parse(source, { comments: false, locations: true, ranges: true, scope: true, luaVersion: '5.3' });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function detectSectionRoots(sections: RisuLuaExtractedSection[]): LuaDetectedRoot[] {
  return sections.map((section) => ({ name: section.sectionLabel, kind: 'bundle-section', sourceRange: section.sourceRange }));
}

function detectPreloadRoots(modules: RisuLuaExtractedPreloadModule[]): LuaDetectedRoot[] {
  return modules.map((module) => ({ name: module.preloadId, kind: 'preload-module', sourceRange: module.sourceRange }));
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

function wholeSourceRange(source: string): LuaSourceRange {
  const lineStarts = buildLineStarts(source);
  const endOffset = Math.max(0, source.length - 1);
  return { startLine: 1, endLine: lineAtOffset(endOffset, lineStarts), startOffset: 0, endOffset: source.length };
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
