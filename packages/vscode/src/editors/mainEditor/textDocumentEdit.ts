/**
 * Main editor text replacement helpers.
 * @file packages/vscode/src/editors/mainEditor/textDocumentEdit.ts
 */

import type * as vscodeTypes from 'vscode';

declare const require: NodeJS.Require;

export interface MinimalTextReplacement {
  startOffset: number;
  endOffset: number;
  replacement: string;
}

/**
 * computeMinimalTextReplacement 함수.
 * 현재 문서와 다음 문서 사이의 최소 치환 span을 계산함.
 *
 * @param currentText - 현재 TextDocument 원문
 * @param nextText - webview draft에서 전달된 다음 원문
 * @returns 변경이 없으면 null, 변경이 있으면 offset 기반 치환 정보
 */
export function computeMinimalTextReplacement(currentText: string, nextText: string): MinimalTextReplacement | null {
  if (currentText === nextText) return null;

  let startOffset = 0;
  const currentLength = currentText.length;
  const nextLength = nextText.length;
  const sharedLength = Math.min(currentLength, nextLength);

  while (startOffset < sharedLength && currentText[startOffset] === nextText[startOffset]) {
    startOffset += 1;
  }

  let currentEndOffset = currentLength;
  let nextEndOffset = nextLength;
  while (
    currentEndOffset > startOffset &&
    nextEndOffset > startOffset &&
    currentText[currentEndOffset - 1] === nextText[nextEndOffset - 1]
  ) {
    currentEndOffset -= 1;
    nextEndOffset -= 1;
  }

  return {
    startOffset,
    endOffset: currentEndOffset,
    replacement: nextText.slice(startOffset, nextEndOffset),
  };
}

/**
 * createWorkspaceEditForTextReplacement 함수.
 * offset 기반 치환 정보를 VS Code WorkspaceEdit으로 변환함.
 *
 * @param document - 변경할 canonical TextDocument
 * @param replacement - offset 기반 치환 정보
 * @returns 적용 가능한 WorkspaceEdit
 */
export function createWorkspaceEditForTextReplacement(
  document: vscodeTypes.TextDocument,
  replacement: MinimalTextReplacement,
): vscodeTypes.WorkspaceEdit {
  const vscode: typeof vscodeTypes = require('vscode');
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(document.positionAt(replacement.startOffset), document.positionAt(replacement.endOffset)),
    replacement.replacement,
  );
  return edit;
}
