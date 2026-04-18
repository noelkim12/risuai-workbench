import type { Hover, Position, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { CBSBuiltinRegistry } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import { FragmentAnalysisService } from '../../src/core';
import { HoverProvider } from '../../src/features/hover';
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
  service: FragmentAnalysisService,
  request: ReturnType<typeof createFixtureRequest>,
): HoverProvider {
  return new HoverProvider(new CBSBuiltinRegistry(), {
    analysisService: service,
    resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
  });
}

function createParams(
  request: ReturnType<typeof createFixtureRequest>,
  position: Position,
): TextDocumentPositionParams {
  return {
    textDocument: { uri: request.uri },
    position,
  };
}

function expectMarkdownHover(hover: Hover | null): string {
  expect(hover).not.toBeNull();

  const contents = hover!.contents as { kind?: string; value?: string };
  expect(contents.kind).toBe('markdown');
  expect(typeof contents.value).toBe('string');

  return contents.value!;
}

describe('HoverProvider', () => {
  it('returns formatted builtin docs with deprecation metadata for block keywords', () => {
    const entry = getFixtureCorpusEntry('regex-deprecated-block');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '#if', 2)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**#if**');
    expect(markdown).toContain('Conditional statement for CBS.');
    expect(markdown).toContain('**Deprecated:**');
    expect(markdown).toContain('Use `#when` instead.');
  });

  it('shows deterministic variable metadata and shared symbol details when available', () => {
    const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
    const request = createFixtureRequest(entry);
    const service = new FragmentAnalysisService();
    const position = positionAt(entry.text, 'mood', 1);
    const lookup = service.locatePosition(request, position);

    expect(lookup).not.toBeNull();
    expect(lookup!.nodeSpan?.category).toBe('argument');

    const symbolTable = lookup!.fragmentAnalysis.providerLookup.getSymbolTable();
    symbolTable.addDefinition('mood', 'chat', lookup!.nodeSpan!.localRange);
    symbolTable.addReference('mood', lookup!.nodeSpan!.localRange, 'chat');

    const provider = createProvider(service, request);
    const hover = provider.provide(createParams(request, position));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Variable: mood**');
    expect(markdown).toContain('Kind: persistent chat variable');
    expect(markdown).toContain('Access: writes via `setvar`');
    expect(markdown).toContain('Local definition:');
    expect(markdown).toContain('Local references: 1');
  });

  it('resolves variable symbol using namespace-aware lookup (chat vs temp)', () => {
    const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
    const request = createFixtureRequest(entry);
    const service = new FragmentAnalysisService();
    const position = positionAt(entry.text, 'mood', 1);
    const lookup = service.locatePosition(request, position);

    expect(lookup).not.toBeNull();

    const symbolTable = lookup!.fragmentAnalysis.providerLookup.getSymbolTable();
    // Add both chat and temp variables with the same name
    const chatRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } };
    const tempRange = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };
    symbolTable.addDefinition('mood', 'chat', chatRange);
    symbolTable.addDefinition('mood', 'temp', tempRange);
    symbolTable.addReference('mood', chatRange, 'chat');
    symbolTable.addReference('mood', tempRange, 'temp');

    const provider = createProvider(service, request);
    const hover = provider.provide(createParams(request, position));
    const markdown = expectMarkdownHover(hover);

    // setvar uses 'chat' namespace, so it should find the chat symbol
    expect(markdown).toContain('Kind: persistent chat variable');
    expect(markdown).toContain('Local references: 1');
  });

  it('resolves temp variable symbol separately from chat variable', () => {
    const entry = getFixtureCorpusEntry('lorebook-settempvar-macro');
    const request = createFixtureRequest(entry);
    const service = new FragmentAnalysisService();
    const position = positionAt(entry.text, 'counter', 1);
    const lookup = service.locatePosition(request, position);

    expect(lookup).not.toBeNull();

    const symbolTable = lookup!.fragmentAnalysis.providerLookup.getSymbolTable();
    // Add both chat and temp variables with the same name
    const chatRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } };
    const tempRange = { start: { line: 1, character: 0 }, end: { line: 1, character: 7 } };
    symbolTable.addDefinition('counter', 'chat', chatRange);
    symbolTable.addDefinition('counter', 'temp', tempRange);
    symbolTable.addReference('counter', chatRange, 'chat');
    symbolTable.addReference('counter', tempRange, 'temp');

    const provider = createProvider(service, request);
    const hover = provider.provide(createParams(request, position));
    const markdown = expectMarkdownHover(hover);

    // settempvar uses 'temp' namespace, so it should find the temp symbol
    expect(markdown).toContain('Kind: temporary variable');
    expect(markdown).toContain('Access: writes via `settempvar`');
  });

  it('describes #when operators through the shared locator result', () => {
    const entry = getFixtureCorpusEntry('regex-block-header');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '::is::', 3)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**#when operator: is**');
    expect(markdown).toContain(
      'Compares the left-hand condition with the right-hand value for equality.',
    );
    expect(markdown).toContain('{{#when::left::is::right}}...{{/when}}');
  });

  it('returns registry-backed docs for :else', () => {
    const entry = getFixtureCorpusEntry('regex-block-else');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, ':else', 2)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**:else**');
    expect(markdown).toContain('Else statement for CBS.');
    expect(markdown).toContain('{{#when condition}}...{{:else}}...{{/when}}');
  });

  it.each([
    {
      label: 'lorebook frontmatter',
      entryId: 'lorebook-basic',
      position: (text: string) => positionAt(text, 'name: entry', 2),
    },
    {
      label: 'non-CBS toggle artifact',
      entryId: 'toggle-excluded',
      position: (text: string) => positionAt(text, 'enabled', 1),
    },
  ])('returns null outside CBS fragments for $label', ({ entryId, position }) => {
    const entry = getFixtureCorpusEntry(entryId);
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);

    expect(provider.provide(createParams(request, position(entry.text)))).toBeNull();
  });
});
