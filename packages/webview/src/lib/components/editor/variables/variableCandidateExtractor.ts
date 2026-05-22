/**
 * Webview fallback 환경용 variable condition candidate 추출 factory.
 * Core의 CBSParser에 의존하지 않고 regex 기반으로 동작합니다.
 * @file packages/webview/src/lib/components/editor/variables/variableCandidateExtractor.ts
 */

import type { MainEditorVariableCandidatePayload } from '../../../types/mainEditor';

/** Null-test sentinel injected into candidate lists for null-aware UX. */
const RISU_TEST_NONNULL_SENTINEL = '__risu_test_nonnull__';
const RISU_TEST_ISNULL_SENTINEL = '__risu_test_isnull__';

const MATH_EXPR_CONDITION_PATTERN = /\{\{\?\s*([\s\S]*?)\s*\}\}/g;
const VAR_COMPARISON_PATTERN = /\{\{(getvar|getglobalvar)::([^}]+)\}\}\s*(==|!=|=|<=|>=|<|>)\s*(\S+)/g;
const REVERSED_VAR_COMPARISON_PATTERN = /(\S+)\s*(==|!=|=|<=|>=|<|>)\s*\{\{(getvar|getglobalvar)::([^}]+)\}\}/g;

/**
 * null/undefined 와의 직접 비교를 감지하는 패턴.
 * {{? {{getvar::x}} != null}}  또는  {{? null == {{getvar::x}}}} 등을 매칭함.
 */
const NULL_TEST_VAR_PATTERN = /\{\{(getvar|getglobalvar)::([^}]+)\}\}\s*(==|!=)\s*(null|undefined)/gi;
const REVERSED_NULL_TEST_PATTERN = /(null|undefined)\s*(==|!=)\s*\{\{(getvar|getglobalvar)::([^}]+)\}\}/gi;

/**
 * 리터럴 값이 의미 있는 candidate로 취급될 수 있는지 검사함.
 * null / undefined는 "값 없음"을 의미하므로 candidate에서 제외함.
 */
function isValidCandidateValue(value: string): boolean {
  const lower = value.toLowerCase();
  return lower !== 'null' && lower !== 'undefined';
}

/**
 * Condition candidate 추출기 인터페이스.
 */
export interface VariableCandidateExtractor {
  /**
   * @param source - 현재 CONTENT editor CBS 원문
   * @returns variableName -> candidate payload[] Map
   */
  extract(source: string): Map<string, MainEditorVariableCandidatePayload[]>;
}

/**
 * Expression 전체를 감싸는 단일 outer parentheses 쌍만 제거함.
 */
function stripOuterCalcParens(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return trimmed;

  let depth = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && index < trimmed.length - 1) return trimmed;
    if (depth < 0) return trimmed;
  }

  return depth === 0 ? trimmed.slice(1, -1).trim() : trimmed;
}

/**
 * Regex 기반 condition candidate 추출기.
 * Webview에서는 core의 CBSParser를 쓸 수 없어 regex fallback을 사용합니다.
 */
class RegexVariableCandidateExtractor implements VariableCandidateExtractor {
  extract(source: string): Map<string, MainEditorVariableCandidatePayload[]> {
    const candidates = new Map<string, MainEditorVariableCandidatePayload[]>();

    for (const mathMatch of source.matchAll(MATH_EXPR_CONDITION_PATTERN)) {
      const expr = stripOuterCalcParens(mathMatch[1]);
      if (!expr) continue;

      for (const match of expr.matchAll(VAR_COMPARISON_PATTERN)) {
        const variableName = match[2]?.trim();
        const value = match[4]?.trim();
        if (variableName && value && isValidCandidateValue(value)) {
          const list = candidates.get(variableName) ?? [];
          if (!list.some((c) => c.value === value)) {
            list.push({ value, source: 'usage', label: value });
          }
          candidates.set(variableName, list);
        }
      }

      for (const match of expr.matchAll(REVERSED_VAR_COMPARISON_PATTERN)) {
        const variableName = match[4]?.trim();
        const value = match[1]?.trim();
        if (variableName && value && isValidCandidateValue(value)) {
          const list = candidates.get(variableName) ?? [];
          if (!list.some((c) => c.value === value)) {
            list.push({ value, source: 'usage', label: value });
          }
          candidates.set(variableName, list);
        }
      }

      // Null-test sentinel injection: when a variable is compared against
      // null/undefined we add special candidates so the user can toggle the
      // null branch without typing raw values manually.
      for (const match of expr.matchAll(NULL_TEST_VAR_PATTERN)) {
        const variableName = match[2]?.trim();
        const operator = match[3];
        if (variableName) {
          const isNotNull = operator === '!=' || operator === '!';
          const sentinel = isNotNull ? RISU_TEST_NONNULL_SENTINEL : RISU_TEST_ISNULL_SENTINEL;
          const label = isNotNull ? '✓ Test non-null' : '✗ Test null';
          const list = candidates.get(variableName) ?? [];
          if (!list.some((c) => c.value === sentinel)) {
            list.push({ value: sentinel, source: 'usage', label });
          }
          candidates.set(variableName, list);
        }
      }

      for (const match of expr.matchAll(REVERSED_NULL_TEST_PATTERN)) {
        const variableName = match[4]?.trim();
        const operator = match[2];
        if (variableName) {
          const isNotNull = operator === '!=' || operator === '!';
          const sentinel = isNotNull ? RISU_TEST_NONNULL_SENTINEL : RISU_TEST_ISNULL_SENTINEL;
          const label = isNotNull ? '✓ Test non-null' : '✗ Test null';
          const list = candidates.get(variableName) ?? [];
          if (!list.some((c) => c.value === sentinel)) {
            list.push({ value: sentinel, source: 'usage', label });
          }
          candidates.set(variableName, list);
        }
      }
    }

    return candidates;
  }
}

/**
 * Regex 기반 VariableCandidateExtractor를 생성하는 factory 함수.
 */
export function createRegexVariableCandidateExtractor(): VariableCandidateExtractor {
  return new RegexVariableCandidateExtractor();
}
