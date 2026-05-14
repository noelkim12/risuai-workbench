/**
 * Variable and effect macro handlers for the CBS simulator.
 * Handles variable reads (getvar, getglobalvar, tempvar), writes (setvar, addvar,
 * setdefaultvar), temp variables, return values, and the shared variable resolution
 * precedence chain.
 * @file packages/core/src/domain/cbs/simulator/macros/variables.ts
 */
import type { CBSNode, MacroCallNode } from '../../domain/cbs/parser/ast';
import type { CbsSimulationContext, CbsSimulationDiagnostic, CbsSimulationEffect } from '../types';
import { cloneRange, sourceForRange } from '../engine/source-range';
import type { SourceInfo } from '../engine/source-range';
import { pushTrace } from '../engine/trace';
import type { TraceState } from '../engine/trace';
import { hasOwn, stringifyVariableValue } from '../values';

/** Variable resolution source label for getvar precedence chain. */
export interface VariableResolution {
  readonly value: string;
  readonly source: 'chat' | 'characterDefault' | 'templateDefault' | 'missing';
}

/**
 * Narrow state interface for variable and effect macro handlers.
 * Provides source access, trace emission, effect recording,
 * context variable stores, and argument evaluation.
 */
export interface VariableState extends SourceInfo, TraceState {
  readonly context: CbsSimulationContext;
  readonly tempVariables: Record<string, unknown>;
  diagnostics: CbsSimulationDiagnostic[];
  effects: CbsSimulationEffect[];
  /** Return value set by the return macro. */
  returnValue?: string;
  /** Flag set by the return macro to halt traversal. */
  forceReturn: boolean;
  /** Bound argument evaluator provided by the simulator core. */
  evaluateArgument: (nodes: CBSNode[] | undefined, depth: number) => string;
}

/** Handler signature for variable/effect macro evaluators. */
export type VariableMacroHandler = (
  node: MacroCallNode,
  state: VariableState,
  depth: number,
) => string;

/** Dry-run policy reason written to uncommitted variable write effects. */
export const UNCOMMITTED_EFFECT_REASON = 'dry-run policy blocked commit';

/**
 * resolveChatVariable 함수.
 * getvar precedence contract에 따라 source label과 값을 함께 반환함.
 *
 * @param state - simulation 누적 상태
 * @param key - 조회할 변수 이름
 * @returns resolved value and source label
 */
export function resolveChatVariable(state: VariableState, key: string): VariableResolution {
  if (hasOwn(state.context.chatVariables, key)) {
    return { value: stringifyVariableValue(state.context.chatVariables[key]), source: 'chat' };
  }
  if (hasOwn(state.context.characterDefaultVariables, key)) {
    return {
      value: stringifyVariableValue(state.context.characterDefaultVariables[key]),
      source: 'characterDefault',
    };
  }
  if (hasOwn(state.context.templateDefaultVariables, key)) {
    return {
      value: stringifyVariableValue(state.context.templateDefaultVariables[key]),
      source: 'templateDefault',
    };
  }
  return { value: '', source: 'missing' };
}

/**
 * evaluateGetVarMacro 함수.
 * chat → character default → template default → blank fallback 순서로 변수를 읽음.
 *
 * @param node - 평가할 getvar MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns resolved variable value string
 */
function evaluateGetVarMacro(node: MacroCallNode, state: VariableState, depth: number): string {
  const key = state.evaluateArgument(node.arguments[0], depth + 1);
  const resolved = resolveChatVariable(state, key);

  pushTrace(state, {
    phase: 'macro-skip',
    message: `resolved getvar ${JSON.stringify(key)} from ${resolved.source}`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, source: resolved.source },
  });

  return resolved.value;
}

/**
 * evaluateGetGlobalVarMacro 함수.
 * global variable store에서 값을 읽고 missing이면 빈 문자열을 반환함.
 *
 * @param node - 평가할 getglobalvar MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns resolved global variable value string
 */
function evaluateGetGlobalVarMacro(
  node: MacroCallNode,
  state: VariableState,
  depth: number,
): string {
  const key = state.evaluateArgument(node.arguments[0], depth + 1);
  const hasValue = hasOwn(state.context.globalVariables, key);
  const value = hasValue ? stringifyVariableValue(state.context.globalVariables[key]) : '';
  const source = hasValue ? 'global' : 'missing';

  pushTrace(state, {
    phase: 'macro-skip',
    message: `resolved getglobalvar ${JSON.stringify(key)} from ${source}`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, source },
  });

  return value;
}

/**
 * evaluateTempVarMacro 함수.
 * simulator-local temp state에서 값을 읽음.
 *
 * @param node - 평가할 tempvar MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns temp variable value or empty string
 */
function evaluateTempVarMacro(node: MacroCallNode, state: VariableState, depth: number): string {
  const key = state.evaluateArgument(node.arguments[0], depth + 1);
  const hasValue = hasOwn(state.tempVariables, key);
  const value = hasValue ? stringifyVariableValue(state.tempVariables[key]) : '';

  pushTrace(state, {
    phase: 'macro-skip',
    message: `resolved tempvar ${JSON.stringify(key)} from ${hasValue ? 'temp' : 'missing'}`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, source: hasValue ? 'temp' : 'missing' },
  });

  return value;
}

/**
 * evaluateSetTempVarMacro 함수.
 * caller context가 아닌 simulator-local temp state만 갱신함.
 *
 * @param node - 평가할 settempvar MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns empty output
 */
function evaluateSetTempVarMacro(node: MacroCallNode, state: VariableState, depth: number): string {
  const key = state.evaluateArgument(node.arguments[0], depth + 1);
  const value = state.evaluateArgument(node.arguments[1], depth + 1);
  state.tempVariables[key] = value;

  pushTrace(state, {
    phase: 'macro-skip',
    message: `settempvar ${JSON.stringify(key)} stored in simulator-local temp state`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, source: 'localTemp', committed: true },
  });

  return '';
}

/**
 * evaluateReturnMacro 함수.
 * simulator-local return state를 설정하고 이후 순회를 중단하도록 표시함.
 *
 * @param node - 평가할 return MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns empty output
 */
function evaluateReturnMacro(node: MacroCallNode, state: VariableState, depth: number): string {
  const value = state.evaluateArgument(node.arguments[0], depth + 1);
  state.returnValue = value;
  state.forceReturn = true;

  pushTrace(state, {
    phase: 'macro-skip',
    message: 'return value stored in simulator-local return state',
    node: node.name,
    range: cloneRange(node.range),
    details: { valuePreview: value, source: 'localReturn' },
  });

  return '';
}

/**
 * evaluateVariableEffectMacro 함수.
 * preview mode에서는 setter source를 보존하고 execute mode에서는 local dry-run write effect를 기록함.
 *
 * @param node - 평가할 variable write MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns empty output
 */
function evaluateVariableEffectMacro(
  node: MacroCallNode,
  state: VariableState,
  depth: number,
): string {
  if (state.context.executionMode !== 'execute') {
    const source = sourceForRange(state, node.range);
    pushTrace(state, {
      phase: 'macro-skip',
      message: `${node.name} preserved by preview execution mode`,
      node: node.name,
      range: cloneRange(node.range),
      details: { executionMode: 'preview', policy: 'source-preserved' },
    });
    return source;
  }

  const key = state.evaluateArgument(node.arguments[0], depth + 1);
  const value = evaluateVariableEffectValue(node, state, key, depth);
  const targetStore = node.name === 'setdefaultvar' ? 'characterDefaultVariable' : 'chatVariable';

  state.effects.push({
    operation: node.name,
    kind: 'variableWrite',
    targetStore,
    target: key,
    valuePreview: value,
    committed: false,
    commitBlockedReason: UNCOMMITTED_EFFECT_REASON,
    range: cloneRange(node.range),
    source: sourceForRange(state, node.range),
  });

  pushTrace(state, {
    phase: 'macro-skip',
    message: `${node.name} ${JSON.stringify(key)} recorded as execute-mode dry-run effect; commit blocked`,
    node: node.name,
    range: cloneRange(node.range),
    details: {
      key,
      valuePreview: value,
      committed: false,
      executionMode: 'execute',
      reason: UNCOMMITTED_EFFECT_REASON,
    },
  });

  return '';
}

/**
 * evaluateVariableEffectValue 함수.
 * setter macro별 execute-mode value preview를 계산함.
 *
 * @param node - 평가할 variable write MacroCall node
 * @param state - simulation 누적 상태
 * @param key - write 대상 variable key
 * @param depth - 현재 재귀 깊이
 * @returns local dry-run effect에 기록할 value preview
 */
function evaluateVariableEffectValue(
  node: MacroCallNode,
  state: VariableState,
  key: string,
  depth: number,
): string {
  const value = state.evaluateArgument(node.arguments[1], depth + 1);
  if (node.name !== 'addvar') return value;

  const currentValue = hasOwn(state.context.chatVariables, key)
    ? Number(stringifyVariableValue(state.context.chatVariables[key]))
    : 0;
  const deltaValue = Number(value);
  if (!Number.isFinite(currentValue) || !Number.isFinite(deltaValue)) {
    return value;
  }

  return (currentValue + deltaValue).toString();
}

/**
 * Registry of all variable and effect macro handlers.
 * Maps canonical macro names to their evaluator functions.
 */
export const VARIABLE_MACRO_HANDLERS: Readonly<Record<string, VariableMacroHandler>> = {
  getvar: evaluateGetVarMacro,
  getglobalvar: evaluateGetGlobalVarMacro,
  tempvar: evaluateTempVarMacro,
  gettempvar: evaluateTempVarMacro,
  settempvar: evaluateSetTempVarMacro,
  return: evaluateReturnMacro,
  setvar: evaluateVariableEffectMacro,
  addvar: evaluateVariableEffectMacro,
  setdefaultvar: evaluateVariableEffectMacro,
};
