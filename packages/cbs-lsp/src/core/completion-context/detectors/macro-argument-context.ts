/**
 * Reusable macro argument completion routing helpers.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/macro-argument-context.ts
 */

import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';
import { createCalcArgumentContext } from './calc-expression-context';

type SpecialMacroArgumentPolicy = 'disabled' | 'first' | 'any';

interface RouteMacroArgumentContextOptions {
  macroName: string;
  argumentIndex: number | null;
  prefix: string;
  startOffset: number;
  endOffset: number;
  calcPolicy?: SpecialMacroArgumentPolicy;
  metadataPolicy?: SpecialMacroArgumentPolicy;
  callPolicy?: SpecialMacroArgumentPolicy;
  whenPolicy?: SpecialMacroArgumentPolicy;
  runCalcBeforeVariable?: boolean;
  runWhenBeforeVariable?: boolean;
  metadataPrefix?: string;
  callPrefix?: string;
}

/**
 * routeMacroArgumentContext 함수.
 * variable macro argument를 우선 라우팅하고 macro별 특수 argument 후보로 fallback함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @param options - macro 이름, argument 위치, 교체 범위, 특수 macro 정책
 * @returns macro argument completion context 또는 null
 */
export function routeMacroArgumentContext(
  state: CompletionDetectionState,
  options: RouteMacroArgumentContextOptions,
): CompletionTriggerContext | null {
  if (options.runCalcBeforeVariable) {
    const calcContext = createSpecialCalcContext(options);
    if (calcContext) {
      return calcContext;
    }
  }

  if (options.runWhenBeforeVariable) {
    const whenContext = createSpecialWhenContext(options);
    if (whenContext) {
      return whenContext;
    }
  }

  if (typeof options.argumentIndex === 'number') {
    const variableContext = state.createVariableArgumentContext(
      options.macroName,
      options.argumentIndex,
      options.prefix,
      options.startOffset,
      options.endOffset,
    );
    if (variableContext) {
      return variableContext;
    }
  }

  if (isSpecialMacroArgument(options, 'metadata', options.metadataPolicy ?? 'disabled')) {
    return {
      type: 'metadata-keys',
      prefix: options.metadataPrefix ?? options.prefix,
      startOffset: options.startOffset,
      endOffset: options.endOffset,
    };
  }

  if (isSpecialMacroArgument(options, 'call', options.callPolicy ?? 'disabled')) {
    return {
      type: 'function-names',
      prefix: options.callPrefix ?? options.prefix,
      startOffset: options.startOffset,
      endOffset: options.endOffset,
    };
  }

  return createSpecialCalcContext(options) ?? createSpecialWhenContext(options);
}

function createSpecialCalcContext(
  options: RouteMacroArgumentContextOptions,
): CompletionTriggerContext | null {
  if (!isSpecialMacroArgument(options, 'calc', options.calcPolicy ?? 'disabled')) {
    return null;
  }

  return createCalcArgumentContext(options.prefix, options.startOffset, options.endOffset);
}

function createSpecialWhenContext(
  options: RouteMacroArgumentContextOptions,
): CompletionTriggerContext | null {
  if (!isSpecialMacroArgument(options, '#when', options.whenPolicy ?? 'disabled')) {
    return null;
  }

  return {
    type: 'when-operators',
    prefix: options.prefix,
    startOffset: options.startOffset,
    endOffset: options.endOffset,
  };
}

function isSpecialMacroArgument(
  options: RouteMacroArgumentContextOptions,
  macroName: string,
  policy: SpecialMacroArgumentPolicy,
): boolean {
  if (policy === 'disabled' || options.macroName !== macroName) {
    return false;
  }

  return policy === 'any' || options.argumentIndex === 0;
}
