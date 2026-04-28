/**
 * CBS fragment 진단을 host document diagnostics와 snapshot view로 변환하는 유틸 모음.
 * @file packages/cbs-lsp/src/utils/diagnostics-router.ts
 */

import type { CbsFragmentMap } from 'risu-workbench-core';
import { DiagnosticSeverity, type Diagnostic, type DiagnosticRelatedInformation } from 'vscode-languageserver';

import { DiagnosticCode } from '../analyzer/diagnostics';
import {
  createCbsAgentProtocolMarker,
  createLuaLsCompanionRuntime,
  createNormalizedRuntimeAvailabilitySnapshot,
  createSyntheticDocumentVersion,
  fragmentAnalysisService,
  type NormalizedRuntimeAvailabilitySnapshot,
  type FragmentAnalysisVersion,
  type LuaLsCompanionRuntime,
  type RuntimeOperatorContractOptions,
} from '../core';
import type {
  VariableFlowQueryResult,
  VariableFlowService,
} from '../services/variable-flow-service';
import { positionToOffset } from './position';
import type { FragmentAnalysisRequest } from '../core';
import { resolveVariablePosition } from '../features/local-first-contract';
import {
  createDiagnosticForFragment,
  mapFragmentDiagnosticsToHost,
} from './diagnostics/fragment-diagnostic-policy';
import { createWorkspaceVariableDiagnosticsForUri } from './diagnostics/workspace-issue-policy';

export { createDiagnosticForFragment };
export { createWorkspaceVariableDiagnosticsForUri };

export interface DiagnosticsFallbackTraceStats {
  attempts: number;
  hits: number;
  misses: number;
  durationMs: number;
  byCode: Record<string, number>;
}

interface DiagnosticFallbackMemo {
  readonly cache: Map<string, VariableFlowQueryResult | null>;
  readonly stats: DiagnosticsFallbackTraceStats;
}

export interface DiagnosticDocumentContext {
  uri?: string;
  version?: FragmentAnalysisVersion;
}

export interface NormalizedHostDiagnosticRelatedInformationSnapshot {
  message: string;
  range: DiagnosticRelatedInformation['location']['range'];
  uri: string;
}

export interface NormalizedHostDiagnosticSnapshot {
  code: string | null;
  data: Diagnostic['data'] | null;
  message: string;
  range: Diagnostic['range'];
  relatedInformation: NormalizedHostDiagnosticRelatedInformationSnapshot[];
  severity: DiagnosticSeverity | null;
  source: string | null;
}

export interface NormalizedHostDiagnosticsEnvelopeSnapshot {
  schema: string;
  schemaVersion: string;
  availability: NormalizedRuntimeAvailabilitySnapshot;
  diagnostics: NormalizedHostDiagnosticSnapshot[];
}

/**
 * mapDocumentToCbsFragments 함수.
 * 문서 텍스트를 fragment analysis service에 태워 CBS fragment map만 추출함.
 *
 * @param filePath - fragment 분석 대상으로 볼 문서 경로
 * @param content - fragment를 추출할 원문 텍스트
 * @param context - URI/version을 덮어쓸 선택적 문서 문맥
 * @returns CBS-bearing 문서면 fragment map, 아니면 null
 */
export function mapDocumentToCbsFragments(
  filePath: string,
  content: string,
  context: DiagnosticDocumentContext = {},
): CbsFragmentMap | null {
  return (
    fragmentAnalysisService.analyzeDocument({
      uri: context.uri ?? filePath,
      version: context.version ?? createSyntheticDocumentVersion(content),
      filePath,
      text: content,
    })?.fragmentMap ?? null
  );
}

/**
 * compareRelatedInformationForHost 함수.
 * relatedInformation 목록을 host range와 message 기준으로 안정적으로 정렬함.
 *
 * @param left - 비교할 왼쪽 related information
 * @param right - 비교할 오른쪽 related information
 * @returns 정렬 순서를 위한 비교값
 */
function compareRelatedInformationForHost(
  left: DiagnosticRelatedInformation,
  right: DiagnosticRelatedInformation,
): number {
  return (
    comparePositions(left.location.range.start, right.location.range.start) ||
    comparePositions(left.location.range.end, right.location.range.end) ||
    left.message.localeCompare(right.message)
  );
}

/**
 * compareDiagnosticsForHost 함수.
 * host diagnostics를 range/severity/code/message 순으로 deterministic 정렬함.
 *
 * @param left - 비교할 왼쪽 diagnostic
 * @param right - 비교할 오른쪽 diagnostic
 * @returns 정렬 순서를 위한 비교값
 */
function compareDiagnosticsForHost(left: Diagnostic, right: Diagnostic): number {
  const leftCode = typeof left.code === 'string' ? left.code : String(left.code ?? '');
  const rightCode = typeof right.code === 'string' ? right.code : String(right.code ?? '');

  return (
    compareNumbers(left.range.start.line, right.range.start.line) ||
    compareNumbers(left.range.start.character, right.range.start.character) ||
    compareNumbers(left.range.end.line, right.range.end.line) ||
    compareNumbers(left.range.end.character, right.range.end.character) ||
    compareNumbers(left.severity ?? 0, right.severity ?? 0) ||
    leftCode.localeCompare(rightCode) ||
    left.message.localeCompare(right.message)
  );
}

/**
 * comparePositions 함수.
 * LSP position 두 개를 line/character 기준으로 비교함.
 *
 * @param left - 비교할 왼쪽 position
 * @param right - 비교할 오른쪽 position
 * @returns 정렬 순서를 위한 비교값
 */
function comparePositions(
  left: Diagnostic['range']['start'],
  right: Diagnostic['range']['start'],
): number {
  return compareNumbers(left.line, right.line) || compareNumbers(left.character, right.character);
}

/**
 * compareNumbers 함수.
 * 숫자 오름차순 정렬에 쓸 기본 비교값을 계산함.
 *
 * @param left - 비교할 왼쪽 숫자
 * @param right - 비교할 오른쪽 숫자
 * @returns left-right 차이값
 */
function compareNumbers(left: number, right: number): number {
  return left - right;
}

/**
 * sortHostDiagnostics 함수.
 * host diagnostics 배열을 snapshot/test 친화적인 고정 순서로 정렬함.
 *
 * @param diagnostics - 정렬할 diagnostics 배열
 * @returns 복사 후 정렬된 diagnostics 배열
 */
function sortHostDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(compareDiagnosticsForHost);
}

/**
 * normalizeHostDiagnosticForSnapshot 함수.
 * LSP Diagnostic 한 건을 deterministic snapshot 비교용 평탄 구조로 바꿈.
 *
 * @param diagnostic - snapshot view로 정규화할 host diagnostic
 * @returns stable field shape를 가진 normalized diagnostic
 */
export function normalizeHostDiagnosticForSnapshot(
  diagnostic: Diagnostic,
): NormalizedHostDiagnosticSnapshot {
  return {
    code: diagnostic.code === undefined ? null : String(diagnostic.code),
    data: diagnostic.data ?? null,
    message: diagnostic.message,
    range: diagnostic.range,
    relatedInformation: [...(diagnostic.relatedInformation ?? [])]
      .sort(compareRelatedInformationForHost)
      .map((entry) => ({
        message: entry.message,
        range: entry.location.range,
        uri: entry.location.uri,
      })),
    severity: diagnostic.severity ?? null,
    source: diagnostic.source ?? null,
  };
}

/**
 * normalizeHostDiagnosticsForSnapshot 함수.
 * host diagnostics 배열 전체를 정렬 후 normalized snapshot 배열로 바꿈.
 *
 * @param diagnostics - 정규화할 host diagnostics 배열
 * @returns deterministic ordering이 적용된 normalized diagnostics 배열
 */
export function normalizeHostDiagnosticsForSnapshot(
  diagnostics: readonly Diagnostic[],
): NormalizedHostDiagnosticSnapshot[] {
  return sortHostDiagnostics(diagnostics).map(normalizeHostDiagnosticForSnapshot);
}

/**
 * normalizeHostDiagnosticsEnvelopeForSnapshot 함수.
 * host diagnostics normalized view에 공통 runtime availability contract를 함께 붙임.
 *
 * @param diagnostics - 정규화할 host diagnostics 배열
 * @returns diagnostics와 availability snapshot을 함께 담은 deterministic JSON view
 */
export function normalizeHostDiagnosticsEnvelopeForSnapshot(
  diagnostics: readonly Diagnostic[],
  lualsRuntime: LuaLsCompanionRuntime = createLuaLsCompanionRuntime(),
  operatorOptions: RuntimeOperatorContractOptions = {},
): NormalizedHostDiagnosticsEnvelopeSnapshot {
  return {
    ...createCbsAgentProtocolMarker(),
    availability: createNormalizedRuntimeAvailabilitySnapshot(lualsRuntime, operatorOptions),
    diagnostics: normalizeHostDiagnosticsForSnapshot(diagnostics),
  };
}

/**
 * routeDiagnosticsForDocument 함수.
 * 문서 전체를 분석해서 host document에 publish할 CBS diagnostics 배열을 만듦.
 *
 * @param filePath - diagnostics를 계산할 문서 경로
 * @param content - analyzer에 넘길 현재 문서 텍스트
 * @param options - 기존 호출부와의 호환을 유지하는 예약 옵션 슬롯
 * @param context - URI/version을 덮어쓸 선택적 문서 문맥
 * @returns non-CBS면 빈 배열, 아니면 host range 기준 Diagnostic 배열
 */
export function routeDiagnosticsForDocument(
  filePath: string,
  content: string,
  _options: Record<string, boolean> = {},
  context: DiagnosticDocumentContext = {},
): Diagnostic[] {
  const analysis = fragmentAnalysisService.analyzeDocument({
    uri: context.uri ?? filePath,
    version: context.version ?? createSyntheticDocumentVersion(content),
    filePath,
    text: content,
  });

  if (!analysis || analysis.fragmentAnalyses.length === 0) {
    return [];
  }

  const documentUri = context.uri ?? filePath;
  return sortHostDiagnostics(
    analysis.fragmentAnalyses
    .flatMap((fragmentAnalysis) => mapFragmentDiagnosticsToHost(content, documentUri, fragmentAnalysis))
  );
}

export { sortHostDiagnostics };

/**
 * shouldKeepLocalSymbolDiagnostic 함수.
 * workspace readers/writers가 있으면 local-only 변수 진단을 억제할지 판단함.
 *
 * @param diagnostic - 현재 문서에서 계산된 local diagnostic
 * @param request - diagnostic이 속한 fragment analysis request
 * @param variableFlowService - cross-file variable 관계를 조회할 Layer 3 서비스
 * @returns local diagnostic를 그대로 유지해야 하면 true
 */
export function shouldKeepLocalSymbolDiagnostic(
  diagnostic: Diagnostic,
  request: FragmentAnalysisRequest,
  variableFlowService: VariableFlowService,
  fallbackMemo?: DiagnosticFallbackMemo,
): boolean {
  if (
    diagnostic.code !== DiagnosticCode.UndefinedVariable &&
    diagnostic.code !== DiagnosticCode.UnusedVariable
  ) {
    return true;
  }

  const variableQuery =
    variableFlowService.queryAt(
      request.uri,
      positionToOffset(request.text, diagnostic.range.start),
    ) ?? resolveDiagnosticVariableQuery(diagnostic, request, variableFlowService, fallbackMemo);

  if (!variableQuery) {
    return true;
  }

  if (diagnostic.code === DiagnosticCode.UndefinedVariable) {
    return variableQuery.writers.length === 0 && variableQuery.defaultValue === null;
  }

  return variableQuery.readers.length === 0;
}

/**
 * resolveDiagnosticVariableQuery 함수.
 * Graph occurrence가 없는 `.risulua` CBS macro 인자 진단을 이름 기반 workspace query로 보강함.
 *
 * @param diagnostic - local symbol diagnostic 한 건
 * @param request - 진단이 발생한 host document 분석 요청
 * @param variableFlowService - workspace 변수 흐름 조회 서비스
 * @returns workspace variable query 결과 또는 null
 */
function resolveDiagnosticVariableQuery(
  diagnostic: Diagnostic,
  request: FragmentAnalysisRequest,
  variableFlowService: VariableFlowService,
  fallbackMemo?: DiagnosticFallbackMemo,
): VariableFlowQueryResult | null {
  if (!shouldAttemptDiagnosticVariableFallback(diagnostic, request)) {
    return null;
  }

  const code = String(diagnostic.code ?? 'unknown');
  const cacheKey = [
    request.uri,
    request.version,
    code,
    diagnostic.range.start.line,
    diagnostic.range.start.character,
    diagnostic.range.end.line,
    diagnostic.range.end.character,
  ].join(':');

  if (fallbackMemo?.cache.has(cacheKey)) {
    return fallbackMemo.cache.get(cacheKey) ?? null;
  }

  const startedAt = performance.now();
  if (fallbackMemo) {
    fallbackMemo.stats.attempts += 1;
    fallbackMemo.stats.byCode[code] = (fallbackMemo.stats.byCode[code] ?? 0) + 1;
  }

  const lookup = fragmentAnalysisService.locatePosition(request, diagnostic.range.start);
  if (!lookup) {
    recordDiagnosticFallbackResult(fallbackMemo, cacheKey, null, startedAt);
    return null;
  }

  const variablePosition = resolveVariablePosition(lookup);
  if (!variablePosition || variablePosition.kind !== 'chat') {
    recordDiagnosticFallbackResult(fallbackMemo, cacheKey, null, startedAt);
    return null;
  }

  const result = variableFlowService.queryVariable(variablePosition.variableName);
  recordDiagnosticFallbackResult(fallbackMemo, cacheKey, result, startedAt);
  return result;
}

/**
 * shouldAttemptDiagnosticVariableFallback 함수.
 * `.risulua` CBS chat variable argument 진단에만 이름 기반 fallback을 허용함.
 *
 * @param diagnostic - fallback 후보 local diagnostic
 * @param request - 진단이 발생한 host document 분석 요청
 * @returns fallback을 시도해도 되는 조건이면 true
 */
function shouldAttemptDiagnosticVariableFallback(
  diagnostic: Diagnostic,
  request: FragmentAnalysisRequest,
): boolean {
  if (
    diagnostic.code !== DiagnosticCode.UndefinedVariable &&
    diagnostic.code !== DiagnosticCode.UnusedVariable
  ) {
    return false;
  }

  return request.filePath.toLowerCase().endsWith('.risulua');
}

/**
 * recordDiagnosticFallbackResult 함수.
 * diagnostics publish 한 번의 fallback cache와 tracing stats를 갱신함.
 *
 * @param fallbackMemo - publish-scope fallback memoization 상태
 * @param cacheKey - URI/version/range/code 기반 fallback key
 * @param result - fallback query 결과
 * @param startedAt - fallback 시작 시각
 */
function recordDiagnosticFallbackResult(
  fallbackMemo: DiagnosticFallbackMemo | undefined,
  cacheKey: string,
  result: VariableFlowQueryResult | null,
  startedAt: number,
): void {
  if (!fallbackMemo) {
    return;
  }

  fallbackMemo.cache.set(cacheKey, result);
  fallbackMemo.stats.durationMs += performance.now() - startedAt;
  if (result) {
    fallbackMemo.stats.hits += 1;
  } else {
    fallbackMemo.stats.misses += 1;
  }
}

export interface AssembleDiagnosticsOptions {
  localDiagnostics: Diagnostic[];
  workspaceVariableFlowService: VariableFlowService | null;
  request: FragmentAnalysisRequest;
  fallbackTraceStats?: DiagnosticsFallbackTraceStats;
}

/**
 * assembleDiagnosticsForRequest 함수.
 * local diagnostics와 workspace-level diagnostics를 병합해 정렬된 최종 diagnostics 배열을 만듦.
 * 이 함수는 순수/순수-유사한 diagnostics 조립 로직만 담당하며, server orchestration이나 transport와는 분리됨.
 *
 * @param options - 조립에 필요한 local diagnostics, workspace service, request 정보
 * @returns 필터링 및 병합, 정렬이 완료된 diagnostics 배열
 */
export function assembleDiagnosticsForRequest(
  options: AssembleDiagnosticsOptions,
): Diagnostic[] {
  const { localDiagnostics, workspaceVariableFlowService, request } = options;
  const fallbackMemo = options.fallbackTraceStats
    ? {
        cache: new Map<string, VariableFlowQueryResult | null>(),
        stats: options.fallbackTraceStats,
      }
    : undefined;

  const filteredLocalDiagnostics = workspaceVariableFlowService
    ? localDiagnostics.filter((diagnostic) =>
        shouldKeepLocalSymbolDiagnostic(diagnostic, request, workspaceVariableFlowService, fallbackMemo),
      )
    : localDiagnostics;

  const workspaceDiagnostics = workspaceVariableFlowService
    ? createWorkspaceVariableDiagnosticsForUri(request.uri, workspaceVariableFlowService)
    : [];

  return sortHostDiagnostics([...filteredLocalDiagnostics, ...workspaceDiagnostics]);
}
