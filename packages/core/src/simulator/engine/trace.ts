/**
 * Trace event accumulation for the CBS simulator.
 * Manages the maxTraceEvents budget and status transitions when the trace buffer overflows.
 * @file packages/core/src/domain/cbs/simulator/engine/trace.ts
 */
import type { CbsSimulationOptions, CbsSimulationStatus, CbsSimulationTraceEvent } from '../types';

/**
 * Narrow structural interface for trace accumulation.
 * Avoids exporting the full `SimulationState` type from the engine module.
 */
export interface TraceState {
  trace: CbsSimulationTraceEvent[];
  status: CbsSimulationStatus;
  options: CbsSimulationOptions;
}

/**
 * pushTrace 함수.
 * maxTraceEvents budget을 지키며 trace event를 누적함.
 *
 * @param state - simulation 누적 상태 (narrow TraceState)
 * @param event - 추가할 trace event
 */
export function pushTrace(state: TraceState, event: CbsSimulationTraceEvent): void {
  if (state.trace.length >= state.options.maxTraceEvents) {
    if (state.status !== 'aborted' && state.status !== 'partial') {
      state.status = state.options.onBudgetExceeded === 'continue' ? 'partial' : 'aborted';
    }
    return;
  }

  state.trace.push(event);
}
