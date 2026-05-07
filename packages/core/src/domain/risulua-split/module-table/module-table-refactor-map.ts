import {
  isAllowedRisuLuaModuleTableMvpTarget,
  isForbiddenRisuLuaModuleTableMvpTarget,
  validateRisuLuaModuleTableRefactorMap,
  type RisuLuaModuleTableClassificationCode,
  type RisuLuaModuleTableModuleContract,
  type RisuLuaModuleTableRefactorMapContract,
  type RisuLuaModuleTableSymbolContract,
} from './module-table-contracts';
import type { RisuLuaModuleTableClassificationResult } from './module-table-classifier';
import type { RisuLuaModuleTableParseResult, RisuLuaModuleTableParserRange } from './module-table-parser';
import type { LuaSourceRange } from '../shared/types';
import { rangesAreNonOverlapping } from '../shared/source-slice';
import { createOffsetRangeIndex } from '../shared/offset-range-index';

// ─── Dry-run edit intent ─────────────────────────────────────────

export type DryRunEditIntent =
  | 'extract-symbol'
  | 'bridge-global'
  | 'preserve-in-main'
  | 'preserve-procedural-root'
  | 'preserve-handler-root'
  | 'insert-bridge-assignment'
  | 'insert-require-binding';

// ─── Dry-run edit ────────────────────────────────────────────────

export interface DryRunEdit {
  id: string;
  intent: DryRunEditIntent;
  symbolId: string;
  symbolName: string;
  sourceRange: LuaSourceRange;
  targetModule: string;
  classification: RisuLuaModuleTableClassificationCode;
  requireId?: string;
  alias?: string;
  exportName?: string;
  bridgeAssignment?: string;
}

// ─── Dry-run edit plan ───────────────────────────────────────────

export interface DryRunEditPlan {
  edits: DryRunEdit[];
  moduleContracts: RisuLuaModuleTableModuleContract[];
  mainPreservedRanges: LuaSourceRange[];
  mainBridgeInsertions: Array<{
    symbolName: string;
    moduleAlias: string;
    exportName: string;
    text: string;
  }>;
  mainRequireBindings: Array<{
    requireId: string;
    alias: string;
    targetModule: string;
    text: string;
  }>;
}

// ─── Dry-run validation finding ──────────────────────────────────

export type DryRunValidationCode =
  | 'overlapping-edits'
  | 'edit-inside-non-executable'
  | 'forbidden-target-path'
  | 'disallowed-mvp-target'
  | 'missing-refactor-map-entry'
  | 'missing-source-range'
  | 'invalid-classification'
  | 'missing-bridge-for-global';

export interface DryRunValidationFinding {
  code: DryRunValidationCode;
  message: string;
  editId?: string;
  symbolId?: string;
  targetPath?: string;
}

export interface DryRunValidationResult {
  ok: boolean;
  findings: DryRunValidationFinding[];
}

// ─── Dry-run plan result ─────────────────────────────────────────

export interface DryRunPlanResult {
  ok: boolean;
  refactorMap: RisuLuaModuleTableRefactorMapContract;
  editPlan: DryRunEditPlan;
  validation: DryRunValidationResult;
  diagnostics: string[];
}

// ─── Input ───────────────────────────────────────────────────────

export interface DryRunPlanInput {
  source: string;
  sourceFile: string;
  parseResult: RisuLuaModuleTableParseResult;
  classificationResult: RisuLuaModuleTableClassificationResult;
}

// ─── Public API ──────────────────────────────────────────────────

export function planDryRunRefactorMap(input: DryRunPlanInput): DryRunPlanResult {
  const diagnostics = [...input.classificationResult.diagnostics];
  const refactorMap = input.classificationResult.refactorMap;
  const editPlan = buildEditPlan(refactorMap, diagnostics);
  const validation = validateDryRunEditPlan(editPlan, refactorMap, input.parseResult);
  const ok = validation.ok && input.classificationResult.ok;

  if (!ok) {
    diagnostics.push('Dry-run validation found issues; rewrite planning blocked.');
  }

  return {
    ok,
    refactorMap,
    editPlan,
    validation,
    diagnostics,
  };
}

export function validateDryRunEditPlan(
  editPlan: DryRunEditPlan,
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  parseResult: RisuLuaModuleTableParseResult,
): DryRunValidationResult {
  const findings: DryRunValidationFinding[] = [];

  validateEditOverlap(editPlan, findings);
  validateEditAgainstNonExecutableRanges(editPlan, parseResult, findings);
  validateEditTargetPaths(editPlan, findings);
  validateEditRefactorMapParity(editPlan, refactorMap, findings);
  validateRefactorMapInvariants(refactorMap, findings);

  return {
    ok: findings.length === 0,
    findings,
  };
}

export function validateWriterParity(
  proposedArtifactPath: string,
  refactorMap: RisuLuaModuleTableRefactorMapContract,
): DryRunValidationFinding | null {
  if (isForbiddenRisuLuaModuleTableMvpTarget(proposedArtifactPath)) {
    return {
      code: 'forbidden-target-path',
      message: `Writer cannot create forbidden MVP target: ${proposedArtifactPath}`,
      targetPath: proposedArtifactPath,
    };
  }

  const isKnownModule = refactorMap.modules.some(
    (moduleContract) => moduleContract.path === proposedArtifactPath,
  );
  const isKnownDocs = proposedArtifactPath === 'docs/refactor-map.json'
    || proposedArtifactPath === 'docs/domain-candidates.json';
  const isPreservedInMain = proposedArtifactPath === 'lua/main.risulua';
  const isLegacyOriginal = proposedArtifactPath === 'legacy/original.risulua';

  if (!isKnownModule && !isKnownDocs && !isPreservedInMain && !isLegacyOriginal) {
    return {
      code: 'missing-refactor-map-entry',
      message: `Writer artifact "${proposedArtifactPath}" is absent from dry-run refactor map and cannot be written.`,
      targetPath: proposedArtifactPath,
    };
  }

  return null;
}

// ─── Edit plan construction ──────────────────────────────────────

function buildEditPlan(
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  diagnostics: string[],
): DryRunEditPlan {
  const edits: DryRunEdit[] = [];
  const mainPreservedRanges: LuaSourceRange[] = [];
  const moduleAliasMap = new Map<string, RisuLuaModuleTableModuleContract>();
  const processedModules = new Map<string, RisuLuaModuleTableModuleContract>();

  for (const moduleContract of refactorMap.modules) {
    moduleAliasMap.set(moduleContract.path, moduleContract);
  }

  for (const symbol of refactorMap.symbols) {
    const edit = symbolToEdit(symbol, moduleAliasMap);
    if (edit !== undefined) edits.push(edit);
  }

  for (const preserved of refactorMap.preserved) {
    mainPreservedRanges.push(preserved.sourceRange);
    edits.push({
      id: `edit:preserve:${preserved.id}`,
      intent: preserveIntentForReason(preserved.reason),
      symbolId: preserved.id,
      symbolName: preserved.originalName,
      sourceRange: preserved.sourceRange,
      targetModule: 'lua/main.risulua',
      classification: preserved.reason,
    });
  }

  const mainBridgeInsertions = buildBridgeInsertions(refactorMap);
  const mainRequireBindings = buildRequireBindings(refactorMap, processedModules);

  if (!rangesAreNonOverlapping(mainPreservedRanges)) {
    diagnostics.push('Preserved source ranges contain overlaps; some edits may conflict.');
  }

  return {
    edits,
    moduleContracts: refactorMap.modules,
    mainPreservedRanges,
    mainBridgeInsertions,
    mainRequireBindings,
  };
}

function symbolToEdit(
  symbol: RisuLuaModuleTableSymbolContract,
  moduleAliasMap: Map<string, RisuLuaModuleTableModuleContract>,
): DryRunEdit | undefined {
  const isMoved = symbol.classification.startsWith('extract:')
    || symbol.classification === 'bridge:host-visible-global';

  if (isMoved && symbol.targetModule !== undefined) {
    const moduleContract = moduleAliasMap.get(symbol.targetModule);
    return {
      id: `edit:move:${symbol.id}`,
      intent: symbol.classification === 'bridge:host-visible-global' ? 'bridge-global' : 'extract-symbol',
      symbolId: symbol.id,
      symbolName: symbol.originalName,
      sourceRange: symbol.sourceRange,
      targetModule: symbol.targetModule,
      classification: symbol.classification,
      requireId: moduleContract?.requireId,
      alias: moduleContract?.alias,
      exportName: symbol.exportName,
      bridgeAssignment: symbol.bridge?.mainAssignment.text,
    };
  }

  if (symbol.classification.startsWith('preserve:') || symbol.classification === 'report:domain-candidate') {
    return {
      id: `edit:preserve:${symbol.id}`,
      intent: symbol.declarationKind === 'procedural-block'
        ? 'preserve-procedural-root'
        : symbol.parent !== undefined ? 'preserve-handler-root' : 'preserve-in-main',
      symbolId: symbol.id,
      symbolName: symbol.originalName,
      sourceRange: symbol.sourceRange,
      targetModule: 'lua/main.risulua',
      classification: symbol.classification,
    };
  }

  return undefined;
}

function preserveIntentForReason(reason: RisuLuaModuleTableClassificationCode): DryRunEditIntent {
  if (reason === 'preserve:top-level-side-effect') return 'preserve-procedural-root';
  return 'preserve-in-main';
}

function buildBridgeInsertions(refactorMap: RisuLuaModuleTableRefactorMapContract): DryRunEditPlan['mainBridgeInsertions'] {
  return refactorMap.symbols
    .filter((symbol) => symbol.bridge !== undefined)
    .map((symbol) => ({
      symbolName: symbol.bridge!.originalPublicName,
      moduleAlias: symbol.bridge!.moduleAlias,
      exportName: symbol.bridge!.exportName,
      text: symbol.bridge!.mainAssignment.text,
    }));
}

function buildRequireBindings(
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  processedModules: Map<string, RisuLuaModuleTableModuleContract>,
): DryRunEditPlan['mainRequireBindings'] {
  const uniqueModules = dedupeModules(refactorMap.modules);
  return uniqueModules
    .filter((moduleContract) => {
      if (processedModules.has(moduleContract.path)) return false;
      processedModules.set(moduleContract.path, moduleContract);
      return true;
    })
    .map((moduleContract) => ({
      requireId: moduleContract.requireId,
      alias: moduleContract.alias,
      targetModule: moduleContract.path,
      text: `local ${moduleContract.alias} = require("${moduleContract.requireId}")`,
    }));
}

// ─── Validation helpers ──────────────────────────────────────────

function validateEditOverlap(editPlan: DryRunEditPlan, findings: DryRunValidationFinding[]): void {
  const editableRanges = editPlan.edits
    .filter((edit) => edit.intent === 'extract-symbol' || edit.intent === 'bridge-global')
    .map((edit) => edit.sourceRange);

  const sorted = [...editableRanges].sort(
    (left, right) => left.startOffset - right.startOffset,
  );

  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startOffset < sorted[index - 1].endOffset) {
      findings.push({
        code: 'overlapping-edits',
        message: `Edit ranges overlap at offsets ${sorted[index - 1].startOffset}-${sorted[index - 1].endOffset} and ${sorted[index].startOffset}-${sorted[index].endOffset}.`,
      });
      return;
    }
  }
}

function validateEditAgainstNonExecutableRanges(
  editPlan: DryRunEditPlan,
  parseResult: RisuLuaModuleTableParseResult,
  findings: DryRunValidationFinding[],
): void {
  if (!parseResult.ok) return;

  const nonExecIndex = createOffsetRangeIndex(
    parseResult.nonExecutableRanges.map((r) => r.sourceRange),
  );
  const nonExecRangesByStart = [...parseResult.nonExecutableRanges].sort(
    (a, b) => a.sourceRange.startOffset - b.sourceRange.startOffset,
  );
  const movedEdits = editPlan.edits.filter(
    (edit) => edit.intent === 'extract-symbol' || edit.intent === 'bridge-global',
  );

  for (const edit of movedEdits) {
    if (nonExecIndex.containsRange(edit.sourceRange)) {
      const enclosing = findEnclosingNonExec(nonExecRangesByStart, edit.sourceRange);
      findings.push({
        code: 'edit-inside-non-executable',
        message: `Edit for symbol "${edit.symbolName}" (${edit.symbolId}) falls inside non-executable range (${enclosing?.nodeType ?? 'unknown'}, lines ${enclosing?.sourceRange.startLine ?? '?'}-${enclosing?.sourceRange.endLine ?? '?'}).`,
        editId: edit.id,
        symbolId: edit.symbolId,
      });
    }
  }
}

function findEnclosingNonExec(
  sortedRanges: RisuLuaModuleTableParserRange[],
  inner: LuaSourceRange,
): RisuLuaModuleTableParserRange | undefined {
  for (const r of sortedRanges) {
    if (r.sourceRange.startOffset > inner.startOffset) break;
    if (r.sourceRange.startOffset <= inner.startOffset && r.sourceRange.endOffset >= inner.endOffset) {
      return r;
    }
  }
  return undefined;
}

function validateEditTargetPaths(editPlan: DryRunEditPlan, findings: DryRunValidationFinding[]): void {
  for (const edit of editPlan.edits) {
    if (edit.intent === 'extract-symbol' || edit.intent === 'bridge-global') {
      if (isForbiddenRisuLuaModuleTableMvpTarget(edit.targetModule)) {
        findings.push({
          code: 'forbidden-target-path',
          message: `Edit for "${edit.symbolName}" targets forbidden path: ${edit.targetModule}`,
          editId: edit.id,
          symbolId: edit.symbolId,
          targetPath: edit.targetModule,
        });
      } else if (edit.targetModule !== 'lua/main.risulua' && !isAllowedRisuLuaModuleTableMvpTarget(edit.targetModule)) {
        findings.push({
          code: 'disallowed-mvp-target',
          message: `Edit for "${edit.symbolName}" targets disallowed MVP path: ${edit.targetModule}`,
          editId: edit.id,
          symbolId: edit.symbolId,
          targetPath: edit.targetModule,
        });
      }
    }
  }
}

function validateEditRefactorMapParity(
  editPlan: DryRunEditPlan,
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  findings: DryRunValidationFinding[],
): void {
  const mapSymbolIds = new Set(refactorMap.symbols.map((symbol) => symbol.id));
  const mapPreservedIds = new Set(refactorMap.preserved.map((entry) => entry.id));
  const mapModulePaths = new Set(refactorMap.modules.map((moduleContract) => moduleContract.path));

  for (const edit of editPlan.edits) {
    if (edit.intent === 'extract-symbol' || edit.intent === 'bridge-global') {
      if (!mapSymbolIds.has(edit.symbolId) && !mapPreservedIds.has(edit.symbolId)) {
        findings.push({
          code: 'missing-refactor-map-entry',
          message: `Edit "${edit.id}" references symbol "${edit.symbolId}" absent from refactor map.`,
          editId: edit.id,
          symbolId: edit.symbolId,
        });
      }

      if (edit.targetModule !== 'lua/main.risulua' && !mapModulePaths.has(edit.targetModule)) {
        findings.push({
          code: 'missing-refactor-map-entry',
          message: `Edit "${edit.id}" targets module "${edit.targetModule}" absent from refactor map.`,
          editId: edit.id,
          targetPath: edit.targetModule,
        });
      }
    }
  }
}

function validateRefactorMapInvariants(
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  findings: DryRunValidationFinding[],
): void {
  const mapValidation = validateRisuLuaModuleTableRefactorMap(refactorMap);
  for (const invariant of mapValidation) {
    switch (invariant.code) {
      case 'missing-bridge-metadata':
        findings.push({
          code: 'missing-bridge-for-global',
          message: invariant.message,
          symbolId: invariant.symbolId,
        });
        break;
      case 'forbidden-mvp-target':
        findings.push({
          code: 'forbidden-target-path',
          message: invariant.message,
          targetPath: invariant.path,
        });
        break;
      case 'missing-source-range':
        findings.push({
          code: 'missing-source-range',
          message: invariant.message,
          symbolId: invariant.symbolId,
        });
        break;
      case 'invalid-classification-code':
        findings.push({
          code: 'invalid-classification',
          message: invariant.message,
          symbolId: invariant.symbolId,
        });
        break;
      default:
        break;
    }
  }
}

// ─── Utility ─────────────────────────────────────────────────────

function dedupeModules(modules: RisuLuaModuleTableModuleContract[]): RisuLuaModuleTableModuleContract[] {
  const seen = new Set<string>();
  return modules.filter((moduleContract) => {
    if (seen.has(moduleContract.path)) return false;
    seen.add(moduleContract.path);
    return true;
  });
}
