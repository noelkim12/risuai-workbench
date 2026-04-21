/**
 * diagnostics collector를 조합해 최종 analyzer diagnostics를 만드는 orchestration 엔진.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/diagnostics-engine.ts
 */

import {
  walkAST,
  type CBSBuiltinRegistry,
  type CBSDocument,
  type DiagnosticInfo,
} from 'risu-workbench-core';

import type { ScopeAnalysisResult } from '../symbolTable';
import { collectMathExpressionDiagnostics } from './calc-expression-diagnostics';
import { createDiagnosticsContext } from './context';
import { stabilizeDiagnostics } from './diagnostic-info';
import { filterPureModeDiagnostics } from './pure-mode-filter';
import { collectSymbolDiagnostics } from './symbol-diagnostics';
import { collectBlockDiagnostics } from './collectors/block.collector';
import { collectLegacyAngleBracketDiagnostics } from './collectors/legacy-angle.collector';
import { collectMacroDiagnostics } from './collectors/macro.collector';
import { collectParserDiagnostics } from './collectors/parser-diagnostic.collector';

/**
 * DiagnosticsEngine 클래스.
 * parser/tokenizer 결과와 registry/symbol 정보를 합쳐 최종 CBS diagnostics를 수집함.
 */
export class DiagnosticsEngine {
  constructor(private readonly registry: CBSBuiltinRegistry) {}

  /**
   * analyze 함수.
 * 문서 AST, source text, scope analysis 결과를 함께 읽어 정규화된 diagnostics 목록을 생성함.
   *
   * @param document - tokenizer/parser 단계 진단이 담긴 CBS 문서 AST
   * @param sourceText - 추가 range 해석과 재토크나이즈에 쓸 fragment 원문
   * @param scopeAnalysis - 변수/함수/semantic issue scope 분석 결과, 없으면 symbol diagnostics는 생략함
   * @returns 정규화와 stable ordering까지 끝낸 diagnostic 배열
   */
  analyze(
    document: CBSDocument,
    sourceText: string = '',
    scopeAnalysis?: ScopeAnalysisResult,
  ): DiagnosticInfo[] {
    const context = createDiagnosticsContext(document, sourceText, this.registry, scopeAnalysis);
    const diagnostics: DiagnosticInfo[] = [...collectParserDiagnostics(context)];

    walkAST(document.nodes, {
      visitMacroCall: (node) => {
        diagnostics.push(...collectMacroDiagnostics(context, node));
      },
      visitBlock: (node) => {
        diagnostics.push(...collectBlockDiagnostics(context, node));
      },
      visitMathExpr: (node) => {
        if (!context.hasSourceText) {
          return;
        }

        diagnostics.push(...collectMathExpressionDiagnostics(node, context.sourceText));
      },
    });

    if (context.hasSourceText) {
      diagnostics.push(...collectLegacyAngleBracketDiagnostics(context));
    }

    if (context.scopeAnalysis) {
      diagnostics.push(...collectSymbolDiagnostics(context.scopeAnalysis));
    }

    const filteredDiagnostics = context.hasSourceText
      ? filterPureModeDiagnostics(context, diagnostics)
      : diagnostics;

    return stabilizeDiagnostics(filteredDiagnostics);
  }
}
