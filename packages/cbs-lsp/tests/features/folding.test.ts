import { describe, expect, it } from 'vitest';
import type { FoldingRangeParams } from 'vscode-languageserver/node';

import { FragmentAnalysisService } from '../../src/core';
import { FoldingProvider } from '../../src/features/folding';
import { offsetToPosition } from '../../src/utils/position';
import { createFixtureRequest, getFixtureCorpusEntry } from '../fixtures/fixture-corpus';

function createParams(uri: string): FoldingRangeParams {
  return {
    textDocument: { uri },
  };
}

function buildRequest(filePath: string, text: string, version: number = 1) {
  return {
    uri: `file://${filePath}`,
    version,
    filePath,
    text,
  };
}

function lineOf(text: string, needle: string, occurrence: number = 0): number {
  let fromIndex = 0;
  let offset = -1;

  for (let index = 0; index <= occurrence; index += 1) {
    offset = text.indexOf(needle, fromIndex);
    if (offset === -1) {
      throw new Error(`Could not find ${JSON.stringify(needle)}`);
    }

    fromIndex = offset + needle.length;
  }

  return offsetToPosition(text, offset).line;
}

describe('FoldingProvider', () => {
  it('creates folding ranges only for supported block spans', () => {
    const service = new FragmentAnalysisService();
    const provider = new FoldingProvider(service);
    const text = [
      '---',
      'name: folding',
      '---',
      '@@@ CONTENT',
      '{{#when::ready}}',
      'when body',
      '{{/}}',
      '{{#each items as item}}',
      '{{slot::item}}',
      '{{/each}}',
      '{{#escape}}',
      '{{user}}',
      '{{/escape}}',
      '{{#puredisplay}}',
      '{{user}}',
      '{{/puredisplay}}',
      '{{#if true}}',
      'legacy body',
      '{{/if}}',
      '',
    ].join('\n');
    const request = buildRequest('/fixtures/folding-provider.risulorebook', text);

    const ranges = provider.provide(createParams(request.uri), request);

    expect(ranges).toHaveLength(4);
    expect(ranges.map((range) => range.startLine)).toEqual([
      lineOf(text, '{{#when::ready}}'),
      lineOf(text, '{{#each items as item}}'),
      lineOf(text, '{{#escape}}'),
      lineOf(text, '{{#puredisplay}}'),
    ]);
    expect(ranges.every((range) => range.endLine > range.startLine)).toBe(true);
    expect(ranges.some((range) => range.startLine === lineOf(text, '{{#if true}}'))).toBe(false);
  });

  it('omits unsupported, unclosed, and single-line block folds gracefully', () => {
    const service = new FragmentAnalysisService();
    const provider = new FoldingProvider(service);
    const malformed = getFixtureCorpusEntry('lorebook-unclosed-block');
    const singleLineRequest = buildRequest(
      '/fixtures/folding-single-line.risulorebook',
      ['---', 'name: single-line', '---', '@@@ CONTENT', '{{#when::ready}}one{{/}}', ''].join('\n'),
    );

    expect(provider.provide(createParams(malformed.uri), createFixtureRequest(malformed))).toEqual(
      [],
    );
    expect(provider.provide(createParams(singleLineRequest.uri), singleLineRequest)).toEqual([]);
  });
});
