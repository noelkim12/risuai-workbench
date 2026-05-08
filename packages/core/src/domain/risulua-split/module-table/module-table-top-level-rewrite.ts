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
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_START_PATH,
  type RisuLuaModuleTableModuleContract,
  type RisuLuaModuleTableRefactorMapContract,
  type RisuLuaModuleTableSymbolContract,
} from './module-table-contracts';
import type { DryRunPlanResult } from './module-table-refactor-map';
import type { RisuLuaModuleTableParseResult } from './module-table-parser';
import { sliceSourceRange } from '../shared/source-slice';
import type { LuaSourceRange } from '../shared/types';
import type { OffsetRangeIndex } from '../shared/offset-range-index';
import { createOffsetRangeIndex } from '../shared/offset-range-index';
import { scanIdentifierTokens, applyReplacements, type Replacement } from './module-table-identifier-rewrite';

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
}

// ─── Task 10 handled module paths ────────────────────────────────

const TASK_10_MODULE_PATHS = new Set([
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_START_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH,
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
  const asyncSyms = symbolsForModule(refactorMap.symbols, RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH);
  const buttonSyms = symbolsForModule(refactorMap.symbols, RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
  const domainSyms = refactorMap.symbols.filter((sym) => sym.classification === 'extract:domain-function' && sym.targetModule !== undefined);
  const runtimeSyms = refactorMap.symbols.filter((sym) => sym.classification === 'extract:runtime-handler-body' && sym.targetModule !== undefined);

  const helperNames = new Set(commonSyms.map((s) => s.originalName));
  const nonExecRanges = parseResult.ok ? parseResult.nonExecutableRanges : [];
  const nonExecIndex = createOffsetRangeIndex(nonExecRanges.map((r) => r.sourceRange));

  const modulePlans: ModuleBodyPlan[] = [];

  if (commonSyms.length > 0) {
    modulePlans.push(buildCommonHelperModule(commonSyms, source));
  }
  if (globalSyms.length > 0) {
    modulePlans.push(buildHostGlobalModule(globalSyms, source, RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH, refactorMap.modules, helperNames, nonExecIndex));
  }
  if (asyncSyms.length > 0) {
    modulePlans.push(buildHostGlobalModule(asyncSyms, source, RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH, refactorMap.modules, helperNames, nonExecIndex));
  }
  if (buttonSyms.length > 0) {
    modulePlans.push(buildButtonActionModule(buttonSyms, source, refactorMap.modules, helperNames, nonExecIndex));
  }
  for (const [modulePath, symbols] of groupSymbolsByModule(domainSyms)) {
    modulePlans.push(buildDomainFunctionModule(symbols, source, modulePath, refactorMap.modules, helperNames, nonExecIndex));
  }
  for (const [modulePath, symbols] of groupSymbolsByModule(runtimeSyms)) {
    modulePlans.push(buildRuntimeHandlerModule(symbols, source, modulePath, refactorMap.modules, helperNames, commonSyms.map((sym) => sym.sourceRange), nonExecIndex));
  }

  const task10Bindings = editPlan.mainRequireBindings.filter(
    (b) => TASK_10_MODULE_PATHS.has(b.targetModule) || isDomainModulePath(b.targetModule),
  );

  const mainRewritePlan = buildMainRewritePlan(
    source, refactorMap, task10Bindings, editPlan.mainBridgeInsertions, helperNames, nonExecIndex,
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
    lines.push(stripLocalPrefix(sliceSourceRange(source, sym.sourceRange)), '');
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
    let body = sliceSourceRange(source, sym.sourceRange);
    if (needsHelpers && sym.rewriteRefs.some((r) => helperNames.has(r))) {
      body = rewriteBoundReferences(body, helperRewriteMap, sym.sourceRange.startOffset, undefined, nonExecIndex);
    }
    lines.push(`local ${body}`, '');
  }

  for (const sym of sorted) {
    lines.push(`M.${sym.originalName} = ${sym.originalName}`);
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
    exportNames: sorted.map((s) => s.originalName),
    internalRequires,
  };
}

// ─── Runtime handler body modules ─────────────────────────────────

function buildRuntimeHandlerModule(
  symbols: RisuLuaModuleTableSymbolContract[],
  source: string,
  modulePath: string,
  moduleContracts: RisuLuaModuleTableModuleContract[],
  helperNames: Set<string>,
  ignoredShadowRanges: LuaSourceRange[],
  nonExecIndex: OffsetRangeIndex,
): ModuleBodyPlan {
  const sorted = bySourceOrder(symbols);
  const contract = moduleContracts.find((m) => m.path === modulePath);
  const helperRewriteMap = buildRewriteMap(helperNames);
  const needsHelpers = sorted.some((s) => runtimeHandlerBodyUsesHelper(source, s.sourceRange, helperRewriteMap));
  const shadowedScopes = detectShadowedScopes(source, helperNames, ignoredShadowRanges, nonExecIndex);
  const lines: string[] = [];

  if (needsHelpers) {
    lines.push('local __local_helpers = require("common.local_helpers")', '');
  }

  lines.push('local M = {}', '');

  for (const sym of sorted) {
    lines.push(`local ${sym.originalName}`);
  }
  lines.push('');

  for (const sym of sorted) {
    const capturedNames = sym.captures.filter((name) => !helperNames.has(name));
    let body = transformRuntimeHandlerBody(sliceSourceRange(source, sym.sourceRange), sym.originalName, capturedNames);
    if (needsHelpers && runtimeHandlerBodyUsesHelper(source, sym.sourceRange, helperRewriteMap)) {
      body = rewriteBoundReferences(body, helperRewriteMap, sym.sourceRange.startOffset, shadowedScopes, nonExecIndex);
    }
    lines.push(body, '');
  }

  for (const sym of sorted) {
    lines.push(`M.${sym.originalName} = ${sym.originalName}`);
  }
  lines.push('', 'return M');

  const internalRequires = needsHelpers
    ? [{ requireId: 'common.local_helpers', alias: '__local_helpers', text: 'local __local_helpers = require("common.local_helpers")' }]
    : [];

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
  helperNames: Set<string>,
  nonExecIndex: OffsetRangeIndex,
): ModuleBodyPlan {
  const sorted = bySourceOrder(symbols);
  const contract = moduleContracts.find((m) => m.path === modulePath);
  const helperRewriteMap = buildRewriteMap(helperNames);
  const needsHelpers = sorted.some((s) => s.rewriteRefs.some((r) => helperNames.has(r)) || s.captures.some((capture) => helperNames.has(capture)));
  const lines: string[] = [];

  if (needsHelpers) {
    lines.push('local __local_helpers = require("common.local_helpers")', '');
  }

  lines.push('local M = {}', '');

  for (const sym of sorted) {
    let body = stripLocalPrefix(sliceSourceRange(source, sym.sourceRange)).trimEnd();
    if (needsHelpers) {
      body = rewriteBoundReferences(body, helperRewriteMap, sym.sourceRange.startOffset, undefined, nonExecIndex);
    }
    lines.push(body, '', `M.${sym.originalName} = ${sym.originalName}`, '');
  }
  lines.push('return M');

  const internalRequires = needsHelpers
    ? [{ requireId: 'common.local_helpers', alias: '__local_helpers', text: 'local __local_helpers = require("common.local_helpers")' }]
    : [];

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
  helperNames: Set<string>,
  nonExecIndex: OffsetRangeIndex,
): ModuleBodyPlan {
  const sorted = bySourceOrder(symbols);
  const contract = moduleContracts.find((m) => m.path === RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
  const helperRewriteMap = buildRewriteMap(helperNames);
  const needsHelpers = sorted.some((s) => s.rewriteRefs.some((r) => helperNames.has(r)) || s.captures.some((capture) => helperNames.has(capture)));
  const lines: string[] = [];

  if (needsHelpers) {
    lines.push('local __local_helpers = require("common.local_helpers")', '');
  }

  lines.push('local M = {}', '');

  for (const sym of sorted) {
    let body = toLocalModuleFunction(sliceSourceRange(source, sym.sourceRange)).trimEnd();
    if (needsHelpers) {
      body = rewriteBoundReferences(body, helperRewriteMap, sym.sourceRange.startOffset, undefined, nonExecIndex);
    }
    lines.push(body, '', `M.${sym.originalName} = ${sym.originalName}`, '');
  }
  lines.push('return M');

  const internalRequires = needsHelpers
    ? [{ requireId: 'common.local_helpers', alias: '__local_helpers', text: 'local __local_helpers = require("common.local_helpers")' }]
    : [];

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

function toLocalModuleFunction(sourceSlice: string): string {
  const trimmedStart = sourceSlice.replace(/^\s+/, '');
  const leadingWhitespace = sourceSlice.slice(0, sourceSlice.length - trimmedStart.length);
  if (trimmedStart.startsWith('local ')) return stripLocalPrefix(sourceSlice);
  if (/^function\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(trimmedStart)) return `${leadingWhitespace}local ${trimmedStart}`;
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:async\s*\(\s*)?function\b/.test(trimmedStart)) return `${leadingWhitespace}local ${trimmedStart}`;
  return stripLocalPrefix(sourceSlice);
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

function runtimeHandlerBodyUsesHelper(source: string, range: LuaSourceRange, rewriteMap: Map<string, string>): boolean {
  if (rewriteMap.size === 0) return false;
  return scanIdentifierTokens(source.slice(range.startOffset, range.endOffset), rewriteMap, range.startOffset)
    .some((token) => !token.precededByDot);
}

// ─── Main rewrite plan ───────────────────────────────────────────

interface ExtractionPoint {
  range: LuaSourceRange;
  isHostGlobal: boolean;
  bridgeText?: string;
  replacementText?: string;
}

interface ShadowedScope {
  name: string;
  startOffset: number;
  endOffset: number;
}

function buildMainRewritePlan(
  source: string,
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  requireBindings: DryRunPlanResult['editPlan']['mainRequireBindings'],
  bridgeInsertions: DryRunPlanResult['editPlan']['mainBridgeInsertions'],
  helperNames: Set<string>,
  nonExecIndex: OffsetRangeIndex,
): MainRewritePlan {
  const moduleContractsByPath = new Map(refactorMap.modules.map((moduleContract) => [moduleContract.path, moduleContract]));
  const helperRewriteMap = buildRewriteMapForSymbols(refactorMap.symbols, moduleContractsByPath, helperNames);
  const extractionRanges: LuaSourceRange[] = [];
  for (const sym of refactorMap.symbols) {
    if (isExtracted(sym)) extractionRanges.push(sym.sourceRange);
  }
  const shadowedScopes = detectShadowedScopes(source, new Set(helperRewriteMap.keys()), extractionRanges, nonExecIndex);
  const extractions: ExtractionPoint[] = [];
  for (const sym of refactorMap.symbols) {
    if (isExtracted(sym)) {
      const moduleContract = sym.targetModule === undefined ? undefined : moduleContractsByPath.get(sym.targetModule);
      extractions.push({
        range: sym.sourceRange,
        isHostGlobal: sym.globalBridge,
        bridgeText: sym.bridge?.mainAssignment.text,
        replacementText: sym.classification === 'extract:runtime-handler-body' && moduleContract !== undefined
          ? buildRuntimeHandlerShim(
            source.slice(sym.sourceRange.startOffset, sym.sourceRange.endOffset),
            sym.originalName,
            moduleContract.alias,
            sym.captures
              .filter((name) => !helperNames.has(name))
              .map((name) => helperRewriteMap.get(name) ?? name),
          )
          : undefined,
      });
    }
  }
  extractions.sort((a, b) => a.range.startOffset - b.range.startOffset);

  const parts: string[] = [];
  parts.push('-- @generated by risuai-workbench', '-- risulua-split=module-table', '');

  for (const binding of requireBindings) {
    parts.push(binding.text);
  }
  if (requireBindings.length > 0) parts.push('');

  let cursor = 0;
  for (const ext of extractions) {
    if (ext.range.startOffset > cursor) {
      const chunk = source.slice(cursor, ext.range.startOffset);
      parts.push(rewriteBoundReferences(chunk, helperRewriteMap, cursor, shadowedScopes, nonExecIndex));
    }
    if (ext.isHostGlobal && ext.bridgeText) {
      parts.push(ext.bridgeText);
    } else if (ext.replacementText !== undefined) {
      parts.push(ext.replacementText);
    }
    cursor = ext.range.endOffset;
  }

  if (cursor < source.length) {
    const tail = source.slice(cursor);
    parts.push(rewriteBoundReferences(tail, helperRewriteMap, cursor, shadowedScopes, nonExecIndex));
  }

  const fullText = joinMainParts(parts);
  return {
    requireStatements: requireBindings.map((b) => b.text),
    bridgeAssignments: bridgeInsertions.map((b) => b.text),
    preservedSource: parts.slice(4 + requireBindings.length).join(''),
    fullMainText: fullText,
  };
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
): ShadowedScope[] {
  if (helperNames.size === 0) return [];

  const scopes: ShadowedScope[] = [];
  let cursor = 0;
  const len = source.length;

  while (cursor < len) {
    const localIdx = source.indexOf('local', cursor);
    if (localIdx < 0) break;
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
        const endOffset = findBlockEnd(source, absPos, nonExecIndex);
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
  const lineStart = source.lastIndexOf('\n', declPos) + 1;
  const lineEnd = source.indexOf('\n', declPos);
  const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);

  // Simple local variable (not function) — scope is single line
  const isLocalVar = /\blocal\s+\w+\s*=/.test(line) && !/\blocal\s+function\b/.test(line);
  if (isLocalVar) {
    const nextEnd = source.indexOf('\n', declPos);
    return nextEnd === -1 ? source.length : nextEnd;
  }

  // For local function shadowing: scope extends to the end of the enclosing block.
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

function stripLocalPrefix(sourceSlice: string): string { return sourceSlice.replace(/^local\s+/, ''); }

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

function emptyMainRewritePlan(): MainRewritePlan {
  return { requireStatements: [], bridgeAssignments: [], preservedSource: '', fullMainText: '' };
}

function pathToRequireId(modulePath: string): string {
  return modulePath.replace(/^lua\//, '').replace(/\.risulua$/, '').replace(/\//g, '.');
}

function pathToAlias(modulePath: string): string {
  if (modulePath === RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH) return '__host_globals';
  if (modulePath === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH) return '__async_actions';
  if (modulePath === RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH) return '__button_actions';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH) return '__runtime_output';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH) return '__runtime_input';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_START_PATH) return '__runtime_start';
  if (modulePath === RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH) return '__runtime_button';
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
