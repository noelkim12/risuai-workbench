/**
 * CBS 자동 suggestion 트리거 보조 유틸.
 * @file packages/vscode/src/completion/cbsAutoSuggest.ts
 */

import * as vscode from 'vscode';
import { shouldTriggerCbsAutoSuggest } from './cbsAutoSuggestCore';

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
      const activePosition = editor.selection.active;
      const linePrefix = event.document.getText(
        new vscode.Range(new vscode.Position(activePosition.line, 0), activePosition),
      );

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
