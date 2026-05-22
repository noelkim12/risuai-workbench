import { describe, expect, it } from 'vitest';
import {
  createMainEditorRootCompletionItems,
  getMainEditorChangeEndPosition,
  getMainEditorRootCompletionContext,
  registerMainEditorCbsRootCompletionProvider,
  shouldTriggerMainEditorCbsAutoSuggest,
  shouldTriggerMainEditorCbsSuggestForChange,
  triggerMainEditorCbsSuggest,
} from '../../../src/lib/monaco/mainEditorCbsAutoSuggest';

describe('main editor CBS auto suggest helpers', () => {
  it('detects double-open-brace prefixes like the VS Code editor fallback', () => {
    expect(shouldTriggerMainEditorCbsAutoSuggest({ insertedText: '{', linePrefix: '{{' })).toBe(true);
    expect(shouldTriggerMainEditorCbsAutoSuggest({ insertedText: 'x', linePrefix: '{{x' })).toBe(false);
  });

  it('detects argument prefixes that need explicit suggest re-open', () => {
    expect(shouldTriggerMainEditorCbsAutoSuggest({ insertedText: ':', linePrefix: '{{getvar::' })).toBe(true);
    expect(shouldTriggerMainEditorCbsAutoSuggest({ insertedText: ':', linePrefix: '{{#when::' })).toBe(true);
  });

  it('computes post-change Monaco positions for single and multi-line edits', () => {
    expect(getMainEditorChangeEndPosition({ range: { startLineNumber: 2, startColumn: 4 }, text: '{' })).toEqual({ lineNumber: 2, column: 5 });
    expect(getMainEditorChangeEndPosition({ range: { startLineNumber: 2, startColumn: 4 }, text: 'a\nbc' })).toEqual({ lineNumber: 3, column: 3 });
  });

  it('detects a Monaco content change that leaves the line prefix at {{', () => {
    const model = { getLineContent: () => '{{' };
    expect(shouldTriggerMainEditorCbsSuggestForChange(model, { range: { startLineNumber: 1, startColumn: 2 }, text: '{' })).toBe(true);
  });

  it('builds a root completion replacement range over the whole macro prefix', () => {
    const model = { getLineContent: () => 'Hello {{#' };
    expect(getMainEditorRootCompletionContext(model, { lineNumber: 1, column: 10 })).toEqual({
      kind: 'block-functions',
      prefix: '#',
      lineNumber: 1,
      startColumn: 7,
      endColumn: 10,
    });
  });

  it('keeps Monaco filter text compatible with a typed {{ prefix', () => {
    const model = { getLineContent: () => '{{' };
    const monacoApi = {
      Range: class Range {
        constructor(
          public startLineNumber: number,
          public startColumn: number,
          public endLineNumber: number,
          public endColumn: number,
        ) {}
      },
      languages: {
        CompletionItemKind: { Function: 1, Snippet: 27 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4, KeepWhitespace: 1 },
      },
    };

    const items = createMainEditorRootCompletionItems(monacoApi as never, model, { lineNumber: 1, column: 3 } as never);

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => typeof item.filterText === 'string' && item.filterText.startsWith('{{'))).toBe(true);
  });

  it('uses Monaco snippet placeholders for block completions like the VS Code LSP', () => {
    const model = { getLineContent: () => '{{#' };
    const monacoApi = {
      Range: class Range {
        constructor(
          public startLineNumber: number,
          public startColumn: number,
          public endLineNumber: number,
          public endColumn: number,
        ) {}
      },
      languages: {
        CompletionItemKind: { Function: 1, Snippet: 27 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4, KeepWhitespace: 1 },
      },
    };

    const items = createMainEditorRootCompletionItems(monacoApi as never, model, { lineNumber: 1, column: 4 } as never);
    const ifItem = items.find((item) => item.label === '#if');

    expect(ifItem?.insertText).toBe('{{#if ${1:condition}}}\n\t$2\n{{/if}}');
    expect(ifItem?.insertTextRules).toBe(5);
    expect(ifItem?.kind).toBe(27);
  });

  it('registers root completion candidates independently from the LSP client', () => {
    type RootCompletionProvider = {
      provideCompletionItems(model: { getLineContent(lineNumber: number): string }, position: { lineNumber: number; column: number }): { suggestions: unknown[] };
    };

    let provider: RootCompletionProvider | undefined;
    let disposed = false;
    const monacoApi = {
      Range: class Range {
        constructor(
          public startLineNumber: number,
          public startColumn: number,
          public endLineNumber: number,
          public endColumn: number,
        ) {}
      },
      languages: {
        CompletionItemKind: { Function: 1, Snippet: 27 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4, KeepWhitespace: 1 },
        registerCompletionItemProvider: (_languageId: string, nextProvider: RootCompletionProvider) => {
          provider = nextProvider;
          return {
            dispose: () => {
              disposed = true;
            },
          };
        },
      },
    };

    const disposable = registerMainEditorCbsRootCompletionProvider(monacoApi as never, 'risu-cbs-content');
    const result = provider?.provideCompletionItems({ getLineContent: () => '{{' }, { lineNumber: 1, column: 3 });
    disposable.dispose();

    expect(result?.suggestions.length).toBeGreaterThan(0);
    expect(disposed).toBe(true);
  });

  it('runs the Monaco suggest action directly when CBS auto suggest fires', () => {
    const calls: string[] = [];
    const editor = {
      focus: () => {
        calls.push('focus');
      },
      getAction: (actionId: string) => ({
        run: () => {
          calls.push(`run:${actionId}`);
        },
      }),
      trigger: (_source: string, handlerId: string) => {
        calls.push(`trigger:${handlerId}`);
      },
    };

    triggerMainEditorCbsSuggest(editor);

    expect(calls).toEqual(['focus', 'run:editor.action.triggerSuggest']);
  });

  it('falls back to editor.trigger when the suggest action is unavailable', () => {
    const calls: string[] = [];
    const editor = {
      focus: () => {
        calls.push('focus');
      },
      getAction: () => null,
      trigger: (source: string, handlerId: string) => {
        calls.push(`${source}:${handlerId}`);
      },
    };

    triggerMainEditorCbsSuggest(editor);

    expect(calls).toEqual(['focus', 'main-editor-cbs-auto-suggest:editor.action.triggerSuggest']);
  });
});
