import { expect } from "vitest";
import {
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  analyzeRisuLuaModuleTable,
  classifyRisuLuaModuleTableDecisions,
  createEmptyRisuLuaModuleTableHostEffects,
  findTopLevelLocalTableDeclarations,
  parseRisuLuaModuleTableSource,
  planDryRunRefactorMap,
  planTopLevelRewrite,
  type DryRunPlanResult,
  type NestedHandlerRewriteResult,
  type RisuLuaModuleTableDomainGenerationOption,
  type RisuLuaModuleTableRefactorMapContract,
  type TopLevelRewriteResult,
} from '../../src/domain/risulua-split';

export function lines(sourceLines: string[]): string {
  return `${sourceLines.join('\n')}\n`;
}

export async function planFixture(source: string, options?: { domainGeneration?: RisuLuaModuleTableDomainGenerationOption; sourceFile?: string }): Promise<DryRunPlanResult> {
  const parseResult = await parseRisuLuaModuleTableSource(source);
  const analyzerResult = analyzeRisuLuaModuleTable({ source, parseResult });
  const variableStoreNames = findTopLevelLocalTableDeclarations(source).map((declaration) => declaration.name);
  const sourceFile = options?.sourceFile ?? 'legacy/original.risulua';
  const classificationResult = classifyRisuLuaModuleTableDecisions({
    source,
    sourceFile,
    analyzerResult,
    domainGeneration: options?.domainGeneration,
    variableStoreNames,
  });
  return planDryRunRefactorMap({
    source,
    sourceFile,
    parseResult,
    classificationResult,
  });
}

export function createSyntheticRefactorMapWithOverlap(): RisuLuaModuleTableRefactorMapContract {
  const overlappingRange = { startLine: 1, endLine: 3, startOffset: 0, endOffset: 60 };
  return {
    version: 1,
    mode: 'module-table',
    sourceFile: 'test.risulua',
    modules: [
      {
        path: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
        requireId: 'common.local_helpers',
        alias: '__local_helpers',
        category: 'common-helper',
        exports: ['helperA', 'helperB'],
      },
    ],
    symbols: [
      {
        id: 'symbol:helperA',
        originalName: 'helperA',
        declarationKind: 'top-level-local-function',
        sourceRange: overlappingRange,
        classification: 'extract:pure-helper',
        targetModule: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
        exportName: 'helperA',
        globalBridge: false,
        captures: [],
        mutates: [],
        hostEffects: createEmptyRisuLuaModuleTableHostEffects(),
        rewriteRefs: [],
      },
      {
        id: 'symbol:helperB',
        originalName: 'helperB',
        declarationKind: 'top-level-local-function',
        sourceRange: { startLine: 2, endLine: 3, startOffset: 30, endOffset: 60 },
        classification: 'extract:pure-helper',
        targetModule: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
        exportName: 'helperB',
        globalBridge: false,
        captures: [],
        mutates: [],
        hostEffects: createEmptyRisuLuaModuleTableHostEffects(),
        rewriteRefs: [],
      },
    ],
    preserved: [],
    domainCandidates: [],
  };
}

export function createSyntheticOverlappingEditPlan() {
  return {
    edits: [
      {
        id: 'edit:move:symbol:helperA',
        intent: 'extract-symbol' as const,
        symbolId: 'symbol:helperA',
        symbolName: 'helperA',
        sourceRange: { startLine: 1, endLine: 3, startOffset: 0, endOffset: 60 },
        targetModule: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
        classification: 'extract:pure-helper' as const,
      },
      {
        id: 'edit:move:symbol:helperB',
        intent: 'extract-symbol' as const,
        symbolId: 'symbol:helperB',
        symbolName: 'helperB',
        sourceRange: { startLine: 2, endLine: 3, startOffset: 30, endOffset: 60 },
        targetModule: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
        classification: 'extract:pure-helper' as const,
      },
    ],
    moduleContracts: [{
      path: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
      requireId: 'common.local_helpers',
      alias: '__local_helpers',
      category: 'common-helper' as const,
      exports: ['helperA', 'helperB'],
    }],
    mainPreservedRanges: [],
    mainBridgeInsertions: [],
    mainRequireBindings: [],
  };
}

export async function rewriteFixture(source: string, options?: { domainGeneration?: RisuLuaModuleTableDomainGenerationOption; sourceFile?: string }): Promise<TopLevelRewriteResult> {
  const dryRunResult = await planFixture(source, options);
  const parseResult = await parseRisuLuaModuleTableSource(source);
  const variableStoreNames = findTopLevelLocalTableDeclarations(source).map((declaration) => declaration.name);
  return planTopLevelRewrite({
    source,
    sourceFile: options?.sourceFile ?? 'legacy/original.risulua',
    dryRunResult,
    parseResult,
    variableStoreNames,
  });
}

export async function nestedHandlerRewriteFixture(source: string): Promise<NestedHandlerRewriteResult> {
  const dryRunResult = await planFixture(source);
  const parseResult = await parseRisuLuaModuleTableSource(source);
  const { planNestedHandlerRewrite } = await import('../../src/domain/risulua-split');
  return planNestedHandlerRewrite({
    source,
    sourceFile: 'legacy/original.risulua',
    dryRunResult,
    parseResult,
  });
}

// ─── Nested handler test accessors ─────────────────────────────────

export function getOutputHelpers(result: NestedHandlerRewriteResult) {
  return result.handlerModulePlans.find((m) => m.modulePath === 'lua/handler_helpers/output_helpers.risulua');
}

export function getInputHelpers(result: NestedHandlerRewriteResult) {
  return result.handlerModulePlans.find((m) => m.modulePath === 'lua/handler_helpers/input_helpers.risulua');
}

export function getListenerHelpers(result: NestedHandlerRewriteResult) {
  return result.handlerModulePlans.find((m) => m.modulePath === 'lua/handler_helpers/listen_edit_helpers.risulua');
}

export function getButtonHelpers(result: NestedHandlerRewriteResult) {
  return result.handlerModulePlans.find((m) => m.modulePath === 'lua/handler_helpers/button_click_helpers.risulua');
}

export function getHandlerRewrite(result: NestedHandlerRewriteResult, handlerName: string) {
  return result.handlerBodyRewrites.find((r) => r.handlerName === handlerName);
}

// ─── Common assertion helpers ────────────────────────────────────────

export function assertModuleStructure(module: { body: string; exportNames: string[] }, exportName: string) {
  expect(module.exportNames).toContain(exportName);
  expect(module.body).toContain('local M = {}');
  expect(module.body).toContain(`local ${exportName}`);
  expect(module.body).toContain(`M.${exportName} = ${exportName}`);
  expect(module.body).toContain('return M');
  const localMCount = (module.body.match(/local M = \{\}/g) ?? []).length;
  const returnMCount = (module.body.match(/return M/g) ?? []).length;
  expect(localMCount).toBe(1);
  expect(returnMCount).toBe(1);
}

export function assertParameterizedExport(
  module: { parameterizedExports: Array<{ name: string; capturedReads: string[] }> },
  name: string,
  capturedReads: string[],
) {
  const paramExport = module.parameterizedExports.find((p) => p.name === name);
  expect(paramExport).toBeDefined();
  expect(paramExport!.capturedReads).toEqual(capturedReads);
}
