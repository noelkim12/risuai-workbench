import type {
  CodeAction,
  CodeLens,
  CompletionItem,
  Definition,
  Diagnostic,
  DocumentSymbol,
  DocumentFormattingParams,
  DocumentRangeFormattingParams,
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
import { TextDocument } from 'vscode-languageserver-textdocument';
import { afterEach, describe, expect, it } from 'vitest';

import { fragmentAnalysisService } from '../src/core';
import { positionToOffset, offsetToPosition } from '../src/utils/position';
import { registerServer } from '../src/server';
import { getFixtureCorpusEntry, type FixtureCorpusEntry } from './fixtures/fixture-corpus';

function createDisposable() {
  return {
    dispose() {},
  };
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

function lineOf(text: string, needle: string, occurrence: number = 0): number {
  return positionAt(text, needle, 0, occurrence).line;
}

function getCompletionItems(
  result: CompletionItem[] | { items: CompletionItem[] } | null | undefined,
) {
  if (!result) {
    return [];
  }

  return Array.isArray(result) ? result : result.items;
}

function getHoverMarkdown(hover: Hover | null): string | null {
  if (!hover) {
    return null;
  }

  const contents = hover.contents as { value?: string };
  return contents.value ?? null;
}

function getLastDiagnostics(connection: FakeConnection) {
  const diagnostics = connection.diagnostics[connection.diagnostics.length - 1];
  expect(diagnostics).toBeDefined();
  return diagnostics!;
}

function decodeSemanticTokenTexts(text: string, semanticTokens: SemanticTokens): string[] {
  const decoded: string[] = [];
  let line = 0;
  let startChar = 0;

  for (let index = 0; index < semanticTokens.data.length; index += 5) {
    const deltaLine = semanticTokens.data[index];
    const deltaStart = semanticTokens.data[index + 1];
    const length = semanticTokens.data[index + 2];

    line += deltaLine;
    startChar = deltaLine === 0 ? startChar + deltaStart : deltaStart;

    const startOffset = positionToOffset(text, { line, character: startChar });
    const endOffset = positionToOffset(text, { line, character: startChar + length });
    decoded.push(text.slice(startOffset, endOffset));
  }

  return decoded;
}

class FakeConnection {
  initializeHandler: ((params: InitializeParams) => InitializeResult) | null = null;

  shutdownHandler: (() => void | Promise<void>) | null = null;

  executeCommandHandler: ((params: any) => void | Promise<void>) | null = null;

  codeActionHandler: ((params: any) => CodeAction[]) | null = null;

  codeLensHandler: ((params: any) => CodeLens[]) | null = null;

  completionHandler: ((params: any) => CompletionItem[] | { items: CompletionItem[] }) | null =
    null;

  documentSymbolHandler: ((params: any) => DocumentSymbol[]) | null = null;

  definitionHandler: ((params: any) => Definition | null) | null = null;

  referencesHandler: ((params: any) => Location[]) | null = null;

  prepareRenameHandler: ((params: TextDocumentPositionParams) => Range | null) | null = null;

  renameHandler: ((params: RenameParams) => WorkspaceEdit | null) | null = null;

  hoverHandler: any = null;

  signatureHelpHandler: ((params: any) => SignatureHelp | null) | null = null;

  foldingRangesHandler: ((params: any) => FoldingRange[]) | null = null;

  formattingHandler: ((params: DocumentFormattingParams) => TextEdit[]) | null = null;

  rangeFormattingHandler: ((params: DocumentRangeFormattingParams) => TextEdit[]) | null = null;

  semanticTokensHandler: ((params: any) => SemanticTokens) | null = null;

  readonly diagnostics: Array<{ uri: string; version?: number; diagnostics: readonly Diagnostic[] }> = [];

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
      on: (handler: (params: any) => SemanticTokens) => {
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

  onExecuteCommand(handler: (params: any) => void | Promise<void>) {
    this.executeCommandHandler = handler;
    return createDisposable();
  }

  onCodeAction(handler: (params: any) => CodeAction[]) {
    this.codeActionHandler = handler;
    return createDisposable();
  }

  onCodeLens(handler: (params: any) => CodeLens[]) {
    this.codeLensHandler = handler;
    return createDisposable();
  }

  onCompletion(handler: (params: any) => CompletionItem[] | { items: CompletionItem[] }) {
    this.completionHandler = handler;
    return createDisposable();
  }

  onDocumentSymbol(handler: (params: any) => DocumentSymbol[]) {
    this.documentSymbolHandler = handler;
    return createDisposable();
  }

  onDefinition(handler: (params: any) => Definition | null) {
    this.definitionHandler = handler;
    return createDisposable();
  }

  onReferences(handler: (params: ReferenceParams) => Location[]) {
    this.referencesHandler = handler;
    return createDisposable();
  }

  onPrepareRename(handler: (params: TextDocumentPositionParams) => Range | null) {
    this.prepareRenameHandler = handler;
    return createDisposable();
  }

  onRenameRequest(handler: (params: RenameParams) => WorkspaceEdit | null) {
    this.renameHandler = handler;
    return createDisposable();
  }

  onHover(handler: (params: any) => Hover | null) {
    this.hoverHandler = handler;
    return createDisposable();
  }

  onSignatureHelp(handler: (params: any) => SignatureHelp | null) {
    this.signatureHelpHandler = handler;
    return createDisposable();
  }

  onFoldingRanges(handler: (params: any) => FoldingRange[]) {
    this.foldingRangesHandler = handler;
    return createDisposable();
  }

  onDocumentFormatting(handler: (params: DocumentFormattingParams) => TextEdit[]) {
    this.formattingHandler = handler;
    return createDisposable();
  }

  onDocumentRangeFormatting(handler: (params: DocumentRangeFormattingParams) => TextEdit[]) {
    this.rangeFormattingHandler = handler;
    return createDisposable();
  }

  sendDiagnostics(params: { uri: string; version?: number; diagnostics: readonly Diagnostic[] }) {
    this.diagnostics.push(params);
    return Promise.resolve();
  }

  listen() {
    return undefined;
  }
}

class FakeDocuments {
  private readonly documents = new Map<string, TextDocument>();

  private readonly openListeners: Array<(event: { document: TextDocument }) => void> = [];

  readonly onDidOpen = (listener: (event: { document: TextDocument }) => void) => {
    this.openListeners.push(listener);
    return createDisposable();
  };

  readonly onDidChangeContent = () => createDisposable();

  readonly onDidClose = () => createDisposable();

  get(uri: string) {
    return this.documents.get(uri);
  }

  open(uri: string, text: string, version: number, languageId: string = 'cbs') {
    const document = TextDocument.create(uri, languageId, version, text);
    this.documents.set(uri, document);
    this.openListeners.forEach((listener) => {
      listener({ document });
    });
    return document;
  }
}

interface SupportedArtifactScenario {
  label: string;
  happyEntryId: string;
  failureEntryId: string;
  assertFeature: (connection: FakeConnection, entry: FixtureCorpusEntry) => void;
}

const supportedArtifactScenarios: readonly SupportedArtifactScenario[] = [
  {
    label: 'lorebook → signature help',
    happyEntryId: 'lorebook-signature-happy',
    failureEntryId: 'lorebook-unclosed-macro',
    assertFeature: (connection, entry) => {
      const signature = connection.signatureHelpHandler?.({
        textDocument: { uri: entry.uri },
        position: positionAt(entry.text, 'happy', 2),
      });

      expect(signature?.signatures[0]?.label).toContain('setvar');
      expect(signature?.activeParameter).toBe(1);
    },
  },
  {
    label: 'regex → folding',
    happyEntryId: 'regex-foldable-block',
    failureEntryId: 'regex-missing-required-argument',
    assertFeature: (connection, entry) => {
      const ranges = connection.foldingRangesHandler?.({
        textDocument: { uri: entry.uri },
      });

      expect(ranges).toEqual([
        expect.objectContaining({
          startLine: lineOf(entry.text, '{{#when::true}}'),
        }),
      ]);
      expect(ranges?.[0]?.endLine).toBeGreaterThan(ranges?.[0]?.startLine ?? -1);
    },
  },
  {
    label: 'prompt → semantic tokens',
    happyEntryId: 'prompt-builtin-basic',
    failureEntryId: 'prompt-empty-block',
    assertFeature: (connection, entry) => {
      const semanticTokens = connection.semanticTokensHandler?.({
        textDocument: { uri: entry.uri },
      }) ?? { data: [] };

      expect(semanticTokens.data.length).toBeGreaterThan(0);
      expect(semanticTokens.data.length % 5).toBe(0);
      expect(decodeSemanticTokenTexts(entry.text, semanticTokens)).toContain('user');
    },
  },
  {
    label: 'html → completion',
    happyEntryId: 'html-basic',
    failureEntryId: 'html-unclosed-macro',
    assertFeature: (connection, entry) => {
      const completions = getCompletionItems(
        connection.completionHandler?.({
          textDocument: { uri: entry.uri },
          position: positionAt(entry.text, '{{', 2),
        }),
      );
      const labels = completions.map((item) => item.label);

      expect(labels).toContain('user');
      expect(labels).toContain('setvar');
    },
  },
];

const unsupportedScenarios = [
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
    uri: 'file:///fixtures/unknown.feature-matrix.txt',
    text: 'plain text',
  },
] as const;

afterEach(() => {
  fragmentAnalysisService.clearAll();
});

describe('LSP feature matrix', () => {
  it.each(supportedArtifactScenarios)(
    'covers $label happy and failure diagnostics through the server seam',
    ({ happyEntryId, failureEntryId, assertFeature }) => {
      const connection = new FakeConnection();
      const documents = new FakeDocuments();
      const happyEntry = getFixtureCorpusEntry(happyEntryId);
      const failureEntry = getFixtureCorpusEntry(failureEntryId);

      registerServer(connection as any, documents as any);
      documents.open(happyEntry.uri, happyEntry.text, 1);

      const happyDiagnostics = getLastDiagnostics(connection);
      expect(happyDiagnostics.uri).toBe(happyEntry.uri);
      expect(happyDiagnostics.diagnostics).toEqual([]);
      expect(fragmentAnalysisService.getCachedAnalysis(happyEntry.uri, 1)).not.toBeNull();

      assertFeature(connection, happyEntry);

      documents.open(failureEntry.uri, failureEntry.text, 1);

      const failureDiagnostics = getLastDiagnostics(connection);
      const failureCodes = failureDiagnostics.diagnostics.map((diagnostic) => diagnostic.code);

      expect(failureDiagnostics.uri).toBe(failureEntry.uri);
      expect(failureEntry.expectedDiagnosticCodes.length).toBeGreaterThan(0);
      for (const expectedCode of failureEntry.expectedDiagnosticCodes) {
        expect(failureCodes).toContain(expectedCode);
      }
    },
  );

  it.each(unsupportedScenarios)('keeps $label explicitly unsupported', ({ uri, text }) => {
    const connection = new FakeConnection();
    const documents = new FakeDocuments();

    registerServer(connection as any, documents as any);
    documents.open(uri, text, 1);

    expect(getLastDiagnostics(connection)).toEqual({ uri, diagnostics: [] });
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
      connection.documentSymbolHandler?.({
        textDocument: { uri },
      }) ?? [],
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
