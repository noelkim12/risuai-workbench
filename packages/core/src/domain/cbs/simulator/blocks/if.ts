/**
 * #if and #if_pure block evaluator for the CBS simulator.
 * @file packages/core/src/domain/cbs/simulator/blocks/if.ts
 */
import type { BlockNode } from '../../parser/ast';
import { cloneRange } from '../engine/source-range';
import { pushTrace } from '../engine/trace';
import { trimLines } from './whitespace';
import type { BlockEvaluationState } from './state';

/**
 * isDeprecatedIfTruthy 함수.
 * Upstream deprecated #if truthiness를 exact token comparison으로 판정함.
 *
 * @param conditionText - evaluated and trimmed condition text
 * @returns exact `true` 또는 `1`이면 true
 */
function isDeprecatedIfTruthy(conditionText: string): boolean {
  return conditionText === 'true' || conditionText === '1';
}

/**
 * evaluateIfBlock 함수.
 * #if/#if_pure truthiness와 whitespace semantics를 적용함.
 *
 * @param node - 평가할 if 계열 Block node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @param pureWhitespace - #if_pure whitespace 보존 여부
 * @returns 조건이 참이면 body 출력, 아니면 빈 문자열
 */
export function evaluateIfBlock(
  node: BlockNode,
  state: BlockEvaluationState,
  depth: number,
  pureWhitespace: boolean,
): string {
  const conditionText = state.evaluateArgument(node.condition, depth + 1).trim();
  const truthy = isDeprecatedIfTruthy(conditionText);
  pushTrace(state, {
    phase: 'macro-skip',
    message: `${pureWhitespace ? '#if_pure' : '#if'} evaluated ${truthy ? 'truthy' : 'falsy'}`,
    node: pureWhitespace ? '#if_pure' : '#if',
    range: cloneRange(node.openRange),
    details: { condition: conditionText, truthy },
  });
  if (!truthy) return '';
  const output = state.visitNodes(node.body, depth + 1);
  return pureWhitespace ? output : trimLines(output);
}
