/**
 * CBS condition block에서 variable-literal 비교 후보를 추출하는 factory 패턴입니다.
 * @file packages/core/src/domain/cbs/condition-candidates.ts
 */

import type { BlockNode, CBSNode } from './parser/ast';
import { CBSParser } from './parser/parser';
import { walkAST } from './parser/visitor';

const CONDITIONAL_BLOCK_KINDS = new Set(['if', 'if_pure', 'when']);
const VAR_MACRO_PATTERN = /\{\{(getvar|getglobalvar)::([^}]+)\}\}/g;
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

export type ConditionCandidate = { variableName: string; value: string };

interface CbsMacroCall {
  name: string;
  args: string[];
}

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

function addUniqueCandidate(
  candidates: ConditionCandidate[],
  seen: Set<string>,
  variableName: string | undefined,
  value: string,
): void {
  const cleanVariableName = variableName?.trim();
  if (!cleanVariableName) return;

  const key = `${cleanVariableName}\u0000${value}`;
  if (seen.has(key)) return;

  seen.add(key);
  candidates.push({ variableName: cleanVariableName, value });
}

function serializeCbsNodes(nodes: readonly CBSNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'PlainText') return node.value;
      if (node.type === 'MathExpr') return `{{? ${node.expression}}}`;
      if (node.type === 'Comment') return `{{//${node.value}}}`;
      if (node.type === 'Block') return `{{#${node.kind}::${serializeCbsNodes(node.condition)}}}`;
      return `{{${node.name}${node.arguments.map((argument) => `::${serializeCbsNodes(argument)}`).join('')}}}`;
    })
    .join('');
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

/**
 * Extracts static plain text from a sequence of CBS nodes.
 * Returns the trimmed text if ALL nodes are PlainText, otherwise undefined.
 */
function extractStaticPlainText(nodes: readonly CBSNode[]): string | undefined {
  if (nodes.length === 0) return undefined;

  for (const node of nodes) {
    if (node.type !== 'PlainText') return undefined;
  }

  return nodes.map((node) => (node as { value: string }).value).join('').trim() || undefined;
}

function extractVariableLiteralCandidate(
  left: string,
  right: string,
): ConditionCandidate | undefined {
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

function extractWhenComparisonMacroCandidate(segment: string): ConditionCandidate | undefined {
  const macro = parseCbsMacroCall(segment);
  if (!macro || !WHEN_COMPARISON_MACROS.has(macro.name.toLowerCase()) || macro.args.length < 2) {
    return undefined;
  }

  return extractVariableLiteralCandidate(macro.args[0], macro.args[1]);
}

function extractWhenConditionCandidates(conditionSource: string): ConditionCandidate[] {
  const candidates: ConditionCandidate[] = [];
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

/**
 * Condition candidate 추출기 인터페이스.
 * CBS 텍스트에서 variable과 literal 값의 비교 후보를 추출합니다.
 */
export interface ConditionCandidateExtractor {
  /**
   * @param text - 분석할 CBS 텍스트
   * @returns { variableName, value } 후보 목록
   */
  extract(text: string): ConditionCandidate[];
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
    if (
      twoChar === '==' ||
      twoChar === '!=' ||
      twoChar === '<=' ||
      twoChar === '>=' ||
      twoChar === '=>'
    ) {
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
 * Checks whether a math expression is a genuinely simple truthiness check:
 * exactly one getvar/getglobalvar macro and nothing else, optionally wrapped
 * in whitespace and/or a single pair of outer parentheses.
 * Rejects expressions with any extra token/operator: + 1, &&, ||, etc.
 */
function isSimpleTruthinessExpression(expression: string): boolean {
  const trimmed = expression.trim();
  const stripped = stripOuterCalcParens(trimmed);
  return parseVariableReadMacro(stripped) !== undefined;
}

/**
 * AST 기반 condition candidate 추출기.
 * CBSParser를 사용해 정확한 AST를 파싱한 후 MathExprNode를 분석합니다.
 */
class AstConditionCandidateExtractor implements ConditionCandidateExtractor {
  extract(text: string): ConditionCandidate[] {
    const candidates: ConditionCandidate[] = [];
    if (typeof text !== 'string' || text.length === 0) return candidates;

    try {
      const document = new CBSParser().parse(text);
      const seen = new Set<string>();

      walkAST(document.nodes, {
        visitBlock(node: BlockNode) {
          if (!CONDITIONAL_BLOCK_KINDS.has(node.kind)) return;

          if (node.kind === 'when') {
            for (const candidate of extractWhenConditionCandidates(
              serializeCbsNodes(node.condition),
            )) {
              addUniqueCandidate(candidates, seen, candidate.variableName, candidate.value);
            }
          }

          for (const conditionNode of node.condition) {
            // Simple truthiness check: #if {{getvar::x}} or #if {{getglobalvar::y}}
            // where the condition is a bare macro call (no {{? }} wrapper).
            // Only for if/if_pure — #when has its own candidate extraction logic.
            if (conditionNode.type === 'MacroCall' && node.kind !== 'when') {
              const macroName = conditionNode.name.toLowerCase();
              if (
                (macroName === 'getvar' || macroName === 'getglobalvar') &&
                conditionNode.arguments.length > 0
              ) {
                const key = extractStaticPlainText(conditionNode.arguments[0]);
                if (key) {
                  addUniqueCandidate(candidates, seen, key, '0');
                  addUniqueCandidate(candidates, seen, key, '1');
                }
              }
              continue;
            }

            if (conditionNode.type !== 'MathExpr') continue;

            const strippedExpression = stripOuterCalcParens(conditionNode.expression);
            const split = splitTopLevelCalcComparison(strippedExpression);

            const varMatches = [...conditionNode.expression.matchAll(VAR_MACRO_PATTERN)];
            if (varMatches.length === 0) continue;

            // Simple truthiness check: #if {{? {{getvar::x}}} or #if {{? {{getglobalvar::y}}}
            // with no comparison operator → treat as boolean toggle (0/1 candidates).
            // Only applies when the expression is genuinely just a single variable read
            // (optionally wrapped in outer parens), NOT arbitrary math like +1 or &&.
            if (!split) {
              if (isSimpleTruthinessExpression(strippedExpression)) {
                for (const match of varMatches) {
                  addUniqueCandidate(candidates, seen, match[2], '0');
                  addUniqueCandidate(candidates, seen, match[2], '1');
                }
              }
              continue;
            }

            const cleanLeft = split.left.replace(VAR_MACRO_PATTERN, '').trim();
            const cleanRight = split.right.replace(VAR_MACRO_PATTERN, '').trim();

            if (cleanLeft === '' && cleanRight !== '' && isValidCandidateValue(cleanRight)) {
              for (const match of varMatches) {
                addUniqueCandidate(candidates, seen, match[2], cleanRight);
              }
            } else if (cleanRight === '' && cleanLeft !== '' && isValidCandidateValue(cleanLeft)) {
              for (const match of varMatches) {
                addUniqueCandidate(candidates, seen, match[2], cleanLeft);
              }
            }

            // Inject null-test sentinels so the UI can offer quick toggles for
            // the null / non-null branches without exposing "null" as a literal candidate.
            const isNullLiteral = (v: string) =>
              v.toLowerCase() === 'null' || v.toLowerCase() === 'undefined';
            const nullSide =
              cleanLeft === '' && isNullLiteral(cleanRight)
                ? 'right'
                : cleanRight === '' && isNullLiteral(cleanLeft)
                  ? 'left'
                  : null;
            if (
              nullSide &&
              (split.operator === '==' || split.operator === '!=' || split.operator === '=')
            ) {
              const isNotNull = split.operator === '!=';
              const sentinel = isNotNull ? RISU_TEST_NONNULL_SENTINEL : RISU_TEST_ISNULL_SENTINEL;
              for (const match of varMatches) {
                addUniqueCandidate(candidates, seen, match[2], sentinel);
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
