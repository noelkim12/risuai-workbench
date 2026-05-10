import type { RisuLuaModuleTableDeclarationKind, RisuLuaModuleTableHostEffects } from './module-table-contracts';
import type { RisuLuaModuleTableParseResult, RisuLuaModuleTableParserRange } from './module-table-parser';
import type { LuaSourceRange } from '../shared/types';

export type RisuLuaModuleTableScopeKind = 'module' | 'function' | 'handler' | 'listener' | 'block';
export type RisuLuaModuleTableWrapperKind = 'plain-function' | 'async-wrapper' | 'listen-edit-callback' | 'procedural';
export type RisuLuaModuleTableRuntimeRootKind = 'handler-function' | 'handler-assignment' | 'async-handler-assignment' | 'listener-registration';
export type RisuLuaModuleTablePublicGlobalKind = 'function-declaration' | 'function-assignment' | 'async-function-assignment';

export interface RisuLuaModuleTableAnalyzerInput {
  source: string;
  parseResult: RisuLuaModuleTableParseResult;
}

export interface RisuLuaModuleTableScopeFact {
  id: string;
  kind: RisuLuaModuleTableScopeKind;
  name: string;
  parentId?: string;
  sourceRange: LuaSourceRange;
}

export interface RisuLuaModuleTableReferenceFact {
  name: string;
  sourceRange: LuaSourceRange;
  scopeId: string;
  resolvedScopeId?: string;
  accessPath?: string;
}

export interface RisuLuaModuleTableMutationFact {
  name: string;
  sourceRange: LuaSourceRange;
  scopeId: string;
  resolvedScopeId?: string;
  accessPath?: string;
  mutatesCapturedBinding: boolean;
  mutatesCapturedTable: boolean;
}

export interface RisuLuaModuleTableCallSiteFact {
  name: string;
  sourceRange: LuaSourceRange;
  scopeId: string;
}

export interface RisuLuaModuleTableLexicalSymbolFact {
  id: string;
  originalName: string;
  declarationKind: RisuLuaModuleTableDeclarationKind;
  scopeId: string;
  parentScopeId?: string;
  sourceRange: LuaSourceRange;
  wrapperKind: RisuLuaModuleTableWrapperKind;
  parameters: string[];
  localDeclarations: string[];
  references: RisuLuaModuleTableReferenceFact[];
  captures: string[];
  mutations: RisuLuaModuleTableMutationFact[];
  mutates: string[];
  hostEffects: RisuLuaModuleTableHostEffects;
  callSites: RisuLuaModuleTableCallSiteFact[];
  executableRange?: RisuLuaModuleTableParserRange;
}

export interface RisuLuaModuleTableRuntimeRootFact {
  id: string;
  name: string;
  kind: RisuLuaModuleTableRuntimeRootKind;
  wrapperKind: RisuLuaModuleTableWrapperKind;
  sourceRange: LuaSourceRange;
  hostEffects: RisuLuaModuleTableHostEffects;
}

export interface RisuLuaModuleTablePublicGlobalFact {
  id: string;
  name: string;
  kind: RisuLuaModuleTablePublicGlobalKind;
  sourceRange: LuaSourceRange;
  hostVisible: true;
  wrapperKind: RisuLuaModuleTableWrapperKind;
  hostEffects: RisuLuaModuleTableHostEffects;
}

export interface RisuLuaModuleTableNestedHandlerHelperFact {
  symbolId: string;
  name: string;
  parentHandler: {
    name: string;
    kind: 'handler' | 'listener';
    sourceRange: LuaSourceRange;
  };
  wrapperKind: RisuLuaModuleTableWrapperKind;
  sourceRange: LuaSourceRange;
  parameters: string[];
  captures: string[];
  mutations: RisuLuaModuleTableMutationFact[];
  hostEffects: RisuLuaModuleTableHostEffects;
  callSites: RisuLuaModuleTableCallSiteFact[];
}

export interface RisuLuaModuleTableProceduralBlockFact {
  id: string;
  name: string;
  sourceRange: LuaSourceRange;
  hostEffects: RisuLuaModuleTableHostEffects;
  extractable: false;
}

export interface RisuLuaModuleTableAnalyzerResult {
  ok: boolean;
  scopes: RisuLuaModuleTableScopeFact[];
  lexicalSymbols: RisuLuaModuleTableLexicalSymbolFact[];
  runtimeRoots: RisuLuaModuleTableRuntimeRootFact[];
  publicGlobals: RisuLuaModuleTablePublicGlobalFact[];
  nestedHandlerHelpers: RisuLuaModuleTableNestedHandlerHelperFact[];
  proceduralBlocks: RisuLuaModuleTableProceduralBlockFact[];
  hostEffects: RisuLuaModuleTableHostEffects;
  diagnostics: string[];
}

export interface ExecutableRangeIndex {
  exact: Map<string, RisuLuaModuleTableParserRange>;
  sorted: RisuLuaModuleTableParserRange[];
}

export interface AnalyzerState {
  source: string;
  lineStarts: number[];
  executableRanges: RisuLuaModuleTableParserRange[];
  executableRangeIndex: ExecutableRangeIndex;
  scopes: RisuLuaModuleTableScopeFact[];
  lexicalSymbols: RisuLuaModuleTableLexicalSymbolFact[];
  runtimeRoots: RisuLuaModuleTableRuntimeRootFact[];
  publicGlobals: RisuLuaModuleTablePublicGlobalFact[];
  nestedHandlerHelpers: RisuLuaModuleTableNestedHandlerHelperFact[];
  proceduralBlocks: RisuLuaModuleTableProceduralBlockFact[];
  symbolSequence: number;
  scopeSequence: number;
}

export interface ScopeFrame {
  fact: RisuLuaModuleTableScopeFact;
  parent?: ScopeFrame;
  declared: Set<string>;
  functionParameters: Set<string>;
}

export interface HandlerContext {
  name: string;
  kind: 'handler' | 'listener';
  sourceRange: LuaSourceRange;
}

export interface FunctionAnalysis {
  parameters: string[];
  localDeclarations: string[];
  references: RisuLuaModuleTableReferenceFact[];
  captures: string[];
  mutations: RisuLuaModuleTableMutationFact[];
  mutates: string[];
  hostEffects: RisuLuaModuleTableHostEffects;
  callSites: RisuLuaModuleTableCallSiteFact[];
}
