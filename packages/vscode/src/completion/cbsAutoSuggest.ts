/**
 * CBS 자동 suggestion 트리거 보조 유틸.
 * @file packages/vscode/src/completion/cbsAutoSuggest.ts
 */

import * as vscode from 'vscode';
import {
  appendCbsLanguageClientOutputLine,
  getCbsLanguageClientRuntimeState,
} from '../lsp/cbsLanguageClient';
import {
  getCbsAutoCloseText,
  shouldSkipCbsAutoSuggestForDocument,
  shouldTriggerCbsAutoSuggest,
} from './cbsAutoSuggestCore';

/**
 * getCbsClientStateLabel 함수.
 * auto suggest 로그에 붙일 CBS LanguageClient 실행 상태를 짧게 정리함.
 *
 * @returns started/running 상태 요약 문자열
 */
function getCbsClientStateLabel(): string {
  const state = getCbsLanguageClientRuntimeState();
  return `clientStarted=${String(state.isStarted)} clientRunning=${String(state.client?.isRunning() ?? false)}`;
}

/**
 * logCbsAutoSuggest 함수.
 * CBS auto suggest fallback의 주요 분기를 Output channel에 남김.
 *
 * @param phase - auto suggest 처리 단계 이름
 * @param details - key=value 형태로 붙일 상세 정보
 */
function logCbsAutoSuggest(phase: string, details: Record<string, string | number | boolean>): void {
  const renderedDetails = Object.entries(details)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
  const suffix = renderedDetails ? ` ${renderedDetails}` : '';
  appendCbsLanguageClientOutputLine(`[CBS Client:autoSuggest] ${phase} ${getCbsClientStateLabel()}${suffix}`);
}

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
 * getDocumentLengthWithoutFullRead 함수.
 * full document 문자열 복사 없이 VS Code 문서 길이를 character offset 기준으로 계산함.
 *
 * @param document - 길이를 확인할 문서
 * @returns 문서 전체 character offset 길이
 */
function getDocumentLengthWithoutFullRead(document: vscode.TextDocument): number {
  if (document.lineCount === 0) {
    return 0;
  }

  return document.offsetAt(document.lineAt(document.lineCount - 1).range.end);
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
 * getDocumentSuffixAtPosition 함수.
 * 지정 위치 뒤의 문서 suffix를 추출해 다음 줄의 기존 close tag까지 확인함.
 *
 * @param document - 변경이 반영된 VS Code 문서
 * @param position - suffix 시작점으로 사용할 문서 위치
 * @returns position부터 문서 끝까지의 텍스트
 */
function getDocumentSuffixAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
): string {
  const lastLine = document.lineAt(document.lineCount - 1);

  return document.getText(new vscode.Range(position, lastLine.range.end));
}

/**
 * registerCbsAutoSuggestTrigger 함수.
 * `{{` 입력 직후 VS Code suggest widget을 명시적으로 열어 다문자 CBS prefix를 보완함.
 *
 * @param context - extension lifecycle disposable을 보관할 VS Code context
 */
export function registerCbsAutoSuggestTrigger(context: vscode.ExtensionContext): void {
  let pendingSuggestTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSuggestKey = '';

  /**
   * scheduleCbsSuggest 함수.
   * 동일 문서 버전 + 위치에서 중복 triggerSuggest를 방지하고 debounce 처리함.
   *
   * @param document - 변경이 반영된 VS Code 문서
   * @param position - suggestion을 트리거할 문서 위치
   */
  function scheduleCbsSuggest(document: vscode.TextDocument, position: vscode.Position): void {
    const key = `${document.uri.toString()}:${document.version}:${position.line}:${position.character}`;
    if (key === lastSuggestKey) {
      logCbsAutoSuggest('skip-duplicate', {
        character: position.character,
        languageId: document.languageId,
        line: position.line,
        version: document.version,
      });
      return;
    }
    lastSuggestKey = key;
    if (pendingSuggestTimer) {
      clearTimeout(pendingSuggestTimer);
    }
    pendingSuggestTimer = setTimeout(() => {
      pendingSuggestTimer = undefined;
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor || activeEditor.document !== document) {
        logCbsAutoSuggest('skip-inactive-editor', {
          character: position.character,
          languageId: document.languageId,
          line: position.line,
          version: document.version,
        });
        return;
      }
      if (!activeEditor.selection.active.isEqual(position)) {
        logCbsAutoSuggest('skip-selection-moved', {
          actualCharacter: activeEditor.selection.active.character,
          actualLine: activeEditor.selection.active.line,
          character: position.character,
          languageId: document.languageId,
          line: position.line,
          version: document.version,
        });
        return;
      }
      logCbsAutoSuggest('triggerSuggest', {
        character: position.character,
        languageId: document.languageId,
        line: position.line,
        version: document.version,
      });
      void vscode.commands.executeCommand('editor.action.triggerSuggest');
    }, 25);
    logCbsAutoSuggest('scheduled', {
      character: position.character,
      languageId: document.languageId,
      line: position.line,
      version: document.version,
    });
  }

  const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== event.document) {
      return;
    }

    if (
      shouldSkipCbsAutoSuggestForDocument({
        documentLength: getDocumentLengthWithoutFullRead(event.document),
        fileName: event.document.fileName,
        languageId: event.document.languageId,
      })
    ) {
      logCbsAutoSuggest('skip-oversized-risulua', {
        languageId: event.document.languageId,
        version: event.document.version,
      });
      return;
    }

    for (const change of event.contentChanges) {
      const changeEndPosition = getChangedRangeEndPosition(change);
      const linePrefix = getLinePrefixAtPosition(event.document, changeEndPosition);
      const lineSuffix = getLineSuffixAtPosition(event.document, changeEndPosition);
      const documentSuffix = getDocumentSuffixAtPosition(event.document, changeEndPosition);

      const autoCloseText = getCbsAutoCloseText({
        documentSuffix,
        fileName: event.document.fileName,
        insertedText: change.text,
        languageId: event.document.languageId,
        linePrefix,
        lineSuffix,
      });
      if (autoCloseText) {
        logCbsAutoSuggest('auto-close', {
          character: changeEndPosition.character,
          languageId: event.document.languageId,
          line: changeEndPosition.line,
          textLength: autoCloseText.length,
          version: event.document.version,
        });
        void editor.insertSnippet(
          new vscode.SnippetString(`$0${autoCloseText}`),
          changeEndPosition,
        );

        return;
      }

      if (
        shouldTriggerCbsAutoSuggest({
          fileName: event.document.fileName,
          insertedText: change.text,
          languageId: event.document.languageId,
          linePrefix,
        })
      ) {
        logCbsAutoSuggest('predicate-hit', {
          character: changeEndPosition.character,
          insertedLength: change.text.length,
          languageId: event.document.languageId,
          line: changeEndPosition.line,
          version: event.document.version,
        });
        scheduleCbsSuggest(event.document, changeEndPosition);
        return;
      }
    }
  });

  const wrappedDisposable = new vscode.Disposable(() => {
    if (pendingSuggestTimer) {
      clearTimeout(pendingSuggestTimer);
      pendingSuggestTimer = undefined;
    }
    disposable.dispose();
  });

  context.subscriptions.push(wrappedDisposable);
}
