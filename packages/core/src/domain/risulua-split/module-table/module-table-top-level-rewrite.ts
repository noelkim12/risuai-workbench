/**
 * Top-level module-table rewrite planner.
 *
 * Consumes Task 9 dry-run refactor-map output and produces deterministic
 * module body plans for common helpers and host globals, plus a main
 * rewrite plan with reference rewriting and bridge assignments.
 * Dry-run only — no workspace files are written.
 */

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
  type RisuLuaModuleTableButtonActionUsageContract,
  type RisuLuaModuleTableModuleContract,
  type RisuLuaModuleTableRefactorMapContract,
  type RisuLuaModuleTableSymbolContract,
} from './module-table-contracts';
import type { DryRunPlanResult } from './module-table-refactor-map';
import type { RisuLuaModuleTableRuntimeRootFact } from './module-table-analyzer-types';
import type { RisuLuaModuleTableParseResult } from './module-table-parser';
import { sliceSourceRange } from '../shared/source-slice';
import type { LuaSourceRange } from '../shared/types';
import type { OffsetRangeIndex } from '../shared/offset-range-index';
import { createOffsetRangeIndex } from '../shared/offset-range-index';
import { scanIdentifierTokens, applyReplacements, type Replacement } from './module-table-identifier-rewrite';
import { collectButtonActionUsages, type RawButtonActionUsage, type RisuLuaModuleTableButtonActionSourceInput } from './module-table-button-action-index';

// ─── Public types ────────────────────────────────────────────────

export interface ModuleBodyPlan {
  modulePath: string;
  requireId: string;
  alias: string;
  category: 'common-helper' | 'domain-function' | 'button-action' | 'host-global' | 'runtime-handler';
  body: string;
  exportNames: string[];
  internalRequires: Array<{ requireId: string; alias: string; text: string }>;
}

export interface MainRewritePlan {
  requireStatements: string[];
  bridgeAssignments: string[];
  preservedSource: string;
  fullMainText: string;
}

export interface TopLevelRewriteResult {
  ok: boolean;
  modulePlans: ModuleBodyPlan[];
  mainRewritePlan: MainRewritePlan;
  diagnostics: string[];
}

export interface TopLevelRewriteInput {
  source: string;
  sourceFile: string;
  dryRunResult: DryRunPlanResult;
  parseResult: RisuLuaModuleTableParseResult;
  variableStoreNames?: string[];
  promptStoreNames?: string[];
  buttonActionSources?: RisuLuaModuleTableButtonActionSourceInput[];
}

// ─── Task 10 handled module paths ────────────────────────────────

const TASK_10_MODULE_PATHS = new Set([
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH,
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_START_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH,
]);

// ─── Main entry ──────────────────────────────────────────────────

export function planTopLevelRewrite(input: TopLevelRewriteInput): TopLevelRewriteResult {
  const { source, dryRunResult, parseResult } = input;
  const diagnostics = [...dryRunResult.diagnostics];
  const refactorMap = dryRunResult.refactorMap;
  const editPlan = dryRunResult.editPlan;

  if (!dryRunResult.ok) {
    diagnostics.push('Dry-run result has validation issues; top-level rewrite planning blocked.');
    return { ok: false, modulePlans: [], mainRewritePlan: emptyMainRewritePlan(), diagnostics };
  }

  const commonSyms = symbolsForModule(refactorMap.symbols, RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH);
  const globalSyms = symbolsForModule(refactorMap.symbols, RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH);
  const duplicateSyms = symbolsForModule(refactorMap.symbols, RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH);
  const asyncSyms = symbolsForModule(refactorMap.symbols, RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH);
  const buttonSyms = symbolsForModule(refactorMap.symbols, RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
  const domainSyms = refactorMap.symbols.filter((sym) => sym.classification === 'extract:domain-function' && sym.targetModule !== undefined);
  const runtimeSyms = refactorMap.symbols.filter((sym) => sym.classification === 'extract:runtime-handler-body' && sym.targetModule !== undefined);

  const helperNames = new Set(commonSyms.map((s) => s.originalName));
  const variableStoreNames = new Set(input.variableStoreNames ?? []);
  const promptStoreNames = new Set(input.promptStoreNames ?? []);
  const nonExecRanges = parseResult.ok ? parseResult.nonExecutableRanges : [];
  const nonExecIndex = createOffsetRangeIndex(nonExecRanges.map((r) => r.sourceRange));

  const modulePlans: ModuleBodyPlan[] = [];

  if (commonSyms.length > 0) {
    modulePlans.push(buildCommonHelperModule(commonSyms, source));
  }
  if (globalSyms.length > 0) {
    modulePlans.push(buildHostGlobalModule(globalSyms, source, RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH, refactorMap.modules, helperNames, nonExecIndex));
  }
  if (duplicateSyms.length > 0) {
    modulePlans.push(buildHostGlobalModule(duplicateSyms, source, RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH, refactorMap.modules, helperNames, nonExecIndex));
  }
  if (asyncSyms.length > 0) {
    modulePlans.push(buildHostGlobalModule(asyncSyms, source, RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH, refactorMap.modules, helperNames, nonExecIndex));
  }
  if (buttonSyms.length > 0) {
    modulePlans.push(buildButtonActionModule(buttonSyms, source, refactorMap.modules, refactorMap.symbols, helperNames, variableStoreNames, promptStoreNames, nonExecIndex));
  }
  for (const [modulePath, symbols] of groupSymbolsByModule(domainSyms)) {
    modulePlans.push(buildDomainFunctionModule(symbols, source, modulePath, refactorMap.modules, refactorMap.symbols, helperNames, variableStoreNames, promptStoreNames, nonExecIndex));
  }
  for (const [modulePath, symbols] of groupSymbolsByModule(runtimeSyms)) {
    modulePlans.push(buildRuntimeHandlerModule(symbols, source, modulePath, refactorMap.modules, refactorMap.symbols, new Set(refactorMap.preserved.map((entry) => entry.originalName)), helperNames, variableStoreNames, promptStoreNames, refactorMap.symbols.filter((sym) => isExtracted(sym) && sym.classification !== 'extract:runtime-handler-body').map((sym) => sym.sourceRange), nonExecIndex));
  }
  const listenEditPlans = buildRuntimeListenEditModules(source, dryRunResult.runtimeRoots, refactorMap.modules);
  modulePlans.push(...listenEditPlans);

  const task10Bindings = editPlan.mainRequireBindings.filter(
    (b) => TASK_10_MODULE_PATHS.has(b.targetModule) || isDomainModulePath(b.targetModule),
  );

  const mainRewritePlan = buildMainRewritePlan(
    source, input.sourceFile, refactorMap, dryRunResult.runtimeRoots, task10Bindings, editPlan.mainBridgeInsertions, helperNames, variableStoreNames, promptStoreNames, nonExecIndex, input.buttonActionSources ?? [],
  );

  return { ok: true, modulePlans, mainRewritePlan, diagnostics };
}

// ─── Common helper module ────────────────────────────────────────

function buildCommonHelperModule(
  symbols: RisuLuaModuleTableSymbolContract[],
  source: string,
): ModuleBodyPlan {
  const sorted = bySourceOrder(symbols);
  const lines: string[] = ['local M = {}', ''];

  for (const sym of sorted) {
    lines.push(`local ${sym.originalName}`);
  }
  lines.push('');

  for (const sym of sorted) {
    lines.push(`${leadingCommentTextForSymbol(source, sym.sourceRange)}${stripLocalPrefix(sliceSourceRange(source, sym.sourceRange))}`, '');
  }

  for (const sym of sorted) {
    lines.push(`M.${sym.originalName} = ${sym.originalName}`);
  }
  lines.push('', 'return M');

  return {
    modulePath: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
    requireId: 'common.local_helpers',
    alias: '__local_helpers',
    category: 'common-helper',
    body: `${lines.join('\n')}\n`,
    exportNames: sorted.map((s) => s.originalName),
    internalRequires: [],
  };
}

// ─── Host global module ──────────────────────────────────────────

function buildHostGlobalModule(
  symbols: RisuLuaModuleTableSymbolContract[],
  source: string,
  modulePath: string,
  moduleContracts: RisuLuaModuleTableModuleContract[],
  helperNames: Set<string>,
  nonExecIndex: OffsetRangeIndex,
): ModuleBodyPlan {
  const sorted = bySourceOrder(symbols);
  const contract = moduleContracts.find((m) => m.path === modulePath);
  const needsHelpers = sorted.some((s) => s.rewriteRefs.some((r) => helperNames.has(r)));

  const helperRewriteMap = buildRewriteMap(helperNames);
  const lines: string[] = [];

  if (needsHelpers) {
    lines.push('local __local_helpers = require("common.local_helpers")', '');
  }

  lines.push('local M = {}', '');

  for (const sym of sorted) {
    const leadingCommentText = leadingCommentTextForSymbol(source, sym.sourceRange);
    let body = sliceSourceRange(source, sym.sourceRange);
    if (needsHelpers && sym.rewriteRefs.some((r) => helperNames.has(r))) {
      body = rewriteBoundReferences(body, helperRewriteMap, sym.sourceRange.startOffset, undefined, nonExecIndex);
    }
    if (modulePath === RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH) {
      body = toRenamedLocalModuleFunction(body, sym.originalName, sym.exportName ?? sym.originalName);
      lines.push(`${leadingCommentText}${body}`, '');
    } else {
      lines.push(`${leadingCommentText}local ${body}`, '');
    }
  }

  for (const sym of sorted) {
    lines.push(`M.${sym.exportName ?? sym.originalName} = ${sym.exportName ?? sym.originalName}`);
  }
  lines.push('', 'return M');

  const internalRequires = needsHelpers
    ? [{ requireId: 'common.local_helpers', alias: '__local_helpers', text: 'local __local_helpers = require("common.local_helpers")' }]
    : [];

  return {
    modulePath,
    requireId: contract?.requireId ?? pathToRequireId(modulePath),
    alias: contract?.alias ?? pathToAlias(modulePath),
    category: 'host-global',
    body: `${lines.join('\n')}\n`,
    exportNames: sorted.map((s) => s.exportName ?? s.originalName),
    internalRequires,
  };
}

// ─── Runtime handler body modules ─────────────────────────────────

function buildRuntimeHandlerModule(
  symbols: RisuLuaModuleTableSymbolContract[],
  source: string,
  modulePath: string,
  moduleContracts: RisuLuaModuleTableModuleContract[],
  allSymbols: RisuLuaModuleTableSymbolContract[],
  preservedNames: Set<string>,
  helperNames: Set<string>,
  variableStoreNames: Set<string>,
  promptStoreNames: Set<string>,
  ignoredShadowRanges: LuaSourceRange[],
  nonExecIndex: OffsetRangeIndex,
): ModuleBodyPlan {
  const sorted = bySourceOrder(symbols);
  const contract = moduleContracts.find((m) => m.path === modulePath);
  const capturePlans = sorted.map((sym) => buildCaptureRewritePlan({
    names: uniqueSorted([...sym.captures, ...helperUsagesInRange(source, sym.sourceRange, helperNames), ...symbolUsagesInRange(source, sym.sourceRange, allSymbols, preservedNames, sym.originalName)]),
    moduleContracts,
    allSymbols,
    preservedNames,
    helperNames,
    variableStoreNames,
    promptStoreNames,
    currentModulePath: modulePath,
  }));
  const rewriteNames = new Set(capturePlans.flatMap((plan) => [...plan.rewriteMap.keys()]));
  const shadowedScopes = detectShadowedScopes(source, rewriteNames, ignoredShadowRanges, nonExecIndex, unionRange(sorted.map((sym) => sym.sourceRange)));
  const lines: string[] = [];

  const internalRequires = uniqueRequireBindings(capturePlans.flatMap((plan) => plan.requires));
  if (internalRequires.length > 0) lines.push(...internalRequires.map((binding) => binding.text), '');

  lines.push('local M = {}', '');

  for (const sym of sorted) {
    lines.push(`local ${sym.originalName}`);
  }
  lines.push('');

  for (const [index, sym] of sorted.entries()) {
    const capturePlan = capturePlans[index];
    const leadingCommentText = leadingCommentTextForSymbol(source, sym.sourceRange);
    let body = rewriteBoundReferences(sliceSourceRange(source, sym.sourceRange), capturePlan.rewriteMap, sym.sourceRange.startOffset, shadowedScopes, nonExecIndex);
    body = transformRuntimeHandlerBody(body, sym.originalName, capturePlan.unresolvedCaptures);
    lines.push(`${leadingCommentText}${body}`, '');
  }

  for (const sym of sorted) {
    lines.push(`M.${sym.originalName} = ${sym.originalName}`);
  }
  lines.push('', 'return M');

  return {
    modulePath,
    requireId: contract?.requireId ?? pathToRequireId(modulePath),
    alias: contract?.alias ?? pathToAlias(modulePath),
    category: 'runtime-handler',
    body: `${lines.join('\n')}\n`,
    exportNames: sorted.map((s) => s.originalName),
    internalRequires,
  };
}

// ─── Domain function modules ──────────────────────────────────────

function buildDomainFunctionModule(
  symbols: RisuLuaModuleTableSymbolContract[],
  source: string,
  modulePath: string,
  moduleContracts: RisuLuaModuleTableModuleContract[],
  allSymbols: RisuLuaModuleTableSymbolContract[],
  helperNames: Set<string>,
  variableStoreNames: Set<string>,
  promptStoreNames: Set<string>,
  nonExecIndex: OffsetRangeIndex,
): ModuleBodyPlan {
  const sorted = bySourceOrder(symbols);
  const contract = moduleContracts.find((m) => m.path === modulePath);
  const capturePlans = sorted.map((sym) => buildCaptureRewritePlan({
    names: uniqueSorted([...sym.captures, ...helperUsagesInRange(source, sym.sourceRange, helperNames), ...symbolUsagesInRange(source, sym.sourceRange, allSymbols, new Set(), sym.originalName)]),
    moduleContracts,
    allSymbols,
    helperNames,
    variableStoreNames,
    promptStoreNames,
    currentModulePath: modulePath,
  }));
  const rewriteNames = new Set(capturePlans.flatMap((plan) => [...plan.rewriteMap.keys()]));
  const shadowedScopes = detectShadowedScopes(source, rewriteNames, [], nonExecIndex, unionRange(sorted.map((sym) => sym.sourceRange)));
  const lines: string[] = [];

  const internalRequires = uniqueRequireBindings(capturePlans.flatMap((plan) => plan.requires));
  if (internalRequires.length > 0) lines.push(...internalRequires.map((binding) => binding.text), '');

  lines.push('local M = {}', '');

  for (const [index, sym] of sorted.entries()) {
    const capturePlan = capturePlans[index];
    const leadingCommentText = leadingCommentTextForSymbol(source, sym.sourceRange);
    const stripped = stripLocalPrefixWithOffset(sliceSourceRange(source, sym.sourceRange));
    let body = stripped.text.trimEnd();
    body = rewriteBoundReferences(body, capturePlan.rewriteMap, sym.sourceRange.startOffset + stripped.offsetAdjustment, shadowedScopes, nonExecIndex);
    lines.push(`${leadingCommentText}${body}`, '', `M.${sym.originalName} = ${sym.originalName}`, '');
  }
  lines.push('return M');

  return {
    modulePath,
    requireId: contract?.requireId ?? pathToRequireId(modulePath),
    alias: contract?.alias ?? pathToAlias(modulePath),
    category: 'domain-function',
    body: `${lines.join('\n')}\n`,
    exportNames: sorted.map((s) => s.originalName),
    internalRequires,
  };
}

function buildButtonActionModule(
  symbols: RisuLuaModuleTableSymbolContract[],
  source: string,
  moduleContracts: RisuLuaModuleTableModuleContract[],
  allSymbols: RisuLuaModuleTableSymbolContract[],
  helperNames: Set<string>,
  variableStoreNames: Set<string>,
  promptStoreNames: Set<string>,
  nonExecIndex: OffsetRangeIndex,
): ModuleBodyPlan {
  const sorted = bySourceOrder(symbols);
  const contract = moduleContracts.find((m) => m.path === RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
  const capturePlans = sorted.map((sym) => buildCaptureRewritePlan({
    names: uniqueSorted([...sym.captures, ...helperUsagesInRange(source, sym.sourceRange, helperNames), ...symbolUsagesInRange(source, sym.sourceRange, allSymbols, new Set(), sym.originalName)]),
    moduleContracts,
    allSymbols,
    helperNames,
    variableStoreNames,
    promptStoreNames,
    currentModulePath: RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
  }));
  const rewriteNames = new Set(capturePlans.flatMap((plan) => [...plan.rewriteMap.keys()]));
  const shadowedScopes = detectShadowedScopes(source, rewriteNames, [], nonExecIndex, unionRange(sorted.map((sym) => sym.sourceRange)));
  const lines: string[] = [];

  const internalRequires = uniqueRequireBindings(capturePlans.flatMap((plan) => plan.requires));
  if (internalRequires.length > 0) lines.push(...internalRequires.map((binding) => binding.text), '');

  lines.push('local M = {}', '');

  for (const [index, sym] of sorted.entries()) {
    const capturePlan = capturePlans[index];
    const leadingCommentText = leadingCommentTextForSymbol(source, sym.sourceRange);
    let body = toLocalModuleFunction(sliceSourceRange(source, sym.sourceRange)).trimEnd();
    body = rewriteBoundReferences(body, capturePlan.rewriteMap, sym.sourceRange.startOffset, shadowedScopes, nonExecIndex);
    lines.push(`${leadingCommentText}${body}`, '', `M.${sym.originalName} = ${sym.originalName}`, '');
  }
  lines.push('return M');

  return {
    modulePath: RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
    requireId: contract?.requireId ?? pathToRequireId(RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH),
    alias: contract?.alias ?? pathToAlias(RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH),
    category: 'button-action',
    body: `${lines.join('\n')}\n`,
    exportNames: sorted.map((s) => s.originalName),
    internalRequires,
  };
}

function sourceNavigationComment(label: string, sourceFile: string, sourceRange: LuaSourceRange): string {
  return [
    `-- ${label}`,
    `---@source ${sourceFile}:${sourceRange.startLine}:0`,
    '',
  ].join('\n');
}

function buttonActionNavigationComment(
  name: string,
  mainSourceFile: string,
  usageByName: Map<string, RisuLuaModuleTableButtonActionUsageContract[]>,
): string | undefined {
  const usage = usageByName.get(name)?.find((candidate) => candidate.sourceFile !== mainSourceFile);
  if (usage === undefined) return undefined;
  return sourceNavigationComment(`Button action bridge: ${name}`, usage.sourceFile, usage.sourceRange);
}

function toLocalModuleFunction(sourceSlice: string): string {
  const trimmedStart = sourceSlice.replace(/^\s+/, '');
  const leadingWhitespace = sourceSlice.slice(0, sourceSlice.length - trimmedStart.length);
  if (trimmedStart.startsWith('local ')) return stripLocalPrefix(sourceSlice);
  if (/^function\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(trimmedStart)) return `${leadingWhitespace}local ${trimmedStart}`;
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:async\s*\(\s*)?function\b/.test(trimmedStart)) return `${leadingWhitespace}local ${trimmedStart}`;
  return stripLocalPrefix(sourceSlice);
}

function toRenamedLocalModuleFunction(sourceSlice: string, originalName: string, exportName: string): string {
  const localBody = toLocalModuleFunction(sourceSlice);
  return localBody
    .replace(new RegExp(`local\\s+function\\s+${escapeRegExp(originalName)}\\s*\\(`), `local function ${exportName}(`)
    .replace(new RegExp(`local\\s+${escapeRegExp(originalName)}\\s*=\\s*`), `local ${exportName} = `);
}

function buildRuntimeListenEditModules(
  source: string,
  runtimeRoots: RisuLuaModuleTableRuntimeRootFact[],
  moduleContracts: RisuLuaModuleTableModuleContract[],
): ModuleBodyPlan[] {
  const callbacks = runtimeRoots
    .filter((root) => root.kind === 'listener-registration' && root.wrapperKind === 'listen-edit-callback')
    .map((root) => parseListenEditCallback(source.slice(root.sourceRange.startOffset, root.sourceRange.endOffset)))
    .filter((callback): callback is ListenEditCallbackPlan => callback !== undefined);
  if (callbacks.length === 0) return [];

  const contract = moduleContracts.find((moduleContract) => moduleContract.path === RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH);
  const lines: string[] = ['local M = {}', ''];
  for (const callback of callbacks) {
    lines.push(`local function ${callback.exportName}(${callback.parameters})`);
    if (callback.body.trim().length > 0) lines.push(callback.body.trimEnd());
    lines.push('end', '', `M.${callback.exportName} = ${callback.exportName}`, '');
  }
  lines.push('return M');

  return [{
    modulePath: RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH,
    requireId: contract?.requireId ?? pathToRequireId(RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH),
    alias: contract?.alias ?? pathToAlias(RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH),
    category: 'runtime-handler',
    body: `${lines.join('\n')}\n`,
    exportNames: callbacks.map((callback) => callback.exportName),
    internalRequires: [],
  }];
}

interface ListenEditCallbackPlan {
  listenerName: string;
  exportName: string;
  parameters: string;
  body: string;
}

function parseListenEditCallback(sourceSlice: string): ListenEditCallbackPlan | undefined {
  const match = /listenEdit\s*\(\s*(["'])([^"']+)\1\s*,\s*function\s*\(([^)]*)\)([\s\S]*)end\s*\)\s*$/m.exec(sourceSlice.trim());
  if (match === null) return undefined;
  return {
    listenerName: match[2],
    exportName: listenEditExportName(match[2]),
    parameters: match[3].trim(),
    body: unindentFunctionBody(match[4]),
  };
}

function listenEditExportName(listenerName: string): string {
  return listenerName.replace(/[^A-Za-z0-9_]+(.)/g, (_match, char: string) => char.toUpperCase());
}

function unindentFunctionBody(body: string): string {
  const normalized = body.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '');
  const indents = normalized.split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => /^\s*/.exec(line)?.[0].length ?? 0);
  const minIndent = indents.length === 0 ? 0 : Math.min(...indents);
  return normalized.split(/\r?\n/).map((line) => line.slice(Math.min(minIndent, /^\s*/.exec(line)?.[0].length ?? 0))).join('\n');
}

function transformRuntimeHandlerBody(sourceSlice: string, handlerName: string, capturedNames: string[]): string {
  const trimmedStart = sourceSlice.replace(/^\s+/, '');
  const leadingWhitespace = sourceSlice.slice(0, sourceSlice.length - trimmedStart.length);
  const functionDeclaration = new RegExp(`^function\\s+${escapeRegExp(handlerName)}\\s*\\(([^)]*)\\)`);
  const declarationMatch = functionDeclaration.exec(trimmedStart);
  if (declarationMatch !== null) {
    const parameters = appendRuntimeHandlerCapturedParameters(declarationMatch[1].trim(), capturedNames);
    return leadingWhitespace + trimmedStart.replace(functionDeclaration, `function ${handlerName}(${parameters})`);
  }

  const asyncAssignment = new RegExp(`^${escapeRegExp(handlerName)}\\s*=\\s*async\\s*\\(\\s*function\\s*\\(([^)]*)\\)`);
  const asyncAssignmentMatch = asyncAssignment.exec(trimmedStart);
  if (asyncAssignmentMatch !== null) {
    const parameters = appendRuntimeHandlerCapturedParameters(asyncAssignmentMatch[1].trim(), capturedNames);
    return leadingWhitespace + trimmedStart.replace(asyncAssignment, `${handlerName} = async(function(${parameters})`);
  }

  const assignment = new RegExp(`^${escapeRegExp(handlerName)}\\s*=\\s*function\\s*\\(([^)]*)\\)`);
  const assignmentMatch = assignment.exec(trimmedStart);
  if (assignmentMatch !== null) {
    const parameters = appendRuntimeHandlerCapturedParameters(assignmentMatch[1].trim(), capturedNames);
    return leadingWhitespace + trimmedStart.replace(assignment, (match) => match.replace(/\([^)]*\)$/, `(${parameters})`));
  }

  return sourceSlice;
}

function buildRuntimeHandlerShim(sourceSlice: string, handlerName: string, moduleAlias: string, capturedNames: string[]): string {
  const parameters = extractRuntimeHandlerParameters(sourceSlice, handlerName) ?? '...';
  const callArguments = appendRuntimeHandlerCapturedParameters(parameters, capturedNames);
  return [
    `function ${handlerName}(${parameters})`,
    `    return ${moduleAlias}.${handlerName}(${callArguments})`,
    'end',
  ].join('\n');
}

function appendRuntimeHandlerCapturedParameters(parameters: string, capturedNames: string[]): string {
  const existing = parameters.split(',').map((parameter) => parameter.trim()).filter((parameter) => parameter.length > 0);
  const additions = capturedNames.filter((name) => !existing.includes(name));
  return [...existing, ...additions].join(', ');
}

function extractRuntimeHandlerParameters(sourceSlice: string, handlerName: string): string | undefined {
  const functionDeclaration = new RegExp(`function\\s+${escapeRegExp(handlerName)}\\s*\\(([^)]*)\\)`);
  const declarationMatch = functionDeclaration.exec(sourceSlice);
  if (declarationMatch !== null) return declarationMatch[1].trim();

  const assignment = new RegExp(`${escapeRegExp(handlerName)}\\s*=\\s*(?:async\\s*\\(\\s*)?function\\s*\\(([^)]*)\\)`);
  const assignmentMatch = assignment.exec(sourceSlice);
  if (assignmentMatch !== null) return assignmentMatch[1].trim();

  return undefined;
}

// ─── Main rewrite plan ───────────────────────────────────────────

interface ExtractionPoint {
  range: LuaSourceRange;
  isHostGlobal: boolean;
  bridgeText?: string;
  replacementText?: string;
  navigationComment?: string;
}

interface ShadowedScope {
  name: string;
  startOffset: number;
  endOffset: number;
}

interface CaptureRewritePlan {
  requires: Array<{ requireId: string; alias: string; text: string }>;
  rewriteMap: Map<string, string>;
  unresolvedCaptures: string[];
}

const VARIABLE_STORE_REQUIRE_BINDING = {
  requireId: 'state.variable_store',
  alias: '__variable_store',
  text: 'local __variable_store = require("state.variable_store")',
};

const PROMPT_STORE_REQUIRE_BINDING = {
  requireId: 'prompts.instruction_store',
  alias: '__prompt_store',
  text: 'local __prompt_store = require("prompts.instruction_store")',
};

function buildMainRewritePlan(
  source: string,
  sourceFile: string,
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  runtimeRoots: RisuLuaModuleTableRuntimeRootFact[],
  requireBindings: DryRunPlanResult['editPlan']['mainRequireBindings'],
  bridgeInsertions: DryRunPlanResult['editPlan']['mainBridgeInsertions'],
  helperNames: Set<string>,
  variableStoreNames: Set<string>,
  promptStoreNames: Set<string>,
  nonExecIndex: OffsetRangeIndex,
  buttonActionSources: RisuLuaModuleTableButtonActionSourceInput[],
): MainRewritePlan {
  const moduleContractsByPath = new Map(refactorMap.modules.map((moduleContract) => [moduleContract.path, moduleContract]));
  const helperRewriteMap = buildRewriteMapForSymbols(refactorMap.symbols, moduleContractsByPath, helperNames);
  const extractionRanges: LuaSourceRange[] = [];
  for (const sym of refactorMap.symbols) {
    if (isExtracted(sym)) extractionRanges.push(ownedRangeForSymbol(source, sym.sourceRange));
  }
  const shadowedScopes = detectShadowedScopes(source, new Set(helperRewriteMap.keys()), extractionRanges, nonExecIndex);
  const extractions: ExtractionPoint[] = [];
  const buttonActionUsagesByName = groupButtonActionUsagesByName(collectButtonActionUsages(buttonActionSources));
  for (const sym of refactorMap.symbols) {
    if (isExtracted(sym)) {
      const moduleContract = sym.targetModule === undefined ? undefined : moduleContractsByPath.get(sym.targetModule);
      extractions.push({
        range: ownedRangeForSymbol(source, sym.sourceRange),
        isHostGlobal: sym.globalBridge,
        bridgeText: sym.bridge?.mainAssignment.text,
        navigationComment: sym.targetModule === RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH
          ? buttonActionNavigationComment(sym.originalName, sourceFile, buttonActionUsagesByName)
          : undefined,
        replacementText: sym.classification === 'extract:runtime-handler-body' && moduleContract !== undefined
          ? buildRuntimeHandlerShim(
            source.slice(sym.sourceRange.startOffset, sym.sourceRange.endOffset),
            sym.originalName,
            moduleContract.alias,
            buildCaptureRewritePlan({
              names: uniqueSorted([...sym.captures, ...helperUsagesInRange(source, sym.sourceRange, helperNames), ...symbolUsagesInRange(source, sym.sourceRange, refactorMap.symbols, new Set(refactorMap.preserved.map((entry) => entry.originalName)), sym.originalName)]),
              moduleContracts: refactorMap.modules,
              allSymbols: refactorMap.symbols,
              preservedNames: new Set(refactorMap.preserved.map((entry) => entry.originalName)),
              helperNames,
              variableStoreNames,
              promptStoreNames,
              currentModulePath: sym.targetModule ?? '',
            }).unresolvedCaptures.map((name) => helperRewriteMap.get(name) ?? name),
          )
          : undefined,
      });
    }
  }
  for (const root of runtimeRoots) {
    if (root.kind !== 'listener-registration' || root.wrapperKind !== 'listen-edit-callback') continue;
    const callback = parseListenEditCallback(source.slice(root.sourceRange.startOffset, root.sourceRange.endOffset));
    if (callback === undefined) continue;
    extractions.push({
      range: ownedRangeForSymbol(source, root.sourceRange),
      isHostGlobal: false,
      replacementText: buildListenEditShim(callback),
    });
  }
  extractions.sort((a, b) => a.range.startOffset - b.range.startOffset);

  const bodyParts: string[] = [];

  let cursor = 0;
  for (const ext of extractions) {
    if (ext.range.startOffset > cursor) {
      const chunk = source.slice(cursor, ext.range.startOffset);
      bodyParts.push(rewriteBoundReferences(chunk, helperRewriteMap, cursor, shadowedScopes, nonExecIndex));
    }
    if (ext.isHostGlobal && ext.bridgeText) {
      bodyParts.push(`${ext.navigationComment ?? ''}${ext.bridgeText}`);
    } else if (ext.replacementText !== undefined) {
      bodyParts.push(`${ext.navigationComment ?? ''}${ext.replacementText}`);
    }
    cursor = ext.range.endOffset;
  }

  if (cursor < source.length) {
    const tail = source.slice(cursor);
    bodyParts.push(rewriteBoundReferences(tail, helperRewriteMap, cursor, shadowedScopes, nonExecIndex));
  }

  const bodyText = joinMainParts(bodyParts);
  const usedRequireBindings = requireBindings.filter(
    (binding) => !isInternalDependencyModulePath(binding.targetModule) || mainBodyUsesAlias(bodyText, binding.alias),
  );
  const parts: string[] = ['-- @generated by risuai-workbench', '-- risulua-split=module-table', ''];
  for (const binding of usedRequireBindings) {
    parts.push(binding.text);
  }
  if (usedRequireBindings.length > 0) parts.push('');
  parts.push(bodyText);

  const fullText = joinMainParts(parts);
  return {
    requireStatements: usedRequireBindings.map((b) => b.text),
    bridgeAssignments: bridgeInsertions.map((b) => b.text),
    preservedSource: bodyText,
    fullMainText: fullText,
  };
}

function mainBodyUsesAlias(bodyText: string, alias: string): boolean {
  return new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(bodyText);
}

function isInternalDependencyModulePath(modulePath: string): boolean {
  return isDomainModulePath(modulePath)
    || modulePath === RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH
    || modulePath === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH;
}

function buildListenEditShim(callback: ListenEditCallbackPlan): string {
  const callArguments = callback.parameters.length === 0 ? '' : callback.parameters;
  return [
    `listenEdit("${callback.listenerName}", function(${callback.parameters})`,
    `    return __runtime_listen_edit.${callback.exportName}(${callArguments})`,
    'end)',
  ].join('\n');
}

function groupButtonActionUsagesByName(usages: RawButtonActionUsage[]): Map<string, RisuLuaModuleTableButtonActionUsageContract[]> {
  const byName = new Map<string, RisuLuaModuleTableButtonActionUsageContract[]>();
  for (const { name, ...usage } of usages) {
    byName.set(name, [...(byName.get(name) ?? []), usage]);
  }
  return byName;
}

// ─── Reference rewriting ─────────────────────────────────────────

function rewriteBoundReferences(
  text: string,
  rewriteMap: Map<string, string>,
  baseOffset: number,
  shadowedScopes: ShadowedScope[] | undefined,
  nonExecIndex: OffsetRangeIndex,
): string {
  if (rewriteMap.size === 0 || text.length === 0) return text;

  const tokens = scanIdentifierTokens(text, rewriteMap, baseOffset);
  const replacements: Replacement[] = [];

  for (const tok of tokens) {
    // Skip method/table property references (preceded by dot)
    if (tok.precededByDot) continue;

    if (!nonExecIndex.containsOffset(tok.absStart)
      && !isDeclarationContext(text, tok.start)
      && !isTableKeyContext(text, tok.end)
      && !isMatchInShadowedScope(tok.absStart, tok.name, shadowedScopes)) {
      replacements.push({ start: tok.start, end: tok.end, replacement: tok.qualified });
    }
  }

  return applyReplacements(text, replacements);
}

// ─── Shadowing detection ─────────────────────────────────────────

function detectShadowedScopes(
  source: string,
  helperNames: Set<string>,
  extractedRanges: LuaSourceRange[],
  nonExecIndex: OffsetRangeIndex,
  scanRange?: LuaSourceRange,
): ShadowedScope[] {
  if (helperNames.size === 0) return [];

  const scopes: ShadowedScope[] = [];
  let cursor = scanRange?.startOffset ?? 0;
  const len = scanRange?.endOffset ?? source.length;

  while (cursor < len) {
    const localIdx = source.indexOf('local', cursor);
    if (localIdx < 0 || localIdx >= len) break;
    cursor = localIdx + 1;

    // "local" must be at word boundary
    if (localIdx > 0 && isIdentChar(source.charCodeAt(localIdx - 1))) continue;

    // After "local" must be whitespace
    let pos = localIdx + 5;
    if (pos >= len || !isWs(source.charCodeAt(pos))) continue;
    pos = skipWs(source, pos);

    // Check optional "function" keyword at word boundary
    if (source.startsWith('function', pos) && (pos + 8 >= len || !isIdentChar(source.charCodeAt(pos + 8)))) {
      pos = skipWs(source, pos + 8);
    }

    // Scan the identifier after local [function]
    if (pos >= len || !isIdentStartChar(source.charCodeAt(pos))) continue;
    const identStart = pos;
    while (pos < len && isIdentChar(source.charCodeAt(pos))) pos++;
    const name = source.slice(identStart, pos);

    if (helperNames.has(name)) {
      const absPos = localIdx;
      if (!nonExecIndex.containsOffset(absPos) && !isInsideAnyRange(absPos, extractedRanges)) {
        const endOffset = Math.min(findBlockEnd(source, absPos, nonExecIndex), len);
        scopes.push({ name, startOffset: absPos, endOffset });
      }
    }
  }
  return scopes;
}

function findBlockEnd(
  source: string,
  declPos: number,
  nonExecIndex: OffsetRangeIndex,
): number {
  // Local bindings extend to the end of the enclosing block.
  // Build a stack of function-start positions, find which one encloses declPos,
  // then find its matching end.
  const funcStack: number[] = [];
  const tokenRe = /\bfunction\b|\bend\b/g;
  let tokMatch: RegExpExecArray | null = tokenRe.exec(source);
  while (tokMatch !== null) {
    if (nonExecIndex.containsOffset(tokMatch.index)) {
      tokMatch = tokenRe.exec(source);
      continue;
    }
    const tok = tokMatch[0];
    if (tok === 'function') {
      funcStack.push(tokMatch.index);
    } else if (tok === 'end' && funcStack.length > 0) {
      const fnStart = funcStack.pop()!;
      // If this function contains declPos and is not the function at declPos itself
      if (fnStart < declPos && tokMatch.index > declPos) {
        const lineEndPos = source.indexOf('\n', tokMatch.index);
        return lineEndPos === -1 ? source.length : lineEndPos;
      }
    }
    tokMatch = tokenRe.exec(source);
  }
  return source.length;
}

function isMatchInShadowedScope(
  absPos: number,
  name: string,
  shadowedScopes?: ShadowedScope[],
): boolean {
  if (!shadowedScopes) return false;
  for (const scope of shadowedScopes) {
    if (scope.name === name && absPos >= scope.startOffset && absPos < scope.endOffset) {
      return true;
    }
  }
  return false;
}

// ─── Context checks & utility ─────────────────────────────────────

function isInsideAnyRange(offset: number, ranges: LuaSourceRange[]): boolean {
  for (const r of ranges) { if (offset >= r.startOffset && offset < r.endOffset) return true; }
  return false;
}

function unionRange(ranges: LuaSourceRange[]): LuaSourceRange | undefined {
  if (ranges.length === 0) return undefined;
  let startOffset = ranges[0].startOffset;
  let endOffset = ranges[0].endOffset;
  let startLine = ranges[0].startLine;
  let endLine = ranges[0].endLine;
  for (const range of ranges.slice(1)) {
    if (range.startOffset < startOffset) {
      startOffset = range.startOffset;
      startLine = range.startLine;
    }
    if (range.endOffset > endOffset) {
      endOffset = range.endOffset;
      endLine = range.endLine;
    }
  }
  return { startLine, endLine, startOffset, endOffset };
}

function isDeclarationContext(text: string, pos: number): boolean {
  const before = text.slice(Math.max(0, pos - 30), pos);
  return /\blocal\s+function\s*$/.test(before) || /\blocal\s+$/.test(before) || /\bfunction\s*$/.test(before);
}

function isTableKeyContext(text: string, afterPos: number): boolean {
  const after = text.slice(afterPos, afterPos + 5);
  return /^\s*=[^=]/.test(after);
}

// ─── Helpers ─────────────────────────────────────────────────────

function buildRewriteMap(helperNames: Set<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of helperNames) {
    map.set(name, `__local_helpers.${name}`);
  }
  return map;
}

function buildRewriteMapForSymbols(
  symbols: RisuLuaModuleTableSymbolContract[],
  moduleContractsByPath: Map<string, RisuLuaModuleTableModuleContract>,
  helperNames: Set<string>,
): Map<string, string> {
  const map = buildRewriteMap(helperNames);
  for (const symbol of symbols) {
    if (symbol.classification !== 'extract:domain-function' || symbol.targetModule === undefined) continue;
    const moduleContract = moduleContractsByPath.get(symbol.targetModule);
    if (moduleContract === undefined) continue;
    map.set(symbol.originalName, `${moduleContract.alias}.${symbol.exportName ?? symbol.originalName}`);
  }
  return map;
}

function buildCaptureRewritePlan(input: {
  names: string[];
  moduleContracts: RisuLuaModuleTableModuleContract[];
  allSymbols: RisuLuaModuleTableSymbolContract[];
  preservedNames?: Set<string>;
  helperNames: Set<string>;
  variableStoreNames?: Set<string>;
  promptStoreNames?: Set<string>;
  currentModulePath: string;
}): CaptureRewritePlan {
  const rewriteMap = new Map<string, string>();
  const requires: CaptureRewritePlan['requires'] = [];
  const unresolvedCaptures: string[] = [];
  const moduleContractsByPath = new Map(input.moduleContracts.map((contract) => [contract.path, contract]));

  for (const name of uniqueSorted(input.names)) {
    if (input.helperNames.has(name)) {
      requires.push({ requireId: 'common.local_helpers', alias: '__local_helpers', text: 'local __local_helpers = require("common.local_helpers")' });
      rewriteMap.set(name, `__local_helpers.${name}`);
      continue;
    }

    const symbol = input.allSymbols.find((candidate) => candidate.originalName === name);
    if (symbol?.targetModule !== undefined && symbol.targetModule !== input.currentModulePath && isExtracted(symbol)) {
      const contract = moduleContractsByPath.get(symbol.targetModule);
      if (contract !== undefined) {
        requires.push({ requireId: contract.requireId, alias: contract.alias, text: `local ${contract.alias} = require("${contract.requireId}")` });
        rewriteMap.set(name, `${contract.alias}.${symbol.exportName ?? symbol.originalName}`);
        continue;
      }
    }

    if (symbol !== undefined) {
      unresolvedCaptures.push(name);
      continue;
    }

    if (input.preservedNames?.has(name) === true) {
      unresolvedCaptures.push(name);
      continue;
    }

    if (input.variableStoreNames?.has(name) === true) {
      requires.push(VARIABLE_STORE_REQUIRE_BINDING);
      rewriteMap.set(name, `${VARIABLE_STORE_REQUIRE_BINDING.alias}.${name}`);
      continue;
    }

    if (input.promptStoreNames?.has(name) === true) {
      requires.push(PROMPT_STORE_REQUIRE_BINDING);
      rewriteMap.set(name, `${PROMPT_STORE_REQUIRE_BINDING.alias}.${name}`);
      continue;
    }

    unresolvedCaptures.push(name);
  }

  return { requires: uniqueRequireBindings(requires), rewriteMap, unresolvedCaptures };
}

function uniqueRequireBindings(bindings: CaptureRewritePlan['requires']): CaptureRewritePlan['requires'] {
  const seen = new Set<string>();
  const output: CaptureRewritePlan['requires'] = [];
  for (const binding of bindings) {
    const key = `${binding.alias}:${binding.requireId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(binding);
  }
  return output;
}

function helperUsagesInRange(source: string, range: LuaSourceRange, helperNames: Set<string>): string[] {
  if (helperNames.size === 0) return [];
  const rewriteMap = buildRewriteMap(helperNames);
  return uniqueSorted(scanIdentifierTokens(source.slice(range.startOffset, range.endOffset), rewriteMap, range.startOffset)
    .filter((token) => !token.precededByDot)
    .map((token) => token.name));
}

function symbolUsagesInRange(
  source: string,
  range: LuaSourceRange,
  symbols: RisuLuaModuleTableSymbolContract[],
  preservedNames: Set<string>,
  currentName: string,
): string[] {
  const names = new Set([
    ...symbols.map((symbol) => symbol.originalName),
    ...preservedNames,
  ].filter((name) => name !== currentName));
  const text = source.slice(range.startOffset, range.endOffset);
  for (const name of [...names]) {
    const declaration = new RegExp(`\\blocal\\s+function\\s+${escapeRegExp(name)}\\s*\\(`);
    if (declaration.test(text)) names.delete(name);
  }
  if (names.size === 0) return [];
  const rewriteMap = new Map([...names].map((name) => [name, name]));
  return uniqueSorted(scanIdentifierTokens(text, rewriteMap, range.startOffset)
    .filter((token) => !token.precededByDot && token.charAfterWs === '(' && !isDeclarationContext(text, token.start))
    .map((token) => token.name));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function stripLocalPrefix(sourceSlice: string): string { return stripLocalPrefixWithOffset(sourceSlice).text; }

function stripLocalPrefixWithOffset(sourceSlice: string): { text: string; offsetAdjustment: number } {
  const match = /^local\s+/.exec(sourceSlice);
  if (match === null) return { text: sourceSlice, offsetAdjustment: 0 };
  return { text: sourceSlice.slice(match[0].length), offsetAdjustment: match[0].length };
}

function symbolsForModule(symbols: RisuLuaModuleTableSymbolContract[], modulePath: string): RisuLuaModuleTableSymbolContract[] {
  return symbols.filter((s) => s.targetModule === modulePath);
}

function groupSymbolsByModule(symbols: RisuLuaModuleTableSymbolContract[]): Map<string, RisuLuaModuleTableSymbolContract[]> {
  const byModule = new Map<string, RisuLuaModuleTableSymbolContract[]>();
  for (const symbol of symbols) {
    if (symbol.targetModule === undefined) continue;
    byModule.set(symbol.targetModule, [...(byModule.get(symbol.targetModule) ?? []), symbol]);
  }
  return byModule;
}

function isExtracted(sym: RisuLuaModuleTableSymbolContract): boolean {
  if (!sym.targetModule || (!TASK_10_MODULE_PATHS.has(sym.targetModule) && !isDomainModulePath(sym.targetModule))) return false;
  return sym.classification.startsWith('extract:') || sym.classification === 'bridge:host-visible-global';
}

function isDomainModulePath(modulePath: string): boolean {
  return /^lua\/domain\/[^/]+\.risulua$/.test(modulePath);
}

function bySourceOrder(symbols: RisuLuaModuleTableSymbolContract[]): RisuLuaModuleTableSymbolContract[] {
  return [...symbols].sort((a, b) => a.sourceRange.startOffset - b.sourceRange.startOffset);
}

function leadingCommentTextForSymbol(source: string, range: LuaSourceRange): string {
  const ownedRange = ownedRangeForSymbol(source, range);
  return ownedRange.startOffset < range.startOffset
    ? source.slice(ownedRange.startOffset, range.startOffset)
    : '';
}

function ownedRangeForSymbol(source: string, range: LuaSourceRange): LuaSourceRange {
  const startOffset = leadingCommentStartOffset(source, range.startOffset);
  if (startOffset === range.startOffset) return range;
  return {
    ...range,
    startOffset,
    startLine: lineNumberAtOffset(source, startOffset),
  };
}

function leadingCommentStartOffset(source: string, declarationStartOffset: number): number {
  const declarationLineStart = lineStartAtOrBefore(source, declarationStartOffset);
  let cursor = declarationLineStart;
  let blockStart = declarationLineStart;
  let sawComment = false;

  while (cursor > 0) {
    const previousStart = previousLineStart(source, cursor);
    const lineText = source.slice(previousStart, cursor).replace(/\r?\n$/, '');
    const trimmed = lineText.trim();
    if (trimmed.length === 0) {
      if (sawComment) blockStart = previousStart;
      cursor = previousStart;
      continue;
    }
    if (trimmed.startsWith('--')) {
      sawComment = true;
      blockStart = previousStart;
      cursor = previousStart;
      continue;
    }
    break;
  }

  if (!sawComment) return declarationStartOffset;
  while (blockStart < declarationLineStart) {
    const nextStart = nextLineStart(source, blockStart);
    const lineText = source.slice(blockStart, nextStart).replace(/\r?\n$/, '');
    if (lineText.trim().length > 0) break;
    blockStart = nextStart;
  }
  return blockStart;
}

function lineStartAtOrBefore(source: string, offset: number): number {
  const previousNewline = source.lastIndexOf('\n', Math.max(0, offset - 1));
  return previousNewline === -1 ? 0 : previousNewline + 1;
}

function previousLineStart(source: string, lineStart: number): number {
  if (lineStart <= 0) return 0;
  const previousNewline = source.lastIndexOf('\n', lineStart - 2);
  return previousNewline === -1 ? 0 : previousNewline + 1;
}

function nextLineStart(source: string, lineStart: number): number {
  const newline = source.indexOf('\n', lineStart);
  return newline === -1 ? source.length : newline + 1;
}

function lineNumberAtOffset(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === '\n') line += 1;
  }
  return line;
}

function emptyMainRewritePlan(): MainRewritePlan {
  return { requireStatements: [], bridgeAssignments: [], preservedSource: '', fullMainText: '' };
}

function pathToRequireId(modulePath: string): string {
  return modulePath.replace(/^lua\//, '').replace(/\.risulua$/, '').replace(/\//g, '.');
}

function pathToAlias(modulePath: string): string {
  if (modulePath === RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH) return '__host_globals';
  if (modulePath === RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH) return '__duplicate_globals';
  if (modulePath === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH) return '__async_actions';
  if (modulePath === RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH) return '__button_actions';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH) return '__runtime_output';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH) return '__runtime_input';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_START_PATH) return '__runtime_start';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH) return '__runtime_button';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH) return '__runtime_listen_edit';
  if (isDomainModulePath(modulePath)) return `__domain_${modulePath.split('/').at(-1)?.replace(/\.risulua$/, '') ?? 'module'}`;
  return `__${modulePath.split('/').at(-1)?.replace(/\.risulua$/, '') ?? 'module'}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function joinMainParts(parts: string[]): string {
  let t = parts.join('\n');
  while (t.includes('\n\n\n')) t = t.replace(/\n\n\n+/g, '\n\n');
  if (!t.endsWith('\n')) t += '\n';
  return t;
}

function isIdentChar(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

function isIdentStartChar(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

function isWs(code: number): boolean { return code === 32 || code === 9 || code === 10 || code === 13; }

function skipWs(text: string, pos: number): number {
  while (pos < text.length && isWs(text.charCodeAt(pos))) pos++;
  return pos;
}
