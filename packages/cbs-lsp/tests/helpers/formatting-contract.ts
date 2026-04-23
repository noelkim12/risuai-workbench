/**
 * formatting golden/contract 테스트에서 공용으로 쓰는 host safety 검증 헬퍼.
 * @file packages/cbs-lsp/tests/helpers/formatting-contract.ts
 */

import type { TextEdit } from 'vscode-languageserver/node';
import { expect } from 'vitest';

import { FragmentAnalysisService } from '../../src/core';
import { positionToOffset } from '../../src/utils/position';

interface TextDocumentRequestLike {
  uri: string;
  version: number | string;
  filePath: string;
  text: string;
}

/**
 * applyTextEdits 함수.
 * LSP TextEdit 배열을 host 문서 문자열에 deterministic 순서로 적용함.
 *
 * @param text - edit를 적용할 host 문서 전문
 * @param edits - 적용할 LSP TextEdit 목록
 * @returns edit가 반영된 최종 host 문서 문자열
 */
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  return [...edits]
    .sort((left, right) => {
      const leftStart = positionToOffset(text, left.range.start);
      const rightStart = positionToOffset(text, right.range.start);
      return rightStart - leftStart;
    })
    .reduce((currentText, edit) => {
      const startOffset = positionToOffset(currentText, edit.range.start);
      const endOffset = positionToOffset(currentText, edit.range.end);
      return `${currentText.slice(0, startOffset)}${edit.newText}${currentText.slice(endOffset)}`;
    }, text);
}

/**
 * collectHostTextOutsideFragments 함수.
 * 문서를 fragment 바깥 host segment 배열로 분해해 불변 텍스트를 비교하기 쉽게 만듦.
 *
 * @param request - fragment 분석에 사용할 host 문서 요청
 * @param analysisService - fragment 경계를 해석할 분석 서비스
 * @returns fragment 사이/바깥의 host text segment 목록
 */
function collectHostTextOutsideFragments(
  request: TextDocumentRequestLike,
  analysisService: FragmentAnalysisService,
): string[] {
  const analysis = analysisService.analyzeDocument(request);
  expect(analysis).not.toBeNull();

  const fragments = analysis?.fragmentAnalyses ?? [];
  if (fragments.length === 0) {
    return [request.text];
  }

  const segments: string[] = [];
  let cursor = 0;

  for (const fragmentAnalysis of fragments) {
    segments.push(request.text.slice(cursor, fragmentAnalysis.fragment.start));
    cursor = fragmentAnalysis.fragment.end;
  }

  segments.push(request.text.slice(cursor));
  return segments;
}

/**
 * assertHostTextOutsideFragmentsUnchanged 함수.
 * formatting/patch 뒤에도 fragment 바깥 host 텍스트가 그대로 유지되는지 검증함.
 *
 * @param beforeRequest - formatting 전 host 문서 요청
 * @param afterRequest - formatting 후 host 문서 요청
 * @param analysisService - before/after fragment 경계를 비교할 분석 서비스
 */
export function assertHostTextOutsideFragmentsUnchanged(
  beforeRequest: TextDocumentRequestLike,
  afterRequest: TextDocumentRequestLike,
  analysisService: FragmentAnalysisService = new FragmentAnalysisService(),
): void {
  const beforeAnalysis = analysisService.analyzeDocument(beforeRequest);
  const afterAnalysis = analysisService.analyzeDocument(afterRequest);

  expect(beforeAnalysis).not.toBeNull();
  expect(afterAnalysis).not.toBeNull();
  expect(afterAnalysis?.fragmentAnalyses).toHaveLength(beforeAnalysis?.fragmentAnalyses.length ?? 0);

  expect(collectHostTextOutsideFragments(beforeRequest, analysisService)).toEqual(
    collectHostTextOutsideFragments(afterRequest, analysisService),
  );
}
