/**
 * `.risuregex` IN/OUT CBS dry-run adapter.
 * @file packages/core/src/simulator/regex/cbs-adapter.ts
 */
import { simulateCbsText } from '../simulate';
import type { CbsSimulationDiagnostic, CbsSimulationResult, CbsSimulationStatus } from '../types';
import type { SimulatorDiagnostic } from './shared';
import type { RegexCbsSectionSimulationInput, RegexCbsSectionSimulationResult } from './types';

const EMPTY_COVERAGE: CbsSimulationResult['coverage'] = {
  totalMacros: 0,
  bySupportClass: {},
  unknownMacros: [],
  byMacroName: {},
};

/**
 * simulateRegexCbsSections 함수.
 * 요청된 `.risuregex` IN/OUT 섹션만 CBS simulator로 dry-run하고 나머지는 원문으로 통과시킴.
 *
 * @param input - pattern/replacement source와 section별 simulation flag
 * @returns section별 raw CBS result와 regex-local combined diagnostics
 */
export function simulateRegexCbsSections(
  input: RegexCbsSectionSimulationInput,
): RegexCbsSectionSimulationResult {
  const pattern = input.simulatePattern
    ? simulateCbsText(input.patternSource, input.context, input.simulationOptions)
    : createPassThroughCbsResult(input.patternSource);
  const replacement = input.simulateReplacement
    ? simulateCbsText(input.replacementSource, input.context, input.simulationOptions)
    : createPassThroughCbsResult(input.replacementSource);

  return {
    status: aggregateStatus([pattern.status, replacement.status]),
    pattern,
    replacement,
    diagnostics: [
      ...mapRequestedDiagnostics(pattern.diagnostics, input.simulatePattern),
      ...mapRequestedDiagnostics(replacement.diagnostics, input.simulateReplacement),
    ],
  };
}

/**
 * createPassThroughCbsResult 함수.
 * simulation이 요청되지 않은 섹션을 CBS result contract의 빈 형태로 감쌈.
 *
 * @param source - 그대로 output에 돌려줄 원본 section source
 * @returns 진단/효과/trace/coverage가 비어 있는 pass-through result
 */
function createPassThroughCbsResult(source: string): CbsSimulationResult {
  return {
    status: 'ok',
    output: source,
    document: {
      nodes: [],
      diagnostics: [],
    },
    diagnostics: [],
    effects: [],
    trace: [],
    coverage: { ...EMPTY_COVERAGE, bySupportClass: {}, unknownMacros: [], byMacroName: {} },
  };
}

/**
 * mapRequestedDiagnostics 함수.
 * 실제 CBS simulation이 실행된 섹션의 diagnostics만 regex-local diagnostics로 변환함.
 *
 * @param diagnostics - CBS simulator가 반환한 parser/simulator diagnostics
 * @param wasRequested - 해당 섹션에 simulation flag가 켜져 있었는지 여부
 * @returns regex-local diagnostic 목록
 */
function mapRequestedDiagnostics(
  diagnostics: readonly CbsSimulationDiagnostic[],
  wasRequested: boolean,
): SimulatorDiagnostic[] {
  if (!wasRequested) {
    return [];
  }
  return diagnostics.map(mapCbsDiagnostic);
}

/**
 * mapCbsDiagnostic 함수.
 * CBS parser/simulator diagnostic을 regex preview diagnostic shape로 변환함.
 *
 * @param diagnostic - CBS diagnostic 원본
 * @returns regex-local diagnostic
 */
function mapCbsDiagnostic(diagnostic: CbsSimulationDiagnostic): SimulatorDiagnostic {
  const details = createDiagnosticDetails(diagnostic);
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    source: `cbs-${diagnostic.source}`,
    range: diagnostic.range,
    ...(details ? { details } : {}),
  };
}

/**
 * createDiagnosticDetails 함수.
 * CBS diagnostic의 부가 정보를 JSON-friendly details로 보존함.
 *
 * @param diagnostic - details 후보 필드가 있는 CBS diagnostic
 * @returns 보존 가능한 details 객체 또는 undefined
 */
function createDiagnosticDetails(
  diagnostic: CbsSimulationDiagnostic,
): Readonly<Record<string, unknown>> | undefined {
  const details: Record<string, unknown> = {};
  if (isRecord(diagnostic.data)) {
    details.data = diagnostic.data;
  }
  if (diagnostic.relatedInformation && diagnostic.relatedInformation.length > 0) {
    details.relatedInformation = diagnostic.relatedInformation;
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * isRecord 함수.
 * unknown diagnostic data를 details에 안전하게 담을 수 있는 record인지 확인함.
 *
 * @param value - 검사할 diagnostic data
 * @returns non-null object이고 array가 아니면 true
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * aggregateStatus 함수.
 * section별 status를 error > aborted > partial > ok 순서로 보수적으로 축약함.
 *
 * @param statuses - pattern/replacement section status 목록
 * @returns aggregate status
 */
function aggregateStatus(statuses: readonly CbsSimulationStatus[]): CbsSimulationStatus {
  if (statuses.includes('error')) {
    return 'error';
  }
  if (statuses.includes('aborted')) {
    return 'aborted';
  }
  if (statuses.includes('partial')) {
    return 'partial';
  }
  return 'ok';
}
