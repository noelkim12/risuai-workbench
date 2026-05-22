/**
 * Main Editor Monaco CBS auto-suggest helpers.
 * @file packages/webview/src/lib/monaco/mainEditorCbsAutoSuggest.ts
 */

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import { CBSBuiltinRegistry, type CBSBuiltinFunction } from 'risu-workbench-core/cbs-browser';

interface CbsSuggestInput {
  insertedText: string;
  linePrefix: string;
}

interface MonacoChangeLike {
  range: { startLineNumber: number; startColumn: number };
  text: string;
}

interface MonacoLineModelLike {
  getLineContent(lineNumber: number): string;
}

interface MonacoSuggestActionLike {
  run(): void | Promise<void>;
}

interface MonacoSuggestEditorLike {
  focus(): void;
  getAction(actionId: string): MonacoSuggestActionLike | null | undefined;
  trigger(source: string, handlerId: string, payload: unknown): void;
}

export interface MainEditorRootCompletionContext {
  kind: 'all-functions' | 'block-functions';
  prefix: string;
  lineNumber: number;
  startColumn: number;
  endColumn: number;
}

const CBS_ARGUMENT_COMPLETION_PREFIX_PATTERN = /\{\{\s*(?:getvar|setvar|addvar|gettempvar|settempvar|tempvar|metadata|call)::[^{}]*$/i;
const CBS_WHEN_BLOCK_OPEN_PATTERN = /^\{\{\s*#when(?=$|[\s:}])/i;
const CBS_ROOT_PREFIX_PATTERN = /^#?[a-z_]*$/i;
const builtinRegistry = new CBSBuiltinRegistry();

/**
 * shouldTriggerMainEditorCbsAutoSuggest 함수.
 * Monaco content change가 CBS suggest widget을 명시적으로 열어야 하는지 판단함.
 *
 * @param input - 방금 입력된 텍스트와 커서 앞 line prefix
 * @returns suggest widget을 강제로 열어야 하면 true
 */
export function shouldTriggerMainEditorCbsAutoSuggest(input: CbsSuggestInput): boolean {
  if (input.insertedText.includes('{') && input.linePrefix.endsWith('{{')) {
    return true;
  }

  return (
    input.insertedText.includes(':') &&
    (CBS_ARGUMENT_COMPLETION_PREFIX_PATTERN.test(input.linePrefix) || hasOpenCbsWhenArgumentPrefix(input.linePrefix))
  );
}

/**
 * shouldTriggerMainEditorCbsSuggestForChange 함수.
 * Monaco change event 한 건을 post-change line prefix로 변환해 CBS suggest trigger 여부를 계산함.
 *
 * @param model - 변경이 반영된 Monaco model
 * @param change - Monaco content change 한 건
 * @returns 해당 변경이 CBS suggest를 열어야 하면 true
 */
export function shouldTriggerMainEditorCbsSuggestForChange(model: MonacoLineModelLike, change: MonacoChangeLike): boolean {
  const position = getMainEditorChangeEndPosition(change);
  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  return shouldTriggerMainEditorCbsAutoSuggest({ insertedText: change.text, linePrefix });
}

/**
 * getMainEditorChangeEndPosition 함수.
 * Monaco content change가 적용된 뒤 삽입 텍스트 끝 position을 계산함.
 *
 * @param change - Monaco content change 한 건
 * @returns one-based Monaco position
 */
export function getMainEditorChangeEndPosition(change: MonacoChangeLike): { lineNumber: number; column: number } {
  const insertedLines = change.text.split(/\r\n|\r|\n/);
  const lastInsertedLine = insertedLines[insertedLines.length - 1] ?? '';

  if (insertedLines.length === 1) {
    return {
      lineNumber: change.range.startLineNumber,
      column: change.range.startColumn + lastInsertedLine.length,
    };
  }

  return {
    lineNumber: change.range.startLineNumber + insertedLines.length - 1,
    column: lastInsertedLine.length + 1,
  };
}

/**
 * getMainEditorRootCompletionContext 함수.
 * 현재 cursor가 `{{` 또는 `{{#` root function completion 위치인지 판별함.
 *
 * @param model - 현재 Monaco model
 * @param position - completion 요청 position
 * @returns root completion context 또는 null
 */
export function getMainEditorRootCompletionContext(
  model: MonacoLineModelLike,
  position: { lineNumber: number; column: number },
): MainEditorRootCompletionContext | null {
  const line = model.getLineContent(position.lineNumber);
  const prefixText = line.slice(0, Math.max(0, position.column - 1));
  const macroStartIndex = prefixText.lastIndexOf('{{');
  if (macroStartIndex === -1) return null;

  const typedPrefix = prefixText.slice(macroStartIndex + 2);
  if (typedPrefix.includes('::') || typedPrefix.includes('?') || typedPrefix.startsWith(':')) return null;
  if (!CBS_ROOT_PREFIX_PATTERN.test(typedPrefix) || typedPrefix.startsWith('/')) return null;

  const suffix = line.slice(position.column - 1);
  return {
    kind: typedPrefix.startsWith('#') ? 'block-functions' : 'all-functions',
    prefix: typedPrefix,
    lineNumber: position.lineNumber,
    startColumn: macroStartIndex + 1,
    endColumn: suffix.startsWith('}}') ? position.column + 2 : position.column,
  };
}

/**
 * createMainEditorRootCompletionItems 함수.
 * Host TextDocument debounce와 무관하게 `{{` root function 후보를 즉시 생성함.
 *
 * @param monacoApi - Monaco editor API
 * @param model - completion을 요청한 Monaco model
 * @param position - completion 요청 position
 * @returns CBS builtin 기반 root completion 후보
 */
export function createMainEditorRootCompletionItems(
  monacoApi: typeof monaco,
  model: MonacoLineModelLike,
  position: monaco.Position,
): monaco.languages.CompletionItem[] {
  const context = getMainEditorRootCompletionContext(model, position);
  if (!context) return [];

  const range = new monacoApi.Range(context.lineNumber, context.startColumn, context.lineNumber, context.endColumn);
  return filterBuiltinFunctions(context).map((builtin) => ({
    label: builtin.name,
    kind: builtin.isBlock ? monacoApi.languages.CompletionItemKind.Snippet : monacoApi.languages.CompletionItemKind.Function,
    insertText: createBuiltinInsertText(builtin),
    insertTextRules: createBuiltinInsertTextRules(monacoApi, builtin),
    filterText: createBuiltinFilterText(builtin),
    detail: `${builtin.category} CBS function`,
    documentation: builtin.description,
    range,
  }));
}

/**
 * registerMainEditorCbsRootCompletionProvider 함수.
 * LSP 준비 상태와 무관하게 `{{` root CBS 후보를 Monaco에 등록함.
 *
 * @param monacoApi - Monaco editor API
 * @param languageId - CONTENT editor language id
 * @returns provider 등록을 해제하는 disposable
 */
export function registerMainEditorCbsRootCompletionProvider(monacoApi: typeof monaco, languageId: string): monaco.IDisposable {
  return monacoApi.languages.registerCompletionItemProvider(languageId, {
    provideCompletionItems(model, position) {
      return {
        incomplete: false,
        suggestions: createMainEditorRootCompletionItems(monacoApi, model, position),
      };
    },
  });
}

/**
 * triggerMainEditorCbsSuggest 함수.
 * CBS prefix 감지 후 Monaco suggest action을 즉시 실행함.
 *
 * @param editor - suggest widget을 열 Monaco editor instance
 */
export function triggerMainEditorCbsSuggest(editor: MonacoSuggestEditorLike): void {
  editor.focus();
  const suggestAction = editor.getAction('editor.action.triggerSuggest');
  if (suggestAction) {
    void suggestAction.run();
    return;
  }

  editor.trigger('main-editor-cbs-auto-suggest', 'editor.action.triggerSuggest', {});
}

function hasOpenCbsWhenArgumentPrefix(linePrefix: string): boolean {
  let whenOpenIndex = linePrefix.lastIndexOf('{{#when');
  if (whenOpenIndex === -1) whenOpenIndex = linePrefix.lastIndexOf('{{ #when');
  if (whenOpenIndex === -1) return false;

  const whenPrefix = linePrefix.slice(whenOpenIndex);
  if (!CBS_WHEN_BLOCK_OPEN_PATTERN.test(whenPrefix)) return false;

  let depth = 0;
  for (let index = 0; index < whenPrefix.length; index += 1) {
    const pair = whenPrefix.slice(index, index + 2);
    if (pair === '{{') {
      depth += 1;
      index += 1;
      continue;
    }
    if (pair === '}}') {
      depth = Math.max(0, depth - 1);
      index += 1;
    }
  }

  return depth > 0 && whenPrefix.includes('::');
}

function filterBuiltinFunctions(context: MainEditorRootCompletionContext): CBSBuiltinFunction[] {
  const rawPrefix = context.kind === 'block-functions' && context.prefix.startsWith('#') ? context.prefix.slice(1) : context.prefix;
  const normalizedPrefix = rawPrefix.toLowerCase();
  return builtinRegistry.getAll().filter((builtin) => {
    if (builtin.internalOnly) return false;
    if (context.kind === 'block-functions' && !builtin.isBlock) return false;
    const name = context.kind === 'block-functions' && builtin.name.startsWith('#') ? builtin.name.slice(1) : builtin.name;
    return name.toLowerCase().startsWith(normalizedPrefix) || builtin.aliases.some((alias) => alias.toLowerCase().startsWith(normalizedPrefix));
  });
}

function createBuiltinInsertText(builtin: CBSBuiltinFunction): string {
  if (builtin.arguments.length === 0) return `{{${builtin.name}}}`;
  if (builtin.isBlock) {
    const name = builtin.name.startsWith('#') ? builtin.name.slice(1) : builtin.name;
    const argumentPlaceholders = builtin.arguments.map((argument, index) => createSnippetPlaceholder(argument.name, index + 1));
    const headerSuffix = argumentPlaceholders.length > 0 ? ` ${argumentPlaceholders.join(' ')}` : '';
    return `{{#${name}${headerSuffix}}}\n\t$${builtin.arguments.length + 1}\n{{/${name}}}`;
  }
  const argumentPlaceholders = builtin.arguments.map((argument, index) => createSnippetPlaceholder(argument.name, index + 1));
  return `{{${builtin.name}::${argumentPlaceholders.join('::')}}}`;
}

function createBuiltinInsertTextRules(monacoApi: typeof monaco, builtin: CBSBuiltinFunction): monaco.languages.CompletionItemInsertTextRule | undefined {
  if (builtin.arguments.length === 0 && !builtin.isBlock) return undefined;
  return monacoApi.languages.CompletionItemInsertTextRule.InsertAsSnippet | monacoApi.languages.CompletionItemInsertTextRule.KeepWhitespace;
}

function createSnippetPlaceholder(argumentName: string, tabStop: number): string {
  return `\${${tabStop}:${escapeSnippetPlaceholder(argumentName)}}`;
}

function escapeSnippetPlaceholder(value: string): string {
  return value.replace(/[\\}$]/g, (character) => `\\${character}`);
}

function createBuiltinFilterText(builtin: CBSBuiltinFunction): string {
  return builtin.name.startsWith('#') ? `{{${builtin.name}` : `{{${builtin.name}`;
}
