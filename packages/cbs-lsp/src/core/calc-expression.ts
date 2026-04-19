/**
 * calc expression zone 탐지와 검증을 공용으로 제공하는 유틸.
 * @file packages/cbs-lsp/src/core/calc-expression.ts
 */

import type { FragmentCursorLookupResult } from './fragment-locator';

export type CalcExpressionZoneKind = 'inline' | 'macro-argument';
export type CalcExpressionReferenceKind = 'chat' | 'global';
export const CALC_EXPRESSION_SUBLANGUAGE_LABEL = 'CBS expression sublanguage';
export type CalcExpressionDiagnosticKind =
  | 'empty-expression'
  | 'unbalanced-parentheses'
  | 'operator-sequence'
  | 'unsupported-token'
  | 'incomplete-reference-token'
  | 'invalid-reference-identifier';
type CalcExpressionTokenKind = 'number' | 'operator' | 'reference' | 'null';

export interface CalcExpressionZone {
  kind: CalcExpressionZoneKind;
  expression: string;
  expressionStartOffset: number;
  expressionEndOffset: number;
}

export interface CalcExpressionReference {
  raw: string;
  name: string;
  kind: CalcExpressionReferenceKind;
  startOffset: number;
  endOffset: number;
}

export interface CalcExpressionCompletionTarget {
  prefix: string;
  startOffset: number;
  endOffset: number;
  referenceKind: CalcExpressionReferenceKind | null;
}

export interface CalcExpressionDiagnostic {
  kind: CalcExpressionDiagnosticKind;
  message: string;
  startOffset: number;
  endOffset: number;
}

interface CalcExpressionToken {
  kind: CalcExpressionTokenKind;
  value: string;
  startOffset: number;
  endOffset: number;
  referenceKind?: CalcExpressionReferenceKind;
}

interface CalcExpressionTokenizationResult {
  tokens: CalcExpressionToken[];
  diagnostic: CalcExpressionDiagnostic | null;
}

const IDENTIFIER_PATTERN = /[A-Za-z0-9_]/u;
const MULTI_CHARACTER_OPERATORS = ['&&', '||', '<=', '>=', '==', '!='] as const;
const SINGLE_CHARACTER_OPERATORS = ['+', '-', '*', '/', '^', '%', '<', '>', '!', '(', ')'] as const;
const BINARY_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '^',
  '%',
  '<',
  '>',
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
]);

/**
 * getCalcExpressionZone 함수.
 * 현재 커서가 `{{? ...}}` 또는 `{{calc::...}}` expression zone 안에 있는지 판별함.
 *
 * @param lookup - fragment locator가 계산한 현재 커서 lookup 정보
 * @returns calc expression zone 정보, 아니면 null
 */
export function getCalcExpressionZone(
  lookup: FragmentCursorLookupResult,
): CalcExpressionZone | null {
  const tokenLookup = lookup.token;
  if (tokenLookup?.category === 'math-expression') {
    const prefixLength = getInlineMathExpressionPrefixLength(tokenLookup.token.raw);
    return {
      kind: 'inline',
      expression: tokenLookup.token.value,
      expressionStartOffset: tokenLookup.localStartOffset + prefixLength,
      expressionEndOffset: tokenLookup.localEndOffset,
    };
  }

  const nodeSpan = lookup.nodeSpan;
  if (
    nodeSpan?.category !== 'argument' ||
    nodeSpan.argumentIndex !== 0 ||
    nodeSpan.owner.type !== 'MacroCall' ||
    normalizeLookupKey(nodeSpan.owner.name) !== 'calc'
  ) {
    return null;
  }

  return {
    kind: 'macro-argument',
    expression: lookup.fragment.content.slice(nodeSpan.localStartOffset, nodeSpan.localEndOffset),
    expressionStartOffset: nodeSpan.localStartOffset,
    expressionEndOffset: nodeSpan.localEndOffset,
  };
}

/**
 * findCalcReferenceAtOffset 함수.
 * calc expression 안에서 현재 커서가 가리키는 `$name`/`@name` 참조를 찾음.
 *
 * @param zone - 현재 calc expression zone
 * @param localOffset - fragment-local cursor offset
 * @returns 해당 위치의 calc variable reference, 아니면 null
 */
export function findCalcReferenceAtOffset(
  zone: CalcExpressionZone,
  localOffset: number,
): CalcExpressionReference | null {
  const relativeOffset = localOffset - zone.expressionStartOffset;
  if (relativeOffset < 0 || relativeOffset > zone.expression.length) {
    return null;
  }

  const tokenization = tokenizeCalcExpression(zone.expression);
  if (tokenization.diagnostic) {
    return null;
  }

  for (const token of tokenization.tokens) {
    if (token.kind !== 'reference') {
      continue;
    }

    if (relativeOffset >= token.startOffset && relativeOffset <= token.endOffset) {
      return {
        raw: token.value,
        name: token.value.slice(1),
        kind: token.referenceKind ?? 'chat',
        startOffset: zone.expressionStartOffset + token.startOffset,
        endOffset: zone.expressionStartOffset + token.endOffset,
      };
    }
  }

  return null;
}

/**
 * getCalcExpressionCompletionTarget 함수.
 * calc expression completion이 교체해야 할 prefix 범위와 변수 종류를 계산함.
 *
 * @param zone - 현재 calc expression zone
 * @param localOffset - fragment-local cursor offset
 * @returns completion replacement 정보
 */
export function getCalcExpressionCompletionTarget(
  zone: CalcExpressionZone,
  localOffset: number,
): CalcExpressionCompletionTarget {
  const boundedOffset = Math.max(
    zone.expressionStartOffset,
    Math.min(localOffset, zone.expressionEndOffset),
  );
  const relativeOffset = boundedOffset - zone.expressionStartOffset;

  let prefixStart = relativeOffset;
  while (prefixStart > 0 && IDENTIFIER_PATTERN.test(zone.expression[prefixStart - 1] ?? '')) {
    prefixStart -= 1;
  }

  const marker = prefixStart > 0 ? zone.expression[prefixStart - 1] : '';
  if (marker === '$' || marker === '@') {
    return {
      prefix: zone.expression.slice(prefixStart, relativeOffset),
      startOffset: zone.expressionStartOffset + prefixStart,
      endOffset: boundedOffset,
      referenceKind: marker === '$' ? 'chat' : 'global',
    };
  }

  let operatorStart = relativeOffset;
  while (operatorStart > 0 && /[=!<>&|]/u.test(zone.expression[operatorStart - 1] ?? '')) {
    operatorStart -= 1;
  }

  const operatorPrefix = zone.expression.slice(operatorStart, relativeOffset);
  if (operatorPrefix.length > 0) {
    return {
      prefix: operatorPrefix,
      startOffset: zone.expressionStartOffset + operatorStart,
      endOffset: boundedOffset,
      referenceKind: null,
    };
  }

  let alphaStart = relativeOffset;
  while (alphaStart > 0 && /[A-Za-z]/u.test(zone.expression[alphaStart - 1] ?? '')) {
    alphaStart -= 1;
  }

  const alphaPrefix = zone.expression.slice(alphaStart, relativeOffset);
  if (alphaPrefix.length > 0) {
    return {
      prefix: alphaPrefix,
      startOffset: zone.expressionStartOffset + alphaStart,
      endOffset: boundedOffset,
      referenceKind: null,
    };
  }

  return {
    prefix: '',
    startOffset: boundedOffset,
    endOffset: boundedOffset,
    referenceKind: null,
  };
}

/**
 * validateCalcExpression 함수.
 * upstream calcString 문법에 맞춰 식의 기본 구문 무결성만 보수적으로 검증함.
 *
 * @param expression - `{{? ...}}` 또는 `{{calc::...}}` 내부의 식 문자열
 * @returns 구조화된 calc expression 진단, 아니면 null
 */
export function validateCalcExpression(expression: string): CalcExpressionDiagnostic | null {
  if (expression.trim().length === 0) {
    return createCalcExpressionDiagnostic(
      'empty-expression',
      `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} cannot be empty`,
      0,
      expression.length,
    );
  }

  const tokenization = tokenizeCalcExpression(expression);
  if (tokenization.diagnostic) {
    return tokenization.diagnostic;
  }

  const tokens = tokenization.tokens;
  if (tokens.length === 0) {
    return createCalcExpressionDiagnostic(
      'empty-expression',
      `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} cannot be empty`,
      0,
      expression.length,
    );
  }

  let depth = 0;
  let expectsOperand = true;
  const openParentheses: CalcExpressionToken[] = [];
  let lastToken: CalcExpressionToken | null = null;

  for (const token of tokens) {
    if (expectsOperand) {
      if (token.kind === 'number' || token.kind === 'reference' || token.kind === 'null') {
        expectsOperand = false;
        lastToken = token;
        continue;
      }

      if (token.kind === 'operator' && token.value === '(') {
        depth += 1;
        openParentheses.push(token);
        lastToken = token;
        continue;
      }

      if (token.kind === 'operator' && (token.value === '+' || token.value === '-' || token.value === '!')) {
        lastToken = token;
        continue;
      }

      if (token.kind === 'operator' && token.value === ')') {
        return createCalcExpressionDiagnostic(
          'unbalanced-parentheses',
          `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} has an unmatched closing parenthesis`,
          token.startOffset,
          token.endOffset,
        );
      }

      return createCalcExpressionDiagnostic(
        'operator-sequence',
        `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} has an invalid operator sequence near ${JSON.stringify(token.value)}`,
        token.startOffset,
        token.endOffset,
      );
    }

    if (token.kind === 'operator' && token.value === ')') {
      depth -= 1;
      const matchingOpen = openParentheses.pop();
      if (depth < 0 || !matchingOpen) {
        return createCalcExpressionDiagnostic(
          'unbalanced-parentheses',
          `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} has an unmatched closing parenthesis`,
          token.startOffset,
          token.endOffset,
        );
      }
      lastToken = token;
      continue;
    }

    if (token.kind === 'operator' && BINARY_OPERATORS.has(token.value)) {
      expectsOperand = true;
      lastToken = token;
      continue;
    }

    return createCalcExpressionDiagnostic(
      'operator-sequence',
      `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} has an invalid operator sequence near ${JSON.stringify(token.value)}`,
      token.startOffset,
      token.endOffset,
    );
  }

  if (expectsOperand) {
    if (lastToken) {
      return createCalcExpressionDiagnostic(
        'operator-sequence',
        `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} ends with an incomplete operator sequence after ${JSON.stringify(lastToken.value)}`,
        lastToken.startOffset,
        lastToken.endOffset,
      );
    }

    return createCalcExpressionDiagnostic(
      'operator-sequence',
      `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} ends with an incomplete operator sequence`,
      expression.length,
      expression.length,
    );
  }

  if (depth !== 0) {
    const unmatchedOpen = openParentheses[openParentheses.length - 1];
    return createCalcExpressionDiagnostic(
      'unbalanced-parentheses',
      `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} has an unmatched opening parenthesis`,
      unmatchedOpen?.startOffset ?? expression.length,
      unmatchedOpen?.endOffset ?? expression.length,
    );
  }

  return null;
}

function getInlineMathExpressionPrefixLength(raw: string): number {
  let index = raw.startsWith('?') ? 1 : 0;
  while (index < raw.length && /\s/u.test(raw[index] ?? '')) {
    index += 1;
  }
  return index;
}

function tokenizeCalcExpression(expression: string): CalcExpressionTokenizationResult {
  const tokens: CalcExpressionToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const current = expression[index] ?? '';
    if (/\s/u.test(current)) {
      index += 1;
      continue;
    }

    const multiCharacterOperator = MULTI_CHARACTER_OPERATORS.find((operator) =>
      expression.startsWith(operator, index),
    );
    if (multiCharacterOperator) {
      tokens.push({
        kind: 'operator',
        value: multiCharacterOperator,
        startOffset: index,
        endOffset: index + multiCharacterOperator.length,
      });
      index += multiCharacterOperator.length;
      continue;
    }

    if (SINGLE_CHARACTER_OPERATORS.includes(current as (typeof SINGLE_CHARACTER_OPERATORS)[number])) {
      tokens.push({
        kind: 'operator',
        value: current,
        startOffset: index,
        endOffset: index + 1,
      });
      index += 1;
      continue;
    }

    const numberMatch = expression.slice(index).match(/^\d+(?:\.\d+)?/u);
    if (numberMatch) {
      tokens.push({
        kind: 'number',
        value: numberMatch[0],
        startOffset: index,
        endOffset: index + numberMatch[0].length,
      });
      index += numberMatch[0].length;
      continue;
    }

    if (current === '$' || current === '@') {
      const referenceMarker = createCalcReferenceMarkerDetails(current);
      const nextCharacter = expression[index + 1] ?? '';
      if (nextCharacter.length === 0 || isCalcReferenceBoundary(nextCharacter)) {
        return {
          tokens,
          diagnostic: createCalcExpressionDiagnostic(
            'incomplete-reference-token',
            `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} contains an incomplete ${referenceMarker.label} reference token ${JSON.stringify(current)}. Add an identifier after ${JSON.stringify(current)}.`,
            index,
            index + 1,
          ),
        };
      }

      if (!/[A-Za-z_]/u.test(nextCharacter)) {
        const invalidReferenceToken = readCalcReferenceToken(expression, index);
        return {
          tokens,
          diagnostic: createCalcExpressionDiagnostic(
            'invalid-reference-identifier',
            `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} contains an invalid ${referenceMarker.label} reference ${JSON.stringify(invalidReferenceToken)}. ${referenceMarker.label} references must start with a letter or underscore after ${JSON.stringify(current)}.`,
            index,
            index + invalidReferenceToken.length,
          ),
        };
      }

      const identifierMatch = expression.slice(index + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/u);
      if (!identifierMatch) {
        const invalidReferenceToken = readCalcReferenceToken(expression, index);
        return {
          tokens,
          diagnostic: createCalcExpressionDiagnostic(
            'invalid-reference-identifier',
            `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} contains an invalid ${referenceMarker.label} reference ${JSON.stringify(invalidReferenceToken)}. ${referenceMarker.label} references must use only letters, digits, and underscores after the first character.`,
            index,
            index + invalidReferenceToken.length,
          ),
        };
      }

      const raw = `${current}${identifierMatch[0]}`;
      tokens.push({
        kind: 'reference',
        value: raw,
        startOffset: index,
        endOffset: index + raw.length,
        referenceKind: current === '$' ? 'chat' : 'global',
      });
      index += raw.length;
      continue;
    }

    const nullMatch = expression.slice(index).match(/^null(?![A-Za-z0-9_])/iu);
    if (nullMatch) {
      tokens.push({
        kind: 'null',
        value: nullMatch[0],
        startOffset: index,
        endOffset: index + nullMatch[0].length,
      });
      index += nullMatch[0].length;
      continue;
    }

    const unsupportedToken = readUnsupportedToken(expression, index);
    return {
      tokens,
      diagnostic: createCalcExpressionDiagnostic(
        'unsupported-token',
        `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} contains unsupported token ${JSON.stringify(unsupportedToken)}`,
        index,
        index + unsupportedToken.length,
      ),
    };
  }

  return {
    tokens,
    diagnostic: null,
  };
}

function createCalcExpressionDiagnostic(
  kind: CalcExpressionDiagnosticKind,
  message: string,
  startOffset: number,
  endOffset: number,
): CalcExpressionDiagnostic {
  return {
    kind,
    message,
    startOffset,
    endOffset,
  };
}

function createCalcReferenceMarkerDetails(marker: '$' | '@'): { kind: CalcExpressionReferenceKind; label: string } {
  return marker === '@'
    ? { kind: 'global', label: 'global variable' }
    : { kind: 'chat', label: 'chat variable' };
}

function isCalcReferenceBoundary(character: string): boolean {
  return /\s/u.test(character) || SINGLE_CHARACTER_OPERATORS.includes(character as (typeof SINGLE_CHARACTER_OPERATORS)[number]);
}

function readCalcReferenceToken(expression: string, startIndex: number): string {
  let index = startIndex + 1;

  while (index < expression.length) {
    const current = expression[index] ?? '';
    if (isCalcReferenceBoundary(current)) {
      break;
    }

    if (MULTI_CHARACTER_OPERATORS.some((operator) => expression.startsWith(operator, index))) {
      break;
    }

    index += 1;
  }

  return expression.slice(startIndex, Math.max(startIndex + 1, index));
}

function readUnsupportedToken(expression: string, startIndex: number): string {
  let index = startIndex;

  while (index < expression.length) {
    const current = expression[index] ?? '';
    if (/\s/u.test(current)) {
      break;
    }

    if (SINGLE_CHARACTER_OPERATORS.includes(current as (typeof SINGLE_CHARACTER_OPERATORS)[number])) {
      break;
    }

    if (MULTI_CHARACTER_OPERATORS.some((operator) => expression.startsWith(operator, index))) {
      break;
    }

    index += 1;
  }

  return expression.slice(startIndex, Math.max(startIndex + 1, index));
}

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/g, '');
}
