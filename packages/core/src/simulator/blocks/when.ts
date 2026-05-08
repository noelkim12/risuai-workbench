/**
 * #when block evaluator for the CBS simulator.
 * @file packages/core/src/domain/cbs/simulator/blocks/when.ts
 */
import type { BlockNode } from '../../domain/cbs/parser/ast';
import { cloneRange } from '../engine/source-range';
import { pushTrace } from '../engine/trace';
import { hasOwn, stringifyVariableValue } from '../values';
import { resolveChatVariable } from '../macros/variables';
import { trimLines, trimBlankEdgeLines } from './whitespace';
import type { BlockEvaluationState } from './state';

/** isWhenTruthy 함수. #when/#if truthy literal만 true로 판정함. */
function isWhenTruthy(value: string): boolean {
  return value === 'true' || value === '1';
}

/** toggleValue 함수. context toggleValues에서 CBS 문자열 값을 가져옴. */
function toggleValue(state: BlockEvaluationState, key: string): string {
  if (hasOwn(state.context.toggleValues, key))
    return state.context.toggleValues[key] ? 'true' : 'false';
  const globalKey = `toggle_${key}`;
  if (hasOwn(state.context.globalVariables, globalKey))
    return stringifyVariableValue(state.context.globalVariables[globalKey]);
  return 'null';
}

/** resolveWhenMode 함수. parser operator와 condition prefix에서 whitespace mode를 결정함. */
function resolveWhenMode(node: BlockNode, conditionText: string): 'normal' | 'keep' | 'legacy' {
  if (node.operators.includes('keep') || conditionText.split('::').includes('keep')) return 'keep';
  if (node.operators.includes('legacy') || conditionText.split('::').includes('legacy'))
    return 'legacy';
  return 'normal';
}

/**
 * evaluateWhenCondition 함수.
 * Upstream-compatible right-to-left #when operator chain을 축약함.
 *
 * @param conditionText - `::`로 flatten된 #when condition text
 * @param state - variable/toggle lookup에 사용할 simulation state
 * @returns 최종 truthiness
 */
function evaluateWhenCondition(conditionText: string, state: BlockEvaluationState): boolean {
  const parts = conditionText.split('::').filter((part) => part.length > 0);
  if (parts.length === 0) return false;

  while (parts.length > 1) {
    const condition = parts.pop() ?? '';
    const operator = parts.pop() ?? '';
    switch (operator) {
      case 'not':
        parts.push(isWhenTruthy(condition) ? '0' : '1');
        break;
      case 'keep':
      case 'legacy':
        parts.push(condition);
        break;
      case 'and':
        parts.push(isWhenTruthy(condition) && isWhenTruthy(parts.pop() ?? '') ? '1' : '0');
        break;
      case 'or':
        parts.push(isWhenTruthy(condition) || isWhenTruthy(parts.pop() ?? '') ? '1' : '0');
        break;
      case 'is':
        parts.push(condition === (parts.pop() ?? '') ? '1' : '0');
        break;
      case 'isnot':
        parts.push(condition !== (parts.pop() ?? '') ? '1' : '0');
        break;
      case 'var':
        parts.push(isWhenTruthy(resolveChatVariable(state, condition).value) ? '1' : '0');
        break;
      case 'toggle':
        parts.push(isWhenTruthy(toggleValue(state, condition)) ? '1' : '0');
        break;
      case 'vis':
        parts.push(resolveChatVariable(state, parts.pop() ?? '').value === condition ? '1' : '0');
        break;
      case 'visnot':
        parts.push(resolveChatVariable(state, parts.pop() ?? '').value !== condition ? '1' : '0');
        break;
      case 'tis':
        parts.push(toggleValue(state, parts.pop() ?? '') === condition ? '1' : '0');
        break;
      case 'tisnot':
        parts.push(toggleValue(state, parts.pop() ?? '') !== condition ? '1' : '0');
        break;
      case '>':
        parts.push(Number(parts.pop() ?? '') > Number(condition) ? '1' : '0');
        break;
      case '<':
        parts.push(Number(parts.pop() ?? '') < Number(condition) ? '1' : '0');
        break;
      case '>=':
        parts.push(Number(parts.pop() ?? '') >= Number(condition) ? '1' : '0');
        break;
      case '<=':
        parts.push(Number(parts.pop() ?? '') <= Number(condition) ? '1' : '0');
        break;
      default:
        parts.push(isWhenTruthy(condition) ? '1' : '0');
        break;
    }
  }

  return isWhenTruthy(parts[0] ?? '');
}

/**
 * evaluateWhenBlock 함수.
 * #when condition/operator chain을 평가하고 선택된 branch만 순회함.
 *
 * @param node - 평가할 #when Block node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns 선택된 branch 출력
 */
export function evaluateWhenBlock(
  node: BlockNode,
  state: BlockEvaluationState,
  depth: number,
): string {
  const conditionText = state.evaluateArgument(node.condition, depth + 1);
  const mode = resolveWhenMode(node, conditionText);
  const truthy = evaluateWhenCondition(conditionText, state);
  const output = state.visitNodes(truthy ? node.body : (node.elseBody ?? []), depth + 1);

  pushTrace(state, {
    phase: 'macro-skip',
    message: `#when evaluated ${truthy ? 'truthy' : 'falsy'}`,
    node: '#when',
    range: cloneRange(node.openRange),
    details: { condition: conditionText, mode, truthy },
  });

  if (mode === 'keep') return output;
  if (mode === 'legacy') return truthy ? trimLines(output) : '';
  return trimBlankEdgeLines(output);
}
