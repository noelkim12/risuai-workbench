/**
 * Advanced LSP bridge helpers for the Main Editor webview.
 * @file packages/webview/src/lib/components/editor/lsp/advancedLspBridge.ts
 */

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import { MAIN_EDITOR_CBS_LANGUAGE_ID } from '../../../monaco/mainEditorCbsLanguage';
import type { MainEditorExtensionMessage, MainEditorWebviewMessage } from '../../../types';
import type {
  MainEditorCodeLensPayload,
  MainEditorCodeLensRequestPayload,
  MainEditorPrepareRenameRequestPayload,
  MainEditorPrepareRenameResultPayload,
  MainEditorReferencesRequestPayload,
  MainEditorReferencesResultPayload,
  MainEditorRenameRequestPayload,
  MainEditorRenameResultPayload,
  MainEditorWorkspaceSymbolPayload,
  MainEditorWorkspaceSymbolsRequestPayload,
} from '../../../types/mainEditor';
import {
  createMainEditorLspCodeLensMessage,
  createMainEditorLspPrepareRenameMessage,
  createMainEditorLspReferencesMessage,
  createMainEditorLspRenameMessage,
  createMainEditorLspWorkspaceSymbolsMessage,
} from '../../../vscode/mainEditorMessages';

interface RequestControllerOptions {
  postMessage: (message: MainEditorWebviewMessage) => void;
  requestTimeoutMs?: number;
}

interface AdvancedLspProviderContext {
  documentUri: string;
  getDocumentVersion: () => number;
  getFormatKind: () => 'lorebook' | 'regex' | 'prompt' | 'html';
  getSectionName: () => 'CONTENT' | 'IN' | 'OUT' | 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT' | 'FULL';
  onStatus?: (message: string) => void;
}

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export interface AdvancedLspRequestController {
  requestReferences(payload: MainEditorReferencesRequestPayload): Promise<MainEditorReferencesResultPayload['locations']>;
  requestPrepareRename(payload: MainEditorPrepareRenameRequestPayload): Promise<MainEditorPrepareRenameResultPayload>;
  requestRename(payload: MainEditorRenameRequestPayload): Promise<MainEditorRenameResultPayload>;
  requestCodeLens(payload: MainEditorCodeLensRequestPayload): Promise<MainEditorCodeLensPayload[]>;
  requestWorkspaceSymbols(payload: MainEditorWorkspaceSymbolsRequestPayload): Promise<MainEditorWorkspaceSymbolPayload[]>;
  handleExtensionMessage(message: MainEditorExtensionMessage): boolean;
  dispose(): void;
}

/**
 * createAdvancedLspRequestController 함수.
 * Phase 8 request/response correlation과 timeout cleanup을 관리함.
 *
 * @param options - postMessage 함수와 timeout 설정
 * @returns advanced LSP request controller
 */
export function createAdvancedLspRequestController(options: RequestControllerOptions): AdvancedLspRequestController {
  const timeoutMs = options.requestTimeoutMs ?? 5000;
  const pendingReferences = new Map<string, PendingRequest<MainEditorReferencesResultPayload['locations']>>();
  const pendingPrepareRename = new Map<string, PendingRequest<MainEditorPrepareRenameResultPayload>>();
  const pendingRename = new Map<string, PendingRequest<MainEditorRenameResultPayload>>();
  const pendingCodeLens = new Map<string, PendingRequest<MainEditorCodeLensPayload[]>>();
  const pendingWorkspaceSymbols = new Map<string, PendingRequest<MainEditorWorkspaceSymbolPayload[]>>();

  function request<T>(map: Map<string, PendingRequest<T>>, requestId: string, message: MainEditorWebviewMessage, pickValue: (message: MainEditorExtensionMessage) => T, expectedType: MainEditorExtensionMessage['type']): Promise<T> {
    options.postMessage(message);
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        map.delete(requestId);
        reject(new Error(`Advanced LSP request timed out: ${requestId}`));
      }, timeoutMs);
      map.set(requestId, { resolve, reject, timeoutId });
      responsePickers.set(requestId, { expectedType, pickValue: pickValue as ResponsePicker });
    });
  }

  type ResponsePicker = (message: MainEditorExtensionMessage) => unknown;
  const responsePickers = new Map<string, { expectedType: MainEditorExtensionMessage['type']; pickValue: ResponsePicker }>();

  function clearPending<T>(map: Map<string, PendingRequest<T>>, requestId: string): PendingRequest<T> | undefined {
    const pending = map.get(requestId);
    if (!pending) return undefined;
    clearTimeout(pending.timeoutId);
    map.delete(requestId);
    responsePickers.delete(requestId);
    return pending;
  }

  function handleResolved<T>(map: Map<string, PendingRequest<T>>, message: MainEditorExtensionMessage & { payload: { requestId: string } }): boolean {
    const picker = responsePickers.get(message.payload.requestId);
    const pending = clearPending(map, message.payload.requestId);
    if (!pending) return true;
    pending.resolve((picker?.pickValue(message) ?? message.payload) as T);
    return true;
  }

  return {
    requestReferences(payload) {
      return request(pendingReferences, payload.requestId, createMainEditorLspReferencesMessage(payload), (message) => (message as Extract<MainEditorExtensionMessage, { type: 'main-editor/lspReferencesResult' }>).payload.locations, 'main-editor/lspReferencesResult');
    },
    requestPrepareRename(payload) {
      return request(pendingPrepareRename, payload.requestId, createMainEditorLspPrepareRenameMessage(payload), (message) => (message as Extract<MainEditorExtensionMessage, { type: 'main-editor/lspPrepareRenameResult' }>).payload, 'main-editor/lspPrepareRenameResult');
    },
    requestRename(payload) {
      return request(pendingRename, payload.requestId, createMainEditorLspRenameMessage(payload), (message) => (message as Extract<MainEditorExtensionMessage, { type: 'main-editor/lspRenameResult' }>).payload, 'main-editor/lspRenameResult');
    },
    requestCodeLens(payload) {
      return request(pendingCodeLens, payload.requestId, createMainEditorLspCodeLensMessage(payload), (message) => (message as Extract<MainEditorExtensionMessage, { type: 'main-editor/lspCodeLensResult' }>).payload.lenses, 'main-editor/lspCodeLensResult');
    },
    requestWorkspaceSymbols(payload) {
      return request(pendingWorkspaceSymbols, payload.requestId, createMainEditorLspWorkspaceSymbolsMessage(payload), (message) => (message as Extract<MainEditorExtensionMessage, { type: 'main-editor/lspWorkspaceSymbolsResult' }>).payload.symbols, 'main-editor/lspWorkspaceSymbolsResult');
    },
    handleExtensionMessage(message) {
      if (message.type === 'main-editor/lspReferencesResult') return handleResolved(pendingReferences, message);
      if (message.type === 'main-editor/lspPrepareRenameResult') return handleResolved(pendingPrepareRename, message);
      if (message.type === 'main-editor/lspRenameResult') return handleResolved(pendingRename, message);
      if (message.type === 'main-editor/lspCodeLensResult') return handleResolved(pendingCodeLens, message);
      if (message.type === 'main-editor/lspWorkspaceSymbolsResult') return handleResolved(pendingWorkspaceSymbols, message);
      if (message.type === 'main-editor/lspAdvancedError') {
        rejectPending(pendingReferences, message.payload.requestId, message.payload.message);
        rejectPending(pendingPrepareRename, message.payload.requestId, message.payload.message);
        rejectPending(pendingRename, message.payload.requestId, message.payload.message);
        rejectPending(pendingCodeLens, message.payload.requestId, message.payload.message);
        rejectPending(pendingWorkspaceSymbols, message.payload.requestId, message.payload.message);
        return true;
      }
      return false;
    },
    dispose() {
      disposePending(pendingReferences);
      disposePending(pendingPrepareRename);
      disposePending(pendingRename);
      disposePending(pendingCodeLens);
      disposePending(pendingWorkspaceSymbols);
      responsePickers.clear();
    },
  };

  function rejectPending<T>(map: Map<string, PendingRequest<T>>, requestId: string, message: string): void {
    const pending = clearPending(map, requestId);
    if (pending) pending.reject(new Error(message));
  }

  function disposePending<T>(map: Map<string, PendingRequest<T>>): void {
    for (const [requestId, pending] of map) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(`Advanced LSP request disposed: ${requestId}`));
    }
    map.clear();
  }
}

/**
 * registerAdvancedLspProviders 함수.
 * references, rename, CodeLens Monaco provider를 등록함.
 *
 * @param monacoApi - Monaco editor API
 * @param controller - advanced LSP request controller
 * @param context - 현재 문서와 section 정보 getter
 * @returns provider disposable 목록
 */
export function registerAdvancedLspProviders(monacoApi: typeof monaco, controller: AdvancedLspRequestController, context: AdvancedLspProviderContext): monaco.IDisposable[] {
  const languageId = MAIN_EDITOR_CBS_LANGUAGE_ID;
  return [
    monacoApi.languages.registerReferenceProvider(languageId, {
      async provideReferences(_model, position, referenceContext) {
        const locations = await controller.requestReferences({
          requestId: createRequestId('refs'),
          documentUri: context.documentUri,
          documentVersion: context.getDocumentVersion(),
          formatKind: context.getFormatKind(),
          sectionName: context.getSectionName(),
          position: { lineNumber: position.lineNumber, column: position.column },
          includeDeclaration: referenceContext.includeDeclaration,
        });
        return locations.map((location) => ({
          uri: monacoApi.Uri.parse(location.uri),
          range: toMonacoRange(monacoApi, location.monacoRange ?? sourceRangeToMonacoRange(location.sourceRange)),
        }));
      },
    }),
    monacoApi.languages.registerRenameProvider(languageId, {
      async resolveRenameLocation(_model, position) {
        const result = await controller.requestPrepareRename({
          requestId: createRequestId('prepare-rename'),
          documentUri: context.documentUri,
          documentVersion: context.getDocumentVersion(),
          formatKind: context.getFormatKind(),
          sectionName: context.getSectionName(),
          position: { lineNumber: position.lineNumber, column: position.column },
        });
        if (result.rejected || !result.range) {
          return {
            range: new monacoApi.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: '',
            rejectReason: 'Rename is not available here.',
          };
        }
        return { range: toMonacoRange(monacoApi, result.range), text: result.placeholder };
      },
      async provideRenameEdits(_model, position, newName) {
        const result = await controller.requestRename({
          requestId: createRequestId('rename'),
          documentUri: context.documentUri,
          documentVersion: context.getDocumentVersion(),
          formatKind: context.getFormatKind(),
          sectionName: context.getSectionName(),
          position: { lineNumber: position.lineNumber, column: position.column },
          newName,
        });
        context.onStatus?.(result.edit.summary);
        return { edits: [] };
      },
    }),
    monacoApi.languages.registerCodeLensProvider(languageId, {
      async provideCodeLenses() {
        const lenses = await controller.requestCodeLens({
          requestId: createRequestId('codelens'),
          documentUri: context.documentUri,
          documentVersion: context.getDocumentVersion(),
          formatKind: context.getFormatKind(),
          sectionName: context.getSectionName(),
        });
        return {
          lenses: lenses.map((lens) => ({
            range: toMonacoRange(monacoApi, lens.monacoRange ?? sourceRangeToMonacoRange(lens.sourceRange)),
            command: { id: lens.command ?? 'risuWorkbench.mainEditor.codeLensLabel', title: lens.title, tooltip: lens.tooltip, arguments: lens.arguments },
          })),
          dispose: () => undefined,
        };
      },
      resolveCodeLens(_model, codeLens) {
        return codeLens;
      },
    }),
  ];
}

/**
 * normalizeWorkspaceSymbolQuery 함수.
 * Workspace symbol query를 trim하고 안전한 limit 범위로 clamp함.
 *
 * @param input - raw query와 limit
 * @returns 정규화된 query 입력
 */
export function normalizeWorkspaceSymbolQuery(input: { query: string; limit: number }): { query: string; limit: number } {
  return { query: input.query.trim(), limit: Math.max(1, Math.min(50, Math.floor(input.limit))) };
}

function createRequestId(kind: string): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toMonacoRange(monacoApi: typeof monaco, range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }): monaco.Range {
  return new monacoApi.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
}

function sourceRangeToMonacoRange(range: { start: { line: number; character: number }; end: { line: number; character: number } }) {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}
