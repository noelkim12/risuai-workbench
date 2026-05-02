import type { DocumentFormattingParams, DocumentRangeFormattingParams, Range, TextEdit } from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import { createSyntheticDocumentVersion, FragmentAnalysisService } from '../../src/core';
import {
  FORMATTING_PROVIDER_AVAILABILITY,
  FormattingProvider,
} from '../../src/features/editing';
import { offsetToPosition } from '../../src/utils/position';
import {
  createFixtureRequest,
  getFixtureCorpusEntry,
  listFormattingContractFixtures,
} from '../fixtures/fixture-corpus';
import {
  applyTextEdits,
  assertHostTextOutsideFragmentsUnchanged,
} from '../helpers/formatting-contract';

function createParams(request: { uri: string }): DocumentFormattingParams {
  return {
    textDocument: { uri: request.uri },
    options: {
      tabSize: 2,
      insertSpaces: true,
    },
  };
}

/**
 * createRangeParams 함수.
 * 테스트용 range formatting 요청 payload를 만듦.
 *
 * @param request - 대상 문서 request
 * @param range - host document 기준 선택 range
 * @returns range formatting 요청 객체
 */
function createRangeParams(request: { uri: string }, range: Range): DocumentRangeFormattingParams {
  return {
    textDocument: { uri: request.uri },
    range,
    options: {
      tabSize: 2,
      insertSpaces: true,
    },
  };
}

function createRequestFromEntry(entryId: Parameters<typeof getFixtureCorpusEntry>[0], text: string) {
  const entry = getFixtureCorpusEntry(entryId);
  return {
    uri: entry.uri,
    version: createSyntheticDocumentVersion(text),
    filePath: entry.filePath,
    text,
  };
}

/**
 * createRangeFromTextMarkers 함수.
 * host 문서 안의 marker 구간을 range formatting 테스트용 LSP range로 변환함.
 *
 * @param text - range를 계산할 host 문서 전문
 * @param startNeedle - range 시작 marker
 * @param endNeedle - range 끝 marker
 * @returns marker 구간을 덮는 host range
 */
function createRangeFromTextMarkers(text: string, startNeedle: string, endNeedle: string): Range {
  const startOffset = text.indexOf(startNeedle);
  const endOffset = text.indexOf(endNeedle);

  expect(startOffset).toBeGreaterThanOrEqual(0);
  expect(endOffset).toBeGreaterThanOrEqual(0);

  return {
    start: offsetToPosition(text, startOffset),
    end: offsetToPosition(text, endOffset + endNeedle.length),
  };
}

/**
 * formatRequest 함수.
 * request 하나를 FormattingProvider로 실행해 host edit와 최종 텍스트를 함께 반환함.
 *
 * @param request - formatting 대상 host 문서 요청
 * @returns provider가 생성한 edit와 적용 후 텍스트
 */
function formatRequest(request: { uri: string; version: number | string; filePath: string; text: string }): {
  edits: TextEdit[];
  text: string;
} {
  const provider = new FormattingProvider({
    resolveRequest: (uri) => (uri === request.uri ? request : null),
  });

  const edits = provider.provide(createParams(request));
  return {
    edits,
    text: applyTextEdits(request.text, edits),
  };
}

/**
 * assertFormattingGoldenContract 함수.
 * formatting fixture가 idempotency와 fragment 바깥 host text 불변 계약을 지키는지 공통 검증함.
 *
 * @param request - 검증할 fixture request
 */
function assertFormattingGoldenContract(request: {
  uri: string;
  version: number | string;
  filePath: string;
  text: string;
}) {
  const analysisService = new FragmentAnalysisService();
  const firstPass = formatRequest(request);
  const firstPassRequest = {
    ...request,
    version: createSyntheticDocumentVersion(firstPass.text),
    text: firstPass.text,
  };
  const secondPass = formatRequest(firstPassRequest);

  assertHostTextOutsideFragmentsUnchanged(request, firstPassRequest, analysisService);
  expect(secondPass.text).toBe(firstPass.text);

  if (firstPass.edits.length === 0) {
    expect(firstPass.text).toBe(request.text);
  }

  expect(secondPass.edits).toEqual([]);
}

describe('FormattingProvider', () => {
  it('exposes active availability honesty metadata', () => {
    const provider = new FormattingProvider();

    expect(provider.availability).toEqual(FORMATTING_PROVIDER_AVAILABILITY);
    expect(provider.availability).toEqual({
      scope: 'local-only',
      source: 'server-capability:formatting',
      detail:
        'Formatting is active for routed CBS fragments, produces fragment-local canonical text edits, and only promotes host edits that pass the shared host-fragment safety contract.',
    });
  });

  it('formats a lorebook CONTENT fragment without touching host frontmatter', () => {
    const text = ['---', 'name: entry', '---', '@@@ CONTENT', 'Hello {{ user }} {{#if true}}yes{{:else}}no{{/}}', ''].join('\n');
    const request = createRequestFromEntry('lorebook-basic', text);
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    const edits = provider.provide(createParams(request));

    expect(edits).toHaveLength(1);
    expect(applyTextEdits(request.text, edits)).toBe([
      '---',
      'name: entry',
      '---',
      '@@@ CONTENT',
      'Hello {{user}} {{#if::true}}yes{{:else}}no{{/if}}',
      '',
    ].join('\n'));
  });

  it('formats each fragment independently in a multi-fragment regex document', () => {
    const text = [
      '---',
      'comment: rule',
      'type: plain',
      '---',
      '@@@ IN',
      '{{ user }}',
      '@@@ OUT',
      '{{#if ready}}ok{{/}}',
      '',
    ].join('\n');
    const request = createRequestFromEntry('regex-basic', text);
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    const edits = provider.provide(createParams(request));

    expect(edits).toHaveLength(2);
    expect(applyTextEdits(request.text, edits)).toBe([
      '---',
      'comment: rule',
      'type: plain',
      '---',
      '@@@ IN',
      '{{user}}',
      '@@@ OUT',
      '{{#if::ready}}ok{{/if}}',
      '',
    ].join('\n'));
  });

  it('formats the owning fragment for a selected range that stays inside one CBS fragment', () => {
    const text = ['---', 'name: entry', '---', '@@@ CONTENT', 'Hello {{ user }} {{#if true}}yes{{:else}}no{{/}}', ''].join('\n');
    const request = createRequestFromEntry('lorebook-basic', text);
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    const edits = provider.provideRange(
      createRangeParams(request, createRangeFromTextMarkers(text, '{{ user }}', '{{/}}')),
    );

    expect(edits).toHaveLength(1);
    expect(applyTextEdits(request.text, edits)).toBe([
      '---',
      'name: entry',
      '---',
      '@@@ CONTENT',
      'Hello {{user}} {{#if::true}}yes{{:else}}no{{/if}}',
      '',
    ].join('\n'));
  });

  it('returns [] when range formatting crosses from non-CBS host text into a fragment', () => {
    const text = ['---', 'name: entry', '---', '@@@ CONTENT', 'Hello {{ user }}', ''].join('\n');
    const request = createRequestFromEntry('lorebook-basic', text);
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    const edits = provider.provideRange(
      createRangeParams(request, createRangeFromTextMarkers(text, 'name: entry', '{{ user }}')),
    );

    expect(edits).toEqual([]);
  });

  it('returns [] when range formatting spans multiple CBS fragments', () => {
    const text = [
      '---',
      'comment: rule',
      'type: plain',
      '---',
      '@@@ IN',
      '{{ user }}',
      '@@@ OUT',
      '{{#if ready}}ok{{/}}',
      '',
    ].join('\n');
    const request = createRequestFromEntry('regex-basic', text);
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    const edits = provider.provideRange(
      createRangeParams(request, createRangeFromTextMarkers(text, '{{ user }}', '{{#if ready}}ok{{/}}')),
    );

    expect(edits).toEqual([]);
  });

  it('rewrites pure blocks structurally but keeps the pure body text untouched', () => {
    const text = ['@@@ CONTENT', '{{#puredisplay}}  {{ user }}', '{{/}}', ''].join('\n');
    const request = createRequestFromEntry('lorebook-basic', text);
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    const edits = provider.provide(createParams(request));

    expect(edits).toHaveLength(1);
    expect(applyTextEdits(request.text, edits)).toBe([
      '@@@ CONTENT',
      '{{#puredisplay}}  {{ user }}',
      '{{/puredisplay}}',
      '',
    ].join('\n'));
  });

  it('returns [] for malformed fragments so formatting stays on the no-op path', () => {
    const request = createFixtureRequest(getFixtureCorpusEntry('lorebook-unclosed-macro'));
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    expect(provider.provide(createParams(request))).toEqual([]);
  });

  it('returns [] for unsupported artifacts with no routed CBS fragment request', () => {
    const request = createFixtureRequest(getFixtureCorpusEntry('toggle-excluded'));
    const provider = new FormattingProvider({
      resolveRequest: () => null,
    });

    expect(provider.provide(createParams(request))).toEqual([]);
  });

  it('returns [] when the fragment is already in canonical format', () => {
    const request = createFixtureRequest(getFixtureCorpusEntry('lorebook-basic'));
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    expect(provider.provide(createParams(request))).toEqual([]);
  });

  for (const fixture of listFormattingContractFixtures()) {
    it(`preserves idempotency and host text invariants for ${fixture.coverage} fixture ${fixture.entry.id}`, () => {
      assertFormattingGoldenContract(createFixtureRequest(fixture.entry));
    });
  }
});
