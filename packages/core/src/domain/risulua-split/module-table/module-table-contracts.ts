import type { LuaSourceRange } from '../shared/types';

export const RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH = 'lua/common/local_helpers.risulua';
export const RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH = 'lua/host_globals/global_functions.risulua';
export const RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH = 'lua/host_globals/duplicate_globals.risulua';
export const RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH = 'lua/host_globals/async_actions.risulua';
export const RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH = 'lua/button_actions/actions.risulua';
export const RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH = 'lua/state/variable_store.risulua';
export const RISULUA_MODULE_TABLE_PROMPT_STORE_PATH = 'lua/prompts/instruction_store.risulua';
export const RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH = 'lua/runtime/output.risulua';
export const RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH = 'lua/runtime/input.risulua';
export const RISULUA_MODULE_TABLE_RUNTIME_START_PATH = 'lua/runtime/start.risulua';
export const RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH = 'lua/runtime/button_click.risulua';
export const RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH = 'lua/runtime/listen_edit.risulua';
export const RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH = 'docs/refactor-map.json';
export const RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH = 'docs/domain-candidates.json';
export const RISULUA_MODULE_TABLE_EXPORT_MANIFEST_PATH = 'docs/risulua-export-manifest.json';
export const RISULUA_MODULE_TABLE_BUTTON_ACTION_INDEX_PATH = 'docs/risulua-button-action-index.json';

export const RISULUA_MODULE_TABLE_MVP_ARTIFACT_PATHS = [
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH,
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
  RISULUA_MODULE_TABLE_PROMPT_STORE_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_START_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH,
  RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH,
  RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
  RISULUA_MODULE_TABLE_EXPORT_MANIFEST_PATH,
  RISULUA_MODULE_TABLE_BUTTON_ACTION_INDEX_PATH,
] as const;

export const RISULUA_MODULE_TABLE_CLASSIFIER_PRECEDENCE = [
  'parser-range-exclusion',
  'runtime-live-listener-roots',
  'host-visible-public-contracts',
  'unsafe-public-global-preservation',
  'safe-bridge-extraction',
  'button-trigger-actions',
  'private-locals',
  'nested-handler-helpers',
  'procedural-report-only',
  'semantic-domain-report-only',
] as const;

export const RISULUA_MODULE_TABLE_CLASSIFICATION_CODES = [
  'extract:pure-helper',
  'extract:domain-function',
  'extract:button-action',
  'extract:host-global-function',
  'extract:host-read-helper',
  'extract:parameterized-read-helper',
  'extract:runtime-handler-body',
  'bridge:host-visible-global',
  'report:domain-candidate',
  'preserve:captures-mutable-state',
  'preserve:captured-table-mutation',
  'preserve:host-write-order',
  'preserve:host-visible-global-unsafe-bridge',
  'preserve:dynamic-global-reference-risk',
  'preserve:top-level-side-effect',
  'preserve:commented-or-string-only',
  'preserve:async-boundary-risk',
  'preserve:ambiguous',
] as const;

export const RISULUA_MODULE_TABLE_HOST_EFFECT_CLASSES = [
  'reads',
  'writes',
  'uiInteraction',
  'asyncModelNetwork',
  'dynamicEnvironment',
] as const;

export type RisuLuaModuleTableClassifierPrecedence = typeof RISULUA_MODULE_TABLE_CLASSIFIER_PRECEDENCE[number];
export type RisuLuaModuleTableClassificationCode = typeof RISULUA_MODULE_TABLE_CLASSIFICATION_CODES[number];
export type RisuLuaModuleTableDomainGenerationOption = 'report' | 'validated';
export type RisuLuaModuleTableHostEffectClass = typeof RISULUA_MODULE_TABLE_HOST_EFFECT_CLASSES[number];

export interface RisuLuaModuleTableHostEffects {
  reads: string[];
  writes: string[];
  uiInteraction: string[];
  asyncModelNetwork: string[];
  dynamicEnvironment: string[];
}

export interface RisuLuaModuleTableMainAssignment {
  shape: 'direct_assignment';
  text: string;
}

export interface RisuLuaModuleTableBridgeMetadata {
  required: true;
  kind: 'direct_assignment';
  originalPublicName: string;
  moduleAlias: string;
  exportName: string;
  mainAssignment: RisuLuaModuleTableMainAssignment;
}

export type RisuLuaModuleTableModuleCategory = 'common-helper' | 'domain-function' | 'button-action' | 'handler-helper' | 'host-global' | 'runtime-handler' | 'state-store' | 'prompt-store';
export type RisuLuaModuleTableDomainGenerationStatus = 'report-only' | 'generated' | 'blocked';

export interface RisuLuaModuleTableModuleContract {
  path: string;
  requireId: string;
  alias: string;
  category: RisuLuaModuleTableModuleCategory;
  exports: string[];
}

export type RisuLuaModuleTableDeclarationKind =
  | 'top-level-local-function'
  | 'top-level-global-function'
  | 'top-level-global-assignment'
  | 'nested-local-function'
  | 'procedural-block'
  | 'domain-candidate';

export interface RisuLuaModuleTableParentContract {
  kind: 'handler' | 'listener' | 'module' | 'top-level';
  name: string;
  startLine: number;
}

export interface RisuLuaModuleTableSymbolContract {
  id: string;
  originalName: string;
  declarationKind: RisuLuaModuleTableDeclarationKind;
  sourceRange: LuaSourceRange;
  parent?: RisuLuaModuleTableParentContract;
  classification: RisuLuaModuleTableClassificationCode;
  targetModule?: string;
  exportName?: string;
  globalBridge: boolean;
  bridge?: RisuLuaModuleTableBridgeMetadata;
  captures: string[];
  mutates: string[];
  hostEffects: RisuLuaModuleTableHostEffects;
  rewriteRefs: string[];
}

export interface RisuLuaModuleTablePreservedContract {
  id: string;
  originalName: string;
  sourceRange: LuaSourceRange;
  reason: RisuLuaModuleTableClassificationCode;
  evidence: string[];
}

export interface RisuLuaModuleTableDomainCandidateContract {
  name: string;
  sourceSymbols: string[];
  sourceRanges: LuaSourceRange[];
  confidence: number;
  evidence: string[];
  recommendedPath: string;
  generationStatus: RisuLuaModuleTableDomainGenerationStatus;
  generatedPath?: string;
  generationBlockedReasons: string[];
  hostEffects: RisuLuaModuleTableHostEffects;
  notGeneratedReason: string;
  autoGenerated: boolean;
}

export interface RisuLuaModuleTableRefactorMapContract {
  version: 1;
  mode: 'module-table';
  domainGeneration?: RisuLuaModuleTableDomainGenerationOption;
  sourceFile: string;
  generatedAt?: string;
  modules: RisuLuaModuleTableModuleContract[];
  symbols: RisuLuaModuleTableSymbolContract[];
  preserved: RisuLuaModuleTablePreservedContract[];
  domainCandidates: RisuLuaModuleTableDomainCandidateContract[];
}

export interface RisuLuaModuleTableExportManifestOccurrence {
  order: number;
  line: number;
  id: string;
  name: string;
  classification: RisuLuaModuleTableClassificationCode;
  targetModule?: string;
  preservedReason?: RisuLuaModuleTableClassificationCode;
}

export interface RisuLuaModuleTableExportManifestDuplicateGroup {
  name: string;
  occurrences: RisuLuaModuleTableExportManifestOccurrence[];
  finalWinner: RisuLuaModuleTableExportManifestOccurrence;
}

export interface RisuLuaModuleTableExportManifestListenerRegistration {
  name: string;
  kind: string;
  line: number;
  preservedReason?: RisuLuaModuleTableClassificationCode;
}

export interface RisuLuaModuleTableExportManifestContract {
  version: 1;
  mode: 'module-table-export-manifest';
  sourceFile: string;
  generatedAt?: string;
  hostVisibleGlobals: RisuLuaModuleTableExportManifestOccurrence[];
  duplicateGroups: RisuLuaModuleTableExportManifestDuplicateGroup[];
  listenerRegistrations: RisuLuaModuleTableExportManifestListenerRegistration[];
  preserved: RisuLuaModuleTablePreservedContract[];
}

export interface RisuLuaModuleTableButtonActionUsageContract {
  source: 'risu-trigger-attribute' | 'cbs-button';
  rawText: string;
  sourceFile: string;
  sourceRange: LuaSourceRange;
}

export interface RisuLuaModuleTableButtonActionSourceContract {
  sourceFile: string;
  source: string;
}

export interface RisuLuaModuleTableButtonActionIndexEntryContract {
  name: string;
  targetModule?: string;
  declaration?: {
    id: string;
    sourceFile: string;
    sourceRange: LuaSourceRange;
    classification: RisuLuaModuleTableClassificationCode;
  };
  usages: RisuLuaModuleTableButtonActionUsageContract[];
}

export interface RisuLuaModuleTableButtonActionIndexContract {
  version: 1;
  mode: 'module-table-button-action-index';
  sourceFile: string;
  generatedAt?: string;
  actions: RisuLuaModuleTableButtonActionIndexEntryContract[];
}

export type RisuLuaModuleTableInvariantCode =
  | 'invalid-mode'
  | 'invalid-version'
  | 'invalid-classification-code'
  | 'missing-source-range'
  | 'missing-target-module'
  | 'missing-bridge-metadata'
  | 'forbidden-mvp-target'
  | 'invalid-domain-candidate';

export interface RisuLuaModuleTableInvariantFinding {
  code: RisuLuaModuleTableInvariantCode;
  message: string;
  path?: string;
  symbolId?: string;
  candidateName?: string;
}

export function createEmptyRisuLuaModuleTableHostEffects(): RisuLuaModuleTableHostEffects {
  return {
    reads: [],
    writes: [],
    uiInteraction: [],
    asyncModelNetwork: [],
    dynamicEnvironment: [],
  };
}

export function isRisuLuaModuleTableClassificationCode(value: string): value is RisuLuaModuleTableClassificationCode {
  return isOneOf(value, RISULUA_MODULE_TABLE_CLASSIFICATION_CODES);
}

export function isForbiddenRisuLuaModuleTableMvpTarget(path: string): boolean {
  return /^lua\/features\/[^/]+_helpers\.risulua$/.test(path);
}

export function isAllowedRisuLuaModuleTableMvpTarget(path: string): boolean {
  return isOneOf(path, RISULUA_MODULE_TABLE_MVP_ARTIFACT_PATHS)
    || /^lua\/button_actions\/[^/]+\.risulua$/.test(path)
    || /^lua\/handler_helpers\/[^/]+_helpers\.risulua$/.test(path)
    || /^lua\/runtime\/[^/]+\.risulua$/.test(path)
    || /^lua\/domain\/[^/]+\.risulua$/.test(path);
}

export function validateRisuLuaModuleTableRefactorMap(
  refactorMap: RisuLuaModuleTableRefactorMapContract,
): RisuLuaModuleTableInvariantFinding[] {
  const findings: RisuLuaModuleTableInvariantFinding[] = [];

  if (refactorMap.version !== 1) {
    findings.push({ code: 'invalid-version', message: 'Module-table refactor map version must be 1.' });
  }

  if (refactorMap.mode !== 'module-table') {
    findings.push({ code: 'invalid-mode', message: 'Refactor map mode must be module-table.' });
  }

  for (const moduleContract of refactorMap.modules) {
    pushForbiddenTargetFinding(findings, moduleContract.path);
  }

  for (const symbol of refactorMap.symbols) {
    if (!isRisuLuaModuleTableClassificationCode(symbol.classification)) {
      findings.push({
        code: 'invalid-classification-code',
        message: `Unknown module-table classification code: ${symbol.classification}.`,
        symbolId: symbol.id,
      });
    }

    if (!hasSourceRange(symbol.sourceRange)) {
      findings.push({
        code: 'missing-source-range',
        message: `Symbol ${symbol.id} must include a complete source range.`,
        symbolId: symbol.id,
      });
    }

    if (isMovedSymbol(symbol)) {
      if (symbol.targetModule === undefined) {
        findings.push({
          code: 'missing-target-module',
          message: `Moved symbol ${symbol.id} must include a target module.`,
          symbolId: symbol.id,
        });
      } else {
        pushForbiddenTargetFinding(findings, symbol.targetModule, symbol.id);
      }
    }

    if (isHostVisibleBridgeSymbol(symbol) && symbol.bridge === undefined) {
      findings.push({
        code: 'missing-bridge-metadata',
        message: `Moved host-visible global ${symbol.id} must include bridge metadata.`,
        symbolId: symbol.id,
      });
    }
  }

  for (const preserved of refactorMap.preserved) {
    if (!hasSourceRange(preserved.sourceRange)) {
      findings.push({
        code: 'missing-source-range',
        message: `Preserved symbol ${preserved.id} must include a complete source range.`,
        symbolId: preserved.id,
      });
    }

    if (!isRisuLuaModuleTableClassificationCode(preserved.reason)) {
      findings.push({
        code: 'invalid-classification-code',
        message: `Unknown module-table preservation reason: ${preserved.reason}.`,
        symbolId: preserved.id,
      });
    }
  }

  findings.push(...validateRisuLuaModuleTableDomainCandidates(refactorMap.domainCandidates));

  return findings;
}

export function validateRisuLuaModuleTableDomainCandidates(
  candidates: RisuLuaModuleTableDomainCandidateContract[],
): RisuLuaModuleTableInvariantFinding[] {
  const findings: RisuLuaModuleTableInvariantFinding[] = [];

  for (const candidate of candidates) {
    if (candidate.generationStatus === 'generated') {
      if (candidate.autoGenerated !== true || candidate.generatedPath !== candidate.recommendedPath) {
        findings.push({
          code: 'invalid-domain-candidate',
          message: `Generated domain candidate ${candidate.name} must set autoGenerated true and generatedPath to its recommended path.`,
          candidateName: candidate.name,
        });
      }
    } else if (candidate.autoGenerated !== false) {
      findings.push({
        code: 'invalid-domain-candidate',
        message: `Non-generated domain candidate ${candidate.name} must have autoGenerated set to false.`,
        candidateName: candidate.name,
      });
    }

    if (candidate.generationStatus !== 'generated' && candidate.generationBlockedReasons.length === 0) {
      findings.push({
        code: 'invalid-domain-candidate',
        message: `Non-generated domain candidate ${candidate.name} must include generation blocked reasons.`,
        candidateName: candidate.name,
      });
    }

    if (candidate.sourceRanges.length === 0 || !candidate.sourceRanges.every(hasSourceRange)) {
      findings.push({
        code: 'missing-source-range',
        message: `Domain candidate ${candidate.name} must include source ranges.`,
        candidateName: candidate.name,
      });
    }
  }

  return findings;
}

function isMovedSymbol(symbol: RisuLuaModuleTableSymbolContract): boolean {
  return symbol.classification.startsWith('extract:') || symbol.classification === 'bridge:host-visible-global';
}

function isHostVisibleBridgeSymbol(symbol: RisuLuaModuleTableSymbolContract): boolean {
  return symbol.classification === 'bridge:host-visible-global' || symbol.globalBridge;
}

function hasSourceRange(range: LuaSourceRange): boolean {
  return Number.isInteger(range.startLine)
    && Number.isInteger(range.endLine)
    && Number.isInteger(range.startOffset)
    && Number.isInteger(range.endOffset)
    && range.startLine > 0
    && range.endLine >= range.startLine
    && range.startOffset >= 0
    && range.endOffset >= range.startOffset;
}

function pushForbiddenTargetFinding(
  findings: RisuLuaModuleTableInvariantFinding[],
  targetPath: string,
  symbolId?: string,
): void {
  if (!isForbiddenRisuLuaModuleTableMvpTarget(targetPath)) {
    return;
  }

  findings.push({
    code: 'forbidden-mvp-target',
    message: `Module-table MVP must not generate forbidden target ${targetPath}.`,
    path: targetPath,
    symbolId,
  });
}

function isOneOf<T extends string>(value: string, values: readonly T[]): value is T {
  return values.includes(value as T);
}
