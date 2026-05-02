/**
 * CBS fragment-local on-type formatting provider.
 * 현재 contract는 단일 안정 CBS fragment에서만 동작하며,
 * safe trigger로 newline(`\n`)만 허용한다.
 * canonical serializer 기준으로 다른 trigger는 전체 재작성 위험이 있어
 * on-type에서 광고하지 않음.
 * @file packages/cbs-lsp/src/features/onTypeFormatting.ts
 */

import {
  TextEdit,
  type DocumentOnTypeFormattingParams,
} from 'vscode-languageserver/node';

import {
  findOwningHostFragmentAnalysis,
  fragmentAnalysisService,
  type FragmentAnalysisService,
} from '../../core';
import { FormattingProvider, type FormattingRequestResolver } from './formatting';

export interface OnTypeFormattingProviderOptions {
  analysisService?: FragmentAnalysisService;
  formattingProvider: FormattingProvider;
  resolveRequest: FormattingRequestResolver;
}

/**
 * OnTypeFormattingProvider 클래스.
 * 입력 중(`textDocument/onTypeFormatting`)에 단일 안정 CBS fragment 내에서만
 * newline trigger로 최소 indentation edit를 반환함.
 */
export class OnTypeFormattingProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly formattingProvider: FormattingProvider;

  private readonly resolveRequest: FormattingRequestResolver;

  constructor(options: OnTypeFormattingProviderOptions) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.formattingProvider = options.formattingProvider;
    this.resolveRequest = options.resolveRequest;
  }

  /**
   * provide 함수.
   * 단일 안정 CBS fragment 내에서 newline trigger 발생 시
   * 현재 line 또는 바로 다음 line에 영향을 주는 최소 edit만 반환함.
   *
   * @param params - editor on-type formatting request
   * @returns fragment-local safe edit 목록, 위험 상태면 빈 배열
   */
  provide(params: DocumentOnTypeFormattingParams): TextEdit[] {
    // safe trigger: newline only
    if (params.ch !== '\n') {
      return [];
    }

    const request = this.resolveRequest(params.textDocument.uri);
    if (!request) {
      return [];
    }

    const analysis = this.analysisService.analyzeDocument(request);
    if (!analysis || analysis.fragmentAnalyses.length !== 1) {
      return [];
    }

    if (analysis.recovery.hasRecoveredFragments) {
      return [];
    }

    const owningFragment = findOwningHostFragmentAnalysis(
      request.text,
      analysis.fragmentAnalyses,
      {
        start: params.position,
        end: params.position,
      },
    );
    if (!owningFragment) {
      return [];
    }

    const edits = this.formattingProvider.provide(params);
    const currentLine = params.position.line;

    return edits.filter((edit) => {
      const startLine = edit.range.start.line;
      const endLine = edit.range.end.line;
      // 현재 line 또는 바로 다음 line(새 줄 indent)과 교차하는 edit만 유지
      return startLine <= currentLine + 1 && endLine >= currentLine;
    });
  }
}
