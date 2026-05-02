import { describe, expect, it } from 'vitest';
import type { SemanticTokensParams, SemanticTokensRangeParams } from 'vscode-languageserver/node';

import { FragmentAnalysisService } from '../../src/core';
import {
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
  SemanticTokensProvider,
} from '../../src/features/symbols';
import { positionToOffset } from '../../src/utils/position';
import { createFixtureRequest, getFixtureCorpusEntry } from '../fixtures/fixture-corpus';

interface DecodedSemanticToken {
  line: number;
  startChar: number;
  length: number;
  type: string;
  modifiers: string[];
  text: string;
}

function createParams(uri: string): SemanticTokensParams {
  return {
    textDocument: { uri },
  };
}

function createRangeParams(
  uri: string,
  range: SemanticTokensRangeParams['range'],
): SemanticTokensRangeParams {
  return {
    textDocument: { uri },
    range,
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

function decodeSemanticTokens(data: number[], text: string): DecodedSemanticToken[] {
  const decoded: DecodedSemanticToken[] = [];
  let line = 0;
  let startChar = 0;

  for (let index = 0; index < data.length; index += 5) {
    const deltaLine = data[index];
    const deltaStart = data[index + 1];
    const length = data[index + 2];
    const typeIndex = data[index + 3];
    const modifierMask = data[index + 4];

    line += deltaLine;
    startChar = deltaLine === 0 ? startChar + deltaStart : deltaStart;

    const startOffset = positionToOffset(text, { line, character: startChar });
    const endOffset = positionToOffset(text, { line, character: startChar + length });
    const modifiers = SEMANTIC_TOKEN_MODIFIERS.filter(
      (_modifier, modifierIndex) => (modifierMask & (1 << modifierIndex)) !== 0,
    );

    decoded.push({
      line,
      startChar,
      length,
      type: SEMANTIC_TOKEN_TYPES[typeIndex] ?? 'unknown',
      modifiers,
      text: text.slice(startOffset, endOffset),
    });
  }

  return decoded;
}

function expectSorted(tokens: readonly DecodedSemanticToken[]): void {
  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1];
    const current = tokens[index];
    const isSorted =
      current.line > previous.line ||
      (current.line === previous.line && current.startChar >= previous.startChar);
    expect(isSorted).toBe(true);
  }
}

function createTokenSignature(token: DecodedSemanticToken): string {
  return [
    token.line,
    token.startChar,
    token.length,
    token.type,
    token.modifiers.join(','),
    token.text,
  ].join(':');
}

describe('SemanticTokensProvider', () => {
  it('emits sorted, fragment-bounded semantic tokens with provider-specific classifications', () => {
    const service = new FragmentAnalysisService();
    const provider = new SemanticTokensProvider(service);
    const text = [
      '---',
      'comment: semantic tokens',
      'type: plain',
      '---',
      '@@@ IN',
      '{{// note}}',
      '{{setvar::mood::42}}',
      '{{#when::score::is::10}}ok{{:else}}no{{/}}',
      '@@@ OUT',
      '{{#if true}}legacy{{/if}}',
      '{{#puredisplay}}',
      '{{setvar::hidden::1}}',
      '{{/puredisplay}}',
      '',
    ].join('\n');
    const request = buildRequest('/fixtures/semantic-provider.risuregex', text);
    const analysis = service.analyzeDocument(request);

    expect(analysis).not.toBeNull();

    const decoded = decodeSemanticTokens(
      provider.provide(createParams(request.uri), request).data,
      text,
    );

    expect(decoded.length).toBeGreaterThan(0);
    expectSorted(decoded);

    for (const token of decoded) {
      const start = positionToOffset(text, { line: token.line, character: token.startChar });
      const end = positionToOffset(text, {
        line: token.line,
        character: token.startChar + token.length,
      });

      expect(end).toBeGreaterThan(start);
      expect(
        analysis?.fragments.some((fragment) => start >= fragment.start && end <= fragment.end),
      ).toBe(true);
    }

    expect(decoded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '{{', type: 'punctuation' }),
        expect.objectContaining({ text: '// note', type: 'comment' }),
        expect.objectContaining({ text: 'setvar', type: 'function' }),
        expect.objectContaining({ text: 'mood', type: 'variable' }),
        expect.objectContaining({ text: '42', type: 'number' }),
        expect.objectContaining({ text: '#when', type: 'keyword' }),
        expect.objectContaining({ text: 'is', type: 'operator' }),
        expect.objectContaining({ text: ':else', type: 'keyword' }),
        expect.objectContaining({ text: '#if', type: 'deprecated', modifiers: ['deprecated'] }),
        expect.objectContaining({ text: 'setvar', type: 'string', line: 11 }),
      ]),
    );

    expect(decoded).not.toContainEqual(
      expect.objectContaining({ text: 'setvar', type: 'function', line: 11 }),
    );
  });

  it('degrades gracefully for malformed and empty fragment cases without invalid spans', () => {
    const service = new FragmentAnalysisService();
    const provider = new SemanticTokensProvider(service);
    const malformed = getFixtureCorpusEntry('lorebook-unclosed-block');
    const malformedDecoded = decodeSemanticTokens(
      provider.provide(createParams(malformed.uri), createFixtureRequest(malformed)).data,
      malformed.text,
    );
    const empty = getFixtureCorpusEntry('lorebook-empty-document');

    expect(malformedDecoded.length).toBeGreaterThan(0);
    expect(malformedDecoded.every((token) => token.length > 0)).toBe(true);
    expect(provider.provide(createParams(empty.uri), createFixtureRequest(empty)).data).toEqual([]);
  });

  it('classifies call::name and arg::N with local-function-aware token types', () => {
    const service = new FragmentAnalysisService();
    const provider = new SemanticTokensProvider(service);
    const text = [
      '---',
      'name: entry',
      '---',
      '@@@ CONTENT',
      '{{#func greet user target}}Hello {{arg::1}}{{/func}}',
      '{{call::greet::Noel::friend}}',
      '',
    ].join('\n');
    const request = buildRequest('/fixtures/semantic-local-function.risulorebook', text);
    const decoded = decodeSemanticTokens(provider.provide(createParams(request.uri), request).data, text);

    expect(decoded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'greet', type: 'function' }),
        expect.objectContaining({ text: '1', type: 'parameter' }),
      ]),
    );
  });

  it('keeps documented special-case classifications for variable builtins, block operators, and pure-mode bodies', () => {
    const service = new FragmentAnalysisService();
    const provider = new SemanticTokensProvider(service);
    const text = [
      '---',
      'name: entry',
      '---',
      '@@@ CONTENT',
      '{{#when::score::is::10}}ok{{/}}',
      '{{#each items as item}}{{slot::item}}{{setvar::hidden::1}}{{/each}}',
      '{{#func greet user}}{{arg::0}}{{call::greet::Noel}}{{/func}}',
      '',
    ].join('\n');
    const request = buildRequest('/fixtures/semantic-special-cases.risulorebook', text);
    const decoded = decodeSemanticTokens(provider.provide(createParams(request.uri), request).data, text);

    expect(decoded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'score', type: 'string' }),
        expect.objectContaining({ text: 'is', type: 'operator' }),
        expect.objectContaining({ text: '10', type: 'number' }),
        expect.objectContaining({ text: 'item', type: 'variable' }),
        expect.objectContaining({ text: 'setvar', type: 'string' }),
        expect.objectContaining({ text: 'hidden', type: 'string' }),
        expect.objectContaining({ text: '1', type: 'string' }),
        expect.objectContaining({ text: '0', type: 'parameter' }),
        expect.objectContaining({ text: 'greet', type: 'function' }),
      ]),
    );

    expect(decoded).not.toContainEqual(
      expect.objectContaining({ text: 'setvar', type: 'function' }),
    );
    expect(decoded).not.toContainEqual(
      expect.objectContaining({ text: 'hidden', type: 'variable' }),
    );
  });

  it('returns a visible-range subset that stays classification-identical to the full provider', () => {
    const service = new FragmentAnalysisService();
    const provider = new SemanticTokensProvider(service);
    const text = [
      '---',
      'comment: semantic tokens range',
      'type: plain',
      '---',
      '@@@ IN',
      '{{// note}}',
      '{{setvar::mood::42}}',
      '{{#when::score::is::10}}ok{{:else}}no{{/}}',
      '@@@ OUT',
      '{{#if true}}legacy{{/if}}',
      '',
    ].join('\n');
    const request = buildRequest('/fixtures/semantic-provider-range.risuregex', text);
    const fullDecoded = decodeSemanticTokens(provider.provide(createParams(request.uri), request).data, text);
    const rangeDecoded = decodeSemanticTokens(
      provider.provideRange(
        createRangeParams(request.uri, {
          start: { line: 6, character: 0 },
          end: { line: 8, character: 0 },
        }),
        request,
      ).data,
      text,
    );

    const fullSignatures = new Set(fullDecoded.map(createTokenSignature));

    expect(rangeDecoded.length).toBeGreaterThan(0);
    expect(rangeDecoded.every((token) => token.line >= 6 && token.line < 8)).toBe(true);
    expect(rangeDecoded.every((token) => fullSignatures.has(createTokenSignature(token)))).toBe(true);
    expect(rangeDecoded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'setvar', type: 'function', line: 6 }),
        expect.objectContaining({ text: 'mood', type: 'variable', line: 6 }),
        expect.objectContaining({ text: '42', type: 'number', line: 6 }),
        expect.objectContaining({ text: '#when', type: 'keyword', line: 7 }),
        expect.objectContaining({ text: 'is', type: 'operator', line: 7 }),
      ]),
    );
    expect(rangeDecoded).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '// note' }),
        expect.objectContaining({ text: '#if' }),
      ]),
    );
  });
});
