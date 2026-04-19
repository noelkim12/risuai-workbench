import type {
  CancellationToken,
  CompletionItem,
  Diagnostic,
  FoldingRange,
  Hover,
  InitializeParams,
  InitializeResult,
  SemanticTokens,
  SignatureHelp,
} from 'vscode-languageserver/node';
import { TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as core from 'risu-workbench-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSyntheticDocumentVersion, fragmentAnalysisService } from '../src/core';
import { SEMANTIC_TOKEN_MODIFIERS, SEMANTIC_TOKEN_TYPES } from '../src/features/semanticTokens';
import { registerServer } from '../src/server';
import { offsetToPosition } from '../src/utils/position';
import { getFixtureCorpusEntry } from './fixtures/fixture-corpus';

function createDisposable() {
  return {
    dispose() {},
  };
}

function lorebookDocument(bodyLines: readonly string[]): string {
  return ['---', 'name: entry', '---', '@@@ CONTENT', ...bodyLines, ''].join('\n');
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

class FakeConnection {
  initializeHandler: ((params: InitializeParams) => InitializeResult) | null = null;

  shutdownHandler: (() => void | Promise<void>) | null = null;

  completionHandler: ((params: any, token?: CancellationToken) => CompletionItem[] | { items: CompletionItem[] }) | null = null;

  hoverHandler: ((params: any, token?: CancellationToken) => Hover | null) | null = null;

  signatureHelpHandler: ((params: any, token?: CancellationToken) => SignatureHelp | null) | null = null;

  foldingRangesHandler: ((params: any, token?: CancellationToken) => FoldingRange[]) | null = null;

  semanticTokensHandler: ((params: any, token?: CancellationToken) => SemanticTokens) | null = null;

  definitionRegistrations = 0;

  referencesRegistrations = 0;

  renameRegistrations = 0;

  formattingRegistrations = 0;

  readonly diagnostics: Array<{ uri: string; diagnostics: readonly Diagnostic[] }> = [];

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

  onCompletion(handler: (params: any, token?: CancellationToken) => CompletionItem[] | { items: CompletionItem[] }) {
    this.completionHandler = handler;
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

  onDefinition() {
    this.definitionRegistrations += 1;
    return createDisposable();
  }

  onReferences() {
    this.referencesRegistrations += 1;
    return createDisposable();
  }

  onRenameRequest() {
    this.renameRegistrations += 1;
    return createDisposable();
  }

  onDocumentFormatting() {
    this.formattingRegistrations += 1;
    return createDisposable();
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

function createCancellationToken(cancelled: boolean = false): CancellationToken {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: () => createDisposable(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  fragmentAnalysisService.clearAll();
});

describe('LSP server integration', () => {
  it('advertises and registers only the fragment-local capabilities in scope', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();

    registerServer(connection as any, documents as any);

    const initializeResult = connection.initializeHandler?.({
      capabilities: {},
    } as InitializeParams);

    expect(initializeResult).toEqual({
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Incremental,
        },
        completionProvider: {},
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
              completion: {
                scope: 'local-only',
                source: 'server-capability:completion',
                detail:
                  'Completion is active for routed CBS fragments and operates on the current document/fragment context only.',
              },
              definition: {
                scope: 'deferred',
                source: 'deferred-scope-contract:definition',
                detail:
                  'Definition provider exists but server capability stays deferred until workspace-level cross-file resolution is available.',
              },
              formatting: {
                scope: 'deferred',
                source: 'deferred-scope-contract:formatting',
                detail:
                  'Formatting stays deferred until host-fragment patch semantics are safe for embedded CBS artifacts.',
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
            features: expect.arrayContaining([
              {
                key: 'completion',
                scope: 'local-only',
                source: 'server-capability:completion',
                detail:
                  'Completion is active for routed CBS fragments and operates on the current document/fragment context only.',
              },
              {
                key: 'definition',
                scope: 'deferred',
                source: 'deferred-scope-contract:definition',
                detail:
                  'Definition provider exists but server capability stays deferred until workspace-level cross-file resolution is available.',
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
            completion: {
              scope: 'local-only',
              source: 'server-capability:completion',
              detail:
                'Completion is active for routed CBS fragments and operates on the current document/fragment context only.',
            },
            definition: {
              scope: 'deferred',
              source: 'deferred-scope-contract:definition',
              detail:
                'Definition provider exists but server capability stays deferred until workspace-level cross-file resolution is available.',
            },
            formatting: {
              scope: 'deferred',
              source: 'deferred-scope-contract:formatting',
              detail:
                'Formatting stays deferred until host-fragment patch semantics are safe for embedded CBS artifacts.',
            },
          }),
        },
      },
    });

    expect(connection.completionHandler).not.toBeNull();
    expect(connection.hoverHandler).not.toBeNull();
    expect(connection.signatureHelpHandler).not.toBeNull();
    expect(connection.foldingRangesHandler).not.toBeNull();
    expect(connection.semanticTokensHandler).not.toBeNull();
    expect(connection.definitionRegistrations).toBe(0);
    expect(connection.referencesRegistrations).toBe(0);
    expect(connection.renameRegistrations).toBe(0);
    expect(connection.formattingRegistrations).toBe(0);
  });

  it('refreshes cached analysis on open/change, invalidates stale versions, and serves features from cache', () => {
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

    const hover = connection.hoverHandler?.({
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

  it('invalidates stale feature and diagnostics cache when text changes without a version bump', () => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const uri = 'file:///fixtures/server-same-version-cache.risulorebook';
    const version1Text = lorebookDocument(['Hello {{user}}']);
    const changedSameVersionText = lorebookDocument(['Hello {{char}}']);

    registerServer(connection as any, documents as any);
    documents.open(uri, version1Text, 1);

    const firstHover = connection.hoverHandler?.({
      textDocument: { uri },
      position: positionAt(version1Text, 'user', 1),
    });
    expect(getHoverMarkdown(firstHover ?? null)).toContain('**user**');
    expect(parseSpy).toHaveBeenCalledTimes(1);

    documents.change(uri, changedSameVersionText, 1);

    const secondHover = connection.hoverHandler?.({
      textDocument: { uri },
      position: positionAt(changedSameVersionText, 'char', 1),
    });
    expect(getHoverMarkdown(secondHover ?? null)).toContain('**char**');
    expect(fragmentAnalysisService.getCachedAnalysis(uri, 1)?.cache.textSignature).toBe(
      createSyntheticDocumentVersion(changedSameVersionText),
    );
    expect(parseSpy).toHaveBeenCalledTimes(2);
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

    registerServer(connection as any, documents as any);
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
        expect.objectContaining({ message: '[cbs-lsp:completion] start' }),
        expect.objectContaining({ message: '[cbs-lsp:completion] end' }),
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
    expect(JSON.parse(availabilityTrace?.verbose ?? '{}')).toEqual({
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
        features: expect.arrayContaining([
          {
            key: 'completion',
            availabilityScope: 'local-only',
            availabilitySource: 'server-capability:completion',
            availabilityDetail:
              'Completion is active for routed CBS fragments and operates on the current document/fragment context only.',
          },
          {
            key: 'definition',
            availabilityScope: 'deferred',
            availabilitySource: 'deferred-scope-contract:definition',
            availabilityDetail:
              'Definition provider exists but server capability stays deferred until workspace-level cross-file resolution is available.',
          },
        ]),
      },
    });
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
      connection.semanticTokensHandler?.({
        textDocument: { uri },
      }) ?? { data: [] },
    ).toEqual({ data: [] });
  });
});
