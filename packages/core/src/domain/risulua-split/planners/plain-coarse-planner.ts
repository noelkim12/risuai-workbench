/**
 * Plain-single conservative coarse planner/writer.
 *
 * Splits a plain `.risulua` source into a conservative coarse directory
 * workspace.  Only atoms that are provably scope-safe and high-confidence
 * are extracted to separate files; everything else stays in `lua/main.risulua`
 * as a preserved source block.
 *
 * Key policies:
 * - Source slices come from `source.slice(startOffset, endOffset)` — no AST
 *   reprinting, no formatting, no whitespace cleanup.
 * - Giant dispatchers are never split internally.
 * - Host mutation helpers are never classified as pure `common/helpers`.
 * - `lua/main.risulua` uses dot-only `require("module.id")` only for safely
 *   extracted modules.
 * - `legacy/original.risulua` is always generated outside the `lua/` graph.
 */

import { detectRisuLuaSourceProfile } from '../profiling/source-profile';
import { buildTopLevelInventory, atomToSourceRange } from '../inventory/top-level-inventory';
import { sliceSourceRange } from '../shared/source-slice';
import { classifyAtomForCoarseSplit, isAtomScopeSafe, filePathToModuleId, type AtomClassification } from '../inventory/confidence';
import { writeRisuLuaSplitPlan } from '../output/plan-writer';
import { writeRisuLuaSplitReport } from '../output/report-writer';
import { writeRisuLuaWorkspaceFiles, type RisuLuaWorkspaceFile } from '../output/workspace-writer';
import type {
  LuaDetectedRoot,
  LuaHostApiSummary,
  LuaPlanRisk,
  LuaPlannedFile,
  LuaSourceRange,
  LuaTopLevelAtom,
  RisuLuaSplitPlan,
  SourceProfileResult,
  SourceProfileSummary,
  SplitConfidence,
} from '../shared/types';

// ─── public types ───────────────────────────────────────────────────────────

export interface CreateRisuLuaPlainCoarseInput {
  source: string;
  sourcePath: string;
  targetName?: string;
}

export interface RisuLuaPlainCoarseArtifacts {
  plan: RisuLuaSplitPlan;
  workspaceFiles: RisuLuaWorkspaceFile[];
  profileMap: string[];
  pureCandidates: string[];
  runtimeCoupledHelpers: string[];
  riskyBlocks: string[];
  dynamicPatterns: string[];
  refactorTasks: string[];
  verificationSuggestions: string[];
}

export interface WriteRisuLuaPlainCoarseWorkspaceOptions {
  outputRoot: string;
  cwd?: string;
}

// ─── internal types ─────────────────────────────────────────────────────────

interface AtomPlan {
  atom: LuaTopLevelAtom;
  classification: AtomClassification;
  sourceSlice: string;
  scopeSafe: boolean;
  extractionKind: 'runtime-module' | 'build-time-fragment' | 'preserve-main';
}

// ─── public API ─────────────────────────────────────────────────────────────

export function createRisuLuaPlainCoarseArtifacts(
  input: CreateRisuLuaPlainCoarseInput,
): RisuLuaPlainCoarseArtifacts {
  const source = input.source;
  const sourceProfileResult = detectRisuLuaSourceProfile(source);
  const inventory = buildTopLevelInventory(source, {
    sectionMarkers: sourceProfileResult.sectionMarkers,
  });

  const atomPlans = buildAtomPlans(inventory, source);
  const { safePlans, unsafePlans } = partitionByScopeSafety(atomPlans);
  const runtimeModulePlans = safePlans.filter((plan) => plan.extractionKind === 'runtime-module');
  const localFragmentPlans = safePlans.filter((plan) => plan.extractionKind === 'build-time-fragment');

  const targetName = input.targetName ?? inferTargetName(input.sourcePath);

  // Safe atoms → individual files grouped by target path.
  const safeGroups = groupByTargetPath(runtimeModulePlans);
  const localFragmentGroups = groupByTargetPath(localFragmentPlans);
  const safeWorkspaceFiles = buildSafeWorkspaceFiles(safeGroups);
  const localFragmentWorkspaceFiles = buildSafeWorkspaceFiles(localFragmentGroups);
  const safeRequires = buildSafeRequireList(safeGroups);
  const safePlannedFiles = buildSafePlannedFiles(safeGroups, 'coarse-block');
  const localFragmentPlannedFiles = buildSafePlannedFiles(localFragmentGroups, 'chunk-fragment');

  // Unsafe atoms → preserved block in main.risulua.
  const preservedSource = buildPreservedSource(source, safePlans, atomPlans);
  const preservedRanges = unsafePlans.map((p) => atomToSourceRange(p.atom));
  const preservedConfidence = lowestConfidence(unsafePlans.map((p) => p.classification.confidence));

  const risks = buildRisks(sourceProfileResult, atomPlans, unsafePlans);
  const detectedRoots = detectRoots(inventory);

  const plan: RisuLuaSplitPlan = {
    version: 1,
    mode: 'coarse',
    sourceProfile: sourceProfileResult.profile,
    sourceProfileSummary: summarizeProfile(sourceProfileResult),
    sourcePath: normalizeSourcePath(input.sourcePath),
    targetName,
    entryPath: 'lua/main.risulua',
    distPath: `dist/${targetName}.risulua`,
    packable: sourceProfileResult.profile === 'plain-single',
    buildStrategy: 'concat-build-time-require',
    files: [
      {
        path: 'lua/main.risulua',
        kind: 'coarse-block',
        sourceRanges: preservedRanges.length > 0 ? preservedRanges : [wholeSourceRange(source)],
        confidence: preservedConfidence ?? 'high',
        reason: unsafePlans.length > 0
          ? `Preserved block containing ${unsafePlans.length} scope-unsafe atom(s).`
          : 'Composition root with dot-only requires for safely extracted modules.',
        preserveOrderIndex: -1,
      },
      ...localFragmentPlannedFiles,
      ...safePlannedFiles,
      {
        path: 'legacy/original.risulua',
        kind: 'legacy-original',
        sourceRanges: [wholeSourceRange(source)],
        confidence: 'high',
        reason: 'Original source preserved outside the lua source graph for recovery and audit.',
        preserveOrderIndex: inventory.length,
      },
    ],
    risks,
    detectedRoots,
    hostApiSummary: summarizeHostApis(source, inventory),
  };

  return {
    plan,
    workspaceFiles: [
      { path: 'lua/main.risulua', content: renderPlainCoarseMain(safeRequires, preservedSource) },
      ...localFragmentWorkspaceFiles,
      ...safeWorkspaceFiles,
      { path: 'legacy/original.risulua', content: source },
    ],
    profileMap: atomPlans.map((p) => renderProfileMapItem(p)),
    pureCandidates: atomPlans
      .filter((p) => p.classification.confidence === 'high' && p.scopeSafe)
      .map((p) => `\`${p.atom.displayName}\` (${targetPathForPlan(p)}, ${p.extractionKind})`),
    runtimeCoupledHelpers: atomPlans
      .filter((p) => p.classification.confidence === 'low' || p.classification.confidence === 'very-low')
      .map((p) => `\`${p.atom.displayName}\`: ${p.classification.reason}`),
    riskyBlocks: risks.map((r) => `${r.severity}: ${r.message}`),
    dynamicPatterns: buildDynamicPatterns(sourceProfileResult),
    refactorTasks: buildRefactorTasks(atomPlans),
    verificationSuggestions: buildVerificationSuggestions(safePlans, unsafePlans),
  };
}

export function writeRisuLuaPlainCoarseWorkspace(
  artifacts: RisuLuaPlainCoarseArtifacts,
  options: WriteRisuLuaPlainCoarseWorkspaceOptions,
): void {
  writeRisuLuaWorkspaceFiles(artifacts.workspaceFiles, { outputRoot: options.outputRoot });
  writeRisuLuaSplitPlan(artifacts.plan, { outputRoot: options.outputRoot, cwd: options.cwd });
  writeRisuLuaSplitReport(artifacts, { outputRoot: options.outputRoot });
}

/**
 * Render `lua/main.risulua` — the composition root.
 *
 * - Header comments describe the workspace metadata.
 * - Dot-only `require("module.id")` lines appear for each safely extracted
 *   module, in `preserveOrderIndex` order.
 * - Preserved source (scope-unsafe atoms) follows verbatim.
 */
export function renderPlainCoarseMain(
  safeRequires: string[],
  preservedSource: string,
): string {
  const lines: string[] = [
    '-- @generated by risuai-workbench',
    '-- risulua-split=coarse',
    '-- source-profile=plain-single',
    '-- dist-build-strategy=concat-build-time-require',
  ];

  if (safeRequires.length > 0) {
    lines.push('');
    for (const requireId of safeRequires) {
      lines.push(`require("${requireId}")`);
    }
  }

  if (preservedSource.length > 0) {
    lines.push('');
    lines.push(preservedSource);
  }

  return `${lines.join('\n')}\n`;
}

// ─── atom plan building ─────────────────────────────────────────────────────

function buildAtomPlans(inventory: LuaTopLevelAtom[], source: string): AtomPlan[] {
  const preliminaryPlans = inventory.map((atom) => {
    const sourceSlice = sliceSourceRange(source, atomToSourceRange(atom));
    const classification = classifyAtomForCoarseSplit(atom, sourceSlice);
    const scopeSafe = isAtomScopeSafe(atom, classification);
    return { atom, classification, sourceSlice, scopeSafe, extractionKind: 'preserve-main' as const };
  });
  const localFragmentNames = collectLocalFragmentNames(preliminaryPlans);
  const nonFragmentLocalNames = collectNonFragmentLocalNames(preliminaryPlans, localFragmentNames);
  return preliminaryPlans.map((plan) => ({
    ...plan,
    scopeSafe: plan.scopeSafe || isLocalFunctionFragmentSafe(plan, nonFragmentLocalNames),
    extractionKind: selectExtractionKind(plan, nonFragmentLocalNames),
  }));
}

function collectLocalFragmentNames(plans: AtomPlan[]): string[] {
  return sorted(plans
    .filter((plan) => isHighConfidenceLocalFunction(plan))
    .flatMap((plan) => plan.atom.declaresLocals));
}

function collectNonFragmentLocalNames(plans: AtomPlan[], localFragmentNames: string[]): string[] {
  const fragmentNameSet = new Set(localFragmentNames);
  return sorted(plans
    .flatMap((plan) => plan.atom.declaresLocals)
    .filter((name) => !fragmentNameSet.has(name)));
}

function selectExtractionKind(
  plan: AtomPlan,
  nonFragmentLocalNames: string[],
): AtomPlan['extractionKind'] {
  if (isLocalFunctionFragmentSafe(plan, nonFragmentLocalNames)) return 'build-time-fragment';
  if (plan.scopeSafe) return 'runtime-module';
  return 'preserve-main';
}

function isLocalFunctionFragmentSafe(plan: AtomPlan, nonFragmentLocalNames: string[]): boolean {
  return isHighConfidenceLocalFunction(plan)
    && !sourceReferencesAnyName(plan.sourceSlice, nonFragmentLocalNames);
}

function isHighConfidenceLocalFunction(plan: AtomPlan): boolean {
  return plan.atom.kind === 'local-function-declaration'
    && plan.classification.confidence === 'high'
    && plan.atom.hostApis.length === 0;
}

function partitionByScopeSafety(plans: AtomPlan[]): { safePlans: AtomPlan[]; unsafePlans: AtomPlan[] } {
  const safePlans: AtomPlan[] = [];
  const unsafePlans: AtomPlan[] = [];

  // If ANY atom declares locals that could be shared, keep local declarations in
  // main and only extract high-confidence no-local atoms whose exact source
  // slice does not reference those declared local names.
  const hasSharedLocals = plans.some((p) => p.atom.declaresLocals.length > 0);

  for (const plan of plans) {
    if (plan.scopeSafe && (plan.extractionKind === 'build-time-fragment' || !hasSharedLocals || plan.atom.declaresLocals.length === 0)) {
      safePlans.push(plan);
    } else {
      unsafePlans.push(plan);
    }
  }

  // If shared locals exist, demote only the already-safe atoms whose exact
  // source slice references one of those local names. This keeps extraction
  // conservative around upvalues while allowing unrelated globally visible pure
  // helpers/constants that merely call standard globals (string/table/etc.).
  if (hasSharedLocals) {
    const sharedLocalNames = collectDeclaredLocalNames(plans);
    const localFragmentNames = collectLocalFragmentNames(safePlans);
    const trulySafe = safePlans.filter((p) => {
      if (p.extractionKind === 'build-time-fragment') {
        const externalSharedLocalNames = sharedLocalNames.filter((name) => !localFragmentNames.includes(name));
        return !sourceReferencesAnyName(p.sourceSlice, externalSharedLocalNames);
      }
      return !sourceReferencesAnyName(p.sourceSlice, sharedLocalNames);
    });
    const demoted = safePlans.filter((p) => !trulySafe.includes(p));
    return { safePlans: trulySafe, unsafePlans: [...unsafePlans, ...demoted] };
  }

  return { safePlans, unsafePlans };
}

function collectDeclaredLocalNames(plans: AtomPlan[]): string[] {
  return sorted(plans.flatMap((p) => p.atom.declaresLocals));
}

function sourceReferencesAnyName(sourceSlice: string, names: string[]): boolean {
  return names.some((name) => sourceReferencesName(sourceSlice, name));
}

function sourceReferencesName(sourceSlice: string, name: string): boolean {
  const identifierBoundary = '[^A-Za-z0-9_]';
  return new RegExp(`(^|${identifierBoundary})${escapeRegExp(name)}(?=$|${identifierBoundary})`).test(sourceSlice);
}

// ─── safe module grouping ───────────────────────────────────────────────────

function groupByTargetPath(plans: AtomPlan[]): Map<string, AtomPlan[]> {
  const groups = new Map<string, AtomPlan[]>();
  for (const plan of plans) {
    const key = targetPathForPlan(plan);
    const existing = groups.get(key) ?? [];
    existing.push(plan);
    groups.set(key, existing);
  }
  return groups;
}

function targetPathForPlan(plan: AtomPlan): string {
  if (plan.extractionKind === 'build-time-fragment') return 'common/local_helpers.risulua';
  return plan.classification.targetPath;
}

function buildSafeWorkspaceFiles(groups: Map<string, AtomPlan[]>): RisuLuaWorkspaceFile[] {
  const files: RisuLuaWorkspaceFile[] = [];
  for (const [targetPath, plans] of groups) {
    const content = plans
      .sort((a, b) => a.atom.preserveOrderIndex - b.atom.preserveOrderIndex)
      .map((p) => p.sourceSlice)
      .join('\n');
    files.push({ path: `lua/${targetPath}`, content: `${content}\n` });
  }
  return files;
}

function buildSafeRequireList(groups: Map<string, AtomPlan[]>): string[] {
  // Emit one require per generated file path, ordered by the first atom in each group.
  return sortedGroupsByFirstAtom(groups)
    .map(([targetPath]) => filePathToModuleId(`lua/${targetPath}`));
}

function buildSafePlannedFiles(groups: Map<string, AtomPlan[]>, kind: LuaPlannedFile['kind']): LuaPlannedFile[] {
  const files: LuaPlannedFile[] = [];
  let orderIndex = 0;
  for (const [targetPath, plans] of sortedGroupsByFirstAtom(groups)) {
    const sortedPlans = sortedPlansBySourceOrder(plans);
    files.push({
      path: `lua/${targetPath}`,
      kind,
      sourceRanges: sortedPlans.map((plan) => atomToSourceRange(plan.atom)),
      confidence: lowestConfidence(sortedPlans.map((plan) => plan.classification.confidence)) ?? 'high',
      reason: buildGroupedFileReason(sortedPlans),
      preserveOrderIndex: orderIndex++,
    });
  }
  return files;
}

function sortedGroupsByFirstAtom(groups: Map<string, AtomPlan[]>): Array<[string, AtomPlan[]]> {
  return [...groups.entries()].sort(([, leftPlans], [, rightPlans]) => (
    firstPreserveOrderIndex(leftPlans) - firstPreserveOrderIndex(rightPlans)
  ));
}

function sortedPlansBySourceOrder(plans: AtomPlan[]): AtomPlan[] {
  return [...plans].sort((a, b) => a.atom.preserveOrderIndex - b.atom.preserveOrderIndex);
}

function firstPreserveOrderIndex(plans: AtomPlan[]): number {
  return Math.min(...plans.map((plan) => plan.atom.preserveOrderIndex));
}

function buildGroupedFileReason(plans: AtomPlan[]): string {
  const uniqueReasons = sorted(plans.map((plan) => plan.classification.reason));
  if (plans.length === 1) return uniqueReasons[0] ?? 'Safely extracted atom.';
  return `Grouped ${plans.length} safely extracted atom(s): ${uniqueReasons.join(' / ')}`;
}

// ─── preserved source ───────────────────────────────────────────────────────

function buildPreservedSource(source: string, safePlans: AtomPlan[], allPlans: AtomPlan[]): string {
  if (safePlans.length === 0) return source;

  // Remove safe atom ranges from the source, keeping everything else.  The
  // removal range is deliberately wider than the extracted source slice only in
  // `main.risulua`: leading line-comments/blank lines that directly describe a
  // safe atom, plus trailing blank-only gaps, are removed so main does not keep
  // orphan comments or empty decorative sections. Extracted module content still
  // uses the exact atom source slice.
  const safeRanges = safePlans
    .map((p) => buildMainRemovalRange(source, p.atom, allPlans))
    .sort((a, b) => a.startOffset - b.startOffset);
  const mergedRanges = mergeRemovalRanges(safeRanges);

  let result = '';
  let cursor = 0;
  for (const range of mergedRanges) {
    result += source.slice(cursor, range.startOffset);
    cursor = range.endOffset;
  }
  result += source.slice(cursor);
  return result;
}

function buildMainRemovalRange(
  source: string,
  atom: LuaTopLevelAtom,
  allPlans: AtomPlan[],
): { startOffset: number; endOffset: number } {
  const previousAtomEnd = nearestPreviousAtomEnd(atom, allPlans);
  const nextAtomStart = nearestNextAtomStart(atom, allPlans);
  return {
    startOffset: findAssociatedLeadingCommentStart(source, atom.startOffset, previousAtomEnd),
    endOffset: findTrailingBlankEnd(source, atom.endOffset, nextAtomStart),
  };
}

function nearestPreviousAtomEnd(atom: LuaTopLevelAtom, allPlans: AtomPlan[]): number {
  const previousEnds = allPlans
    .map((p) => p.atom)
    .filter((candidate) => candidate.endOffset <= atom.startOffset && candidate.id !== atom.id)
    .map((candidate) => candidate.endOffset);
  return previousEnds.length === 0 ? 0 : Math.max(...previousEnds);
}

function nearestNextAtomStart(atom: LuaTopLevelAtom, allPlans: AtomPlan[]): number {
  const nextStarts = allPlans
    .map((p) => p.atom)
    .filter((candidate) => candidate.startOffset >= atom.endOffset && candidate.id !== atom.id)
    .map((candidate) => candidate.startOffset);
  return nextStarts.length === 0 ? sourceEndSentinel : Math.min(...nextStarts);
}

const sourceEndSentinel = Number.MAX_SAFE_INTEGER;

function findAssociatedLeadingCommentStart(source: string, atomStartOffset: number, lowerBound: number): number {
  let cursor = lineStartAtOrBefore(source, atomStartOffset);
  while (cursor > lowerBound) {
    const previousStart = previousLineStart(source, cursor);
    if (previousStart < lowerBound) break;
    const line = source.slice(previousStart, cursor).replace(/\r?\n$/, '');
    if (!isBlankLine(line) && !isLineComment(line)) break;
    cursor = previousStart;
  }
  return cursor;
}

function findTrailingBlankEnd(source: string, atomEndOffset: number, upperBound: number): number {
  let cursor = atomEndOffset;
  while (cursor < source.length && cursor < upperBound) {
    const nextEnd = nextLineEnd(source, cursor);
    const line = source.slice(cursor, nextEnd).replace(/\r?\n$/, '');
    if (!isBlankLine(line)) break;
    cursor = nextEnd;
  }
  return cursor;
}

function lineStartAtOrBefore(source: string, offset: number): number {
  const previousNewline = source.lastIndexOf('\n', Math.max(0, offset - 1));
  return previousNewline === -1 ? 0 : previousNewline + 1;
}

function previousLineStart(source: string, lineStart: number): number {
  const previousNewline = source.lastIndexOf('\n', Math.max(0, lineStart - 2));
  return previousNewline === -1 ? 0 : previousNewline + 1;
}

function nextLineEnd(source: string, offset: number): number {
  const nextNewline = source.indexOf('\n', offset);
  return nextNewline === -1 ? source.length : nextNewline + 1;
}

function isBlankLine(line: string): boolean {
  return /^\s*$/.test(line);
}

function isLineComment(line: string): boolean {
  return /^\s*--/.test(line);
}

function mergeRemovalRanges(ranges: Array<{ startOffset: number; endOffset: number }>): Array<{ startOffset: number; endOffset: number }> {
  const merged: Array<{ startOffset: number; endOffset: number }> = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.startOffset <= previous.endOffset) {
      previous.endOffset = Math.max(previous.endOffset, range.endOffset);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

// ─── risks ──────────────────────────────────────────────────────────────────

function buildRisks(
  result: SourceProfileResult,
  atomPlans: AtomPlan[],
  unsafePlans: AtomPlan[],
): LuaPlanRisk[] {
  const risks: LuaPlanRisk[] = [];

  // Scope-unsafe risk for preserved atoms.
  if (unsafePlans.length > 0) {
    risks.push({
      id: 'plain-coarse-scope-unsafe-preserved',
      severity: 'warning',
      message: `${unsafePlans.length} atom(s) preserved in lua/main.risulua due to scope dependencies: ${unsafePlans.map((p) => p.atom.displayName).join(', ')}.`,
      sourceRanges: unsafePlans.map((p) => atomToSourceRange(p.atom)),
      riskFlags: ['scope-unsafe', 'plain-coarse'],
    });
  }

  // Very-low confidence risks.
  for (const plan of atomPlans) {
    if (plan.classification.confidence === 'very-low') {
      risks.push({
        id: `plain-coarse-very-low-${plan.atom.id}`,
        severity: 'warning',
        message: `\`${plan.atom.displayName}\` is very-low confidence: ${plan.classification.reason}`,
        sourceRanges: [atomToSourceRange(plan.atom)],
        riskFlags: ['very-low-confidence', 'plain-coarse'],
      });
    }
  }

  // Profile mismatch.
  if (result.profile !== 'plain-single') {
    risks.push({
      id: 'plain-coarse-profile-mismatch',
      severity: 'strong-warning',
      message: `Plain coarse planner expected plain-single profile but detected ${result.profile}.`,
      sourceRanges: [],
      riskFlags: ['profile-mismatch'],
    });
  }

  // Dynamic require risks.
  for (const dr of result.dynamicRequires) {
    risks.push({
      id: 'dynamic-require',
      severity: 'strong-warning',
      message: `Dynamic require expression requires manual review: ${dr.expression}`,
      sourceRanges: [lineOnlyRange(dr.line)],
      riskFlags: ['dynamic-require'],
    });
  }

  return risks;
}

// ─── roots ──────────────────────────────────────────────────────────────────

function detectRoots(inventory: LuaTopLevelAtom[]): LuaDetectedRoot[] {
  return inventory
    .filter((atom) => rootKindForAtom(atom) !== null)
    .map((atom) => ({
      name: atom.displayName,
      kind: rootKindForAtom(atom)!,
      sourceRange: atomToSourceRange(atom),
    }));
}

function rootKindForAtom(atom: LuaTopLevelAtom): LuaDetectedRoot['kind'] | null {
  if (atom.kind === 'function-declaration' || atom.kind === 'local-function-declaration') return 'function';
  if (atom.kind === 'listener-call') return 'listener';
  if (atom.kind === 'handler-assignment') return 'handler-assignment';
  return null;
}

// ─── host API summary ───────────────────────────────────────────────────────

const HOST_READ_APIS = new Set(['getChatVar', 'getState', 'getChat']);
const HOST_WRITE_APIS = new Set([
  'setChatVar', 'setState', 'setChat', 'addChat',
  'reloadDisplay', 'alertNormal', 'alertInput', 'LLM', 'request',
]);
const HOST_ASYNC_APIS = new Set(['LLM', 'request', 'Promise', 'async']);
const ALL_HOST_APIS = new Set([
  ...HOST_READ_APIS, ...HOST_WRITE_APIS, ...HOST_ASYNC_APIS,
  'json', 'listenEdit', 'onStart', 'onInput', 'onOutput', 'onButtonClick',
]);

function summarizeHostApis(source: string, inventory: LuaTopLevelAtom[]): LuaHostApiSummary {
  const detected = new Set<string>();
  for (const atom of inventory) {
    for (const api of atom.hostApis) detected.add(api);
  }
  for (const api of ALL_HOST_APIS) {
    if (new RegExp(`\\b${escapeRegExp(api)}\\b`).test(source)) detected.add(api);
  }
  return {
    reads: sorted([...detected].filter((api) => HOST_READ_APIS.has(api))),
    writes: sorted([...detected].filter((api) => HOST_WRITE_APIS.has(api))),
    asyncCalls: sorted([...detected].filter((api) => HOST_ASYNC_APIS.has(api))),
    unknownGlobals: sorted(
      inventory.flatMap((atom) => atom.readsGlobals).filter((name) => !ALL_HOST_APIS.has(name)),
    ),
  };
}

// ─── report context builders ────────────────────────────────────────────────

function renderProfileMapItem(plan: AtomPlan): string {
  const scopeNote = plan.scopeSafe ? 'scope-safe' : 'scope-unsafe';
  const extractionNote = plan.extractionKind === 'build-time-fragment'
    ? ' build-time local fragment; not runtime-required from main.'
    : '';
  const localPreservationNote = plan.atom.declaresLocals.length > 0
    && plan.extractionKind !== 'build-time-fragment'
    ? ' Preserved in main because local declarations must remain available in main scope.'
    : '';
  return `\`${plan.atom.displayName}\` → \`${targetPathForPlan(plan)}\` (${plan.classification.confidence}, ${scopeNote}): ${plan.classification.reason}${extractionNote}${localPreservationNote}`;
}

function buildDynamicPatterns(result: SourceProfileResult): string[] {
  return [
    ...result.dynamicRequires.map((item) => `Dynamic require on line ${item.line}: \`${item.expression}\`.`),
    ...result.runtimeLoads.map((item) => `${item.kind} on line ${item.line}: \`${item.expression}\`.`),
    ...result.packagePathMutations.map((item) => `Package loader mutation on line ${item.line}: \`${item.expression}\`.`),
  ];
}

function buildRefactorTasks(atomPlans: AtomPlan[]): string[] {
  const tasks: string[] = [];
  const veryLow = atomPlans.filter((p) => p.classification.confidence === 'very-low');
  if (veryLow.length > 0) {
    tasks.push(`Review very-low confidence atoms before any future extraction: ${veryLow.map((p) => p.atom.displayName).join(', ')}.`);
  }
  tasks.push('Keep RisuAI host globals unshadowed in any future generated modules.');
  tasks.push('Verify execution order is preserved when manually refactoring preserved blocks.');
  return tasks;
}

function buildVerificationSuggestions(safePlans: AtomPlan[], unsafePlans: AtomPlan[]): string[] {
  const suggestions: string[] = [
    'Verify `legacy/original.risulua` matches the original source byte-for-byte.',
    'Confirm any `require(...)` calls in `lua/main.risulua` use dot-only module ids without slashes or file extensions.',
  ];
  if (safePlans.length > 0) {
    suggestions.push(`Verify ${safePlans.length} safely extracted module file(s) contain exact original source slices.`);
  }
  if (unsafePlans.length > 0) {
    suggestions.push(`Review ${unsafePlans.length} scope-unsafe atom(s) preserved in the main entry file.`);
  }
  return suggestions;
}

// ─── utility ────────────────────────────────────────────────────────────────

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

function wholeSourceRange(source: string): LuaSourceRange {
  return {
    startLine: 1,
    endLine: Math.max(1, source.split('\n').length),
    startOffset: 0,
    endOffset: source.length,
  };
}

function lineOnlyRange(line: number): LuaSourceRange {
  return { startLine: line, endLine: line, startOffset: 0, endOffset: 0 };
}

function lowestConfidence(confidences: SplitConfidence[]): SplitConfidence | null {
  const order: SplitConfidence[] = ['high', 'medium', 'low', 'very-low'];
  let lowest: SplitConfidence | null = null;
  for (const c of confidences) {
    if (lowest === null || order.indexOf(c) > order.indexOf(lowest)) {
      lowest = c;
    }
  }
  return lowest;
}

function inferTargetName(sourcePath: string): string {
  const fileName = normalizeSourcePath(sourcePath).split('/').pop() ?? 'main.risulua';
  return fileName.replace(/\.risulua$/i, '') || 'main';
}

function normalizeSourcePath(sourcePath: string): string {
  return sourcePath.replace(/\\/g, '/');
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
