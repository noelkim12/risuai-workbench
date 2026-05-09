import {
  type LuaAstNode,
  type RisuLuaSourceLocation,
  getLocation,
  parseRisuLuaSource,
} from './risulua-forbidden-analyzer';

export const RISULUA_LOCAL_BUDGET_WARNING_THRESHOLD = 150;
export const RISULUA_LOCAL_BUDGET_HIGH_RISK_THRESHOLD = 180;
export const RISULUA_LOCAL_BUDGET_EXCEEDED_THRESHOLD = 190;
export const RISULUA_LOCAL_BUDGET_HARD_LIMIT = 200;

export type RisuLuaLocalBudgetDiagnosticCode =
  | 'local_budget_warning'
  | 'local_budget_high_risk'
  | 'local_budget_exceeded'
  | 'local_budget_hard_limit';

export type RisuLuaLocalBudgetSeverity = 'warning' | 'error';
export type RisuLuaLocalBudgetScopeKind = 'chunk' | 'function';

export interface AnalyzeRisuLuaLocalBudgetOptions {
  code: string;
  filePath: string;
}

export interface RisuLuaLocalBudgetDiagnostic {
  code: RisuLuaLocalBudgetDiagnosticCode;
  severity: RisuLuaLocalBudgetSeverity;
  filePath: string;
  scopeKind: RisuLuaLocalBudgetScopeKind;
  localCount: number;
  threshold: number;
  limit: number;
  location?: RisuLuaSourceLocation;
  scopeLocation?: RisuLuaSourceLocation;
  peakLocation?: RisuLuaSourceLocation;
  message: string;
}

interface LocalScope {
  scopeKind: RisuLuaLocalBudgetScopeKind;
  activeLocalCount: number;
  maxActiveLocalCount: number;
  location?: RisuLuaSourceLocation;
  scopeLocation?: RisuLuaSourceLocation;
  peakLocation?: RisuLuaSourceLocation;
}

const AST_METADATA_KEYS = new Set(['loc', 'range', 'raw', 'comments', 'globals']);
const LUA_NUMERIC_FOR_HIDDEN_LOCAL_COUNT = 3;
const LUA_GENERIC_FOR_HIDDEN_LOCAL_COUNT = 4;

export function analyzeRisuLuaLocalBudget(options: AnalyzeRisuLuaLocalBudgetOptions): RisuLuaLocalBudgetDiagnostic[] {
  const ast = parseRisuLuaSource(options.code);
  const scopes = collectLocalScopes(ast);
  return scopes
    .map((scope) => toBudgetDiagnostic(options.filePath, scope))
    .filter((diagnostic): diagnostic is RisuLuaLocalBudgetDiagnostic => diagnostic !== null)
    .sort(compareBudgetDiagnostics);
}

function collectLocalScopes(ast: LuaAstNode): LocalScope[] {
  const scopes: LocalScope[] = [];
  const body = asNodeArray(ast.body);
  collectScope({ body, scopeKind: 'chunk', scopes, scopeLocation: firstLocation(body) });
  return scopes;
}

function collectScope(options: {
  body: LuaAstNode[];
  scopeKind: RisuLuaLocalBudgetScopeKind;
  scopes: LocalScope[];
  scopeLocation?: RisuLuaSourceLocation;
}): void {
  const scope: LocalScope = {
    scopeKind: options.scopeKind,
    activeLocalCount: 0,
    maxActiveLocalCount: 0,
    scopeLocation: options.scopeLocation ?? firstLocation(options.body),
  };
  options.scopes.push(scope);

  for (const statement of options.body) {
    collectStatementForScope(statement, scope, options.scopes);
  }
}

function collectStatementForScope(statement: LuaAstNode, scope: LocalScope, scopes: LocalScope[]): void {
  if (statement.type === 'LocalStatement') {
    addLocals(scope, asNodeArray(statement.variables).length, firstLocation(asNodeArray(statement.variables)) ?? getLocation(statement) ?? undefined);
    collectNestedFunctionScopes(statement, scopes, new Set(['variables']));
    return;
  }

  if (statement.type === 'FunctionDeclaration') {
    if (statement.isLocal === true && statement.identifier?.type === 'Identifier') {
      addLocals(scope, 1, getLocation(statement.identifier) ?? getLocation(statement) ?? undefined);
    }
    collectFunctionScope(statement, scopes);
    return;
  }

  if (isScopedBlockStatement(statement)) {
    collectBlockBody(statement, scope, scopes);
    collectSameScopeChildren(statement, scope, scopes, new Set(['body']));
    return;
  }

  if (statement.type === 'IfStatement') {
    collectIfStatement(statement, scope, scopes);
    return;
  }

  if (statement.type === 'ForNumericStatement' || statement.type === 'ForGenericStatement') {
    collectLoopStatement(statement, scope, scopes);
    return;
  }

  collectSameScopeChildren(statement, scope, scopes);
}

function collectSameScopeChildren(node: LuaAstNode, scope: LocalScope, scopes: LocalScope[], skipKeys = new Set<string>()): void {
  for (const [key, value] of Object.entries(node)) {
    if (AST_METADATA_KEYS.has(key) || skipKeys.has(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isNode(item)) continue;
        collectChildNode(item, scope, scopes);
      }
      continue;
    }
    if (isNode(value)) collectChildNode(value, scope, scopes);
  }
}

function collectChildNode(node: LuaAstNode, scope: LocalScope, scopes: LocalScope[]): void {
  if (node.type === 'FunctionDeclaration') {
    collectFunctionScope(node, scopes);
    return;
  }
  if (node.type === 'LocalStatement') {
    collectStatementForScope(node, scope, scopes);
    return;
  }
  collectSameScopeChildren(node, scope, scopes);
}

function collectFunctionScope(node: LuaAstNode, scopes: LocalScope[]): void {
  const scope: LocalScope = {
    scopeKind: 'function',
    activeLocalCount: 0,
    maxActiveLocalCount: 0,
    scopeLocation: getLocation(node) ?? undefined,
  };
  scopes.push(scope);
  addLocals(scope, countFunctionParameters(node), firstLocation(getNamedParameters(node)) ?? getLocation(node) ?? undefined);

  for (const statement of asNodeArray(node.body)) {
    collectStatementForScope(statement, scope, scopes);
  }
}

function collectBlockBody(node: LuaAstNode, scope: LocalScope, scopes: LocalScope[]): void {
  const activeBeforeBlock = scope.activeLocalCount;
  for (const statement of asNodeArray(node.body)) {
    collectStatementForScope(statement, scope, scopes);
  }
  scope.activeLocalCount = activeBeforeBlock;
}

function collectIfStatement(node: LuaAstNode, scope: LocalScope, scopes: LocalScope[]): void {
  for (const clause of asNodeArray(node.clauses)) {
    collectBlockBody(clause, scope, scopes);
    collectSameScopeChildren(clause, scope, scopes, new Set(['body']));
  }
}

function collectLoopStatement(node: LuaAstNode, scope: LocalScope, scopes: LocalScope[]): void {
  const activeBeforeLoop = scope.activeLocalCount;
  addLocals(scope, countLoopVariables(node), firstLocation(asNodeArray(node.variables)) ?? firstNodeLocation(node.variable) ?? getLocation(node) ?? undefined);
  for (const statement of asNodeArray(node.body)) {
    collectStatementForScope(statement, scope, scopes);
  }
  scope.activeLocalCount = activeBeforeLoop;
  collectSameScopeChildren(node, scope, scopes, new Set(['body', 'variable', 'variables']));
}

function countLoopVariables(node: LuaAstNode): number {
  if (node.type === 'ForNumericStatement') {
    return (isNode(node.variable) ? 1 : 0) + LUA_NUMERIC_FOR_HIDDEN_LOCAL_COUNT;
  }
  if (node.type === 'ForGenericStatement') {
    return asNodeArray(node.variables).length + LUA_GENERIC_FOR_HIDDEN_LOCAL_COUNT;
  }
  return 0;
}

function countFunctionParameters(node: LuaAstNode): number {
  return getNamedParameters(node).length + (isMethodFunctionDeclaration(node) ? 1 : 0);
}

function getNamedParameters(node: LuaAstNode): LuaAstNode[] {
  return asNodeArray(node.parameters).filter((parameter) => parameter.type === 'Identifier');
}

function isMethodFunctionDeclaration(node: LuaAstNode): boolean {
  return isNode(node.identifier) && node.identifier.type === 'MemberExpression' && node.identifier.indexer === ':';
}

function firstNodeLocation(value: unknown): RisuLuaSourceLocation | undefined {
  return isNode(value) ? getLocation(value) ?? undefined : undefined;
}

function isScopedBlockStatement(node: LuaAstNode): boolean {
  return node.type === 'DoStatement' || node.type === 'WhileStatement' || node.type === 'RepeatStatement';
}

function collectNestedFunctionScopes(node: LuaAstNode, scopes: LocalScope[], skipKeys: Set<string>): void {
  for (const [key, value] of Object.entries(node)) {
    if (AST_METADATA_KEYS.has(key) || skipKeys.has(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) collectNestedFunctionScope(item, scopes);
      continue;
    }
    collectNestedFunctionScope(value, scopes);
  }
}

function collectNestedFunctionScope(value: unknown, scopes: LocalScope[]): void {
  if (!isNode(value)) return;
  if (value.type === 'FunctionDeclaration') {
    collectFunctionScope(value, scopes);
    return;
  }
  collectNestedFunctionScopes(value, scopes, new Set());
}

function addLocals(scope: LocalScope, count: number, location: RisuLuaSourceLocation | undefined): void {
  if (count <= 0) return;
  scope.activeLocalCount += count;
  if (scope.activeLocalCount > scope.maxActiveLocalCount) {
    scope.maxActiveLocalCount = scope.activeLocalCount;
    scope.peakLocation = location;
    scope.location = location;
  }
}

function toBudgetDiagnostic(filePath: string, scope: LocalScope): RisuLuaLocalBudgetDiagnostic | null {
  const budget = classifyLocalBudget(scope.maxActiveLocalCount);
  if (budget === null) return null;
  return {
    code: budget.code,
    severity: budget.severity,
    filePath,
    scopeKind: scope.scopeKind,
    localCount: scope.maxActiveLocalCount,
    threshold: budget.threshold,
    limit: RISULUA_LOCAL_BUDGET_HARD_LIMIT,
    location: scope.peakLocation ?? scope.location,
    scopeLocation: scope.scopeLocation,
    peakLocation: scope.peakLocation ?? scope.location,
    message: `RisuLua generated ${scope.scopeKind} reaches ${scope.maxActiveLocalCount} active locals at ${formatBudgetLocation(scope.peakLocation ?? scope.location)}, exceeding ${budget.threshold} local budget for wasmoon/Lua safety: ${filePath}`,
  };
}

function formatBudgetLocation(location: RisuLuaSourceLocation | undefined): string {
  if (!location) return 'unknown location';
  return `line ${location.line}`;
}

function classifyLocalBudget(localCount: number): { code: RisuLuaLocalBudgetDiagnosticCode; severity: RisuLuaLocalBudgetSeverity; threshold: number } | null {
  if (localCount >= RISULUA_LOCAL_BUDGET_HARD_LIMIT) {
    return { code: 'local_budget_hard_limit', severity: 'error', threshold: RISULUA_LOCAL_BUDGET_HARD_LIMIT };
  }
  if (localCount >= RISULUA_LOCAL_BUDGET_EXCEEDED_THRESHOLD) {
    return { code: 'local_budget_exceeded', severity: 'warning', threshold: RISULUA_LOCAL_BUDGET_EXCEEDED_THRESHOLD };
  }
  if (localCount >= RISULUA_LOCAL_BUDGET_HIGH_RISK_THRESHOLD) {
    return { code: 'local_budget_high_risk', severity: 'warning', threshold: RISULUA_LOCAL_BUDGET_HIGH_RISK_THRESHOLD };
  }
  if (localCount >= RISULUA_LOCAL_BUDGET_WARNING_THRESHOLD) {
    return { code: 'local_budget_warning', severity: 'warning', threshold: RISULUA_LOCAL_BUDGET_WARNING_THRESHOLD };
  }
  return null;
}

function compareBudgetDiagnostics(left: RisuLuaLocalBudgetDiagnostic, right: RisuLuaLocalBudgetDiagnostic): number {
  return (
    (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
    (left.location?.column ?? 0) - (right.location?.column ?? 0) ||
    left.scopeKind.localeCompare(right.scopeKind) ||
    left.code.localeCompare(right.code)
  );
}

function firstLocation(nodes: LuaAstNode[]): RisuLuaSourceLocation | undefined {
  for (const node of nodes) {
    const location = getLocation(node);
    if (location) return location;
  }
  return undefined;
}

function asNodeArray(value: unknown): LuaAstNode[] {
  return Array.isArray(value) ? value.filter(isNode) : [];
}

function isNode(value: unknown): value is LuaAstNode {
  return Boolean(value) && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string';
}
