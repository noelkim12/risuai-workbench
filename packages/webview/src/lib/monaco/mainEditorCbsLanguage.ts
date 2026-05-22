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
let foldingDisposable: monaco.IDisposable | undefined;

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

const CBS_BLOCK_OPEN_LINE_PATTERN = /\{\{\s*#\s*([a-z_][\w-]*)/i;
const CBS_BLOCK_CLOSE_LINE_PATTERN = /\{\{\s*\/\s*([a-z_][\w-]*)\s*\}\}/i;
const CBS_BLOCK_ANON_CLOSE_LINE_PATTERN = /\{\{\s*\/\s*\}\}/;

/**
 * createMainEditorCbsFoldingProvider 함수.
 * CBS block opener/closer 쌍을 Monaco folding range로 변환함.
 * Nested 블록은 stack 기반으로 정확히 매칭함.
 *
 * @returns Monaco folding range provider
 */
export function createMainEditorCbsFoldingProvider(): monaco.languages.FoldingRangeProvider {
  return {
    provideFoldingRanges(model): monaco.languages.FoldingRange[] {
      const ranges: monaco.languages.FoldingRange[] = [];
      const stack: Array<{ name: string; startLine: number }> = [];
      const lineCount = model.getLineCount();

      for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
        const lineContent = model.getLineContent(lineNumber);

        const openMatch = CBS_BLOCK_OPEN_LINE_PATTERN.exec(lineContent);
        if (openMatch) {
          stack.push({ name: openMatch[1].toLowerCase(), startLine: lineNumber });
        }

        const closeMatch = CBS_BLOCK_CLOSE_LINE_PATTERN.exec(lineContent);
        if (closeMatch) {
          const closeName = closeMatch[1].toLowerCase();
          while (stack.length > 0) {
            const top = stack.pop()!;
            if (top.startLine < lineNumber) {
              ranges.push({
                start: top.startLine,
                end: lineNumber,
              });
            }
            if (top.name === closeName) break;
          }
        }

        const anonCloseMatch = CBS_BLOCK_ANON_CLOSE_LINE_PATTERN.exec(lineContent);
        if (anonCloseMatch && stack.length > 0) {
          const top = stack.pop()!;
          if (top.startLine < lineNumber) {
            ranges.push({
              start: top.startLine,
              end: lineNumber,
            });
          }
        }
      }

      return ranges;
    },
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

  if (!foldingDisposable) {
    foldingDisposable = monacoApi.languages.registerFoldingRangeProvider(
      MAIN_EDITOR_CBS_LANGUAGE_ID,
      createMainEditorCbsFoldingProvider(),
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
      foldingDisposable?.dispose();
      foldingDisposable = undefined;
    },
  };
}
