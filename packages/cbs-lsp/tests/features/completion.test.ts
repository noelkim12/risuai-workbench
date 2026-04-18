import type {
  CompletionItem,
  Position,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { CBSBuiltinRegistry } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import { FragmentAnalysisService } from '../../src/core';
import { CompletionProvider } from '../../src/features/completion';
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
): CompletionProvider {
  return new CompletionProvider(new CBSBuiltinRegistry(), {
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

function expectCompletionLabels(completions: CompletionItem[], ...expectedLabels: string[]) {
  const labels = completions.map((c) => c.label);
  for (const expected of expectedLabels) {
    expect(labels).toContain(expected);
  }
}

function expectNoCompletionLabels(completions: CompletionItem[], ...unexpectedLabels: string[]) {
  const labels = completions.map((c) => c.label);
  for (const unexpected of unexpectedLabels) {
    expect(labels).not.toContain(unexpected);
  }
}

describe('CompletionProvider', () => {
  describe('trigger context: {{ (all functions)', () => {
    it('offers all function names after {{', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, 'user', 'char', 'setvar', 'getvar', '#when', '#each');
    });

    it('offers completions when typing partial function name', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{us', 3)),
      );

      // Should offer completions (prefix filtering is handled by client or not available)
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'user')).toBe(true);
    });

    it('marks block functions as Class kind', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      const whenCompletion = completions.find((c) => c.label === '#when');
      expect(whenCompletion).toBeDefined();
      expect(whenCompletion?.kind).toBe(7); // CompletionItemKind.Class = 7 in LSP spec
    });

    it('marks deprecated functions', () => {
      const entry = getFixtureCorpusEntry('regex-deprecated-block');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      const ifCompletion = completions.find((c) => c.label === '#if');
      expect(ifCompletion).toBeDefined();
      expect(ifCompletion?.deprecated).toBe(true);
    });
  });

  describe('trigger context: {{# (block functions)', () => {
    it('offers block functions only after {{#', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      expectCompletionLabels(completions, '#when', '#each', '#escape', '#puredisplay');
      expectNoCompletionLabels(completions, 'user', 'char', 'setvar', 'getvar');
    });

    it('finds #when when typing {{#w (typed prefix with #)', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      // Simulate typing {{#w - cursor right after {{#w
      const modifiedText = entry.text.replace('{{#when', '{{#w');
      const modifiedRequest = { ...request, text: modifiedText };
      const modifiedProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const completions = modifiedProvider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{#w') + 4),
        ),
      );

      // Should find #when even though user typed {{#w (prefix includes #)
      expectCompletionLabels(completions, '#when');
    });

    it('finds #each when typing {{#e (typed prefix with #)', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);

      // Simulate typing {{#e
      const modifiedText = entry.text.replace('{{#when', '{{#e');
      const modifiedRequest = { ...request, text: modifiedText };
      const modifiedProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const completions = modifiedProvider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{#e') + 4),
        ),
      );

      expectCompletionLabels(completions, '#each', '#escape');
    });

    it('includes block snippets', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      expectCompletionLabels(
        completions,
        'when-block',
        'when-else-block',
        'each-block',
        'escape-block',
        'puredisplay-block',
      );
    });

    it('snippets have Snippet kind', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      const snippet = completions.find((c) => c.label === 'when-block');
      expect(snippet).toBeDefined();
      expect(snippet?.kind).toBe(15); // CompletionItemKind.Snippet
    });
  });

  describe('trigger context: {{: (:else)', () => {
    it('offers :else after {{:', () => {
      const entry = getFixtureCorpusEntry('regex-block-else');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{:e', 4)),
      );

      expectCompletionLabels(completions, ':else');
    });
  });

  describe('trigger context: {{/ (close tags)', () => {
    it('offers matching close tag for open block', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{/', 3)));

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, '/when');
    });

    it('preselects matching close tag', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{/', 3)));

      const closeTag = completions.find((c) => c.label === '/when');
      expect(closeTag?.preselect).toBe(true);
    });

    it('never emits invalid labels like /#when (blockKind should be normalized)', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{/', 3)));

      // Ensure no completion has a label starting with /#
      for (const completion of completions) {
        expect(completion.label).not.toMatch(/^\/#/);
      }
    });

    it('close tag for #when block emits /when not /#when', () => {
      // Use the existing regex-block-header fixture which has {{#when::score::is}}
      // Position cursor inside the block and type close tag
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);

      // Insert content inside the when block and add a close tag start
      const originalWhen = '{{#when::score::is}}';
      const modifiedContent = '{{#when::score::is}}some content here {{/';
      const modifiedText = entry.text.replace(originalWhen, modifiedContent);
      const modifiedRequest = { ...request, text: modifiedText };
      const modifiedProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const closeTagIndex = modifiedText.indexOf('{{/') + 3;
      const completions = modifiedProvider.provide(
        createParams(modifiedRequest, offsetToPosition(modifiedText, closeTagIndex)),
      );

      // Should find /when (normalized from #when block kind)
      expect(completions.some((c) => c.label === '/when')).toBe(true);
      // Should NOT find /#when (invalid label)
      expect(completions.some((c) => c.label === '/#when')).toBe(false);
    });

    it('no-open-block fallback returns no completions for incomplete syntax', () => {
      // Create a document with no open block - just typing {{/ outside any block context
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);

      // Add {{/ at the end of content (outside any block)
      const modifiedText = entry.text.replace('}}', '}}{{/');
      const modifiedRequest = { ...request, text: modifiedText };
      const modifiedProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const closeTagIndex = modifiedText.indexOf('{{/') + 3;
      const completions = modifiedProvider.provide(
        createParams(modifiedRequest, offsetToPosition(modifiedText, closeTagIndex)),
      );

      // Incomplete syntax (unclosed {{/) is treated as PlainText by tokenizer
      // Per architectural rule: no raw token value parsing, so no completions offered
      expect(completions.length).toBe(0);
    });
  });

  describe('trigger context: {{getvar:: (variable names)', () => {
    it('offers defined chat variables after getvar:: in complete macro', () => {
      // Create a document with setvar defining a variable, then complete getvar macro
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);

      // Add a complete {{getvar::}} macro after the existing content
      // Cursor positioned between :: and }} to trigger variable completion
      const modifiedText = entry.text.replace('}}', '}}{{getvar::}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      // Position cursor after {{getvar:: and before }}
      const getvarIndex = modifiedText.indexOf('{{getvar::');
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, getvarIndex + '{{getvar::'.length),
        ),
      );

      // Should offer the 'mood' variable defined by setvar::mood::happy
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'mood')).toBe(true);
      expect(completions.every((c) => c.kind === 6)).toBe(true); // CompletionItemKind.Variable = 6
    });

    it('filters chat variables by prefix when typing', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);

      // Add {{getvar::mo}} with cursor after 'mo'
      const modifiedText = entry.text.replace('}}', '}}{{getvar::mo}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const getvarIndex = modifiedText.indexOf('{{getvar::mo');
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, getvarIndex + '{{getvar::mo'.length),
        ),
      );

      // Should find 'mood' when typing 'mo' prefix
      expect(completions.some((c) => c.label === 'mood')).toBe(true);
    });

    it('returns no completions for incomplete getvar syntax', () => {
      // Create a document with setvar and then getvar to test variable completion
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);

      // Add {{getvar:: after the existing content to test completion
      const modifiedText = entry.text.replace('}}', '}}{{getvar::');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const getvarIndex = modifiedText.indexOf('{{getvar::');
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, getvarIndex + '{{getvar::'.length),
        ),
      );

      // Incomplete syntax (unclosed {{getvar::) is treated as PlainText by tokenizer
      // Per architectural rule: no raw token value parsing, so no completions offered
      expect(completions.length).toBe(0);
    });
  });

  describe('trigger context: {{gettempvar:: (temp variable names)', () => {
    it('offers defined temp variables after gettempvar:: in complete macro', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');

      // Create text with settempvar defining a variable, then complete gettempvar macro
      const tempText = entry.text.replace('{{user}}', '{{settempvar::cache::value}}{{gettempvar::}}');
      const tempRequest = { ...createFixtureRequest(entry), text: tempText };
      const tempProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => tempRequest,
      });

      // Position cursor after {{gettempvar:: and before }}
      const completions = tempProvider.provide(
        createParams(
          tempRequest,
          offsetToPosition(tempText, tempText.indexOf('{{gettempvar::') + '{{gettempvar::'.length),
        ),
      );

      // Should offer the 'cache' temp variable defined by settempvar::cache::value
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'cache')).toBe(true);
      expect(completions.every((c) => c.kind === 6)).toBe(true); // CompletionItemKind.Variable = 6
    });

    it('returns no completions for incomplete gettempvar syntax', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      const tempText = entry.text.replace('{{user}}', '{{settempvar::cache::value}}{{gettempvar::');
      const tempRequest = { ...request, text: tempText };
      const tempProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => tempRequest,
      });

      const completions = tempProvider.provide(
        createParams(
          tempRequest,
          offsetToPosition(tempText, tempText.indexOf('{{gettempvar::') + '{{gettempvar::'.length),
        ),
      );

      // Incomplete syntax (unclosed {{gettempvar::) is treated as PlainText by tokenizer
      // Per architectural rule: no raw token value parsing, so no completions offered
      expect(completions.length).toBe(0);
    });
  });

  describe('trigger context: {{metadata:: (metadata keys)', () => {
    it('offers metadata keys after metadata:: in complete macro', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);

      // Replace with complete {{metadata::}} macro
      const metaText = entry.text.replace('{{user}}', '{{metadata::}}');
      const metaRequest = { ...request, text: metaText };
      const metaProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => metaRequest,
      });

      // Position cursor after {{metadata:: and before }}
      const completions = metaProvider.provide(
        createParams(
          metaRequest,
          offsetToPosition(metaText, metaText.indexOf('{{metadata::') + '{{metadata::'.length),
        ),
      );

      // Should offer metadata keys like mobile, local, version, lang, user, char, bot
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'mobile')).toBe(true);
      expect(completions.some((c) => c.label === 'user')).toBe(true);
      expect(completions.some((c) => c.label === 'char')).toBe(true);
      expect(completions.some((c) => c.label === 'version')).toBe(true);
      expect(completions.every((c) => c.kind === 10)).toBe(true); // CompletionItemKind.Property = 10
    });

    it('filters metadata keys by prefix when typing', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);

      // Replace with {{metadata::mo}} to filter for mobile
      const metaText = entry.text.replace('{{user}}', '{{metadata::mo}}');
      const metaRequest = { ...request, text: metaText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => metaRequest,
      });

      const metaIndex = metaText.indexOf('{{metadata::mo');
      const completions = provider.provide(
        createParams(metaRequest, offsetToPosition(metaText, metaIndex + '{{metadata::mo'.length)),
      );

      // Should find 'mobile' when typing 'mo' prefix
      expect(completions.some((c) => c.label === 'mobile')).toBe(true);
    });

    it('returns no completions for incomplete metadata syntax', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      const metaText = entry.text.replace('{{user}}', '{{metadata::');
      const metaRequest = { ...request, text: metaText };
      const metaProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => metaRequest,
      });

      const completions = metaProvider.provide(
        createParams(
          metaRequest,
          offsetToPosition(metaText, metaText.indexOf('{{metadata::') + '{{metadata::'.length),
        ),
      );

      // Incomplete syntax (unclosed {{metadata::) is treated as PlainText by tokenizer
      // Per architectural rule: no raw token value parsing, so no completions offered
      expect(completions.length).toBe(0);
    });
  });

  describe('trigger context: {{#when ...:: (operators)', () => {
    it('offers when operators', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      // Position at {{#when::score:: (ready to type operator)
      const text = entry.text;
      const whenIndex = text.indexOf('{{#when::score::');
      const completions = provider.provide(
        createParams(request, offsetToPosition(text, whenIndex + '{{#when::score::'.length)),
      );

      expectCompletionLabels(completions, 'is', 'isnot', 'and', 'or', 'not', 'keep', 'toggle');
    });

    it('offers operator completions when typing partial operator', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      const text = entry.text;
      const whenIndex = text.indexOf('{{#when::score::is');
      const completions = provider.provide(
        createParams(request, offsetToPosition(text, whenIndex + '{{#when::score::i'.length)),
      );

      // Should offer completions (prefix filtering requires content.slice which is avoided)
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'is')).toBe(true);
      expect(completions.some((c) => c.label === 'isnot')).toBe(true);
    });

    it('includes comparison operators', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      const text = entry.text;
      const whenIndex = text.indexOf('{{#when::score::');
      const completions = provider.provide(
        createParams(request, offsetToPosition(text, whenIndex + '{{#when::score::'.length)),
      );

      expectCompletionLabels(completions, '>', '<', '>=', '<=');
    });
  });

  describe('replacement ranges', () => {
    it('stays within fragment bounds for lorebook', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      expect(completions.length).toBeGreaterThan(0);
      for (const completion of completions) {
        expect(completion.textEdit).toBeDefined();
        expect(
          'range' in completion.textEdit! ||
            ('insert' in completion.textEdit! && 'replace' in completion.textEdit!),
        ).toBe(true);
      }
    });

    it('stays within fragment bounds for regex', () => {
      const entry = getFixtureCorpusEntry('regex-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      expect(completions.length).toBeGreaterThan(0);
      for (const completion of completions) {
        expect(completion.textEdit).toBeDefined();
        expect(
          'range' in completion.textEdit! ||
            ('insert' in completion.textEdit! && 'replace' in completion.textEdit!),
        ).toBe(true);
      }
    });

    it('stays within fragment bounds for prompt', () => {
      const entry = getFixtureCorpusEntry('prompt-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{getvar::', 9)),
      );

      expect(completions.length).toBeGreaterThanOrEqual(0);
      for (const completion of completions) {
        expect(completion.textEdit).toBeDefined();
        expect(
          'range' in completion.textEdit! ||
            ('insert' in completion.textEdit! && 'replace' in completion.textEdit!),
        ).toBe(true);
      }
    });
  });

  describe('outside CBS fragments', () => {
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
      {
        label: 'lorebook without CONTENT section (no fragment)',
        entryId: 'lorebook-no-content-section',
        position: (text: string) => positionAt(text, 'name: entry', 2),
      },
    ])('returns empty outside CBS fragments for $label', ({ entryId, position }) => {
      const entry = getFixtureCorpusEntry(entryId);
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      expect(provider.provide(createParams(request, position(entry.text)))).toEqual([]);
    });

    it('returns empty for empty lorebook document (no fragments)', () => {
      const entry = getFixtureCorpusEntry('lorebook-empty-document');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      // Position at offset 0 in empty document
      const position: Position = { line: 0, character: 0 };
      expect(provider.provide(createParams(request, position))).toEqual([]);
    });
  });

  describe('block snippets content', () => {
    it('when-block snippet has correct insert text', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      // Use {{# trigger to get block snippets
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      const whenSnippet = completions.find((c) => c.label === 'when-block');
      expect(whenSnippet).toBeDefined();
      expect(whenSnippet?.insertText).toContain('{{#when ${1:condition}}}');
      expect(whenSnippet?.insertText).toContain('{{/when}}');
    });

    it('each-block snippet includes slot variable', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      const eachSnippet = completions.find((c) => c.label === 'each-block');
      expect(eachSnippet).toBeDefined();
      expect(eachSnippet?.insertText).toContain('{{slot::${2:item}}}');
    });

    it('when-else-block snippet includes :else', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      const elseSnippet = completions.find((c) => c.label === 'when-else-block');
      expect(elseSnippet).toBeDefined();
      expect(elseSnippet?.insertText).toContain('{{:else}}');
    });
  });
});
