/**
 * CBS fragment scope 분석 진입점과 visible loop binding export를 제공함.
 * @file packages/cbs-lsp/src/analyzer/scopeAnalyzer.ts
 */

import { type CBSDocument } from 'risu-workbench-core';

import { ScopeIssueStore, type ScopeAnalysisResult, SymbolTable } from './symbolTable';
import { AnalyzableBodyResolver } from './scope/analyzable-body-resolver';
import {
  createFragmentDefinitionMaps,
  DefinitionCollector,
} from './scope/definition-collector';
import { ReferenceCollector } from './scope/reference-collector';

export {
  collectVisibleLoopBindingsFromNodePath,
  resolveVisibleLoopBindingFromNodePath,
} from './scope/visible-loop-bindings';

/**
 * ScopeAnalyzer 클래스.
 * CBS fragment에서 변수/함수 심볼과 semantic issue를 함께 수집함.
 */
export class ScopeAnalyzer {
  /**
   * analyze 함수.
   * 문서 AST와 fragment 원문을 함께 읽어 scope-aware analysis result를 생성함.
   *
   * @param document - 정의/참조를 수집할 CBS 문서 AST
   * @param sourceText - range 계산과 body 재파싱에 쓸 fragment 원문
   * @returns symbol table과 semantic issue store가 묶인 scope analysis 결과
   */
  analyze(document: CBSDocument, sourceText: string = ''): ScopeAnalysisResult {
    const symbolTable = new SymbolTable();
    const issues = new ScopeIssueStore();
    const fragmentDefinitions = createFragmentDefinitionMaps();
    const bodyResolver = new AnalyzableBodyResolver();

    new DefinitionCollector(symbolTable, fragmentDefinitions, sourceText, bodyResolver).collect(document);
    new ReferenceCollector(symbolTable, issues, fragmentDefinitions, sourceText, bodyResolver).collect(
      document,
    );

    return {
      symbolTable,
      issues,
    };
  }
}
