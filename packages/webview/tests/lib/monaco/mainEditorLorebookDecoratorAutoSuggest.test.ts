import { describe, expect, it } from 'vitest';
import lorebookContentEditorSource from '../../../src/lib/components/editor/lorebook/LorebookContentEditor.svelte?raw';
import mainEditorSource from '../../../src/lib/components/editor/main/MainEditor.svelte?raw';
import {
  createMainEditorLorebookDecoratorCompletionItems,
  getMainEditorLorebookDecoratorCompletionContext,
  registerMainEditorLorebookDecoratorCompletionProvider,
  shouldTriggerMainEditorLorebookDecoratorAutoSuggest,
  shouldTriggerMainEditorLorebookDecoratorSuggestForChange,
} from '../../../src/lib/monaco/mainEditorLorebookDecoratorAutoSuggest';

describe('main editor lorebook decorator auto suggest helpers', () => {
  it('detects line-leading double-at prefixes for explicit suggest opening', () => {
    expect(shouldTriggerMainEditorLorebookDecoratorAutoSuggest({ insertedText: '@', linePrefix: '@@' })).toBe(true);
    expect(shouldTriggerMainEditorLorebookDecoratorAutoSuggest({ insertedText: '@', linePrefix: 'foo @@' })).toBe(false);
    expect(shouldTriggerMainEditorLorebookDecoratorAutoSuggest({ insertedText: 'r', linePrefix: '@@r' })).toBe(false);
  });

  it('detects a Monaco content change that leaves the line prefix at @@', () => {
    const model = { getLineContent: () => '@@' };
    expect(shouldTriggerMainEditorLorebookDecoratorSuggestForChange(model, { range: { startLineNumber: 1, startColumn: 2 }, text: '@' })).toBe(true);
  });

  it('returns completion context for line-leading @@ and @@rec prefixes', () => {
    const bareModel = { getLineContent: () => '@@' };
    const prefixModel = { getLineContent: () => '  @@rec' };

    expect(getMainEditorLorebookDecoratorCompletionContext(bareModel, { lineNumber: 1, column: 3 })).toEqual({
      prefix: '',
      lineNumber: 1,
      startColumn: 1,
      endColumn: 3,
    });
    expect(getMainEditorLorebookDecoratorCompletionContext(prefixModel, { lineNumber: 1, column: 8 })).toEqual({
      prefix: 'rec',
      lineNumber: 1,
      startColumn: 3,
      endColumn: 8,
    });
  });

  it('returns no decorator context after single @ or inline prose', () => {
    expect(getMainEditorLorebookDecoratorCompletionContext({ getLineContent: () => '@' }, { lineNumber: 1, column: 2 })).toBeNull();
    expect(getMainEditorLorebookDecoratorCompletionContext({ getLineContent: () => 'foo @@rec' }, { lineNumber: 1, column: 10 })).toBeNull();
  });

  it('builds decorator completion items from browser-safe core metadata', () => {
    const model = { getLineContent: () => '@@rec' };
    const monacoApi = createMockMonacoApi();

    const items = createMainEditorLorebookDecoratorCompletionItems(monacoApi as never, model, { lineNumber: 1, column: 6 } as never);
    const recursiveItem = items.find((item) => item.label === '@@recursive');

    expect(items.map((item) => item.label)).toContain('@@recursive');
    expect(items.map((item) => item.label)).not.toContain('@@unrecursive');
    expect(items.map((item) => item.label)).not.toContain('@@no_recursive_search');
    expect(recursiveItem).toMatchObject({
      kind: 17,
      insertText: '@@recursive',
      detail: 'active decorator — Include in recursive scan source',
      sortText: '0018',
    });
    expect(recursiveItem?.documentation).toContain('@@recursive');
    expect(recursiveItem?.range).toEqual({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 });
  });

  it('registers decorator completion candidates independently from the LSP client', () => {
    type DecoratorCompletionProvider = {
      triggerCharacters?: string[];
      provideCompletionItems(model: { getLineContent(lineNumber: number): string }, position: { lineNumber: number; column: number }): { suggestions: unknown[] };
    };

    let provider: DecoratorCompletionProvider | undefined;
    let disposed = false;
    const monacoApi = createMockMonacoApi((languageId, nextProvider) => {
      expect(languageId).toBe('risu-cbs-content');
      provider = nextProvider;
      return {
        dispose: () => {
          disposed = true;
        },
      };
    });

    const disposable = registerMainEditorLorebookDecoratorCompletionProvider(monacoApi as never, 'risu-cbs-content');
    const result = provider?.provideCompletionItems({ getLineContent: () => '@@' }, { lineNumber: 1, column: 3 });
    disposable.dispose();

    expect(provider?.triggerCharacters).toEqual(['@']);
    expect(result?.suggestions.length).toBeGreaterThan(0);
    expect(disposed).toBe(true);
  });

  it('wires decorator completion only for the lorebook body editor', () => {
    expect(lorebookContentEditorSource).toContain('registerMainEditorLorebookDecoratorCompletionProvider');
    expect(lorebookContentEditorSource).toContain('decoratorCompletionDisposable = enableDecoratorCompletion');
    expect(lorebookContentEditorSource).toContain('decoratorCompletionDisposable?.dispose();');
    expect(mainEditorSource).toContain('formatKind="lorebook"\n              sectionName="CONTENT"\n              enableDecoratorCompletion={true}');
    expect(mainEditorSource).toContain('formatKind="text"\n              sectionName="TEXT"\n              enableDecoratorCompletion={false}');
  });
});

function createMockMonacoApi(registerCompletionItemProvider?: (languageId: string, provider: never) => { dispose(): void }) {
  return {
    Range: class Range {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number,
      ) {}
    },
    languages: {
      CompletionItemKind: { Keyword: 17 },
      registerCompletionItemProvider,
    },
  };
}
