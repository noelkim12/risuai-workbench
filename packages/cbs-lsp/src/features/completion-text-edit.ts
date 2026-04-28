/**
 * CBS completion item textEdit 범위 계산 유틸 모음.
 * @file packages/cbs-lsp/src/features/completion-text-edit.ts
 */
import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';

import type { CompletionTriggerContext } from '../core';

/** completion textEdit에 적용할 fragment-local 교체 계획. */
export interface CompletionTextEditPlan {
  startOffset: number;
  endOffset: number;
  newText: string;
}

/** Full macro snippet filterText prefix 추출에 쓰는 정규식. */
export const FULL_MACRO_FILTER_TEXT_PATTERN = /^\{\{[^\s:}]+/;

/** start/end fragment offset을 갖는 completion trigger context. */
export type RangedCompletionTriggerContext = Extract<
  CompletionTriggerContext,
  { startOffset: number; endOffset: number }
>;

/**
 * normalizeCompletionTextEditNewText 함수.
 * 기존 context range를 그대로 쓰는 completion의 삽입 텍스트만 context에 맞게 다듬음.
 *
 * @param item - textEdit newText를 만들 completion item
 * @param context - 현재 completion trigger context
 * @returns range 교체에 사용할 newText
 */
export function normalizeCompletionTextEditNewText(
  item: CompletionItem,
  context: CompletionTriggerContext,
): string {
  const newText = item.insertText ?? item.label;
  if (
    context.type === 'block-functions' &&
    item.kind === CompletionItemKind.Class &&
    context.prefix.startsWith('#') &&
    newText.startsWith('#')
  ) {
    return newText.slice(1);
  }

  if (
    context.type === 'block-functions' &&
    item.kind === CompletionItemKind.Snippet &&
    newText.startsWith('{{')
  ) {
    return newText.slice(2);
  }

  return newText;
}

/**
 * createCompletionTextEditPlan 함수.
 * completion item별 fragment-local replacement 범위와 삽입 텍스트를 계산함.
 *
 * @param item - textEdit를 붙일 completion item
 * @param context - 현재 completion trigger context
 * @param fragmentText - range 계산 기준이 되는 fragment-local 원문
 * @returns item에 적용할 replacement offset과 newText
 */
export function createCompletionTextEditPlan(
  item: CompletionItem,
  context: RangedCompletionTriggerContext,
  fragmentText: string,
): CompletionTextEditPlan {
  const newText = item.insertText ?? item.label;
  if (isFullMacroSnippetCompletion(item, newText)) {
    const replacementStartOffset = findFullMacroSnippetReplacementStartOffset(
      fragmentText,
      context,
    );
    if (replacementStartOffset !== null) {
      return {
        startOffset: replacementStartOffset,
        endOffset: getFullMacroSnippetReplacementEndOffset(fragmentText, context.endOffset),
        newText,
      };
    }
  }

  if (
    context.type !== 'block-functions' ||
    item.kind !== CompletionItemKind.Snippet ||
    !newText.startsWith('{{')
  ) {
    return {
      startOffset: context.startOffset,
      endOffset: context.endOffset,
      newText: normalizeCompletionTextEditNewText(item, context),
    };
  }

  const replacementStartOffset = findBlockSnippetReplacementStartOffset(fragmentText, context);
  if (replacementStartOffset === null) {
    return {
      startOffset: context.startOffset,
      endOffset: context.endOffset,
      newText: normalizeCompletionTextEditNewText(item, context),
    };
  }

  return {
    startOffset: replacementStartOffset,
    endOffset: getBlockSnippetReplacementEndOffset(fragmentText, context.endOffset),
    newText,
  };
}

/**
 * isFullMacroSnippetCompletion 함수.
 * `{{...}}` 전체를 포함하는 snippet completion인지 판별함.
 *
 * @param item - completion item
 * @param newText - item이 삽입하려는 실제 문자열
 * @returns full CBS macro snippet이면 true
 */
export function isFullMacroSnippetCompletion(
  item: CompletionItem,
  newText: string | number,
): newText is string {
  return (
    item.insertTextFormat === InsertTextFormat.Snippet &&
    typeof newText === 'string' &&
    newText.startsWith('{{')
  );
}

/**
 * findFullMacroSnippetReplacementStartOffset 함수.
 * full macro snippet이 기존 `{{...}}` 전체를 교체하도록 여는 `{{` 위치를 찾음.
 *
 * @param fragmentText - fragment-local 원문
 * @param context - completion trigger context
 * @returns replacement 시작 offset 또는 찾지 못한 경우 null
 */
export function findFullMacroSnippetReplacementStartOffset(
  fragmentText: string,
  context: RangedCompletionTriggerContext,
): number | null {
  const searchEndOffset = Math.max(0, Math.min(context.startOffset, fragmentText.length));
  const openBraceOffset = fragmentText.lastIndexOf('{{', searchEndOffset);
  if (openBraceOffset === -1) {
    return null;
  }

  const prefix = fragmentText.slice(openBraceOffset, context.endOffset);
  if (!prefix.startsWith('{{')) {
    return null;
  }

  return openBraceOffset;
}

/**
 * getFullMacroSnippetReplacementEndOffset 함수.
 * cursor 뒤에 자동 삽입된 `}}`가 있으면 full snippet 교체 범위에 포함함.
 *
 * @param fragmentText - fragment-local 원문
 * @param contextEndOffset - 기존 completion context 종료 offset
 * @returns replacement 종료 offset
 */
export function getFullMacroSnippetReplacementEndOffset(
  fragmentText: string,
  contextEndOffset: number,
): number {
  if (fragmentText.slice(contextEndOffset, contextEndOffset + 2) === '}}') {
    return contextEndOffset + 2;
  }

  return contextEndOffset;
}

/**
 * findBlockSnippetReplacementStartOffset 함수.
 * block snippet이 기존 `{{#...}}` header 전체를 갈아끼울 수 있도록 여는 `{{` 위치를 찾음.
 *
 * @param fragmentText - fragment-local 원문
 * @param context - block-functions completion context
 * @returns snippet replacement 시작 offset 또는 찾지 못한 경우 null
 */
export function findBlockSnippetReplacementStartOffset(
  fragmentText: string,
  context: RangedCompletionTriggerContext,
): number | null {
  const searchEndOffset = Math.max(0, Math.min(context.startOffset, fragmentText.length));
  const openBraceOffset = fragmentText.lastIndexOf('{{', searchEndOffset);
  if (openBraceOffset === -1) {
    return null;
  }

  const headerPrefix = fragmentText.slice(openBraceOffset + 2, context.endOffset);
  if (!headerPrefix.startsWith('#')) {
    return null;
  }

  return openBraceOffset;
}

/**
 * getBlockSnippetReplacementEndOffset 함수.
 * cursor 직후 auto-close `}}`가 있으면 snippet 교체 범위에 포함함.
 *
 * @param fragmentText - fragment-local 원문
 * @param contextEndOffset - 기존 completion context 종료 offset
 * @returns snippet replacement 종료 offset
 */
export function getBlockSnippetReplacementEndOffset(
  fragmentText: string,
  contextEndOffset: number,
): number {
  if (fragmentText.slice(contextEndOffset, contextEndOffset + 2) === '}}') {
    return contextEndOffset + 2;
  }

  return contextEndOffset;
}
