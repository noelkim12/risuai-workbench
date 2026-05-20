/**
 * Macro dispatch orchestrator for the CBS simulator.
 * Handles macro call resolution, handler execution, unknown macro handling,
 * fallback policy application, pure macro evaluation, side-channel argument
 * evaluation, coverage recording, and trace entry/exit lifecycle.
 * @file packages/core/src/domain/cbs/simulator/engine/dispatch.ts
 */
import type { MacroCallNode } from '../../domain/cbs/parser/ast';
import { CBSBuiltinRegistry } from '../../domain/cbs/registry/builtins';
import { getCbsSupportClassification } from '../support-classification';
import { CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE } from '../unsupported-diagnostics';
import { addInvalidPureMacroDiagnostic, addSimulatorDiagnostic } from './diagnostics';
import { recordMacro } from './coverage';
import { cloneRange, sourceForRange } from './source-range';
import { pushTrace } from './trace';
import { getErrorMessage } from '../../shared/errors';
import { PURE_MACRO_HANDLERS } from '../macros/pure';
import { MACRO_HANDLERS } from '../macros/registry';
import type { MacroDispatchState } from '../macros/registry';
import { classifyMacroFallback, CONTROL_FLOW_UNSUPPORTED_MACROS } from '../macros/fallback-policy';

const BUILTIN_REGISTRY = new CBSBuiltinRegistry();

/**
 * evaluateMacroCall 함수.
 * MacroCall node를 평가하고 출력을 반환함. Handler가 있으면 실행하고,
 * unknown macro는 source를 보존하며, fallback policy에 따라
 * preview-empty, literal-inlay, source-preservation 동작을 적용함.
 *
 * @param node - 평가할 MacroCall node
 * @param state - simulation 누적 상태 (MacroDispatchState)
 * @param depth - 현재 재귀 깊이
 * @returns 평가된 출력 문자열
 */
export function evaluateMacroCall(
  node: MacroCallNode,
  state: MacroDispatchState,
  depth: number,
): string {
  const macroName = node.name;
  const builtin = BUILTIN_REGISTRY.get(macroName);
  const canonicalName = builtin?.name ?? macroName;
  const supportClass = getSimulatorSupportClassification(canonicalName);

  // Record coverage
  recordMacro(state, canonicalName, supportClass);

  // Emit macro-enter trace
  pushTrace(state, {
    phase: 'macro-enter',
    message: `entering macro ${canonicalName}`,
    node: canonicalName,
    range: cloneRange(node.range),
  });

  // Check if macro is known
  if (supportClass === undefined) {
    return handleUnknownMacro(node, state, canonicalName, macroName);
  }

  // Try handler dispatch
  const handler = MACRO_HANDLERS[canonicalName];
  if (handler) {
    const output = handler({ ...node, name: canonicalName }, state, depth);

    pushTrace(state, {
      phase: 'macro-exit',
      message: `exiting macro ${canonicalName}`,
      node: canonicalName,
      range: cloneRange(node.range),
    });

    return output;
  }

  // Try pure macro dispatch
  const pureDefinition = PURE_MACRO_HANDLERS[canonicalName];
  if (pureDefinition) {
    const output = evaluatePureMacro({ ...node, name: canonicalName }, state, depth);

    pushTrace(state, {
      phase: 'macro-exit',
      message: `exiting macro ${canonicalName}`,
      node: canonicalName,
      range: cloneRange(node.range),
    });

    return output;
  }

  // Apply fallback policy for macros without handlers
  return applyFallbackPolicy(node, state, depth, canonicalName, supportClass);
}

/**
 * handleUnknownMacro 함수.
 * Unknown macro를 source 보존으로 처리하고 warning diagnostic을 emit함.
 *
 * @param node - 원본 MacroCall node
 * @param state - simulation 누적 상태
 * @param canonicalName - registry canonical name
 * @param macroName - 원본 macro name (diagnostic용)
 * @returns 보존된 원본 source 텍스트
 */
function handleUnknownMacro(
  node: MacroCallNode,
  state: MacroDispatchState,
  canonicalName: string,
  macroName: string,
): string {
  const source = sourceForRange(state, node.range);

  pushTrace(state, {
    phase: 'macro-skip',
    message: `unknown macro ${canonicalName} - preserving source`,
    node: canonicalName,
    range: cloneRange(node.range),
  });

  addSimulatorDiagnostic(state, {
    code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
    message: `Unknown CBS macro ${JSON.stringify(macroName)}`,
    severity: 'warning',
    range: cloneRange(node.nameRange),
  });

  pushTrace(state, {
    phase: 'macro-exit',
    message: `exiting macro ${canonicalName} (unknown, preserved)`,
    node: canonicalName,
    range: cloneRange(node.range),
  });

  return source;
}

/**
 * applyFallbackPolicy 함수.
 * Handler가 없는 known macro에 대해 fallback policy를 적용함.
 * Preview-empty, literal-inlay, source-preservation, deferred 동작을
 * support classification에 따라 결정함.
 *
 * @param node - 원본 MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @param canonicalName - registry canonical name
 * @param supportClass - support classification
 * @returns fallback policy에 따른 출력 문자열
 */
function applyFallbackPolicy(
  node: MacroCallNode,
  state: MacroDispatchState,
  depth: number,
  canonicalName: string,
  supportClass: NonNullable<ReturnType<typeof getSimulatorSupportClassification>>,
): string {
  const source = sourceForRange(state, node.range);
  const policy = classifyMacroFallback(canonicalName, supportClass);

  pushTrace(state, {
    phase: 'macro-skip',
    message: policy.traceMessage,
    node: canonicalName,
    range: cloneRange(node.range),
    details: policy.traceDetails,
  });

  if (policy.diagnosticMessage) {
    addSimulatorDiagnostic(state, {
      code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
      message: policy.diagnosticMessage,
      severity: 'warning',
      range: cloneRange(node.nameRange),
    });
  }

  visitArgumentsForSideEffects(node, state, depth);

  pushTrace(state, {
    phase: 'macro-exit',
    message: `exiting macro ${canonicalName}`,
    node: canonicalName,
    range: cloneRange(node.range),
  });

  return policy.output === '' ? '' : source;
}

/**
 * visitArgumentsForSideEffects 함수.
 * Deferred macro arguments를 output에 반영하지 않고
 * coverage/trace/diagnostic 위해 순회함.
 *
 * @param node - argument를 순회할 macro call node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 */
function visitArgumentsForSideEffects(
  node: MacroCallNode,
  state: MacroDispatchState,
  depth: number,
): void {
  for (const argNodes of node.arguments) {
    if (argNodes.length > 0) {
      state.visitNodes(argNodes, depth + 1);
    }
  }
}

/**
 * evaluatePureMacro 함수.
 * Deterministic pure macro arguments를 먼저 평가한 뒤 table handler를 실행함.
 *
 * @param node - 평가할 pure MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns pure macro 평가 결과 문자열
 */
function evaluatePureMacro(node: MacroCallNode, state: MacroDispatchState, depth: number): string {
  const definition = PURE_MACRO_HANDLERS[node.name];
  if (!definition) return sourceForRange(state, node.range);

  const args = node.arguments.map((argNodes) => state.evaluateArgument(argNodes, depth + 1));
  if (definition.minArgs !== undefined && args.length < definition.minArgs) {
    addInvalidPureMacroDiagnostic(
      state,
      node,
      `Expected at least ${definition.minArgs} argument(s), got ${args.length}`,
    );
    return '';
  }

  try {
    const result = definition.evaluator(args, node, state);
    pushTrace(state, {
      phase: 'macro-skip',
      message: `evaluated pure macro ${node.name}`,
      node: node.name,
      range: cloneRange(node.range),
      details: { argsPreview: args, resultPreview: result },
    });
    return result;
  } catch (error) {
    const message = getErrorMessage(error);
    addInvalidPureMacroDiagnostic(state, node, message);
    return '';
  }
}

/**
 * getSimulatorSupportClassification 함수.
 * Registry 밖 control-flow runtime 항목까지 dry-run simulator 정책으로 분류함.
 *
 * @param name - macro 또는 block 이름
 * @returns support classification 또는 undefined
 */
export function getSimulatorSupportClassification(
  name: string,
): ReturnType<typeof getCbsSupportClassification> {
  if (CONTROL_FLOW_UNSUPPORTED_MACROS.has(name.toLowerCase())) return 'unsupported';
  return getCbsSupportClassification(name, BUILTIN_REGISTRY);
}
