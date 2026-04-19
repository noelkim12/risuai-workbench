import type { Hover, Position, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { CBSBuiltinRegistry } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import { type AgentMetadataEnvelope, FragmentAnalysisService } from '../../src/core';
import { type AgentFriendlyHover, HoverProvider } from '../../src/features/hover';
import { offsetToPosition } from '../../src/utils/position';
import {
  createFixtureRequest,
  getFixtureCorpusEntry,
  snapshotHoverResult,
} from '../fixtures/fixture-corpus';

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

function extractHoverCategory(hover: Hover | null) {
  return ((hover as AgentFriendlyHover | null)?.data as AgentMetadataEnvelope | undefined)?.cbs.category;
}

function extractHoverExplanation(hover: Hover | null) {
  return ((hover as AgentFriendlyHover | null)?.data as AgentMetadataEnvelope | undefined)?.cbs.explanation;
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
    expect(extractHoverCategory(hover)).toEqual({
      category: 'block-keyword',
      kind: 'callable-builtin',
    });
    expect(extractHoverExplanation(hover)).toEqual({
      reason: 'registry-lookup',
      source: 'builtin-registry',
      detail: 'Hover resolved #if from the builtin registry as a callable CBS builtin.',
    });
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
    expect(extractHoverCategory(hover)).toEqual({
      category: 'variable',
      kind: 'chat-variable',
    });
    expect(extractHoverExplanation(hover)).toEqual({
      reason: 'scope-analysis',
      source: 'variable-symbol-table',
      detail:
        'Hover resolved this variable through analyzed symbol-table entries for the current macro argument.',
    });
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
    expect(extractHoverCategory(hover)).toEqual({
      category: 'contextual-token',
      kind: 'when-operator',
    });
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
    expect(extractHoverCategory(hover)).toEqual({
      category: 'block-keyword',
      kind: 'else-keyword',
    });
  });

  it('includes the docOnly runtime note for documentation-only syntax entries', () => {
    const entry = getFixtureCorpusEntry('regex-block-header');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '#when', 2)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**#when**');
    expect(markdown).toContain('**Documentation-only syntax entry:**');
    expect(markdown).toContain('not a general runtime callback builtin');
    expect(extractHoverCategory(hover)).toEqual({
      category: 'block-keyword',
      kind: 'documentation-only-builtin',
    });
  });

  it('builds a stable normalized snapshot view for hover payloads', () => {
    const entry = getFixtureCorpusEntry('regex-block-header');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '#when', 2)));

    expect(snapshotHoverResult(hover)).toEqual({
      contents: {
        kind: 'markdown',
        value: expect.stringContaining('**Documentation-only syntax entry:**'),
      },
      data: {
        cbs: {
          category: {
            category: 'block-keyword',
            kind: 'documentation-only-builtin',
          },
          explanation: {
            reason: 'registry-lookup',
            source: 'builtin-registry',
            detail: 'Hover resolved #when from the builtin registry as a documentation-only CBS syntax entry.',
          },
        },
      },
      range: {
        start: { line: 5, character: 2 },
        end: { line: 5, character: 7 },
      },
    });
  });

  it('keeps documentation-only and runtime builtin hover wording distinct across representative targets', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const injectedText = [
      '{{#when::ready}}ok{{/when}}',
      '{{getvar::mood}}',
      '{{setvar::mood::happy}}',
    ].join(' ');
    const text = entry.text.replace('{{user}}', injectedText);
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(new FragmentAnalysisService(), request);

    const whenMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(text, '#when', 2))),
    );

    expect(whenMarkdown).toContain('**#when**');
    expect(whenMarkdown).toContain('**Documentation-only syntax entry:**');
    expect(whenMarkdown).toContain('not a general runtime callback builtin');

    for (const label of ['getvar', 'setvar']) {
      const markdown = expectMarkdownHover(
        provider.provide(createParams(request, positionAt(text, label, 1))),
      );

      expect(markdown).toContain(`**${label}**`);
      expect(markdown).not.toContain('**Documentation-only syntax entry:**');
      expect(markdown).not.toContain('not a general runtime callback builtin');
    }
  });

  it('distinguishes slot builtin hover from slot::item loop alias reference hover', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{slot::orphan}}{{#each items as item}}{{slot::item}}{{/each}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const builtinSlotOffset = locateNthOffset(modifiedText, '{{slot::orphan}}');
    const referenceSlotOffset = locateNthOffset(modifiedText, '{{slot::item}}');

    const builtinMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, offsetToPosition(modifiedText, builtinSlotOffset + 3))),
    );
    const referenceMarkdown = expectMarkdownHover(
      provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, referenceSlotOffset + '{{slot::'.length + 1),
        ),
      ),
    );

    expect(builtinMarkdown).toContain('**slot**');
    expect(builtinMarkdown).toContain('**Documentation-only syntax entry:**');

    expect(referenceMarkdown).toContain('**Loop alias reference: item**');
    expect(referenceMarkdown).toContain('points to the currently visible `#each` loop alias');
    expect(referenceMarkdown).toContain('Bound by: `#each items as item`');
    expect(referenceMarkdown).toContain('Scope: current `#each` block');
    expect(referenceMarkdown).toContain('Local definition:');
    expect(referenceMarkdown).not.toContain('**Documentation-only syntax entry:**');
  });

  it('uses the innermost visible #each binding for shadowed slot::item hover', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#each items as item}}{{#each others as item}}{{slot::item}}{{/each}}{{slot::item}}{{/each}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const innerSlotOffset = locateNthOffset(modifiedText, '{{slot::item}}', 0);
    const outerSlotOffset = locateNthOffset(modifiedText, '{{slot::item}}', 1);

    const innerReferenceMarkdown = expectMarkdownHover(
      provider.provide(
        createParams(request, offsetToPosition(modifiedText, innerSlotOffset + '{{slot::'.length + 1)),
      ),
    );
    const outerReferenceMarkdown = expectMarkdownHover(
      provider.provide(
        createParams(request, offsetToPosition(modifiedText, outerSlotOffset + '{{slot::'.length + 1)),
      ),
    );

    expect(innerReferenceMarkdown).toContain('Bound by: `#each others as item`');
    expect(innerReferenceMarkdown).toContain('Scope: current `#each` block');
    expect(outerReferenceMarkdown).toContain('Bound by: `#each items as item`');
    expect(outerReferenceMarkdown).toContain('Scope: current `#each` block');
  });

  it('describes calc variable references inside the inline {{? ...}} expression form', () => {
    const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '$score', 2)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Calc variable: $score**');
    expect(markdown).toContain('This is not regular CBS argument syntax.');
    expect(markdown).toContain('expression argument of `{{calc::...}}`');
    expect(markdown).toContain('Kind: persistent chat variable');
    expect(markdown).toContain('coerces non-numeric values to');
  });

  it('describes the shared calc sublanguage inside the {{calc::...}} expression argument', () => {
    const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '@bonus', 2, 1)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Calc variable: @bonus**');
    expect(markdown).toContain('This is not regular CBS argument syntax.');
    expect(markdown).toContain('`{{? ...}}` inline form');
    expect(markdown).toContain('Kind: global variable');
    expect(markdown).toContain('`@name` reads a global variable');
  });

  it('describes inline and calc macro operators with the same CBS expression sublanguage wording', () => {
    const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const inlineMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(entry.text, '+', 0, 0))),
    );
    const macroMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(entry.text, '+', 0, 1))),
    );

    expect(inlineMarkdown).toBe(macroMarkdown);
    expect(inlineMarkdown).toContain('**CBS expression sublanguage**');
    expect(inlineMarkdown).toContain('This is not regular CBS argument syntax.');
    expect(inlineMarkdown).toContain('both use the same `CBS expression sublanguage`');
  });

  it('describes local #func declarations from symbol-based hover', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#func greet user}}Hello{{/func}}{{call::greet::Noel}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(modifiedText, 'greet', 2)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Local function declaration: greet**');
    expect(markdown).toContain('declares a fragment-local reusable macro body');
    expect(markdown).toContain('Local definition:');
    expect(markdown).toContain('Parameters: `user`');
    expect(markdown).toContain('Parameter slots: `arg::0` → `user`');
    expect(markdown).toContain('Parameter definitions: `user` (line');
    expect(markdown).toContain('Local calls: 1');
  });

  it('describes call::name as a local function reference', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#func greet user}}Hello{{/func}}{{call::greet::Noel}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(modifiedText, 'greet', 2, 1)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Local function reference: greet**');
    expect(markdown).toContain('references a fragment-local `#func` declaration');
    expect(markdown).not.toContain('declares a fragment-local reusable macro body');
    expect(markdown).toContain('Parameters: `user`');
    expect(markdown).toContain('Local definition:');
  });

  it('describes arg::N as a numbered local argument reference', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#func greet user target}}Hello {{arg::1}}{{/func}}{{call::greet::Noel::friend}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const service = new FragmentAnalysisService();
    const provider = createProvider(service, request);
    const position = positionAt(modifiedText, '1');
    const hover = provider.provide(createParams(request, position));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Numbered argument reference: arg::1**');
    expect(markdown).toContain('references the 2nd call argument from the active local `#func` / `{{call::...}}` context');
    expect(markdown).toContain('Local function: `greet`');
    expect(markdown).toContain('Local #func declaration:');
    expect(markdown).toContain('Parameter name: `target`');
    expect(markdown).toContain('Parameter definition:');
  });

  it('suppresses builtin hover inside puredisplay bodies', () => {
    const text = [
      '---',
      'name: pure-hover',
      '---',
      '@@@ CONTENT',
      '{{#puredisplay}}',
      '{{setvar::hidden::1}}',
      '{{/puredisplay}}',
      '',
    ].join('\n');
    const request = {
      uri: 'file:///fixtures/pure-hover.risulorebook',
      version: 1,
      filePath: '/fixtures/pure-hover.risulorebook',
      text,
    };
    const provider = createProvider(new FragmentAnalysisService(), request);

    expect(provider.provide(createParams(request, positionAt(text, 'setvar', 2)))).toBeNull();
  });

  it('keeps #each and #func pure-mode hover contracts aligned around allowed macros', () => {
    const text = [
      '---',
      'name: pure-hover-contracts',
      '---',
      '@@@ CONTENT',
      '{{#each items as item}}',
      '{{slot::item}}',
      '{{setvar::hidden::1}}',
      '{{/each}}',
      '{{#func greet user}}',
      '{{arg::0}}',
      '{{setvar::shadow::1}}',
      '{{/func}}',
      '{{call::greet::Noel}}',
      '',
    ].join('\n');
    const request = {
      uri: 'file:///fixtures/pure-hover-contracts.risulorebook',
      version: 1,
      filePath: '/fixtures/pure-hover-contracts.risulorebook',
      text,
    };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const slotOffset = locateNthOffset(text, '{{slot::item}}');

    const slotMarkdown = expectMarkdownHover(
      provider.provide(
        createParams(request, offsetToPosition(text, slotOffset + '{{slot::'.length + 1)),
      ),
    );
    const argMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(text, '0'))),
    );

    expect(slotMarkdown).toContain('**Loop alias reference: item**');
    expect(slotMarkdown).toContain('Bound by: `#each items as item`');
    expect(argMarkdown).toContain('**Numbered argument reference: arg::0**');
    expect(argMarkdown).toContain('Local function: `greet`');
    expect(provider.provide(createParams(request, positionAt(text, 'hidden', 1)))).toBeNull();
    expect(provider.provide(createParams(request, positionAt(text, 'shadow', 1)))).toBeNull();
  });

  it('keeps local #func hover fragment-local across multi-fragment documents', () => {
    const text = [
      '---',
      'comment: split',
      'type: plain',
      '---',
      '@@@ IN',
      '{{#func greet user}}Hello{{/func}}',
      '@@@ OUT',
      '{{call::greet::Noel}}',
      '',
    ].join('\n');
    const request = {
      uri: 'file:///fixtures/hover-fragment-local.risuregex',
      version: 1,
      filePath: '/fixtures/hover-fragment-local.risuregex',
      text,
    };
    const provider = createProvider(new FragmentAnalysisService(), request);

    const declarationMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(text, 'greet', 2, 0))),
    );
    const callMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(text, 'greet', 2, 1))),
    );

    expect(declarationMarkdown).toContain('**Local function declaration: greet**');
    expect(callMarkdown).toContain('**Local function reference: greet**');
    expect(callMarkdown).toContain('unresolved local #func declaration');
    expect(callMarkdown).not.toContain('Local definition:');
  });

  it('does not reinterpret plain text inside an unclosed block as hoverable CBS syntax', () => {
    const entry = getFixtureCorpusEntry('lorebook-unclosed-block');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);

    expect(provider.provide(createParams(request, positionAt(entry.text, 'Hello', 1)))).toBeNull();
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
