/**
 * Shared malformed/recovery-state contract for fragment analysis consumers.
 * @file packages/cbs-lsp/src/core/recovery-contract.ts
 */

import type { CBSDocument, TokenizerDiagnostic } from 'risu-workbench-core';

export type FragmentRecoveryMode = 'clean' | 'token-recovery' | 'structure-recovery';

export interface FragmentRecoveryState {
  mode: FragmentRecoveryMode;
  hasSyntaxRecovery: boolean;
  tokenContextReliable: boolean;
  structureReliable: boolean;
  hasTokenizerRecovery: boolean;
  hasParserRecovery: boolean;
  hasUnclosedMacro: boolean;
  hasUnclosedBlock: boolean;
  hasInvalidBlockNesting: boolean;
  syntaxDiagnosticCodes: readonly string[];
}

export interface DocumentRecoveryState {
  hasRecoveredFragments: boolean;
  fragmentModes: readonly FragmentRecoveryMode[];
}

const TOKEN_RECOVERY_CODES = new Set(['CBS001']);
const STRUCTURE_RECOVERY_CODES = new Set(['CBS002', 'CBS006']);

/**
 * createFragmentRecoveryState 함수.
 * tokenizer/parser 진단을 바탕으로 fragment의 recovery 신뢰도를 계산함.
 *
 * @param tokenizerDiagnostics - tokenizer 단계에서 나온 fragment-local 진단 목록
 * @param document - parser 진단을 담은 fragment-local CBS 문서
 * @returns feature 공용 recovery 상태 요약
 */
export function createFragmentRecoveryState(
  tokenizerDiagnostics: readonly Pick<TokenizerDiagnostic, 'code'>[],
  document: Pick<CBSDocument, 'diagnostics'>,
): FragmentRecoveryState {
  const syntaxDiagnosticCodes = Array.from(
    new Set([
      ...tokenizerDiagnostics.map((diagnostic) => diagnostic.code),
      ...document.diagnostics.map((diagnostic) => diagnostic.code),
    ]),
  ).sort();

  const hasUnclosedMacro = syntaxDiagnosticCodes.some((code) => TOKEN_RECOVERY_CODES.has(code));
  const hasUnclosedBlock = syntaxDiagnosticCodes.includes('CBS002');
  const hasInvalidBlockNesting = syntaxDiagnosticCodes.includes('CBS006');
  const hasTokenizerRecovery = tokenizerDiagnostics.length > 0;
  const hasParserRecovery = document.diagnostics.some((diagnostic) =>
    STRUCTURE_RECOVERY_CODES.has(diagnostic.code),
  );
  const tokenContextReliable = !hasUnclosedMacro;
  const structureReliable = tokenContextReliable && !hasUnclosedBlock && !hasInvalidBlockNesting;
  const hasSyntaxRecovery = hasTokenizerRecovery || hasParserRecovery;

  return {
    mode: !hasSyntaxRecovery
      ? 'clean'
      : !tokenContextReliable
        ? 'token-recovery'
        : 'structure-recovery',
    hasSyntaxRecovery,
    tokenContextReliable,
    structureReliable,
    hasTokenizerRecovery,
    hasParserRecovery,
    hasUnclosedMacro,
    hasUnclosedBlock,
    hasInvalidBlockNesting,
    syntaxDiagnosticCodes,
  };
}

/**
 * createDocumentRecoveryState 함수.
 * fragment recovery 상태들을 문서 단위 요약으로 합침.
 *
 * @param fragmentRecoveryStates - fragment별 recovery 상태 목록
 * @returns 문서 전체의 recovery 요약
 */
export function createDocumentRecoveryState(
  fragmentRecoveryStates: readonly FragmentRecoveryState[],
): DocumentRecoveryState {
  return {
    hasRecoveredFragments: fragmentRecoveryStates.some((state) => state.hasSyntaxRecovery),
    fragmentModes: fragmentRecoveryStates.map((state) => state.mode),
  };
}
