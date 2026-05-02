/**
 * diagnostics 수집 공용 context 정의와 생성 유틸.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/context.ts
 */

import {
  CBSTokenizer,
  type CBSBuiltinRegistry,
  type CBSDocument,
  type Token,
} from 'risu-workbench-core';

import type { ScopeAnalysisResult } from '../symbolTable';

/**
 * DiagnosticsContext 인터페이스.
 * diagnostics collector가 AST, 원문, registry, scope 정보를 한 번에 읽는 공유 문맥.
 */
export interface DiagnosticsContext {
  document: CBSDocument;
  sourceText: string;
  hasSourceText: boolean;
  registry: CBSBuiltinRegistry;
  tokens: readonly Token[];
  scopeAnalysis?: ScopeAnalysisResult;
}

/**
 * createDiagnosticsContext 함수.
 * diagnostics collector들이 공통으로 쓰는 문맥 객체를 생성함.
 *
 * @param document - tokenizer/parser 진단이 들어 있는 CBS 문서 AST
 * @param sourceText - 추가 range 계산과 토큰 문맥 복원에 쓸 fragment 원문
 * @param registry - builtin metadata 조회에 쓸 CBS registry
 * @param scopeAnalysis - 선택적 scope 분석 결과
 * @returns collector 간에 공유할 diagnostics context
 */
export function createDiagnosticsContext(
  document: CBSDocument,
  sourceText: string,
  registry: CBSBuiltinRegistry,
  scopeAnalysis?: ScopeAnalysisResult,
): DiagnosticsContext {
  const hasSourceText = sourceText.length > 0;

  return {
    document,
    sourceText,
    hasSourceText,
    registry,
    scopeAnalysis,
    tokens: hasSourceText ? new CBSTokenizer().tokenize(sourceText) : [],
  };
}
