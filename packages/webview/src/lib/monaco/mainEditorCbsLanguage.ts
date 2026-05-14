/**
 * Main Editor Monaco CBS language registration helpers.
 * @file packages/webview/src/lib/monaco/mainEditorCbsLanguage.ts
 */

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';

export const MAIN_EDITOR_CBS_LANGUAGE_ID = 'risu-cbs-content';

let registeredLanguage = false;
let retainCount = 0;
let tokenizerDisposable: monaco.IDisposable | undefined;
let configurationDisposable: monaco.IDisposable | undefined;

/**
 * createMainEditorCbsMonarchLanguage 함수.
 * Main Editor CONTENT/OUT/prompt section용 CBS Monarch tokenizer를 생성함.
 *
 * @returns Monaco Monarch tokenizer definition
 */
export function createMainEditorCbsMonarchLanguage(): monaco.languages.IMonarchLanguage {
  return {
    defaultToken: '',
    tokenPostfix: '.cbs',
    ignoreCase: true,
    brackets: [
      { open: '{{', close: '}}', token: 'delimiter.bracket.cbs' },
      { open: '(', close: ')', token: 'delimiter.parenthesis.cbs' },
      { open: '[', close: ']', token: 'delimiter.square.cbs' },
    ],
    tokenizer: {
      root: [
        [/\{\{\s*\/\s*[a-z_][\w-]*/, 'keyword.control.cbs'],
        [/\{\{\s*#\s*[a-z_][\w-]*/, 'keyword.control.cbs'],
        [/\{\{\s*:else\s*\}\}/, 'keyword.control.cbs'],
        [/\{\{\s*\/\s*\}\}/, 'keyword.control.cbs'],
        [/\{\{\s*\/\s*[a-z_][\w-]*\s*\}\}/, 'keyword.control.cbs'],
        [/\{\{\s*\/\//, { token: 'comment.cbs', next: '@cbsComment' }],
        [/\{\{\s*\?/, { token: 'keyword.operator.cbs', next: '@cbsMacro' }],
        [/\{\{/, { token: 'delimiter.bracket.cbs', next: '@cbsMacro' }],
      ],
      cbsComment: [
        [/\}\}/, { token: 'comment.cbs', next: '@pop' }],
        [/[^}]+/, 'comment.cbs'],
        [/./, 'comment.cbs'],
      ],
      cbsMacro: [
        [/\}\}/, { token: 'delimiter.bracket.cbs', next: '@pop' }],
        [/\{\{\s*\/\//, { token: 'comment.cbs', next: '@cbsComment' }],
        [/\{\{\s*\?/, { token: 'keyword.operator.cbs', next: '@push' }],
        [/\{\{/, { token: 'delimiter.bracket.cbs', next: '@push' }],
        [/(::)/, 'delimiter.cbs'],
        [/(#|\/|:else)\b/, 'keyword.control.cbs'],
        [/\b(?:and|or|not|is|isnot|contains|startswith|endswith)\b/, 'keyword.operator.cbs'],
        [/[=!<>]=?|&&|\|\||[+\-*/%]/, 'operator.cbs'],
        [/-?\d+(?:\.\d+)?\b/, 'number.cbs'],
        [/"(?:[^"\\]|\\.)*"/, 'string.cbs'],
        [/'(?:[^'\\]|\\.)*'/, 'string.cbs'],
        [/\b(?:true|false|null|undefined)\b/, 'constant.language.cbs'],
        [/\b(?:getvar|getglobalvar|gettempvar|setvar|setglobalvar|settempvar|addvar|addglobalvar|addtempvar|tempvar|metadata|call)\b/, 'variable.predefined.cbs'],
        [/[a-z_][\w-]*(?=\s*(?:::|\}\}|\s|\)))/, 'entity.name.function.cbs'],
        [/[A-Z_][\w-]*/, 'variable.cbs'],
        [/[()\[\],]/, 'delimiter.cbs'],
        [/\s+/, 'white'],
        [/./, 'source.cbs'],
      ],
    },
  };
}

/**
 * createMainEditorCbsLanguageConfiguration 함수.
 * CBS macro bracket pair와 quote auto-close 설정을 제공함.
 *
 * @returns Monaco language configuration
 */
export function createMainEditorCbsLanguageConfiguration(): monaco.languages.LanguageConfiguration {
  return {
    brackets: [
      ['{{', '}}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{{', close: '}}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '{{', close: '}}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  };
}

/**
 * retainMainEditorCbsLanguage 함수.
 * `risu-cbs-content` Monaco language/tokenizer 등록을 참조 카운트로 유지함.
 *
 * @param monacoApi - Monaco editor API
 * @returns 등록 참조를 해제하는 disposable
 */
export function retainMainEditorCbsLanguage(monacoApi: typeof monaco): monaco.IDisposable {
  retainCount += 1;
  if (!registeredLanguage) {
    monacoApi.languages.register({ id: MAIN_EDITOR_CBS_LANGUAGE_ID });
    registeredLanguage = true;
  }

  if (!tokenizerDisposable) {
    tokenizerDisposable = monacoApi.languages.setMonarchTokensProvider(
      MAIN_EDITOR_CBS_LANGUAGE_ID,
      createMainEditorCbsMonarchLanguage(),
    );
  }

  if (!configurationDisposable) {
    configurationDisposable = monacoApi.languages.setLanguageConfiguration(
      MAIN_EDITOR_CBS_LANGUAGE_ID,
      createMainEditorCbsLanguageConfiguration(),
    );
  }

  let disposed = false;
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      retainCount = Math.max(0, retainCount - 1);
      if (retainCount > 0) return;

      tokenizerDisposable?.dispose();
      tokenizerDisposable = undefined;
      configurationDisposable?.dispose();
      configurationDisposable = undefined;
    },
  };
}
