/**
 * calc expression 진단 수집과 range 계산 유틸 모음.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/calc-expression-diagnostics.ts
 */

import {
  type CBSNode,
  type MacroCallNode,
  type MathExprNode,
  type Range,
} from 'risu-workbench-core';

import {
  type CalcExpressionDiagnostic,
  validateCalcExpression,
} from '../../core/calc-expression';
import { offsetToPosition, positionToOffset } from '../../utils/position';
import { createDiagnosticInfo } from './diagnostic-info';
import { sliceRange } from './builtin-helpers';
import { DiagnosticCode } from './taxonomy';

/**
 * collectMathExpressionDiagnostics 함수.
 * inline `{{? ... }}` expression 한 건에서 calc 진단을 수집함.
 *
 * @param node - 검사할 math expression AST 노드
 * @param sourceText - expression range 계산에 쓸 fragment 원문
 * @returns calc expression diagnostics 목록
 */
export function collectMathExpressionDiagnostics(
  node: MathExprNode,
  sourceText: string,
): ReturnType<typeof createDiagnosticInfo>[] {
  const expression = extractInlineMathExpression(node, sourceText);
  const error = validateCalcExpression(expression.text);
  if (!error) {
    return [];
  }

  return [
    expression.isRangeStable
      ? createCalcExpressionDiagnostic(error, expression.range, sourceText)
      : createDiagnosticInfo(mapCalcExpressionDiagnosticCode(error.kind), expression.range, error.message),
  ];
}

/**
 * collectCalcExpressionArgumentDiagnostics 함수.
 * `{{calc::...}}` 첫 번째 인자에서 calc expression 진단을 수집함.
 *
 * @param node - 검사할 macro call 노드
 * @param sourceText - 인자 range 계산에 쓸 fragment 원문
 * @returns calc expression diagnostics 목록
 */
export function collectCalcExpressionArgumentDiagnostics(
  node: MacroCallNode,
  sourceText: string,
): ReturnType<typeof createDiagnosticInfo>[] {
  const expressionArgument = extractCalcExpressionArgument(node, 0, sourceText);
  if (!expressionArgument) {
    return [];
  }

  const error = validateCalcExpression(expressionArgument.text);
  if (!error) {
    return [];
  }

  return [
    expressionArgument.isRangeStable
      ? createCalcExpressionDiagnostic(error, expressionArgument.range, sourceText)
      : createDiagnosticInfo(
          mapCalcExpressionDiagnosticCode(error.kind),
          expressionArgument.range,
          error.message,
        ),
  ];
}

function extractStaticMacroArgument(
  node: MacroCallNode,
  argumentIndex: number,
): { text: string; range: Range; isRangeStable: boolean } | null {
  const segment = node.arguments[argumentIndex];
  if (!segment || segment.length === 0) {
    return null;
  }

  const firstNode = segment[0];
  const lastNode = segment[segment.length - 1];
  if (!firstNode || !lastNode) {
    return null;
  }

  return {
    text: segment.map((child) => serializeCalcExpressionNode(child)).join(''),
    range: {
      start: firstNode.range.start,
      end: lastNode.range.end,
    },
    isRangeStable: segment.every((child) => child.type === 'PlainText'),
  };
}

function serializeCalcExpressionNode(node: CBSNode): string {
  switch (node.type) {
    case 'PlainText':
      return node.value;
    case 'Comment':
      return '';
    default:
      return '0';
  }
}

function extractCalcExpressionArgument(
  node: MacroCallNode,
  argumentIndex: number,
  sourceText: string,
): { text: string; range: Range; isRangeStable: boolean } | null {
  const staticArgument = extractStaticMacroArgument(node, argumentIndex);
  if (staticArgument) {
    return staticArgument;
  }

  if (argumentIndex !== 0 || !node.arguments[argumentIndex]) {
    return null;
  }

  const emptyRange = extractEmptyFirstCalcArgumentRange(node, sourceText);
  if (!emptyRange) {
    return null;
  }

  return {
    text: '',
    range: emptyRange,
    isRangeStable: true,
  };
}

function extractEmptyFirstCalcArgumentRange(node: MacroCallNode, sourceText: string): Range | null {
  const nameEndOffset = positionToOffset(sourceText, node.nameRange.end);
  const macroEndOffset = positionToOffset(sourceText, node.range.end);
  const separatorOffset = sourceText.indexOf('::', nameEndOffset);
  if (separatorOffset === -1 || separatorOffset > macroEndOffset - 2) {
    return null;
  }

  const argumentStartOffset = separatorOffset + 2;
  return {
    start: offsetToPosition(sourceText, argumentStartOffset),
    end: offsetToPosition(sourceText, argumentStartOffset),
  };
}

function extractInlineMathExpression(
  node: MathExprNode,
  sourceText: string,
): { text: string; range: Range; isRangeStable: boolean } {
  const raw = sliceRange(sourceText, node.range);
  const rangeStartOffset = positionToOffset(sourceText, node.range.start);
  const rangeEndOffset = positionToOffset(sourceText, node.range.end);
  const prefixLength = raw.match(/^\{\{\?\s*/u)?.[0].length ?? 3;
  const expressionStartOffset = rangeStartOffset + prefixLength;
  const expressionEndOffset = Math.max(expressionStartOffset, rangeEndOffset - 2);

  return {
    text: node.children.map((child) => serializeCalcExpressionNode(child)).join(''),
    range: {
      start: offsetToPosition(sourceText, expressionStartOffset),
      end: offsetToPosition(sourceText, expressionEndOffset),
    },
    isRangeStable: node.children.every((child) => child.type === 'PlainText'),
  };
}

function createCalcExpressionDiagnostic(
  diagnostic: CalcExpressionDiagnostic,
  expressionRange: Range,
  sourceText: string,
) {
  const baseOffset = positionToOffset(sourceText, expressionRange.start);
  const expressionStartOffset = baseOffset + diagnostic.startOffset;
  const expressionEndOffset = baseOffset + diagnostic.endOffset;

  return createDiagnosticInfo(
    mapCalcExpressionDiagnosticCode(diagnostic.kind),
    {
      start: offsetToPosition(sourceText, expressionStartOffset),
      end: offsetToPosition(sourceText, Math.max(expressionStartOffset, expressionEndOffset)),
    },
    diagnostic.message,
  );
}

function mapCalcExpressionDiagnosticCode(kind: CalcExpressionDiagnostic['kind']): DiagnosticCode {
  const diagnosticCodeByKind = {
    'empty-expression': DiagnosticCode.CalcExpressionEmpty,
    'incomplete-reference-token': DiagnosticCode.CalcExpressionIncompleteReferenceToken,
    'invalid-reference-identifier': DiagnosticCode.CalcExpressionInvalidReferenceIdentifier,
    'operator-sequence': DiagnosticCode.CalcExpressionOperatorSequence,
    'unbalanced-parentheses': DiagnosticCode.CalcExpressionUnbalancedParentheses,
    'unsupported-token': DiagnosticCode.CalcExpressionUnsupportedToken,
  } satisfies Record<CalcExpressionDiagnostic['kind'], DiagnosticCode>;

  return diagnosticCodeByKind[kind];
}
