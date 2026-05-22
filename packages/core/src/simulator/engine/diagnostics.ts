/**
 * Simulator diagnostic emission for the CBS simulator.
 * Adds source-tagged diagnostics and emits corresponding diagnostic trace events.
 * @file packages/core/src/domain/cbs/simulator/engine/diagnostics.ts
 */
import type { MacroCallNode } from '../../domain/cbs/parser/ast';
import { cloneRange } from './source-range';
import type { TraceState } from './trace';
import { pushTrace } from './trace';
import type { CbsSimulationDiagnostic } from '../types';

/** Diagnostic code for invalid pure macro arguments. */
export const CBS_SIMULATOR_INVALID_PURE_MACRO_ARGS_CODE = 'CBSSIM002';

/**
 * Narrow structural interface for diagnostic accumulation.
 * Extends TraceState with diagnostics array access.
 */
export interface DiagnosticState extends TraceState {
  diagnostics: CbsSimulationDiagnostic[];
}

/**
 * addSimulatorDiagnostic 함수.
 * simulator diagnostic을 상태에 추가함.
 *
 * @param state - simulation 누적 상태 (narrow DiagnosticState)
 * @param diagnostic - 추가할 diagnostic
 */
export function addSimulatorDiagnostic(
  state: DiagnosticState,
  diagnostic: Omit<CbsSimulationDiagnostic, 'source'>,
): void {
  const fullDiagnostic: CbsSimulationDiagnostic = {
    ...diagnostic,
    source: 'simulator',
  };
  state.diagnostics.push(fullDiagnostic);

  // Also emit a diagnostic trace event
  pushTrace(state, {
    phase: 'diagnostic',
    message: diagnostic.message,
    node: diagnostic.code,
    range: diagnostic.range,
  });
}

/**
 * addInvalidPureMacroDiagnostic 함수.
 * Pure macro argument 오류를 throw 대신 structured simulator diagnostic으로 기록함.
 *
 * @param state - simulation 누적 상태 (narrow DiagnosticState)
 * @param node - 오류가 발생한 macro node
 * @param reason - 사용자에게 노출할 concise reason
 */
export function addInvalidPureMacroDiagnostic(
  state: DiagnosticState,
  node: MacroCallNode,
  reason: string,
): void {
  addSimulatorDiagnostic(state, {
    code: CBS_SIMULATOR_INVALID_PURE_MACRO_ARGS_CODE,
    message: `Invalid arguments for pure CBS macro ${JSON.stringify(node.name)}: ${reason}`,
    severity: 'warning',
    range: cloneRange(node.nameRange),
    data: { macroName: node.name, reason },
  });
}
