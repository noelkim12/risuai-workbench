/**
 * Calc/math expression evaluator for the CBS simulator.
 * Pure recursive-descent parser supporting logical operators,
 * comparisons, legacy not-equals shorthand, unary not, and
 * arithmetic with operator precedence.
 * @file packages/core/src/domain/cbs/simulator/expressions/calc.ts
 */

type CalcComparisonOperator = '=' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '=>';
type CalcEqualityOperand =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'nullish' };

interface CalcComparisonSplit {
  readonly left: string;
  readonly operator: CalcComparisonOperator;
  readonly right: string;
}

interface CalcLogicalSplit {
  readonly left: string;
  readonly operator: '&&' | '||';
  readonly right: string;
}

/**
 * splitTopLevelCalcLogical 함수.
 * Parentheses 내부를 제외한 마지막 logical operator를 찾음.
 *
 * @param expression - logical 연산자를 찾을 calc expression
 * @returns top-level logical 분해 결과 또는 undefined
 */
function splitTopLevelCalcLogical(expression: string): CalcLogicalSplit | undefined {
  let depth = 0;
  for (let index = expression.length - 1; index >= 0; index -= 1) {
    const char = expression[index];
    if (char === ')') {
      depth += 1;
      continue;
    }
    if (char === '(') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;

    const operator = expression.slice(index - 1, index + 1);
    if (operator === '&&' || operator === '||') {
      return {
        left: expression.slice(0, index - 1),
        operator,
        right: expression.slice(index + 1),
      };
    }
  }
  return undefined;
}

/**
 * stripOuterCalcParens 함수.
 * Expression 전체를 감싸는 단일 outer parentheses 쌍만 제거함.
 *
 * @param expression - outer parentheses 제거 후보 expression
 * @returns outer parentheses가 제거된 expression 또는 trimmed 원본
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
 * findMatchingCalcParen 함수.
 * Calc expression에서 주어진 여는 괄호에 대응하는 닫는 괄호 위치를 찾음.
 *
 * @param expression - matching parenthesis를 찾을 calc expression
 * @param openIndex - 여는 괄호가 위치한 index
 * @returns 대응하는 닫는 괄호 index, 없으면 -1
 */
function findMatchingCalcParen(expression: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

/**
 * splitTopLevelCalcComparison 함수.
 * Parentheses 내부를 제외한 첫 comparison operator를 찾음.
 *
 * @param expression - 비교 연산자를 찾을 calc expression
 * @returns top-level comparison 분해 결과 또는 undefined
 */
function splitTopLevelCalcComparison(expression: string): CalcComparisonSplit | undefined {
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
 * normalizeLegacyCalcNotEquals 함수.
 * Legacy `!left=right` shorthand를 top-level not-equals comparison으로 변환함.
 *
 * @param expression - normalize할 calc expression
 * @returns legacy not-equals가 반영된 expression 또는 원본 expression
 */
function normalizeLegacyCalcNotEquals(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('!') || trimmed.startsWith('!=')) return expression;

  const comparison = splitTopLevelCalcComparison(trimmed.slice(1));
  if (comparison?.operator !== '=') return expression;

  return `${comparison.left}!=${comparison.right}`;
}

/**
 * parseCalcEqualityOperand 함수.
 * Equality 비교에서만 허용할 nullish/number operand를 분류함.
 *
 * @param expression - equality operand expression
 * @returns 비교 가능한 operand 또는 invalid이면 undefined
 */
function parseCalcEqualityOperand(expression: string): CalcEqualityOperand | undefined {
  const trimmed = expression.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
    return { kind: 'nullish' };
  }

  const value = evaluateArithmeticExpression(trimmed);
  return value === undefined ? undefined : { kind: 'number', value };
}

/**
 * evaluateCalcEqualityComparison 함수.
 * `=`, `==`, `!=`에서 nullish operand와 numeric operand를 비교함.
 *
 * @param split - top-level equality comparison 분해 결과
 * @returns CBS numeric boolean, invalid operand이면 undefined
 */
function evaluateCalcEqualityComparison(split: CalcComparisonSplit): number | undefined {
  const left = parseCalcEqualityOperand(split.left);
  const right = parseCalcEqualityOperand(split.right);
  if (!left || !right) return undefined;

  let equal = false;
  if (left.kind === 'nullish' && right.kind === 'nullish') {
    equal = true;
  } else if (left.kind === 'number' && right.kind === 'number') {
    equal = left.value === right.value;
  }
  return split.operator === '!=' ? (equal ? 0 : 1) : (equal ? 1 : 0);
}

/**
 * evaluateCalcComparison 함수.
 * Arithmetic 양변을 안전하게 계산한 뒤 CBS numeric boolean으로 반환함.
 *
 * @param split - top-level comparison 분해 결과
 * @returns `1` 또는 `0`, invalid arithmetic이면 undefined
 */
function evaluateCalcComparison(split: CalcComparisonSplit): number | undefined {
  if (split.operator === '=' || split.operator === '==' || split.operator === '!=') {
    return evaluateCalcEqualityComparison(split);
  }

  const left = evaluateArithmeticExpression(split.left);
  const right = evaluateArithmeticExpression(split.right);
  if (left === undefined || right === undefined) return undefined;

  switch (split.operator) {
    case '<':
      return left < right ? 1 : 0;
    case '<=':
      return left <= right ? 1 : 0;
    case '>':
      return left > right ? 1 : 0;
    case '>=':
    case '=>':
      return left >= right ? 1 : 0;
  }
}

/**
 * evaluateCalcExpression 함수.
 * Logical, unary not, comparison, arithmetic 순서로 calc expression을 안전하게 평가함.
 *
 * @param expression - 평가할 calc expression
 * @returns 계산 결과, invalid expression이면 undefined
 */
export function evaluateCalcExpression(expression: string): number | undefined {
  const normalized = normalizeLegacyCalcNotEquals(stripOuterCalcParens(expression));
  const logical = splitTopLevelCalcLogical(normalized);
  if (logical) {
    const left = evaluateCalcExpression(logical.left);
    const right = evaluateCalcExpression(logical.right);
    if (left === undefined || right === undefined) return undefined;
    if (logical.operator === '&&') return left !== 0 && right !== 0 ? 1 : 0;
    return left !== 0 || right !== 0 ? 1 : 0;
  }

  if (normalized.startsWith('!')) {
    const value = evaluateCalcExpression(normalized.slice(1));
    if (value === undefined) return undefined;
    return value === 0 ? 1 : 0;
  }

  const comparison = splitTopLevelCalcComparison(normalized);
  return comparison ? evaluateCalcComparison(comparison) : evaluateArithmeticExpression(normalized);
}

/**
 * evaluateArithmeticExpression 함수.
 * Safe recursive-descent parser로 arithmetic expression을 계산함.
 *
 * @param expression - 계산할 arithmetic expression
 * @returns 계산 결과, invalid expression이면 undefined
 */
function evaluateArithmeticExpression(expression: string): number | undefined {
  let index = 0;

  const skipWhitespace = (): void => {
    while (index < expression.length && /\s/.test(expression[index])) index += 1;
  };

  const parseNumber = (): number | undefined => {
    skipWhitespace();
    const start = index;
    if (expression[index] === '+' || expression[index] === '-') index += 1;
    while (index < expression.length && /[0-9.]/.test(expression[index])) index += 1;
    if (start === index || (index === start + 1 && /[+-]/.test(expression[start]))) return undefined;
    const value = Number(expression.slice(start, index));
    return Number.isFinite(value) ? value : undefined;
  };

  const parseFactor = (): number | undefined => {
    skipWhitespace();
    if (expression[index] === '(') {
      const closeIndex = findMatchingCalcParen(expression, index);
      if (closeIndex === -1) return undefined;
      const inner = expression.slice(index + 1, closeIndex);
      const value = evaluateCalcExpression(inner);
      index = closeIndex + 1;
      return value;
    }
    return parseNumber();
  };

  const parsePower = (): number | undefined => {
    let left = parseFactor();
    if (left === undefined) return undefined;
    skipWhitespace();
    while (expression[index] === '^') {
      index += 1;
      const right = parseFactor();
      if (right === undefined) return undefined;
      left = Math.pow(left, right);
      skipWhitespace();
    }
    return left;
  };

  const parseTerm = (): number | undefined => {
    let left = parsePower();
    if (left === undefined) return undefined;
    skipWhitespace();
    while (expression[index] === '*' || expression[index] === '/' || expression[index] === '%') {
      const operator = expression[index];
      index += 1;
      const right = parsePower();
      if (right === undefined) return undefined;
      if (operator === '*') left *= right;
      if (operator === '/') left /= right;
      if (operator === '%') left %= right;
      skipWhitespace();
    }
    return left;
  };

  const parseExpression = (): number | undefined => {
    let left = parseTerm();
    if (left === undefined) return undefined;
    skipWhitespace();
    while (expression[index] === '+' || expression[index] === '-') {
      const operator = expression[index];
      index += 1;
      const right = parseTerm();
      if (right === undefined) return undefined;
      left = operator === '+' ? left + right : left - right;
      skipWhitespace();
    }
    return left;
  };

  const result = parseExpression();
  skipWhitespace();
  return index === expression.length ? result : undefined;
}
