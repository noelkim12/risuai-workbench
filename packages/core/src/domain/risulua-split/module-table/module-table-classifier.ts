import {
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_START_PATH,
  type RisuLuaModuleTableBridgeMetadata,
  type RisuLuaModuleTableButtonActionSourceContract,
  type RisuLuaModuleTableClassificationCode,
  type RisuLuaModuleTableDomainCandidateContract,
  type RisuLuaModuleTableDomainGenerationOption,
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
  domainGeneration?: RisuLuaModuleTableDomainGenerationOption;
  buttonActionSources?: RisuLuaModuleTableButtonActionSourceInput[];
  variableStoreNames?: string[];
  promptStoreNames?: string[];
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
const BUTTON_ACTIONS_ALIAS = '__button_actions';
const DUPLICATE_GLOBALS_ALIAS = '__duplicate_globals';
const SAFE_GLOBAL_NAMES = new Set(['string', 'table', 'math', 'os', 'pairs', 'ipairs', 'pcall', 'xpcall', 'tostring', 'tonumber', 'type', 'print']);
const RUNTIME_HANDLER_MODULES: Record<string, string> = {
  onOutput: RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH,
  onInput: RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH,
  onStart: RISULUA_MODULE_TABLE_RUNTIME_START_PATH,
  onButtonClick: RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH,
};

type RisuLuaModuleTableButtonActionSourceInput = string | RisuLuaModuleTableButtonActionSourceContract;

export function classifyRisuLuaModuleTableDecisions(input: RisuLuaModuleTableClassifierInput): RisuLuaModuleTableClassificationResult {
  const diagnostics = [...input.analyzerResult.diagnostics];
  const domainGeneration = input.domainGeneration ?? 'report';
  const symbols: RisuLuaModuleTableSymbolContract[] = [];
  const preserved: RisuLuaModuleTableRefactorMapContract['preserved'] = [];
  const domainCandidates: RisuLuaModuleTableDomainCandidateContract[] = [];
  const parameterizedHelpers: RisuLuaModuleTableParameterizedHelperDecision[] = [];
  const consumedSymbolIds = new Set<string>();
  const buttonActionNames = collectButtonActionNames([input.source, ...(input.buttonActionSources ?? [])]);
  const extractableCommonHelperNames = collectCommonHelperClosureNames(input.analyzerResult.lexicalSymbols);
  const variableStoreNames = new Set(input.variableStoreNames ?? []);
  const promptStoreNames = new Set(input.promptStoreNames ?? []);

  if (!input.analyzerResult.ok) {
    diagnostics.push('Analyzer failed; module-table classifier produced preservation-only output.');
  }

  for (const root of input.analyzerResult.runtimeRoots) {
    const symbol = findSymbolForRuntimeRoot(input.analyzerResult.lexicalSymbols, root);
    if (symbol === undefined) {
      preserved.push(preservedEntry(root.id, root.name, root.sourceRange, 'preserve:top-level-side-effect', [
        `${root.kind} runtime root remains in lua/main.risulua because it has no extractable lexical body.`,
      ]));
      continue;
    }
    consumedSymbolIds.add(symbol.id);
    symbols.push(runtimeHandlerBodySymbol(root, symbol));
  }

  const publicGlobalsByName = groupByName(input.analyzerResult.publicGlobals);
  const unsafePublicNames = collectUnsafePublicNames(input.source, input.analyzerResult, publicGlobalsByName);
  const rewriteablePublicHostGlobalNames = collectRewriteablePublicHostGlobalNames(
    input.analyzerResult.lexicalSymbols,
    input.analyzerResult.publicGlobals,
    publicGlobalsByName,
    unsafePublicNames,
  );
  const validatedPublicDomainNames = collectValidatedPublicDomainNames(
    input.analyzerResult.lexicalSymbols,
    input.analyzerResult.publicGlobals,
    publicGlobalsByName,
    unsafePublicNames,
    domainGeneration,
  );
  const validatedPrivateDomainNames = collectValidatedPrivateDomainNames(
    input.analyzerResult.lexicalSymbols,
    extractableCommonHelperNames,
    rewriteablePublicHostGlobalNames,
    validatedPublicDomainNames,
    domainGeneration,
    variableStoreNames,
    promptStoreNames,
  );
  const safeButtonCaptureNames = collectSafeButtonCaptureNames(
    input.analyzerResult.lexicalSymbols,
    input.analyzerResult.publicGlobals,
    extractableCommonHelperNames,
    validatedPrivateDomainNames,
    domainGeneration,
    rewriteablePublicHostGlobalNames,
    variableStoreNames,
    promptStoreNames,
  );

  for (const publicGlobal of input.analyzerResult.publicGlobals) {
    const symbol = findSymbolForPublicGlobal(input.analyzerResult.lexicalSymbols, publicGlobal);
    if (symbol !== undefined) consumedSymbolIds.add(symbol.id);
    if (buttonActionNames.has(publicGlobal.name) && symbol !== undefined) {
      const unsafeButtonReason = unsafeButtonActionReason(symbol, safeButtonCaptureNames);
      if (unsafeButtonReason !== undefined) {
        preserved.push(preservedEntry(symbol.id, publicGlobal.name, publicGlobal.sourceRange, unsafeButtonReason.code, unsafeButtonReason.evidence));
        continue;
      }
      symbols.push(buttonActionSymbol(symbol, publicGlobal.name, publicGlobal.sourceRange));
      continue;
    }
    const publicDomainUnsafeReason = unsafePublicNames.get(publicGlobal.name) ?? unsafePublicDomainGenerationReason(symbol);
    const publicDomainDecision = domainGeneration === 'validated'
      && isPublicDomainCandidate(publicGlobal)
      && symbol !== undefined
      && isValidatedPublicDomainFunction(publicGlobal)
      && publicDomainUnsafeReason === undefined
      ? { status: 'generated' as const, blockedReasons: [] }
      : { status: domainGeneration === 'validated' && isPublicDomainCandidate(publicGlobal) ? 'blocked' as const : 'report-only' as const, blockedReasons: publicDomainBlockedReasons(publicGlobal, symbol, domainGeneration, publicDomainUnsafeReason) };
    const domainCandidate = isPublicDomainCandidate(publicGlobal)
      ? maybeDomainCandidate(publicGlobal.name, publicGlobal.sourceRange, publicGlobal.hostEffects, [publicGlobal.name], publicDomainDecision.status, publicDomainDecision.blockedReasons)
      : undefined;
    if (domainCandidate !== undefined) domainCandidates.push(domainCandidate);
    if (publicDomainDecision.status === 'generated' && symbol !== undefined) {
      symbols.push(domainPublicGlobalSymbol(publicGlobal, symbol));
      continue;
    }
    const duplicateGroup = publicGlobalsByName.get(publicGlobal.name) ?? [];
    const unsafeReason = unsafePublicNames.get(publicGlobal.name) ?? unsafePublicGlobalReason(symbol, new Set([publicGlobal.name]));
    if (unsafeReason !== undefined) {
      preserved.push(preservedEntry(publicGlobal.id, publicGlobal.name, publicGlobal.sourceRange, unsafeReason.code, unsafeReason.evidence));
      continue;
    }
    if (duplicateGroup.length > 1) {
      symbols.push(duplicateHostVisibleGlobalSymbol(publicGlobal, symbol, duplicateExportName(publicGlobal, duplicateGroup)));
      continue;
    }
    symbols.push(hostVisibleGlobalSymbol(publicGlobal, symbol));
  }

  for (const symbol of input.analyzerResult.lexicalSymbols) {
    if (consumedSymbolIds.has(symbol.id)) continue;
    if (symbol.declarationKind === 'top-level-local-function') {
      if (buttonActionNames.has(symbol.originalName)) {
        const unsafeButtonReason = unsafeButtonActionReason(symbol, safeButtonCaptureNames);
        if (unsafeButtonReason !== undefined) {
          preserved.push(preservedEntry(symbol.id, symbol.originalName, symbol.sourceRange, unsafeButtonReason.code, unsafeButtonReason.evidence));
          continue;
        }
        symbols.push(buttonActionSymbol(symbol, symbol.originalName, symbol.sourceRange));
        continue;
      }
      const commonHelper = extractableCommonHelperNames.has(symbol.originalName);
      const domainDecision = domainGeneration === 'validated' && !commonHelper && isValidatedPrivateDomainFunction(symbol, validatedPrivateDomainNames)
        ? { status: 'generated' as const, blockedReasons: [] }
        : { status: domainGeneration === 'validated' && !commonHelper ? 'blocked' as const : 'report-only' as const, blockedReasons: domainGenerationBlockedReasons(symbol, domainGeneration, commonHelper, extractableCommonHelperNames, rewriteablePublicHostGlobalNames, validatedPrivateDomainNames, validatedPublicDomainNames, variableStoreNames, promptStoreNames) };
      const domainCandidate = commonHelper
        ? undefined
        : maybeDomainCandidate(symbol.originalName, symbol.sourceRange, symbol.hostEffects, [symbol.originalName], domainDecision.status, domainDecision.blockedReasons);
      if (domainCandidate !== undefined) domainCandidates.push(domainCandidate);
      if (domainDecision.status === 'generated') {
        symbols.push(domainFunctionSymbol(symbol));
        continue;
      }
      const unsafeReason = unsafeLocalHelperReason(symbol, extractableCommonHelperNames);
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
    domainGeneration,
    sourceFile: input.sourceFile,
    modules: moduleContractsForSymbols(symbols, input.analyzerResult.runtimeRoots),
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

function domainFunctionSymbol(symbol: RisuLuaModuleTableLexicalSymbolFact): RisuLuaModuleTableSymbolContract {
  return {
    ...localHelperSymbol(symbol),
    declarationKind: 'domain-candidate',
    classification: 'extract:domain-function',
    targetModule: domainFunctionPath(symbol.originalName),
  };
}

function domainPublicGlobalSymbol(
  publicGlobal: RisuLuaModuleTablePublicGlobalFact,
  symbol: RisuLuaModuleTableLexicalSymbolFact,
): RisuLuaModuleTableSymbolContract {
  const targetModule = domainFunctionPath(publicGlobal.name);
  return {
    id: symbol.id,
    originalName: publicGlobal.name,
    declarationKind: symbol.declarationKind,
    sourceRange: publicGlobal.sourceRange,
    classification: 'extract:domain-function',
    targetModule,
    exportName: publicGlobal.name,
    globalBridge: false,
    captures: symbol.captures,
    mutates: symbol.mutates,
    hostEffects: publicGlobal.hostEffects,
    rewriteRefs: symbol.callSites.map((callSite) => callSite.name),
  };
}

function hostVisibleGlobalSymbol(
  publicGlobal: RisuLuaModuleTablePublicGlobalFact,
  symbol: RisuLuaModuleTableLexicalSymbolFact | undefined,
): RisuLuaModuleTableSymbolContract {
  const targetModule = publicGlobal.wrapperKind === 'async-wrapper' || publicGlobal.hostEffects.asyncModelNetwork.length > 0
    ? RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH
    : RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH;
  return {
    id: symbol?.id ?? publicGlobal.id,
    originalName: publicGlobal.name,
    declarationKind: symbol?.declarationKind ?? 'top-level-global-assignment',
    sourceRange: publicGlobal.sourceRange,
    classification: 'extract:host-global-function',
    targetModule,
    exportName: publicGlobal.name,
    globalBridge: false,
    captures: symbol?.captures ?? [],
    mutates: symbol?.mutates ?? [],
    hostEffects: publicGlobal.hostEffects,
    rewriteRefs: symbol?.callSites.map((callSite) => callSite.name) ?? [],
  };
}

function duplicateHostVisibleGlobalSymbol(
  publicGlobal: RisuLuaModuleTablePublicGlobalFact,
  symbol: RisuLuaModuleTableLexicalSymbolFact | undefined,
  exportName: string,
): RisuLuaModuleTableSymbolContract {
  const bridge: RisuLuaModuleTableBridgeMetadata = {
    required: true,
    kind: 'direct_assignment',
    originalPublicName: publicGlobal.name,
    moduleAlias: DUPLICATE_GLOBALS_ALIAS,
    exportName,
    mainAssignment: {
      shape: 'direct_assignment',
      text: `${publicGlobal.name} = ${DUPLICATE_GLOBALS_ALIAS}.${exportName}`,
    },
  };
  return {
    id: symbol?.id ?? publicGlobal.id,
    originalName: publicGlobal.name,
    declarationKind: symbol?.declarationKind ?? 'top-level-global-assignment',
    sourceRange: publicGlobal.sourceRange,
    classification: 'bridge:host-visible-global',
    targetModule: RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH,
    exportName,
    globalBridge: true,
    bridge,
    captures: symbol?.captures ?? [],
    mutates: symbol?.mutates ?? [],
    hostEffects: publicGlobal.hostEffects,
    rewriteRefs: symbol?.callSites.map((callSite) => callSite.name) ?? [],
  };
}

function runtimeHandlerBodySymbol(
  root: RisuLuaModuleTableRuntimeRootFact,
  symbol: RisuLuaModuleTableLexicalSymbolFact,
): RisuLuaModuleTableSymbolContract {
  return {
    id: symbol.id,
    originalName: root.name,
    declarationKind: symbol.declarationKind,
    sourceRange: root.sourceRange,
    classification: 'extract:runtime-handler-body',
    targetModule: runtimeHandlerPath(root.name),
    exportName: root.name,
    globalBridge: false,
    captures: symbol.captures,
    mutates: symbol.mutates,
    hostEffects: root.hostEffects,
    rewriteRefs: symbol.callSites.map((callSite) => callSite.name),
  };
}

function buttonActionSymbol(
  symbol: RisuLuaModuleTableLexicalSymbolFact,
  publicName: string,
  sourceRange: LuaSourceRange,
): RisuLuaModuleTableSymbolContract {
  const bridge: RisuLuaModuleTableBridgeMetadata = {
    required: true,
    kind: 'direct_assignment',
    originalPublicName: publicName,
    moduleAlias: BUTTON_ACTIONS_ALIAS,
    exportName: symbol.originalName,
    mainAssignment: {
      shape: 'direct_assignment',
      text: `${publicName} = ${BUTTON_ACTIONS_ALIAS}.${symbol.originalName}`,
    },
  };
  return {
    id: symbol.id,
    originalName: symbol.originalName,
    declarationKind: symbol.declarationKind,
    sourceRange,
    classification: 'extract:button-action',
    targetModule: RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
    exportName: symbol.originalName,
    globalBridge: true,
    bridge,
    captures: symbol.captures,
    mutates: symbol.mutates,
    hostEffects: symbol.hostEffects,
    rewriteRefs: symbol.callSites.map((callSite) => callSite.name),
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

function unsafePublicGlobalReason(symbol: RisuLuaModuleTableLexicalSymbolFact | undefined, allowedLateGlobals = new Set<string>()): { code: RisuLuaModuleTableClassificationCode; evidence: string[] } | undefined {
  if (symbol === undefined) return { code: 'preserve:ambiguous', evidence: ['Missing lexical symbol for public global.'] };
  if (symbol.hostEffects.dynamicEnvironment.length > 0) return { code: 'preserve:dynamic-global-reference-risk', evidence: [`Dynamic environment usage: ${symbol.hostEffects.dynamicEnvironment.join(', ')}.`] };
  const unknownReferences = symbol.references
    .filter((reference) => reference.resolvedScopeId === undefined)
    .map((reference) => reference.name)
    .filter((name) => !allowedLateGlobals.has(name) && !SAFE_GLOBAL_NAMES.has(name) && !symbol.hostEffects.reads.includes(name) && !symbol.hostEffects.writes.includes(name) && !symbol.hostEffects.uiInteraction.includes(name) && !symbol.hostEffects.asyncModelNetwork.includes(name));
  if (unknownReferences.length > 0) return { code: 'preserve:ambiguous', evidence: [`Unknown global dependencies: ${uniqueSorted(unknownReferences).join(', ')}.`] };
  return undefined;
}

function unsafeLocalHelperReason(symbol: RisuLuaModuleTableLexicalSymbolFact, extractableCommonHelperNames: Set<string>): { code: RisuLuaModuleTableClassificationCode; evidence: string[] } | undefined {
  const unsafeCaptures = symbol.captures.filter((capture) => !extractableCommonHelperNames.has(capture));
  if (unsafeCaptures.length > 0) return { code: 'preserve:captures-mutable-state', evidence: [`Top-level local helper captures external bindings: ${unsafeCaptures.join(', ')}.`] };
  const unsafeMutations = unsafeMutationNames(symbol);
  if (unsafeMutations.length > 0) return { code: 'preserve:captures-mutable-state', evidence: [`Top-level local helper mutates bindings: ${unsafeMutations.join(', ')}.`] };
  if (symbol.hostEffects.dynamicEnvironment.length > 0) return { code: 'preserve:dynamic-global-reference-risk', evidence: [`Dynamic environment usage: ${symbol.hostEffects.dynamicEnvironment.join(', ')}.`] };
  if (symbol.hostEffects.writes.length > 0) return { code: 'preserve:host-write-order', evidence: [`Host writes require order preservation: ${symbol.hostEffects.writes.join(', ')}.`] };
  if (symbol.hostEffects.uiInteraction.length > 0 || symbol.hostEffects.asyncModelNetwork.length > 0) return { code: 'preserve:async-boundary-risk', evidence: [`UI/async boundary effects: ${[...symbol.hostEffects.uiInteraction, ...symbol.hostEffects.asyncModelNetwork].join(', ')}.`] };
  return undefined;
}

function unsafeButtonActionReason(symbol: RisuLuaModuleTableLexicalSymbolFact, safeCaptureNames: Set<string>): { code: RisuLuaModuleTableClassificationCode; evidence: string[] } | undefined {
  const unsafeCaptures = symbol.captures.filter((capture) => !safeCaptureNames.has(capture));
  if (unsafeCaptures.length > 0) return { code: 'preserve:captures-mutable-state', evidence: [`Button action captures external bindings: ${unsafeCaptures.join(', ')}.`] };
  const unsafeMutations = unsafeMutationNames(symbol);
  if (unsafeMutations.length > 0) return { code: 'preserve:captures-mutable-state', evidence: [`Button action mutates captured bindings: ${unsafeMutations.join(', ')}.`] };
  if (symbol.hostEffects.dynamicEnvironment.length > 0) return { code: 'preserve:dynamic-global-reference-risk', evidence: [`Button action uses dynamic environment APIs: ${symbol.hostEffects.dynamicEnvironment.join(', ')}.`] };
  return undefined;
}

function collectUnsafePublicNames(
  source: string,
  analyzerResult: RisuLuaModuleTableAnalyzerResult,
  publicGlobalsByName: Map<string, RisuLuaModuleTablePublicGlobalFact[]>,
): Map<string, { code: RisuLuaModuleTableClassificationCode; evidence: string[] }> {
  const output = new Map<string, { code: RisuLuaModuleTableClassificationCode; evidence: string[] }>();
  void publicGlobalsByName;
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

function moduleContractsForSymbols(symbols: RisuLuaModuleTableSymbolContract[], runtimeRoots: RisuLuaModuleTableRuntimeRootFact[]): RisuLuaModuleTableModuleContract[] {
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
  if (runtimeRoots.some((root) => root.kind === 'listener-registration' && root.wrapperKind === 'listen-edit-callback')) {
    contracts.set(RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH, {
      path: RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH,
      requireId: modulePathToRequireId(RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH),
      alias: aliasForModulePath(RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH),
      category: categoryForModulePath(RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH),
      exports: [],
    });
  }
  return [...contracts.values()];
}

function duplicateExportName(publicGlobal: RisuLuaModuleTablePublicGlobalFact, duplicateGroup: RisuLuaModuleTablePublicGlobalFact[]): string {
  const ordered = [...duplicateGroup].sort((left, right) => left.sourceRange.startOffset - right.sourceRange.startOffset);
  const occurrenceIndex = ordered.findIndex((candidate) => candidate.id === publicGlobal.id);
  const line = publicGlobal.sourceRange.startLine || occurrenceIndex + 1;
  return `${publicGlobal.name}__L${line}`;
}

function findSymbolForPublicGlobal(symbols: RisuLuaModuleTableLexicalSymbolFact[], publicGlobal: RisuLuaModuleTablePublicGlobalFact): RisuLuaModuleTableLexicalSymbolFact | undefined {
  return symbols.find((symbol) => symbol.originalName === publicGlobal.name && rangesEqual(symbol.sourceRange, publicGlobal.sourceRange))
    ?? symbols.find((symbol) => symbol.originalName === publicGlobal.name && symbol.sourceRange.startOffset >= publicGlobal.sourceRange.startOffset && symbol.sourceRange.endOffset <= publicGlobal.sourceRange.endOffset);
}

function findSymbolForRuntimeRoot(symbols: RisuLuaModuleTableLexicalSymbolFact[], root: RisuLuaModuleTableRuntimeRootFact): RisuLuaModuleTableLexicalSymbolFact | undefined {
  return symbols.find((symbol) => symbol.originalName === root.name && rangesEqual(symbol.sourceRange, root.sourceRange))
    ?? symbols.find((symbol) => symbol.originalName === root.name && symbol.sourceRange.startOffset >= root.sourceRange.startOffset && symbol.sourceRange.endOffset <= root.sourceRange.endOffset)
    ?? symbols.find((symbol) => symbol.originalName === root.name);
}

function maybeDomainCandidate(
  name: string,
  sourceRange: LuaSourceRange,
  hostEffects: RisuLuaModuleTableHostEffects,
  sourceSymbols: string[],
  generationStatus: RisuLuaModuleTableDomainCandidateContract['generationStatus'],
  generationBlockedReasons: string[],
): RisuLuaModuleTableDomainCandidateContract | undefined {
  const recommendedPath = domainFunctionPath(name);
  return {
    name,
    sourceSymbols,
    sourceRanges: [sourceRange],
    confidence: 0.7,
    evidence: [`${name} is classified as default domain logic after strict infrastructure exclusions; generationStatus=${generationStatus}.`],
    recommendedPath,
    generationStatus,
    generatedPath: generationStatus === 'generated' ? recommendedPath : undefined,
    generationBlockedReasons,
    hostEffects,
    notGeneratedReason: generationStatus === 'generated' ? '' : generationBlockedReasons.join(' '),
    autoGenerated: generationStatus === 'generated',
  };
}

function domainGenerationBlockedReasons(
  symbol: RisuLuaModuleTableLexicalSymbolFact,
  domainGeneration: RisuLuaModuleTableDomainGenerationOption,
  commonHelper: boolean,
  extractableCommonHelperNames: Set<string>,
  rewriteablePublicHostGlobalNames: Set<string>,
  validatedPrivateDomainNames: Set<string>,
  validatedPublicDomainNames: Set<string>,
  variableStoreNames: Set<string>,
  promptStoreNames: Set<string>,
): string[] {
  if (domainGeneration === 'report') return ['Domain generation is report-only by default.'];
  if (commonHelper) return ['Symbol is classified as a strict common helper.'];
  const reasons: string[] = [];
  const unresolvedCaptures = symbol.captures.filter((capture) => !extractableCommonHelperNames.has(capture) && !rewriteablePublicHostGlobalNames.has(capture) && !validatedPrivateDomainNames.has(capture) && !validatedPublicDomainNames.has(capture) && !variableStoreNames.has(capture) && !promptStoreNames.has(capture));
  if (unresolvedCaptures.length > 0) reasons.push(`Captures bindings that cannot be rewritten as module dependencies: ${unresolvedCaptures.join(', ')}.`);
  const unsafeMutations = unsafeMutationNames(symbol);
  if (unsafeMutations.length > 0) reasons.push(`Mutates captured bindings: ${unsafeMutations.join(', ')}.`);
  if (symbol.hostEffects.asyncModelNetwork.length > 0) reasons.push(`Uses async/model/network APIs: ${symbol.hostEffects.asyncModelNetwork.join(', ')}.`);
  if (symbol.hostEffects.dynamicEnvironment.length > 0) reasons.push(`Uses dynamic environment APIs: ${symbol.hostEffects.dynamicEnvironment.join(', ')}.`);
  return reasons.length === 0 ? ['Domain candidate was not selected for generation.'] : reasons;
}

function publicDomainBlockedReasons(
  publicGlobal: RisuLuaModuleTablePublicGlobalFact,
  symbol: RisuLuaModuleTableLexicalSymbolFact | undefined,
  domainGeneration: RisuLuaModuleTableDomainGenerationOption,
  unsafeReason?: { code: RisuLuaModuleTableClassificationCode; evidence: string[] },
): string[] {
  if (domainGeneration === 'report') return ['Domain generation is report-only by default.'];
  if (!isPublicDomainCandidate(publicGlobal)) return ['Public global is classified as host/async infrastructure rather than domain.'];
  if (symbol === undefined) return ['Missing lexical symbol for public domain function.'];
  if (unsafeReason !== undefined) return unsafeReason.evidence;
  const reasons: string[] = [];
  if (publicGlobal.hostEffects.asyncModelNetwork.length > 0) reasons.push(`Uses async/model/network APIs: ${publicGlobal.hostEffects.asyncModelNetwork.join(', ')}.`);
  if (publicGlobal.hostEffects.dynamicEnvironment.length > 0) reasons.push(`Uses dynamic environment APIs: ${publicGlobal.hostEffects.dynamicEnvironment.join(', ')}.`);
  return reasons.length === 0 ? ['Public domain function was not selected for generation.'] : reasons;
}

function isValidatedPrivateDomainFunction(
  symbol: RisuLuaModuleTableLexicalSymbolFact,
  validatedPrivateDomainNames: Set<string>,
): boolean {
  return validatedPrivateDomainNames.has(symbol.originalName);
}

function isValidatedPublicDomainFunction(publicGlobal: RisuLuaModuleTablePublicGlobalFact): boolean {
  return publicGlobal.hostEffects.asyncModelNetwork.length === 0
    && publicGlobal.hostEffects.dynamicEnvironment.length === 0;
}

function isPublicDomainCandidate(publicGlobal: RisuLuaModuleTablePublicGlobalFact): boolean {
  return publicGlobal.wrapperKind === 'plain-function' && !isStrictHostGlobalName(publicGlobal.name);
}

function isStrictHostGlobalName(name: string): boolean {
  if (name === 'setPhase') return false;
  return /^(?:set[A-Z]|toggle[A-Z]|skill_|appendComma$|appendPipe$|safeGet$|resetTargetState$|classifySensitivity$|describeAlertLocal$|getSensitivityArousalBonus$)/.test(name);
}

function collectCommonHelperClosureNames(symbols: RisuLuaModuleTableLexicalSymbolFact[]): Set<string> {
  const extractable = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const symbol of symbols) {
      if (extractable.has(symbol.originalName)) continue;
      if (!isStrictCommonHelperName(symbol.originalName)) continue;
      if (!isCommonHelperEffectsSafe(symbol)) continue;
      if (!symbol.captures.every((capture) => extractable.has(capture))) continue;
      extractable.add(symbol.originalName);
      changed = true;
    }
  }

  return extractable;
}

function collectSafeButtonCaptureNames(
  symbols: RisuLuaModuleTableLexicalSymbolFact[],
  publicGlobals: RisuLuaModuleTablePublicGlobalFact[],
  extractableCommonHelperNames: Set<string>,
  validatedPrivateDomainNames: Set<string>,
  domainGeneration: RisuLuaModuleTableDomainGenerationOption,
  rewriteablePublicHostGlobalNames: Set<string>,
  variableStoreNames: Set<string>,
  promptStoreNames: Set<string>,
): Set<string> {
  const names = new Set([...extractableCommonHelperNames, ...validatedPrivateDomainNames, ...rewriteablePublicHostGlobalNames, ...variableStoreNames, ...promptStoreNames]);
  if (domainGeneration !== 'validated') return names;

  for (const publicGlobal of publicGlobals) {
    const symbol = findSymbolForPublicGlobal(symbols, publicGlobal);
    if (symbol === undefined) continue;
    if (!isPublicDomainCandidate(publicGlobal)) continue;
    if (!isValidatedPublicDomainFunction(publicGlobal)) continue;
    names.add(publicGlobal.name);
  }

  return names;
}

function collectRewriteablePublicHostGlobalNames(
  symbols: RisuLuaModuleTableLexicalSymbolFact[],
  publicGlobals: RisuLuaModuleTablePublicGlobalFact[],
  publicGlobalsByName: Map<string, RisuLuaModuleTablePublicGlobalFact[]>,
  unsafePublicNames: Map<string, { code: RisuLuaModuleTableClassificationCode; evidence: string[] }>,
): Set<string> {
  const names = new Set<string>();
  for (const publicGlobal of publicGlobals) {
    if (unsafePublicNames.has(publicGlobal.name)) continue;
    if ((publicGlobalsByName.get(publicGlobal.name)?.length ?? 0) !== 1) continue;
    if (unsafePublicDomainGenerationReason(findSymbolForPublicGlobal(symbols, publicGlobal)) !== undefined) continue;
    names.add(publicGlobal.name);
  }
  return names;
}

function collectValidatedPublicDomainNames(
  symbols: RisuLuaModuleTableLexicalSymbolFact[],
  publicGlobals: RisuLuaModuleTablePublicGlobalFact[],
  publicGlobalsByName: Map<string, RisuLuaModuleTablePublicGlobalFact[]>,
  unsafePublicNames: Map<string, { code: RisuLuaModuleTableClassificationCode; evidence: string[] }>,
  domainGeneration: RisuLuaModuleTableDomainGenerationOption,
): Set<string> {
  const names = new Set<string>();
  if (domainGeneration !== 'validated') return names;

  for (const publicGlobal of publicGlobals) {
    if (!isPublicDomainCandidate(publicGlobal)) continue;
    if (!isValidatedPublicDomainFunction(publicGlobal)) continue;
    if (unsafePublicNames.has(publicGlobal.name)) continue;
    if ((publicGlobalsByName.get(publicGlobal.name)?.length ?? 0) !== 1) continue;
    if (unsafePublicGlobalReason(findSymbolForPublicGlobal(symbols, publicGlobal)) !== undefined) continue;
    names.add(publicGlobal.name);
  }

  return names;
}

function collectValidatedPrivateDomainNames(
  symbols: RisuLuaModuleTableLexicalSymbolFact[],
  extractableCommonHelperNames: Set<string>,
  rewriteablePublicHostGlobalNames: Set<string>,
  validatedPublicDomainNames: Set<string>,
  domainGeneration: RisuLuaModuleTableDomainGenerationOption,
  variableStoreNames: Set<string>,
  promptStoreNames: Set<string>,
): Set<string> {
  const names = new Set<string>();
  if (domainGeneration !== 'validated') return names;

  let changed = true;
  while (changed) {
    changed = false;
    for (const symbol of symbols) {
      if (names.has(symbol.originalName)) continue;
      if (symbol.declarationKind !== 'top-level-local-function') continue;
      if (unsafeMutationNames(symbol).length > 0) continue;
      if (symbol.hostEffects.asyncModelNetwork.length > 0) continue;
      if (symbol.hostEffects.dynamicEnvironment.length > 0) continue;
      if (!symbol.captures.every((capture) => extractableCommonHelperNames.has(capture) || rewriteablePublicHostGlobalNames.has(capture) || names.has(capture) || validatedPublicDomainNames.has(capture) || variableStoreNames.has(capture) || promptStoreNames.has(capture))) continue;
      names.add(symbol.originalName);
      changed = true;
    }
  }

  return names;
}

function unsafePublicDomainGenerationReason(symbol: RisuLuaModuleTableLexicalSymbolFact | undefined): { code: RisuLuaModuleTableClassificationCode; evidence: string[] } | undefined {
  if (symbol === undefined) return { code: 'preserve:ambiguous', evidence: ['Missing lexical symbol for public global.'] };
  if (symbol.hostEffects.dynamicEnvironment.length > 0) return { code: 'preserve:dynamic-global-reference-risk', evidence: [`Dynamic environment usage: ${symbol.hostEffects.dynamicEnvironment.join(', ')}.`] };
  return undefined;
}

function isCommonHelperEffectsSafe(symbol: RisuLuaModuleTableLexicalSymbolFact): boolean {
  return unsafeMutationNames(symbol).length === 0
    && symbol.hostEffects.writes.length === 0
    && symbol.hostEffects.uiInteraction.length === 0
    && symbol.hostEffects.asyncModelNetwork.length === 0
    && symbol.hostEffects.dynamicEnvironment.length === 0;
}

function unsafeMutationNames(symbol: RisuLuaModuleTableLexicalSymbolFact): string[] {
  return uniqueSorted(symbol.mutations
    .filter((mutation) => mutation.mutatesCapturedBinding || mutation.mutatesCapturedTable)
    .map((mutation) => mutation.accessPath ?? mutation.name));
}

function isStrictCommonHelperName(name: string): boolean {
  return /(?:trim|clamp|split|join|normalize|format|escape|unescape)/i.test(name)
    || /^(?:safeGet|appendComma|appendPipe|to[A-Z]|from[A-Z]|is[A-Z]|has[A-Z])/.test(name);
}

function domainFunctionPath(name: string): string {
  return `lua/domain/${toSnakeCase(name)}.risulua`;
}

function collectButtonActionNames(sources: RisuLuaModuleTableButtonActionSourceInput[]): Set<string> {
  const names = new Set<string>();
  const attributePattern = /\brisu-trigger\s*=\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1/g;
  const cbsButtonPattern = /\{\{\s*button\s*::([\s\S]*?)\}\}/g;
  for (const entry of sources) {
    const source = typeof entry === 'string' ? entry : entry.source;
    let attributeMatch = attributePattern.exec(source);
    while (attributeMatch !== null) {
      names.add(attributeMatch[2]);
      attributeMatch = attributePattern.exec(source);
    }
    let cbsButtonMatch = cbsButtonPattern.exec(source);
    while (cbsButtonMatch !== null) {
      const triggerName = cbsButtonTriggerName(cbsButtonMatch[1]);
      if (triggerName !== undefined) names.add(triggerName);
      cbsButtonMatch = cbsButtonPattern.exec(source);
    }
  }
  return names;
}

function cbsButtonTriggerName(buttonBody: string): string | undefined {
  const segments = buttonBody.split('::').map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  const triggerName = segments.at(-1);
  return triggerName !== undefined && /^[A-Za-z_][A-Za-z0-9_]*$/.test(triggerName) ? triggerName : undefined;
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

function runtimeHandlerPath(handlerName: string): string {
  return RUNTIME_HANDLER_MODULES[handlerName] ?? `lua/runtime/${toSnakeCase(handlerName.replace(/^on/, ''))}.risulua`;
}

function modulePathToRequireId(modulePath: string): string {
  return modulePath.replace(/^lua\//, '').replace(/\.risulua$/, '').replace(/\//g, '.');
}

function aliasForModulePath(modulePath: string): string {
  if (modulePath === RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH) return HOST_GLOBAL_ALIAS;
  if (modulePath === RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH) return DUPLICATE_GLOBALS_ALIAS;
  if (modulePath === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH) return ASYNC_ACTIONS_ALIAS;
  if (modulePath === RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH) return BUTTON_ACTIONS_ALIAS;
  if (modulePath === RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH) return '__local_helpers';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH) return '__runtime_output';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH) return '__runtime_input';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_START_PATH) return '__runtime_start';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH) return '__runtime_button';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH) return '__runtime_listen_edit';

  if (modulePath.startsWith('lua/domain/')) return `__domain_${modulePath.split('/').at(-1)?.replace(/\.risulua$/, '') ?? 'module'}`;

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
  if (modulePath === RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH || modulePath.startsWith('lua/button_actions/')) return 'button-action';
  if (modulePath === RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH || modulePath === RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH || modulePath === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH) return 'host-global';
  if (modulePath.startsWith('lua/runtime/')) return 'runtime-handler';
  if (modulePath.startsWith('lua/domain/')) return 'domain-function';
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
  for (const candidate of candidates) byName.set(candidate.name, candidate);
  return [...byName.values()];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}
