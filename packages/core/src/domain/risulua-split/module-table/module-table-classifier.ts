import {
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  type RisuLuaModuleTableBridgeMetadata,
  type RisuLuaModuleTableClassificationCode,
  type RisuLuaModuleTableDomainCandidateContract,
  type RisuLuaModuleTableHostEffects,
  type RisuLuaModuleTableModuleCategory,
  type RisuLuaModuleTableModuleContract,
  type RisuLuaModuleTableRefactorMapContract,
  type RisuLuaModuleTableSymbolContract,
} from './module-table-contracts';
import type {
  RisuLuaModuleTableAnalyzerResult,
  RisuLuaModuleTableLexicalSymbolFact,
  RisuLuaModuleTableNestedHandlerHelperFact,
  RisuLuaModuleTableProceduralBlockFact,
  RisuLuaModuleTablePublicGlobalFact,
  RisuLuaModuleTableRuntimeRootFact,
} from './module-table-analyzer-types';
import type { LuaSourceRange } from '../shared/types';

export interface RisuLuaModuleTableClassifierInput {
  source: string;
  sourceFile: string;
  analyzerResult: RisuLuaModuleTableAnalyzerResult;
}

export interface RisuLuaModuleTableParameterizedHelperDecision {
  symbolId: string;
  originalName: string;
  parentHandler: string;
  parameters: string[];
  capturedReads: string[];
  reason: 'handler-local-read-parameterized';
}

export interface RisuLuaModuleTableClassificationResult {
  ok: boolean;
  refactorMap: RisuLuaModuleTableRefactorMapContract;
  runtimeRoots: RisuLuaModuleTableRuntimeRootFact[];
  proceduralBlocks: RisuLuaModuleTableProceduralBlockFact[];
  parameterizedHelpers: RisuLuaModuleTableParameterizedHelperDecision[];
  diagnostics: string[];
}

const HOST_GLOBAL_ALIAS = '__host_globals';
const ASYNC_ACTIONS_ALIAS = '__async_actions';
const SAFE_GLOBAL_NAMES = new Set(['string', 'table', 'math', 'os', 'pairs', 'ipairs', 'tostring', 'tonumber', 'type', 'print']);

export function classifyRisuLuaModuleTableDecisions(input: RisuLuaModuleTableClassifierInput): RisuLuaModuleTableClassificationResult {
  const diagnostics = [...input.analyzerResult.diagnostics];
  const symbols: RisuLuaModuleTableSymbolContract[] = [];
  const preserved: RisuLuaModuleTableRefactorMapContract['preserved'] = [];
  const domainCandidates: RisuLuaModuleTableDomainCandidateContract[] = [];
  const parameterizedHelpers: RisuLuaModuleTableParameterizedHelperDecision[] = [];

  if (!input.analyzerResult.ok) {
    diagnostics.push('Analyzer failed; module-table classifier produced preservation-only output.');
  }

  for (const root of input.analyzerResult.runtimeRoots) {
    preserved.push(preservedEntry(root.id, root.name, root.sourceRange, 'preserve:top-level-side-effect', [
      `${root.kind} runtime root remains in lua/main.risulua`,
    ]));
  }

  const publicGlobalsByName = groupByName(input.analyzerResult.publicGlobals);
  const unsafePublicNames = collectUnsafePublicNames(input.source, input.analyzerResult, publicGlobalsByName);
  const consumedSymbolIds = new Set<string>();

  for (const publicGlobal of input.analyzerResult.publicGlobals) {
    const symbol = findSymbolForPublicGlobal(input.analyzerResult.lexicalSymbols, publicGlobal);
    if (symbol !== undefined) consumedSymbolIds.add(symbol.id);
    const unsafeReason = unsafePublicNames.get(publicGlobal.name) ?? unsafePublicGlobalReason(symbol);
    if (unsafeReason !== undefined) {
      preserved.push(preservedEntry(publicGlobal.id, publicGlobal.name, publicGlobal.sourceRange, unsafeReason.code, unsafeReason.evidence));
      continue;
    }
    symbols.push(hostVisibleGlobalSymbol(publicGlobal, symbol));
    const domainCandidate = maybeDomainCandidate(publicGlobal.name, publicGlobal.sourceRange, publicGlobal.hostEffects, [publicGlobal.name]);
    if (domainCandidate !== undefined) domainCandidates.push(domainCandidate);
  }

  for (const symbol of input.analyzerResult.lexicalSymbols) {
    if (consumedSymbolIds.has(symbol.id)) continue;
    if (symbol.declarationKind === 'top-level-local-function') {
      const domainCandidate = maybeDomainCandidate(symbol.originalName, symbol.sourceRange, symbol.hostEffects, [symbol.originalName]);
      if (domainCandidate !== undefined) domainCandidates.push(domainCandidate);
      const unsafeReason = unsafeLocalHelperReason(symbol);
      if (unsafeReason === undefined) {
        symbols.push(localHelperSymbol(symbol));
      } else {
        preserved.push(preservedEntry(symbol.id, symbol.originalName, symbol.sourceRange, unsafeReason.code, unsafeReason.evidence));
      }
    }
  }

  for (const helper of input.analyzerResult.nestedHandlerHelpers) {
    const decision = classifyNestedHelper(helper);
    if (isExtractClassification(decision.classification)) {
      symbols.push(nestedHelperSymbol(helper, decision.classification));
      if (decision.parameterized !== undefined) parameterizedHelpers.push(decision.parameterized);
    } else {
      preserved.push(preservedEntry(helper.symbolId, helper.name, helper.sourceRange, decision.classification, decision.evidence));
    }
  }

  const refactorMap: RisuLuaModuleTableRefactorMapContract = {
    version: 1,
    mode: 'module-table',
    sourceFile: input.sourceFile,
    modules: moduleContractsForSymbols(symbols),
    symbols,
    preserved: dedupePreserved(preserved),
    domainCandidates: dedupeDomainCandidates(domainCandidates),
  };

  return {
    ok: input.analyzerResult.ok,
    refactorMap,
    runtimeRoots: input.analyzerResult.runtimeRoots,
    proceduralBlocks: input.analyzerResult.proceduralBlocks,
    parameterizedHelpers,
    diagnostics,
  };
}

function hostVisibleGlobalSymbol(
  publicGlobal: RisuLuaModuleTablePublicGlobalFact,
  symbol: RisuLuaModuleTableLexicalSymbolFact | undefined,
): RisuLuaModuleTableSymbolContract {
  const targetModule = publicGlobal.wrapperKind === 'async-wrapper' || publicGlobal.hostEffects.asyncModelNetwork.length > 0
    ? RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH
    : RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH;
  const moduleAlias = targetModule === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH ? ASYNC_ACTIONS_ALIAS : HOST_GLOBAL_ALIAS;
  const bridge: RisuLuaModuleTableBridgeMetadata = {
    required: true,
    kind: 'direct_assignment',
    originalPublicName: publicGlobal.name,
    moduleAlias,
    exportName: publicGlobal.name,
    mainAssignment: {
      shape: 'direct_assignment',
      text: `${publicGlobal.name} = ${moduleAlias}.${publicGlobal.name}`,
    },
  };
  return {
    id: symbol?.id ?? publicGlobal.id,
    originalName: publicGlobal.name,
    declarationKind: symbol?.declarationKind ?? 'top-level-global-assignment',
    sourceRange: publicGlobal.sourceRange,
    classification: 'bridge:host-visible-global',
    targetModule,
    exportName: publicGlobal.name,
    globalBridge: true,
    bridge,
    captures: symbol?.captures ?? [],
    mutates: symbol?.mutates ?? [],
    hostEffects: publicGlobal.hostEffects,
    rewriteRefs: symbol?.callSites.map((callSite) => callSite.name) ?? [],
  };
}

function localHelperSymbol(symbol: RisuLuaModuleTableLexicalSymbolFact): RisuLuaModuleTableSymbolContract {
  return {
    id: symbol.id,
    originalName: symbol.originalName,
    declarationKind: symbol.declarationKind,
    sourceRange: symbol.sourceRange,
    classification: 'extract:pure-helper',
    targetModule: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
    exportName: symbol.originalName,
    globalBridge: false,
    captures: symbol.captures,
    mutates: symbol.mutates,
    hostEffects: symbol.hostEffects,
    rewriteRefs: symbol.callSites.map((callSite) => callSite.name),
  };
}

function nestedHelperSymbol(
  helper: RisuLuaModuleTableNestedHandlerHelperFact,
  classification: Extract<RisuLuaModuleTableClassificationCode, `extract:${string}`>,
): RisuLuaModuleTableSymbolContract {
  return {
    id: helper.symbolId,
    originalName: helper.name,
    declarationKind: 'nested-local-function',
    sourceRange: helper.sourceRange,
    parent: {
      kind: helper.parentHandler.kind,
      name: helper.parentHandler.name,
      startLine: helper.parentHandler.sourceRange.startLine,
    },
    classification,
    targetModule: handlerHelperPath(helper.parentHandler.name),
    exportName: helper.name,
    globalBridge: false,
    captures: helper.captures,
    mutates: helper.mutations.map((mutation) => mutation.accessPath ?? mutation.name),
    hostEffects: helper.hostEffects,
    rewriteRefs: helper.callSites.map((callSite) => callSite.name),
  };
}

function classifyNestedHelper(helper: RisuLuaModuleTableNestedHandlerHelperFact): {
  classification: RisuLuaModuleTableClassificationCode;
  evidence: string[];
  parameterized?: RisuLuaModuleTableParameterizedHelperDecision;
} {
  const tableMutation = helper.mutations.find((mutation) => mutation.mutatesCapturedTable);
  if (tableMutation !== undefined) return { classification: 'preserve:captured-table-mutation', evidence: [`Mutates captured table path ${tableMutation.accessPath ?? tableMutation.name}.`] };
  const capturedMutation = helper.mutations.find((mutation) => mutation.mutatesCapturedBinding);
  if (capturedMutation !== undefined) return { classification: 'preserve:captures-mutable-state', evidence: [`Mutates captured binding ${capturedMutation.name}.`] };
  if (helper.hostEffects.dynamicEnvironment.length > 0) return { classification: 'preserve:ambiguous', evidence: [`Dynamic environment usage: ${helper.hostEffects.dynamicEnvironment.join(', ')}.`] };
  if (helper.hostEffects.writes.length > 0) return { classification: 'preserve:host-write-order', evidence: [`Host writes require order preservation: ${helper.hostEffects.writes.join(', ')}.`] };
  if (helper.hostEffects.uiInteraction.length > 0 || helper.hostEffects.asyncModelNetwork.length > 0) return { classification: 'preserve:async-boundary-risk', evidence: [`UI/async boundary effects: ${[...helper.hostEffects.uiInteraction, ...helper.hostEffects.asyncModelNetwork].join(', ')}.`] };

  const capturedReads = helper.captures.filter((capture) => !helper.parameters.includes(capture));
  if (capturedReads.length > 0) {
    return {
      classification: 'extract:parameterized-read-helper',
      evidence: [`Captured handler reads are parameterized: ${capturedReads.join(', ')}.`],
      parameterized: {
        symbolId: helper.symbolId,
        originalName: helper.name,
        parentHandler: helper.parentHandler.name,
        parameters: [...helper.parameters, ...capturedReads],
        capturedReads,
        reason: 'handler-local-read-parameterized',
      },
    };
  }
  if (helper.hostEffects.reads.length > 0) return { classification: 'extract:host-read-helper', evidence: [`Host reads: ${helper.hostEffects.reads.join(', ')}.`] };
  return { classification: 'extract:pure-helper', evidence: ['No captures, mutations, or host effects.'] };
}

function isExtractClassification(
  classification: RisuLuaModuleTableClassificationCode,
): classification is Extract<RisuLuaModuleTableClassificationCode, `extract:${string}`> {
  return classification.startsWith('extract:');
}

function unsafePublicGlobalReason(symbol: RisuLuaModuleTableLexicalSymbolFact | undefined): { code: RisuLuaModuleTableClassificationCode; evidence: string[] } | undefined {
  if (symbol === undefined) return { code: 'preserve:ambiguous', evidence: ['Missing lexical symbol for public global.'] };
  if (symbol.hostEffects.dynamicEnvironment.length > 0) return { code: 'preserve:dynamic-global-reference-risk', evidence: [`Dynamic environment usage: ${symbol.hostEffects.dynamicEnvironment.join(', ')}.`] };
  const unknownReferences = symbol.references
    .filter((reference) => reference.resolvedScopeId === undefined)
    .map((reference) => reference.name)
    .filter((name) => !SAFE_GLOBAL_NAMES.has(name) && !symbol.hostEffects.reads.includes(name) && !symbol.hostEffects.writes.includes(name) && !symbol.hostEffects.uiInteraction.includes(name) && !symbol.hostEffects.asyncModelNetwork.includes(name));
  if (unknownReferences.length > 0) return { code: 'preserve:ambiguous', evidence: [`Unknown global dependencies: ${uniqueSorted(unknownReferences).join(', ')}.`] };
  return undefined;
}

function unsafeLocalHelperReason(symbol: RisuLuaModuleTableLexicalSymbolFact): { code: RisuLuaModuleTableClassificationCode; evidence: string[] } | undefined {
  if (symbol.captures.length > 0) return { code: 'preserve:captures-mutable-state', evidence: [`Top-level local helper captures external bindings: ${symbol.captures.join(', ')}.`] };
  if (symbol.mutations.length > 0 || symbol.mutates.length > 0) return { code: 'preserve:captures-mutable-state', evidence: [`Top-level local helper mutates bindings: ${symbol.mutates.join(', ')}.`] };
  if (symbol.hostEffects.dynamicEnvironment.length > 0) return { code: 'preserve:dynamic-global-reference-risk', evidence: [`Dynamic environment usage: ${symbol.hostEffects.dynamicEnvironment.join(', ')}.`] };
  if (symbol.hostEffects.writes.length > 0) return { code: 'preserve:host-write-order', evidence: [`Host writes require order preservation: ${symbol.hostEffects.writes.join(', ')}.`] };
  if (symbol.hostEffects.uiInteraction.length > 0 || symbol.hostEffects.asyncModelNetwork.length > 0) return { code: 'preserve:async-boundary-risk', evidence: [`UI/async boundary effects: ${[...symbol.hostEffects.uiInteraction, ...symbol.hostEffects.asyncModelNetwork].join(', ')}.`] };
  return undefined;
}

function collectUnsafePublicNames(
  source: string,
  analyzerResult: RisuLuaModuleTableAnalyzerResult,
  publicGlobalsByName: Map<string, RisuLuaModuleTablePublicGlobalFact[]>,
): Map<string, { code: RisuLuaModuleTableClassificationCode; evidence: string[] }> {
  const output = new Map<string, { code: RisuLuaModuleTableClassificationCode; evidence: string[] }>();
  for (const [name, globals] of publicGlobalsByName) {
    if (globals.length > 1) output.set(name, { code: 'preserve:host-visible-global-unsafe-bridge', evidence: [`Duplicate public global assignments for ${name}.`] });
  }
  for (const block of analyzerResult.proceduralBlocks) {
    const text = source.slice(block.sourceRange.startOffset, block.sourceRange.endOffset);
    const assignedName = topLevelAssignedName(text);
    if (assignedName !== undefined && publicGlobalsByName.has(assignedName)) {
      output.set(assignedName, { code: 'preserve:host-visible-global-unsafe-bridge', evidence: [`Public global ${assignedName} collides with non-function top-level assignment.`] });
    }
    if (hasDynamicButtonMarkup(text)) {
      output.set('risu-btn', { code: 'preserve:dynamic-global-reference-risk', evidence: ['Dynamic risu-btn markup is host-visible runtime behavior.'] });
    }
  }
  return output;
}

function moduleContractsForSymbols(symbols: RisuLuaModuleTableSymbolContract[]): RisuLuaModuleTableModuleContract[] {
  const contracts = new Map<string, RisuLuaModuleTableModuleContract>();
  for (const symbol of symbols) {
    if (symbol.targetModule === undefined) continue;
    const existing = contracts.get(symbol.targetModule);
    if (existing !== undefined) {
      if (symbol.exportName !== undefined && !existing.exports.includes(symbol.exportName)) existing.exports.push(symbol.exportName);
      continue;
    }
    contracts.set(symbol.targetModule, {
      path: symbol.targetModule,
      requireId: modulePathToRequireId(symbol.targetModule),
      alias: aliasForModulePath(symbol.targetModule),
      category: categoryForModulePath(symbol.targetModule),
      exports: symbol.exportName === undefined ? [] : [symbol.exportName],
    });
  }
  return [...contracts.values()];
}

function findSymbolForPublicGlobal(symbols: RisuLuaModuleTableLexicalSymbolFact[], publicGlobal: RisuLuaModuleTablePublicGlobalFact): RisuLuaModuleTableLexicalSymbolFact | undefined {
  return symbols.find((symbol) => symbol.originalName === publicGlobal.name && rangesEqual(symbol.sourceRange, publicGlobal.sourceRange))
    ?? symbols.find((symbol) => symbol.originalName === publicGlobal.name && symbol.sourceRange.startOffset >= publicGlobal.sourceRange.startOffset && symbol.sourceRange.endOffset <= publicGlobal.sourceRange.endOffset);
}

function maybeDomainCandidate(name: string, sourceRange: LuaSourceRange, hostEffects: RisuLuaModuleTableHostEffects, sourceSymbols: string[]): RisuLuaModuleTableDomainCandidateContract | undefined {
  if (!/(deck|score|card|inventory|quest|character)/i.test(name)) return undefined;
  return {
    name,
    sourceSymbols,
    sourceRanges: [sourceRange],
    confidence: 0.7,
    evidence: [`${name} has semantic domain naming; report-only in module-table MVP.`],
    recommendedPath: `lua/domain/${toSnakeCase(name)}.risulua`,
    hostEffects,
    notGeneratedReason: 'Domain candidates are report-only and have no generated artifact target in the module-table MVP.',
    autoGenerated: false,
  };
}

function preservedEntry(id: string, originalName: string, sourceRange: LuaSourceRange, reason: RisuLuaModuleTableClassificationCode, evidence: string[]): RisuLuaModuleTableRefactorMapContract['preserved'][number] {
  return { id, originalName, sourceRange, reason, evidence };
}

function groupByName(globals: RisuLuaModuleTablePublicGlobalFact[]): Map<string, RisuLuaModuleTablePublicGlobalFact[]> {
  const output = new Map<string, RisuLuaModuleTablePublicGlobalFact[]>();
  for (const global of globals) output.set(global.name, [...(output.get(global.name) ?? []), global]);
  return output;
}

function handlerHelperPath(handlerName: string): string {
  const segment = handlerName === 'listenEdit' ? 'listen_edit' : toSnakeCase(handlerName.replace(/^on/, ''));
  return `lua/handler_helpers/${segment}_helpers.risulua`;
}

function modulePathToRequireId(modulePath: string): string {
  return modulePath.replace(/^lua\//, '').replace(/\.risulua$/, '').replace(/\//g, '.');
}

function aliasForModulePath(modulePath: string): string {
  if (modulePath === RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH) return HOST_GLOBAL_ALIAS;
  if (modulePath === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH) return ASYNC_ACTIONS_ALIAS;
  if (modulePath === RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH) return '__local_helpers';

  // Handler helper module aliases (must match plan exactly)
  if (modulePath === 'lua/handler_helpers/output_helpers.risulua') return '__output_helpers';
  if (modulePath === 'lua/handler_helpers/input_helpers.risulua') return '__input_helpers';
  if (modulePath === 'lua/handler_helpers/start_helpers.risulua') return '__start_helpers';
  if (modulePath === 'lua/handler_helpers/button_click_helpers.risulua') return '__button_helpers';
  if (modulePath === 'lua/handler_helpers/listen_edit_helpers.risulua') return '__listener_helpers';

  return `__${modulePath.split('/').at(-1)?.replace(/\.risulua$/, '') ?? 'handler_helpers'}`;
}

function categoryForModulePath(modulePath: string): RisuLuaModuleTableModuleCategory {
  if (modulePath === RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH) return 'common-helper';
  if (modulePath === RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH || modulePath === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH) return 'host-global';
  return 'handler-helper';
}

function rangesEqual(left: LuaSourceRange, right: LuaSourceRange): boolean {
  return left.startOffset === right.startOffset && left.endOffset === right.endOffset;
}

function topLevelAssignedName(text: string): string | undefined {
  const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(text);
  return match?.[1];
}

function hasDynamicButtonMarkup(text: string): boolean {
  return /risu-btn/.test(text) || /dynamicButton/.test(text);
}

function dedupePreserved(entries: RisuLuaModuleTableRefactorMapContract['preserved']): RisuLuaModuleTableRefactorMapContract['preserved'] {
  const byKey = new Map<string, RisuLuaModuleTableRefactorMapContract['preserved'][number]>();
  for (const entry of entries) byKey.set(`${entry.id}:${entry.reason}`, entry);
  return [...byKey.values()];
}

function dedupeDomainCandidates(candidates: RisuLuaModuleTableDomainCandidateContract[]): RisuLuaModuleTableDomainCandidateContract[] {
  const byName = new Map<string, RisuLuaModuleTableDomainCandidateContract>();
  for (const candidate of candidates) byName.set(candidate.name, { ...candidate, autoGenerated: false });
  return [...byName.values()];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}
