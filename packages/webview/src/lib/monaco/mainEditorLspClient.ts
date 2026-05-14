/**
 * Main editor Monaco LSP proxy client.
 * @file packages/webview/src/lib/monaco/mainEditorLspClient.ts
 */

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import type {
  MainEditorExtensionMessage,
  MainEditorLspCompletionRequestMessage,
  MainEditorLspDefinitionRequestMessage,
  MainEditorLspHoverRequestMessage,
} from '../types';
import type {
  MainEditorLspCompletionResponsePayload,
  MainEditorLspDefinitionResponsePayload,
  MainEditorLspErrorPayload,
  MainEditorLspHoverResponsePayload,
  MainEditorSourceRangePayload,
} from '../types/mainEditor';
import {
  createMainEditorLspCompletionRequestMessage,
  createMainEditorLspDefinitionRequestMessage,
  createMainEditorLspHoverRequestMessage,
  createMainEditorLspRevealLocationMessage,
} from '../vscode/mainEditorMessages';
import type { VsCodeApi } from '../vscode';
import { getMainEditorRootCompletionContext } from './mainEditorCbsAutoSuggest';

const CBS_OCCURRENCE_NAVIGATION_COMMAND = 'risuWorkbench.cbs.openOccurrence';

interface PendingRequest {
  resolve: (value: MainEditorLspCompletionResponsePayload | MainEditorLspHoverResponsePayload | MainEditorLspDefinitionResponsePayload) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof window.setTimeout>;
}

type MainEditorLspRequestMessage =
  | MainEditorLspCompletionRequestMessage
  | MainEditorLspHoverRequestMessage
  | MainEditorLspDefinitionRequestMessage;

export interface MainEditorMonacoLspClientInput {
  vscode: VsCodeApi;
  documentUri: string;
  getDocumentVersion: () => number;
  getContentVersion: () => number;
  requestTimeoutMs?: number;
}

export interface MainEditorMonacoLspClient {
  handleMessage(message: MainEditorExtensionMessage): boolean;
  register(monacoApi: typeof monaco, languageId: string): monaco.IDisposable[];
  dispose(): void;
}

/**
 * createMainEditorMonacoLspClient 함수.
 * Monaco provider callback과 extension-host LSP bridge message를 연결함.
 *
 * @param input - VS Code webview API와 현재 문서 version getter
 * @returns Monaco provider 등록 및 response 처리 helper
 */
export function createMainEditorMonacoLspClient(input: MainEditorMonacoLspClientInput): MainEditorMonacoLspClient {
  const pending = new Map<string, PendingRequest>();

  function request<T extends MainEditorLspCompletionResponsePayload | MainEditorLspHoverResponsePayload | MainEditorLspDefinitionResponsePayload>(
    message: MainEditorLspRequestMessage,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pending.delete(message.payload.requestId);
        reject(new Error(`Main editor LSP request timed out: ${message.payload.requestId}`));
      }, input.requestTimeoutMs ?? 5000);
      pending.set(message.payload.requestId, {
        resolve: (value) => {
          window.clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error) => {
          window.clearTimeout(timeout);
          reject(error);
        },
        timeout,
      });
      input.vscode.postMessage(message);
    });
  }

  function handleMessage(message: MainEditorExtensionMessage): boolean {
    if (message.type === 'main-editor/lspCompletionResult' || message.type === 'main-editor/lspHoverResult' || message.type === 'main-editor/lspDefinitionResult') {
      const request = pending.get(message.payload.requestId);
      if (request) {
        request.resolve(message.payload);
        pending.delete(message.payload.requestId);
      }
      return true;
    }
    if (message.type === 'main-editor/lspError') {
      const payload: MainEditorLspErrorPayload = message.payload;
      const request = pending.get(payload.requestId);
      if (request) {
        request.reject(new Error(payload.message));
        pending.delete(payload.requestId);
      }
      return true;
    }
    return false;
  }

  function register(monacoApi: typeof monaco, languageId: string): monaco.IDisposable[] {
    return [
      monacoApi.languages.registerCompletionItemProvider(languageId, {
        triggerCharacters: ['{', ':', '#', '/', '?', '<', '"'],
        async provideCompletionItems(model, position, context) {
          if (getMainEditorRootCompletionContext(model, position)) {
            return { incomplete: false, suggestions: [] };
          }
          let result: MainEditorLspCompletionResponsePayload | undefined;
          try {
            result = await request<MainEditorLspCompletionResponsePayload>(
              createMainEditorLspCompletionRequestMessage({
                requestId: createRequestId('completion'),
                documentUri: input.documentUri,
                documentVersion: input.getDocumentVersion(),
                sectionName: 'CONTENT',
                contentVersion: input.getContentVersion(),
                position: { lineNumber: position.lineNumber, column: position.column },
                triggerCharacter: context.triggerCharacter,
              }),
            );
          } catch (error) {
            throw error;
          }
          return {
            incomplete: result.incomplete,
            suggestions: result.items.map((item) => ({
              label: item.label,
              kind: item.kind ?? monacoApi.languages.CompletionItemKind.Function,
              insertText: item.insertText,
              insertTextRules: item.insertTextFormat === 'snippet'
                ? monacoApi.languages.CompletionItemInsertTextRule.InsertAsSnippet | monacoApi.languages.CompletionItemInsertTextRule.KeepWhitespace
                : undefined,
              detail: item.detail,
              documentation: item.documentation,
              range: item.range ? toMonacoRange(monacoApi, item.range) : fallbackCompletionRange(monacoApi, model, position),
            })),
          };
        },
      }),
      monacoApi.languages.registerHoverProvider(languageId, {
        async provideHover(_model, position) {
          const result = await request<MainEditorLspHoverResponsePayload>(
            createMainEditorLspHoverRequestMessage({
              requestId: createRequestId('hover'),
              documentUri: input.documentUri,
              documentVersion: input.getDocumentVersion(),
              sectionName: 'CONTENT',
              contentVersion: input.getContentVersion(),
              position: { lineNumber: position.lineNumber, column: position.column },
            }),
          );
          return {
            contents: result.contents.map(toHoverMarkdownString),
            range: result.range ? toMonacoRange(monacoApi, result.range) : undefined,
          };
        },
      }),
      monacoApi.languages.registerDefinitionProvider(languageId, {
        async provideDefinition(model, position) {
          const result = await request<MainEditorLspDefinitionResponsePayload>(
            createMainEditorLspDefinitionRequestMessage({
              requestId: createRequestId('definition'),
              documentUri: input.documentUri,
              documentVersion: input.getDocumentVersion(),
              sectionName: 'CONTENT',
              contentVersion: input.getContentVersion(),
              position: { lineNumber: position.lineNumber, column: position.column },
            }),
          );
          const sameDocumentTargets = result.targets.filter((target) => target.sameDocument);
          if (sameDocumentTargets.length > 0) {
            return sameDocumentTargets.map((target) => ({
              uri: model.uri,
              range: toMonacoRange(monacoApi, target.range),
            }));
          }

          const firstExternalTarget = result.targets[0];
          if (firstExternalTarget) revealExternalDefinitionTarget(firstExternalTarget);
          return [];
        },
      }),
    ];
  }

  function dispose(): void {
    for (const [requestId, request] of pending.entries()) {
      window.clearTimeout(request.timeout);
      request.reject(new Error(`Main editor LSP client disposed before ${requestId} completed.`));
    }
    pending.clear();
  }

  return { handleMessage, register, dispose };

  /**
   * revealExternalDefinitionTarget 함수.
   * Webview Monaco가 직접 열 수 없는 cross-document definition을 extension host reveal 경로로 전달함.
   *
   * @param target - CBS LSP가 반환한 외부 definition target
   */
  function revealExternalDefinitionTarget(target: MainEditorLspDefinitionResponsePayload['targets'][number]): void {
    input.vscode.postMessage(
      createMainEditorLspRevealLocationMessage({
        requestId: createRequestId('definition-reveal'),
        location: {
          uri: target.uri,
          sourceRange: monacoRangeToSourceRange(target.range),
        },
      }),
    );
  }
}

function createRequestId(kind: string): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toMonacoRange(monacoApi: typeof monaco, range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }): monaco.Range {
  return new monacoApi.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
}

/**
 * toHoverMarkdownString 함수.
 * LSP hover markdown의 command URI 링크를 Monaco hover에서 클릭 가능하게 보존함.
 *
 * @param value - extension host에서 직렬화한 hover markdown
 * @returns Monaco hover markdown string payload
 */
function toHoverMarkdownString(value: string): monaco.IMarkdownString {
  return value.includes('](command:') || value.includes('(command:')
    ? { value, isTrusted: { enabledCommands: [CBS_OCCURRENCE_NAVIGATION_COMMAND] } }
    : { value };
}

/**
 * monacoRangeToSourceRange 함수.
 * Extension host reveal API가 쓰는 0-based source range로 변환함.
 *
 * @param range - Monaco 1-based range payload
 * @returns reveal request용 source range
 */
function monacoRangeToSourceRange(range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }): MainEditorSourceRangePayload {
  return {
    start: {
      line: Math.max(0, range.startLineNumber - 1),
      character: Math.max(0, range.startColumn - 1),
    },
    end: {
      line: Math.max(0, range.endLineNumber - 1),
      character: Math.max(0, range.endColumn - 1),
    },
  };
}

function fallbackCompletionRange(monacoApi: typeof monaco, model: monaco.editor.ITextModel, position: monaco.Position): monaco.Range {
  const word = model.getWordUntilPosition(position);
  return new monacoApi.Range(position.lineNumber, word.startColumn, position.lineNumber, position.column);
}
