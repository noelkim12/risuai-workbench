import type { BlockNode, MacroCallNode, Position } from 'risu-workbench-core';
import { TokenType } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import {
  FragmentAnalysisService,
  locateFragmentAtHostPosition,
  type FragmentCursorLookupResult,
} from '../src/core';
import { offsetToPosition } from '../src/utils/position';
import { createFixtureRequest, getFixtureCorpusEntry } from './fixtures/fixture-corpus';

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

function expectLookup(lookup: FragmentCursorLookupResult | null): FragmentCursorLookupResult {
  expect(lookup).not.toBeNull();
  return lookup!;
}

function expectMacroCall(nodeSpan: FragmentCursorLookupResult['nodeSpan'], name: string): void {
  expect(nodeSpan).not.toBeNull();
  expect(nodeSpan!.owner.type).toBe('MacroCall');
  expect((nodeSpan!.owner as MacroCallNode).name).toBe(name);
}

function expectBlock(
  nodeSpan: FragmentCursorLookupResult['nodeSpan'],
  kind: BlockNode['kind'],
): void {
  expect(nodeSpan).not.toBeNull();
  expect(nodeSpan!.owner.type).toBe('Block');
  expect((nodeSpan!.owner as BlockNode).kind).toBe(kind);
}

describe('fragment locator', () => {
  it('resolves lorebook macro names through the shared service seam', () => {
    const service = new FragmentAnalysisService();
    const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
    const request = createFixtureRequest(entry);
    const position = positionAt(entry.text, 'setvar', 2);
    const analysis = service.analyzeDocument(request);

    expect(analysis).not.toBeNull();

    const lookup = service.locatePosition(request, position);
    const directLookup = locateFragmentAtHostPosition(analysis!, entry.text, position);
    const resolved = expectLookup(lookup);

    expect(lookup).toEqual(directLookup);
    expect(resolved.fragmentAnalysis).toBe(analysis?.fragmentAnalyses[0]);
    expect(resolved.section).toBe('CONTENT');
    expect(resolved.fragment).toBe(analysis?.fragmentAnalyses[0]?.fragment);
    expect(resolved.fragmentLocalOffset).toBe(resolved.fragment.content.indexOf('setvar') + 2);
    expect(resolved.token).toMatchObject({
      category: 'macro-name',
      token: {
        type: TokenType.FunctionName,
        value: 'setvar',
      },
    });
    expect(resolved.node?.type).toBe('MacroCall');
    expect(resolved.nodeSpan?.category).toBe('macro-name');
    expectMacroCall(resolved.nodeSpan, 'setvar');
  });

  it('returns argument span metadata for prompt fragments', () => {
    const service = new FragmentAnalysisService();
    const entry = getFixtureCorpusEntry('prompt-basic');
    const request = createFixtureRequest(entry);
    const position = positionAt(entry.text, 'persona', 3);

    const resolved = expectLookup(service.locatePosition(request, position));

    expect(resolved.section).toBe('TEXT');
    expect(resolved.token).toMatchObject({
      category: 'argument',
      token: {
        type: TokenType.Argument,
        value: 'persona',
      },
    });
    expect(resolved.node?.type).toBe('PlainText');
    expect(resolved.nodeSpan?.category).toBe('argument');
    expect(resolved.nodeSpan?.argumentIndex).toBe(0);
    expect(
      resolved.fragment.content.slice(
        resolved.nodeSpan!.localStartOffset,
        resolved.nodeSpan!.localEndOffset,
      ),
    ).toBe('persona');
    expectMacroCall(resolved.nodeSpan, 'getvar');
  });

  it('classifies block header cursors in regex fragments', () => {
    const service = new FragmentAnalysisService();
    const entry = getFixtureCorpusEntry('regex-block-header');
    const request = createFixtureRequest(entry);
    const position = positionAt(entry.text, '#when', 2);

    const resolved = expectLookup(service.locatePosition(request, position));

    expect(resolved.section).toBe('IN');
    expect(resolved.token).toMatchObject({
      category: 'block-header',
      token: {
        type: TokenType.BlockStart,
        value: '#when',
      },
    });
    expect(resolved.node?.type).toBe('Block');
    expect(resolved.nodeSpan?.category).toBe('block-header');
    expectBlock(resolved.nodeSpan, 'when');
  });

  it('classifies :else cursors against the owning block', () => {
    const service = new FragmentAnalysisService();
    const entry = getFixtureCorpusEntry('regex-block-else');
    const request = createFixtureRequest(entry);
    const position = positionAt(entry.text, ':else', 2);

    const resolved = expectLookup(service.locatePosition(request, position));

    expect(resolved.section).toBe('OUT');
    expect(resolved.token).toMatchObject({
      category: 'else',
      token: {
        type: TokenType.ElseKeyword,
        value: ':else',
      },
    });
    expect(resolved.node?.type).toBe('Block');
    expect(resolved.nodeSpan?.category).toBe('block-else');
    expect(
      resolved.fragment.content.slice(
        resolved.nodeSpan!.localStartOffset,
        resolved.nodeSpan!.localEndOffset,
      ),
    ).toBe(':else');
    expectBlock(resolved.nodeSpan, 'when');
  });

  it.each([
    {
      label: 'lorebook frontmatter',
      entryId: 'lorebook-basic',
      position: (text: string) => positionAt(text, 'name: entry', 2),
    },
    {
      label: 'regex metadata',
      entryId: 'regex-basic',
      position: (text: string) => positionAt(text, 'comment: rule', 2),
    },
    {
      label: 'non-CBS toggle artifact',
      entryId: 'toggle-excluded',
      position: (text: string) => positionAt(text, 'enabled', 1),
    },
  ])('returns null outside CBS fragments for $label', ({ entryId, position }) => {
    const service = new FragmentAnalysisService();
    const entry = getFixtureCorpusEntry(entryId);

    expect(service.locatePosition(createFixtureRequest(entry), position(entry.text))).toBeNull();
  });
});
