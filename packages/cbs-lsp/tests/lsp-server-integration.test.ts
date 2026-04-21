import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import type {
  CancellationToken,
  CodeAction,
  CodeLens,
  CompletionItem,
  Definition,
  Diagnostic,
  DocumentSymbol,
  DidChangeWatchedFilesParams,
  DocumentFormattingParams,
  FoldingRange,
  Hover,
  InitializeParams,
  InitializeResult,
  Location,
  Range,
  ReferenceParams,
  RenameParams,
  SemanticTokens,
  SignatureHelp,
  TextEdit,
  TextDocumentPositionParams,
  WorkspaceEdit,
} from 'vscode-languageserver/node';
import { CodeActionKind, FileChangeType, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as core from 'risu-workbench-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLuaLsCompanionRuntime,
  createSyntheticDocumentVersion,
  fragmentAnalysisService,
} from '../src/core';
import { SEMANTIC_TOKEN_MODIFIERS, SEMANTIC_TOKEN_TYPES } from '../src/features/semanticTokens';
import { ElementRegistry, UnifiedVariableGraph } from '../src/indexer';
import { registerServer } from '../src/server';
import type { LuaLsProcessManager } from '../src/providers/lua/lualsProcess';
import { createLuaLsTransportUri } from '../src/providers/lua/lualsDocuments';
import { offsetToPosition, positionToOffset } from '../src/utils/position';
import {
  getFixtureCorpusEntry,
  serializeProviderBundleForGolden,
  snapshotCodeActionsEnvelope,
  snapshotProviderBundle,
} from './fixtures/fixture-corpus';

const tempRoots: string[] = [];

function createDisposable() {
  return {
    dispose() {},
  };
}

function createLuaLsProcessManagerStub(overrides: Partial<LuaLsProcessManager> = {}): LuaLsProcessManager {
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
    syncDocument: vi.fn(),
    ...overrides,
  } as unknown as LuaLsProcessManager;
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
  result: CompletionItem[] | { items: CompletionItem[] } | null | undefined,
) {
  if (!result) {
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

class FakeConnection {
  initializeHandler: ((params: InitializeParams) => InitializeResult) | null = null;

  initializedHandler: ((params: Record<string, never>) => void) | null = null;

  shutdownHandler: (() => void | Promise<void>) | null = null;

  executeCommandHandler: ((params: any) => void | Promise<void>) | null = null;

  codeActionHandler: ((params: any, token?: CancellationToken) => CodeAction[]) | null = null;

  codeLensHandler: ((params: any, token?: CancellationToken) => CodeLens[]) | null = null;

  completionHandler: ((params: any, token?: CancellationToken) => CompletionItem[] | { items: CompletionItem[] }) | null = null;

  documentSymbolHandler: ((params: any, token?: CancellationToken) => DocumentSymbol[]) | null = null;

  definitionHandler: ((params: any, token?: CancellationToken) => Definition | null) | null = null;

  referencesHandler: ((params: any, token?: CancellationToken) => Location[]) | null = null;

  prepareRenameHandler: ((params: TextDocumentPositionParams, token?: CancellationToken) => Range | null) | null = null;

  renameHandler: ((params: RenameParams, token?: CancellationToken) => WorkspaceEdit | null) | null = null;

  hoverHandler: any = null;

  signatureHelpHandler: ((params: any, token?: CancellationToken) => SignatureHelp | null) | null = null;

  foldingRangesHandler: ((params: any, token?: CancellationToken) => FoldingRange[]) | null = null;

  semanticTokensHandler: ((params: any, token?: CancellationToken) => SemanticTokens) | null = null;

  watchedFilesHandler: ((params: DidChangeWatchedFilesParams) => void) | null = null;

  definitionRegistrations = 0;

  referencesRegistrations = 0;

  prepareRenameRegistrations = 0;

  renameRegistrations = 0;

  formattingRegistrations = 0;

  formattingHandler: ((params: DocumentFormattingParams, token?: CancellationToken) => TextEdit[]) | null =
    null;

  readonly diagnostics: Array<{ uri: string; diagnostics: readonly Diagnostic[] }> = [];

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
    semanticTokens: {
      on: (handler: (params: any, token?: CancellationToken) => SemanticTokens) => {
        this.semanticTokensHandler = handler;
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

  onCodeLens(handler: (params: any, token?: CancellationToken) => CodeLens[]) {
    this.codeLensHandler = handler;
    return createDisposable();
  }

  onCompletion(handler: (params: any, token?: CancellationToken) => CompletionItem[] | { items: CompletionItem[] }) {
    this.completionHandler = handler;
    return createDisposable();
  }

  onDocumentSymbol(handler: (params: any, token?: CancellationToken) => DocumentSymbol[]) {
    this.documentSymbolHandler = handler;
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

  onDidChangeWatchedFiles(handler: (params: DidChangeWatchedFilesParams) => void) {
    this.watchedFilesHandler = handler;
    return createDisposable();
  }

  sendRequest(type: { method: string } | string) {
    this.requests.push(typeof type === 'string' ? type : type.method);
    return Promise.resolve(undefined);
  }

  sendDiagnostics(params: { uri: string; diagnostics: readonly Diagnostic[] }) {
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
  const snapshot = snapshotProviderBundle({
    codeActions,
    completion,
    diagnostics: options.diagnostics,
    hover,
  });

  return {
    raw: {
      codeActions,
      completion,
      diagnostics: options.diagnostics,
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
      createLuaLsProcessManager: () => luaLsManager,
    });

    const initializeResult = connection.initializeHandler?.({
      capabilities: {},
    } as InitializeParams);

    expect(initializeResult).toEqual({
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Incremental,
        },
        codeLensProvider: {
          resolveProvider: false,
        },
        codeActionProvider: {
          codeActionKinds: ['quickfix'],
        },
        completionProvider: {},
        definitionProvider: true,
        documentSymbolProvider: true,
        documentFormattingProvider: true,
        referencesProvider: true,
        renameProvider: {
          prepareProvider: true,
        },
        executeCommandProvider: {
          commands: ['cbs-lsp.codelens.activationSummary'],
        },
        hoverProvider: true,
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
        },
      },
      experimental: {
        cbs: {
          availability: {
            companions: {
              luals: {
                key: 'luals',
                status: 'stopped',
                health: 'idle',
                transport: 'stdio',
                executablePath: '/mock/luals',
                pid: null,
                detail:
                  'LuaLS executable was resolved and the sidecar is ready to start after the main LSP server finishes initialization.',
              },
            },
            excludedArtifacts: {
              risutoggle: {
                scope: 'workspace-disabled',
                source: 'document-router:risutoggle',
                detail:
                  '`.risutoggle` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
              },
              risuvar: {
                scope: 'workspace-disabled',
                source: 'document-router:risuvar',
                detail:
                  '`.risuvar` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
              },
            },
            featureAvailability: expect.objectContaining({
              codelens: {
                scope: 'local-only',
                source: 'server-capability:codelens',
                  detail:
                    'CodeLens is active for routed lorebook documents, summarizes workspace activation edges for the current lorebook entry, and requests refresh after document or watched-file changes rebuild activation edges.',
              },
              codeAction: {
                scope: 'local-only',
                source: 'server-capability:codeAction',
                detail:
                  'Code actions are active for routed CBS fragments, reuse diagnostics metadata for quick fixes and guidance, and only promote automatic host edits that pass the shared host-fragment safety contract.',
              },
              completion: {
                scope: 'local-only',
                source: 'server-capability:completion',
                detail:
                  'Completion is active for routed CBS fragments and operates on the current document/fragment context only.',
              },
              'lua-completion': {
                scope: 'deferred',
                source: 'deferred-scope-contract:lua-completion',
                detail:
                  'Lua completion proxy stays deferred until the minimal LuaLS hover seam is expanded into editor completion request routing.',
              },
              'lua-diagnostics': {
                scope: 'deferred',
                source: 'deferred-scope-contract:lua-diagnostics',
                detail:
                  'Lua diagnostics proxy stays deferred until the server forwards LuaLS diagnostics notifications into host `publishDiagnostics` plumbing.',
              },
              luaHover: {
                scope: 'local-only',
                source: 'lua-provider:hover-proxy',
                detail:
                  'Lua hover is active for `.risulua` documents by forwarding `textDocument/hover` to the LuaLS companion using the mirrored virtual Lua document when the sidecar is ready. If LuaLS is unavailable or still starting, the server returns no Lua hover result and leaves CBS capabilities unchanged.',
              },
              definition: {
                scope: 'local-first',
                source: 'server-capability:definition',
                detail:
                  'Definition is active for routed CBS fragments, returns fragment-local definitions first, and appends workspace chat-variable writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
              },
              documentSymbol: {
                scope: 'local-only',
                source: 'server-capability:documentSymbol',
                detail:
                  'Document symbols are active for routed CBS fragments, expose fragment-local outline structure, and group multi-fragment documents by CBS-bearing section containers only.',
              },
              references: {
                scope: 'local-first',
                source: 'server-capability:references',
                detail:
                  'References are active for routed CBS fragments, return fragment-local read/write locations first, and append workspace chat-variable readers/writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
              },
              rename: {
                scope: 'local-first',
                source: 'server-capability:rename',
                detail:
                  'Rename is active for routed CBS fragments, keeps prepareRename rejection messages for malformed/unresolved/global/external positions, and applies fragment-local edits first before appending workspace chat-variable occurrences when VariableFlowService workspace state is available.',
              },
              formatting: {
                scope: 'local-only',
                source: 'server-capability:formatting',
                detail:
                  'Formatting is active for routed CBS fragments, produces fragment-local canonical text edits, and only promotes host edits that pass the shared host-fragment safety contract.',
              },
            }),
          },
          availabilitySnapshot: {
            artifacts: [
              {
                key: 'risutoggle',
                scope: 'workspace-disabled',
                source: 'document-router:risutoggle',
                detail:
                  '`.risutoggle` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
              },
              {
                key: 'risuvar',
                scope: 'workspace-disabled',
                source: 'document-router:risuvar',
                detail:
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
                key: 'codeAction',
                scope: 'local-only',
                source: 'server-capability:codeAction',
                detail:
                  'Code actions are active for routed CBS fragments, reuse diagnostics metadata for quick fixes and guidance, and only promote automatic host edits that pass the shared host-fragment safety contract.',
              },
              {
                key: 'completion',
                scope: 'local-only',
                source: 'server-capability:completion',
                detail:
                  'Completion is active for routed CBS fragments and operates on the current document/fragment context only.',
              },
              {
                key: 'lua-completion',
                scope: 'deferred',
                source: 'deferred-scope-contract:lua-completion',
                detail:
                  'Lua completion proxy stays deferred until the minimal LuaLS hover seam is expanded into editor completion request routing.',
              },
              {
                key: 'lua-diagnostics',
                scope: 'deferred',
                source: 'deferred-scope-contract:lua-diagnostics',
                detail:
                  'Lua diagnostics proxy stays deferred until the server forwards LuaLS diagnostics notifications into host `publishDiagnostics` plumbing.',
              },
              {
                key: 'luaHover',
                scope: 'local-only',
                source: 'lua-provider:hover-proxy',
                detail:
                  'Lua hover is active for `.risulua` documents by forwarding `textDocument/hover` to the LuaLS companion using the mirrored virtual Lua document when the sidecar is ready. If LuaLS is unavailable or still starting, the server returns no Lua hover result and leaves CBS capabilities unchanged.',
              },
              {
                key: 'definition',
                scope: 'local-first',
                source: 'server-capability:definition',
                detail:
                  'Definition is active for routed CBS fragments, returns fragment-local definitions first, and appends workspace chat-variable writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
              },
              {
                key: 'documentSymbol',
                scope: 'local-only',
                source: 'server-capability:documentSymbol',
                detail:
                  'Document symbols are active for routed CBS fragments, expose fragment-local outline structure, and group multi-fragment documents by CBS-bearing section containers only.',
              },
              {
                key: 'references',
                scope: 'local-first',
                source: 'server-capability:references',
                detail:
                  'References are active for routed CBS fragments, return fragment-local read/write locations first, and append workspace chat-variable readers/writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
              },
              {
                key: 'rename',
                scope: 'local-first',
                source: 'server-capability:rename',
                detail:
                  'Rename is active for routed CBS fragments, keeps prepareRename rejection messages for malformed/unresolved/global/external positions, and applies fragment-local edits first before appending workspace chat-variable occurrences when VariableFlowService workspace state is available.',
              },
              {
                key: 'formatting',
                scope: 'local-only',
                source: 'server-capability:formatting',
                detail:
                  'Formatting is active for routed CBS fragments, produces fragment-local canonical text edits, and only promotes host edits that pass the shared host-fragment safety contract.',
              },
            ]),
          },
          excludedArtifacts: {
            risutoggle: {
              scope: 'workspace-disabled',
              source: 'document-router:risutoggle',
              detail:
                '`.risutoggle` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
            },
            risuvar: {
              scope: 'workspace-disabled',
              source: 'document-router:risuvar',
              detail:
                '`.risuvar` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
            },
          },
            featureAvailability: expect.objectContaining({
            codeAction: {
              scope: 'local-only',
              source: 'server-capability:codeAction',
              detail:
                'Code actions are active for routed CBS fragments, reuse diagnostics metadata for quick fixes and guidance, and only promote automatic host edits that pass the shared host-fragment safety contract.',
            },
            completion: {
              scope: 'local-only',
              source: 'server-capability:completion',
              detail:
                'Completion is active for routed CBS fragments and operates on the current document/fragment context only.',
            },
            definition: {
              scope: 'local-first',
              source: 'server-capability:definition',
              detail:
                'Definition is active for routed CBS fragments, returns fragment-local definitions first, and appends workspace chat-variable writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
            },
            documentSymbol: {
              scope: 'local-only',
              source: 'server-capability:documentSymbol',
              detail:
                'Document symbols are active for routed CBS fragments, expose fragment-local outline structure, and group multi-fragment documents by CBS-bearing section containers only.',
            },
            references: {
              scope: 'local-first',
              source: 'server-capability:references',
              detail:
                'References are active for routed CBS fragments, return fragment-local read/write locations first, and append workspace chat-variable readers/writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
            },
            formatting: {
              scope: 'local-only',
              source: 'server-capability:formatting',
              detail:
                'Formatting is active for routed CBS fragments, produces fragment-local canonical text edits, and only promotes host edits that pass the shared host-fragment safety contract.',
            },
          }),
        },
      },
    });

    expect(connection.codeLensHandler).not.toBeNull();
    expect(connection.codeActionHandler).not.toBeNull();
    expect(connection.completionHandler).not.toBeNull();
    expect(connection.documentSymbolHandler).not.toBeNull();
    expect(connection.formattingHandler).not.toBeNull();
    expect(connection.definitionHandler).not.toBeNull();
    expect(connection.referencesHandler).not.toBeNull();
    expect(connection.prepareRenameHandler).not.toBeNull();
    expect(connection.renameHandler).not.toBeNull();
    expect(connection.hoverHandler).not.toBeNull();
    expect(connection.signatureHelpHandler).not.toBeNull();
    expect(connection.foldingRangesHandler).not.toBeNull();
    expect(connection.semanticTokensHandler).not.toBeNull();
    expect(connection.definitionRegistrations).toBe(1);
    expect(connection.referencesRegistrations).toBe(1);
    expect(connection.prepareRenameRegistrations).toBe(1);
    expect(connection.renameRegistrations).toBe(1);
    expect(connection.formattingRegistrations).toBe(1);
  });

  it('connects the LuaLS sidecar manager to initialize, initialized, and shutdown lifecycle hooks', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const luaLsManager = createLuaLsProcessManagerStub();

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: () => luaLsManager,
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

    expect(luaLsManager.start).toHaveBeenCalledWith({ rootPath: '/workspace-root' });

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
      createLuaLsProcessManager: () => luaLsManager,
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
  });

  it('applies runtime config precedence before initialize options when preparing standalone startup', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const luaLsManager = createLuaLsProcessManagerStub();

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: () => luaLsManager,
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

  it('routes standalone .risulua open/change/close through the LuaLS document mirror', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const luaLsManager = createLuaLsProcessManagerStub();
    const uri = 'file:///tmp/standalone.risulua';
    const initialText = 'local mood = getState("mood")\n';
    const changedText = 'local mood = getState("nextMood")\n';

    registerServer(connection as any, documents as any, {
      createLuaLsProcessManager: () => luaLsManager,
    });

    documents.open(uri, initialText, 1, 'lua');
    documents.change(uri, changedText, 2, 'lua');
    documents.close(uri);

    expect(luaLsManager.syncDocument).toHaveBeenNthCalledWith(1, {
      sourceUri: uri,
      sourceFilePath: '/tmp/standalone.risulua',
      transportUri: 'risu-luals:///tmp/standalone.risulua.lua',
      languageId: 'lua',
      rootPath: null,
      version: 1,
      text: initialText,
    });
    expect(luaLsManager.syncDocument).toHaveBeenNthCalledWith(2, {
      sourceUri: uri,
      sourceFilePath: '/tmp/standalone.risulua',
      transportUri: 'risu-luals:///tmp/standalone.risulua.lua',
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
        expect(params).toEqual({
          textDocument: {
            uri: 'risu-luals:///tmp/hover.risulua.lua',
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
      createLuaLsProcessManager: () => luaLsManager,
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
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(connection.traceMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: '[cbs-lsp:luaProxy] hover-start' }),
        expect.objectContaining({ message: '[cbs-lsp:luaProxy] hover-end' }),
      ]),
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
  });

  it('routes textDocument/codeAction through the server seam and returns safe quick fixes plus guidance actions', async () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const root = await createWorkspaceRoot();
    const deprecatedText = lorebookDocument(['{{#if true}}fallback{{/if}}']);
    const slotText = promptDocument(['{{#each items}}{{slot::item}}{{/each}}']);
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
          title: 'Replace with "#when"',
          kind: CodeActionKind.QuickFix,
          hasEdit: true,
          isNoopGuidance: false,
          linkedDiagnostics: [expect.objectContaining({ source: 'risu-cbs' })],
        }),
      ]),
    });

    expect(deprecatedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Replace with "#when"' }),
      ]),
    );

    const deprecatedAction = deprecatedActions?.find((action) => action.title === 'Replace with "#when"');
    expect(applyTextEdits(deprecatedText, deprecatedAction?.edit?.changes?.[deprecatedUri] ?? [])).toBe(
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
          edit: {
            changes: null,
            documentChangesCount: 0,
          },
          hasEdit: true,
          isNoopGuidance: true,
          isPreferred: false,
          kind: CodeActionKind.QuickFix,
          linkedDiagnostics: [expect.objectContaining({ source: 'risu-cbs' })],
          title: 'Explain: {{slot::name}} only works inside {{#each ... as name}} blocks',
        },
      ],
    });

    expect(slotActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Explain: {{slot::name}} only works inside {{#each ... as name}} blocks',
          edit: { changes: {} },
        }),
      ]),
    );
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

  it('routes textDocument/definition through the server seam and returns local-first plus workspace writers', async () => {
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
        targetUri: writerUri,
      }),
    ]);
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
      'beta wakes the main chain, gamma only partially matches, and delta is blocked.',
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
      'alpha closes the cycle.',
      '',
    ].join('\n');
    const gammaText = [
      '---',
      'name: Gamma',
      'comment: Gamma',
      'constant: false',
      'selective: true',
      'enabled: true',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'gamma',
      '@@@ SECONDARY_KEYS',
      'omega',
      '@@@ CONTENT',
      'Gamma lore body.',
      '',
    ].join('\n');
    const deltaText = [
      '---',
      'name: Delta',
      'comment: Delta',
      'constant: false',
      'selective: false',
      'enabled: true',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'delta',
      '@@@ CONTENT',
      '@@no_recursive_search',
      'Delta lore body.',
      '',
    ].join('\n');
    const alphaUri = await writeWorkspaceFile(root, 'lorebooks/alpha.risulorebook', alphaText);
    await writeWorkspaceFile(root, 'lorebooks/beta.risulorebook', betaText);
    await writeWorkspaceFile(root, 'lorebooks/gamma.risulorebook', gammaText);
    await writeWorkspaceFile(root, 'lorebooks/delta.risulorebook', deltaText);

    registerServer(connection as any, documents as any);
    documents.open(alphaUri, alphaText, 1);

    const codeLenses = connection.codeLensHandler?.({
      textDocument: { uri: alphaUri },
    });

    expect(codeLenses?.map((lens) => lens.command?.title)).toEqual([
      '1개 엔트리에 의해 활성화됨 | 1개 엔트리를 활성화',
      '부분 매치: 들어옴 0 / 나감 1 | 차단: 들어옴 0 / 나감 1 | 순환 감지',
    ]);
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
      createLuaLsProcessManager: () => luaLsManager,
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

    // Incomplete syntax (unclosed {{getvar::en) is treated as PlainText by tokenizer
    // Per architectural rule: no raw token value parsing, so no completions offered
    expect(completionLabels.length).toBe(0);
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
          data: {
            cbs: {
              category: {
                category: 'variable',
                kind: 'chat-variable',
              },
              explanation: {
                reason: 'scope-analysis',
                source: 'chat-variable-symbol-table',
                detail:
                  'Completion resolved this candidate from analyzed chat/global variable definitions in the current fragment.',
              },
            },
          },
        }),
      ]),
    );
    expect(version1Bundle.snapshot.hover).toEqual(
      expect.objectContaining({
        contents: expect.objectContaining({ value: expect.stringContaining('**Variable: mood**') }),
        data: {
          cbs: {
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
          },
        },
      }),
    );
    expect(version1Bundle.snapshot.diagnostics).toHaveLength(1);
    expect(version1Bundle.snapshot.codeActions).toEqual([
      expect.objectContaining({
        hasEdit: true,
        isNoopGuidance: false,
        kind: CodeActionKind.QuickFix,
        title: 'Replace with "#when"',
      }),
    ]);

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

    expect(
      getLatestDiagnosticsForUri(connection, readerUri).diagnostics.some(
        (diagnostic) => diagnostic.code === 'CBS101',
      ),
    ).toBe(false);

    documents.change(writerUri, initialWriterText, 3);

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
      createLuaLsProcessManager: () => luaLsManager,
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
        expect.objectContaining({ message: '[cbs-lsp:server] shutdown' }),
      ]),
    );

    const availabilityTrace = connection.traceMessages.find(
      (entry) => entry.message === '[cbs-lsp:server] availability-contract',
    );

    expect(availabilityTrace?.verbose).toBeDefined();
    expect(JSON.parse(availabilityTrace?.verbose ?? '{}')).toEqual(
      expect.objectContaining({
      availability: {
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
            availabilityScope: 'deferred',
            availabilitySource: 'deferred-scope-contract:lua-diagnostics',
            availabilityDetail:
              'Lua diagnostics proxy stays deferred until the server forwards LuaLS diagnostics notifications into host `publishDiagnostics` plumbing.',
          },
          {
            key: 'lua-completion',
            availabilityScope: 'deferred',
            availabilitySource: 'deferred-scope-contract:lua-completion',
            availabilityDetail:
              'Lua completion proxy stays deferred until the minimal LuaLS hover seam is expanded into editor completion request routing.',
          },
          {
            key: 'definition',
            availabilityScope: 'local-first',
            availabilitySource: 'server-capability:definition',
            availabilityDetail:
              'Definition is active for routed CBS fragments, returns fragment-local definitions first, and appends workspace chat-variable writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
          },
          {
            key: 'references',
            availabilityScope: 'local-first',
            availabilitySource: 'server-capability:references',
            availabilityDetail:
              'References are active for routed CBS fragments, return fragment-local read/write locations first, and append workspace chat-variable readers/writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
          },
        ]),
      },
      }),
    );
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
  });
});
