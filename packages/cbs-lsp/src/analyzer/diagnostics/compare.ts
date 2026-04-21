/**
 * diagnostics 안정 정렬 comparator 모음.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/compare.ts
 */

import type { DiagnosticInfo, DiagnosticRelatedInfo, Range } from 'risu-workbench-core';

import type {
  DiagnosticMachineData,
  DiagnosticQuickFix,
  DiagnosticQuickFixSuggestion,
} from './quick-fix';

const DIAGNOSTIC_SEVERITY_ORDER: Readonly<Record<DiagnosticInfo['severity'], number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

/**
 * compareDiagnostics 함수.
 * diagnostics payload를 문서 순서 우선으로 안정 정렬하기 위한 공용 comparator.
 *
 * @param left - 비교할 왼쪽 diagnostic
 * @param right - 비교할 오른쪽 diagnostic
 * @returns 정렬 우선순위 차이값
 */
export function compareDiagnostics(left: DiagnosticInfo, right: DiagnosticInfo): number {
  return (
    compareRanges(left.range, right.range) ||
    compareNumbers(
      DIAGNOSTIC_SEVERITY_ORDER[left.severity],
      DIAGNOSTIC_SEVERITY_ORDER[right.severity],
    ) ||
    compareStrings(left.code, right.code) ||
    compareStrings(left.message, right.message) ||
    compareRelatedInformation(left.relatedInformation ?? [], right.relatedInformation ?? []) ||
    compareDiagnosticMachineData(left.data, right.data)
  );
}

/**
 * compareRanges 함수.
 * source range 두 개를 start/end position 기준으로 비교함.
 *
 * @param left - 비교할 왼쪽 range
 * @param right - 비교할 오른쪽 range
 * @returns 정렬 우선순위 차이값
 */
export function compareRanges(left: Range, right: Range): number {
  return comparePositions(left.start, right.start) || comparePositions(left.end, right.end);
}

/**
 * compareArrays 함수.
 * 공용 item comparator를 이용해 배열을 stable ordering 기준으로 비교함.
 *
 * @param left - 비교할 왼쪽 배열
 * @param right - 비교할 오른쪽 배열
 * @param compareItems - 각 item 비교 함수
 * @returns 정렬 우선순위 차이값
 */
export function compareArrays<T>(
  left: readonly T[],
  right: readonly T[],
  compareItems: (leftItem: T, rightItem: T) => number,
): number {
  const sharedLength = Math.min(left.length, right.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const result = compareItems(left[index]!, right[index]!);
    if (result !== 0) {
      return result;
    }
  }

  return compareNumbers(left.length, right.length);
}

/**
 * compareDiagnosticQuickFixes 함수.
 * quick-fix payload를 deterministic order로 비교함.
 *
 * @param left - 비교할 왼쪽 quick-fix
 * @param right - 비교할 오른쪽 quick-fix
 * @returns 정렬 우선순위 차이값
 */
export function compareDiagnosticQuickFixes(
  left: DiagnosticQuickFix,
  right: DiagnosticQuickFix,
): number {
  return (
    compareStrings(left.title, right.title) ||
    compareStrings(left.editKind, right.editKind) ||
    compareStrings(left.replacement ?? '', right.replacement ?? '') ||
    compareStrings(left.explanation?.reason ?? '', right.explanation?.reason ?? '') ||
    compareStrings(left.explanation?.source ?? '', right.explanation?.source ?? '') ||
    compareStrings(left.explanation?.detail ?? '', right.explanation?.detail ?? '') ||
    compareSuggestionLists(left.suggestions, right.suggestions)
  );
}

/**
 * compareDiagnosticSuggestions 함수.
 * suggestion value/detail을 기준으로 stable ordering comparator를 제공함.
 *
 * @param left - 비교할 왼쪽 suggestion
 * @param right - 비교할 오른쪽 suggestion
 * @returns 정렬 우선순위 차이값
 */
export function compareDiagnosticSuggestions(
  left: DiagnosticQuickFixSuggestion,
  right: DiagnosticQuickFixSuggestion,
): number {
  return compareStrings(left.value, right.value) || compareStrings(left.detail ?? '', right.detail ?? '');
}

function compareDiagnosticMachineData(left: unknown, right: unknown): number {
  const leftMachineData = asDiagnosticMachineData(left);
  const rightMachineData = asDiagnosticMachineData(right);

  if (!leftMachineData && !rightMachineData) {
    return 0;
  }

  if (!leftMachineData) {
    return -1;
  }

  if (!rightMachineData) {
    return 1;
  }

  return compareFixLists(leftMachineData.fixes, rightMachineData.fixes);
}

function compareRelatedInformation(
  left: readonly DiagnosticRelatedInfo[],
  right: readonly DiagnosticRelatedInfo[],
): number {
  return compareArrays(left, right, (leftEntry, rightEntry) => {
    return compareRanges(leftEntry.range, rightEntry.range) || compareStrings(leftEntry.message, rightEntry.message);
  });
}

function compareSuggestionLists(
  left: readonly DiagnosticQuickFixSuggestion[] | undefined,
  right: readonly DiagnosticQuickFixSuggestion[] | undefined,
): number {
  return compareArrays(left ?? [], right ?? [], compareDiagnosticSuggestions);
}

function compareFixLists(
  left: readonly DiagnosticQuickFix[] | undefined,
  right: readonly DiagnosticQuickFix[] | undefined,
): number {
  return compareArrays(left ?? [], right ?? [], compareDiagnosticQuickFixes);
}

function comparePositions(left: Range['start'], right: Range['start']): number {
  return compareNumbers(left.line, right.line) || compareNumbers(left.character, right.character);
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function asDiagnosticMachineData(value: unknown): DiagnosticMachineData | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const machineData = value as Partial<DiagnosticMachineData>;
  if (!machineData.rule || typeof machineData.rule !== 'object') {
    return undefined;
  }

  return typeof machineData.rule.code === 'string' ? (machineData as DiagnosticMachineData) : undefined;
}
