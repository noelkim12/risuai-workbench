/**
 * Step budget and budget-exceeded handling for the CBS simulator.
 * Manages maxSteps limit checking, budget-exceeded status/trace emission,
 * and policy-based continue/stop decisions.
 * @file packages/core/src/domain/cbs/simulator/engine/budget.ts
 */
import type { Range } from '../../domain/cbs/parser/tokens';
import { cloneRange } from './source-range';
import type { TraceState } from './trace';
import { pushTrace } from './trace';

/**
 * Narrow structural interface for budget operations.
 * Extends TraceState with step counter and options.
 */
export interface BudgetState extends TraceState {
  steps: number;
}

/**
 * exceedBudget 함수.
 * budget 초과 상태와 trace event를 기록함.
 *
 * @param state - simulation 누적 상태 (narrow BudgetState)
 * @param message - 초과 사유
 * @param node - 관련 node 이름
 * @param range - 관련 source range
 */
export function exceedBudget(
  state: BudgetState,
  message: string,
  node?: string,
  range?: Range,
): void {
  state.status = state.options.onBudgetExceeded === 'continue' ? 'partial' : 'aborted';
  pushTrace(state, {
    phase: 'budget-exceeded',
    message,
    node,
    range: range ? cloneRange(range) : undefined,
  });
}

/**
 * consumeStep 함수.
 * maxSteps budget을 검사하고 초과 시 policy에 맞춰 상태를 갱신함.
 *
 * @param state - simulation 누적 상태 (narrow BudgetState)
 * @param node - budget trace에 기록할 node 이름
 * @param range - budget trace에 기록할 source range
 * @returns 순회를 계속할지 여부
 */
export function consumeStep(state: BudgetState, node: string, range: Range): boolean {
  if (state.steps >= state.options.maxSteps) {
    exceedBudget(state, `maxSteps ${state.options.maxSteps} exceeded`, node, range);
    return state.options.onBudgetExceeded === 'continue';
  }

  state.steps += 1;
  return true;
}
