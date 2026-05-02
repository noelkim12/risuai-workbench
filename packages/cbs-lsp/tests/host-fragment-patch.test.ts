import { describe, expect, it } from 'vitest';

import {
  createHostFragmentKey,
  createSyntheticDocumentVersion,
  FragmentAnalysisService,
  remapFragmentLocalPatchesToHost,
  validateHostFragmentPatchEdits,
} from '../src/core';
import { offsetToPosition } from '../src/utils/position';
import { createFixtureRequest, getFixtureCorpusEntry } from './fixtures/fixture-corpus';
import {
  applyTextEdits,
  assertHostTextOutsideFragmentsUnchanged,
} from './helpers/formatting-contract';

/**
 * createRegexRequest 함수.
 * multi-fragment regex 문서를 patch safety 테스트용 request로 생성함.
 *
 * @param text - 사용할 regex host 문서 전문
 * @returns regex artifact를 가리키는 분석 요청
 */
function createRegexRequest(text: string) {
  const entry = getFixtureCorpusEntry('regex-basic');
  return {
    uri: entry.uri,
    version: createSyntheticDocumentVersion(text),
    filePath: entry.filePath,
    text,
  };
}

/**
 * createHostRangeAtNeedle 함수.
 * host 문서 needle 위치를 range로 변환함.
 *
 * @param text - host 문서 전문
 * @param needle - 찾을 문자열
 * @param occurrence - 같은 needle의 occurrence index
 * @returns needle 전체를 감싸는 host range
 */
function createHostRangeAtNeedle(text: string, needle: string, occurrence: number = 0) {
  let searchFrom = 0;
  let offset = -1;

  for (let index = 0; index <= occurrence; index += 1) {
    offset = text.indexOf(needle, searchFrom);
    if (offset === -1) {
      break;
    }

    searchFrom = offset + needle.length;
  }

  expect(offset).toBeGreaterThanOrEqual(0);

  return {
    start: offsetToPosition(text, offset),
    end: offsetToPosition(text, offset + needle.length),
  };
}

describe('host-fragment patch safety contract', () => {
  it('remaps fragment-local edits to host ranges for safe local patches', () => {
    const entry = getFixtureCorpusEntry('lorebook-signature-happy');
    const request = createFixtureRequest(entry);
    const service = new FragmentAnalysisService();
    const analysis = service.analyzeDocument(request);

    expect(analysis).not.toBeNull();

    const fragmentAnalysis = analysis!.fragmentAnalyses[0]!;
    const localOffset = fragmentAnalysis.fragment.content.indexOf('mood');
    const localRange = {
      start: offsetToPosition(fragmentAnalysis.fragment.content, localOffset),
      end: offsetToPosition(fragmentAnalysis.fragment.content, localOffset + 'mood'.length),
    };

    const result = remapFragmentLocalPatchesToHost(request, fragmentAnalysis, [
      { range: localRange, newText: 'emotion' },
    ]);

    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.edits).toEqual([
      expect.objectContaining({
        uri: request.uri,
        newText: 'emotion',
        range: createHostRangeAtNeedle(request.text, 'mood'),
      }),
    ]);

    const patchedText = applyTextEdits(request.text, result.edits);
    const patchedRequest = {
      ...request,
      version: createSyntheticDocumentVersion(patchedText),
      text: patchedText,
    };

    assertHostTextOutsideFragmentsUnchanged(request, patchedRequest, service);
  });

  it('rejects malformed fragments with a no-op patch policy', () => {
    const entry = getFixtureCorpusEntry('lorebook-unclosed-macro');
    const request = createFixtureRequest(entry);
    const service = new FragmentAnalysisService();
    const analysis = service.analyzeDocument(request);

    expect(analysis).not.toBeNull();

    const fragmentAnalysis = analysis!.fragmentAnalyses[0]!;
    const result = remapFragmentLocalPatchesToHost(request, fragmentAnalysis, [
      {
        range: {
          start: { line: 0, character: 0 },
          end: offsetToPosition(fragmentAnalysis.fragment.content, fragmentAnalysis.fragment.content.length),
        },
        newText: fragmentAnalysis.fragment.content,
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      expect.objectContaining({
        code: 'malformed-fragment',
        uri: request.uri,
      }),
    ]);
  });

  it('accepts non-overlapping host patches in separate fragments of the same document', () => {
    const text = [
      '---',
      'name: regex',
      '---',
      '@@@ IN',
      '{{setvar::shared::one}}',
      '@@@ OUT',
      '{{getvar::shared}}',
      '',
    ].join('\n');
    const request = createRegexRequest(text);
    const service = new FragmentAnalysisService();

    const result = validateHostFragmentPatchEdits(
      service,
      [
        { uri: request.uri, range: createHostRangeAtNeedle(text, 'shared', 0), newText: 'renamed' },
        { uri: request.uri, range: createHostRangeAtNeedle(text, 'shared', 1), newText: 'renamed' },
      ],
      {
        resolveRequestForUri: (uri) => (uri === request.uri ? request : null),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.edits.map((edit) => edit.fragmentIndex)).toEqual([0, 1]);
  });

  it('rejects host patches that target a disallowed sibling fragment', () => {
    const text = [
      '---',
      'name: regex',
      '---',
      '@@@ IN',
      '{{setvar::shared::one}}',
      '@@@ OUT',
      '{{getvar::shared}}',
      '',
    ].join('\n');
    const request = createRegexRequest(text);
    const service = new FragmentAnalysisService();
    const analysis = service.analyzeDocument(request);

    expect(analysis).not.toBeNull();

    const allowedKey = createHostFragmentKey(analysis!.fragmentAnalyses[0]!);
    const result = validateHostFragmentPatchEdits(
      service,
      [{ uri: request.uri, range: createHostRangeAtNeedle(text, 'shared', 1), newText: 'renamed' }],
      {
        resolveRequestForUri: (uri) => (uri === request.uri ? request : null),
        allowedFragmentKeysByUri: new Map([[request.uri, new Set([allowedKey])]]),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      expect.objectContaining({
        code: 'disallowed-fragment',
        uri: request.uri,
        fragmentIndex: 1,
      }),
    ]);
  });

  it('rejects host patches outside any CBS fragment', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const request = createFixtureRequest(entry);
    const service = new FragmentAnalysisService();

    const result = validateHostFragmentPatchEdits(
      service,
      [
        {
          uri: request.uri,
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 4 },
          },
          newText: 'entry',
        },
      ],
      {
        resolveRequestForUri: (uri) => (uri === request.uri ? request : null),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      expect.objectContaining({
        code: 'outside-fragment',
        uri: request.uri,
      }),
    ]);
  });
});
