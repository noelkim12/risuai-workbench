/**
 * Local symbol diagnostic suppression과 fallback trace 정책 모음.
 * @file packages/cbs-lsp/src/utils/diagnostics/suppression-policy.ts
 */

import type { Diagnostic } from 'vscode-languageserver';

import { DiagnosticCode } from '../../analyzer/diagnostics';
import { fragmentAnalysisService, type FragmentAnalysisRequest } from '../../core';
import { resolveVariablePosition } from '../../features/shared';
import type {
  VariableFlowQueryResult,
  VariableFlowService,
} from '../../services/variable-flow-service';
import { offsetToPosition, positionToOffset } from '../position';

export interface DiagnosticsFallbackTraceStats {
  attempts: number;
  hits: number;
  misses: number;
  durationMs: number;
  byCode: Record<string, number>;
}

export interface DiagnosticFallbackMemo {
  readonly cache: Map<string, VariableFlowQueryResult | null>;
  readonly stats: DiagnosticsFallbackTraceStats;
}

/**
 * createDiagnosticsFallbackMemo 함수.
 * publish 한 번에 공유할 fallback cache와 trace stats를 묶음.
 *
 * @param stats - DiagnosticsPublisher trace에 반영할 누적 통계 객체
 * @returns suppression fallback 조회에서 공유할 memo 상태
 */
export function createDiagnosticsFallbackMemo(
  stats: DiagnosticsFallbackTraceStats,
): DiagnosticFallbackMemo {
  stats.byCode[DiagnosticCode.UndefinedVariable] ??= 0;

  return {
    cache: new Map<string, VariableFlowQueryResult | null>(),
    stats,
  };
}

/**
 * shouldKeepLocalSymbolDiagnostic 함수.
 * workspace readers/writers/default 값이 있으면 local-only 변수 진단을 억제할지 판단함.
 *
 * @param diagnostic - 현재 문서에서 계산된 local diagnostic
 * @param request - diagnostic이 속한 fragment analysis request
 * @param variableFlowService - cross-file variable 관계를 조회할 Layer 3 서비스
 * @param fallbackMemo - `.risulua` 이름 기반 fallback cache와 trace 상태
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
    variableFlowService.queryAt(request.uri, positionToOffset(request.text, diagnostic.range.start)) ??
    resolveDiagnosticVariableQuery(diagnostic, request, variableFlowService, fallbackMemo);

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
 * @param fallbackMemo - publish-scope fallback memoization 상태
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

  const variableName =
    resolveDiagnosticVariablePosition(diagnostic, request)?.variableName ??
    extractDiagnosticVariableName(diagnostic);
  if (!variableName) {
    recordDiagnosticFallbackResult(fallbackMemo, cacheKey, null, startedAt);
    return null;
  }

  const result = variableFlowService.queryVariable(variableName);
  recordDiagnosticFallbackResult(fallbackMemo, cacheKey, result, startedAt);
  return result;
}

/**
 * resolveDiagnosticVariablePosition 함수.
 * diagnostic range 내부에서 CBS chat variable 인자 위치를 찾아냄.
 *
 * @param diagnostic - local symbol diagnostic 한 건
 * @param request - 진단이 발생한 host document 분석 요청
 * @returns chat variable 위치 정보 또는 null
 */
function resolveDiagnosticVariablePosition(
  diagnostic: Diagnostic,
  request: FragmentAnalysisRequest,
): ReturnType<typeof resolveVariablePosition> {
  const startOffset = positionToOffset(request.text, diagnostic.range.start);
  const endOffset = positionToOffset(request.text, diagnostic.range.end);

  for (let offset = startOffset; offset <= endOffset; offset += 1) {
    const lookup = fragmentAnalysisService.locatePosition(request, offsetToPosition(request.text, offset));
    const variablePosition = lookup ? resolveVariablePosition(lookup) : null;
    if (variablePosition?.kind === 'chat') {
      return variablePosition;
    }
  }

  return null;
}

/**
 * extractDiagnosticVariableName 함수.
 * fragment cursor lookup이 없는 fallback 진단에서 변수명을 message로 보강 추출함.
 *
 * @param diagnostic - local symbol diagnostic 한 건
 * @returns message에 담긴 변수명 또는 null
 */
function extractDiagnosticVariableName(diagnostic: Diagnostic): string | null {
  const match = /Variable "([^"]+)"/.exec(diagnostic.message);
  return match?.[1]?.trim() || null;
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
