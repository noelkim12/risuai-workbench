import luaparse from 'luaparse';

import { evaluateLuaRuntimeRiskPolicy } from '../profiling/lua-runtime-risk-policy';
import { detectRisuLuaSourceProfile } from '../profiling/source-profile';
import { atomToSourceRange, buildTopLevelInventory } from '../inventory/top-level-inventory';
import type {
  DistBuildStrategy,
  LuaDetectedRoot,
  LuaHostApiSummary,
  LuaPlanRisk,
  LuaSourceRange,
  LuaTopLevelAtom,
  RisuLuaSplitPlan,
  SourceProfileResult,
  SourceProfileSummary,
} from '../shared/types';

export interface CreateRisuLuaReportOnlyPlanInput {
  source: string;
  sourcePath: string;
  targetName?: string;
}

export interface RisuLuaReportOnlyPlan extends RisuLuaSplitPlan {
  sourceProfileResult: SourceProfileResult;
}

export interface RisuLuaReportOnlyArtifacts {
  plan: RisuLuaReportOnlyPlan;
  profileMap: string[];
  pureCandidates: string[];
  runtimeCoupledHelpers: string[];
  riskyBlocks: string[];
  dynamicPatterns: string[];
  refactorTasks: string[];
  verificationSuggestions: string[];
}

const REPORT_ONLY_ENTRY_PATH = 'lua/main.risulua' as const;
const REPORT_ONLY_HOST_READ_APIS = new Set(['getChatVar', 'getState', 'getChat']);
const REPORT_ONLY_HOST_WRITE_APIS = new Set([
  'setChatVar',
  'setState',
  'setChat',
  'addChat',
  'reloadDisplay',
  'alertNormal',
  'alertInput',
  'LLM',
  'request',
]);
const REPORT_ONLY_HOST_ASYNC_APIS = new Set(['LLM', 'request', 'Promise', 'async']);
const REPORT_ONLY_HOST_APIS = new Set([
  ...REPORT_ONLY_HOST_READ_APIS,
  ...REPORT_ONLY_HOST_WRITE_APIS,
  ...REPORT_ONLY_HOST_ASYNC_APIS,
  'json',
  'listenEdit',
  'onStart',
  'onInput',
  'onOutput',
  'onButtonClick',
]);

export function createRisuLuaReportOnlyArtifacts(
  input: CreateRisuLuaReportOnlyPlanInput,
): RisuLuaReportOnlyArtifacts {
  const sourceProfileResult = detectRisuLuaSourceProfile(input.source);
  const inventory = buildTopLevelInventory(input.source, { sectionMarkers: sourceProfileResult.sectionMarkers });
  const parseDiagnostic = buildParseFailureRisk(input.source);
  const risks = [
    ...runtimePolicyRisks(sourceProfileResult),
    ...dynamicRequireRisks(sourceProfileResult),
    ...parseDiagnostic,
  ];
  const plan: RisuLuaReportOnlyPlan = {
    version: 1,
    mode: 'report',
    sourceProfile: sourceProfileResult.profile,
    sourceProfileSummary: summarizeProfile(sourceProfileResult),
    sourceProfileResult,
    sourcePath: normalizeSourcePath(input.sourcePath),
    targetName: input.targetName ?? inferTargetName(input.sourcePath),
    entryPath: REPORT_ONLY_ENTRY_PATH,
    distPath: null,
    packable: false,
    buildStrategy: selectReportOnlyStrategy(sourceProfileResult.profile),
    files: [],
    risks,
    detectedRoots: detectInboundRoots(inventory),
    hostApiSummary: summarizeHostApis(input.source, inventory),
  };

  return {
    plan,
    profileMap: buildProfileMap(sourceProfileResult),
    pureCandidates: buildPureCandidates(inventory),
    runtimeCoupledHelpers: buildRuntimeCoupledHelpers(inventory),
    riskyBlocks: buildRiskyBlocks(inventory, risks),
    dynamicPatterns: buildDynamicPatterns(sourceProfileResult),
    refactorTasks: buildRefactorTasks(sourceProfileResult),
    verificationSuggestions: buildVerificationSuggestions(sourceProfileResult),
  };
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

function selectReportOnlyStrategy(profile: SourceProfileResult['profile']): DistBuildStrategy {
  if (profile === 'plain-single') return 'concat-build-time-require';
  if (profile === 'section-bundle') return 'section-order-concat';
  if (profile === 'preload-bundle') return 'preload-recovery-no-dist';
  return 'report-only';
}

function runtimePolicyRisks(result: SourceProfileResult): LuaPlanRisk[] {
  return evaluateLuaRuntimeRiskPolicy(result).map((finding) => ({
    id: finding.id,
    severity: finding.severity,
    message: finding.message,
    sourceRanges: [lineOnlyRange(finding.line)],
    riskFlags: [finding.level, finding.id],
  }));
}

function dynamicRequireRisks(result: SourceProfileResult): LuaPlanRisk[] {
  return result.dynamicRequires.map((dynamicRequire) => ({
    id: 'dynamic-require',
    severity: 'strong-warning',
    message: `Dynamic require expression requires manual review: ${dynamicRequire.expression}`,
    sourceRanges: [lineOnlyRange(dynamicRequire.line)],
    riskFlags: ['dynamic-require'],
  }));
}

function buildParseFailureRisk(source: string): LuaPlanRisk[] {
  try {
    luaparse.parse(source, { comments: false, locations: true, ranges: true, scope: true, luaVersion: '5.3' });
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{
      id: 'lua-ast-analysis-failed',
      severity: 'strong-warning',
      message: `AST analysis failed; report-only artifacts preserve detector output. ${message}`,
      sourceRanges: [],
      riskFlags: ['ast-analysis-failed'],
    }];
  }
}

function detectInboundRoots(inventory: LuaTopLevelAtom[]): LuaDetectedRoot[] {
  return inventory
    .filter((atom) => rootKindForAtom(atom) !== null)
    .map((atom) => ({
      name: atom.displayName,
      kind: rootKindForAtom(atom) ?? 'unknown',
      sourceRange: atomToSourceRange(atom),
    }));
}

function rootKindForAtom(atom: LuaTopLevelAtom): LuaDetectedRoot['kind'] | null {
  if (atom.kind === 'function-declaration' || atom.kind === 'local-function-declaration') return 'function';
  if (atom.kind === 'listener-call') return 'listener';
  if (atom.kind === 'handler-assignment') return 'handler-assignment';
  if (atom.kind === 'package-preload') return 'preload-module';
  if (atom.kind === 'bundle-section') return 'bundle-section';
  return null;
}

function summarizeHostApis(source: string, inventory: LuaTopLevelAtom[]): LuaHostApiSummary {
  const detected = new Set<string>();
  for (const atom of inventory) {
    for (const api of atom.hostApis) detected.add(api);
  }
  for (const api of REPORT_ONLY_HOST_APIS) {
    if (new RegExp(`\\b${escapeRegExp(api)}\\b`).test(source)) detected.add(api);
  }

  return {
    reads: sorted([...detected].filter((api) => REPORT_ONLY_HOST_READ_APIS.has(api))),
    writes: sorted([...detected].filter((api) => REPORT_ONLY_HOST_WRITE_APIS.has(api))),
    asyncCalls: sorted([...detected].filter((api) => REPORT_ONLY_HOST_ASYNC_APIS.has(api))),
    unknownGlobals: sorted(inventory.flatMap((atom) => atom.readsGlobals).filter((name) => !REPORT_ONLY_HOST_APIS.has(name))),
  };
}

function buildProfileMap(result: SourceProfileResult): string[] {
  if (result.profile === 'section-bundle') {
    return result.sectionMarkers.map((marker, index) => `Section ${index + 1}: \`${marker.label}\` starts at line ${marker.line}; report mode records it without creating \`lua/sections\`.`);
  }
  if (result.profile === 'preload-bundle') {
    return result.preloadModules.map((module) => `Preload module \`${module.id}\` starts at line ${module.startLine}; report mode records it without creating \`lua/preload\` or \`dist\`.`);
  }
  if (result.profile === 'mixed-bundle') {
    return ['Mixed bundle boundaries are preserved as detector evidence only; later coarse planners must split certain and uncertain boundaries separately.'];
  }
  if (result.profile === 'plain-single') {
    return ['Plain single-file source would use conservative source-slice planning in coarse mode; report mode writes docs only.'];
  }
  return ['Unknown source profile remains report-only until a later planner proves a safe recovery path.'];
}

function buildPureCandidates(inventory: LuaTopLevelAtom[]): string[] {
  return inventory
    .filter((atom) => (atom.kind === 'function-declaration' || atom.kind === 'local-function-declaration') && atom.hostApis.length === 0 && atom.calls.length === 0)
    .map((atom) => `\`${atom.displayName}\` (lines ${atom.startLine}-${atom.endLine})`);
}

function buildRuntimeCoupledHelpers(inventory: LuaTopLevelAtom[]): string[] {
  return inventory
    .filter((atom) => atom.hostApis.length > 0 || atom.kind === 'listener-call' || atom.kind === 'handler-assignment')
    .map((atom) => `\`${atom.displayName}\` (${atom.kind}) uses ${atom.hostApis.length > 0 ? atom.hostApis.join(', ') : 'runtime hook semantics'}.`);
}

function buildRiskyBlocks(inventory: LuaTopLevelAtom[], risks: LuaPlanRisk[]): string[] {
  const riskyAtoms = inventory
    .filter((atom) => atom.kind === 'top-level-effect' || atom.kind === 'unknown')
    .map((atom) => `\`${atom.displayName}\` (${atom.kind}, lines ${atom.startLine}-${atom.endLine}) is preserved for manual review.`);
  return [...riskyAtoms, ...risks.map((risk) => `${risk.severity}: ${risk.message}`)];
}

function buildDynamicPatterns(result: SourceProfileResult): string[] {
  return [
    ...result.dynamicRequires.map((item) => `Dynamic require on line ${item.line}: \`${item.expression}\`.`),
    ...result.runtimeLoads.map((item) => `${item.kind} on line ${item.line}: \`${item.expression}\`.`),
    ...result.packagePathMutations.map((item) => `Package loader mutation on line ${item.line}: \`${item.expression}\`.`),
  ];
}

function buildRefactorTasks(result: SourceProfileResult): string[] {
  if (result.profile === 'preload-bundle') {
    return ['Review each recovered preload module boundary before enabling any require-free dist conversion.', 'Verify every static require id is registered in the detected preload id set.'];
  }
  if (result.profile === 'section-bundle') {
    return ['Treat detected sections as ordered chunk fragments, not modules.', 'Avoid moving local declarations across section boundaries without moving all dependent code.'];
  }
  if (result.profile === 'mixed-bundle') {
    return ['Separate package.preload and [BUNDLE] boundaries manually before requesting coarse split output.'];
  }
  return ['Review runtime-coupled helpers before extracting pure source slices.', 'Keep RisuAI host globals unshadowed in any future generated modules.'];
}

function buildVerificationSuggestions(result: SourceProfileResult): string[] {
  return [
    'Confirm report mode created only `docs/risulua-split-report.md` and `docs/risulua-split-plan.json`.',
    'Compare detector evidence in the JSON plan against source fixtures before approving coarse recovery.',
    result.profile === 'preload-bundle'
      ? 'Verify no `dist/<target>.risulua` is generated for preload-bundle v1.'
      : 'Verify later dist output remains require-free when a packable strategy is selected.',
  ];
}

function inferTargetName(sourcePath: string): string {
  const normalized = normalizeSourcePath(sourcePath);
  const fileName = normalized.split('/').pop() ?? 'main.risulua';
  return fileName.replace(/\.risulua$/i, '') || 'main';
}

function normalizeSourcePath(sourcePath: string): string {
  return sourcePath.replace(/\\/g, '/');
}

function lineOnlyRange(line: number): LuaSourceRange {
  return { startLine: line, endLine: line, startOffset: 0, endOffset: 0 };
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
