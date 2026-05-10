import { createEmptyRisuLuaModuleTableHostEffects, type RisuLuaModuleTableDeclarationKind, type RisuLuaModuleTableHostEffects } from './module-table-contracts';
import type { RisuLuaModuleTableParserRange } from './module-table-parser';
import { buildLineStarts, lineAtOffset } from '../shared/range-utils';
import type { LuaSourceRange } from '../shared/types';
import {
  addUnique,
  GLOBAL_IGNORE_NAMES,
  isDynamicEnvironmentName,
  isHostWriteName,
  recordHostEffect,
  summarizeHostEffects,
} from './module-table-analyzer-host-effects';
import {
  baseIdentifierName,
  childrenOf,
  expressionName,
  functionLikeInitializer,
  getNodeRange,
  isFunctionDeclaration,
  parseLuaBody,
  type LuaAssignmentStatement,
  type LuaCallExpression,
  type LuaCallStatement,
  type LuaFunctionDeclaration,
  type LuaIdentifier,
  type LuaIndexExpression,
  type LuaLocalStatement,
  type LuaMemberExpression,
  type LuaNode,
} from './module-table-analyzer-lua-ast';
import type {
  AnalyzerState,
  ExecutableRangeIndex,
  FunctionAnalysis,
  HandlerContext,
  RisuLuaModuleTableAnalyzerInput,
  RisuLuaModuleTableAnalyzerResult,
  RisuLuaModuleTableCallSiteFact,
  RisuLuaModuleTableLexicalSymbolFact,
  RisuLuaModuleTableMutationFact,
  RisuLuaModuleTablePublicGlobalKind,
  RisuLuaModuleTableReferenceFact,
  RisuLuaModuleTableRuntimeRootKind,
  RisuLuaModuleTableScopeFact,
  RisuLuaModuleTableScopeKind,
  RisuLuaModuleTableWrapperKind,
  ScopeFrame,
} from './module-table-analyzer-types';

export type {
  RisuLuaModuleTableAnalyzerInput,
  RisuLuaModuleTableAnalyzerResult,
  RisuLuaModuleTableCallSiteFact,
  RisuLuaModuleTableLexicalSymbolFact,
  RisuLuaModuleTableMutationFact,
  RisuLuaModuleTableNestedHandlerHelperFact,
  RisuLuaModuleTableProceduralBlockFact,
  RisuLuaModuleTablePublicGlobalFact,
  RisuLuaModuleTablePublicGlobalKind,
  RisuLuaModuleTableReferenceFact,
  RisuLuaModuleTableRuntimeRootFact,
  RisuLuaModuleTableRuntimeRootKind,
  RisuLuaModuleTableScopeFact,
  RisuLuaModuleTableScopeKind,
  RisuLuaModuleTableWrapperKind,
} from './module-table-analyzer-types';

const RUNTIME_HANDLER_NAMES = new Set(['onOutput', 'onInput', 'onStart', 'onButtonClick']);

export function analyzeRisuLuaModuleTable(input: RisuLuaModuleTableAnalyzerInput): RisuLuaModuleTableAnalyzerResult {
  if (!input.parseResult.ok) return emptyAnalyzerResult([`Parser failed with ${input.parseResult.syntaxErrors.length} syntax error(s).`]);

  const state: AnalyzerState = {
    source: input.source,
    lineStarts: buildLineStarts(input.source),
    executableRanges: input.parseResult.executableRanges,
    executableRangeIndex: buildExecutableRangeIndex(input.parseResult.executableRanges),
    scopes: [],
    lexicalSymbols: [],
    runtimeRoots: [],
    publicGlobals: [],
    nestedHandlerHelpers: [],
    proceduralBlocks: [],
    symbolSequence: 0,
    scopeSequence: 0,
  };

  let body: LuaNode[];
  try {
    body = parseLuaBody(input.source);
  } catch (error) {
    return emptyAnalyzerResult([error instanceof Error ? error.message : 'Lua parse failed during analyzer pass.']);
  }

  const moduleScope = createScope(state, 'module', 'module', undefined, sourceRangeFromOffsets(state, 0, input.source.length));
  for (const statement of body) analyzeTopLevelStatement(statement, state, moduleScope);

  return {
    ok: true,
    scopes: state.scopes,
    lexicalSymbols: state.lexicalSymbols,
    runtimeRoots: state.runtimeRoots,
    publicGlobals: state.publicGlobals,
    nestedHandlerHelpers: state.nestedHandlerHelpers,
    proceduralBlocks: state.proceduralBlocks,
    hostEffects: summarizeHostEffects([
      ...state.lexicalSymbols.map((symbol) => symbol.hostEffects),
      ...state.runtimeRoots.map((root) => root.hostEffects),
      ...state.publicGlobals.map((global) => global.hostEffects),
      ...state.proceduralBlocks.map((block) => block.hostEffects),
    ]),
    diagnostics: [],
  };
}

function analyzeTopLevelStatement(statement: LuaNode, state: AnalyzerState, moduleScope: ScopeFrame): void {
  if (statement.type === 'FunctionDeclaration') {
    const declaration = statement as LuaFunctionDeclaration;
    const name = expressionName(declaration.identifier);
    if (name === undefined) return;
    moduleScope.declared.add(name);
    const isRuntimeRoot = RUNTIME_HANDLER_NAMES.has(name);
    const declarationKind: RisuLuaModuleTableDeclarationKind = declaration.isLocal ? 'top-level-local-function' : 'top-level-global-function';
    const handler = isRuntimeRoot ? handlerContext(name, 'handler', declaration, state) : undefined;
    const symbol = addFunctionSymbol(state, declaration, name, declarationKind, moduleScope, 'plain-function', handler);
    if (isRuntimeRoot) addRuntimeRoot(state, name, 'handler-function', 'plain-function', declaration, symbol.hostEffects);
    if (!declaration.isLocal && !isRuntimeRoot) addPublicGlobal(state, name, 'function-declaration', 'plain-function', declaration, symbol.hostEffects);
    return;
  }

  if (statement.type === 'AssignmentStatement') {
    analyzeTopLevelAssignment(statement as LuaAssignmentStatement, state, moduleScope);
    return;
  }

  if (statement.type === 'CallStatement' && maybeAnalyzeListenEditRoot(statement as LuaCallStatement, state, moduleScope)) return;
  if (statement.type === 'LocalStatement') {
    for (const variable of (statement as LuaLocalStatement).variables) moduleScope.declared.add(variable.name);
  }
  addProceduralBlock(state, statement);
}

function maybeAnalyzeListenEditRoot(statement: LuaCallStatement, state: AnalyzerState, moduleScope: ScopeFrame): boolean {
  const call = statement.expression;
  if (expressionName(call.base) !== 'listenEdit') return false;
  const effects = createEmptyRisuLuaModuleTableHostEffects();
  addUnique(effects.dynamicEnvironment, 'listenEdit');
  addRuntimeRoot(state, 'listenEdit', 'listener-registration', 'listen-edit-callback', statement, effects);
  const callback = call.arguments.find(isFunctionDeclaration);
  if (callback !== undefined) analyzeAnonymousHandler(state, callback, moduleScope, handlerContext('listenEdit', 'listener', statement, state), 'listen-edit-callback');
  return true;
}

function analyzeTopLevelAssignment(statement: LuaAssignmentStatement, state: AnalyzerState, moduleScope: ScopeFrame): void {
  for (const variable of statement.variables) {
    const assignedName = expressionName(variable);
    if (assignedName !== undefined) moduleScope.declared.add(assignedName);
  }

  const firstName = expressionName(statement.variables[0]);
  const wrapped = functionLikeInitializer(statement.init[0]);
  if (firstName === undefined || wrapped === undefined) {
    addProceduralBlock(state, statement);
    return;
  }

  const isRuntimeRoot = RUNTIME_HANDLER_NAMES.has(firstName);
  const handler = isRuntimeRoot ? handlerContext(firstName, 'handler', statement, state) : undefined;
  const symbol = addFunctionSymbol(state, wrapped.functionNode, firstName, 'top-level-global-assignment', moduleScope, wrapped.wrapperKind, handler);
  if (isRuntimeRoot) {
    const rootKind: RisuLuaModuleTableRuntimeRootKind = wrapped.wrapperKind === 'async-wrapper' ? 'async-handler-assignment' : 'handler-assignment';
    addRuntimeRoot(state, firstName, rootKind, wrapped.wrapperKind, statement, symbol.hostEffects);
  } else {
    const globalKind: RisuLuaModuleTablePublicGlobalKind = wrapped.wrapperKind === 'async-wrapper' ? 'async-function-assignment' : 'function-assignment';
    addPublicGlobal(state, firstName, globalKind, wrapped.wrapperKind, statement, symbol.hostEffects);
  }
}

function addFunctionSymbol(
  state: AnalyzerState,
  declaration: LuaFunctionDeclaration,
  name: string,
  declarationKind: RisuLuaModuleTableDeclarationKind,
  parentScope: ScopeFrame,
  wrapperKind: RisuLuaModuleTableWrapperKind,
  handler?: HandlerContext,
): RisuLuaModuleTableLexicalSymbolFact {
  const scopeKind: RisuLuaModuleTableScopeKind = handler === undefined ? 'function' : handler.kind;
  const scope = createScope(state, scopeKind, name, parentScope, sourceRangeForNode(state, declaration));
  const analysis = analyzeFunctionBody(state, declaration, scope);
  const symbol = buildSymbolFact(state, declaration, name, declarationKind, parentScope, scope, wrapperKind, analysis);
  state.lexicalSymbols.push(symbol);
  addNestedHandlerHelpers(state, scope, handler, symbol.callSites);
  return symbol;
}

function buildSymbolFact(
  state: AnalyzerState,
  declaration: LuaFunctionDeclaration,
  name: string,
  declarationKind: RisuLuaModuleTableDeclarationKind,
  parentScope: ScopeFrame,
  scope: ScopeFrame,
  wrapperKind: RisuLuaModuleTableWrapperKind,
  analysis: FunctionAnalysis,
): RisuLuaModuleTableLexicalSymbolFact {
  const symbol: RisuLuaModuleTableLexicalSymbolFact = {
    id: `symbol:${state.symbolSequence}:${name}`,
    originalName: name,
    declarationKind,
    scopeId: scope.fact.id,
    parentScopeId: parentScope.fact.id,
    sourceRange: sourceRangeForNode(state, declaration),
    wrapperKind,
    parameters: analysis.parameters,
    localDeclarations: analysis.localDeclarations,
    references: analysis.references,
    captures: analysis.captures,
    mutations: analysis.mutations,
    mutates: analysis.mutates,
    hostEffects: analysis.hostEffects,
    callSites: analysis.callSites,
    executableRange: findExecutableRange(state, declaration),
  };
  state.symbolSequence += 1;
  return symbol;
}

function analyzeAnonymousHandler(
  state: AnalyzerState,
  declaration: LuaFunctionDeclaration,
  parentScope: ScopeFrame,
  handler: HandlerContext,
  wrapperKind: RisuLuaModuleTableWrapperKind,
): void {
  const scope = createScope(state, handler.kind, handler.name, parentScope, sourceRangeForNode(state, declaration));
  const analysis = analyzeFunctionBody(state, declaration, scope);
  addNestedHandlerHelpers(state, scope, handler, analysis.callSites, wrapperKind);
}

function addNestedHandlerHelpers(
  state: AnalyzerState,
  parentScope: ScopeFrame,
  handler: HandlerContext | undefined,
  parentCallSites: RisuLuaModuleTableCallSiteFact[],
  wrapperKindOverride?: RisuLuaModuleTableWrapperKind,
): void {
  if (handler === undefined) return;
  const nestedSymbols = state.lexicalSymbols.filter((candidate) => candidate.parentScopeId === parentScope.fact.id && candidate.declarationKind === 'nested-local-function');
  for (const nested of nestedSymbols) {
    if (state.nestedHandlerHelpers.some((helper) => helper.symbolId === nested.id)) continue;
    const matchingCallSites = parentCallSites.filter((callSite) => callSite.name === nested.originalName);
    state.nestedHandlerHelpers.push({
      symbolId: nested.id,
      name: nested.originalName,
      parentHandler: handler,
      wrapperKind: wrapperKindOverride ?? nested.wrapperKind,
      sourceRange: nested.sourceRange,
      parameters: nested.parameters,
      captures: nested.captures,
      mutations: nested.mutations,
      hostEffects: nested.hostEffects,
      callSites: matchingCallSites.length > 0 ? matchingCallSites : nested.callSites,
    });
  }
}

function analyzeFunctionBody(state: AnalyzerState, declaration: LuaFunctionDeclaration, scope: ScopeFrame): FunctionAnalysis {
  const parameters = declaration.parameters.map((parameter) => parameter.name);
  for (const parameter of parameters) {
    scope.declared.add(parameter);
    scope.functionParameters.add(parameter);
  }

  const localDeclarations: string[] = [];
  const references: RisuLuaModuleTableReferenceFact[] = [];
  const mutations: RisuLuaModuleTableMutationFact[] = [];
  const callSites: RisuLuaModuleTableCallSiteFact[] = [];
  const hostEffects = createEmptyRisuLuaModuleTableHostEffects();
  analyzeStatementsInScope(declaration.body, state, scope, localDeclarations, references, mutations, callSites, hostEffects);

  const captures = uniqueSorted(references.filter((reference) => reference.resolvedScopeId !== undefined && reference.resolvedScopeId !== scope.fact.id).map((reference) => reference.name));
  return { parameters, localDeclarations: uniqueSorted(localDeclarations), references, captures, mutations, mutates: uniqueSorted(mutations.map((mutation) => mutation.accessPath ?? mutation.name)), hostEffects, callSites };
}

function analyzeStatementsInScope(
  statements: LuaNode[],
  state: AnalyzerState,
  scope: ScopeFrame,
  localDeclarations: string[],
  references: RisuLuaModuleTableReferenceFact[],
  mutations: RisuLuaModuleTableMutationFact[],
  callSites: RisuLuaModuleTableCallSiteFact[],
  hostEffects: RisuLuaModuleTableHostEffects,
): void {
  for (const statement of statements) analyzeStatementInScope(statement, state, scope, localDeclarations, references, mutations, callSites, hostEffects);
}

function analyzeStatementInScope(
  node: LuaNode,
  state: AnalyzerState,
  scope: ScopeFrame,
  localDeclarations: string[],
  references: RisuLuaModuleTableReferenceFact[],
  mutations: RisuLuaModuleTableMutationFact[],
  callSites: RisuLuaModuleTableCallSiteFact[],
  hostEffects: RisuLuaModuleTableHostEffects,
): void {
  if (node.type === 'FunctionDeclaration') {
    const nested = node as LuaFunctionDeclaration;
    const nestedName = expressionName(nested.identifier);
    if (nestedName !== undefined && nested.isLocal) {
      scope.declared.add(nestedName);
      localDeclarations.push(nestedName);
      addFunctionSymbol(state, nested, nestedName, 'nested-local-function', scope, 'plain-function');
      return;
    }
  }
  if (node.type === 'LocalStatement') {
    analyzeLocalStatement(node as LuaLocalStatement, state, scope, localDeclarations, references, mutations, callSites, hostEffects);
    return;
  }
  if (node.type === 'IfStatement') {
    for (const clause of nodeArrayProperty(node, 'clauses')) {
      for (const condition of conditionNodes(clause)) analyzeExpression(condition, state, scope, references, mutations, callSites, hostEffects);
      analyzeStatementsInScope(nodeArrayProperty(clause, 'body'), state, scope, localDeclarations, references, mutations, callSites, hostEffects);
    }
    return;
  }
  if (node.type === 'ForNumericStatement') {
    for (const expression of ['start', 'end', 'step'].flatMap((key) => optionalNodeProperty(node, key))) {
      analyzeExpression(expression, state, scope, references, mutations, callSites, hostEffects);
    }
    declareOptionalNodeName(nodeProperty(node, 'variable'), scope, localDeclarations);
    analyzeStatementsInScope(nodeArrayProperty(node, 'body'), state, scope, localDeclarations, references, mutations, callSites, hostEffects);
    return;
  }
  if (node.type === 'ForGenericStatement') {
    for (const iterator of nodeArrayProperty(node, 'iterators')) analyzeExpression(iterator, state, scope, references, mutations, callSites, hostEffects);
    for (const variable of nodeArrayProperty(node, 'variables')) declareOptionalNodeName(variable, scope, localDeclarations);
    analyzeStatementsInScope(nodeArrayProperty(node, 'body'), state, scope, localDeclarations, references, mutations, callSites, hostEffects);
    return;
  }
  if (node.type === 'DoStatement' || node.type === 'WhileStatement' || node.type === 'RepeatStatement') {
    for (const condition of conditionNodes(node)) analyzeExpression(condition, state, scope, references, mutations, callSites, hostEffects);
    analyzeStatementsInScope(nodeArrayProperty(node, 'body'), state, scope, localDeclarations, references, mutations, callSites, hostEffects);
    return;
  }
  if (node.type === 'AssignmentStatement') {
    analyzeAssignmentStatement(node as LuaAssignmentStatement, state, scope, references, mutations, callSites, hostEffects);
    return;
  }
  analyzeExpression(node, state, scope, references, mutations, callSites, hostEffects);
}

function declareOptionalNodeName(node: LuaNode | undefined, scope: ScopeFrame, localDeclarations: string[]): void {
  const name = node?.type === 'Identifier' ? (node as LuaIdentifier).name : undefined;
  if (name === undefined) return;
  scope.declared.add(name);
  localDeclarations.push(name);
}

function optionalNodeProperty(node: LuaNode, key: string): LuaNode[] {
  const value = nodeRecord(node)[key];
  return isLuaNodeValue(value) ? [value] : [];
}

function conditionNodes(node: LuaNode): LuaNode[] {
  return ['condition', 'expression', 'test']
    .flatMap((key) => optionalNodeProperty(node, key));
}

function nodeProperty(node: LuaNode, key: string): LuaNode | undefined {
  const value = nodeRecord(node)[key];
  return isLuaNodeValue(value) ? value : undefined;
}

function nodeArrayProperty(node: LuaNode, key: string): LuaNode[] {
  const value = nodeRecord(node)[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isLuaNodeValue);
}

function nodeRecord(node: LuaNode): Record<string, unknown> {
  return node as Record<string, unknown>;
}

function isLuaNodeValue(value: unknown): value is LuaNode {
  return typeof value === 'object' && value !== null && typeof (value as LuaNode).type === 'string';
}

function analyzeLocalStatement(local: LuaLocalStatement, state: AnalyzerState, scope: ScopeFrame, localDeclarations: string[], references: RisuLuaModuleTableReferenceFact[], mutations: RisuLuaModuleTableMutationFact[], callSites: RisuLuaModuleTableCallSiteFact[], hostEffects: RisuLuaModuleTableHostEffects): void {
  for (const variable of local.variables) {
    scope.declared.add(variable.name);
    localDeclarations.push(variable.name);
  }
  for (const init of local.init) analyzeExpression(init, state, scope, references, mutations, callSites, hostEffects);
}

function analyzeAssignmentStatement(assignment: LuaAssignmentStatement, state: AnalyzerState, scope: ScopeFrame, references: RisuLuaModuleTableReferenceFact[], mutations: RisuLuaModuleTableMutationFact[], callSites: RisuLuaModuleTableCallSiteFact[], hostEffects: RisuLuaModuleTableHostEffects): void {
  for (const variable of assignment.variables) {
    const name = baseIdentifierName(variable);
    if (name === undefined) continue;
    const resolved = resolveBinding(scope, name);
    mutations.push({
      name,
      sourceRange: sourceRangeForNode(state, variable),
      scopeId: scope.fact.id,
      resolvedScopeId: resolved?.fact.id,
      accessPath: expressionName(variable),
      mutatesCapturedBinding: resolved !== undefined && resolved.fact.id !== scope.fact.id,
      mutatesCapturedTable: resolved !== undefined && resolved.fact.id !== scope.fact.id && variable.type !== 'Identifier',
    });
    if (isHostWriteName(name)) addUnique(hostEffects.writes, name);
    if (isDynamicEnvironmentName(name)) addUnique(hostEffects.dynamicEnvironment, name);
  }
  for (const init of assignment.init) analyzeExpression(init, state, scope, references, mutations, callSites, hostEffects);
}

function analyzeExpression(node: LuaNode, state: AnalyzerState, scope: ScopeFrame, references: RisuLuaModuleTableReferenceFact[], mutations: RisuLuaModuleTableMutationFact[], callSites: RisuLuaModuleTableCallSiteFact[], hostEffects: RisuLuaModuleTableHostEffects): void {
  if (node.type === 'Identifier') {
    recordReference((node as LuaIdentifier).name, node, state, scope, references, hostEffects);
    return;
  }
  if (node.type === 'CallExpression') {
    analyzeCallExpression(node as LuaCallExpression, state, scope, references, mutations, callSites, hostEffects);
    return;
  }
  if (node.type === 'FunctionDeclaration') {
    const nestedScope = createScope(state, 'function', '<anonymous>', scope, sourceRangeForNode(state, node));
    analyzeFunctionBody(state, node as LuaFunctionDeclaration, nestedScope);
    return;
  }
  if (node.type === 'MemberExpression') {
    analyzeExpression((node as LuaMemberExpression).base, state, scope, references, mutations, callSites, hostEffects);
    return;
  }
  if (node.type === 'IndexExpression') {
    const index = node as LuaIndexExpression;
    analyzeExpression(index.base, state, scope, references, mutations, callSites, hostEffects);
    analyzeExpression(index.index, state, scope, references, mutations, callSites, hostEffects);
    return;
  }
  if (node.type === 'TableConstructorExpression') {
    for (const field of nodeArrayProperty(node, 'fields')) {
      const key = nodeProperty(field, 'key');
      const value = nodeProperty(field, 'value');
      if (key !== undefined && key.type !== 'Identifier') analyzeExpression(key, state, scope, references, mutations, callSites, hostEffects);
      if (value !== undefined) analyzeExpression(value, state, scope, references, mutations, callSites, hostEffects);
    }
    return;
  }
  for (const child of childrenOf(node)) analyzeExpression(child, state, scope, references, mutations, callSites, hostEffects);
}

function analyzeCallExpression(call: LuaCallExpression, state: AnalyzerState, scope: ScopeFrame, references: RisuLuaModuleTableReferenceFact[], mutations: RisuLuaModuleTableMutationFact[], callSites: RisuLuaModuleTableCallSiteFact[], hostEffects: RisuLuaModuleTableHostEffects): void {
  const callName = expressionName(call.base);
  if (callName !== undefined) {
    callSites.push({ name: callName, sourceRange: sourceRangeForNode(state, call), scopeId: scope.fact.id });
    recordHostEffect(callName, hostEffects);
  }
  analyzeExpression(call.base, state, scope, references, mutations, callSites, hostEffects);
  for (const argument of call.arguments) analyzeExpression(argument, state, scope, references, mutations, callSites, hostEffects);
}

function recordReference(name: string, node: LuaNode, state: AnalyzerState, scope: ScopeFrame, references: RisuLuaModuleTableReferenceFact[], hostEffects: RisuLuaModuleTableHostEffects): void {
  if (GLOBAL_IGNORE_NAMES.has(name)) return;
  const resolved = resolveBinding(scope, name);
  references.push({ name, sourceRange: sourceRangeForNode(state, node), scopeId: scope.fact.id, resolvedScopeId: resolved?.fact.id });
  recordHostEffect(name, hostEffects);
}

function addRuntimeRoot(state: AnalyzerState, name: string, kind: RisuLuaModuleTableRuntimeRootKind, wrapperKind: RisuLuaModuleTableWrapperKind, node: LuaNode, hostEffects: RisuLuaModuleTableHostEffects): void {
  state.runtimeRoots.push({ id: `root:${state.runtimeRoots.length}:${name}`, name, kind, wrapperKind, sourceRange: sourceRangeForNode(state, node), hostEffects });
}

function addPublicGlobal(state: AnalyzerState, name: string, kind: RisuLuaModuleTablePublicGlobalKind, wrapperKind: RisuLuaModuleTableWrapperKind, node: LuaNode, hostEffects: RisuLuaModuleTableHostEffects): void {
  state.publicGlobals.push({ id: `public:${state.publicGlobals.length}:${name}`, name, kind, sourceRange: sourceRangeForNode(state, node), hostVisible: true, wrapperKind, hostEffects });
}

function addProceduralBlock(state: AnalyzerState, node: LuaNode): void {
  const effects = createEmptyRisuLuaModuleTableHostEffects();
  analyzeExpression(node, state, scopeFrameFromFact(state.scopes[0]), [], [], [], effects);
  state.proceduralBlocks.push({ id: `procedural:${state.proceduralBlocks.length}`, name: node.type, sourceRange: sourceRangeForNode(state, node), hostEffects: effects, extractable: false });
}

function createScope(state: AnalyzerState, kind: RisuLuaModuleTableScopeKind, name: string, parent: ScopeFrame | undefined, sourceRange: LuaSourceRange): ScopeFrame {
  const fact: RisuLuaModuleTableScopeFact = { id: `scope:${state.scopeSequence}:${name}`, kind, name, parentId: parent?.fact.id, sourceRange };
  state.scopeSequence += 1;
  state.scopes.push(fact);
  return { fact, parent, declared: new Set(), functionParameters: new Set() };
}

function scopeFrameFromFact(fact: RisuLuaModuleTableScopeFact | undefined): ScopeFrame {
  if (fact === undefined) throw new Error('Module scope must exist before procedural block analysis.');
  return { fact, declared: new Set(), functionParameters: new Set() };
}

function resolveBinding(scope: ScopeFrame, name: string): ScopeFrame | undefined {
  let current: ScopeFrame | undefined = scope;
  while (current !== undefined) {
    if (current.declared.has(name)) return current;
    current = current.parent;
  }
  return undefined;
}

function handlerContext(name: string, kind: 'handler' | 'listener', node: LuaNode, state: AnalyzerState): HandlerContext {
  return { name, kind, sourceRange: sourceRangeForNode(state, node) };
}

function buildExecutableRangeIndex(ranges: RisuLuaModuleTableParserRange[]): ExecutableRangeIndex {
  const exact = new Map<string, RisuLuaModuleTableParserRange>();
  for (const range of ranges) {
    const key = `${range.stringRange.startIndex}:${range.stringRange.endIndex}`;
    if (!exact.has(key)) {
      exact.set(key, range);
    }
  }
  const sorted = [...ranges].sort((a, b) => a.stringRange.startIndex - b.stringRange.startIndex);
  return { exact, sorted };
}

function findExecutableRange(state: AnalyzerState, node: LuaNode): RisuLuaModuleTableParserRange | undefined {
  const range = getNodeRange(node);
  if (range === undefined) return undefined;

  const exactKey = `${range.startOffset}:${range.endOffset}`;
  const exactMatch = state.executableRangeIndex.exact.get(exactKey);
  if (exactMatch !== undefined) return exactMatch;

  return findContainingExecutableRange(state.executableRangeIndex.sorted, range.startOffset, range.endOffset);
}

function findContainingExecutableRange(sortedRanges: RisuLuaModuleTableParserRange[], startOffset: number, endOffset: number): RisuLuaModuleTableParserRange | undefined {
  // Find the insertion point: first range with start > startOffset
  let left = 0;
  let right = sortedRanges.length;
  while (left < right) {
    const mid = (left + right) >>> 1;
    if (sortedRanges[mid].stringRange.startIndex <= startOffset) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // Scan backward from insertion point to find a range that contains [startOffset, endOffset]
  for (let i = left - 1; i >= 0; i--) {
    const candidate = sortedRanges[i];
    if (candidate.stringRange.startIndex <= startOffset && candidate.stringRange.endIndex >= endOffset) {
      return candidate;
    }
  }

  return undefined;
}

function sourceRangeForNode(state: AnalyzerState, node: LuaNode): LuaSourceRange {
  const range = getNodeRange(node) ?? { startOffset: 0, endOffset: 0 };
  return sourceRangeFromOffsets(state, range.startOffset, range.endOffset);
}

function sourceRangeFromOffsets(state: AnalyzerState, startOffset: number, endOffset: number): LuaSourceRange {
  return { startLine: lineAtOffset(startOffset, state.lineStarts), endLine: lineAtOffset(Math.max(startOffset, endOffset - 1), state.lineStarts), startOffset, endOffset };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function emptyAnalyzerResult(diagnostics: string[]): RisuLuaModuleTableAnalyzerResult {
  return { ok: false, scopes: [], lexicalSymbols: [], runtimeRoots: [], publicGlobals: [], nestedHandlerHelpers: [], proceduralBlocks: [], hostEffects: createEmptyRisuLuaModuleTableHostEffects(), diagnostics };
}
