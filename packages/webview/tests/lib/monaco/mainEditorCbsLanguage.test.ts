import { describe, expect, it } from 'vitest';
import {
  createMainEditorCbsFoldingProvider,
  createMainEditorCbsLanguageConfiguration,
  createMainEditorCbsMonarchLanguage,
  MAIN_EDITOR_CBS_LANGUAGE_ID,
  retainMainEditorCbsLanguage,
} from '../../../src/lib/monaco/mainEditorCbsLanguage';

describe('main editor CBS Monaco language registration', () => {
  it('exposes the shared language id used by CBS-backed Monaco models', () => {
    expect(MAIN_EDITOR_CBS_LANGUAGE_ID).toBe('risu-cbs-content');
  });

  it('creates Monarch rules for comments, control blocks, functions, and variables', () => {
    const language = createMainEditorCbsMonarchLanguage();

    expect(language.ignoreCase).toBe(true);
    expect(language.tokenizer.root.join('\n')).toContain('keyword.control.cbs');
    expect(language.tokenizer.cbsComment.join('\n')).toContain('comment.cbs');
    expect(language.tokenizer.cbsMacro.join('\n')).toContain('entity.name.function.cbs');
    expect(language.tokenizer.cbsMacro.join('\n')).toContain('variable.predefined.cbs');
  });

  it('matches the VS Code CBS bracket configuration for Monaco models', () => {
    const configuration = createMainEditorCbsLanguageConfiguration();

    expect(configuration.brackets).toContainEqual(['{{', '}}']);
    expect(configuration.autoClosingPairs).toContainEqual({ open: '{{', close: '}}' });
    expect(configuration.surroundingPairs).toContainEqual({ open: '{{', close: '}}' });
  });

  it('registers a Monarch tokenizer, language configuration, and folding range provider once per retained group', () => {
    const calls: string[] = [];
    const monacoApi = {
      languages: {
        register: ({ id }: { id: string }) => {
          calls.push(`register:${id}`);
        },
        setMonarchTokensProvider: (languageId: string, language: unknown) => {
          calls.push(`tokenizer:${languageId}:${typeof language}`);
          return {
            dispose: () => calls.push(`dispose-tokenizer:${languageId}`),
          };
        },
        setLanguageConfiguration: (languageId: string, configuration: unknown) => {
          calls.push(`configuration:${languageId}:${typeof configuration}`);
          return {
            dispose: () => calls.push(`dispose-configuration:${languageId}`),
          };
        },
        registerFoldingRangeProvider: (languageId: string, provider: unknown) => {
          calls.push(`folding:${languageId}:${typeof provider}`);
          return {
            dispose: () => calls.push(`dispose-folding:${languageId}`),
          };
        },
      },
    };

    const first = retainMainEditorCbsLanguage(monacoApi as never);
    const second = retainMainEditorCbsLanguage(monacoApi as never);
    first.dispose();
    second.dispose();

    expect(calls).toEqual([
      'register:risu-cbs-content',
      'tokenizer:risu-cbs-content:object',
      'configuration:risu-cbs-content:object',
      'folding:risu-cbs-content:object',
      'dispose-tokenizer:risu-cbs-content',
      'dispose-configuration:risu-cbs-content',
      'dispose-folding:risu-cbs-content',
    ]);
  });

  describe('CBS folding range provider', () => {
    it('returns empty ranges for a document with no block macros', () => {
      const provider = createMainEditorCbsFoldingProvider();
      const model = createMockModel(['plain text line', 'another plain line']);
      const ranges = provider.provideFoldingRanges(model as never, {} as never, {} as never);
      expect(ranges).toEqual([]);
    });

    it('creates a folding range for a simple if block', () => {
      const provider = createMainEditorCbsFoldingProvider();
      const model = createMockModel([
        '{{#if true}}',
        '  inside',
        '{{/if}}',
      ]);
      const ranges = provider.provideFoldingRanges(model as never, {} as never, {} as never);
      expect(ranges).toEqual([{ start: 1, end: 3 }]);
    });

    it('handles nested blocks', () => {
      const provider = createMainEditorCbsFoldingProvider();
      const model = createMockModel([
        '{{#if true}}',
        '  {{#when a}}',
        '    nested',
        '  {{/when}}',
        '{{/if}}',
      ]);
      const ranges = provider.provideFoldingRanges(model as never, {} as never, {} as never);
      expect(ranges).toEqual([
        { start: 2, end: 4 },
        { start: 1, end: 5 },
      ]);
    });

    it('ignores single-line blocks', () => {
      const provider = createMainEditorCbsFoldingProvider();
      const model = createMockModel([
        '{{#if true}}inline{{/if}}',
      ]);
      const ranges = provider.provideFoldingRanges(model as never, {} as never, {} as never);
      expect(ranges).toEqual([]);
    });

    it('handles a single-line block nested inside a multi-line block', () => {
      const provider = createMainEditorCbsFoldingProvider();
      const model = createMockModel([
        '{{#if true}}',
        '{{#if false}}inline{{/if}}',
        '{{/if}}',
      ]);
      const ranges = provider.provideFoldingRanges(model as never, {} as never, {} as never);
      expect(ranges).toEqual([{ start: 1, end: 3 }]);
    });

    it('folds outer block when inner is single-line with nested macros', () => {
      const provider = createMainEditorCbsFoldingProvider();
      const model = createMockModel([
        '{{#if {{? ({{getvar::vg_Resolution_Flag}} == 1)}} }}',
        '## Storyline Resolution Record',
        '{{#if {{? {{getvar::vg_Language}} != 2}}}}- The entire record must be written in English only.{{/if}}',
        '{{/if}}',
      ]);
      const ranges = provider.provideFoldingRanges(model as never, {} as never, {} as never);
      expect(ranges).toEqual([{ start: 1, end: 4 }]);
    });

    it('handles anonymous close {{/}}', () => {
      const provider = createMainEditorCbsFoldingProvider();
      const model = createMockModel([
        '{{#each items}}',
        '  item',
        '{{/}}',
      ]);
      const ranges = provider.provideFoldingRanges(model as never, {} as never, {} as never);
      expect(ranges).toEqual([{ start: 1, end: 3 }]);
    });

    it('folds complex opener lines with nested curlies', () => {
      const provider = createMainEditorCbsFoldingProvider();
      const model = createMockModel([
        '{{#if {{? ({{getvar::vg_Resolution_Flag}} == 1)}} }}',
        '1',
        '{{/if}}',
      ]);
      const ranges = provider.provideFoldingRanges(model as never, {} as never, {} as never);
      expect(ranges).toEqual([{ start: 1, end: 3 }]);
    });
  });
});

function createMockModel(lines: string[]): { getLineCount(): number; getLineContent(lineNumber: number): string } {
  return {
    getLineCount: () => lines.length,
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? '',
  };
}
