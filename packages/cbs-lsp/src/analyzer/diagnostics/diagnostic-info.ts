/**
 * diagnostics payload 생성/정규화 유틸 모음.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/diagnostic-info.ts
 */

import type { DiagnosticInfo, DiagnosticRelatedInfo } from 'risu-workbench-core';

import { compareDiagnostics, compareRanges } from './compare';
import {
  isDiagnosticMachineData,
  normalizeDiagnosticFixes,
  type DiagnosticMachineData,
} from './quick-fix';
import {
  createDiagnosticRuleExplanation,
  DIAGNOSTIC_TAXONOMY,
  DiagnosticCode,
  getDiagnosticDefinition,
} from './taxonomy';

/**
 * createDiagnosticInfo 함수.
 * taxonomy severity와 machine-readable metadata를 붙여 DiagnosticInfo를 생성함.
 *
 * @param code - 생성할 진단의 taxonomy code
 * @param range - 진단이 가리킬 source range
 * @param message - 사용자에게 보여줄 diagnostic message
 * @param relatedInformation - 관련 위치/맥락 설명 목록
 * @param data - rule 외 추가 machine-readable payload
 * @returns taxonomy metadata가 포함된 DiagnosticInfo
 */
export function createDiagnosticInfo(
  code: DiagnosticCode,
  range: DiagnosticInfo['range'],
  message: string,
  relatedInformation?: DiagnosticRelatedInfo[],
  data?: Omit<DiagnosticMachineData, 'rule'>,
): DiagnosticInfo {
  return {
    code,
    data: createDiagnosticMachineData(code, data),
    message,
    range,
    relatedInformation,
    severity: DIAGNOSTIC_TAXONOMY[code].severity,
  };
}

/**
 * normalizeDiagnosticInfo 함수.
 * 외부에서 들어온 diagnostic payload를 taxonomy 기준 shape으로 정규화함.
 *
 * @param diagnostic - 정규화할 원본 diagnostic payload
 * @returns severity/rule/fix ordering이 정리된 diagnostic
 */
export function normalizeDiagnosticInfo(diagnostic: DiagnosticInfo): DiagnosticInfo {
  const definition = getDiagnosticDefinition(diagnostic.code);

  if (!definition) {
    return {
      ...diagnostic,
      data: normalizeDiagnosticMachineData(
        isDiagnosticMachineData(diagnostic.data) ? diagnostic.data : undefined,
      ),
      relatedInformation: normalizeRelatedInformation(diagnostic.relatedInformation),
    };
  }

  return {
    ...diagnostic,
    code: definition.code,
    data: createDiagnosticMachineData(
      definition.code,
      normalizeDiagnosticMachineData(
        isDiagnosticMachineData(diagnostic.data) ? diagnostic.data : undefined,
      ),
    ),
    relatedInformation: normalizeRelatedInformation(diagnostic.relatedInformation),
    severity: definition.severity,
  };
}

/**
 * stabilizeDiagnostics 함수.
 * diagnostics 배열 전체를 정규화한 뒤 deterministic order로 정렬함.
 *
 * @param diagnostics - 정렬/정규화할 diagnostics 배열
 * @returns 안정화된 diagnostics 배열
 */
export function stabilizeDiagnostics(diagnostics: readonly DiagnosticInfo[]): DiagnosticInfo[] {
  return diagnostics.map(normalizeDiagnosticInfo).sort(compareDiagnostics);
}

function createDiagnosticMachineData(
  code: DiagnosticCode,
  data?: Omit<DiagnosticMachineData, 'rule'> | DiagnosticMachineData,
): DiagnosticMachineData {
  const definition = DIAGNOSTIC_TAXONOMY[code];

  return {
    fixes: normalizeDiagnosticMachineData(data)?.fixes,
    rule: {
      ...definition,
      explanation:
        isDiagnosticMachineData(data) && data.rule.explanation
          ? data.rule.explanation
          : createDiagnosticRuleExplanation(definition.owner, definition.category),
    },
  };
}

function normalizeDiagnosticMachineData(
  data?: Omit<DiagnosticMachineData, 'rule'> | DiagnosticMachineData,
): Omit<DiagnosticMachineData, 'rule'> | undefined {
  const fixes = normalizeDiagnosticFixes(data?.fixes);
  return fixes ? { fixes } : undefined;
}

function normalizeRelatedInformation(
  relatedInformation: readonly DiagnosticRelatedInfo[] | undefined,
): DiagnosticRelatedInfo[] | undefined {
  if (!relatedInformation || relatedInformation.length === 0) {
    return undefined;
  }

  return [...relatedInformation].sort((left, right) => {
    return compareRanges(left.range, right.range) || left.message.localeCompare(right.message);
  });
}
