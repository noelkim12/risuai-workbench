/**
 * CBS 자동 suggestion 트리거 보조 유틸.
 * @file packages/vscode/src/completion/cbsAutoSuggest.ts
 */

import * as vscode from 'vscode';
import { getCbsAutoCloseText, shouldTriggerCbsAutoSuggest } from './cbsAutoSuggestCore';

/**
 * getChangedRangeEndPosition 함수.
 * VS Code text change 한 건이 적용된 뒤의 끝 위치를 계산함.
 *
 * @param change - prefix를 계산할 문서 변경 이벤트 항목
 * @returns 변경 텍스트가 끝나는 post-change 문서 위치
 */
function getChangedRangeEndPosition(
  change: vscode.TextDocumentContentChangeEvent,
): vscode.Position {
  const insertedLines = change.text.split(/\r\n|\r|\n/);
  const lastInsertedLine = insertedLines[insertedLines.length - 1] ?? '';

  if (insertedLines.length === 1) {
    return change.range.start.translate(0, lastInsertedLine.length);
  }

  return new vscode.Position(
    change.range.start.line + insertedLines.length - 1,
    lastInsertedLine.length,
  );
}

/**
 * getLinePrefixAtPosition 함수.
 * 지정 위치 앞의 한 줄 prefix만 추출해 CBS trigger predicate에 전달함.
 *
 * @param document - 변경이 반영된 VS Code 문서
 * @param position - prefix 끝점으로 사용할 문서 위치
 * @returns 같은 줄 시작부터 position 직전까지의 텍스트
 */
function getLinePrefixAtPosition(document: vscode.TextDocument, position: vscode.Position): string {
  return document.getText(new vscode.Range(new vscode.Position(position.line, 0), position));
}

/**
 * getLineSuffixAtPosition 함수.
 * 지정 위치 뒤의 한 줄 suffix만 추출해 CBS auto-close 중복 삽입을 방지함.
 *
 * @param document - 변경이 반영된 VS Code 문서
 * @param position - suffix 시작점으로 사용할 문서 위치
 * @returns position부터 같은 줄 끝까지의 텍스트
 */
function getLineSuffixAtPosition(document: vscode.TextDocument, position: vscode.Position): string {
  const line = document.lineAt(position.line);

  return document.getText(new vscode.Range(position, line.range.end));
}

/**
 * registerCbsAutoSuggestTrigger 함수.
 * `{{` 입력 직후 VS Code suggest widget을 명시적으로 열어 다문자 CBS prefix를 보완함.
 *
 * @param context - extension lifecycle disposable을 보관할 VS Code context
 */
export function registerCbsAutoSuggestTrigger(context: vscode.ExtensionContext): void {
  const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== event.document) {
      return;
    }

    for (const change of event.contentChanges) {
      const changeEndPosition = getChangedRangeEndPosition(change);
      const linePrefix = getLinePrefixAtPosition(event.document, changeEndPosition);
      const lineSuffix = getLineSuffixAtPosition(event.document, changeEndPosition);

      const autoCloseText = getCbsAutoCloseText({
        insertedText: change.text,
        languageId: event.document.languageId,
        linePrefix,
        lineSuffix,
      });
      if (autoCloseText) {
        void editor.insertSnippet(
          new vscode.SnippetString(`$0${autoCloseText}`),
          changeEndPosition,
        );

        return;
      }

      if (
        shouldTriggerCbsAutoSuggest({
          insertedText: change.text,
          languageId: event.document.languageId,
          linePrefix,
        })
      ) {
        void vscode.commands.executeCommand('editor.action.triggerSuggest');
        setTimeout(() => {
          void vscode.commands.executeCommand('editor.action.triggerSuggest');
        }, 0);
        return;
      }
    }
  });

  context.subscriptions.push(disposable);
}
