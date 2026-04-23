import {
  type SelectionRange,
  type SelectionRangeParams,
  type Position,
  type Range,
} from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import { FragmentAnalysisService } from '../../src/core';
import {
  SELECTION_RANGE_PROVIDER_AVAILABILITY,
  SelectionRangeProvider,
} from '../../src/features/selectionRange';
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
): SelectionRangeProvider {
  return new SelectionRangeProvider({
    analysisService: service,
    resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
  });
}

function createParams(
  request: ReturnType<typeof createFixtureRequest>,
  position: Position,
): SelectionRangeParams {
  return {
    textDocument: { uri: request.uri },
    positions: [position],
  };
}

function flattenSelectionRanges(selectionRange: SelectionRange): Range[] {
  const ranges: Range[] = [];
  let current: SelectionRange | undefined = selectionRange;
  while (current) {
    ranges.push(current.range);
    current = current.parent;
  }
  return ranges;
}

describe('SelectionRangeProvider', () => {
  it('exposes local-only availability honesty metadata', () => {
    const provider = new SelectionRangeProvider();

    expect(provider.availability).toEqual(SELECTION_RANGE_PROVIDER_AVAILABILITY);
    expect(provider.availability).toEqual({
      scope: 'local-only',
      source: 'server-capability:selectionRange',
      detail:
        'Selection ranges are active for routed CBS fragments, expand within the current fragment only, and follow the hierarchy: token span -> macro call -> block body -> block whole.',
    });
  });

  it('expands from macro name to macro whole', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace('{{user}}', '{{setvar::mood::happy}}');
    const request = { ...createFixtureRequest(entry), text };
    const result = createProvider(request).provide(
      createParams(request, positionAt(text, 'setvar', 1, 0)),
    );

    expect(result).toHaveLength(1);
    const chain = flattenSelectionRanges(result[0]);
    expect(chain).toHaveLength(2);
    expect(chain[0].start.line).toBe(chain[1].start.line);
    expect(chain[0].start.character).toBeGreaterThan(chain[1].start.character);
    expect(chain[0].end.character).toBeLessThan(chain[1].end.character);
  });

  it('expands from argument to macro whole', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace('{{user}}', '{{setvar::mood::happy}}');
    const request = { ...createFixtureRequest(entry), text };
    const result = createProvider(request).provide(
      createParams(request, positionAt(text, 'mood', 1, 0)),
    );

    expect(result).toHaveLength(1);
    const chain = flattenSelectionRanges(result[0]);
    expect(chain).toHaveLength(2);
    expect(chain[0].start.line).toBe(chain[1].start.line);
    expect(chain[0].start.character).toBeGreaterThan(chain[1].start.character);
    expect(chain[0].end.character).toBeLessThan(chain[1].end.character);
  });

  it('expands nested macro through parent block body to block whole', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{#when::true}}Hello {{user}}{{/when}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const result = createProvider(request).provide(
      createParams(request, positionAt(text, 'user', 1, 0)),
    );

    expect(result).toHaveLength(1);
    const chain = flattenSelectionRanges(result[0]);
    expect(chain).toHaveLength(4);
    // Innermost: 'user' macro name
    // Next: {{user}} macro whole
    // Next: Hello {{user}} block body
    // Outermost: {{#when::true}}Hello {{user}}{{/when}} block whole
    expect(chain[3].start.character).toBeLessThan(chain[2].start.character);
    expect(chain[3].end.character).toBeGreaterThan(chain[2].end.character);
  });

  it('keeps selection inside the current fragment in multi-fragment documents', () => {
    const text = [
      '---',
      'comment: rule',
      'type: plain',
      '---',
      '@@@ IN',
      '{{setvar::mood::in}}',
      '@@@ OUT',
      '{{#when::true}}{{setvar::mood::out}}{{/when}}',
      '',
    ].join('\n');
    const request = {
      uri: 'file:///fixtures/selection-range-fragments.risuregex',
      version: 1,
      filePath: '/fixtures/selection-range-fragments.risuregex',
      text,
    };

    const result = createProvider(request).provide(
      createParams(request, positionAt(text, 'mood', 1, 1)),
    );

    expect(result).toHaveLength(1);
    const chain = flattenSelectionRanges(result[0]);
    expect(chain.length).toBeGreaterThanOrEqual(2);
    // 모든 range가 OUT fragment 안에 있어야 함 (line 7)
    for (const range of chain) {
      expect(range.start.line).toBe(7);
    }
  });

  it.each([
    {
      label: 'malformed fragment recovery',
      request: {
        uri: 'file:///fixtures/selection-range-malformed.risulorebook',
        version: 1,
        filePath: '/fixtures/selection-range-malformed.risulorebook',
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
    const result = createProvider(request).provide(createParams(request, position(request.text)));

    expect(result).toEqual([]);
  });

  it('handles cursor on block header without adding body range', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace('{{user}}', '{{#when::true}}Hello{{/when}}');
    const request = { ...createFixtureRequest(entry), text };
    const result = createProvider(request).provide(
      createParams(request, positionAt(text, 'when', 1, 0)),
    );

    expect(result).toHaveLength(1);
    const chain = flattenSelectionRanges(result[0]);
    // Header range -> block whole (body range skipped because cursor is in header)
    expect(chain).toHaveLength(2);
  });
});
