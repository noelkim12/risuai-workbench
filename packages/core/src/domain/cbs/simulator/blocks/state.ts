/**
 * Narrow structural interface shared by all block evaluator modules.
 * SimulationState structurally satisfies this interface.
 * @file packages/core/src/domain/cbs/simulator/blocks/state.ts
 */
import type { CBSNode } from '../../parser/ast';
import type { CbsSimulationContext, CbsSimulationEffect } from '../types';
import type { SourceInfo } from '../engine/source-range';
import type { DiagnosticState } from '../engine/diagnostics';

/**
 * BlockEvaluationState 함수.
 * Block evaluator가 필요로 하는 simulator state의 narrow view.
 * SourceInfo + DiagnosticState + block-specific properties + bound traversal callbacks.
 */
export interface BlockEvaluationState extends SourceInfo, DiagnosticState {
  readonly context: CbsSimulationContext;
  readonly tempVariables: Record<string, unknown>;
  readonly slotFrames: Array<Record<string, string>>;
  effects: CbsSimulationEffect[];
  forceReturn: boolean;
  returnValue?: string;
  /** Bound argument evaluator provided by the simulator core. */
  evaluateArgument: (nodes: CBSNode[] | undefined, depth: number) => string;
  /** Bound node visitor provided by the simulator core. */
  visitNodes: (nodes: CBSNode[], depth: number) => string;
}
