/**
 * Macro handler registry combining all handler categories.
 * Assembles contextual, time-random, variable, slot-position macro handler
 * maps and re-exports the pure macro definitions for dispatch use.
 * @file packages/core/src/domain/cbs/simulator/macros/registry.ts
 */
import type { MacroCallNode } from '../../domain/cbs/parser/ast';
import type {
  CbsSimulationContext,
  CbsSimulatorCoverage,
  CbsSimulationStatus,
  CbsSimulationEffect,
} from '../types';
import type { SourceInfo } from '../engine/source-range';
import type { DiagnosticState } from '../engine/diagnostics';
import type { CoverageState } from '../engine/coverage';
import { CONTEXTUAL_MACRO_HANDLERS } from './contextual';
import { TIME_RANDOM_MACRO_HANDLERS } from './time-random';
import { VARIABLE_MACRO_HANDLERS } from './variables';
import { SLOT_POSITION_MACRO_HANDLERS } from './slots-position';
import type { CBSNode } from '../../domain/cbs/parser/ast';

/**
 * Narrow structural interface for macro handler dispatch.
 * Provides all state properties that macro handlers access,
 * including source access, trace/diagnostic emission, context resolution,
 * coverage recording, argument evaluation, and node traversal.
 * `SimulationState` structurally satisfies this interface.
 */
export interface MacroDispatchState extends SourceInfo, DiagnosticState, CoverageState {
  readonly context: CbsSimulationContext;
  readonly explicitContextKeys: ReadonlySet<string>;
  readonly tempVariables: Record<string, unknown>;
  readonly slotFrames: Array<Record<string, string>>;
  status: CbsSimulationStatus;
  output: string;
  returnValue?: string;
  forceReturn: boolean;
  steps: number;
  effects: CbsSimulationEffect[];
  coverage: CbsSimulatorCoverage;
  providerConsumption: number;
  /** Bound argument evaluator provided by the simulator core. */
  evaluateArgument: (nodes: CBSNode[] | undefined, depth: number) => string;
  /** Bound arguments evaluator provided by the simulator core. */
  evaluateArguments: (node: MacroCallNode, depth: number) => string[];
  /** Bound node visitor provided by the simulator core. */
  visitNodes: (nodes: CBSNode[], depth: number) => string;
}

/** Handler signature for macro evaluators. */
export type MacroHandler = (
  node: MacroCallNode,
  state: MacroDispatchState,
  depth: number,
) => string;

/**
 * Combined non-pure macro handler map for dispatch.
 * Order: contextual → time-random → variable → slot-position.
 * Pure macros are dispatched separately by the engine/dispatch module.
 */
export const MACRO_HANDLERS: Readonly<Record<string, MacroHandler>> = {
  ...CONTEXTUAL_MACRO_HANDLERS,
  ...TIME_RANDOM_MACRO_HANDLERS,
  ...VARIABLE_MACRO_HANDLERS,
  ...SLOT_POSITION_MACRO_HANDLERS,
};
