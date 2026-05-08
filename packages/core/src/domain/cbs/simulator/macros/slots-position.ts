/**
 * Slot and position macro handlers for the CBS simulator.
 * Slot reads from block stack frames and position reads from
 * explicit lore position context.
 * @file packages/core/src/domain/cbs/simulator/macros/slots-position.ts
 */
import type { CBSNode, MacroCallNode } from '../../parser/ast';
import type { CbsSimulationContext, CbsSimulationDiagnostic } from '../types';
import { cloneRange } from '../engine/source-range';
import type { SourceInfo } from '../engine/source-range';
import { pushTrace } from '../engine/trace';
import type { TraceState } from '../engine/trace';
import { preserveContextMacro, pushProviderTrace } from './contextual';

/**
 * Narrow state interface for slot and position macro handlers.
 * Provides source access, trace/diagnostic emission, context with lore positions,
 * slot frame stack, and argument evaluation.
 */
export interface SlotPositionState extends SourceInfo, TraceState {
  readonly context: CbsSimulationContext;
  readonly explicitContextKeys: ReadonlySet<string>;
  readonly slotFrames: Array<Record<string, string>>;
  diagnostics: CbsSimulationDiagnostic[];
  /** Bound argument evaluator provided by the simulator core. */
  evaluateArgument: (nodes: CBSNode[] | undefined, depth: number) => string;
}

/** Handler signature for slot/position macro evaluators. */
export type SlotPositionMacroHandler = (node: MacroCallNode, state: SlotPositionState, depth: number) => string;

/** evaluateSlotMacro 함수. keyed slot은 block frame에서 읽고 bare slot은 host context가 없으면 source를 보존함. */
function evaluateSlotMacro(node: MacroCallNode, state: SlotPositionState, depth: number): string {
  if (node.arguments.length === 0) {
    return preserveContextMacro(node, state, 'host slot context');
  }

  const key = state.evaluateArgument(node.arguments[0], depth + 1);
  const frame = state.slotFrames.at(-1);
  const value = frame ? frame[key] : undefined;
  pushTrace(state, {
    phase: 'macro-skip',
    message: `resolved slot ${JSON.stringify(key)} from ${value === undefined ? 'missing' : 'slotFrame'}`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, source: value === undefined ? 'missing' : 'slotFrame' },
  });
  return value ?? '';
}

/**
 * evaluatePositionMacro 함수.
 * 명시 lore position map이 있으면 값을 반환하고, 없으면 원본 position macro를 보존함.
 *
 * @param node - 평가할 position MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns lore position 값 또는 source-preserved macro text
 */
function evaluatePositionMacro(node: MacroCallNode, state: SlotPositionState, depth: number): string {
  const key = state.evaluateArgument(node.arguments[0], depth + 1);
  const value = state.context.lorePositions?.[key];
  if (value !== undefined) {
    pushProviderTrace(state, node, 'resolved position from explicit lore position context', {
      source: 'context.lorePositions',
      key,
    });
    return value;
  }

  return preserveContextMacro(node, state, 'context.lorePositions', { key });
}

/**
 * Registry of all slot and position macro handlers.
 * Maps canonical macro names to their evaluator functions.
 */
export const SLOT_POSITION_MACRO_HANDLERS: Readonly<Record<string, SlotPositionMacroHandler>> = {
  slot: evaluateSlotMacro,
  position: evaluatePositionMacro,
};
