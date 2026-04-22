import type {
  CompletionItem,
  Position,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { CBSBuiltinRegistry } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import { type AgentMetadataEnvelope, FragmentAnalysisService } from '../../src/core';
import { CompletionProvider } from '../../src/features/completion';
import { offsetToPosition } from '../../src/utils/position';
import {
  createFixtureRequest,
  getFixtureCorpusEntry,
  snapshotCompletionItems,
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

function extractCompletionCategory(completion: CompletionItem | undefined) {
  return (completion?.data as AgentMetadataEnvelope | undefined)?.cbs.category;
}

function extractCompletionExplanation(completion: CompletionItem | undefined) {
  return (completion?.data as AgentMetadataEnvelope | undefined)?.cbs.explanation;
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

    it('labels documentation-only syntax entries differently from callable builtins', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      for (const label of ['#when', '#each', 'slot', '#pure', '#puredisplay', '#escape']) {
        const completion = completions.find((item) => item.label === label);

        expect(completion?.detail).toContain('Documentation-only');
        expect(completion?.documentation).toEqual({
          kind: 'markdown',
          value: expect.stringContaining('not a general runtime callback builtin'),
        });
      }

      for (const label of ['getvar', 'setvar']) {
        const completion = completions.find((item) => item.label === label);

        expect(completion?.detail).toContain('Callable builtin');
        expect(completion?.documentation).toEqual({
          kind: 'markdown',
          value: expect.stringContaining('available as a runtime CBS builtin'),
        });
      }
    });

    it('attaches stable machine-readable categories to builtin and block keyword completions', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      expect(extractCompletionCategory(completions.find((item) => item.label === 'getvar'))).toEqual({
        category: 'builtin',
        kind: 'callable-builtin',
      });
      expect(extractCompletionCategory(completions.find((item) => item.label === '#when'))).toEqual({
        category: 'block-keyword',
        kind: 'documentation-only-builtin',
      });
      expect(extractCompletionExplanation(completions.find((item) => item.label === 'getvar'))).toEqual({
        reason: 'registry-lookup',
        source: 'builtin-registry',
        detail: 'Completion surfaced this item from the builtin registry as a callable CBS builtin.',
      });
    });

    it('builds a deterministic normalized snapshot view for completion payloads', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      const forward = snapshotCompletionItems(completions);
      const reversed = snapshotCompletionItems([...completions].reverse());

      expect(reversed).toEqual(forward);
      expect(forward.find((item) => item.label === '#when')).toEqual(
        expect.objectContaining({
          data: {
            cbs: expect.objectContaining({
              category: {
                category: 'block-keyword',
                kind: 'documentation-only-builtin',
              },
              explanation: {
                reason: 'registry-lookup',
                source: 'builtin-registry',
                detail:
                  'Completion surfaced this item from the builtin registry as a documentation-only CBS syntax entry.',
              },
            }),
          },
          detail: 'Documentation-only block syntax',
          documentation: expect.stringContaining('not a general runtime callback builtin'),
          kind: 7,
          label: '#when',
        }),
      );
    });
  });

  describe('trigger context: calc expression zones', () => {
    it('offers calc variable completions inside the {{? ...}} inline form', () => {
      const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('{{? $score + @bonus}}', '{{? $sc + @bo}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === modifiedRequest.uri ? modifiedRequest : null,
      });
      const completions = provider.provide(
        createParams(modifiedRequest, offsetToPosition(modifiedText, modifiedText.indexOf('$sc') + 3)),
      );

      expectCompletionLabels(completions, '$score');
      expectNoCompletionLabels(completions, 'setvar', '#when');
    });

    it('treats the first {{calc::...}} argument as the same expression zone', () => {
      const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('{{calc::$score + @bonus}}', '{{calc::$sc + @bo}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === modifiedRequest.uri ? modifiedRequest : null,
      });

      const variableCompletions = provider.provide(
        createParams(modifiedRequest, offsetToPosition(modifiedText, modifiedText.indexOf('$sc') + 3)),
      );
      const operatorCompletions = provider.provide(
        createParams(modifiedRequest, offsetToPosition(modifiedText, modifiedText.indexOf(' + ') + 1)),
      );

      expectCompletionLabels(variableCompletions, '$score');
      expectCompletionLabels(operatorCompletions, '&&', 'null');
      expectNoCompletionLabels(variableCompletions, 'setvar', 'getvar');
    });

    it('replaces partial operator prefixes instead of appending duplicate operator text', () => {
      const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('{{calc::$score + @bonus}}', '{{calc::=}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === modifiedRequest.uri ? modifiedRequest : null,
      });
      const operatorOffset = modifiedText.indexOf('{{calc::=}}') + '{{calc::='.length;
      const completions = provider.provide(
        createParams(modifiedRequest, offsetToPosition(modifiedText, operatorOffset)),
      );
      const equalityCompletion = completions.find((completion) => completion.label === '==');

      expect(equalityCompletion?.textEdit).toEqual({
        range: {
          start: offsetToPosition(modifiedText, operatorOffset - 1),
          end: offsetToPosition(modifiedText, operatorOffset),
        },
        newText: '==',
      });
    });
  });

  describe('trigger context: {{call:: (local function names)', () => {
    it('offers local #func declarations after call::', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#func greet user}}Hello{{/func}}{{call::}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{call::}}') + '{{call::'.length),
        ),
      );

      expectCompletionLabels(completions, 'greet');
      expectNoCompletionLabels(completions, 'getvar', '#when');
      expect(extractCompletionCategory(completions.find((item) => item.label === 'greet'))).toEqual({
        category: 'contextual-token',
        kind: 'local-function',
      });
    });

    it('filters local #func names by typed prefix inside complete macros', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#func greet user}}Hello{{/func}}{{#func grant target}}Hi{{/func}}{{call::gr}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{call::gr}}') + '{{call::gr'.length),
        ),
      );

      expectCompletionLabels(completions, 'greet', 'grant');
    });

    it('documents the call:: function-name slot and downstream arg mapping for local #func completions', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#func greet user target}}Hello{{/func}}{{call::}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{call::}}') + '{{call::'.length),
        ),
      );
      const greetCompletion = completions.find((completion) => completion.label === 'greet');

      expect(greetCompletion?.detail).toBe('Local #func declaration for the first call:: slot');
      expect(greetCompletion?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining('insert this into the first `call::` slot'),
      });
      expect(greetCompletion?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining('`arg::0` → `user`, `arg::1` → `target`'),
      });
    });
  });

  describe('trigger context: {{arg:: (numbered local argument slots)', () => {
    it('offers 0-based parameter slots inside a local #func body', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#func greet user target}}Hello {{arg::}}{{/func}}{{call::greet::Noel::friend}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{arg::}}') + '{{arg::'.length),
        ),
      );

      expectCompletionLabels(completions, '0', '1');
      expect(completions.find((completion) => completion.label === '0')?.detail).toContain(
        'Numbered argument reference',
      );
      expect(completions.find((completion) => completion.label === '0')?.detail).toContain('user');
      expect(completions.find((completion) => completion.label === '1')?.detail).toContain('target');
      expect(completions.find((completion) => completion.label === '1')?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining(
          'references the 2nd call argument from the active local `#func` / `{{call::...}}` context',
        ),
      });
      expect(completions.find((completion) => completion.label === '1')?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining('Parameter definition: line'),
      });
    });

    it('does not expose arg:: slot completions outside a local #func / call:: context', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{arg::}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{arg::}}') + '{{arg::'.length),
        ),
      );

      expect(completions).toEqual([]);
    });
  });

  describe('trigger context: {{slot:: (loop aliases only)', () => {
    it('offers the current #each alias and does not mix in general variable completions', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::entry::chat}}{{#each items as entry}}{{slot::}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{slot::}}') + '{{slot::'.length),
        ),
      );

      expect(completions.map((completion) => completion.label)).toEqual(['entry']);
      expect(completions[0]?.detail).toContain('Current #each loop alias');
      expectNoCompletionLabels(completions, 'getvar', '#when');
    });

    it('orders nested #each aliases from current scope to outer scope', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#each items as outer}}{{#each others as inner}}{{slot::}}{{/each}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{slot::}}') + '{{slot::'.length),
        ),
      );

      expect(completions.map((completion) => completion.label)).toEqual(['inner', 'outer']);
      expect(completions[0]?.preselect).toBe(true);
      expect(completions[1]?.detail).toContain('Outer #each loop alias');
    });

    it('falls back to valid outer aliases during malformed inner #each recovery without leaking generic variables', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::outer::chat}}{{#each items as outer}}{{#each broken}}{{slot::}}{{/each}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{slot::}}') + '{{slot::'.length),
        ),
      );

      expect(completions.map((completion) => completion.label)).toEqual(['outer']);
      expectNoCompletionLabels(completions, 'getvar', '#each');
    });

    it('returns no slot alias completions when the current malformed #each scope has no recoverable alias', () => {
      const entry = getFixtureCorpusEntry('prompt-malformed-each-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(entry.text, entry.text.indexOf('{{slot::item}}') + '{{slot::'.length),
        ),
      );

      expect(completions).toEqual([]);
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
        'pure-block',
        'func-block',
      );
      expect(extractCompletionCategory(completions.find((item) => item.label === 'when-block'))).toEqual({
        category: 'snippet',
        kind: 'block-snippet',
      });
    });

    it('keeps block-only completion wording aligned with documentation-only metadata', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      for (const label of ['#when', '#each', '#escape', '#pure', '#puredisplay']) {
        const completion = completions.find((item) => item.label === label);

        expect(completion?.detail).toBe('Documentation-only block syntax');
        expect(completion?.documentation).toEqual({
          kind: 'markdown',
          value: expect.stringContaining('not a general runtime callback builtin'),
        });
      }
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

    it('suppresses general CBS completions inside puredisplay bodies', () => {
      const text = [
        '---',
        'name: pure-completion',
        '---',
        '@@@ CONTENT',
        '{{#puredisplay}}',
        '{{',
        '{{/puredisplay}}',
        '',
      ].join('\n');
      const request = {
        uri: 'file:///fixtures/pure-completion.risulorebook',
        version: 1,
        filePath: '/fixtures/pure-completion.risulorebook',
        text,
      };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
      });

      expect(
        provider.provide(
          createParams(request, offsetToPosition(text, text.indexOf('{{', text.indexOf('{{#puredisplay}}') + 1) + 2)),
        ),
      ).toEqual([]);
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
      expect(extractCompletionCategory(completions.find((item) => item.label === ':else'))).toEqual({
        category: 'block-keyword',
        kind: 'else-keyword',
      });
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
      expect(extractCompletionCategory(completions.find((item) => item.label === 'mood'))).toEqual({
        category: 'variable',
        kind: 'chat-variable',
      });
      expect(extractCompletionExplanation(completions.find((item) => item.label === 'mood'))).toEqual({
        reason: 'scope-analysis',
        source: 'chat-variable-symbol-table',
        detail:
          'Completion resolved this candidate from analyzed chat/global variable definitions in the current fragment.',
      });
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
