/**
 * Provider 공통 variable query helper 모음.
 * @file packages/cbs-lsp/src/features/shared/provider-variable-query.ts
 */

import type { Range } from 'risu-workbench-core';

import type {
  FragmentAnalysisRequest,
  FragmentAnalysisService,
  FragmentCursorLookupResult,
} from '../../core';
import type { VariableSymbol, VariableSymbolKind } from '../../analyzer/symbolTable';
import type { VariableFlowQueryResult, VariableFlowService } from '../../services';
import {
  isCrossFileVariableKind,
  mergeLocalFirstSegments,
  resolveVariablePosition,
  type LocalFirstRangeEntry,
  type ResolvedVariablePosition,
} from './local-first-contract';

export type VariableProviderKind = 'definition' | 'references' | 'rename' | 'hover';

export type ProviderVariableEntrySource =
  | 'local-definition'
  | 'local-reference'
  | 'workspace-writer'
  | 'workspace-reader'
  | 'default-definition';

export interface ProviderVariableRangeEntry extends LocalFirstRangeEntry {
  source: ProviderVariableEntrySource;
}

export interface ResolveProviderVariableQueryOptions<TParams> {
  params: TParams;
  position: { line: number; character: number };
  analysisService: FragmentAnalysisService;
  resolveRequest: (params: TParams) => FragmentAnalysisRequest | null;
  variableFlowService: VariableFlowService | null;
}

export interface ProviderVariableQueryResult {
  request: FragmentAnalysisRequest;
  lookup: FragmentCursorLookupResult;
  variablePosition: ResolvedVariablePosition;
  variableName: string;
  kind: VariableSymbolKind;
  symbol: VariableSymbol | null;
  workspaceQuery: VariableFlowQueryResult | null;
  canUseWorkspace: boolean;
}

export interface CollectWorkspaceVariableSegmentsOptions {
  variableFlowService: VariableFlowService | null;
  variableName: string;
  includeWriters: boolean;
  includeReaders: boolean;
  includeDefaultDefinitions: boolean;
}

export interface ProviderWorkspaceVariableSegments {
  writers: ProviderVariableRangeEntry[];
  readers: ProviderVariableRangeEntry[];
  defaultDefinitions: ProviderVariableRangeEntry[];
  query: VariableFlowQueryResult | null;
}

/**
 * resolveProviderVariableQuery 함수.
 * Provider request와 cursor 위치를 공통 variable identity 결과로 해석함.
 *
 * @param options - provider별 request resolver와 service dependency
 * @returns 변수 위치가 해석되면 공통 query result, 아니면 null
 */
export function resolveProviderVariableQuery<TParams>(
  options: ResolveProviderVariableQueryOptions<TParams>,
): ProviderVariableQueryResult | null {
  const request = options.resolveRequest(options.params);
  if (!request) {
    return null;
  }

  const lookup = options.analysisService.locatePosition(request, options.position);
  if (!lookup) {
    return null;
  }

  const variablePosition = resolveVariablePosition(lookup);
  if (!variablePosition) {
    return null;
  }

  const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
  const symbol = symbolTable.getVariable(variablePosition.variableName, variablePosition.kind) ?? null;
  const canUseWorkspace = isCrossFileVariableKind(variablePosition.kind) && Boolean(options.variableFlowService);
  const workspaceQuery = canUseWorkspace
    ? options.variableFlowService?.queryVariable(variablePosition.variableName) ?? null
    : null;

  return {
    request,
    lookup,
    variablePosition,
    variableName: variablePosition.variableName,
    kind: variablePosition.kind,
    symbol,
    workspaceQuery,
    canUseWorkspace,
  };
}

/**
 * shouldAllowDefaultDefinitionForProvider 함수.
 * `.risuvar` default definition을 provider 결과에 포함할지 결정함.
 *
 * @param provider - 호출 provider 종류
 * @param includeDeclaration - references-style declaration 포함 여부
 * @returns default definition 위치를 결과에 포함하면 true
 */
export function shouldAllowDefaultDefinitionForProvider(
  provider: VariableProviderKind,
  includeDeclaration: boolean,
): boolean {
  if (provider === 'definition') {
    return true;
  }

  if (provider === 'references') {
    return includeDeclaration;
  }

  return false;
}

/**
 * collectProviderWorkspaceVariableSegments 함수.
 * VariableFlowService query와 `.risuvar` default 위치를 provider segment로 수집함.
 *
 * @param options - 변수명과 포함 정책
 * @returns writer/reader/default segment와 원본 query result
 */
export function collectProviderWorkspaceVariableSegments(
  options: CollectWorkspaceVariableSegmentsOptions,
): ProviderWorkspaceVariableSegments {
  if (!options.variableFlowService) {
    return { writers: [], readers: [], defaultDefinitions: [], query: null };
  }

  const query = options.variableFlowService.queryVariable(options.variableName);
  const writers = options.includeWriters
    ? (query?.writers ?? []).map((occurrence) => ({
        uri: occurrence.uri,
        range: occurrence.hostRange,
        source: 'workspace-writer' as const,
      }))
    : [];
  const readers = options.includeReaders
    ? (query?.readers ?? []).map((occurrence) => ({
        uri: occurrence.uri,
        range: occurrence.hostRange,
        source: 'workspace-reader' as const,
      }))
    : [];
  const defaultDefinitions = options.includeDefaultDefinitions
    ? options.variableFlowService.getDefaultVariableDefinitions(options.variableName).map((definition) => ({
        uri: definition.uri,
        range: definition.range,
        source: 'default-definition' as const,
      }))
    : [];

  return { writers, readers, defaultDefinitions, query };
}

/**
 * mergeProviderVariableSegments 함수.
 * provider-specific source metadata를 유지한 채 기존 local-first merge 정책을 재사용함.
 *
 * @param segments - precedence 순서의 provider variable segment 목록
 * @returns dedupe/ordering이 적용된 provider variable entries
 */
export function mergeProviderVariableSegments(
  segments: readonly (readonly ProviderVariableRangeEntry[])[],
): ProviderVariableRangeEntry[] {
  return mergeLocalFirstSegments(segments);
}

/**
 * toProviderVariableEntries 함수.
 * Range 목록을 provider metadata가 있는 segment entry로 변환함.
 *
 * @param uri - entry 문서 URI
 * @param ranges - host document 기준 range 목록
 * @param source - entry 출처
 * @returns provider variable range entries
 */
export function toProviderVariableEntries(
  uri: string,
  ranges: readonly Range[],
  source: ProviderVariableEntrySource,
): ProviderVariableRangeEntry[] {
  return ranges.map((range) => ({ uri, range, source }));
}
