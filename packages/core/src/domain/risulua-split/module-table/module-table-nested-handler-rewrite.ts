/**
 * Nested handler helper rewrite planner (Task 11).
 *
 * Consumes Task 9 dry-run refactor-map output and produces deterministic
 * module body plans for handler-specific nested helpers extracted from
 * runtime handler bodies (onOutput, onInput, onStart, onButtonClick, listenEdit).
 *
 * Dry-run only — no workspace files are written.
 */

import {
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  type RisuLuaModuleTableModuleContract,
  type RisuLuaModuleTableRefactorMapContract,
  type RisuLuaModuleTableSymbolContract,
} from './module-table-contracts';
import type { DryRunPlanResult } from './module-table-refactor-map';
import type { RisuLuaModuleTableParserRange, RisuLuaModuleTableParseResult } from './module-table-parser';
import { sliceSourceRange } from '../shared/source-slice';
import { createOffsetRangeIndex, type OffsetRangeIndex } from '../shared/offset-range-index';
import { scanIdentifierTokens, applyReplacements, type Replacement } from './module-table-identifier-rewrite';

// ─── Public types ────────────────────────────────────────────────

export interface HandlerHelperModulePlan {
  modulePath: string;
  requireId: string;
  alias: string;
  parentHandler: string;
  body: string;
  exportNames: string[];
  parameterizedExports: Array<{
    name: string;
    originalParameters: string[];
    capturedReads: string[];
  }>;
}

export interface HandlerBodyRewritePlan {
  handlerName: string;
  originalSource: string;
  rewrittenSource: string;
  extractedHelpers: string[];
  preservedHelpers: string[];
}

export interface NestedHandlerRewriteResult {
  ok: boolean;
  handlerModulePlans: HandlerHelperModulePlan[];
  handlerBodyRewrites: HandlerBodyRewritePlan[];
  diagnostics: string[];
}

export interface NestedHandlerRewriteInput {
  source: string;
  sourceFile: string;
  dryRunResult: DryRunPlanResult;
  parseResult: RisuLuaModuleTableParseResult;
}

// ─── Handler helper module paths ─────────────────────────────────

const HANDLER_HELPER_PATH_REGEX = /^lua\/handler_helpers\/[^/]+_helpers\.risulua$/;

// ─── Main entry ──────────────────────────────────────────────────

export function planNestedHandlerRewrite(input: NestedHandlerRewriteInput): NestedHandlerRewriteResult {
  const { source, dryRunResult, parseResult } = input;
  const diagnostics = [...dryRunResult.diagnostics];
  const refactorMap = dryRunResult.refactorMap;

  if (!dryRunResult.ok) {
    diagnostics.push('Dry-run result has validation issues; nested handler rewrite planning blocked.');
    return { ok: false, handlerModulePlans: [], handlerBodyRewrites: [], diagnostics };
  }

  // Get all handler helper symbols (those targeting lua/handler_helpers/*)
  const handlerHelperSymbols = refactorMap.symbols.filter(
    (sym) => sym.targetModule && HANDLER_HELPER_PATH_REGEX.test(sym.targetModule),
  );

  // Get all preserved nested handler helpers (those with parent handler info)
  const preservedNestedHelpers = refactorMap.preserved.filter((p) => {
    const symbol = refactorMap.symbols.find((s) => s.id === p.id);
    return symbol?.parent !== undefined && p.reason.startsWith('preserve:');
  });

  const nonExecRanges = parseResult.ok ? parseResult.nonExecutableRanges : [];

  // Build module plans for each handler helper module
  const symbolsByModule = groupSymbolsByModule(handlerHelperSymbols);
  const handlerModulePlans: HandlerHelperModulePlan[] = [];
  for (const [modulePath, symbols] of symbolsByModule) {
    const moduleContract = refactorMap.modules.find((m) => m.path === modulePath);
    if (moduleContract) {
      handlerModulePlans.push(buildHandlerHelperModule(symbols, source, moduleContract));
    }
  }

  // Build handler body rewrite plans for each parent handler
  const handlerNames = new Set([
    ...handlerHelperSymbols.map((s) => s.parent?.name).filter(Boolean),
    ...preservedNestedHelpers.map((p) => {
      const symbol = refactorMap.symbols.find((s) => s.id === p.id);
      return symbol?.parent?.name;
    }).filter(Boolean),
  ]);

  const handlerBodyRewrites: HandlerBodyRewritePlan[] = [];
  for (const handlerName of handlerNames) {
    if (handlerName) {
      const rewrite = buildHandlerBodyRewrite(
        handlerName,
        source,
        refactorMap,
        handlerHelperSymbols,
        preservedNestedHelpers,
        nonExecRanges,
      );
      if (rewrite) {
        handlerBodyRewrites.push(rewrite);
      }
    }
  }

  return { ok: true, handlerModulePlans, handlerBodyRewrites, diagnostics };
}

// ─── Handler helper module builder ────────────────────────────────

function buildHandlerHelperModule(
  symbols: RisuLuaModuleTableSymbolContract[],
  source: string,
  moduleContract: RisuLuaModuleTableModuleContract,
): HandlerHelperModulePlan {
  const sorted = bySourceOrder(symbols);
  const lines: string[] = ['local M = {}', ''];

  // Forward declarations
  for (const sym of sorted) {
    lines.push(`local ${sym.originalName}`);
  }
  lines.push('');

  // Function bodies (transformed based on classification)
  for (const sym of sorted) {
    const body = transformHelperBody(sym, source);
    lines.push(body, '');
  }

  // Exports
  const parameterizedExports: HandlerHelperModulePlan['parameterizedExports'] = [];
  for (const sym of sorted) {
    lines.push(`M.${sym.originalName} = ${sym.originalName}`);
    if (sym.classification === 'extract:parameterized-read-helper') {
      const capturedReads = sym.captures
        .filter((c) => !sym.mutates.includes(c))
        .sort((a, b) => a.localeCompare(b));
      if (capturedReads.length > 0) {
        parameterizedExports.push({
          name: sym.originalName,
          originalParameters: [],
          capturedReads,
        });
      }
    }
  }
  lines.push('', 'return M');

  return {
    modulePath: moduleContract.path,
    requireId: moduleContract.requireId,
    alias: moduleContract.alias,
    parentHandler: sorted[0]?.parent?.name ?? 'unknown',
    body: `${lines.join('\n')}\n`,
    exportNames: sorted.map((s) => s.originalName),
    parameterizedExports,
  };
}

function transformHelperBody(
  sym: RisuLuaModuleTableSymbolContract,
  source: string,
): string {
  const originalBody = sliceSourceRange(source, sym.sourceRange);

  if (sym.classification === 'extract:parameterized-read-helper') {
    return transformParameterizedHelperBody(originalBody, sym);
  }

  return stripLocalPrefix(originalBody);
}

function transformParameterizedHelperBody(
  originalBody: string,
  sym: RisuLuaModuleTableSymbolContract,
): string {
  const capturedReads = sym.captures
    .filter((c) => !sym.mutates.includes(c))
    .sort((a, b) => a.localeCompare(b));

  if (capturedReads.length === 0) {
    return stripLocalPrefix(originalBody);
  }

  const funcDeclMatch = originalBody.match(/^local\s+function\s+(\w+)\s*\(([^)]*)\)/);
  if (funcDeclMatch) {
    const originalName = funcDeclMatch[1];
    const originalParams = funcDeclMatch[2].trim();
    const newParams = originalParams
      ? `${originalParams}, ${capturedReads.join(', ')}`
      : capturedReads.join(', ');

    return originalBody.replace(
      /^local\s+function\s+\w+\s*\([^)]*\)/,
      `function ${originalName}(${newParams})`,
    );
  }

  const assignMatch = originalBody.match(/^local\s+(\w+)\s*=\s*function\s*\(([^)]*)\)/);
  if (assignMatch) {
    const originalName = assignMatch[1];
    const originalParams = assignMatch[2].trim();
    const newParams = originalParams
      ? `${originalParams}, ${capturedReads.join(', ')}`
      : capturedReads.join(', ');

    return originalBody.replace(
      /^local\s+\w+\s*=\s*function\s*\([^)]*\)/,
      `${originalName} = function(${newParams})`,
    );
  }

  return stripLocalPrefix(originalBody);
}

// ─── Handler body rewrite builder ────────────────────────────────

function buildHandlerBodyRewrite(
  handlerName: string,
  source: string,
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  handlerHelperSymbols: RisuLuaModuleTableSymbolContract[],
  preservedNestedHelpers: RisuLuaModuleTableRefactorMapContract['preserved'],
  nonExecRanges: RisuLuaModuleTableParserRange[],
): HandlerBodyRewritePlan | null {
  const runtimeRoot = refactorMap.preserved.find(
    (p) => p.originalName === handlerName && p.reason === 'preserve:top-level-side-effect',
  ) ?? refactorMap.symbols.find(
    (symbol) => symbol.originalName === handlerName && symbol.classification === 'extract:runtime-handler-body',
  );
  if (runtimeRoot === undefined) {
    return null;
  }

  const extractedSymbols = handlerHelperSymbols.filter(
    (sym) => sym.parent?.name === handlerName,
  );

  const preservedForHandler = preservedNestedHelpers.filter((p) => {
    const symbol = refactorMap.symbols.find((s) => s.id === p.id);
    return symbol?.parent?.name === handlerName;
  });

  if (extractedSymbols.length === 0 && preservedForHandler.length === 0) {
    return null;
  }

  const extractedHelpers: string[] = [];
  const preservedHelpers: string[] = [];

  const rewriteMap = new Map<string, string>();
  const parameterizedMap = new Map<string, string[]>();
  const capturedReadAliasMap = buildCapturedReadAliasMap(refactorMap);

  for (const sym of extractedSymbols) {
    if (sym.classification.startsWith('extract:')) {
      extractedHelpers.push(sym.originalName);
      const moduleContract = refactorMap.modules.find((m) => m.path === sym.targetModule);
      const alias = moduleContract?.alias ?? `__${handlerName.replace(/^on/, '').toLowerCase()}_helpers`;
      rewriteMap.set(sym.originalName, `${alias}.${sym.originalName}`);

      if (sym.classification === 'extract:parameterized-read-helper') {
        const capturedReads = sym.captures
          .filter((c) => !sym.mutates.includes(c))
          .sort((a, b) => a.localeCompare(b))
          .map((name) => capturedReadAliasMap.get(name) ?? name);
        parameterizedMap.set(sym.originalName, capturedReads);
      }
    }
  }

  for (const preserved of preservedForHandler) {
    preservedHelpers.push(preserved.originalName);
  }

  const handlerRange = runtimeRoot.sourceRange;
  const handlerBody = sliceSourceRange(source, handlerRange);

  // Step 1: Remove extracted helper declarations from handler body
  const rangesToRemove = extractedSymbols.map((sym) => ({
    startOffset: sym.sourceRange.startOffset - handlerRange.startOffset,
    endOffset: sym.sourceRange.endOffset - handlerRange.startOffset,
  }));

  // Sort by descending offset so removals don't shift later ranges
  rangesToRemove.sort((a, b) => b.startOffset - a.startOffset);

  let bodyWithoutDeclarations = handlerBody;
  for (const range of rangesToRemove) {
    bodyWithoutDeclarations = bodyWithoutDeclarations.slice(0, range.startOffset) + bodyWithoutDeclarations.slice(range.endOffset);
  }

  // Step 2: Rewrite calls to extracted helpers (skipping declaration contexts)
  const relativeNonExecIndex = createOffsetRangeIndex(
    nonExecRanges.map((r) => ({
      startOffset: r.sourceRange.startOffset - handlerRange.startOffset,
      endOffset: r.sourceRange.endOffset - handlerRange.startOffset,
    })),
  );

  const rewrittenBody = rewriteHandlerCalls(
    bodyWithoutDeclarations,
    rewriteMap,
    parameterizedMap,
    relativeNonExecIndex,
    0,
  );

  return {
    handlerName,
    originalSource: handlerBody,
    rewrittenSource: rewrittenBody,
    extractedHelpers,
    preservedHelpers,
  };
}

function buildCapturedReadAliasMap(
  refactorMap: RisuLuaModuleTableRefactorMapContract,
): Map<string, string> {
  const commonContract = refactorMap.modules.find(
    (moduleContract) => moduleContract.path === RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  );
  const aliases = new Map<string, string>();
  if (commonContract === undefined) return aliases;
  for (const symbol of refactorMap.symbols) {
    if (symbol.targetModule === RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH) {
      aliases.set(symbol.originalName, `${commonContract.alias}.${symbol.exportName ?? symbol.originalName}`);
    }
  }
  return aliases;
}

function rewriteHandlerCalls(
  text: string,
  rewriteMap: Map<string, string>,
  parameterizedMap: Map<string, string[]>,
  nonExecIndex: OffsetRangeIndex,
  baseOffset: number,
): string {
  if (rewriteMap.size === 0 || text.length === 0) return text;

  const tokens = scanIdentifierTokens(text, rewriteMap, baseOffset);
  const replacements: Replacement[] = [];

  for (const tok of tokens) {
    // Skip method/table property references (preceded by dot)
    if (tok.precededByDot) continue;

    // Must have '(' after name (with optional whitespace) to be a call site
    if (tok.charAfterWs !== '(') continue;

    const absPos = tok.absStart;

    if (!nonExecIndex.containsOffset(absPos)) {
      // Skip declaration contexts: local function name( or local name = function(
      const beforeMatch = text.slice(0, tok.start);
      const isDeclaration = /local\s+function\s*$/.test(beforeMatch) || /local\s+\w+\s*=\s*function\s*$/.test(beforeMatch);

      if (!isDeclaration) {
        const capturedReads = parameterizedMap.get(tok.name);
        if (capturedReads && capturedReads.length > 0) {
          const openParenPos = tok.end + tok.trailingWs;
          const callEnd = findMatchingParen(text, openParenPos);
          if (callEnd !== -1) {
            const argsContent = text.slice(openParenPos + 1, callEnd).trim();
            const hasArgs = argsContent.length > 0;
            const separator = hasArgs ? ', ' : '';
            const newCallEnd = `${separator}${capturedReads.join(', ')}`;
            replacements.push({ start: callEnd, end: callEnd, replacement: newCallEnd });
          }
        }
        replacements.push({
          start: tok.start,
          end: tok.end,
          replacement: tok.qualified,
        });
      }
    }
  }

  return applyReplacements(text, replacements);
}

function findMatchingParen(text: string, openPos: number): number {
  let depth = 1;
  let pos = openPos + 1;
  while (pos < text.length && depth > 0) {
    if (text[pos] === '(') depth++;
    else if (text[pos] === ')') depth--;
    pos++;
  }
  return depth === 0 ? pos - 1 : -1;
}

// ─── Utility functions ───────────────────────────────────────────

function groupSymbolsByModule(
  symbols: RisuLuaModuleTableSymbolContract[],
): Map<string, RisuLuaModuleTableSymbolContract[]> {
  const byModule = new Map<string, RisuLuaModuleTableSymbolContract[]>();
  for (const sym of symbols) {
    if (sym.targetModule) {
      const existing = byModule.get(sym.targetModule) ?? [];
      existing.push(sym);
      byModule.set(sym.targetModule, existing);
    }
  }
  return byModule;
}

function stripLocalPrefix(sourceSlice: string): string {
  return sourceSlice.replace(/^local\s+/, '');
}

function bySourceOrder(symbols: RisuLuaModuleTableSymbolContract[]): RisuLuaModuleTableSymbolContract[] {
  return [...symbols].sort((a, b) => a.sourceRange.startOffset - b.sourceRange.startOffset);
}
