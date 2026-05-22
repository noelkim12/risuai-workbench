/**
 * Literal block evaluator for #pure, #puredisplay, and #escape CBS blocks.
 * @file packages/core/src/domain/cbs/simulator/blocks/literal.ts
 */
import type { BlockNode } from '../../domain/cbs/parser/ast';
import type { SourceInfo } from '../engine/source-range';
import { sourceForRange } from '../engine/source-range';
import { trimOuterWhitespace } from './whitespace';
import type { BlockEvaluationState } from './state';

/**
 * literalBlockBody 함수.
 * pure 계열 block body source를 literal string으로 결합함.
 *
 * @param node - body를 읽을 block node
 * @param state - 원본 source에 접근할 simulation state
 * @returns body children의 source를 이어붙인 문자열
 */
function literalBlockBody(node: BlockNode, state: SourceInfo): string {
  return node.body.map((child) => sourceForRange(state, child.range)).join('');
}

/**
 * escapeDisplayBraces 함수.
 * #puredisplay literal CBS braces를 display-safe escape로 바꿈.
 *
 * @param value - escape할 문자열
 * @returns braces가 escape된 문자열
 */
function escapeDisplayBraces(value: string): string {
  return value.replaceAll('{{', '\\{\\{').replaceAll('}}', '\\}\\}');
}

/**
 * escapeRisuLiteral 함수.
 * upstream risuEscape의 dry-run equivalent임.
 *
 * @param value - escape할 문자열
 * @returns braces와 parentheses가 escape된 문자열
 */
function escapeRisuLiteral(value: string): string {
  return value.replace(/[{}()]/g, (match) => {
    if (match === '{') return '\uE9B8';
    if (match === '}') return '\uE9B9';
    if (match === '(') return '\uE9BA';
    return '\uE9BB';
  });
}

/**
 * evaluatePureBlock 함수.
 * #pure block body를 literal source로 반환하고 outer whitespace를 제거함.
 *
 * @param node - 평가할 #pure Block node
 * @param state - 원본 source에 접근할 simulation state
 * @returns trimmed literal block body
 */
export function evaluatePureBlock(node: BlockNode, state: BlockEvaluationState): string {
  return trimOuterWhitespace(literalBlockBody(node, state));
}

/**
 * evaluatePureDisplayBlock 함수.
 * #puredisplay block body를 literal source로 반환하고 braces를 escape함.
 *
 * @param node - 평가할 #puredisplay Block node
 * @param state - 원본 source에 접근할 simulation state
 * @returns trimmed and brace-escaped literal block body
 */
export function evaluatePureDisplayBlock(node: BlockNode, state: BlockEvaluationState): string {
  return escapeDisplayBraces(trimOuterWhitespace(literalBlockBody(node, state)));
}

/**
 * evaluateEscapeBlock 함수.
 * #escape block body를 risu literal escape로 변환함.
 * `keep` operator가 있으면 whitespace trimming을 건너뜀.
 *
 * @param node - 평가할 #escape Block node
 * @param state - 원본 source에 접근할 simulation state
 * @returns risu-escaped literal block body
 */
export function evaluateEscapeBlock(node: BlockNode, state: BlockEvaluationState): string {
  return escapeRisuLiteral(
    node.operators.includes('keep')
      ? literalBlockBody(node, state)
      : trimOuterWhitespace(literalBlockBody(node, state)),
  );
}
