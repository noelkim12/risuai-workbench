import type { DocumentFormattingParams, TextEdit } from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import { createSyntheticDocumentVersion, FragmentAnalysisService } from '../../src/core';
import {
  FORMATTING_PROVIDER_AVAILABILITY,
  FormattingProvider,
} from '../../src/features/formatting';
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
