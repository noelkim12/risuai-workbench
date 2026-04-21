import { describe, expect, it } from 'vitest';
import type { DocumentSymbolParams } from 'vscode-languageserver/node';
import { SymbolKind } from 'vscode-languageserver/node';

import { FragmentAnalysisService } from '../../src/core';
import { DocumentSymbolProvider } from '../../src/features/documentSymbol';
import { offsetToPosition } from '../../src/utils/position';

function createParams(uri: string): DocumentSymbolParams {
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

describe('DocumentSymbolProvider', () => {
  it('exposes supported top-level blocks with stable host ranges in single-fragment documents', () => {
    const service = new FragmentAnalysisService();
    const provider = new DocumentSymbolProvider(service);
    const text = [
      '---',
      'name: outline',
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
      '{{#func greet user}}',
      '{{arg::0}}',
      '{{/func}}',
      '',
    ].join('\n');
    const request = buildRequest('/fixtures/document-symbol.risulorebook', text);

    const symbols = provider.provide(createParams(request.uri), request);

    expect(symbols).toHaveLength(5);
    expect(symbols.map((symbol) => symbol.name)).toEqual([
      '#when::ready',
      '#each items as item',
      '#escape',
      '#puredisplay',
      '#func greet',
    ]);
    expect(symbols.map((symbol) => symbol.kind)).toEqual([
      SymbolKind.Object,
      SymbolKind.Array,
      SymbolKind.String,
      SymbolKind.String,
      SymbolKind.Function,
    ]);
    expect(symbols.map((symbol) => symbol.selectionRange.start.line)).toEqual([
      lineOf(text, '{{#when::ready}}'),
      lineOf(text, '{{#each items as item}}'),
      lineOf(text, '{{#escape}}'),
      lineOf(text, '{{#puredisplay}}'),
      lineOf(text, '{{#func greet user}}'),
    ]);
    expect(symbols.map((symbol) => symbol.range.end.line)).toEqual([
      lineOf(text, '{{/}}'),
      lineOf(text, '{{/each}}'),
      lineOf(text, '{{/escape}}'),
      lineOf(text, '{{/puredisplay}}'),
      lineOf(text, '{{/func}}'),
    ]);
  });

  it('creates fragment containers for multi-fragment documents and keeps children within section boundaries', () => {
    const service = new FragmentAnalysisService();
    const provider = new DocumentSymbolProvider(service);
    const text = [
      '---',
      'comment: outline',
      'type: plain',
      '---',
      '@@@ IN',
      '{{#when::ready}}',
      'in body',
      '{{/}}',
      '@@@ OUT',
      '{{#each items as item}}',
      '{{slot::item}}',
      '{{/each}}',
      '',
    ].join('\n');
    const request = buildRequest('/fixtures/document-symbol-multi.risuregex', text);

    const symbols = provider.provide(createParams(request.uri), request);

    expect(symbols).toHaveLength(2);
    expect(symbols.map((symbol) => symbol.name)).toEqual(['IN', 'OUT']);
    expect(symbols.map((symbol) => symbol.kind)).toEqual([
      SymbolKind.Namespace,
      SymbolKind.Namespace,
    ]);
    expect(symbols[0]?.children?.map((symbol) => symbol.name)).toEqual(['#when::ready']);
    expect(symbols[1]?.children?.map((symbol) => symbol.name)).toEqual(['#each items as item']);
    expect(symbols[0]?.range.end.line).toBeLessThan(lineOf(text, '@@@ OUT'));
    expect(symbols[1]?.selectionRange.start.line).toBe(lineOf(text, '{{#each items as item}}'));
  });
});
