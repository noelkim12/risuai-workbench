/**
 * CBS fragment cursor 위치에서 completion trigger context를 판별하는 유틸.
 * @file packages/cbs-lsp/src/core/completion-context.ts
 */

import type { ScopeVariableArgumentKind } from '../analyzer/scope/scope-macro-rules';
import { createCompletionDetectionState, type CompletionDetectionState } from './completion-context/detection-state';
import { detectArgumentReferenceContext } from './completion-context/detectors/argument-reference-context';
import { detectBlockEndContext, detectCloseBraceContext } from './completion-context/detectors/block-tag-context';
import { detectCalcExpressionZoneContext } from './completion-context/detectors/calc-expression-context';
import { detectCallFunctionContext } from './completion-context/detectors/call-function-argument-context';
import { detectEachIteratorContext } from './completion-context/detectors/each-iterator-context';
import { detectFallbackOpenBraceContext } from './completion-context/detectors/fallback-open-brace-context';
import { detectPlainTextMacroContext } from './completion-context/detectors/plain-text-macro-context';
import { detectSlotAliasContext } from './completion-context/detectors/slot-alias-context';
import { detectTokenMacroArgumentContext } from './completion-context/detectors/token-macro-argument-context';
import {
  detectBlockStartContext,
  detectElseKeywordContext,
  detectFunctionNameContext,
} from './completion-context/detectors/token-keyword-context';
import { detectWhenOperatorContext } from './completion-context/detectors/when-operator-context';
import type { FragmentCursorLookupResult } from './fragment-locator';

/**
 * Completion trigger context 판별 결과.
 * Completion provider가 어떤 후보군을 제공하고 어떤 범위를 교체할지 정의함.
 */
export type CompletionTriggerContext =
  | { type: 'all-functions'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'block-functions'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'else-keyword'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'close-tag'; prefix: string; startOffset: number; endOffset: number; blockKind: string }
  | {
      type: 'variable-names';
      prefix: string;
      startOffset: number;
      endOffset: number;
      kind: ScopeVariableArgumentKind;
    }
  | { type: 'metadata-keys'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'function-names'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'argument-indices'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'slot-aliases'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'when-operators'; prefix: string; startOffset: number; endOffset: number }
  | {
      type: 'calc-expression';
      prefix: string;
      startOffset: number;
      endOffset: number;
      referenceKind: 'chat' | 'global' | null;
    }
  | { type: 'none' };

type CompletionContextDetector = (state: CompletionDetectionState) => CompletionTriggerContext | null;

const orderedCompletionContextDetectors: readonly CompletionContextDetector[] = [
  detectCalcExpressionZoneContext,
  detectSlotAliasContext,
  detectCallFunctionContext,
  detectArgumentReferenceContext,
  detectEachIteratorContext,
  (state) => detectWhenOperatorContext(state, { useSeparatorPrefix: true }),
  detectTokenMacroArgumentContext,
  detectBlockEndContext,
  detectCloseBraceContext,
  detectPlainTextMacroContext,
  detectElseKeywordContext,
  detectBlockStartContext,
  detectFunctionNameContext,
  detectFallbackOpenBraceContext,
];

/**
 * detectCompletionTriggerContext 함수.
 * fragment cursor lookup을 해석해 현재 위치에 맞는 completion 후보군을 결정함.
 *
 * @param lookup - fragment locator가 계산한 cursor lookup 결과
 * @returns cursor 위치에서 사용할 completion trigger context
 */
export function detectCompletionTriggerContext(
  lookup: FragmentCursorLookupResult,
): CompletionTriggerContext {
  const state = createCompletionDetectionState(lookup);

  for (const detector of orderedCompletionContextDetectors) {
    const context = detector(state);
    if (context !== null) {
      return context;
    }
  }

  return { type: 'none' };
}
