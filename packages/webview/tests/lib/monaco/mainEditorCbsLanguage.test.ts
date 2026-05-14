import { describe, expect, it } from 'vitest';
import {
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

  it('registers a Monarch tokenizer and language configuration once per retained group', () => {
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
      'dispose-tokenizer:risu-cbs-content',
      'dispose-configuration:risu-cbs-content',
    ]);
  });
});
