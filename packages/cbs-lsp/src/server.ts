import { fileURLToPath } from 'node:url';

import { CBSBuiltinRegistry } from 'risu-workbench-core';
import {
  type CancellationToken,
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

import {
  ACTIVE_FEATURE_AVAILABILITY,
  EXCLUDED_ARTIFACT_AVAILABILITY,
  createCbsRuntimeAvailabilityContract,
  createNormalizedRuntimeAvailabilitySnapshot,
  createRuntimeAvailabilityTracePayload,
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
} from './core';
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
import { isRequestCancelled } from './request-cancellation';
import {
  logFeature,
  traceFeature,
  traceFeaturePayload,
  type CbsLspFeatureName,
} from './server-tracing';

function shouldSkipRequest(cancellationToken: CancellationToken | undefined): boolean {
  return isRequestCancelled(cancellationToken);
}

function traceFeatureRequest(
  connection: Connection,
  feature: CbsLspFeatureName,
  phase: string,
  details?: Record<string, number | string | boolean | null | undefined>,
): void {
  traceFeature(connection, feature, phase, details);
}

function traceRequestResult(
  connection: Connection,
  feature: CbsLspFeatureName,
  phase: string,
  details?: Record<string, number | string | boolean | null | undefined>,
): void {
  traceFeature(connection, feature, phase, details);
}

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
    traceFeatureRequest(connection, 'diagnostics', 'skip', {
      uri: document.uri,
      version: document.version,
      routed: false,
    });
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  traceFeatureRequest(connection, 'diagnostics', 'start', {
    uri: request.uri,
    version: request.version,
  });
  const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
  traceRequestResult(connection, 'diagnostics', 'end', {
    uri: request.uri,
    version: request.version,
    count: diagnostics.length,
  });
  connection.sendDiagnostics({ uri: request.uri, diagnostics });
}

export function createInitializeResult(): InitializeResult {
  const runtimeAvailability = createCbsRuntimeAvailabilityContract();

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
    experimental: {
      cbs: {
        availability: runtimeAvailability,
        availabilitySnapshot: createNormalizedRuntimeAvailabilitySnapshot(),
        excludedArtifacts: runtimeAvailability.excludedArtifacts,
        featureAvailability: runtimeAvailability.featureAvailability,
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
    (_params: InitializeParams): InitializeResult => {
      const result = createInitializeResult();
      logFeature(connection, 'server', 'initialize', {
        textDocumentSync: TextDocumentSyncKind.Incremental,
      });
      traceFeatureRequest(connection, 'server', 'initialize', {
        completion: Boolean(result.capabilities.completionProvider),
        hover: Boolean(result.capabilities.hoverProvider),
        signature: Boolean(result.capabilities.signatureHelpProvider),
        folding: Boolean(result.capabilities.foldingRangeProvider),
        semanticTokens: Boolean(result.capabilities.semanticTokensProvider),
      });
      traceFeaturePayload(connection, 'server', 'availability-contract', {
        availability: createRuntimeAvailabilityTracePayload(),
      });
      return result;
    },
  );
  connection.onShutdown(() => {
    logFeature(connection, 'server', 'shutdown');
    traceFeatureRequest(connection, 'server', 'shutdown');
    fragmentAnalysisService.clearAll();
  });

  connection.onCompletion((params: CompletionParams, cancellationToken) => {
    traceFeatureRequest(connection, 'completion', 'start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'completion', 'cancelled', {
        uri: params.textDocument.uri,
      });
      return [];
    }

    const result = completionProvider.provide(params, cancellationToken);
    traceRequestResult(connection, 'completion', 'end', {
      uri: params.textDocument.uri,
      count: result.length,
    });
    return result;
  });
  connection.onHover((params: HoverParams, cancellationToken) => {
    traceFeatureRequest(connection, 'hover', 'start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'hover', 'cancelled', {
        uri: params.textDocument.uri,
      });
      return null;
    }

    const result = hoverProvider.provide(params, cancellationToken);
    traceRequestResult(connection, 'hover', 'end', {
      uri: params.textDocument.uri,
      hasResult: result !== null,
    });
    return result;
  });
  connection.onSignatureHelp((params: SignatureHelpParams, cancellationToken) => {
    traceFeatureRequest(connection, 'signature', 'start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'signature', 'cancelled', {
        uri: params.textDocument.uri,
      });
      return null;
    }

    const request = resolveRequest(params.textDocument.uri);
    const result = request ? signatureHelpProvider.provide(params, request, cancellationToken) : null;
    traceRequestResult(connection, 'signature', 'end', {
      uri: params.textDocument.uri,
      hasResult: result !== null,
    });
    return result;
  });
  connection.onFoldingRanges((params: FoldingRangeParams, cancellationToken) => {
    traceFeatureRequest(connection, 'folding', 'start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'folding', 'cancelled', {
        uri: params.textDocument.uri,
      });
      return [];
    }

    const request = resolveRequest(params.textDocument.uri);
    const result = request ? foldingProvider.provide(params, request, cancellationToken) : [];
    traceRequestResult(connection, 'folding', 'end', {
      uri: params.textDocument.uri,
      count: result.length,
    });
    return result;
  });
  connection.languages.semanticTokens.on((params: SemanticTokensParams, cancellationToken) => {
    traceFeatureRequest(connection, 'semanticTokens', 'start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'semanticTokens', 'cancelled', {
        uri: params.textDocument.uri,
      });
      return { data: [] };
    }

    const request = resolveRequest(params.textDocument.uri);
    const result = request
      ? semanticTokensProvider.provide(params, request, cancellationToken)
      : { data: [] };
    traceRequestResult(connection, 'semanticTokens', 'end', {
      uri: params.textDocument.uri,
      count: result.data.length,
    });
    return result;
  });

  documents.onDidOpen((event) => {
    traceFeatureRequest(connection, 'server', 'document-open', {
      uri: event.document.uri,
      version: event.document.version,
    });
    publishDiagnosticsForDocument(connection, event.document);
  });

  documents.onDidChangeContent((event) => {
    traceFeatureRequest(connection, 'server', 'document-change', {
      uri: event.document.uri,
      version: event.document.version,
    });
    publishDiagnosticsForDocument(connection, event.document);
  });

  documents.onDidClose((event) => {
    traceFeatureRequest(connection, 'server', 'document-close', {
      uri: event.document.uri,
      version: event.document.version,
    });
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
