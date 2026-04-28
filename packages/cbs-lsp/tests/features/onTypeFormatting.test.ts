/**
 * OnTypeFormattingProvider 회귀 테스트.
 * @file packages/cbs-lsp/tests/features/onTypeFormatting.test.ts
 */

import type { DocumentOnTypeFormattingParams } from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import { createSyntheticDocumentVersion, FragmentAnalysisService } from '../../src/core';
import { FormattingProvider, OnTypeFormattingProvider, type FormattingRequestResolver } from '../../src/features/editing';
import { offsetToPosition } from '../../src/utils/position';
import { applyTextEdits } from '../helpers/formatting-contract';

interface TestRequest {
  uri: string;
  version: number | string;
  filePath: string;
  text: string;
}

/**
 * createRequest 함수.
 * 테스트용 host document 요청 payload를 생성함.
 *
 * @param filePath - artifact routing에 사용할 host file path
 * @param text - host document 원문
 * @returns fragment analysis request와 호환되는 테스트 요청
 */
function createRequest(filePath: string, text: string): TestRequest {
  return {
    uri: `file:///fixtures/${filePath}`,
    version: createSyntheticDocumentVersion(text),
    filePath: `/fixtures/${filePath}`,
    text,
  };
}

/**
 * createParams 함수.
 * on-type formatting 요청 payload를 생성함.
 *
 * @param request - 대상 host document 요청
 * @param searchText - position 계산 기준 문자열
 * @param ch - editor가 입력한 trigger character
 * @returns DocumentOnTypeFormattingParams payload
 */
function createParams(
  request: TestRequest,
  searchText: string,
  ch: string = '\n',
): DocumentOnTypeFormattingParams {
  const offset = request.text.indexOf(searchText);
  expect(offset).toBeGreaterThanOrEqual(0);

  return {
    textDocument: { uri: request.uri },
    position: offsetToPosition(request.text, offset),
    ch,
    options: {
      tabSize: 2,
      insertSpaces: true,
    },
  };
}

/**
 * createProvider 함수.
 * 테스트 요청 하나에 연결된 on-type provider를 구성함.
 *
 * @param request - resolveRequest가 반환할 대상 요청
 * @returns on-type provider와 공유 analysis service
 */
function createProvider(request: TestRequest): {
  analysisService: FragmentAnalysisService;
  provider: OnTypeFormattingProvider;
} {
  const analysisService = new FragmentAnalysisService();
  const resolveRequest: FormattingRequestResolver = (uri) => (uri === request.uri ? request : null);
  const formattingProvider = new FormattingProvider({
    analysisService,
    resolveRequest,
  });

  return {
    analysisService,
    provider: new OnTypeFormattingProvider({
      analysisService,
      formattingProvider,
      resolveRequest,
    }),
  };
}

describe('OnTypeFormattingProvider', () => {
  it('returns [] for trigger characters other than newline', () => {
    const request = createRequest('lorebooks/basic.risulorebook', [
      '---',
      'name: entry',
      '---',
      '@@@ CONTENT',
      'Hello {{ user }}',
      '',
    ].join('\n'));
    const { provider } = createProvider(request);

    expect(provider.provide(createParams(request, '{{ user }}', '}'))).toEqual([]);
  });

  it('returns [] for non-CBS documents', () => {
    const request = createRequest('notes/plain.txt', 'Hello {{ user }}\n');
    const { provider } = createProvider(request);

    expect(provider.provide(createParams(request, '{{ user }}'))).toEqual([]);
  });

  it('returns [] for multi-fragment documents', () => {
    const request = createRequest('regex/multi.risuregex', [
      '---',
      'comment: rule',
      'type: plain',
      '---',
      '@@@ IN',
      '{{ user }}',
      '@@@ OUT',
      '{{#if ready}}ok{{/}}',
      '',
    ].join('\n'));
    const { provider } = createProvider(request);

    expect(provider.provide(createParams(request, '{{ user }}'))).toEqual([]);
  });

  it('returns [] when the trigger position is outside the CBS fragment', () => {
    const request = createRequest('lorebooks/frontmatter.risulorebook', [
      '---',
      'name: entry',
      '---',
      '@@@ CONTENT',
      'Hello {{ user }}',
      '',
    ].join('\n'));
    const { provider } = createProvider(request);

    expect(provider.provide(createParams(request, 'name: entry'))).toEqual([]);
  });

  it('returns [] for recovery-unstable documents', () => {
    const request = createRequest('lorebooks/malformed.risulorebook', [
      '---',
      'name: entry',
      '---',
      '@@@ CONTENT',
      '{{#if true}}missing close',
      '',
    ].join('\n'));
    const { analysisService, provider } = createProvider(request);

    expect(analysisService.analyzeDocument(request)?.recovery.hasRecoveredFragments).toBe(true);
    expect(provider.provide(createParams(request, '{{#if true}}'))).toEqual([]);
  });

  it('returns line-local canonical edits for a single stable CBS fragment', () => {
    const request = createRequest('lorebooks/basic.risulorebook', [
      '---',
      'name: entry',
      '---',
      '@@@ CONTENT',
      'Hello {{ user }}',
      '',
    ].join('\n'));
    const { provider } = createProvider(request);

    const edits = provider.provide(createParams(request, '{{ user }}'));

    expect(edits).toHaveLength(1);
    expect(applyTextEdits(request.text, edits)).toBe([
      '---',
      'name: entry',
      '---',
      '@@@ CONTENT',
      'Hello {{user}}',
      '',
    ].join('\n'));
  });
});
