/**
 * Main Editor Monaco lorebook decorator auto-suggest helpers.
 * @file packages/webview/src/lib/monaco/mainEditorLorebookDecoratorAutoSuggest.ts
 */

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import {
  getLorebookDecoratorCompletionCandidates,
  getLorebookDecoratorCompletionContext,
  type LorebookDecoratorCompletionCandidate,
} from '@risuai-workbench/core/cbs-browser';
import { getMainEditorChangeEndPosition } from './mainEditorCbsAutoSuggest';

interface LorebookDecoratorSuggestInput {
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

export interface MainEditorLorebookDecoratorCompletionContext {
  prefix: string;
  lineNumber: number;
  startColumn: number;
  endColumn: number;
}

/**
 * shouldTriggerMainEditorLorebookDecoratorAutoSuggest 함수.
 * Monaco content change가 lorebook decorator suggest widget을 열어야 하는지 판단함.
 *
 * @param input - 방금 입력된 텍스트와 커서 앞 line prefix
 * @returns decorator suggest widget을 강제로 열어야 하면 true
 */
export function shouldTriggerMainEditorLorebookDecoratorAutoSuggest(input: LorebookDecoratorSuggestInput): boolean {
  if (!input.insertedText.includes('@')) return false;
  return getLorebookDecoratorCompletionContext(input.linePrefix, input.linePrefix.length) !== null;
}

/**
 * shouldTriggerMainEditorLorebookDecoratorSuggestForChange 함수.
 * Monaco change event 한 건을 post-change line prefix로 변환해 decorator suggest trigger 여부를 계산함.
 *
 * @param model - 변경이 반영된 Monaco model
 * @param change - Monaco content change 한 건
 * @returns 해당 변경이 decorator suggest를 열어야 하면 true
 */
export function shouldTriggerMainEditorLorebookDecoratorSuggestForChange(model: MonacoLineModelLike, change: MonacoChangeLike): boolean {
  const position = getMainEditorChangeEndPosition(change);
  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  return shouldTriggerMainEditorLorebookDecoratorAutoSuggest({ insertedText: change.text, linePrefix });
}

/**
 * getMainEditorLorebookDecoratorCompletionContext 함수.
 * 현재 cursor가 line-leading `@@` decorator completion 위치인지 판별함.
 *
 * @param model - 현재 Monaco model
 * @param position - completion 요청 position
 * @returns decorator completion context 또는 null
 */
export function getMainEditorLorebookDecoratorCompletionContext(
  model: MonacoLineModelLike,
  position: { lineNumber: number; column: number },
): MainEditorLorebookDecoratorCompletionContext | null {
  const line = model.getLineContent(position.lineNumber);
  const cursorOffset = Math.max(0, position.column - 1);
  const context = getLorebookDecoratorCompletionContext(line, cursorOffset);
  if (!context) return null;

  return {
    prefix: context.prefix,
    lineNumber: position.lineNumber,
    startColumn: context.tokenStart + 1,
    endColumn: context.tokenEnd + 1,
  };
}

/**
 * createMainEditorLorebookDecoratorCompletionItems 함수.
 * Core decorator metadata를 Monaco completion item으로 변환함.
 *
 * @param monacoApi - Monaco editor API
 * @param model - completion을 요청한 Monaco model
 * @param position - completion 요청 position
 * @returns lorebook decorator completion 후보
 */
export function createMainEditorLorebookDecoratorCompletionItems(
  monacoApi: typeof monaco,
  model: MonacoLineModelLike,
  position: monaco.Position,
): monaco.languages.CompletionItem[] {
  const context = getMainEditorLorebookDecoratorCompletionContext(model, position);
  if (!context) return [];

  const range = new monacoApi.Range(context.lineNumber, context.startColumn, context.lineNumber, context.endColumn);
  return getLorebookDecoratorCompletionCandidates(context.prefix).map((candidate) => createCompletionItem(monacoApi, candidate, range));
}

/**
 * registerMainEditorLorebookDecoratorCompletionProvider 함수.
 * LSP 준비 상태와 무관하게 line-leading `@@` decorator 후보를 Monaco에 등록함.
 *
 * @param monacoApi - Monaco editor API
 * @param languageId - CONTENT editor language id
 * @returns provider 등록을 해제하는 disposable
 */
export function registerMainEditorLorebookDecoratorCompletionProvider(monacoApi: typeof monaco, languageId: string): monaco.IDisposable {
  return monacoApi.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['@'],
    provideCompletionItems(model, position) {
      return {
        incomplete: false,
        suggestions: createMainEditorLorebookDecoratorCompletionItems(monacoApi, model, position),
      };
    },
  });
}

function createCompletionItem(
  monacoApi: typeof monaco,
  candidate: LorebookDecoratorCompletionCandidate,
  range: monaco.IRange,
): monaco.languages.CompletionItem {
  return {
    label: candidate.label,
    kind: monacoApi.languages.CompletionItemKind.Keyword,
    insertText: candidate.insertText,
    detail: `${candidate.supportLevel} decorator — ${candidate.detail}`,
    documentation: candidate.documentationMarkdown,
    sortText: candidate.sortText,
    range,
  };
}
