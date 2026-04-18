import { fileURLToPath } from 'node:url';

import { CBSBuiltinRegistry } from 'risu-workbench-core';
import {
  createConnection,
  type CompletionParams,
  type Connection,
  type FoldingRangeParams,
  type HoverParams,
  type InitializeParams,
  type InitializeResult,
  ProposedFeatures,
  type SemanticTokensParams,
  type SignatureHelpParams,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { fragmentAnalysisService, type FragmentAnalysisRequest } from './core';
import { shouldRouteForDiagnostics } from './document-router';
import { routeDiagnosticsForDocument } from './diagnostics-router';
import { CompletionProvider } from './features/completion';
import { FoldingProvider } from './features/folding';
import { HoverProvider } from './features/hover';
import {
  SemanticTokensProvider,
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
} from './features/semanticTokens';
import { SignatureHelpProvider } from './features/signature';

function getFilePathFromUri(uri: string): string {
  if (!uri.startsWith('file://')) {
    return uri;
  }

  try {
    return fileURLToPath(uri);
  } catch {
    return uri.replace(/^file:\/\//u, '');
  }
}

function createFragmentRequest(document: TextDocument): FragmentAnalysisRequest | null {
  const filePath = getFilePathFromUri(document.uri);
  if (!shouldRouteForDiagnostics(filePath)) {
    fragmentAnalysisService.clearUri(document.uri);
    return null;
  }

  return {
    uri: document.uri,
    version: document.version,
    filePath,
    text: document.getText(),
  };
}

function createRequestResolver(documents: TextDocuments<TextDocument>) {
  return (uri: string): FragmentAnalysisRequest | null => {
    const document = documents.get(uri);
    if (!document) {
      return null;
    }

    return createFragmentRequest(document);
  };
}

function publishDiagnosticsForDocument(connection: Connection, document: TextDocument): void {
  const request = createFragmentRequest(document);
  if (!request) {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
  connection.sendDiagnostics({ uri: request.uri, diagnostics });
}

export function createInitializeResult(): InitializeResult {
  return {
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
  };
}

export function registerServer(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
): void {
  const registry = new CBSBuiltinRegistry();
  const resolveRequest = createRequestResolver(documents);
  const completionProvider = new CompletionProvider(registry, {
    analysisService: fragmentAnalysisService,
    resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
  });
  const hoverProvider = new HoverProvider(registry, {
    analysisService: fragmentAnalysisService,
    resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
  });
  const signatureHelpProvider = new SignatureHelpProvider(registry, fragmentAnalysisService);
  const foldingProvider = new FoldingProvider(fragmentAnalysisService);
  const semanticTokensProvider = new SemanticTokensProvider(fragmentAnalysisService, registry);

  connection.onInitialize(
    (_params: InitializeParams): InitializeResult => createInitializeResult(),
  );

  connection.onCompletion((params: CompletionParams) => completionProvider.provide(params));
  connection.onHover((params: HoverParams) => hoverProvider.provide(params));
  connection.onSignatureHelp((params: SignatureHelpParams) => {
    const request = resolveRequest(params.textDocument.uri);
    return request ? signatureHelpProvider.provide(params, request) : null;
  });
  connection.onFoldingRanges((params: FoldingRangeParams) => {
    const request = resolveRequest(params.textDocument.uri);
    return request ? foldingProvider.provide(params, request) : [];
  });
  connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
    const request = resolveRequest(params.textDocument.uri);
    return request ? semanticTokensProvider.provide(params, request) : { data: [] };
  });

  documents.onDidOpen((event) => {
    publishDiagnosticsForDocument(connection, event.document);
  });

  documents.onDidChangeContent((event) => {
    publishDiagnosticsForDocument(connection, event.document);
  });

  documents.onDidClose((event) => {
    fragmentAnalysisService.clearUri(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });
}

export function startServer(): void {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  registerServer(connection, documents);
  documents.listen(connection);
  connection.listen();
}

if (require.main === module) {
  startServer();
}
