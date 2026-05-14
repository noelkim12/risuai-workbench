/**
 * CustomTextEditorProvider for Risu main editor shell formats.
 * @file packages/vscode/src/editors/mainEditor/MainEditorProvider.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import {
  parseMainEditorDocumentModel,
  reassembleHtmlEditorDocument,
  reassembleLorebookEditorDocument,
  reassemblePromptEditorDocument,
  reassembleRegexEditorDocument,
  type EditorDocumentModel,
  type EditorFormatState,
  type HtmlEditorState,
  type LorebookEditorState,
  type PromptEditorState,
  type RegexEditorState,
} from 'risu-workbench-core';
import {
  MAIN_EDITOR_FORMATS,
  MAIN_EDITOR_PROTOCOL,
  MAIN_EDITOR_PROTOCOL_VERSION,
  createDefaultMainEditorPreferences,
  detectMainEditorFormat,
  getMainEditorPreferenceKey,
  isMainEditorEditMessage,
  isMainEditorStructuredEditMessage,
  isMainEditorWebviewMessage,
  normalizeMainEditorPreferences,
  type MainEditorDocumentModelPayload,
  type MainEditorDiagnosticsUpdatePayload,
  type MainEditorAdvancedLspErrorPayload,
  type MainEditorCodeLensResultPayload,
  type MainEditorFormatDefinition,
  type MainEditorFormatPreviewResultPayload,
  type MainEditorLspCompletionResponsePayload,
  type MainEditorLspDefinitionResponsePayload,
  type MainEditorLspErrorPayload,
  type MainEditorLspHoverResponsePayload,
  type MainEditorPreferenceState,
  type MainEditorPrepareRenameResultPayload,
  type MainEditorPreviewResultPayload,
  type MainEditorPreviewRuntimeResultPayload,
  type MainEditorReferencesResultPayload,
  type MainEditorRenameResultPayload,
  type MainEditorSimulatorProfileListResultPayload,
  type MainEditorSimulatorProfileSaveResultPayload,
  type MainEditorVariableCandidatesResultPayload,
  type MainEditorWebviewMessage,
  type MainEditorWorkspaceSymbolsResultPayload,
} from './mainEditorTypes';
import { computeMinimalTextReplacement, createWorkspaceEditForTextReplacement } from './textDocumentEdit';
import { createMainEditorLspBridge, type MainEditorLspBridgeFailure, type MainEditorLspBridgeResult } from './mainEditorLspBridge';
import { createMainEditorFormatPreviewResult } from './mainEditorFormatPreviewBridge';
import { createMainEditorPreviewResult } from './mainEditorPreviewBridge';
import { createMainEditorRuntimePreviewResult } from './mainEditorRuntimePreviewBridge';
import { createMainEditorSimulatorProfileListResult, createMainEditorSimulatorProfileSaveResult } from './mainEditorSimulatorProfileBridge';
import { createMainEditorVariableCandidatesResult } from './mainEditorVariableCandidatesBridge';
import { MainEditorEditQueue } from './mainEditorEditQueue';
import {
  CBS_MARKDOWN_TRUSTED_COMMANDS,
} from '../../lsp/cbsCommands';
import {
  createMainEditorCodeLensResult,
  createMainEditorPrepareRenameResult,
  createMainEditorReferencesResult,
  createMainEditorRenameResult,
  createMainEditorWorkspaceSymbolsResult,
} from './mainEditorAdvancedLsp';
import {
  createWebviewDevServerHtml,
  getConfiguredWebviewDevServerUrl,
  getWebviewDevServerPortMapping,
} from '../../views/webviewDevServer';

type MainEditorExtensionMessage =
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/init';
      payload: MainEditorInitPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/documentChanged';
      payload: MainEditorDocumentSnapshotPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/editApplied';
      payload: { requestId: string; documentUri: string; documentVersion: number };
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/error';
      payload: { code: string; message: string; requestId?: string };
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspCompletionResult';
      payload: MainEditorLspCompletionResponsePayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspHoverResult';
      payload: MainEditorLspHoverResponsePayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspDefinitionResult';
      payload: MainEditorLspDefinitionResponsePayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspError';
      payload: MainEditorLspErrorPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/diagnosticsUpdate';
      payload: MainEditorDiagnosticsUpdatePayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/previewResult';
      payload: MainEditorPreviewResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/previewRuntimeResult';
      payload: MainEditorPreviewRuntimeResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/formatPreviewResult';
      payload: MainEditorFormatPreviewResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/simulatorProfileListResult';
      payload: MainEditorSimulatorProfileListResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/simulatorProfileSaveResult';
      payload: MainEditorSimulatorProfileSaveResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/variableCandidatesResult';
      payload: MainEditorVariableCandidatesResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspReferencesResult';
      payload: MainEditorReferencesResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspPrepareRenameResult';
      payload: MainEditorPrepareRenameResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspRenameResult';
      payload: MainEditorRenameResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspCodeLensResult';
      payload: MainEditorCodeLensResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspWorkspaceSymbolsResult';
      payload: MainEditorWorkspaceSymbolsResultPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspAdvancedError';
      payload: MainEditorAdvancedLspErrorPayload;
    };

interface MainEditorInitPayload extends MainEditorDocumentSnapshotPayload {
  preferences: MainEditorPreferenceState;
}

interface MainEditorDocumentSnapshotPayload {
  documentUri: string;
  documentDisplayPath: string;
  documentVersion: number;
  formatKind: MainEditorFormatDefinition['kind'];
  languageId: MainEditorFormatDefinition['languageId'];
  rawText: string;
  model: MainEditorDocumentModelPayload;
}

/**
 * registerMainEditorProviders 함수.
 * Phase 1 대상 네 포맷의 CustomTextEditorProvider를 등록함.
 *
 * @param context - VS Code extension context
 * @returns 등록 disposable 묶음
 */
export function registerMainEditorProviders(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.Disposable.from(...MAIN_EDITOR_FORMATS.map((format) => MainEditorProvider.register(context, format)));
}

/**
 * MainEditorProvider 클래스.
 * TextDocument를 source of truth로 유지하며 raw source webview shell과 동기화함.
 */
export class MainEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly editQueue = new MainEditorEditQueue();
  private readonly lspBridge = createMainEditorLspBridge();

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly format: MainEditorFormatDefinition,
  ) {}

  /**
   * register 함수.
   * 지정 포맷 하나에 대한 CustomTextEditorProvider를 VS Code에 등록함.
   *
   * @param context - VS Code extension context
   * @param format - 등록할 main editor format definition
   * @returns provider registration disposable
   */
  static register(context: vscode.ExtensionContext, format: MainEditorFormatDefinition): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(format.viewType, new MainEditorProvider(context, format), {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    });
  }

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): void {
    const detectedFormat = detectMainEditorFormat(document.uri.fsPath) ?? this.format;
    const disposables: vscode.Disposable[] = [];

    webviewPanel.webview.options = {
      enableCommandUris: [...CBS_MARKDOWN_TRUSTED_COMMANDS],
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
      portMapping: getWebviewDevServerPortMapping(),
    };
    const postDocumentChanged = (): void => {
      this.postMessage(webviewPanel, createDocumentChangedMessage(document, detectedFormat));
      this.postDiagnosticsUpdate(webviewPanel, document, detectedFormat);
    };

    disposables.push(
      webviewPanel.webview.onDidReceiveMessage((message: unknown) => {
        void this.handleMessage(message, document, webviewPanel, detectedFormat);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== document.uri.toString()) return;
        postDocumentChanged();
      }),
      webviewPanel.onDidDispose(() => {
        for (const disposable of disposables.splice(0)) {
          disposable.dispose();
        }
      }),
    );

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview, detectedFormat);
    this.postDiagnosticsUpdate(webviewPanel, document, detectedFormat);
  }

  private async handleMessage(
    message: unknown,
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    format: MainEditorFormatDefinition,
  ): Promise<void> {
    if (!isMainEditorWebviewMessage(message)) {
      this.postMessage(webviewPanel, createErrorMessage('invalidMessage', 'Unsupported main editor message envelope.'));
      return;
    }

    if (message.type === 'main-editor/ready') {
      this.postInitMessage(webviewPanel, document, format);
      this.postDiagnosticsUpdate(webviewPanel, document, format);
      return;
    }

    if (message.type === 'main-editor/lspCompletion') {
      await this.handleLspBridgeResult(webviewPanel, message.payload, await this.lspBridge.completion(document, message.payload));
      return;
    }

    if (message.type === 'main-editor/lspHover') {
      await this.handleLspBridgeResult(webviewPanel, message.payload, await this.lspBridge.hover(document, message.payload));
      return;
    }

    if (message.type === 'main-editor/lspDefinition') {
      await this.handleLspBridgeResult(webviewPanel, message.payload, await this.lspBridge.definition(document, message.payload));
      return;
    }

    if (message.type === 'main-editor/lspReferences') {
      this.postAdvancedLspResult(webviewPanel, 'main-editor/lspReferencesResult', await createMainEditorReferencesResult(document, message.payload));
      return;
    }

    if (message.type === 'main-editor/lspPrepareRename') {
      this.postAdvancedLspResult(webviewPanel, 'main-editor/lspPrepareRenameResult', await createMainEditorPrepareRenameResult(document, message.payload));
      return;
    }

    if (message.type === 'main-editor/lspRename') {
      this.postAdvancedLspResult(webviewPanel, 'main-editor/lspRenameResult', await createMainEditorRenameResult(document, message.payload));
      return;
    }

    if (message.type === 'main-editor/lspCodeLens') {
      this.postAdvancedLspResult(webviewPanel, 'main-editor/lspCodeLensResult', await createMainEditorCodeLensResult(document, message.payload));
      return;
    }

    if (message.type === 'main-editor/lspWorkspaceSymbols') {
      this.postAdvancedLspResult(webviewPanel, 'main-editor/lspWorkspaceSymbolsResult', await createMainEditorWorkspaceSymbolsResult(message.payload));
      return;
    }

    if (message.type === 'main-editor/lspRevealLocation') {
      await this.revealAdvancedLspLocation(message.payload.location);
      return;
    }

    if (message.type === 'main-editor/previewRequest') {
      this.postMessage(webviewPanel, createPreviewResultMessage(createMainEditorPreviewResult(document, message.payload)));
      return;
    }

    if (message.type === 'main-editor/previewRuntimeRequest') {
      this.postMessage(webviewPanel, createPreviewRuntimeResultMessage(createMainEditorRuntimePreviewResult(document, message.payload)));
      return;
    }

    if (message.type === 'main-editor/formatPreviewRequest') {
      this.postMessage(webviewPanel, createFormatPreviewResultMessage(createMainEditorFormatPreviewResult(document, message.payload, format.kind)));
      return;
    }

    if (message.type === 'main-editor/simulatorProfileListRequest') {
      this.postMessage(
        webviewPanel,
        createSimulatorProfileListResultMessage(await createMainEditorSimulatorProfileListResult(this.context.workspaceState, message.payload)),
      );
      return;
    }

    if (message.type === 'main-editor/simulatorProfileSaveRequest') {
      this.postMessage(
        webviewPanel,
        createSimulatorProfileSaveResultMessage(await createMainEditorSimulatorProfileSaveResult(this.context.workspaceState, message.payload)),
      );
      return;
    }

    if (message.type === 'main-editor/variableCandidatesRequest') {
      this.postMessage(
        webviewPanel,
        createVariableCandidatesResultMessage(await createMainEditorVariableCandidatesResult(document, message.payload)),
      );
      return;
    }

    if (message.type === 'main-editor/updatePreferences') {
      await this.context.workspaceState.update(getMainEditorPreferenceKey(message.payload.formatKind), message.payload.preferences);
      return;
    }

    if (isMainEditorStructuredEditMessage(message)) {
      await this.enqueueDocumentEdit(document.uri.toString(), async () => {
        if (message.payload.formatKind !== format.kind) {
          this.postMessage(
            webviewPanel,
            createErrorMessage('formatMismatch', 'Structured edit format does not match the open document.', message.payload.requestId),
          );
          this.postMessage(webviewPanel, createDocumentChangedMessage(document, format));
          return;
        }

        try {
          const model = parseMainEditorDocumentModel(format.kind, document.getText());
          const nextText = reassembleStructuredMainEditorText(model, message.payload.state);
          await this.handleEditMessage(
            {
              ...message,
              type: 'main-editor/edit',
              payload: {
                requestId: message.payload.requestId,
                documentUri: message.payload.documentUri,
                baseVersion: message.payload.baseVersion,
                nextText,
              },
            },
            document,
            webviewPanel,
          );
        } catch (error) {
          const messageText = error instanceof Error ? error.message : 'Structured edit could not be reassembled.';
          this.postMessage(webviewPanel, createErrorMessage('structuredEditRejected', messageText, message.payload.requestId));
          this.postMessage(webviewPanel, createDocumentChangedMessage(document, format));
        }
      });
      return;
    }

    if (isMainEditorEditMessage(message)) {
      await this.enqueueDocumentEdit(document.uri.toString(), async () => {
        await this.handleEditMessage(message, document, webviewPanel);
      });
    }
  }

  private enqueueDocumentEdit(documentUri: string, task: () => Promise<void>): Promise<void> {
    return this.editQueue.enqueue(documentUri, task);
  }

  private async handleEditMessage(
    message: Extract<MainEditorWebviewMessage, { type: 'main-editor/edit' }>,
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    if (message.payload.documentUri !== document.uri.toString()) {
      this.postMessage(
        webviewPanel,
        createErrorMessage(
          'staleDocument',
          'Edit request document URI does not match the open document.',
          message.payload.requestId,
        ),
      );
      return;
    }

    if (message.payload.baseVersion !== document.version) {
      this.postMessage(
        webviewPanel,
        createErrorMessage('staleVersion', 'Edit request is based on an older document version.', message.payload.requestId),
      );
      this.postMessage(webviewPanel, createDocumentChangedMessage(document, detectMainEditorFormat(document.uri.fsPath) ?? this.format));
      return;
    }

    const replacement = computeMinimalTextReplacement(document.getText(), message.payload.nextText);
    if (!replacement) {
      this.postMessage(webviewPanel, createEditAppliedMessage(message.payload.requestId, document));
      return;
    }

    const applied = await vscode.workspace.applyEdit(createWorkspaceEditForTextReplacement(document, replacement));
    if (!applied) {
      this.postMessage(
        webviewPanel,
        createErrorMessage('editRejected', 'VS Code rejected the WorkspaceEdit.', message.payload.requestId),
      );
      this.postMessage(webviewPanel, createDocumentChangedMessage(document, detectMainEditorFormat(document.uri.fsPath) ?? this.format));
      return;
    }

    this.postMessage(webviewPanel, createEditAppliedMessage(message.payload.requestId, document));
    this.postDiagnosticsUpdate(webviewPanel, document, detectMainEditorFormat(document.uri.fsPath) ?? this.format);
  }

  private async handleLspBridgeResult<TPayload extends MainEditorLspCompletionResponsePayload | MainEditorLspHoverResponsePayload | MainEditorLspDefinitionResponsePayload>(
    webviewPanel: vscode.WebviewPanel,
    requestPayload: { requestId: string; documentUri: string },
    result: MainEditorLspBridgeResult<TPayload> | MainEditorLspBridgeFailure,
  ): Promise<void> {
    if (!result.ok) {
      this.postMessage(webviewPanel, createLspErrorMessage(requestPayload, result));
      return;
    }

    if ('items' in result.payload) {
      this.postMessage(webviewPanel, createLspCompletionResultMessage(result.payload));
      return;
    }
    if ('contents' in result.payload) {
      this.postMessage(webviewPanel, createLspHoverResultMessage(result.payload));
      return;
    }
    this.postMessage(webviewPanel, createLspDefinitionResultMessage(result.payload));
  }

  private postDiagnosticsUpdate(webviewPanel: vscode.WebviewPanel, document: vscode.TextDocument, format: MainEditorFormatDefinition): void {
    if (format.kind !== 'lorebook') return;
    this.postMessage(webviewPanel, {
      protocol: MAIN_EDITOR_PROTOCOL,
      version: MAIN_EDITOR_PROTOCOL_VERSION,
      type: 'main-editor/diagnosticsUpdate',
      payload: {
        documentUri: document.uri.toString(),
        documentVersion: document.version,
        sectionName: 'CONTENT',
        markers: [],
      },
    });
  }

  private async revealAdvancedLspLocation(location: { uri: string; sourceRange: { start: { line: number; character: number }; end: { line: number; character: number } } }): Promise<void> {
    const uri = vscode.Uri.parse(location.uri);
    const range = new vscode.Range(
      new vscode.Position(location.sourceRange.start.line, location.sourceRange.start.character),
      new vscode.Position(location.sourceRange.end.line, location.sourceRange.end.character),
    );
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { selection: range, preview: true });
  }

  private postAdvancedLspResult<TPayload extends MainEditorReferencesResultPayload | MainEditorPrepareRenameResultPayload | MainEditorRenameResultPayload | MainEditorCodeLensResultPayload | MainEditorWorkspaceSymbolsResultPayload>(
    webviewPanel: vscode.WebviewPanel,
    type: Extract<MainEditorExtensionMessage, { payload: TPayload }>['type'],
    result: { ok: true; payload: TPayload } | { ok: false; error: MainEditorAdvancedLspErrorPayload },
  ): void {
    if (!result.ok) {
      this.postMessage(webviewPanel, createAdvancedLspErrorMessage(result.error));
      return;
    }
    this.postMessage(webviewPanel, { protocol: MAIN_EDITOR_PROTOCOL, version: MAIN_EDITOR_PROTOCOL_VERSION, type, payload: result.payload } as Extract<MainEditorExtensionMessage, { payload: TPayload }>);
  }

  private readPreferences(formatKind: MainEditorFormatDefinition['kind']): MainEditorPreferenceState {
    const stored = this.context.workspaceState.get<unknown>(getMainEditorPreferenceKey(formatKind));
    return normalizeMainEditorPreferences(stored);
  }

  private postMessage(webviewPanel: vscode.WebviewPanel, message: MainEditorExtensionMessage): void {
    void webviewPanel.webview.postMessage(message);
  }

  /**
   * postInitMessage 함수.
   * ready handshake 이후 현재 TextDocument snapshot을 main editor webview에 전달함.
   *
   * @param webviewPanel - init message를 받을 webview panel
   * @param document - custom editor가 열고 있는 TextDocument
   * @param format - 현재 main editor format definition
   */
  private postInitMessage(
    webviewPanel: vscode.WebviewPanel,
    document: vscode.TextDocument,
    format: MainEditorFormatDefinition,
  ): void {
    try {
      this.postMessage(webviewPanel, createInitMessage(document, format, this.readPreferences(format.kind)));
    } catch (error) {
      this.postMessage(webviewPanel, createErrorMessage('initFailed', getErrorMessage(error)));
    }
  }

  private getHtml(webview: vscode.Webview, format: MainEditorFormatDefinition): string {
    const devServerUrl = getConfiguredWebviewDevServerUrl();
    if (devServerUrl) {
      return createWebviewDevServerHtml(devServerUrl, {
        editorMode: true,
        title: format.displayName,
        viewName: 'main-editor',
        webview,
      });
    }

    const webviewRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const htmlPath = path.join(webviewRoot.fsPath, 'index.html');
    if (!fs.existsSync(htmlPath)) return createFallbackHtml(webview, format.displayName);

    const nonce = createNonce();
    const html = fs.readFileSync(htmlPath, 'utf8');
    const assetHtml = html.replace(/(src|href)="(\.\/assets\/[^\"]+)"/g, (_match, attr: string, assetPath: string) => {
      const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, assetPath.replace('./', '')));
      return `${attr}="${assetUri.toString()}"`;
    });
    const withNonce = assetHtml.replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`);
    const withEditorSignal = withNonce
      .replace(/<html(\s[^>]*)?>/i, (match, attrs: string | undefined) =>
        attrs?.includes('data-editor-mode=')
          ? match
          : `<html${attrs ?? ''} data-editor-mode="true" data-risu-workbench-view="main-editor">`,
      )
      .replace('</head>', `    <meta name="risu-workbench-view" content="main-editor" />\n  </head>`);

    return withEditorSignal.replace(
      '</head>',
      `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; worker-src ${webview.cspSource} blob:; child-src ${webview.cspSource} blob:; font-src ${webview.cspSource};" />\n  </head>`,
    );
  }
}

function createInitMessage(
  document: vscode.TextDocument,
  format: MainEditorFormatDefinition,
  preferences: MainEditorPreferenceState,
): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/init',
    payload: {
      ...createDocumentSnapshot(document, format),
      preferences,
    },
  };
}

function createDocumentChangedMessage(document: vscode.TextDocument, format: MainEditorFormatDefinition): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/documentChanged',
    payload: createDocumentSnapshot(document, format),
  };
}

function createDocumentSnapshot(document: vscode.TextDocument, format: MainEditorFormatDefinition): MainEditorDocumentSnapshotPayload {
  const rawText = document.getText();
  const model = parseMainEditorDocumentModel(format.kind, rawText);
  return {
    documentUri: document.uri.toString(),
    documentDisplayPath: createWorkspaceRelativeDisplayPath(document.uri),
    documentVersion: document.version,
    formatKind: format.kind,
    languageId: format.languageId,
    rawText,
    model: createDocumentModelPayload(model),
  };
}

/**
 * createWorkspaceRelativeDisplayPath 함수.
 * 현재 문서 URI를 VS Code workspace 기준 표시 경로로 변환함.
 *
 * @param uri - main editor에서 열린 문서 URI
 * @returns header에 표시할 workspace-relative path
 */
function createWorkspaceRelativeDisplayPath(uri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) return uri.fsPath || uri.toString();
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
}

function createDocumentModelPayload(model: EditorDocumentModel<EditorFormatState>): MainEditorDocumentModelPayload {
  return {
    formatKind: model.formatKind,
    state: model.state,
    warnings: model.warnings.map((warning) => ({
      code: warning.code,
      severity: warning.severity,
      message: warning.message,
      sectionName: warning.sectionName,
      fieldName: warning.fieldName,
    })),
    sections: model.sections.map((section) => ({
      name: section.name,
      normalizedContent: section.normalizedContent,
    })),
  };
}

function reassembleStructuredMainEditorText(model: EditorDocumentModel<EditorFormatState>, state: unknown): string {
  switch (model.formatKind) {
    case 'lorebook':
      return reassembleLorebookEditorDocument(
        model as EditorDocumentModel<LorebookEditorState>,
        state as LorebookEditorState,
      );
    case 'regex':
      return reassembleRegexEditorDocument(model as EditorDocumentModel<RegexEditorState>, state as RegexEditorState);
    case 'prompt':
      return reassemblePromptEditorDocument(model as EditorDocumentModel<PromptEditorState>, state as PromptEditorState);
    case 'html':
      return reassembleHtmlEditorDocument(model as EditorDocumentModel<HtmlEditorState>, state as HtmlEditorState);
  }
}

function createEditAppliedMessage(requestId: string, document: vscode.TextDocument): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/editApplied',
    payload: {
      requestId,
      documentUri: document.uri.toString(),
      documentVersion: document.version,
    },
  };
}

function createErrorMessage(code: string, message: string, requestId?: string): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/error',
    payload: { code, message, requestId },
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createLspCompletionResultMessage(payload: MainEditorLspCompletionResponsePayload): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspCompletionResult',
    payload,
  };
}

function createLspHoverResultMessage(payload: MainEditorLspHoverResponsePayload): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspHoverResult',
    payload,
  };
}

function createLspDefinitionResultMessage(payload: MainEditorLspDefinitionResponsePayload): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspDefinitionResult',
    payload,
  };
}

function createLspErrorMessage(
  requestPayload: { requestId: string; documentUri: string },
  failure: MainEditorLspBridgeFailure,
): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspError',
    payload: {
      requestId: requestPayload.requestId,
      documentUri: requestPayload.documentUri,
      code: failure.code,
      message: failure.message,
    },
  };
}

function createAdvancedLspErrorMessage(payload: MainEditorAdvancedLspErrorPayload): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspAdvancedError',
    payload,
  };
}

function createPreviewResultMessage(payload: MainEditorPreviewResultPayload): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/previewResult',
    payload,
  };
}

function createPreviewRuntimeResultMessage(payload: MainEditorPreviewRuntimeResultPayload): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/previewRuntimeResult',
    payload,
  };
}

function createFormatPreviewResultMessage(payload: MainEditorFormatPreviewResultPayload): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/formatPreviewResult',
    payload,
  };
}

function createSimulatorProfileListResultMessage(payload: MainEditorSimulatorProfileListResultPayload): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/simulatorProfileListResult',
    payload,
  };
}

function createSimulatorProfileSaveResultMessage(payload: MainEditorSimulatorProfileSaveResultPayload): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/simulatorProfileSaveResult',
    payload,
  };
}

function createVariableCandidatesResultMessage(payload: MainEditorVariableCandidatesResultPayload): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/variableCandidatesResult',
    payload,
  };
}

function createFallbackHtml(webview: vscode.Webview, title: string): string {
  return `<!doctype html>
<html lang="en" data-editor-mode="true" data-risu-workbench-view="main-editor">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="risu-workbench-view" content="main-editor" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; worker-src ${webview.cspSource} blob:; child-src ${webview.cspSource} blob:;" />
    <title>${escapeHtmlText(title)}</title>
  </head>
  <body>
    <h1>${escapeHtmlText(title)}</h1>
    <p>Webview bundle is missing. Run the vscode package build to generate Vite assets.</p>
  </body>
</html>`;
}

function createNonce(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
