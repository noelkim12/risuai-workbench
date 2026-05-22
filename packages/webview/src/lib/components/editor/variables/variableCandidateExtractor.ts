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



const VAR_COMPARISON_PATTERN =
  /\{\{(getvar|getglobalvar)::([^}]+)\}\}\s*(==|!=|=|<=|>=|<|>)\s*(\S+)/g;
const REVERSED_VAR_COMPARISON_PATTERN =
  /(\S+)\s*(==|!=|=|<=|>=|<|>)\s*\{\{(getvar|getglobalvar)::([^}]+)\}\}/g;
const WHEN_DIRECT_COMPARISON_OPERATORS = new Set(['is', 'isnot', '>', '<', '>=', '<=']);
const WHEN_CHAT_VARIABLE_OPERATORS = new Set(['vis', 'visnot']);
const WHEN_TOGGLE_LITERAL_OPERATORS = new Set(['tis', 'tisnot']);
const WHEN_TOGGLE_BOOLEAN_CANDIDATES = ['0', '1'] as const;
const WHEN_COMPARISON_MACROS = new Set([
  'equal',
  'notequal',
  'not_equal',
  'greater',
  'less',
  'greaterequal',
  'greater_equal',
  'lessequal',
  'less_equal',
]);

interface CbsMacroCall {
  name: string;
  args: string[];
}

/**
 * null/undefined 와의 직접 비교를 감지하는 패턴.
 * {{? {{getvar::x}} != null}}  또는  {{? null == {{getvar::x}}}} 등을 매칭함.
 */
const NULL_TEST_VAR_PATTERN =
  /\{\{(getvar|getglobalvar)::([^}]+)\}\}\s*(==|!=)\s*(null|undefined)/gi;
const REVERSED_NULL_TEST_PATTERN =
  /(null|undefined)\s*(==|!=)\s*\{\{(getvar|getglobalvar)::([^}]+)\}\}/gi;

/**
 * 리터럴 값이 의미 있는 candidate로 취급될 수 있는지 검사함.
 * null / undefined는 "값 없음"을 의미하므로 candidate에서 제외함.
 */
function isValidCandidateValue(value: string): boolean {
  const lower = value.toLowerCase();
  return lower !== 'null' && lower !== 'undefined';
}

function addUsageCandidate(
  candidates: Map<string, MainEditorVariableCandidatePayload[]>,
  variableName: string | undefined,
  value: string,
  label = value,
): void {
  const cleanVariableName = variableName?.trim();
  if (!cleanVariableName) return;

  const list = candidates.get(cleanVariableName) ?? [];
  if (!list.some((candidate) => candidate.value === value)) {
    list.push({ value, source: 'usage', label });
  }
  candidates.set(cleanVariableName, list);
}

function splitTopLevelCbsSegments(body: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let segmentStart = 0;

  for (let index = 0; index < body.length; index += 1) {
    if (body.startsWith('{{', index)) {
      depth += 1;
      index += 1;
      continue;
    }
    if (body.startsWith('}}', index)) {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }
    if (depth === 0 && body.startsWith('::', index)) {
      segments.push(body.slice(segmentStart, index));
      index += 1;
      segmentStart = index + 1;
    }
  }

  segments.push(body.slice(segmentStart));
  return segments;
}

function parseCbsMacroCall(source: string): CbsMacroCall | undefined {
  const trimmed = source.trim();
  if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}')) return undefined;

  const body = trimmed.slice(2, -2).trim();
  const segments = splitTopLevelCbsSegments(body);
  const name = segments.shift()?.trim();
  if (!name) return undefined;

  return { name, args: segments.map((segment) => segment.trim()) };
}

function parseVariableReadMacro(source: string): string | undefined {
  const macro = parseCbsMacroCall(source);
  const name = macro?.name.toLowerCase();
  if (name !== 'getvar' && name !== 'getglobalvar') return undefined;

  const variableName = macro?.args[0]?.trim();
  if (!variableName || variableName.includes('{{') || variableName.includes('}}')) return undefined;
  return variableName;
}

function parseRuntimeContextMacro(source: string): 'chatIndex' | undefined {
  const normalized = source.trim().toLowerCase().replace(/\s+/gu, '');
  if (normalized === '{{chat_index}}' || normalized === '{{chatindex}}') return 'chatIndex';
  return undefined;
}

function isStaticCandidateLiteral(source: string): boolean {
  const value = source.trim();
  return (
    value.length > 0 &&
    !value.includes('{{') &&
    !value.includes('}}') &&
    isValidCandidateValue(value)
  );
}

function extractVariableLiteralCandidate(
  left: string,
  right: string,
): { variableName: string; value: string } | undefined {
  const leftVariable = parseVariableReadMacro(left);
  const rightVariable = parseVariableReadMacro(right);
  const cleanLeft = left.trim();
  const cleanRight = right.trim();

  if (leftVariable && !rightVariable && isStaticCandidateLiteral(cleanRight)) {
    return { variableName: leftVariable, value: cleanRight };
  }
  if (rightVariable && !leftVariable && isStaticCandidateLiteral(cleanLeft)) {
    return { variableName: rightVariable, value: cleanLeft };
  }
  return undefined;
}

function extractWhenComparisonMacroCandidate(
  segment: string,
): { variableName: string; value: string } | undefined {
  const macro = parseCbsMacroCall(segment);
  if (!macro || !WHEN_COMPARISON_MACROS.has(macro.name.toLowerCase()) || macro.args.length < 2) {
    return undefined;
  }

  return extractVariableLiteralCandidate(macro.args[0], macro.args[1]);
}

function extractWhenConditionCandidates(
  conditionSource: string,
): Array<{ variableName: string; value: string }> {
  const candidates: Array<{ variableName: string; value: string }> = [];
  const segments = splitTopLevelCbsSegments(conditionSource)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const candidate = extractWhenComparisonMacroCandidate(segment);
    if (candidate) candidates.push(candidate);
  }

  if (segments.length === 2 && segments[0].toLowerCase() === 'toggle') {
    for (const value of WHEN_TOGGLE_BOOLEAN_CANDIDATES) {
      candidates.push({ variableName: segments[1], value });
    }
  }

  for (let index = 0; index + 2 < segments.length; index += 1) {
    const operator = segments[index + 1].toLowerCase();
    if (
      WHEN_CHAT_VARIABLE_OPERATORS.has(operator) &&
      isStaticCandidateLiteral(segments[index + 2])
    ) {
      candidates.push({ variableName: segments[index], value: segments[index + 2].trim() });
      continue;
    }

    if (
      WHEN_TOGGLE_LITERAL_OPERATORS.has(operator) &&
      isStaticCandidateLiteral(segments[index + 2])
    ) {
      candidates.push({ variableName: segments[index], value: segments[index + 2].trim() });
      continue;
    }

    if (!WHEN_DIRECT_COMPARISON_OPERATORS.has(operator)) continue;

    const leftContext = parseRuntimeContextMacro(segments[index]);
    const rightContext = parseRuntimeContextMacro(segments[index + 2]);
    if (leftContext && !rightContext && isStaticCandidateLiteral(segments[index + 2])) {
      candidates.push({ variableName: leftContext, value: segments[index + 2].trim() });
      continue;
    }
    if (rightContext && !leftContext && isStaticCandidateLiteral(segments[index])) {
      candidates.push({ variableName: rightContext, value: segments[index].trim() });
      continue;
    }

    const candidate = extractVariableLiteralCandidate(segments[index], segments[index + 2]);
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractWhenConditionSources(source: string): string[] {
  const conditions: string[] = [];
  let searchStart = 0;

  while (searchStart < source.length) {
    const openIndex = source.indexOf('{{#when', searchStart);
    if (openIndex === -1) break;

    const closeIndex = findMacroClose(source, openIndex);
    if (closeIndex === -1) break;

    const body = source.slice(openIndex + 2, closeIndex - 2).trim();
    const condition = extractWhenConditionFromHeader(body);
    if (condition) conditions.push(condition);
    searchStart = closeIndex;
  }

  return conditions;
}

function findMacroClose(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length - 1; index += 1) {
    if (source.startsWith('{{', index)) {
      depth += 1;
      index += 1;
      continue;
    }
    if (source.startsWith('}}', index)) {
      depth -= 1;
      index += 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function extractWhenConditionFromHeader(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed.startsWith('#when')) return undefined;

  const rest = trimmed.slice('#when'.length).trim();
  if (!rest) return undefined;

  if (!rest.startsWith('::')) return rest;

  const segments = splitTopLevelCbsSegments(rest.slice(2)).map((segment) => segment.trim());
  if (segments[0]?.toLowerCase() === 'keep' || segments[0]?.toLowerCase() === 'legacy') {
    segments.shift();
  }
  return segments.join('::').trim() || undefined;
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
          addUsageCandidate(candidates, variableName, value);
        }
      }

      for (const match of expr.matchAll(REVERSED_VAR_COMPARISON_PATTERN)) {
        const variableName = match[4]?.trim();
        const value = match[1]?.trim();
        if (variableName && value && isValidCandidateValue(value)) {
          addUsageCandidate(candidates, variableName, value);
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
          addUsageCandidate(candidates, variableName, sentinel, label);
        }
      }

      for (const match of expr.matchAll(REVERSED_NULL_TEST_PATTERN)) {
        const variableName = match[4]?.trim();
        const operator = match[2];
        if (variableName) {
          const isNotNull = operator === '!=' || operator === '!';
          const sentinel = isNotNull ? RISU_TEST_NONNULL_SENTINEL : RISU_TEST_ISNULL_SENTINEL;
          const label = isNotNull ? '✓ Test non-null' : '✗ Test null';
          addUsageCandidate(candidates, variableName, sentinel, label);
        }
      }

      // Simple truthiness check inside {{? }}: e.g. {{? {{getvar::x}}}} or
      // {{? ({{getvar::x}})}}. Only inject 0/1 when the expression is
      // genuinely just a single variable read macro (optionally wrapped in
      // outer parens), NOT arbitrary math like +1 or &&.
      const simpleTruthinessVar = parseVariableReadMacro(stripOuterCalcParens(expr));
      if (simpleTruthinessVar) {
        // Skip if this expression also matched a comparison pattern (handled above).
        const hasComparison =
          VAR_COMPARISON_PATTERN.test(expr) || REVERSED_VAR_COMPARISON_PATTERN.test(expr);

        // Reset lastIndex for subsequent uses.
        VAR_COMPARISON_PATTERN.lastIndex = 0;
        REVERSED_VAR_COMPARISON_PATTERN.lastIndex = 0;

        if (!hasComparison) {
          addUsageCandidate(candidates, simpleTruthinessVar, '0');
          addUsageCandidate(candidates, simpleTruthinessVar, '1');
        }
      }
    }

    for (const conditionSource of extractWhenConditionSources(source)) {
      for (const candidate of extractWhenConditionCandidates(conditionSource)) {
        addUsageCandidate(candidates, candidate.variableName, candidate.value);
      }
    }

    // Simple truthiness check outside {{? }} wrapper:
    // #if {{getvar::x}} or #if {{getglobalvar::y}} where the variable macro
    // is the direct condition (not inside a math expression).
    const BARE_TRUTHINESS_PATTERN =
      /\{\{#(if|if_pure)\s*\{\{(getvar|getglobalvar)::([^}]+)\}\}\s*\}\}/g;
    for (const match of source.matchAll(BARE_TRUTHINESS_PATTERN)) {
      const variableName = match[3]?.trim();
      if (!variableName) continue;
      addUsageCandidate(candidates, variableName, '0');
      addUsageCandidate(candidates, variableName, '1');
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
