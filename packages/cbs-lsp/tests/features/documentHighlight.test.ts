import {
  DocumentHighlightKind,
  type DocumentHighlight,
  type DocumentHighlightParams,
  type Position,
} from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import { FragmentAnalysisService } from '../../src/core';
import {
  DOCUMENT_HIGHLIGHT_PROVIDER_AVAILABILITY,
  DocumentHighlightProvider,
} from '../../src/features/symbols';
import { offsetToPosition } from '../../src/utils/position';
import { createFixtureRequest, getFixtureCorpusEntry } from '../fixtures/fixture-corpus';

function locateNthOffset(text: string, needle: string, occurrence: number = 0): number {
  let fromIndex = 0;
  let foundIndex = -1;

  for (let index = 0; index <= occurrence; index += 1) {
    foundIndex = text.indexOf(needle, fromIndex);
    if (foundIndex === -1) {
      break;
    }

    fromIndex = foundIndex + needle.length;
  }

  expect(foundIndex).toBeGreaterThanOrEqual(0);
  return foundIndex;
}

function positionAt(
  text: string,
  needle: string,
  characterOffset: number = 0,
  occurrence: number = 0,
): Position {
  return offsetToPosition(text, locateNthOffset(text, needle, occurrence) + characterOffset);
}

function createProvider(
  request: ReturnType<typeof createFixtureRequest>,
  service: FragmentAnalysisService = new FragmentAnalysisService(),
): DocumentHighlightProvider {
  return new DocumentHighlightProvider({
    analysisService: service,
    resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
  });
}

function createParams(
  request: ReturnType<typeof createFixtureRequest>,
  position: Position,
): DocumentHighlightParams {
  return {
    textDocument: { uri: request.uri },
    position,
  };
}

function countHighlightsByKind(highlights: readonly DocumentHighlight[], kind: DocumentHighlightKind): number {
  return highlights.filter((highlight) => highlight.kind === kind).length;
}

describe('DocumentHighlightProvider', () => {
  it('exposes local-only availability honesty metadata', () => {
    const provider = new DocumentHighlightProvider();

    expect(provider.availability).toEqual(DOCUMENT_HIGHLIGHT_PROVIDER_AVAILABILITY);
    expect(provider.availability).toEqual({
      scope: 'local-only',
      source: 'server-capability:documentHighlight',
      detail:
        'Document highlights are active for routed CBS fragments, classify fragment-local read/write occurrences for the current symbol, and never widen into workspace-wide references.',
    });
  });

  it('highlights local getvar/setvar occurrences as write/read within the current fragment', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{setvar::mood::happy}}{{getvar::mood}}{{getvar::mood}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const highlights = createProvider(request).provide(createParams(request, positionAt(text, 'mood', 1, 1)));

    expect(highlights).toHaveLength(3);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Write)).toBe(1);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Read)).toBe(2);
    expect(highlights.every((highlight) => highlight.range.start.line >= 4)).toBe(true);
  });

  it('highlights local #func declaration and call::name references together', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{#func greet user}}Hello{{/func}}{{call::greet::Noel}}{{call::greet::Risu}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const highlights = createProvider(request).provide(createParams(request, positionAt(text, 'greet', 1, 0)));

    expect(highlights).toHaveLength(3);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Write)).toBe(1);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Read)).toBe(2);
  });

  it('highlights arg::N references against the matching #func parameter', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{#func outer user}}{{arg::1}}{{#func inner value}}{{arg::1}}{{/func}}{{arg::1}}{{/func}}{{call::outer::Noel}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const argOffset = locateNthOffset(text, '{{arg::1}}', 0) + '{{arg::'.length;
    const highlights = createProvider(request).provide(
      createParams(request, offsetToPosition(text, argOffset)),
    );

    expect(highlights).toHaveLength(4);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Write)).toBe(1);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Read)).toBe(3);
  });

  it('does not highlight arg::0 as the first declared #func parameter', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{#func outer user}}{{arg::0}}{{#func inner value}}{{arg::0}}{{/func}}{{arg::0}}{{/func}}{{call::outer::Noel}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const argOffset = locateNthOffset(text, '{{arg::0}}', 0) + '{{arg::'.length;
    const highlights = createProvider(request).provide(
      createParams(request, offsetToPosition(text, argOffset)),
    );

    expect(highlights).toHaveLength(3);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Write)).toBe(0);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Read)).toBe(3);
  });

  it('highlights #each slot::alias declaration and reads together', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{#each items as item}}{{slot::item}}{{slot::item}}{{/each}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const slotOffset = locateNthOffset(text, '{{slot::item}}', 0) + '{{slot::'.length;
    const highlights = createProvider(request).provide(
      createParams(request, offsetToPosition(text, slotOffset)),
    );

    expect(highlights).toHaveLength(3);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Write)).toBe(1);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Read)).toBe(2);
  });

  it('highlights shorthand #each iterator source with local chat variable writes', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{setvar::var1::ready}}{{#each var1 key}}{{slot::key}}{{/each}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const highlights = createProvider(request).provide(createParams(request, positionAt(text, 'var1 key', 1)));

    expect(highlights).toHaveLength(2);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Write)).toBe(1);
    expect(countHighlightsByKind(highlights, DocumentHighlightKind.Read)).toBe(1);
  });

  it('keeps same-name symbols in other fragments out of the highlight result', () => {
    const text = [
      '---',
      'name: regex',
      '---',
      '@@@ IN',
      '{{setvar::mood::in}}{{getvar::mood}}',
      '@@@ OUT',
      '{{setvar::mood::out}}{{getvar::mood}}',
      '',
    ].join('\n');
    const request = {
      uri: 'file:///fixtures/document-highlight-fragments.risuregex',
      version: 1,
      filePath: '/fixtures/document-highlight-fragments.risuregex',
      text,
    };

    const highlights = createProvider(request).provide(createParams(request, positionAt(text, 'mood', 1, 3)));

    expect(highlights).toHaveLength(2);
    expect(highlights.map((highlight) => highlight.range.start.line)).toEqual([6, 6]);
  });

  it.each([
    {
      label: 'malformed fragment recovery',
      request: {
        uri: 'file:///fixtures/document-highlight-malformed.risulorebook',
        version: 1,
        filePath: '/fixtures/document-highlight-malformed.risulorebook',
        text: ['---', 'name: malformed', '---', '@@@ CONTENT', '{{#func greet user}}Hello {{arg::0}', ''].join('\n'),
      },
      position: (text: string) => positionAt(text, '0'),
    },
    {
      label: 'non-CBS toggle artifact',
      request: createFixtureRequest(getFixtureCorpusEntry('toggle-excluded')),
      position: (text: string) => positionAt(text, 'enabled', 1),
    },
  ])('returns empty for $label', ({ request, position }) => {
    const highlights = createProvider(request).provide(createParams(request, position(request.text)));

    expect(highlights).toEqual([]);
  });
});
