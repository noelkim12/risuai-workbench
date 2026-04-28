import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import type {
  CancellationToken,
  CodeAction,
  CodeLens,
  CompletionItem,
  CompletionList,
  Definition,
  Diagnostic,
  DidChangeConfigurationParams,
  DidChangeWatchedFilesParams,
  DocumentFormattingParams,
  DocumentHighlight,
  DocumentOnTypeFormattingParams,
  DocumentRangeFormattingParams,
  DocumentSymbol,
  FoldingRange,
  Hover,
  InlayHint,
  InitializeParams,
  InitializeResult,
  Location,
  Range,
  ReferenceParams,
  RenameParams,
  SelectionRange,
  SemanticTokens,
  SignatureHelp,
  TextEdit,
  TextDocumentPositionParams,
  WorkspaceEdit,
  WorkspaceSymbolParams,
  SymbolInformation,
} from 'vscode-languageserver/node';
import {
  CodeActionKind,
  CompletionItemKind,
  FileChangeType,
  LSPErrorCodes,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as core from 'risu-workbench-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD,
  createLuaLsCompanionRuntime,
  createSyntheticDocumentVersion,
  fragmentAnalysisService,
} from '../src/core';
import {
  ACTIVATION_CHAIN_CODELENS_CLIENT_COMMAND,
  ACTIVATION_CHAIN_CODELENS_COMMAND,
} from '../src/features/presentation';
import { CBS_COMPLETION_TRIGGER_CHARACTERS } from '../src/features/completion';
import { SEMANTIC_TOKEN_MODIFIERS, SEMANTIC_TOKEN_TYPES } from '../src/features/symbols';
import { ElementRegistry, UnifiedVariableGraph } from '../src/indexer';
import { registerServer } from '../src/server';
import type {
  LuaLsProcessManager,
  LuaLsProcessPrepareOptions,
  LuaLsPublishDiagnosticsEvent,
  LuaLsProcessStartOptions,
} from '../src/providers/lua/lualsProcess';
import {
  createLuaLsTransportUri,
  type LuaLsRoutedDocument,
} from '../src/providers/lua/lualsDocuments';
import { normalizeLuaHoverForSnapshot } from '../src/providers/lua/lualsProxy';
import { LSP_POSITION_ENCODING, offsetToPosition, positionToOffset } from '../src/utils/position';
import {
  getFixtureCorpusEntry,
  serializeCodeLensesEnvelopeForGolden,
  serializeDocumentSymbolsEnvelopeForGolden,
  serializeProviderBundleForGolden,
  serializeWorkspaceSymbolsEnvelopeForGolden,
  snapshotCodeActionsEnvelope,
  snapshotCodeLensesEnvelope,
  snapshotDocumentSymbolsEnvelope,
  snapshotHostDiagnosticsEnvelope,
  snapshotLuaHoverEnvelope,
  snapshotProviderBundle,
  snapshotWorkspaceSymbolsEnvelope,
} from './fixtures/fixture-corpus';

const tempRoots: string[] = [];

function createDisposable() {
  return {
    dispose() {},
  };
}

interface TestLuaLsProcessManagerStub {
  checkHealth: () => ReturnType<typeof createLuaLsCompanionRuntime>;
  closeDocument: (sourceUri: string) => void;
  emitPublishDiagnostics: (event: LuaLsPublishDiagnosticsEvent) => void;
  getRuntime: () => ReturnType<typeof createLuaLsCompanionRuntime>;
  onPublishDiagnostics: (
    listener: (event: LuaLsPublishDiagnosticsEvent) => void,
  ) => () => void;
  prepareForInitialize: (
    options?: LuaLsProcessPrepareOptions,
  ) => ReturnType<typeof createLuaLsCompanionRuntime>;
  refreshWorkspaceConfiguration: (options?: LuaLsProcessStartOptions) => void;
  restart: (
    options?: LuaLsProcessStartOptions,
  ) => Promise<ReturnType<typeof createLuaLsCompanionRuntime>>;
  request: (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>;
  shutdown: () => Promise<ReturnType<typeof createLuaLsCompanionRuntime>>;
  start: (
    options?: LuaLsProcessStartOptions,
  ) => Promise<ReturnType<typeof createLuaLsCompanionRuntime>>;
  syncDocument: (document: LuaLsRoutedDocument) => void;
}

function createLuaLsProcessManagerStub(
  overrides: Partial<TestLuaLsProcessManagerStub> = {},
): TestLuaLsProcessManagerStub {
  const diagnosticsListeners = new Set<(event: LuaLsPublishDiagnosticsEvent) => void>();

  return {
    checkHealth: vi.fn(() =>
      createLuaLsCompanionRuntime({
        detail: 'LuaLS sidecar process is alive and ready to serve future Lua document routing/proxy work.',
        executablePath: '/mock/luals',
        health: 'healthy',
        status: 'ready',
      }),
    ),
    getRuntime: vi.fn(() =>
      createLuaLsCompanionRuntime({
        detail:
          'LuaLS executable was resolved and the sidecar is ready to start after the main LSP server finishes initialization.',
        executablePath: '/mock/luals',
        health: 'idle',
        status: 'stopped',
      }),
    ),
    onPublishDiagnostics: vi.fn((listener: (event: LuaLsPublishDiagnosticsEvent) => void) => {
      diagnosticsListeners.add(listener);
      return () => {
        diagnosticsListeners.delete(listener);
      };
    }),
    prepareForInitialize: vi.fn(() =>
      createLuaLsCompanionRuntime({
        detail:
          'LuaLS executable was resolved and the sidecar is ready to start after the main LSP server finishes initialization.',
        executablePath: '/mock/luals',
        health: 'idle',
        status: 'stopped',
      }),
    ),
    request: async () => null,
    refreshWorkspaceConfiguration: vi.fn(),
    restart: vi.fn(async () =>
      createLuaLsCompanionRuntime({
        detail: 'LuaLS sidecar finished initialize/initialized handshake and is healthy.',
        executablePath: '/mock/luals',
        health: 'healthy',
        status: 'ready',
      }),
    ),
    shutdown: vi.fn(async () =>
      createLuaLsCompanionRuntime({
        detail: 'LuaLS sidecar lifecycle was shut down cleanly with the server.',
        executablePath: '/mock/luals',
        health: 'idle',
        status: 'stopped',
      }),
    ),
    closeDocument: vi.fn(),
    start: vi.fn(async () =>
      createLuaLsCompanionRuntime({
        detail: 'LuaLS sidecar finished initialize/initialized handshake and is healthy.',
        executablePath: '/mock/luals',
        health: 'healthy',
        status: 'ready',
      }),
    ),
    emitPublishDiagnostics: (event: LuaLsPublishDiagnosticsEvent) => {
      for (const listener of diagnosticsListeners) {
        listener(event);
      }
    },
    syncDocument: vi.fn(),
    ...overrides,
  } as unknown as TestLuaLsProcessManagerStub;
}

function lorebookDocument(bodyLines: readonly string[]): string {
  return ['---', 'name: entry', '---', '@@@ CONTENT', ...bodyLines, ''].join('\n');
}

function promptDocument(bodyLines: readonly string[]): string {
  return ['---', 'type: plain', '---', '@@@ TEXT', ...bodyLines, ''].join('\n');
}

function regexDocument(inLines: readonly string[], outLines: readonly string[]): string {
  return ['---', 'name: regex', '---', '@@@ IN', ...inLines, '@@@ OUT', ...outLines, ''].join('\n');
}

function positionAt(
  text: string,
  needle: string,
  characterOffset: number = 0,
  occurrence: number = 0,
) {
  let searchFrom = 0;
  let offset = -1;

  for (let index = 0; index <= occurrence; index += 1) {
    offset = text.indexOf(needle, searchFrom);
    if (offset === -1) {
      break;
    }

    searchFrom = offset + needle.length;
  }

  expect(offset).toBeGreaterThanOrEqual(0);
  return offsetToPosition(text, offset + characterOffset);
}

function getHoverMarkdown(hover: Hover | null): string | null {
  if (!hover) {
    return null;
  }

  const contents = hover.contents as { value?: string };
  return contents.value ?? null;
}

function getCompletionItems(
  result: CompletionItem[] | { items: CompletionItem[] } | Promise<CompletionItem[] | { items: CompletionItem[] }> | null | undefined,
) {
  if (!result || result instanceof Promise) {
    return [];
  }

  return Array.isArray(result) ? result : result.items;
}

function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  return [...edits]
    .sort((left, right) => positionToOffset(text, right.range.start) - positionToOffset(text, left.range.start))
    .reduce((currentText, edit) => {
      const startOffset = positionToOffset(currentText, edit.range.start);
      const endOffset = positionToOffset(currentText, edit.range.end);
      return `${currentText.slice(0, startOffset)}${edit.newText}${currentText.slice(endOffset)}`;
    }, text);
}

function decodeSemanticTokenTexts(data: number[], text: string) {
  const decoded: Array<{ line: number; startChar: number; length: number; text: string }> = [];
  let line = 0;
  let startChar = 0;

  for (let index = 0; index < data.length; index += 5) {
    const deltaLine = data[index];
    const deltaStart = data[index + 1];
    const length = data[index + 2];

    line += deltaLine;
    startChar = deltaLine === 0 ? startChar + deltaStart : deltaStart;

    decoded.push({
      line,
      startChar,
      length,
      text: text.slice(
        positionToOffset(text, { line, character: startChar }),
        positionToOffset(text, { line, character: startChar + length }),
      ),
    });
  }

  return decoded;
}

function flattenSelectionRangeChain(selectionRange: SelectionRange | undefined): Range[] {
  const ranges: Range[] = [];
  let current = selectionRange;

  while (current) {
    ranges.push(current.range);
    current = current.parent;
  }

  return ranges;
}

class FakeConnection {
  initializeHandler: ((params: InitializeParams) => InitializeResult) | null = null;

  initializedHandler: ((params: Record<string, never>) => void) | null = null;

  shutdownHandler: (() => void | Promise<void>) | null = null;

  executeCommandHandler: ((params: any) => void | Promise<void>) | null = null;

  codeActionHandler: ((params: any, token?: CancellationToken) => CodeAction[]) | null = null;

  codeActionResolveHandler: ((action: CodeAction, token?: CancellationToken) => CodeAction) | null = null;

  codeLensHandler: ((params: any, token?: CancellationToken) => CodeLens[]) | null = null;

  completionHandler: ((params: any, token?: CancellationToken) => CompletionItem[] | { items: CompletionItem[] } | Promise<CompletionItem[] | { items: CompletionItem[] }>) | null = null;

  completionResolveHandler: ((item: CompletionItem, token?: CancellationToken) => CompletionItem) | null = null;

  documentHighlightHandler: ((params: any, token?: CancellationToken) => DocumentHighlight[]) | null = null;

  documentSymbolHandler: ((params: any, token?: CancellationToken) => DocumentSymbol[]) | null = null;

  workspaceSymbolHandler: ((params: WorkspaceSymbolParams, token?: CancellationToken) => SymbolInformation[]) | null = null;

  definitionHandler: ((params: any, token?: CancellationToken) => Definition | null) | null = null;

  referencesHandler: ((params: any, token?: CancellationToken) => Location[]) | null = null;

  prepareRenameHandler: ((params: TextDocumentPositionParams, token?: CancellationToken) => Range | null) | null = null;

  renameHandler: ((params: RenameParams, token?: CancellationToken) => WorkspaceEdit | null) | null = null;

  hoverHandler: any = null;

  inlayHintHandler: ((params: any, token?: CancellationToken) => InlayHint[]) | null = null;

  selectionRangesHandler: ((params: any, token?: CancellationToken) => SelectionRange[]) | null = null;

  signatureHelpHandler: ((params: any, token?: CancellationToken) => SignatureHelp | null) | null = null;

  foldingRangesHandler: ((params: any, token?: CancellationToken) => FoldingRange[]) | null = null;

  semanticTokensHandler: ((params: any, token?: CancellationToken) => SemanticTokens) | null = null;

  semanticTokensRangeHandler: ((params: any, token?: CancellationToken) => SemanticTokens) | null = null;

  watchedFilesHandler: ((params: DidChangeWatchedFilesParams) => void) | null = null;

  didChangeConfigurationHandler: ((params: DidChangeConfigurationParams) => void) | null = null;

  definitionRegistrations = 0;

  referencesRegistrations = 0;

  prepareRenameRegistrations = 0;

  renameRegistrations = 0;

  formattingRegistrations = 0;

  rangeFormattingRegistrations = 0;

  onTypeFormattingRegistrations = 0;

  formattingHandler: ((params: DocumentFormattingParams, token?: CancellationToken) => TextEdit[]) | null =
    null;

  rangeFormattingHandler: ((params: DocumentRangeFormattingParams, token?: CancellationToken) => TextEdit[]) | null =
    null;

  onTypeFormattingHandler: ((params: DocumentOnTypeFormattingParams, token?: CancellationToken) => TextEdit[]) | null = null;

  readonly customRequestHandlers = new Map<string, (params: unknown) => unknown | Promise<unknown>>();

  readonly diagnostics: Array<{ uri: string; version?: number; diagnostics: readonly Diagnostic[] }> = [];

  readonly clientRegistrations: Array<{ method: string; registerOptions: unknown }> = [];

  readonly requests: string[] = [];

  readonly traceMessages: Array<{ message: string; verbose?: string }> = [];

  readonly consoleMessages: string[] = [];

  readonly tracer = {
    log: (message: string, verbose?: string) => {
      this.traceMessages.push({ message, verbose });
    },
  };

  readonly console = {
    log: (message: string) => {
      this.consoleMessages.push(message);
    },
  };

  readonly client = {
    register: async (type: { method: string }, registerOptions?: unknown) => {
      this.clientRegistrations.push({ method: type.method, registerOptions });
      return createDisposable();
    },
  };

  readonly languages = {
    inlayHint: {
      on: (handler: (params: any, token?: CancellationToken) => InlayHint[]) => {
        this.inlayHintHandler = handler;
        return createDisposable();
      },
    },
    semanticTokens: {
      on: (handler: (params: any, token?: CancellationToken) => SemanticTokens) => {
        this.semanticTokensHandler = handler;
        return createDisposable();
      },
      onRange: (handler: (params: any, token?: CancellationToken) => SemanticTokens) => {
        this.semanticTokensRangeHandler = handler;
        return createDisposable();
      },
    },
  };

  onInitialize(handler: (params: InitializeParams) => InitializeResult) {
    this.initializeHandler = handler;
    return createDisposable();
  }

  onShutdown(handler: () => void | Promise<void>) {
    this.shutdownHandler = handler;
    return createDisposable();
  }

  onInitialized(handler: (params: Record<string, never>) => void) {
    this.initializedHandler = handler;
    return createDisposable();
  }

  onExecuteCommand(handler: (params: any) => void | Promise<void>) {
    this.executeCommandHandler = handler;
    return createDisposable();
  }

  onCodeAction(handler: (params: any, token?: CancellationToken) => CodeAction[]) {
    this.codeActionHandler = handler;
    return createDisposable();
  }

  onCodeActionResolve(handler: (action: CodeAction, token?: CancellationToken) => CodeAction) {
    this.codeActionResolveHandler = handler;
    return createDisposable();
  }

  onCodeLens(handler: (params: any, token?: CancellationToken) => CodeLens[]) {
    this.codeLensHandler = handler;
    return createDisposable();
  }

  onCompletion(handler: (params: any, token?: CancellationToken) => CompletionItem[] | { items: CompletionItem[] } | Promise<CompletionItem[] | { items: CompletionItem[] }>) {
    this.completionHandler = handler;
    return createDisposable();
  }

  onCompletionResolve(handler: (item: CompletionItem, token?: CancellationToken) => CompletionItem) {
    this.completionResolveHandler = handler;
    return createDisposable();
  }

  onDocumentSymbol(handler: (params: any, token?: CancellationToken) => DocumentSymbol[]) {
    this.documentSymbolHandler = handler;
    return createDisposable();
  }

  onWorkspaceSymbol(handler: (params: WorkspaceSymbolParams, token?: CancellationToken) => SymbolInformation[]) {
    this.workspaceSymbolHandler = handler;
    return createDisposable();
  }

  onDocumentHighlight(handler: (params: any, token?: CancellationToken) => DocumentHighlight[]) {
    this.documentHighlightHandler = handler;
    return createDisposable();
  }

  onSelectionRanges(handler: (params: any, token?: CancellationToken) => SelectionRange[]) {
    this.selectionRangesHandler = handler;
    return createDisposable();
  }

  onHover(handler: (params: any, token?: CancellationToken) => Hover | null) {
    this.hoverHandler = handler;
    return createDisposable();
  }

  onSignatureHelp(handler: (params: any, token?: CancellationToken) => SignatureHelp | null) {
    this.signatureHelpHandler = handler;
    return createDisposable();
  }

  onFoldingRanges(handler: (params: any, token?: CancellationToken) => FoldingRange[]) {
    this.foldingRangesHandler = handler;
    return createDisposable();
  }

  onDefinition(handler: (params: any, token?: CancellationToken) => Definition | null) {
    this.definitionHandler = handler;
    this.definitionRegistrations += 1;
    return createDisposable();
  }

  onReferences(handler: (params: ReferenceParams, token?: CancellationToken) => Location[]) {
    this.referencesHandler = handler;
    this.referencesRegistrations += 1;
    return createDisposable();
  }

  onPrepareRename(handler: (params: TextDocumentPositionParams, token?: CancellationToken) => Range | null) {
    this.prepareRenameHandler = handler;
    this.prepareRenameRegistrations += 1;
    return createDisposable();
  }

  onRenameRequest(handler: (params: RenameParams, token?: CancellationToken) => WorkspaceEdit | null) {
    this.renameHandler = handler;
    this.renameRegistrations += 1;
    return createDisposable();
  }

  onDocumentFormatting(handler: (params: DocumentFormattingParams, token?: CancellationToken) => TextEdit[]) {
    this.formattingHandler = handler;
    this.formattingRegistrations += 1;
    return createDisposable();
  }

  onDocumentRangeFormatting(
    handler: (params: DocumentRangeFormattingParams, token?: CancellationToken) => TextEdit[],
  ) {
    this.rangeFormattingHandler = handler;
    this.rangeFormattingRegistrations += 1;
    return createDisposable();
  }

  onDocumentOnTypeFormatting(
    handler: (params: DocumentOnTypeFormattingParams, token?: CancellationToken) => TextEdit[],
  ) {
    this.onTypeFormattingHandler = handler;
    this.onTypeFormattingRegistrations += 1;
    return createDisposable();
  }

  onDidChangeWatchedFiles(handler: (params: DidChangeWatchedFilesParams) => void) {
    this.watchedFilesHandler = handler;
    return createDisposable();
  }

  onDidChangeConfiguration(handler: (params: DidChangeConfigurationParams) => void) {
    this.didChangeConfigurationHandler = handler;
    return createDisposable();
  }

  onRequest(method: string, handler: (params: unknown) => unknown | Promise<unknown>) {
    this.customRequestHandlers.set(method, handler);
    return createDisposable();
  }

  async handleRequest(method: string, params: unknown = null) {
    const handler = this.customRequestHandlers.get(method);
    if (!handler) {
      throw new Error(`No request handler registered for ${method}`);
    }

    return handler(params);
  }

  sendRequest(type: { method: string } | string) {
    this.requests.push(typeof type === 'string' ? type : type.method);
    return Promise.resolve(undefined);
  }

  sendDiagnostics(params: { uri: string; version?: number; diagnostics: readonly Diagnostic[] }) {
    this.diagnostics.push(params);
    return Promise.resolve();
  }

  listen() {
    return undefined;
  }

  async shutdown() {
    await this.shutdownHandler?.();
  }
}

class FakeDocuments {
  private readonly documents = new Map<string, TextDocument>();

  private readonly openListeners: Array<(event: { document: TextDocument }) => void> = [];

  private readonly changeListeners: Array<(event: { document: TextDocument }) => void> = [];

  private readonly closeListeners: Array<(event: { document: TextDocument }) => void> = [];

  readonly onDidOpen = (listener: (event: { document: TextDocument }) => void) => {
    this.openListeners.push(listener);
    return createDisposable();
  };

  readonly onDidChangeContent = (listener: (event: { document: TextDocument }) => void) => {
    this.changeListeners.push(listener);
    return createDisposable();
  };

  readonly onDidClose = (listener: (event: { document: TextDocument }) => void) => {
    this.closeListeners.push(listener);
    return createDisposable();
  };

  get(uri: string) {
    return this.documents.get(uri);
  }

  all() {
    return [...this.documents.values()];
  }

  listen() {
    return createDisposable();
  }

  open(uri: string, text: string, version: number, languageId: string = 'cbs') {
    const document = TextDocument.create(uri, languageId, version, text);
    this.documents.set(uri, document);
    this.openListeners.forEach((listener) => {
      listener({ document });
    });
    return document;
  }

  change(uri: string, text: string, version: number, languageId: string = 'cbs') {
    const document = TextDocument.create(uri, languageId, version, text);
    this.documents.set(uri, document);
    this.changeListeners.forEach((listener) => {
      listener({ document });
    });
    return document;
  }

  close(uri: string) {
    const document = this.documents.get(uri);
    if (!document) {
      throw new Error(`No document found for ${uri}`);
    }

    this.documents.delete(uri);
    this.closeListeners.forEach((listener) => {
      listener({ document });
    });
  }
}

function getLastDiagnostics(connection: FakeConnection) {
  const diagnostics = connection.diagnostics[connection.diagnostics.length - 1];
  expect(diagnostics).toBeDefined();
  return diagnostics!;
}

function getLatestDiagnosticsForUri(connection: FakeConnection, uri: string) {
  const diagnostics = [...connection.diagnostics].reverse().find((entry) => entry.uri === uri);
  expect(diagnostics).toBeDefined();
  return diagnostics!;
}

async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-server-integration-'));
  tempRoots.push(root);
  return root;
}

async function writeWorkspaceFile(root: string, relativePath: string, text: string): Promise<string> {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, text, 'utf8');
  return pathToFileURL(absolutePath).href;
}

async function waitForDocumentChangeRefresh(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 170));
}

function createCancellationToken(cancelled: boolean = false): CancellationToken {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: () => createDisposable(),
  };
}

function captureProviderBundle(options: {
  connection: FakeConnection;
  uri: string;
  text: string;
  completionNeedle: string;
  completionCharacterOffset: number;
  completionOccurrence?: number;
  diagnostics: readonly Diagnostic[];
  hoverNeedle: string;
  hoverCharacterOffset: number;
  hoverOccurrence?: number;
}) {
  const completion = getCompletionItems(
    options.connection.completionHandler?.(
      {
        textDocument: { uri: options.uri },
        position: positionAt(
          options.text,
          options.completionNeedle,
          options.completionCharacterOffset,
          options.completionOccurrence ?? 0,
        ),
      },
      createCancellationToken(false),
    ),
  );
  const hover =
    options.connection.hoverHandler?.(
      {
        textDocument: { uri: options.uri },
        position: positionAt(
          options.text,
          options.hoverNeedle,
          options.hoverCharacterOffset,
          options.hoverOccurrence ?? 0,
        ),
      },
      createCancellationToken(false),
    ) ?? null;
  const codeActions =
    options.connection.codeActionHandler?.(
      {
        textDocument: { uri: options.uri },
        range: options.diagnostics[0]?.range ?? {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        context: { diagnostics: options.diagnostics },
      },
      createCancellationToken(false),
    ) ?? [];
  const documentSymbols =
    options.connection.documentSymbolHandler?.(
      {
        textDocument: { uri: options.uri },
      },
      createCancellationToken(false),
    ) ?? [];
  const snapshot = snapshotProviderBundle({
    codeActions,
    completion,
    diagnostics: options.diagnostics,
    documentSymbols,
    hover,
  });

  return {
    raw: {
      codeActions,
      completion,
      diagnostics: options.diagnostics,
      documentSymbols,
      hover,
    },
    serialized: serializeProviderBundleForGolden(snapshot),
    snapshot,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  fragmentAnalysisService.clearAll();
});

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('LSP server integration', () => {
  it('advertises and registers only the fragment-local capabilities in scope', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const luaLsManager = createLuaLsProcessManagerStub();

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });

    const initializeResult = connection.initializeHandler?.({
      capabilities: {},
    } as InitializeParams);

    expect(initializeResult).toEqual(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          positionEncoding: LSP_POSITION_ENCODING,
          textDocumentSync: {
            openClose: true,
            change: TextDocumentSyncKind.Incremental,
          },
          codeLensProvider: {
            resolveProvider: false,
          },
          codeActionProvider: {
            resolveProvider: true,
          },
          executeCommandProvider: {
            commands: [ACTIVATION_CHAIN_CODELENS_COMMAND],
          },
          completionProvider: {
            triggerCharacters: [...CBS_COMPLETION_TRIGGER_CHARACTERS],
            resolveProvider: true,
          },
          definitionProvider: true,
          documentHighlightProvider: true,
          documentSymbolProvider: true,
          workspaceSymbolProvider: true,
          documentFormattingProvider: true,
          documentRangeFormattingProvider: true,
          documentOnTypeFormattingProvider: {
            firstTriggerCharacter: '\n',
          },
          selectionRangeProvider: true,
          referencesProvider: true,
          renameProvider: true,
          hoverProvider: true,
          inlayHintProvider: true,
          signatureHelpProvider: {
            triggerCharacters: [':'],
          },
          foldingRangeProvider: true,
          semanticTokensProvider: {
            legend: {
              tokenTypes: [...SEMANTIC_TOKEN_TYPES],
              tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
            },
            full: true,
            range: true,
          },
        }),
        experimental: {
          cbs: expect.objectContaining({
            availability: expect.objectContaining({
              companions: expect.objectContaining({
                luals: expect.objectContaining({
                  executablePath: '/mock/luals',
                  health: 'idle',
                  status: 'stopped',
                }),
              }),
            }),
            availabilitySnapshot: expect.objectContaining({
              schema: 'cbs-lsp-agent-contract',
              schemaVersion: '1.0.0',
            }),
            operator: expect.objectContaining({
              scope: expect.objectContaining({
                multiFileEdit: 'off',
                readOnlyBridge: 'on',
              }),
            }),
          }),
        },
      }),
    );

    expect(connection.codeLensHandler).not.toBeNull();
    expect(connection.selectionRangesHandler).not.toBeNull();
    expect(connection.codeActionHandler).not.toBeNull();
    expect(connection.codeActionResolveHandler).not.toBeNull();
    expect(connection.completionHandler).not.toBeNull();
    expect(connection.completionResolveHandler).not.toBeNull();
    expect(connection.documentHighlightHandler).not.toBeNull();
    expect(connection.documentSymbolHandler).not.toBeNull();
    expect(connection.workspaceSymbolHandler).not.toBeNull();
    expect(connection.formattingHandler).not.toBeNull();
    expect(connection.rangeFormattingHandler).not.toBeNull();
    expect(connection.onTypeFormattingHandler).not.toBeNull();
    expect(connection.definitionHandler).not.toBeNull();
    expect(connection.referencesHandler).not.toBeNull();
    expect(connection.prepareRenameHandler).not.toBeNull();
    expect(connection.renameHandler).not.toBeNull();
    expect(connection.hoverHandler).not.toBeNull();
    expect(connection.inlayHintHandler).not.toBeNull();
    expect(connection.signatureHelpHandler).not.toBeNull();
    expect(connection.foldingRangesHandler).not.toBeNull();
    expect(connection.semanticTokensHandler).not.toBeNull();
    expect(connection.semanticTokensRangeHandler).not.toBeNull();
    expect(connection.executeCommandHandler).not.toBeNull();
    expect(connection.definitionRegistrations).toBe(1);
    expect(connection.referencesRegistrations).toBe(1);
    expect(connection.prepareRenameRegistrations).toBe(1);
    expect(connection.renameRegistrations).toBe(1);
    expect(connection.formattingRegistrations).toBe(1);
    expect(connection.rangeFormattingRegistrations).toBe(1);
    expect(connection.onTypeFormattingRegistrations).toBe(1);
  });

  it('owns the lorebook CodeLens command through executeCommandProvider as a no-op', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();

    registerServer(
      connection as unknown as Parameters<typeof registerServer>[0],
      documents as unknown as Parameters<typeof registerServer>[1],
    );
    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);

    await expect(
      connection.executeCommandHandler?.({
        command: ACTIVATION_CHAIN_CODELENS_COMMAND,
        arguments: [{ kind: 'summary', uri: 'file:///fixtures/alpha.risulorebook' }],
      }),
    ).resolves.toBeNull();
  });

  it('rejects unknown executeCommand requests after registering the CodeLens no-op command', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();

    registerServer(connection as any, documents as any);
    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);

    await expect(
      connection.executeCommandHandler?.({
        command: 'cbs-lsp.unknownCommand',
        arguments: [],
      }),
    ).rejects.toMatchObject({
      code: LSPErrorCodes.RequestFailed,
      message: 'Unsupported server command: cbs-lsp.unknownCommand',
    });
  });

  it('exposes the runtime availability snapshot through a custom LSP request', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    let runtime = createLuaLsCompanionRuntime({
      detail:
        'LuaLS executable was resolved and the sidecar is ready to start after the main LSP server finishes initialization.',
      executablePath: '/mock/luals',
      health: 'idle',
      status: 'stopped',
    });
    const luaLsManager = createLuaLsProcessManagerStub({
      getRuntime: vi.fn(() => runtime),
      prepareForInitialize: vi.fn(() => runtime),
      start: vi.fn(async () => {
        runtime = createLuaLsCompanionRuntime({
          detail: 'LuaLS sidecar finished initialize/initialized handshake and is healthy.',
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        });
        return runtime;
      }),
    });

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });

    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);
    const beforeStart = await connection.handleRequest(CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD);

    expect(beforeStart).toEqual(
      expect.objectContaining({
        schema: 'cbs-lsp-agent-contract',
        schemaVersion: '1.0.0',
        companions: [expect.objectContaining({ status: 'stopped', health: 'idle' })],
        operator: expect.objectContaining({
          scope: {
            deferredEditFeatures: [
              'cross-language-rename',
              'cross-language-workspace-edit',
              'cross-language-code-action',
            ],
            detail:
              'Scope honesty MVP keeps read-only bridge on and multi-file edit off. Cross-language rename, workspace edit, and code action stay deferred until authoritative edit merge rules exist.',
            multiFileEdit: 'off',
            readOnlyBridge: 'on',
          },
          workspace: expect.objectContaining({
            resolvedWorkspaceRoot: null,
            resolvedWorkspaceRootSource: 'none',
          }),
        }),
      }),
    );

    connection.initializedHandler?.({});
    await Promise.resolve();

    const afterStart = await connection.handleRequest(CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD);

    expect(afterStart).toEqual(
      expect.objectContaining({
        companions: [
          expect.objectContaining({
            status: 'ready',
            health: 'healthy',
            detail: 'LuaLS sidecar finished initialize/initialized handshake and is healthy.',
          }),
        ],
      }),
    );
    expect(connection.traceMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: '[cbs-lsp:server] runtime-availability-query-start' }),
        expect.objectContaining({ message: '[cbs-lsp:server] runtime-availability-query-payload' }),
        expect.objectContaining({ message: '[cbs-lsp:server] runtime-availability-query-end' }),
      ]),
    );
  });

  it('advertises richer capability options only when the client supports them', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const luaLsManager = createLuaLsProcessManagerStub();

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });

    const initializeResult = connection.initializeHandler?.({
      capabilities: {
        textDocument: {
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [CodeActionKind.QuickFix],
              },
            },
          },
          publishDiagnostics: {
            versionSupport: true,
          },
          rename: {
            prepareSupport: true,
          },
        },
      },
    } as InitializeParams);

    expect(initializeResult?.capabilities.codeActionProvider).toEqual({
      codeActionKinds: ['quickfix'],
      resolveProvider: true,
    });
    expect(initializeResult?.capabilities.positionEncoding).toBe(LSP_POSITION_ENCODING);
    expect(initializeResult?.capabilities.renameProvider).toEqual({
      prepareProvider: true,
    });
    expect(initializeResult?.capabilities.executeCommandProvider).toEqual({
      commands: [ACTIVATION_CHAIN_CODELENS_COMMAND],
    });
  });

  it('keeps diagnostics, hover, rename, and semantic token ranges aligned for mixed Hangul and emoji text', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const uri = 'file:///fixtures/server-unicode-range.risulorebook';
    const text = lorebookDocument([
      '한🙂 {{setvar::기분::행복}}',
      '{{getvar::기분}}',
      '{{gettempvar::없음}}',
    ]);

    registerServer(connection as any, documents as any);
    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);
    documents.open(uri, text, 1);

    const diagnostics = getLastDiagnostics(connection).diagnostics;
    const undefinedDiagnostic = diagnostics.find((diagnostic) => diagnostic.code === 'CBS101');

    expect(undefinedDiagnostic?.range).toEqual({
      start: positionAt(text, '없음', 0),
      end: positionAt(text, '없음', '없음'.length),
    });

    const hover = await connection.hoverHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '기분', 1, 1),
      },
      createCancellationToken(false),
    );

    expect(getHoverMarkdown(hover ?? null)).toContain('기분');

    const renameRange = connection.prepareRenameHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '기분', 1, 1),
      },
      createCancellationToken(false),
    );

    expect(renameRange).toEqual({
      start: positionAt(text, '기분', 0, 1),
      end: positionAt(text, '기분', '기분'.length, 1),
    });

    const semanticTokens = connection.semanticTokensHandler?.(
      {
        textDocument: { uri },
      },
      createCancellationToken(false),
    );
    const decodedTokens = decodeSemanticTokenTexts(semanticTokens?.data ?? [], text);

    expect(decodedTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          line: 4,
          startChar: positionAt(text, '기분', 0, 0).character,
          text: '기분',
        }),
        expect.objectContaining({
          line: 5,
          startChar: positionAt(text, '기분', 0, 1).character,
          text: '기분',
        }),
      ]),
    );
  });

  it('includes diagnostics version only when the client advertises version support', () => {
    const unsupportedConnection = new FakeConnection();
    const supportedConnection = new FakeConnection();
    const unsupportedDocuments = new FakeDocuments();
    const supportedDocuments = new FakeDocuments();
    const uri = 'file:///fixtures/server-versioned-diagnostics.risulorebook';
    const text = lorebookDocument(['{{setvar::mood::happy}}', '{{getvar::mood}}']);

    registerServer(unsupportedConnection as any, unsupportedDocuments as any);
    unsupportedConnection.initializeHandler?.({ capabilities: {} } as InitializeParams);
    unsupportedDocuments.open(uri, text, 7);

    registerServer(supportedConnection as any, supportedDocuments as any);
    supportedConnection.initializeHandler?.({
      capabilities: {
        textDocument: {
          publishDiagnostics: {
            versionSupport: true,
          },
        },
      },
    } as InitializeParams);
    supportedDocuments.open(uri, text, 7);

    expect(getLastDiagnostics(unsupportedConnection).version).toBeUndefined();
    expect(getLastDiagnostics(supportedConnection).version).toBe(7);
  });

  it('connects the LuaLS sidecar manager to initialize, initialized, and shutdown lifecycle hooks', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const luaLsManager = createLuaLsProcessManagerStub();

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });

    const initializeResult = connection.initializeHandler?.({
      capabilities: {},
      rootUri: 'file:///workspace-root',
    } as InitializeParams);

    expect(luaLsManager.prepareForInitialize).toHaveBeenCalledWith({
      overrideExecutablePath: null,
      rootPath: '/workspace-root',
    });
    expect(initializeResult?.experimental?.cbs?.availability.companions.luals).toMatchObject({
      executablePath: '/mock/luals',
      health: 'idle',
      status: 'stopped',
    });

    connection.initializedHandler?.({});
    await Promise.resolve();

    expect(luaLsManager.start).toHaveBeenCalledWith(
      expect.objectContaining({ rootPath: '/workspace-root' }),
    );

    await connection.shutdown();

    expect(luaLsManager.shutdown).toHaveBeenCalledTimes(1);
  });

  it('routes workspace .risulua files into LuaLS virtual documents during workspace refresh', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const luaLsManager = createLuaLsProcessManagerStub();
    const luaText = 'local mood = getState("mood")\n';
    const lorebookText = lorebookDocument(['{{getvar::mood}}']);
    const luaUri = await writeWorkspaceFile(root, 'lua/companion.risulua', luaText);
    const lorebookUri = await writeWorkspaceFile(root, 'lorebooks/entry.risulorebook', lorebookText);

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });

    documents.open(lorebookUri, lorebookText, 1);

    expect(luaLsManager.syncDocument).toHaveBeenCalledWith({
      sourceUri: luaUri,
      sourceFilePath: path.join(root, 'lua/companion.risulua'),
      transportUri: createLuaLsTransportUri(path.join(root, 'lua/companion.risulua')),
      languageId: 'lua',
      rootPath: root,
      version: createSyntheticDocumentVersion(luaText),
      text: luaText,
    });
    expect(luaLsManager.refreshWorkspaceConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        rootPath: root,
      }),
    );
  });

  it('applies runtime config precedence before initialize options when preparing standalone startup', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const luaLsManager = createLuaLsProcessManagerStub();

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
      runtimeConfig: {
        logLevel: 'info',
        luaLsExecutablePath: '/cli/lua-language-server',
      },
    });

    connection.initializeHandler?.({
      capabilities: {},
      initializationOptions: {
        cbs: {
          logLevel: 'debug',
          luaLs: {
            executablePath: '/initialize/lua-language-server',
          },
          workspace: '/initialize/workspace',
        },
      },
      rootUri: pathToFileURL('/root/workspace').toString(),
    } as InitializeParams);

    expect(luaLsManager.prepareForInitialize).toHaveBeenCalledWith({
      overrideExecutablePath: '/cli/lua-language-server',
      rootPath: '/initialize/workspace',
    });
    expect(connection.traceMessages).toEqual([]);
    expect(connection.consoleMessages).toEqual([
      '[cbs-lsp:server] initialize textDocumentSync=2',
    ]);
  });

  it('reloads runtime config from workspace/didChangeConfiguration, leaves guidance for immutable options, and refreshes tracked workspaces', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const lorebookText = lorebookDocument(['{{getvar::mood}}']);
    const lorebookUri = await writeWorkspaceFile(root, 'lorebooks/config-reload.risulorebook', lorebookText);
    const luaLsManager = createLuaLsProcessManagerStub();

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    connection.initializeHandler?.({
      capabilities: {
        workspace: {
          codeLens: { refreshSupport: true },
          didChangeWatchedFiles: { dynamicRegistration: true },
        },
      },
      rootUri: pathToFileURL(root).toString(),
    } as InitializeParams);
    connection.initializedHandler?.({});
    documents.open(lorebookUri, lorebookText, 1);

    const diagnosticsCountBeforeReload = connection.diagnostics.filter(
      (entry) => entry.uri === lorebookUri,
    ).length;

    connection.didChangeConfigurationHandler?.({
      settings: {
        cbs: {
          runtimeConfig: {
            logLevel: 'info',
            luaLs: {
              executablePath: '/reconfigured/lua-language-server',
            },
            workspace: '/reconfigured/workspace',
          },
          diagnostics: {
            mode: 'strict',
          },
          formatting: {
            style: 'canonical',
          },
        },
      },
    });

    expect(luaLsManager.prepareForInitialize).toHaveBeenLastCalledWith({
      overrideExecutablePath: '/reconfigured/lua-language-server',
      rootPath: '/reconfigured/workspace',
    });
    expect(luaLsManager.restart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rootPath: '/reconfigured/workspace',
      }),
    );
    expect(connection.requests).toContain('workspace/codeLens/refresh');
    expect(connection.diagnostics.filter((entry) => entry.uri === lorebookUri)).toHaveLength(
      diagnosticsCountBeforeReload + 1,
    );
    expect(connection.consoleMessages).toEqual(
      expect.arrayContaining([
        '[cbs-lsp:server] config-reload changedFields=3 logLevel=info workspaceRoot=/reconfigured/workspace',
        expect.stringContaining('[cbs-lsp:server] config-guidance key=diagnostics'),
        expect.stringContaining('[cbs-lsp:server] config-guidance key=formatting'),
      ]),
    );

    const traceCountAfterReload = connection.traceMessages.length;
    connection.watchedFilesHandler?.({
      changes: [{ uri: lorebookUri, type: FileChangeType.Changed }],
    });

    expect(connection.traceMessages).toHaveLength(traceCountAfterReload);
  });

  it('reports operator workspace policy and active failure modes through initialize payloads', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();

    registerServer(connection as any, documents as any);

    const initializeResult = connection.initializeHandler?.({
      capabilities: {},
      workspaceFolders: [
        { uri: pathToFileURL('/workspace/primary').toString(), name: 'primary' },
        { uri: pathToFileURL('/workspace/secondary').toString(), name: 'secondary' },
      ],
    } as InitializeParams);

    const operator = initializeResult?.experimental?.cbs?.operator;

    expect(operator?.workspace).toEqual(
      expect.objectContaining({
        initializeWorkspaceFolderCount: 2,
        multiRootMode: 'first-workspace-folder',
        resolvedWorkspaceRoot: '/workspace/primary',
        resolvedWorkspaceRootSource: 'initialize.workspaceFolders[0]',
      }),
    );
    expect(operator?.failureModes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'multi-root-reduced', active: true }),
        expect.objectContaining({ key: 'watched-files-client-unsupported', active: true }),
        expect.objectContaining({ key: 'workspace-root-unresolved', active: false }),
      ]),
    );
  });

  it('routes standalone .risulua open/change/close through the LuaLS document mirror', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const luaLsManager = createLuaLsProcessManagerStub();
    const uri = 'file:///tmp/standalone.risulua';
    const initialText = 'local mood = getState("mood")\n';
    const changedText = 'local mood = getState("nextMood")\n';

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });

    documents.open(uri, initialText, 1, 'lua');
    documents.change(uri, changedText, 2, 'lua');
    documents.close(uri);

    expect(luaLsManager.syncDocument).toHaveBeenNthCalledWith(1, {
      sourceUri: uri,
      sourceFilePath: '/tmp/standalone.risulua',
      transportUri: expect.stringContaining('/tmp/standalone.risulua.lua'),
      languageId: 'lua',
      rootPath: null,
      version: 1,
      text: initialText,
    });
    expect(luaLsManager.syncDocument).toHaveBeenNthCalledWith(2, {
      sourceUri: uri,
      sourceFilePath: '/tmp/standalone.risulua',
      transportUri: expect.stringContaining('/tmp/standalone.risulua.lua'),
      languageId: 'lua',
      rootPath: null,
      version: 2,
      text: changedText,
    });
    expect(luaLsManager.closeDocument).toHaveBeenCalledWith(uri);
  });

  it('routes .risulua hover through the LuaLS proxy seam and keeps trace output honest', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const requestSpy = vi.fn();
    const luaLsManager = createLuaLsProcessManagerStub({
      getRuntime: vi.fn(() =>
        createLuaLsCompanionRuntime({
          detail: 'LuaLS sidecar finished initialize/initialized handshake and is healthy.',
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        }),
      ),
      request: async <TResult>(method: string, params: unknown): Promise<TResult | null> => {
        requestSpy(method, params);
        expect(method).toBe('textDocument/hover');
        expect(params).toMatchObject({
          textDocument: {
            uri: expect.stringContaining('/tmp/hover.risulua.lua'),
          },
          position: {
            line: 0,
            character: 7,
          },
        });

        return {
          contents: {
            kind: 'markdown',
            value: '```lua\nlocal user: string\n```',
          },
        } as TResult;
      },
    });
    const uri = 'file:///tmp/hover.risulua';
    const text = 'local user = "hi"\nreturn user\n';

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);
    connection.initializedHandler?.({});
    documents.open(uri, text, 1, 'lua');

    const hover = await connection.hoverHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, 'user', 1),
      },
      createCancellationToken(false),
    );

    expect(getHoverMarkdown(hover ?? null)).toContain('local user: string');
    expect(snapshotLuaHoverEnvelope(hover ?? null, luaLsManager.getRuntime())).toEqual({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      availability: expect.objectContaining({
        companions: [
          expect.objectContaining({
            executablePath: '/mock/luals',
            health: 'healthy',
            status: 'ready',
          }),
        ],
        features: expect.arrayContaining([
          expect.objectContaining({
            key: 'luaHover',
            scope: 'local-only',
            source: 'lua-provider:hover-proxy',
          }),
          expect.objectContaining({
            key: 'lua-completion',
            scope: 'local-only',
          }),
          expect.objectContaining({
            key: 'lua-diagnostics',
            scope: 'local-only',
          }),
        ]),
      }),
      hover: {
        contents: {
          kind: 'markdown',
          value: '```lua\nlocal user: string\n```',
        },
        range: null,
      },
      provenance: {
        reason: 'contextual-inference',
        source: 'lua-provider:hover-proxy',
        detail:
          'Lua hover snapshots normalize live LuaLS hover responses from mirrored `.risulua` documents, preserve range/content deterministically, and keep deferred Lua completion/diagnostics boundaries visible through the shared availability envelope.',
      },
    });
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(connection.traceMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: '[cbs-lsp:luaProxy] hover-start' }),
        expect.objectContaining({ message: '[cbs-lsp:luaProxy] hover-end' }),
      ]),
    );
  });

  it('routes .risulua completion through the LuaLS proxy seam and keeps trace output honest', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const requestSpy = vi.fn();
    const luaLsManager = createLuaLsProcessManagerStub({
      getRuntime: vi.fn(() =>
        createLuaLsCompanionRuntime({
          detail: 'LuaLS sidecar finished initialize/initialized handshake and is healthy.',
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        }),
      ),
      request: async <TResult>(method: string, params: unknown): Promise<TResult | null> => {
        requestSpy(method, params);
        expect(method).toBe('textDocument/completion');
        expect(params).toMatchObject({
          textDocument: {
            uri: expect.stringContaining('/tmp/completion.risulua.lua'),
          },
          position: {
            line: 0,
            character: 7,
          },
        });

        return {
          isIncomplete: false,
          items: [{ label: 'getState' }],
        } as TResult;
      },
    });
    const uri = 'file:///tmp/completion.risulua';
    const text = 'local user = getState("user")\nreturn user\n';

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);
    connection.initializedHandler?.({});
    documents.open(uri, text, 1, 'lua');

    const completion = await connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, 'user', 1),
      },
      createCancellationToken(false),
    );

    expect(getCompletionItems(completion ?? null).map((item) => item.label)).toEqual(
      expect.arrayContaining(['getState']),
    );
    expect(requestSpy).toHaveBeenCalledTimes(1);
  expect(connection.traceMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: '[cbs-lsp:luaProxy] completion-start' }),
        expect.objectContaining({ message: '[cbs-lsp:luaProxy] completion-end' }),
      ]),
    );
  });

  it('keeps CBS hover and completion available in .risulua when LuaLS is unavailable', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const requestSpy = vi.fn(async () => null);
    const luaLsManager = createLuaLsProcessManagerStub({
      getRuntime: vi.fn(() =>
        createLuaLsCompanionRuntime({
          detail: 'LuaLS executable was not found on PATH.',
          executablePath: null,
          health: 'unavailable',
          status: 'unavailable',
        }),
      ),
      request: requestSpy,
    });
    const uri = 'file:///tmp/cbs-fallback.risulua';
    const text = 'local cbs = "{{user}} {{getvar::ct_NoStretchSpeech}}"\nlocal next = "{{"\n';

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);
    connection.initializedHandler?.({});
    documents.open(uri, text, 1, 'lua');

    const hover = await connection.hoverHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, 'user', 1),
      },
      createCancellationToken(false),
    );
    const functionHover = await connection.hoverHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, 'getvar', 1),
      },
      createCancellationToken(false),
    );
    const completion = await connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{', 2, 1),
      },
      createCancellationToken(false),
    );
    const completionLabels = getCompletionItems(completion ?? null).map((item) => item.label);

    expect(getHoverMarkdown(hover ?? null)).toContain('**user**');
    expect(getHoverMarkdown(functionHover ?? null)).toContain('getvar');
    expect(completionLabels).toEqual(expect.arrayContaining(['user', 'char', 'getvar']));
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(connection.traceMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: '[cbs-lsp:completion] build' }),
        expect.objectContaining({ message: '[cbs-lsp:luaProxy] completion-start' }),
        expect.objectContaining({ message: '[cbs-lsp:hover] end' }),
      ]),
    );
  });

  it('risulua-cbs routes CBS variable argument completion inside .risulua string literals when LuaLS is unavailable', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const uri = 'file:///tmp/risulua-cbs-getvar-completion.risulua';
    const text = 'local cbs = "{{setvar::mood::happy}} {{getvar::}}"\n';

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1, 'lua');

    const completionItems = getCompletionItems(
      await connection.completionHandler?.(
        {
          textDocument: { uri },
          position: positionAt(text, '{{getvar::', '{{getvar::'.length),
        },
        createCancellationToken(false),
      ),
    );

    expect(completionItems.some((item) => item.label === 'mood')).toBe(true);
    expect(completionItems.every((item) => item.kind === CompletionItemKind.Variable)).toBe(true);
  });

  it('risulua-cbs routes CBS #when operator completion inside .risulua string literals when LuaLS is unavailable', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const uri = 'file:///tmp/risulua-cbs-when-completion.risulua';
    const text = 'local cbs = "{{setvar::mood::happy}} {{#when::mood::}}ok{{/}}"\n';

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1, 'lua');

    const completionItems = getCompletionItems(
      await connection.completionHandler?.(
        {
          textDocument: { uri },
          position: positionAt(text, '{{#when::mood::', '{{#when::mood::'.length),
        },
        createCancellationToken(false),
      ),
    );

    expect(completionItems.some((item) => item.label === 'is')).toBe(true);
    expect(completionItems.some((item) => item.label === 'isnot')).toBe(true);
    expect(completionItems.some((item) => item.label === 'mood')).toBe(true);
  });

  it('risulua-cbs keeps workspace variable completions visible while .risulua text is ahead of the workspace snapshot', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const uri = await writeWorkspaceFile(
      root,
      'lua/completion-stale.risulua',
      'local cbs = "{{getvar::}}"\n',
    );
    await writeWorkspaceFile(
      root,
      'prompt_template/completion-writer.risuprompt',
      promptDocument(['{{setvar::shared::from-workspace}}']),
    );

    registerServer(connection as any, documents as any);
    documents.open(uri, 'local cbs = "{{getvar::}}"\n', 1, 'lua');
    await waitForDocumentChangeRefresh();

    const changedText = 'local cbs = "{{getvar::}}" -- typing keeps document newer than snapshot\n';
    documents.change(uri, changedText, 2, 'lua');

    const completionItems = getCompletionItems(
      await connection.completionHandler?.(
        {
          textDocument: { uri },
          position: positionAt(changedText, '{{getvar::', '{{getvar::'.length),
        },
        createCancellationToken(false),
      ),
    );
    const sharedCompletion = completionItems.find((item) => item.label === 'shared');

    expect(sharedCompletion).toBeDefined();
    expect(sharedCompletion?.sortText).toBe('zzzz-workspace-shared');
  });

  it('merges VariableGraph state-key overlay completions into `.risulua` LuaLS results for getState string arguments', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const luaText = 'local user = getState("sh")\nreturn user\n';
    const writerText = promptDocument(['{{setvar::shared::ready}}', '{{setvar::shadow::ok}}']);
    const luaUri = await writeWorkspaceFile(root, 'lua/completion.risulua', luaText);
    await writeWorkspaceFile(root, 'prompt_template/writer.risuprompt', writerText);
    const requestSpy = vi.fn(async () => {
      return {
        isIncomplete: false,
        items: [{ label: 'getState(' }, { label: 'getLoreBooks(' }],
      } as CompletionList;
    });
    const luaLsManager = createLuaLsProcessManagerStub({
      getRuntime: vi.fn(() =>
        createLuaLsCompanionRuntime({
          detail: 'LuaLS sidecar is ready to serve proxied completion requests.',
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        }),
      ),
      request: requestSpy,
    });

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    documents.open(luaUri, luaText, 1, 'lua');

    const completion = await connection.completionHandler?.(
      {
        textDocument: { uri: luaUri },
        position: positionAt(luaText, 'sh', 2),
      },
      createCancellationToken(false),
    );

    expect(getCompletionItems(completion ?? null).map((item) => item.label)).toEqual([
      'shadow',
      'shared',
      'getState(',
      'getLoreBooks(',
    ]);
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps `.risulua` state-key completion candidates stable when completion is triggered from the opening quote', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const luaText = 'local user = getState("shared")\nreturn user\n';
    const writerText = promptDocument(['{{setvar::shared::ready}}', '{{setvar::shadow::ok}}']);
    const luaUri = await writeWorkspaceFile(root, 'lua/completion-trigger.risulua', luaText);
    await writeWorkspaceFile(root, 'prompt_template/writer-trigger.risuprompt', writerText);
    const requestSpy = vi.fn(async () => {
      return {
        isIncomplete: false,
        items: [{ label: 'getState(' }, { label: 'getLoreBooks(' }],
      } as CompletionList;
    });
    const luaLsManager = createLuaLsProcessManagerStub({
      getRuntime: vi.fn(() =>
        createLuaLsCompanionRuntime({
          detail: 'LuaLS sidecar is ready to serve proxied completion requests.',
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        }),
      ),
      request: requestSpy,
    });

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    documents.open(luaUri, luaText, 1, 'lua');

    const completion = await connection.completionHandler?.(
      {
        textDocument: { uri: luaUri },
        position: positionAt(luaText, '"', 1),
      },
      createCancellationToken(false),
    );

    expect(getCompletionItems(completion ?? null).map((item) => item.label)).toEqual([
      'shadow',
      'shared',
      'getState(',
      'getLoreBooks(',
    ]);
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it('merges RisuAI runtime global completions into `.risulua` when LuaLS returns no candidates', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const uri = 'file:///tmp/runtime-completion.risulua';
    const text = 'local result = ax\n';
    const requestSpy = vi.fn(async () => []);
    const luaLsManager = createLuaLsProcessManagerStub({
      getRuntime: vi.fn(() =>
        createLuaLsCompanionRuntime({
          detail: 'LuaLS sidecar is ready to serve proxied completion requests.',
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        }),
      ),
      request: requestSpy,
    });

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);
    connection.initializedHandler?.({});
    documents.open(uri, text, 1, 'lua');

    const completion = await connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, 'ax', 2),
      },
      createCancellationToken(false),
    );
    const labels = getCompletionItems(completion ?? null).map((item) => item.label);

    expect(labels).toContain('axLLM');
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps LuaLS generated runtime completion labels deduped in `.risulua`', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const uri = 'file:///tmp/runtime-completion-dedupe.risulua';
    const text = 'local state = get\n';
    const requestSpy = vi.fn(async () => ({
      isIncomplete: false,
      items: [{ label: 'getState(' }, { label: 'getLoreBooks(' }],
    }));
    const luaLsManager = createLuaLsProcessManagerStub({
      getRuntime: vi.fn(() =>
        createLuaLsCompanionRuntime({
          detail: 'LuaLS sidecar is ready to serve proxied completion requests.',
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        }),
      ),
      request: requestSpy,
    });

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);
    connection.initializedHandler?.({});
    documents.open(uri, text, 1, 'lua');

    const completion = await connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, 'get', 3),
      },
      createCancellationToken(false),
    );
    const labels = getCompletionItems(completion ?? null).map((item) => item.label);

    expect(labels.filter((label) => label === 'getState(')).toHaveLength(1);
    expect(labels).not.toContain('getState');
    expect(labels).toContain('getChat');
  });

  it('merges read-only cross-language bridge hover into `.risulua` LuaLS hover for getState string arguments', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const luaText = 'local mood = getState("shared")\nreturn mood\n';
    const writerText = promptDocument(['{{setvar::shared::ready}}']);
    const readerText = promptDocument(['{{getvar::shared}}']);
    const luaUri = await writeWorkspaceFile(root, 'lua/hover-bridge.risulua', luaText);
    await writeWorkspaceFile(root, 'prompt_template/writer.risuprompt', writerText);
    await writeWorkspaceFile(root, 'prompt_template/reader.risuprompt', readerText);
    const requestSpy = vi.fn(async () => {
      return {
        contents: {
          kind: 'markdown',
          value: '```lua\nlocal mood: string\n```',
        },
      };
    });
    const luaLsManager = createLuaLsProcessManagerStub({
      getRuntime: vi.fn(() =>
        createLuaLsCompanionRuntime({
          detail: 'LuaLS sidecar is ready to serve proxied hover requests.',
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        }),
      ),
      request: requestSpy,
    });

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    documents.open(luaUri, luaText, 1, 'lua');

    const hover = await connection.hoverHandler?.(
      {
        textDocument: { uri: luaUri },
        position: positionAt(luaText, 'shared', 2),
      },
      createCancellationToken(false),
    );

    expect(normalizeLuaHoverForSnapshot(hover ?? null)).toEqual({
      contents: {
        kind: 'markdown',
        value: expect.stringContaining('**Workspace state bridge:** `shared`'),
      },
      range: null,
    });
    expect(normalizeLuaHoverForSnapshot(hover ?? null)?.contents.value).toContain(
      '```lua\nlocal mood: string\n```',
    );
    expect(normalizeLuaHoverForSnapshot(hover ?? null)?.contents.value).toContain(
      'Current Lua access: reads via `getState`',
    );
    expect(normalizeLuaHoverForSnapshot(hover ?? null)?.contents.value).toContain('Lua writers: 0');
    expect(normalizeLuaHoverForSnapshot(hover ?? null)?.contents.value).toContain('CBS writers: 1');
    expect(normalizeLuaHoverForSnapshot(hover ?? null)?.contents.value).toContain(
      'prompt_template/writer.risuprompt',
    );
    expect(normalizeLuaHoverForSnapshot(hover ?? null)?.contents.value).toContain(
      'Workspace issues: uninitialized-read, phase-order-risk',
    );
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it('publishes `.risulua` diagnostics through the LuaLS sidecar seam and starts unavailable by default', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    let runtime = createLuaLsCompanionRuntime({
      detail: 'LuaLS executable was not found on PATH.',
      health: 'unavailable',
      status: 'unavailable',
    });
    const luaLsManager = createLuaLsProcessManagerStub({
      getRuntime: vi.fn(() => runtime),
      prepareForInitialize: vi.fn(() => runtime),
      start: vi.fn(async () => runtime),
    });
    const uri = 'file:///tmp/diagnostics.risulua';
    const text = 'local mood = missingValue\nreturn mood\n';

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    connection.initializeHandler?.({
      capabilities: {
        textDocument: {
          publishDiagnostics: {
            versionSupport: true,
          },
        },
      },
    } as InitializeParams);
    connection.initializedHandler?.({});
    documents.open(uri, text, 1, 'lua');

    const unavailableDiagnostics = [...connection.diagnostics].reverse().find((entry) => entry.uri === uri);
    expect(snapshotHostDiagnosticsEnvelope(unavailableDiagnostics?.diagnostics ?? [], runtime)).toEqual(
      expect.objectContaining({
        availability: expect.objectContaining({
          companions: [
            expect.objectContaining({
              health: 'unavailable',
              status: 'unavailable',
            }),
          ],
          features: expect.arrayContaining([
            expect.objectContaining({
              key: 'lua-diagnostics',
              scope: 'local-only',
              source: 'lua-provider:diagnostics-proxy',
            }),
          ]),
        }),
        diagnostics: [],
      }),
    );

    runtime = createLuaLsCompanionRuntime({
      detail: 'LuaLS sidecar finished initialize/initialized handshake and is healthy.',
      executablePath: '/mock/luals',
      health: 'healthy',
      status: 'ready',
    });
    luaLsManager.emitPublishDiagnostics({
      diagnostics: [
        {
          message: 'Undefined global `missingValue`',
          range: {
            start: { line: 0, character: 13 },
            end: { line: 0, character: 25 },
          },
          severity: 1,
          source: 'LuaLS',
        },
      ],
      sourceUri: uri,
      transportUri: expect.stringContaining('/tmp/diagnostics.risulua.lua'),
      version: 1,
    });

    const liveDiagnostics = [...connection.diagnostics].reverse().find(
      (entry) => entry.uri === uri && entry.diagnostics.length === 1,
    );
    expect(liveDiagnostics).toEqual({
      uri,
      version: 1,
      diagnostics: [
        {
          message: 'Undefined global `missingValue`',
          range: {
            start: { line: 0, character: 13 },
            end: { line: 0, character: 25 },
          },
          severity: 1,
          source: 'LuaLS',
        },
      ],
    });
    expect(snapshotHostDiagnosticsEnvelope(liveDiagnostics?.diagnostics ?? [], runtime)).toEqual(
      expect.objectContaining({
        availability: expect.objectContaining({
          companions: [
            expect.objectContaining({
              health: 'healthy',
              status: 'ready',
            }),
          ],
          features: expect.arrayContaining([
            expect.objectContaining({
              key: 'lua-diagnostics',
              scope: 'local-only',
              source: 'lua-provider:diagnostics-proxy',
            }),
          ]),
        }),
        diagnostics: [
          {
            code: null,
            data: null,
            message: 'Undefined global `missingValue`',
            range: {
              start: { line: 0, character: 13 },
              end: { line: 0, character: 25 },
            },
            relatedInformation: [],
            severity: 1,
            source: 'LuaLS',
          },
        ],
      }),
    );
  });

  it('routes textDocument/formatting through the server seam and keeps edits inside CBS fragments', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const text = lorebookDocument(['Hello {{ user }} {{#if true}}yes{{:else}}no{{/}}']);
    const uri = await writeWorkspaceFile(root, 'lorebooks/formatting.risulorebook', text);

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    const edits = connection.formattingHandler?.(
      {
        textDocument: { uri },
        options: { tabSize: 2, insertSpaces: true },
      },
      createCancellationToken(false),
    );

    expect(edits).toHaveLength(1);
    expect(applyTextEdits(text, edits ?? [])).toBe(
      lorebookDocument(['Hello {{user}} {{#if::true}}yes{{:else}}no{{/if}}']),
    );

    const onTypeEdits = connection.onTypeFormattingHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{ user }}'),
        ch: '\n',
        options: { tabSize: 2, insertSpaces: true },
      },
      createCancellationToken(false),
    );

    expect(onTypeEdits).toHaveLength(1);
    expect(applyTextEdits(text, onTypeEdits ?? [])).toBe(
      lorebookDocument(['Hello {{user}} {{#if::true}}yes{{:else}}no{{/if}}']),
    );
  });

  it('routes textDocument/rangeFormatting through the server seam only for a single owning fragment', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const text = regexDocument(['{{ user }}'], ['{{#if ready}}ok{{/}}']);
    const uri = await writeWorkspaceFile(root, 'regex/range-formatting.risuregex', text);

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    const singleFragmentEdits = connection.rangeFormattingHandler?.(
      {
        textDocument: { uri },
        range: {
          start: positionAt(text, '{{ user }}'),
          end: positionAt(text, '{{ user }}', '{{ user }}'.length),
        },
        options: { tabSize: 2, insertSpaces: true },
      },
      createCancellationToken(false),
    );

    expect(singleFragmentEdits).toHaveLength(1);
    expect(applyTextEdits(text, singleFragmentEdits ?? [])).toBe(
      regexDocument(['{{user}}'], ['{{#if ready}}ok{{/}}']),
    );

    const crossFragmentEdits = connection.rangeFormattingHandler?.(
      {
        textDocument: { uri },
        range: {
          start: positionAt(text, '{{ user }}'),
          end: positionAt(text, '{{#if ready}}ok{{/}}', '{{#if ready}}ok{{/}}'.length),
        },
        options: { tabSize: 2, insertSpaces: true },
      },
      createCancellationToken(false),
    );

    expect(crossFragmentEdits).toEqual([]);
  });

  it('routes textDocument/documentSymbol through the server seam and exposes fragment-aware outline symbols', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const text = regexDocument(
      ['{{#when::ready}}', 'in body', '{{/}}'],
      ['{{#each items as item}}', '{{slot::item}}', '{{/each}}'],
    );
    const uri = await writeWorkspaceFile(root, 'regex/outline.risuregex', text);

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    const symbols = connection.documentSymbolHandler?.(
      {
        textDocument: { uri },
      },
      createCancellationToken(false),
    );

    expect(symbols).toEqual([
      expect.objectContaining({
        name: 'IN',
        children: [
          expect.objectContaining({
            name: '#when::ready',
          }),
        ],
      }),
      expect.objectContaining({
        name: 'OUT',
        children: [
          expect.objectContaining({
            name: '#each items as item',
          }),
        ],
      }),
    ]);

    const snapshot = snapshotDocumentSymbolsEnvelope(symbols ?? []);

    expect(snapshot).toEqual({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      availability: expect.objectContaining({
        features: expect.arrayContaining([
          expect.objectContaining({
            key: 'documentSymbol',
            scope: 'local-only',
            source: 'server-capability:documentSymbol',
          }),
        ]),
      }),
      provenance: {
        reason: 'contextual-inference',
        source: 'document-symbol:outline-builder',
        detail:
          'Document symbol snapshots are derived from routed CBS fragment AST blocks, keep host selection/range coordinates, and add section containers only when multiple CBS-bearing fragments exist in the same host document.',
      },
      symbols: [
        {
          children: [
            expect.objectContaining({
              name: '#when::ready',
              fragmentContainer: false,
              section: null,
              symbolKind: 'object',
            }),
          ],
          fragmentContainer: true,
          name: 'IN',
          range: expect.objectContaining({}),
          section: 'IN',
          selectionRange: expect.objectContaining({}),
          symbolKind: 'namespace',
        },
        {
          children: [
            expect.objectContaining({
              name: '#each items as item',
              fragmentContainer: false,
              section: null,
              symbolKind: 'array',
            }),
          ],
          fragmentContainer: true,
          name: 'OUT',
          range: expect.objectContaining({}),
          section: 'OUT',
          selectionRange: expect.objectContaining({}),
          symbolKind: 'namespace',
        },
      ],
    });

    expect(serializeDocumentSymbolsEnvelopeForGolden(snapshot)).toBe(
      serializeDocumentSymbolsEnvelopeForGolden(
        snapshotDocumentSymbolsEnvelope([...(symbols ?? [])].reverse()),
      ),
    );
  });

  it('routes workspace/symbol through the server seam and exposes deterministic workspace-wide symbols', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const lorebookUri = await writeWorkspaceFile(
      root,
      'lorebooks/hero.risulorebook',
      lorebookDocument(['{{setvar::affection::10}}', '{{#func greetHero target}}Hello{{/func}}']),
    );
    await writeWorkspaceFile(
      root,
      'prompts/dialog.risuprompt',
      ['---', 'type: plain', '---', '@@@ TEXT', '{{getvar::affection}}', '@@@ INNER_FORMAT', 'plain', ''].join('\n'),
    );

    registerServer(connection as any, documents as any);
    documents.open(lorebookUri, lorebookDocument(['{{setvar::affection::10}}', '{{#func greetHero target}}Hello{{/func}}']), 1);
    connection.initializeHandler?.({
      capabilities: {},
      workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'primary' }],
    } as InitializeParams);
    connection.initializedHandler?.({});
    await Promise.resolve();

    const symbols = connection.workspaceSymbolHandler?.(
      { query: 'gh' },
      createCancellationToken(false),
    );
    const affectionSymbols = connection.workspaceSymbolHandler?.(
      { query: 'aff' },
      createCancellationToken(false),
    );

    expect(symbols).toEqual([
      expect.objectContaining({
        name: 'greetHero',
        containerName: 'lorebooks/hero.risulorebook#CONTENT',
      }),
    ]);
    expect(affectionSymbols).toEqual([
      expect.objectContaining({
        name: 'affection',
        containerName: 'lorebooks/hero.risulorebook',
      }),
    ]);

    const snapshot = snapshotWorkspaceSymbolsEnvelope(connection.workspaceSymbolHandler?.(
      { query: '' },
      createCancellationToken(false),
    ) ?? []);

    expect(snapshot).toEqual({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      availability: expect.objectContaining({
        features: expect.arrayContaining([
          expect.objectContaining({
            key: 'workspaceSymbol',
            scope: 'local-first',
            source: 'server-capability:workspaceSymbol',
          }),
        ]),
      }),
      provenance: {
        reason: 'contextual-inference',
        source: 'workspace-symbol:workspace-builder',
        detail:
          'Workspace symbol snapshots are derived from ElementRegistry, UnifiedVariableGraph, ActivationChainService, and fragment analysis. They expose workspace-wide variables, CBS local functions, lorebook entries, and prompt sections while preserving deterministic prefix/fuzzy query ordering.',
      },
      symbols: expect.arrayContaining([
        expect.objectContaining({
          name: 'affection',
          containerName: 'lorebooks/hero.risulorebook',
          symbolKind: 'variable',
          uri: lorebookUri,
        }),
        expect.objectContaining({
          name: 'greetHero',
          containerName: 'lorebooks/hero.risulorebook#CONTENT',
          symbolKind: 'function',
          uri: lorebookUri,
        }),
        expect.objectContaining({
          name: 'entry',
          containerName: 'lorebooks/hero.risulorebook',
          symbolKind: 'namespace',
          uri: lorebookUri,
        }),
        expect.objectContaining({
          name: 'TEXT',
          containerName: 'prompts/dialog.risuprompt',
          symbolKind: 'module',
        }),
        expect.objectContaining({
          name: 'INNER_FORMAT',
          containerName: 'prompts/dialog.risuprompt',
          symbolKind: 'module',
        }),
      ]),
    });

    expect(serializeWorkspaceSymbolsEnvelopeForGolden(snapshot)).toBe(
      serializeWorkspaceSymbolsEnvelopeForGolden(
        snapshotWorkspaceSymbolsEnvelope([...(connection.workspaceSymbolHandler?.(
          { query: '' },
          createCancellationToken(false),
        ) ?? [])].reverse()),
      ),
    );
  });

  it('routes textDocument/inlayHint through the server seam and exposes fragment-safe parameter hints', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const text = lorebookDocument([
      '{{setvar::mood::happy}}{{getvar::mood}}',
      '{{#when mood}}active{{/when}}',
      '{{#each items as item}}{{slot::item}}{{/each}}',
      '{{#func greet name greeting}}{{arg::0}}{{arg::1}}{{/func}}',
      '{{call::greet::Noel::hi}}',
    ]);
    const uri = await writeWorkspaceFile(root, 'lorebooks/inlay.risulorebook', text);

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    const inlayHints = connection.inlayHintHandler?.(
      {
        textDocument: { uri },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 999, character: 999 },
        },
      },
      createCancellationToken(false),
    );

    expect(inlayHints).toBeTruthy();
    const labels = inlayHints?.map((hint) => hint.label) ?? [];
    expect(labels).toContain('name:');
    expect(labels).toContain('value:');
    expect(labels).toContain('condition:');
    expect(labels).toContain('iterator:');
    expect(labels).toContain('alias:');
    expect(labels).toContain('arg::0 \u2192 name:');
    expect(labels).toContain('arg::1 \u2192 greeting:');
    expect(labels).toContain('func:');
    expect(labels).toContain('arg::0 \u2192 name:');
    expect(labels).toContain('arg::1 \u2192 greeting:');
  });

  it('routes textDocument/selectionRange through the server seam and keeps the chain fragment-safe', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const text = lorebookDocument(['{{#when::true}}Hello {{user}}{{/when}}']);
    const uri = await writeWorkspaceFile(root, 'lorebooks/selection-range.risulorebook', text);

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    const result = connection.selectionRangesHandler?.(
      {
        textDocument: { uri },
        positions: [positionAt(text, 'user', 1, 0)],
      },
      createCancellationToken(false),
    );

    expect(result).toHaveLength(1);
    const chain = flattenSelectionRangeChain(result?.[0]);
    expect(chain).toHaveLength(4);
    expect(chain[0]!.start.line).toBeGreaterThanOrEqual(4);
    expect(chain.at(-1)!.start.line).toBe(4);
    expect(chain.at(-1)!.start.character).toBeLessThan(chain[0]!.start.character);
    expect(chain.at(-1)!.end.character).toBeGreaterThan(chain[0]!.end.character);
  });

  it('routes textDocument/codeAction through the server seam and returns safe quick fixes plus guidance actions', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const deprecatedText = lorebookDocument(['{{#if true}}fallback{{/if}}']);
    const slotText = promptDocument(['{{slot::item}}']);
    const deprecatedUri = await writeWorkspaceFile(root, 'lorebooks/deprecated.risulorebook', deprecatedText);
    const slotUri = await writeWorkspaceFile(root, 'prompt_template/slot.risuprompt', slotText);

    registerServer(connection as any, documents as any);
    documents.open(deprecatedUri, deprecatedText, 1);
    documents.open(slotUri, slotText, 1);

    const deprecatedDiagnostics = getLatestDiagnosticsForUri(connection, deprecatedUri).diagnostics;
    const deprecatedActions = connection.codeActionHandler?.(
      {
        textDocument: { uri: deprecatedUri },
        range: deprecatedDiagnostics[0]!.range,
        context: { diagnostics: deprecatedDiagnostics },
      },
      createCancellationToken(false),
    );

    expect(snapshotCodeActionsEnvelope(deprecatedActions ?? [])).toEqual({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      availability: expect.objectContaining({
        features: expect.arrayContaining([
          expect.objectContaining({
            key: 'codeAction',
            scope: 'local-only',
            source: 'server-capability:codeAction',
          }),
        ]),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          edit: null,
          title: 'Replace with "#when"',
          kind: CodeActionKind.QuickFix,
          hasEdit: false,
          isNoopGuidance: false,
          isPreferred: true,
          resolved: false,
          linkedDiagnostics: [expect.objectContaining({ code: 'CBS100', source: 'risu-cbs' })],
        }),
      ]),
    });

    expect(deprecatedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Replace with "#when"' }),
      ]),
    );

    const deprecatedAction = deprecatedActions?.find((action) => action.title === 'Replace with "#when"');
    expect(deprecatedAction?.edit).toBeUndefined();

    const resolvedDeprecatedAction = connection.codeActionResolveHandler?.(
      deprecatedAction!,
      createCancellationToken(false),
    );
    expect(applyTextEdits(deprecatedText, resolvedDeprecatedAction?.edit?.changes?.[deprecatedUri] ?? [])).toBe(
      lorebookDocument(['{{#when true}}fallback{{/when}}']),
    );

    const slotDiagnostics = getLatestDiagnosticsForUri(connection, slotUri).diagnostics;
    const slotActions = connection.codeActionHandler?.(
      {
        textDocument: { uri: slotUri },
        range: slotDiagnostics[0]!.range,
        context: { diagnostics: slotDiagnostics },
      },
      createCancellationToken(false),
    );

    expect(snapshotCodeActionsEnvelope(slotActions ?? [])).toEqual({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      availability: expect.objectContaining({
        features: expect.arrayContaining([
          expect.objectContaining({
            key: 'codeAction',
            scope: 'local-only',
          }),
        ]),
      }),
      actions: [
        {
          edit: null,
          hasEdit: false,
          isNoopGuidance: false,
          isPreferred: false,
          kind: CodeActionKind.QuickFix,
          linkedDiagnostics: [expect.objectContaining({ source: 'risu-cbs' })],
          resolved: false,
          title: 'Explain: {{slot::name}} only works inside {{#each ... as name}} blocks',
        },
      ],
    });

    expect(slotActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Explain: {{slot::name}} only works inside {{#each ... as name}} blocks',
        }),
      ]),
    );

    const slotAction = slotActions?.find(
      (action) => action.title === 'Explain: {{slot::name}} only works inside {{#each ... as name}} blocks',
    );
    expect(slotAction?.edit).toBeUndefined();

    const resolvedSlotAction = connection.codeActionResolveHandler?.(slotAction!, createCancellationToken(false));
    expect(resolvedSlotAction).toMatchObject({
      title: 'Explain: {{slot::name}} only works inside {{#each ... as name}} blocks',
      edit: { changes: {} },
    });
  });

  it('keeps formatting on the no-op path for unsupported artifacts', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const text = 'enabled=true';
    const uri = await writeWorkspaceFile(root, 'variables/ignored-toggle.risutoggle', text);

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1, 'plaintext');

    const edits = connection.formattingHandler?.(
      {
        textDocument: { uri },
        options: { tabSize: 2, insertSpaces: true },
      },
      createCancellationToken(false),
    );

    expect(edits).toEqual([]);
  });

  it('routes textDocument/definition through the server seam and returns local-first plus workspace writers and readers', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const readerText = lorebookDocument([
      '{{setvar::shared::happy}}',
      '{{getvar::shared}}',
    ]);
    const writerText = promptDocument(['{{setvar::shared::from-workspace}}']);
    const externalReaderText = promptDocument(['{{getvar::shared}}']);
    const readerUri = await writeWorkspaceFile(root, 'lorebooks/reader.risulorebook', readerText);
    const writerUri = await writeWorkspaceFile(root, 'prompt_template/writer.risuprompt', writerText);
    const externalReaderUri = await writeWorkspaceFile(
      root,
      'prompt_template/z-external-reader.risuprompt',
      externalReaderText,
    );

    registerServer(connection as any, documents as any);
    documents.open(readerUri, readerText, 1);
    documents.open(writerUri, writerText, 1);
    documents.open(externalReaderUri, externalReaderText, 1);
    await waitForDocumentChangeRefresh();

    const definition = connection.definitionHandler?.(
      {
        textDocument: { uri: readerUri },
        position: positionAt(readerText, 'shared', 2, 1),
      },
      createCancellationToken(false),
    );

    expect(definition).not.toBeNull();
    expect(definition).toEqual([
      expect.objectContaining({
        targetUri: readerUri,
      }),
      expect.objectContaining({
        targetUri: readerUri,
      }),
      expect.objectContaining({
        targetUri: writerUri,
      }),
      expect.objectContaining({
        targetUri: externalReaderUri,
      }),
    ]);
  });

  it('routes textDocument/definition from getvar arguments to .risuvar default variable keys', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const readerText = lorebookDocument(['{{getvar::tea}}']);
    const variableText = 'tea=1\nasd=3\n';
    const readerUri = await writeWorkspaceFile(root, 'lorebooks/reader.risulorebook', readerText);
    const variableUri = await writeWorkspaceFile(root, 'variables/defaults.risuvar', variableText);

    registerServer(connection as any, documents as any);
    documents.open(readerUri, readerText, 1);
    await waitForDocumentChangeRefresh();

    const definition = connection.definitionHandler?.(
      {
        textDocument: { uri: readerUri },
        position: positionAt(readerText, 'tea', 1),
      },
      createCancellationToken(false),
    );

    expect(definition).toEqual([
      expect.objectContaining({
        targetUri: readerUri,
      }),
      expect.objectContaining({
        targetUri: variableUri,
        targetRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 3 },
        },
      }),
    ]);
  });

  it('resolves `.risulua` CBS function variable arguments against workspace defaults', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const luaText = 'local cbs = "{{getvar::ct_tempvar}}"\n';
    const variableText = 'ct_tempvar=true\n';
    const luaUri = await writeWorkspaceFile(root, 'lua/reader.risulua', luaText);
    const variableUri = await writeWorkspaceFile(root, 'variables/defaults.risuvar', variableText);

    registerServer(connection as any, documents as any);
    documents.open(luaUri, luaText, 1, 'lua');
    await waitForDocumentChangeRefresh();

    const definition = await Promise.resolve(connection.definitionHandler?.(
      {
        textDocument: { uri: luaUri },
        position: positionAt(luaText, 'ct_tempvar', 1),
      },
      createCancellationToken(false),
    ) as unknown);
    const hover = await connection.hoverHandler?.(
      {
        textDocument: { uri: luaUri },
        position: positionAt(luaText, 'ct_tempvar', 1),
      },
      createCancellationToken(false),
    );
    const latestDiagnostics = [...connection.diagnostics]
      .reverse()
      .find((entry) => entry.uri === luaUri)?.diagnostics ?? [];

    expect(definition).toEqual([
      expect.objectContaining({
        targetUri: variableUri,
        targetRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 'ct_tempvar'.length },
        },
      }),
    ]);
    expect(getHoverMarkdown(hover ?? null)).toContain('**Variable: ct_tempvar**');
    expect(getHoverMarkdown(hover ?? null)).toContain('- Default value: true');
    expect(latestDiagnostics.map((diagnostic) => diagnostic.message)).not.toContain(
      'CBS variable "ct_tempvar" is referenced without a local definition',
    );
  });

  it('routes textDocument/references through the server seam and returns local-first plus workspace readers and writers', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const readerText = lorebookDocument([
      '{{setvar::shared::happy}}',
      '{{getvar::shared}}',
    ]);
    const writerText = promptDocument(['{{setvar::shared::from-workspace}}']);
    const externalReaderText = promptDocument(['{{getvar::shared}}']);
    const readerUri = await writeWorkspaceFile(root, 'lorebooks/reader.risulorebook', readerText);
    const writerUri = await writeWorkspaceFile(root, 'prompt_template/writer.risuprompt', writerText);
    const externalReaderUri = await writeWorkspaceFile(
      root,
      'prompt_template/reader.risuprompt',
      externalReaderText,
    );

    registerServer(connection as any, documents as any);
    documents.open(readerUri, readerText, 1);
    documents.open(writerUri, writerText, 1);
    documents.open(externalReaderUri, externalReaderText, 1);

    const references = connection.referencesHandler?.(
      {
        textDocument: { uri: readerUri },
        position: positionAt(readerText, 'shared', 2, 1),
        context: { includeDeclaration: true },
      },
      createCancellationToken(false),
    );

    expect(references).not.toBeNull();
    expect(references).toEqual([
      expect.objectContaining({ uri: readerUri }),
      expect.objectContaining({ uri: readerUri }),
      expect.objectContaining({ uri: writerUri }),
      expect.objectContaining({ uri: externalReaderUri }),
    ]);
  });

  it('routes textDocument/prepareRename through the server seam and returns a host range plus provider rejection messages', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const renameText = lorebookDocument([
      '{{setvar::shared::happy}}',
      '{{getvar::shared}}',
    ]);
    const unresolvedText = lorebookDocument(['{{getvar::missing}}']);
    const renameUri = await writeWorkspaceFile(root, 'lorebooks/rename.risulorebook', renameText);
    const unresolvedUri = await writeWorkspaceFile(
      root,
      'lorebooks/unresolved.risulorebook',
      unresolvedText,
    );

    registerServer(connection as any, documents as any);
    documents.open(renameUri, renameText, 1);
    documents.open(unresolvedUri, unresolvedText, 1);

    const range = connection.prepareRenameHandler?.(
      {
        textDocument: { uri: renameUri },
        position: positionAt(renameText, 'shared', 2, 1),
      },
      createCancellationToken(false),
    );

    expect(range).toEqual({
      start: positionAt(renameText, 'shared', 0, 1),
      end: positionAt(renameText, 'shared', 6, 1),
    });

    expect(() =>
      connection.prepareRenameHandler?.(
        {
          textDocument: { uri: unresolvedUri },
          position: positionAt(unresolvedText, 'missing', 1),
        },
        createCancellationToken(false),
      ),
    ).toThrow('Unresolved chat variable: missing');

    expect(() =>
      connection.prepareRenameHandler?.(
        {
          textDocument: { uri: renameUri },
          position: { line: 1, character: 2 },
        },
        createCancellationToken(false),
      ),
    ).toThrow('Position not within CBS fragment');
  });

  it('routes textDocument/rename through the server seam and returns local-first plus workspace edits', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const readerText = lorebookDocument([
      '{{setvar::shared::happy}}',
      '{{getvar::shared}}',
    ]);
    const writerText = promptDocument(['{{setvar::shared::from-workspace}}']);
    const readerUri = await writeWorkspaceFile(root, 'lorebooks/reader.risulorebook', readerText);
    const writerUri = await writeWorkspaceFile(root, 'prompt_template/writer.risuprompt', writerText);

    registerServer(connection as any, documents as any);
    documents.open(readerUri, readerText, 1);
    documents.open(writerUri, writerText, 1);

    const edit = connection.renameHandler?.(
      {
        textDocument: { uri: readerUri },
        position: positionAt(readerText, 'shared', 2, 1),
        newName: 'emotion',
      },
      createCancellationToken(false),
    );

    expect(edit?.documentChanges).toEqual([
      expect.objectContaining({
        textDocument: expect.objectContaining({ uri: readerUri }),
      }),
      expect.objectContaining({
        textDocument: expect.objectContaining({ uri: writerUri }),
      }),
    ]);
  });

  it('routes textDocument/hover through the server seam and merges workspace variable summaries by request URI', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const readerText = lorebookDocument(['{{getvar::shared}}']);
    const writerText = promptDocument(['{{setvar::shared::from-workspace}}']);
    const readerUri = await writeWorkspaceFile(root, 'lorebooks/reader.risulorebook', readerText);
    const writerUri = await writeWorkspaceFile(root, 'prompt_template/writer.risuprompt', writerText);

    registerServer(connection as any, documents as any);
    documents.open(readerUri, readerText, 1);
    documents.open(writerUri, writerText, 1);

    const hover = connection.hoverHandler?.(
      {
        textDocument: { uri: readerUri },
        position: positionAt(readerText, 'shared', 1),
      },
      createCancellationToken(false),
    );
    const markdown = getHoverMarkdown(hover ?? null);

    expect(markdown).toContain('**Variable: shared**');
    expect(markdown).toContain('Workspace writers: 1');
    expect(markdown).toContain('Workspace readers: 1');
    expect(markdown).toContain('Representative writers:');
    expect(markdown).toContain('prompt_template/writer.risuprompt (line 5, character 11)');
  });

  it('routes CBS completion through the server seam and appends workspace chat variables after local candidates', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const readerText = lorebookDocument(['{{setvar::localOnly::ready}}', '{{getvar::}}']);
    const writerText = promptDocument(['{{setvar::shared::from-workspace}}']);
    const readerUri = await writeWorkspaceFile(root, 'lorebooks/completion-reader.risulorebook', readerText);
    await writeWorkspaceFile(root, 'prompt_template/completion-writer.risuprompt', writerText);

    registerServer(connection as any, documents as any);
    documents.open(readerUri, readerText, 1);

    const completionItems = getCompletionItems(
      connection.completionHandler?.(
        {
          textDocument: { uri: readerUri },
          position: positionAt(readerText, '{{getvar::', '{{getvar::'.length),
        },
        createCancellationToken(false),
      ),
    );
    const localIndex = completionItems.findIndex((item) => item.label === 'localOnly');
    const workspaceIndex = completionItems.findIndex((item) => item.label === 'shared');
    const workspaceCompletion = completionItems.find((item) => item.label === 'shared');

    expect(localIndex).toBeGreaterThanOrEqual(0);
    expect(workspaceIndex).toBeGreaterThan(localIndex);
    expect(workspaceCompletion).toMatchObject({
      sortText: 'zzzz-workspace-shared',
      data: {
        cbs: expect.objectContaining({
          uri: readerUri,
          category: expect.objectContaining({ category: 'variable' }),
        }),
      },
    });
    expect(workspaceCompletion?.detail).toBeUndefined();

    const resolved = connection.completionResolveHandler?.(workspaceCompletion!, createCancellationToken(false));
    expect(resolved).toMatchObject({
      label: 'shared',
      detail: 'Workspace chat variable',
      data: {
        cbs: expect.objectContaining({
          explanation: expect.objectContaining({
            reason: 'scope-analysis',
            source: 'workspace-chat-variable-graph:macro-argument',
          }),
        }),
      },
    });
  });

  it('keeps rename on the no-op path when a same-URI workspace merge would touch a sibling fragment', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const regexText = regexDocument(['{{setvar::shared::one}}'], ['{{getvar::shared}}']);
    const regexUri = await writeWorkspaceFile(root, 'regex/shared.risuregex', regexText);

    registerServer(connection as any, documents as any);
    documents.open(regexUri, regexText, 1);

    const edit = connection.renameHandler?.(
      {
        textDocument: { uri: regexUri },
        position: positionAt(regexText, 'shared', 1),
        newName: 'renamed',
      },
      createCancellationToken(false),
    );

    expect(edit).toBeNull();
  });

  it('shows lorebook activation CodeLens summaries from ActivationChainService workspace state', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const alphaText = getFixtureCorpusEntry('lorebook-activation-alpha').text;
    const betaText = getFixtureCorpusEntry('lorebook-activation-beta').text;
    const gammaText = getFixtureCorpusEntry('lorebook-activation-gamma').text;
    const deltaText = getFixtureCorpusEntry('lorebook-activation-delta').text;
    const alphaUri = await writeWorkspaceFile(root, 'lorebooks/alpha.risulorebook', alphaText);
    await writeWorkspaceFile(root, 'lorebooks/beta.risulorebook', betaText);
    await writeWorkspaceFile(root, 'lorebooks/gamma.risulorebook', gammaText);
    await writeWorkspaceFile(root, 'lorebooks/delta.risulorebook', deltaText);

    registerServer(connection as any, documents as any);
    documents.open(alphaUri, alphaText, 1);

    const codeLenses = connection.codeLensHandler?.({
      textDocument: { uri: alphaUri },
    });

    expect(codeLenses).toBeTruthy();
    expect(serializeCodeLensesEnvelopeForGolden(snapshotCodeLensesEnvelope(codeLenses ?? []))).toContain(
      '"source": "codelens:activation-summary"',
    );
    expect(snapshotCodeLensesEnvelope(codeLenses ?? [])).toMatchObject({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      codeLenses: [
        expect.objectContaining({
          lensKind: 'detail',
          command: expect.objectContaining({
            command: ACTIVATION_CHAIN_CODELENS_CLIENT_COMMAND,
            kind: 'detail',
            mode: 'no-op',
            uri: alphaUri,
          }),
        }),
        expect.objectContaining({
          lensKind: 'summary',
          command: expect.objectContaining({
            command: ACTIVATION_CHAIN_CODELENS_CLIENT_COMMAND,
            kind: 'summary',
            mode: 'no-op',
            uri: alphaUri,
          }),
        }),
      ],
      provenance: expect.objectContaining({
        reason: 'contextual-inference',
        source: 'codelens:activation-summary',
      }),
    });
  });

  it('registers watched-file notifications and refreshes CodeLens after external lorebook create/change/delete events', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const alphaText = [
      '---',
      'name: Alpha',
      'comment: Alpha',
      'constant: false',
      'selective: false',
      'enabled: true',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'alpha',
      '@@@ CONTENT',
      'beta wakes the chain when a matching lorebook exists.',
      '',
    ].join('\n');
    const betaText = [
      '---',
      'name: Beta',
      'comment: Beta',
      'constant: false',
      'selective: false',
      'enabled: true',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'beta',
      '@@@ CONTENT',
      'Beta lore body.',
      '',
    ].join('\n');
    const betaChangedText = betaText.replace('\n@@@ KEYS\nbeta\n', '\n@@@ KEYS\ngamma\n');
    const alphaUri = await writeWorkspaceFile(root, 'lorebooks/alpha.risulorebook', alphaText);
    const betaAbsolutePath = path.join(root, 'lorebooks', 'beta.risulorebook');
    const betaUri = pathToFileURL(betaAbsolutePath).href;
    const luaLsManager = createLuaLsProcessManagerStub();

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    connection.initializeHandler?.({
      capabilities: {
        workspace: {
          codeLens: { refreshSupport: true },
          didChangeWatchedFiles: { dynamicRegistration: true },
        },
      },
    } as InitializeParams);
    connection.initializedHandler?.({});
    documents.open(alphaUri, alphaText, 1);

    expect(connection.clientRegistrations).toEqual([
      {
        method: 'workspace/didChangeWatchedFiles',
        registerOptions: {
          watchers: [
            { globPattern: '**/*.risulorebook' },
            { globPattern: '**/*.risuregex' },
            { globPattern: '**/*.risuprompt' },
            { globPattern: '**/*.risuhtml' },
            { globPattern: '**/*.risulua' },
          ],
        },
      },
    ]);
    expect(
      connection.codeLensHandler?.({
        textDocument: { uri: alphaUri },
      })?.map((lens) => lens.command?.title),
    ).toEqual(['0개 엔트리에 의해 활성화됨 | 0개 엔트리를 활성화']);

    await writeWorkspaceFile(root, 'lorebooks/beta.risulorebook', betaText);
    connection.watchedFilesHandler?.({
      changes: [{ uri: betaUri, type: FileChangeType.Created }],
    });

    expect(connection.requests).toContain('workspace/codeLens/refresh');
    expect(
      connection.codeLensHandler?.({
        textDocument: { uri: alphaUri },
      })?.map((lens) => lens.command?.title),
    ).toEqual(['0개 엔트리에 의해 활성화됨 | 1개 엔트리를 활성화']);

    await writeWorkspaceFile(root, 'lorebooks/beta.risulorebook', betaChangedText);
    connection.watchedFilesHandler?.({
      changes: [{ uri: betaUri, type: FileChangeType.Changed }],
    });

    expect(connection.requests.filter((method) => method === 'workspace/codeLens/refresh')).toHaveLength(2);
    expect(
      connection.codeLensHandler?.({
        textDocument: { uri: alphaUri },
      })?.map((lens) => lens.command?.title),
    ).toEqual(['0개 엔트리에 의해 활성화됨 | 0개 엔트리를 활성화']);

    await rm(betaAbsolutePath);
    connection.watchedFilesHandler?.({
      changes: [{ uri: betaUri, type: FileChangeType.Deleted }],
    });

    expect(connection.requests.filter((method) => method === 'workspace/codeLens/refresh')).toHaveLength(3);
    expect(
      connection.codeLensHandler?.({
        textDocument: { uri: alphaUri },
      })?.map((lens) => lens.command?.title),
    ).toEqual(['0개 엔트리에 의해 활성화됨 | 0개 엔트리를 활성화']);
    expect(connection.traceMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: '[cbs-lsp:workspace] watch-registration-start' }),
        expect.objectContaining({ message: '[cbs-lsp:workspace] watch-registration-end' }),
        expect.objectContaining({ message: '[cbs-lsp:workspace] watched-files-change' }),
        expect.objectContaining({ message: '[cbs-lsp:workspace] codelens-refresh-requested' }),
      ]),
    );
  });

  it('refreshes cached analysis on open/change, invalidates stale versions, and serves features from cache', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const uri = 'file:///fixtures/server-cache.risulorebook';
    const version1Text = lorebookDocument([
      '{{setvar::mood::happy}}',
      '{{#when::mood::is::happy}}',
      'visible',
      '{{/}}',
    ]);
    const version2Text = lorebookDocument(['{{setvar::energy::charged}}', '{{getvar::en']);

    registerServer(connection as any, documents as any);
    documents.open(uri, version1Text, 1);

    const diagnosticsAfterOpen = getLastDiagnostics(connection).diagnostics;
    expect(diagnosticsAfterOpen.some((diagnostic) => diagnostic.code === 'CBS001')).toBe(false);
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)).not.toBeNull();

    const hover = await connection.hoverHandler?.({
      textDocument: { uri },
      position: positionAt(version1Text, '#when', 2),
    });
    expect(getHoverMarkdown(hover ?? null)).toContain('**#when**');

    const signature = connection.signatureHelpHandler?.({
      textDocument: { uri },
      position: positionAt(version1Text, 'happy', 2),
    });
    expect(signature?.signatures[0]?.label).toContain('setvar');

    const foldingRanges = connection.foldingRangesHandler?.({
      textDocument: { uri },
    });
    expect(foldingRanges).toHaveLength(1);

    const semanticTokens = connection.semanticTokensHandler?.({
      textDocument: { uri },
    });
    expect(semanticTokens?.data.length ?? 0).toBeGreaterThan(0);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    documents.change(uri, version2Text, 2);

    const diagnosticsAfterChange = getLastDiagnostics(connection).diagnostics;
    expect(diagnosticsAfterChange.some((diagnostic) => diagnostic.code === 'CBS001')).toBe(true);
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)).toBeNull();
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 2)).not.toBeNull();

    const completionItems = getCompletionItems(
      connection.completionHandler?.({
        textDocument: { uri },
        position: positionAt(version2Text, '{{getvar::en', '{{getvar::en'.length),
      }),
    );
    const completionLabels = completionItems.map((item) => item.label);

    // PlainText recovery keeps variable-name completion available for an unclosed macro prefix.
    expect(completionLabels).toEqual(['energy']);
    expect(parseSpy).toHaveBeenCalledTimes(2);

    documents.close(uri);

    expect(fragmentAnalysisService.getCachedAnalysis(uri, 2)).toBeNull();
    expect(getLastDiagnostics(connection).diagnostics).toEqual([]);
  });

  it('invalidates stale feature and diagnostics cache when text changes without a version bump', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const uri = 'file:///fixtures/server-same-version-cache.risulorebook';
    const version1Text = lorebookDocument(['Hello {{user}}']);
    const changedSameVersionText = lorebookDocument(['Hello {{char}}']);

    registerServer(connection as any, documents as any);
    documents.open(uri, version1Text, 1);

    const firstHover = await connection.hoverHandler?.({
      textDocument: { uri },
      position: positionAt(version1Text, 'user', 1),
    });
    expect(getHoverMarkdown(firstHover ?? null)).toContain('**user**');
    expect(parseSpy).toHaveBeenCalledTimes(1);

    documents.change(uri, changedSameVersionText, 1);

    const secondHover = await connection.hoverHandler?.({
      textDocument: { uri },
      position: positionAt(changedSameVersionText, 'char', 1),
    });
    expect(getHoverMarkdown(secondHover ?? null)).toContain('**char**');
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)?.cache.textSignature).toBe(
      createSyntheticDocumentVersion(changedSameVersionText),
    );
    expect(parseSpy).toHaveBeenCalledTimes(2);
  });

  it('reuses cached analysis without losing getvar argument completion context', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const uri = 'file:///fixtures/server-cached-getvar-completion.risulorebook';
    const text = lorebookDocument(['{{setvar::mood::happy}}', '{{getvar::}}']);

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    const firstCompletion = getCompletionItems(
      connection.completionHandler?.(
        {
          textDocument: { uri },
          position: positionAt(text, '{{getvar::', '{{getvar::'.length),
        },
        createCancellationToken(false),
      ),
    );
    const parseCountAfterFirstCompletion = parseSpy.mock.calls.length;

    const secondCompletion = getCompletionItems(
      connection.completionHandler?.(
        {
          textDocument: { uri },
          position: positionAt(text, '{{getvar::', '{{getvar::'.length),
        },
        createCancellationToken(false),
      ),
    );

    expect(firstCompletion.some((item) => item.label === 'mood')).toBe(true);
    expect(secondCompletion.some((item) => item.label === 'mood')).toBe(true);
    expect(parseSpy.mock.calls.length).toBe(parseCountAfterFirstCompletion);
  });

  it('reuses cached analysis without losing #when operator completion context', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const uri = 'file:///fixtures/server-cached-when-completion.risulorebook';
    const text = lorebookDocument(['{{setvar::mood::happy}}', '{{#when::mood::}}ok{{/}}']);

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    const firstCompletion = getCompletionItems(
      connection.completionHandler?.(
        {
          textDocument: { uri },
          position: positionAt(text, '{{#when::mood::', '{{#when::mood::'.length),
        },
        createCancellationToken(false),
      ),
    );
    const parseCountAfterFirstCompletion = parseSpy.mock.calls.length;

    const secondCompletion = getCompletionItems(
      connection.completionHandler?.(
        {
          textDocument: { uri },
          position: positionAt(text, '{{#when::mood::', '{{#when::mood::'.length),
        },
        createCancellationToken(false),
      ),
    );

    expect(firstCompletion.some((item) => item.label === 'is')).toBe(true);
    expect(firstCompletion.some((item) => item.label === 'mood')).toBe(true);
    expect(secondCompletion.some((item) => item.label === 'is')).toBe(true);
    expect(secondCompletion.some((item) => item.label === 'mood')).toBe(true);
    expect(parseSpy.mock.calls.length).toBe(parseCountAfterFirstCompletion);
  });

  it('reuses one cached analysis across completion, hover, folding, and document symbols for the same version', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const uri = 'file:///fixtures/server-shared-provider-cache.risulorebook';
    const version1Text = lorebookDocument([
      '{{#when::ready}}',
      '{{user}}',
      '{{/}}',
    ]);
    const version2Text = lorebookDocument([
      '{{#when::ready}}',
      '{{char}}',
      '{{/}}',
    ]);

    registerServer(connection as any, documents as any);
    documents.open(uri, version1Text, 1);

    const version1Completion = getCompletionItems(
      connection.completionHandler?.({
        textDocument: { uri },
        position: positionAt(version1Text, '{{', 2, 1),
      }),
    );
    const version1Hover = await connection.hoverHandler?.({
      textDocument: { uri },
      position: positionAt(version1Text, 'user', 1),
    });
    const version1Folding = connection.foldingRangesHandler?.({
      textDocument: { uri },
    });
    const version1Symbols = connection.documentSymbolHandler?.({
      textDocument: { uri },
    });

    expect(version1Completion.map((item) => item.label)).toContain('user');
    expect(getHoverMarkdown(version1Hover ?? null)).toContain('**user**');
    expect(version1Folding).toHaveLength(1);
    expect(version1Symbols?.map((symbol) => symbol.name)).toEqual(['#when::ready']);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)?.fragmentAnalyses[0]?.document).toBeDefined();

    documents.change(uri, version2Text, 2);

    const version2Completion = getCompletionItems(
      connection.completionHandler?.({
        textDocument: { uri },
        position: positionAt(version2Text, '{{', 2, 1),
      }),
    );
    const version2Hover = await connection.hoverHandler?.({
      textDocument: { uri },
      position: positionAt(version2Text, 'char', 1),
    });
    const version2Folding = connection.foldingRangesHandler?.({
      textDocument: { uri },
    });
    const version2Symbols = connection.documentSymbolHandler?.({
      textDocument: { uri },
    });

    expect(version2Completion.map((item) => item.label)).toContain('char');
    expect(getHoverMarkdown(version2Hover ?? null)).toContain('**char**');
    expect(version2Folding).toHaveLength(1);
    expect(version2Symbols?.map((symbol) => symbol.name)).toEqual(['#when::ready']);
    expect(parseSpy).toHaveBeenCalledTimes(2);
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)).toBeNull();
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 2)).not.toBeNull();
  });

  it('routes textDocument/semanticTokens/range through the server seam and keeps the subset aligned with full tokens', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const uri = 'file:///fixtures/server-semantic-range.risuregex';
    const text = regexDocument(
      ['{{setvar::mood::42}}', '{{#when::mood::is::42}}yes{{:else}}no{{/}}'],
      ['{{#if true}}legacy{{/if}}'],
    );

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    const fullTokens = decodeSemanticTokenTexts(
      connection.semanticTokensHandler?.(
        {
          textDocument: { uri },
        },
        createCancellationToken(false),
      )?.data ?? [],
      text,
    );
    const rangeTokens = decodeSemanticTokenTexts(
      connection.semanticTokensRangeHandler?.(
        {
          textDocument: { uri },
          range: {
            start: positionAt(text, '{{setvar', 0),
            end: positionAt(text, '{{#when::mood::is::42}}yes{{:else}}no{{/}}', '{{#when::mood::is::42}}yes{{:else}}no{{/}}'.length),
          },
        },
        createCancellationToken(false),
      )?.data ?? [],
      text,
    );

    const fullKeys = new Set(fullTokens.map((token) => `${token.line}:${token.startChar}:${token.length}:${token.text}`));

    expect(rangeTokens.length).toBeGreaterThan(0);
    expect(rangeTokens.length).toBeLessThan(fullTokens.length);
    expect(rangeTokens.every((token) => fullKeys.has(`${token.line}:${token.startChar}:${token.length}:${token.text}`))).toBe(true);
    expect(rangeTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'setvar' }),
        expect.objectContaining({ text: 'mood' }),
        expect.objectContaining({ text: '42' }),
        expect.objectContaining({ text: '#when' }),
      ]),
    );
    expect(rangeTokens).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ text: '#if' })]),
    );
  });

  it('builds deterministic multi-provider snapshots from one cached document state and replaces stale snapshots after same-version text changes', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const uri = 'file:///fixtures/server-provider-bundle-cache.risulorebook';
    const version1Text = lorebookDocument([
      '{{setvar::mood::happy}}',
      '{{#if true}}',
      '{{getvar::mood}}{{getvar::}}',
      '{{/if}}',
    ]);
    const changedSameVersionText = lorebookDocument([
      '{{setvar::energy::charged}}',
      '{{#when::true}}',
      '{{getvar::energy}}{{getvar::}}',
      '{{/}}',
    ]);

    registerServer(connection as any, documents as any);
    documents.open(uri, version1Text, 1);

    const version1Diagnostics = getLatestDiagnosticsForUri(connection, uri).diagnostics;
    const version1Bundle = captureProviderBundle({
      connection,
      uri,
      text: version1Text,
      completionNeedle: '{{getvar::',
      completionCharacterOffset: '{{getvar::'.length,
      completionOccurrence: 1,
      diagnostics: version1Diagnostics,
      hoverNeedle: 'mood',
      hoverCharacterOffset: 1,
    });
    const version1Reversed = serializeProviderBundleForGolden(
      snapshotProviderBundle({
        codeActions: [...version1Bundle.raw.codeActions].reverse(),
        completion: [...version1Bundle.raw.completion].reverse(),
        diagnostics: [...version1Bundle.raw.diagnostics].reverse(),
        documentSymbols: [...version1Bundle.raw.documentSymbols].reverse(),
        hover: version1Bundle.raw.hover,
      }),
    );

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(version1Bundle.serialized).toBe(version1Reversed);
    expect(version1Bundle.snapshot.completion).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 6,
          label: 'mood',
          resolved: false,
          data: {
            cbs: expect.objectContaining({
              category: {
                category: 'variable',
                kind: 'chat-variable',
              },
              uri,
            }),
          },
        }),
      ]),
    );

    const moodCompletion = version1Bundle.raw.completion.find((item) => item.label === 'mood');
    const resolvedMood = connection.completionResolveHandler?.(moodCompletion!, createCancellationToken(false));
    expect(resolvedMood).toMatchObject({
      label: 'mood',
      detail: 'Chat variable',
      data: {
        cbs: expect.objectContaining({
          explanation: expect.objectContaining({
            reason: 'scope-analysis',
            source: 'chat-variable-symbol-table',
          }),
        }),
      },
    });
    expect(version1Bundle.snapshot.hover).toEqual(
      expect.objectContaining({
        contents: expect.objectContaining({ value: expect.stringContaining('**Variable: mood**') }),
        data: {
          cbs: expect.objectContaining({
            category: {
              category: 'variable',
              kind: 'chat-variable',
            },
            explanation: {
              reason: 'scope-analysis',
              source: 'variable-symbol-table',
              detail:
                'Hover resolved this variable through analyzed symbol-table entries for the current macro argument.',
            },
          }),
        },
      }),
    );
    expect(version1Bundle.snapshot.diagnostics).toHaveLength(1);
    expect(version1Bundle.snapshot.codeActions).toEqual([
      expect.objectContaining({
        hasEdit: false,
        isNoopGuidance: false,
        kind: CodeActionKind.QuickFix,
        title: 'Replace with "#when"',
      }),
    ]);

    const version1Action = version1Bundle.raw.codeActions.find(
      (action) => action.title === 'Replace with "#when"',
    );
    const resolvedVersion1Action = connection.codeActionResolveHandler?.(
      version1Action!,
      createCancellationToken(false),
    );
    expect(resolvedVersion1Action).toMatchObject({
      title: 'Replace with "#when"',
      edit: expect.any(Object),
    });

    documents.change(uri, changedSameVersionText, 1);

    const version2Diagnostics = getLatestDiagnosticsForUri(connection, uri).diagnostics;
    const version2Bundle = captureProviderBundle({
      connection,
      uri,
      text: changedSameVersionText,
      completionNeedle: '{{getvar::',
      completionCharacterOffset: '{{getvar::'.length,
      completionOccurrence: 1,
      diagnostics: version2Diagnostics,
      hoverNeedle: 'energy',
      hoverCharacterOffset: 1,
    });

    expect(parseSpy).toHaveBeenCalledTimes(2);
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)?.cache.textSignature).toBe(
      createSyntheticDocumentVersion(changedSameVersionText),
    );
    expect(version2Bundle.serialized).not.toBe(version1Bundle.serialized);
    expect(version2Bundle.snapshot.completion).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 6,
          label: 'energy',
        }),
      ]),
    );
    expect(version2Bundle.snapshot.hover).toEqual(
      expect.objectContaining({
        contents: expect.objectContaining({ value: expect.stringContaining('**Variable: energy**') }),
      }),
    );
    expect(version2Bundle.snapshot.diagnostics).toEqual([]);
    expect(version2Bundle.snapshot.codeActions).toEqual([]);
    expect(version2Bundle.snapshot.documentSymbols).toEqual([
      expect.objectContaining({
        name: '#when::true',
        fragmentContainer: false,
        section: null,
        symbolKind: 'object',
      }),
    ]);
  });

  it('refreshes related workspace diagnostics when a writer relationship changes in another file', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const initialWriterText = promptDocument(['{{setvar::other::1}}']);
    const writerWithSharedText = promptDocument(['{{setvar::shared::1}}']);
    const readerText = ['---', 'comment: reader', 'type: plain', '---', '@@@ IN', '{{getvar::shared}}', ''].join(
      '\n',
    );
    const writerUri = await writeWorkspaceFile(
      root,
      'prompt_template/writer.risuprompt',
      initialWriterText,
    );
    const readerUri = await writeWorkspaceFile(root, 'regex/reader.risuregex', readerText);

    registerServer(connection as any, documents as any);

    documents.open(writerUri, initialWriterText, 1);
    documents.open(readerUri, readerText, 1);

    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(true);

    documents.change(writerUri, writerWithSharedText, 2);
    await waitForDocumentChangeRefresh();

    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(false);

    documents.change(writerUri, initialWriterText, 3);
    await waitForDocumentChangeRefresh();

    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(true);
  });

  it('republishes affected diagnostics after external watched-file deletion removes a workspace writer', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const writerText = promptDocument(['{{setvar::shared::1}}']);
    const readerText = ['---', 'comment: reader', 'type: plain', '---', '@@@ IN', '{{getvar::shared}}', ''].join(
      '\n',
    );
    const writerRelativePath = 'prompt_template/writer.risuprompt';
    const writerAbsolutePath = path.join(root, writerRelativePath);
    const writerUri = await writeWorkspaceFile(root, writerRelativePath, writerText);
    const readerUri = await writeWorkspaceFile(root, 'regex/reader.risuregex', readerText);

    registerServer(connection as any, documents as any);
    documents.open(readerUri, readerText, 1);

    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(false);

    await rm(writerAbsolutePath);
    connection.watchedFilesHandler?.({
      changes: [{ uri: writerUri, type: FileChangeType.Deleted }],
    });

    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(true);
    expect(getLatestDiagnosticsForUri(connection, writerUri).diagnostics).toEqual([]);
  });

  it('keeps open/change/close/watched-file updates on the incremental workspace rebuild path', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const diskWriterText = promptDocument(['{{setvar::shared::1}}']);
    const changedWriterText = promptDocument(['{{setvar::other::1}}']);
    const externalWriterText = promptDocument(['{{setvar::shared::2}}']);
    const readerText = ['---', 'comment: reader', 'type: plain', '---', '@@@ IN', '{{getvar::shared}}', ''].join(
      '\n',
    );
    const writerUri = await writeWorkspaceFile(root, 'prompt_template/writer.risuprompt', diskWriterText);
    const readerUri = await writeWorkspaceFile(root, 'regex/reader.risuregex', readerText);
    const extraWriterRelativePath = 'prompt_template/extra-writer.risuprompt';
    const extraWriterAbsolutePath = path.join(root, extraWriterRelativePath);
    const extraWriterUri = pathToFileURL(extraWriterAbsolutePath).href;
    const rebuildSpy = vi.spyOn(ElementRegistry.prototype, 'rebuild');
    const fullGraphSpy = vi.spyOn(UnifiedVariableGraph, 'fromRegistry');

    registerServer(connection as any, documents as any);

    documents.open(writerUri, diskWriterText, 1);
    documents.open(readerUri, readerText, 1);

    rebuildSpy.mockClear();
    fullGraphSpy.mockClear();

    documents.change(writerUri, changedWriterText, 2);
    await waitForDocumentChangeRefresh();
    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(true);

    documents.close(writerUri);
    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(false);

    await writeFile(path.join(root, 'prompt_template/writer.risuprompt'), changedWriterText, 'utf8');
    connection.watchedFilesHandler?.({
      changes: [{ uri: writerUri, type: FileChangeType.Changed }],
    });
    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(true);

    await writeFile(extraWriterAbsolutePath, externalWriterText, 'utf8');
    connection.watchedFilesHandler?.({
      changes: [{ uri: extraWriterUri, type: FileChangeType.Created }],
    });
    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(false);

    await rm(extraWriterAbsolutePath);
    connection.watchedFilesHandler?.({
      changes: [{ uri: extraWriterUri, type: FileChangeType.Deleted }],
    });
    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(true);

    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(fullGraphSpy).not.toHaveBeenCalled();
  });

  it('clears all cached analysis on shutdown', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const uri = 'file:///fixtures/server-shutdown-cache.risulorebook';
    const text = lorebookDocument(['Hello {{user}}']);

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)).not.toBeNull();

    await connection.shutdown();

    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)).toBeNull();
  });

  it('emits feature-scoped trace and log messages per request path', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const uri = 'file:///fixtures/server-trace-paths.risulorebook';
    const text = lorebookDocument([
      '{{setvar::mood::happy}}',
      '{{#when::mood::is::happy}}',
      'visible',
      '{{/}}',
    ]);
    const luaLsManager = createLuaLsProcessManagerStub();

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: (() => luaLsManager) as unknown as () => LuaLsProcessManager,
    });
    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);
    documents.open(uri, text, 1);

    connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{setvar', 2),
      },
      createCancellationToken(false),
    );
    connection.hoverHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '#when', 2),
      },
      createCancellationToken(false),
    );
    connection.definitionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, 'mood', 2, 1),
      },
      createCancellationToken(false),
    );
    connection.referencesHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, 'mood', 2, 1),
        context: { includeDeclaration: true },
      },
      createCancellationToken(false),
    );
    connection.signatureHelpHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, 'happy', 2),
      },
      createCancellationToken(false),
    );
    connection.foldingRangesHandler?.(
      {
        textDocument: { uri },
      },
      createCancellationToken(false),
    );
    connection.codeLensHandler?.(
      {
        textDocument: { uri },
      },
      createCancellationToken(false),
    );
    connection.semanticTokensHandler?.(
      {
        textDocument: { uri },
      },
      createCancellationToken(false),
    );
    connection.semanticTokensRangeHandler?.(
      {
        textDocument: { uri },
        range: {
          start: { line: 4, character: 0 },
          end: { line: 5, character: 0 },
        },
      },
      createCancellationToken(false),
    );

    await connection.shutdown();

    expect(connection.consoleMessages).toContain('[cbs-lsp:server] initialize textDocumentSync=2');
    expect(connection.consoleMessages).toContain('[cbs-lsp:server] shutdown');
      expect(connection.traceMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: '[cbs-lsp:server] initialize' }),
          expect.objectContaining({ message: '[cbs-lsp:server] availability-contract' }),
          expect.objectContaining({ message: '[cbs-lsp:server] document-open' }),
        expect.objectContaining({ message: '[cbs-lsp:diagnostics] start' }),
        expect.objectContaining({ message: '[cbs-lsp:diagnostics] end' }),
        expect.objectContaining({ message: '[cbs-lsp:codelens] start' }),
        expect.objectContaining({ message: '[cbs-lsp:codelens] end' }),
        expect.objectContaining({ message: '[cbs-lsp:completion] start' }),
        expect.objectContaining({ message: '[cbs-lsp:completion] end' }),
        expect.objectContaining({ message: '[cbs-lsp:references] start' }),
        expect.objectContaining({ message: '[cbs-lsp:references] end' }),
        expect.objectContaining({ message: '[cbs-lsp:hover] start' }),
        expect.objectContaining({ message: '[cbs-lsp:hover] end' }),
        expect.objectContaining({ message: '[cbs-lsp:signature] start' }),
        expect.objectContaining({ message: '[cbs-lsp:signature] end' }),
        expect.objectContaining({ message: '[cbs-lsp:folding] start' }),
        expect.objectContaining({ message: '[cbs-lsp:folding] end' }),
        expect.objectContaining({ message: '[cbs-lsp:semanticTokens] start' }),
        expect.objectContaining({ message: '[cbs-lsp:semanticTokens] end' }),
        expect.objectContaining({ message: '[cbs-lsp:semanticTokensRange] start' }),
        expect.objectContaining({ message: '[cbs-lsp:semanticTokensRange] end' }),
        expect.objectContaining({ message: '[cbs-lsp:server] shutdown' }),
      ]),
    );

    const availabilityTrace = connection.traceMessages.find(
      (entry) => entry.message === '[cbs-lsp:server] availability-contract',
    );

    expect(availabilityTrace?.verbose).toBeDefined();
    expect(JSON.parse(availabilityTrace?.verbose ?? '{}')).toEqual(
      expect.objectContaining({
        availability: expect.objectContaining({
          artifacts: [
            {
              key: 'risutoggle',
              availabilityScope: 'workspace-disabled',
              availabilitySource: 'document-router:risutoggle',
              availabilityDetail:
                '`.risutoggle` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
            },
            {
              key: 'risuvar',
              availabilityScope: 'workspace-disabled',
              availabilitySource: 'document-router:risuvar',
              availabilityDetail:
                '`.risuvar` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
            },
          ],
          companions: [
            {
              key: 'luals',
              status: 'stopped',
              health: 'idle',
              transport: 'stdio',
              executablePath: '/mock/luals',
              pid: null,
              detail:
                'LuaLS executable was resolved and the sidecar is ready to start after the main LSP server finishes initialization.',
            },
          ],
          features: expect.arrayContaining([
            {
              key: 'codelens',
              availabilityScope: 'local-only',
              availabilitySource: 'server-capability:codelens',
              availabilityDetail:
                'CodeLens is active for routed lorebook documents, summarizes workspace activation edges for the current lorebook entry, and requests refresh after document or watched-file changes rebuild activation edges.',
            },
            {
              key: 'completion',
              availabilityScope: 'local-only',
              availabilitySource: 'server-capability:completion',
              availabilityDetail:
                'Completion is active for routed CBS fragments and operates on the current document/fragment context only.',
            },
            {
              key: 'luaHover',
              availabilityScope: 'local-only',
              availabilitySource: 'lua-provider:hover-proxy',
              availabilityDetail:
                'Lua hover is active for `.risulua` documents by forwarding `textDocument/hover` to the LuaLS companion using the mirrored virtual Lua document when the sidecar is ready. If LuaLS is unavailable or still starting, the server returns no Lua hover result and leaves CBS capabilities unchanged.',
            },
            {
              key: 'lua-diagnostics',
              availabilityScope: 'local-only',
              availabilitySource: 'lua-provider:diagnostics-proxy',
              availabilityDetail:
                'Lua diagnostics are active for `.risulua` documents by forwarding LuaLS `textDocument/publishDiagnostics` notifications from mirrored virtual Lua documents into host `publishDiagnostics`. If LuaLS is unavailable, crashed, or still starting, the server clears Lua diagnostics for affected documents and leaves CBS capabilities unchanged.',
            },
            {
              key: 'lua-completion',
              availabilityScope: 'local-only',
              availabilitySource: 'lua-provider:completion-proxy',
              availabilityDetail:
                'Lua completion is active for `.risulua` documents by forwarding `textDocument/completion` to the LuaLS companion using the mirrored virtual Lua document when the sidecar is ready. If LuaLS is unavailable, crashed, or still starting, the server returns no Lua completion items and leaves CBS capabilities unchanged.',
            },
            {
              key: 'definition',
              availabilityScope: 'local-first',
              availabilitySource: 'server-capability:definition',
              availabilityDetail:
        'Definition is active for routed CBS fragments, returns fragment-local definitions first, and appends workspace chat-variable writers/readers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
            },
            {
              key: 'references',
              availabilityScope: 'local-first',
              availabilitySource: 'server-capability:references',
              availabilityDetail:
                'References are active for routed CBS fragments, return fragment-local read/write locations first, and append workspace chat-variable readers/writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
            },
            {
              key: 'cross-language-code-action',
              availabilityScope: 'deferred',
              availabilitySource: 'deferred-scope-contract:cross-language-code-action',
              availabilityDetail:
                'Scope honesty MVP keeps the Lua state bridge read-only: read-only bridge is on, while cross-language code actions stay off until authoritative multi-file edit merge rules exist.',
            },
            {
              key: 'cross-language-rename',
              availabilityScope: 'deferred',
              availabilitySource: 'deferred-scope-contract:cross-language-rename',
              availabilityDetail:
                'Scope honesty MVP keeps the Lua state bridge read-only: read-only bridge is on, while cross-language rename stays off until authoritative multi-file edit merge rules exist.',
            },
            {
              key: 'cross-language-workspace-edit',
              availabilityScope: 'deferred',
              availabilitySource: 'deferred-scope-contract:cross-language-workspace-edit',
              availabilityDetail:
                'Scope honesty MVP keeps the Lua state bridge read-only: read-only bridge is on, while cross-language workspace edits stay off until authoritative multi-file edit merge rules exist.',
            },
          ]),
          operator: expect.objectContaining({
            docs: {
              agentIntegration: 'packages/cbs-lsp/docs/AGENT_INTEGRATION.md',
              compatibility: 'packages/cbs-lsp/docs/COMPATIBILITY.md',
              lualsCompanion: 'packages/cbs-lsp/docs/LUALS_COMPANION.md',
              readme: 'packages/cbs-lsp/README.md',
              standaloneUsage: 'packages/cbs-lsp/docs/STANDALONE_USAGE.md',
              troubleshooting: 'packages/cbs-lsp/docs/TROUBLESHOOTING.md',
              vscodeClient: 'packages/vscode/README.md',
            },
            scope: {
              deferredEditFeatures: [
                'cross-language-rename',
                'cross-language-workspace-edit',
                'cross-language-code-action',
              ],
              detail:
                'Scope honesty MVP keeps read-only bridge on and multi-file edit off. Cross-language rename, workspace edit, and code action stay deferred until authoritative edit merge rules exist.',
              multiFileEdit: 'off',
              readOnlyBridge: 'on',
            },
          }),
        }),
      }),
    );
  });

  it('writes request events to a durable timeline log when configured', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-timeline-'));
    const timelineLogPath = path.join(root, 'timeline.jsonl');
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const uri = 'file:///fixtures/server-timeline.risuregex';
    const text = regexDocument(['{{'], ['fallback']);

    registerServer(connection as any, documents as any, {
      env: {
        ...process.env,
        CBS_LSP_TIMELINE_LOG: timelineLogPath,
      },
    });
    connection.initializeHandler?.({ capabilities: {} } as InitializeParams);
    documents.open(uri, text, 1);

    const completion = connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{', 2),
      },
      createCancellationToken(false),
    ) as CompletionItem[] | undefined;

    expect(completion?.length).toBeGreaterThan(0);

    const timeline = (await readFile(timelineLogPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { feature: string; phase: string; details: Record<string, unknown> });

    expect(timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: 'completion', phase: 'start' }),
        expect.objectContaining({ feature: 'completion', phase: 'build' }),
        expect.objectContaining({ feature: 'completion', phase: 'end' }),
      ]),
    );
    expect(timeline.some((entry) => entry.details.uri === uri)).toBe(true);

    await rm(root, { recursive: true, force: true });
  });

  it('returns no-op results for cancelled requests without refreshing analysis', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const uri = 'file:///fixtures/server-cancelled-request.risulorebook';
    const text = lorebookDocument(['{{setvar::mood::happy}}', '{{getvar::mood}}']);
    const cancelledToken = createCancellationToken(true);

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    expect(parseSpy).toHaveBeenCalledTimes(1);

    fragmentAnalysisService.clearAll();

    expect(
      getCompletionItems(
        connection.completionHandler?.(
          {
            textDocument: { uri },
            position: positionAt(text, '{{getvar::mood', '{{getvar::mood'.length),
          },
          cancelledToken,
        ),
      ),
    ).toEqual([]);
    expect(
      connection.hoverHandler?.(
        {
          textDocument: { uri },
          position: positionAt(text, 'mood', 1, 1),
        },
        cancelledToken,
      ) ?? null,
    ).toBeNull();
    expect(
      connection.referencesHandler?.(
        {
          textDocument: { uri },
          position: positionAt(text, 'mood', 1, 1),
          context: { includeDeclaration: true },
        },
        cancelledToken,
      ) ?? [],
    ).toEqual([]);
    expect(
      connection.signatureHelpHandler?.(
        {
          textDocument: { uri },
          position: positionAt(text, 'happy', 2),
        },
        cancelledToken,
      ) ?? null,
    ).toBeNull();
    expect(
      connection.foldingRangesHandler?.(
        {
          textDocument: { uri },
        },
        cancelledToken,
      ) ?? [],
    ).toEqual([]);
    expect(
      connection.codeLensHandler?.(
        {
          textDocument: { uri },
        },
        cancelledToken,
      ) ?? [],
    ).toEqual([]);
    expect(
      connection.semanticTokensHandler?.(
        {
          textDocument: { uri },
        },
        cancelledToken,
      ) ?? { data: [] },
    ).toEqual({ data: [] });
    expect(
      connection.semanticTokensRangeHandler?.(
        {
          textDocument: { uri },
          range: {
            start: { line: 4, character: 0 },
            end: { line: 5, character: 0 },
          },
        },
        cancelledToken,
      ) ?? { data: [] },
    ).toEqual({ data: [] });
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)).toBeNull();
  });

  it.each([
    {
      label: 'toggle artifact',
      uri: getFixtureCorpusEntry('toggle-excluded').uri,
      text: getFixtureCorpusEntry('toggle-excluded').text,
    },
    {
      label: 'variable artifact',
      uri: getFixtureCorpusEntry('variable-excluded').uri,
      text: getFixtureCorpusEntry('variable-excluded').text,
    },
    {
      label: 'unknown extension',
      uri: 'file:///fixtures/unknown.txt',
      text: 'plain text',
    },
  ])('keeps $label on the empty diagnostics and no-feature path', ({ uri, text }) => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    expect(getLastDiagnostics(connection).diagnostics).toEqual([]);
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)).toBeNull();
    expect(
      getCompletionItems(
        connection.completionHandler?.({
          textDocument: { uri },
          position: { line: 0, character: 0 },
        }),
      ),
    ).toEqual([]);
    expect(
      connection.hoverHandler?.({
        textDocument: { uri },
        position: { line: 0, character: 0 },
      }) ?? null,
    ).toBeNull();
    expect(
      connection.signatureHelpHandler?.({
        textDocument: { uri },
        position: { line: 0, character: 0 },
      }) ?? null,
    ).toBeNull();
    expect(
      connection.foldingRangesHandler?.({
        textDocument: { uri },
      }) ?? [],
    ).toEqual([]);
    expect(
      connection.codeLensHandler?.({
        textDocument: { uri },
      }) ?? [],
    ).toEqual([]);
    expect(
      connection.semanticTokensHandler?.({
        textDocument: { uri },
      }) ?? { data: [] },
    ).toEqual({ data: [] });
    expect(
      connection.semanticTokensRangeHandler?.({
        textDocument: { uri },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      }) ?? { data: [] },
    ).toEqual({ data: [] });
  });
});
