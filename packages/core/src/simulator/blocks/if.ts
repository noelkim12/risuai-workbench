/**
 * #if and #if_pure block evaluator for the CBS simulator.
 * @file packages/core/src/domain/cbs/simulator/blocks/if.ts
 */
import type { BlockNode } from '../../domain/cbs/parser/ast';
import { cloneRange, sourceForRange } from '../engine/source-range';
import { pushTrace } from '../engine/trace';
import { mapTrimLinesOffset, trimLines } from './whitespace';
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
 * getRawConditionText 함수.
 * #if condition AST를 source 기준 CBS condition 문자열로 복원함.
 *
 * @param node - raw condition을 읽을 if 계열 Block node
 * @param state - source range lookup에 사용할 simulation state
 * @returns source에 적힌 condition 문자열
 */
function getRawConditionText(node: BlockNode, state: BlockEvaluationState): string {
  return node.condition.map((conditionNode) => sourceForRange(state, conditionNode.range)).join('').trim();
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
    details: { condition: conditionText, rawCondition: getRawConditionText(node, state), truthy },
  });
  if (!truthy) return '';
  const traceStartIndex = state.trace.length;
  const outputStartOffset = state.outputOffsetStack[state.outputOffsetStack.length - 1] ?? 0;
  const output = state.visitNodes(node.body, depth + 1);
  if (pureWhitespace) return output;
  remapTrimmedBodyTraceOffsets(state, traceStartIndex, outputStartOffset, output);
  return trimLines(output);
}

/**
 * remapTrimmedBodyTraceOffsets 함수.
 * block body trace offset을 trimLines() 적용 후 output 기준으로 보정합니다.
 *
 * @param state - simulation 누적 상태
 * @param traceStartIndex - body 평가 직전 trace 시작 index
 * @param outputStartOffset - body output 시작 absolute offset
 * @param output - trimLines() 적용 전 body output
 */
function remapTrimmedBodyTraceOffsets(
  state: BlockEvaluationState,
  traceStartIndex: number,
  outputStartOffset: number,
  output: string,
): void {
  const outputEndOffset = outputStartOffset + output.length;
  for (const event of state.trace.slice(traceStartIndex)) {
    if (event.outputOffset === undefined) continue;
    if (event.outputOffset < outputStartOffset || event.outputOffset > outputEndOffset) continue;
    event.outputOffset = outputStartOffset + mapTrimLinesOffset(output, event.outputOffset - outputStartOffset);
  }
}
