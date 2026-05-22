/**
 * CBS condition block에서 variable-literal 비교 후보를 추출하는 factory 패턴입니다.
 * @file packages/core/src/domain/cbs/condition-candidates.ts
 */

import type { BlockNode } from './parser/ast';
import { CBSParser } from './parser/parser';
import { walkAST } from './parser/visitor';

const CONDITIONAL_BLOCK_KINDS = new Set(['if', 'if_pure', 'when']);
const VAR_MACRO_PATTERN = /\{\{(getvar|getglobalvar)::([^}]+)\}\}/g;

/** Null-test sentinels shared with the webview layer. */
const RISU_TEST_NONNULL_SENTINEL = '__risu_test_nonnull__';
const RISU_TEST_ISNULL_SENTINEL = '__risu_test_isnull__';

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
 * CBS 텍스트에서 variable과 literal 값의 비교 후보를 추출합니다.
 */
export interface ConditionCandidateExtractor {
  /**
   * @param text - 분석할 CBS 텍스트
   * @returns { variableName, value } 후보 목록
   */
  extract(text: string): Array<{ variableName: string; value: string }>;
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
 * CBS condition expression에서 top-level comparison operator를 찾아 좌/우 피연산자를 분리함.
 */
function splitTopLevelCalcComparison(
  expression: string,
): { left: string; operator: string; right: string } | undefined {
  let depth = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;

    const twoChar = expression.slice(index, index + 2);
    if (twoChar === '==' || twoChar === '!=' || twoChar === '<=' || twoChar === '>=' || twoChar === '=>') {
      return {
        left: expression.slice(0, index),
        operator: twoChar,
        right: expression.slice(index + 2),
      };
    }
    if (char === '=' || char === '<' || char === '>') {
      return {
        left: expression.slice(0, index),
        operator: char,
        right: expression.slice(index + 1),
      };
    }
  }
  return undefined;
}

/**
 * AST 기반 condition candidate 추출기.
 * CBSParser를 사용해 정확한 AST를 파싱한 후 MathExprNode를 분석합니다.
 */
class AstConditionCandidateExtractor implements ConditionCandidateExtractor {
  extract(text: string): Array<{ variableName: string; value: string }> {
    const candidates: Array<{ variableName: string; value: string }> = [];
    if (typeof text !== 'string' || text.length === 0) return candidates;

    try {
      const document = new CBSParser().parse(text);
      const seen = new Set<string>();

      walkAST(document.nodes, {
        visitBlock(node: BlockNode) {
          if (!CONDITIONAL_BLOCK_KINDS.has(node.kind)) return;

          for (const conditionNode of node.condition) {
            if (conditionNode.type !== 'MathExpr') continue;

            const strippedExpression = stripOuterCalcParens(conditionNode.expression);
            const split = splitTopLevelCalcComparison(strippedExpression);
            if (!split) continue;

            const varMatches = [...conditionNode.expression.matchAll(VAR_MACRO_PATTERN)];
            if (varMatches.length === 0) continue;

            const cleanLeft = split.left.replace(VAR_MACRO_PATTERN, '').trim();
            const cleanRight = split.right.replace(VAR_MACRO_PATTERN, '').trim();

            if (cleanLeft === '' && cleanRight !== '' && isValidCandidateValue(cleanRight)) {
              for (const match of varMatches) {
                const variableName = match[2]?.trim();
                const key = `${variableName}\u0000${cleanRight}`;
                if (variableName && !seen.has(key)) {
                  seen.add(key);
                  candidates.push({ variableName, value: cleanRight });
                }
              }
            } else if (cleanRight === '' && cleanLeft !== '' && isValidCandidateValue(cleanLeft)) {
              for (const match of varMatches) {
                const variableName = match[2]?.trim();
                const key = `${variableName}\u0000${cleanLeft}`;
                if (variableName && !seen.has(key)) {
                  seen.add(key);
                  candidates.push({ variableName, value: cleanLeft });
                }
              }
            }

            // Inject null-test sentinels so the UI can offer quick toggles for
            // the null / non-null branches without exposing "null" as a literal candidate.
            const isNullLiteral = (v: string) => v.toLowerCase() === 'null' || v.toLowerCase() === 'undefined';
            const nullSide = cleanLeft === '' && isNullLiteral(cleanRight) ? 'right'
              : cleanRight === '' && isNullLiteral(cleanLeft) ? 'left'
                : null;
            if (nullSide && (split.operator === '==' || split.operator === '!=' || split.operator === '=')) {
              const isNotNull = split.operator === '!=';
              const sentinel = isNotNull ? RISU_TEST_NONNULL_SENTINEL : RISU_TEST_ISNULL_SENTINEL;
              for (const match of varMatches) {
                const variableName = match[2]?.trim();
                const key = `${variableName}\u0000${sentinel}`;
                if (variableName && !seen.has(key)) {
                  seen.add(key);
                  candidates.push({ variableName, value: sentinel });
                }
              }
            }
          }
        },
      });

      return candidates;
    } catch {
      return candidates;
    }
  }
}

/**
 * AST 기반 ConditionCandidateExtractor를 생성하는 factory 함수.
 */
export function createAstConditionCandidateExtractor(): ConditionCandidateExtractor {
  return new AstConditionCandidateExtractor();
}
