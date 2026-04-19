import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CBSBuiltinRegistry,
  getCustomExtensionArtifactContract,
  parseCustomExtensionArtifactFromPath,
} from 'risu-workbench-core';
import {
  type CancellationToken,
  CodeLensRefreshRequest,
  type CodeLensParams,
  createConnection,
  type CompletionParams,
  type Connection,
  type Definition,
  type DefinitionParams,
  type DocumentFormattingParams,
  DidChangeWatchedFilesNotification,
  type DidChangeWatchedFilesParams,
  type ExecuteCommandParams,
  FileChangeType,
  type FoldingRangeParams,
  type HoverParams,
  type InitializeParams,
  type InitializeResult,
  LSPErrorCodes,
  type Location,
  type Range as LSPRange,
  type ReferenceParams,
  type RenameParams,
  ResponseError,
  ProposedFeatures,
  type SemanticTokensParams,
  type SignatureHelpParams,
  TextEdit,
  type TextDocumentPositionParams,
  TextDocuments,
  TextDocumentSyncKind,
  type WorkspaceEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  createCbsRuntimeAvailabilityContract,
  createSyntheticDocumentVersion,
  createNormalizedRuntimeAvailabilitySnapshot,
  createRuntimeAvailabilityTracePayload,
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
} from './core';
import { shouldRouteForDiagnostics } from './document-router';
import { DiagnosticCode } from './analyzer/diagnostics';
import {
  createWorkspaceVariableDiagnosticsForUri,
  routeDiagnosticsForDocument,
  sortHostDiagnostics,
} from './diagnostics-router';
import { CompletionProvider } from './features/completion';
import {
  ACTIVATION_CHAIN_CODELENS_COMMAND,
  CodeLensProvider,
} from './features/codelens';
import { DefinitionProvider } from './features/definition';
import { FormattingProvider } from './features/formatting';
import { FoldingProvider } from './features/folding';
import { HoverProvider } from './features/hover';
import { RenameProvider } from './features/rename';
import { ReferencesProvider } from './features/references';
import {
  SemanticTokensProvider,
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
} from './features/semanticTokens';
import { SignatureHelpProvider } from './features/signature';
import {
  buildWorkspaceScanResult,
  createWorkspaceScanFileFromText,
  ElementRegistry,
  scanWorkspaceFilesSync,
  UnifiedVariableGraph,
  type WorkspaceScanResult,
} from './indexer';
import { isRequestCancelled } from './request-cancellation';
import { ActivationChainService, VariableFlowService } from './services';
import { positionToOffset } from './utils/position';
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

function createRenameRequestError(message: string): ResponseError<void> {
  return new ResponseError(-32600 as typeof LSPErrorCodes.ServerCancelled, message);
}

function resolvePrepareRenameResponse(result: {
  canRename: boolean;
  hostRange?: LSPRange;
  message?: string;
}): LSPRange | null {
  if (result.canRename && result.hostRange) {
    return result.hostRange;
  }

  if (result.message === 'Request cancelled') {
    return null;
  }

  throw createRenameRequestError(result.message ?? 'Rename is not available at the current position.');
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

interface WorkspaceDiagnosticsState {
  rootPath: string;
  scanResult: WorkspaceScanResult;
  registry: ElementRegistry;
  graph: UnifiedVariableGraph;
  variableFlowService: VariableFlowService;
  activationChainService: ActivationChainService;
}

interface WorkspaceClientState {
  codeLensRefreshSupport: boolean;
  watchedFilesDynamicRegistration: boolean;
  watchedFilesRelativePatternSupport: boolean;
}

type WorkspaceRefreshReason =
  | 'document-open'
  | 'document-change'
  | 'document-close'
  | 'watched-file-create'
  | 'watched-file-change'
  | 'watched-file-delete';

const WATCHED_FILE_GLOB_PATTERNS = Object.freeze([
  '**/*.risulorebook',
  '**/*.risuregex',
  '**/*.risuprompt',
  '**/*.risuhtml',
  '**/*.risulua',
]);

function createDefaultWorkspaceClientState(): WorkspaceClientState {
  return {
    codeLensRefreshSupport: false,
    watchedFilesDynamicRegistration: false,
    watchedFilesRelativePatternSupport: false,
  };
}

function readWorkspaceClientState(params: InitializeParams): WorkspaceClientState {
  const workspaceCapabilities = params.capabilities.workspace;

  return {
    codeLensRefreshSupport: workspaceCapabilities?.codeLens?.refreshSupport ?? false,
    watchedFilesDynamicRegistration:
      workspaceCapabilities?.didChangeWatchedFiles?.dynamicRegistration ?? false,
    watchedFilesRelativePatternSupport:
      workspaceCapabilities?.didChangeWatchedFiles?.relativePatternSupport ?? false,
  };
}

function createWatchedFilesRegistrationOptions() {
  return {
    watchers: WATCHED_FILE_GLOB_PATTERNS.map((globPattern) => ({ globPattern })),
  };
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

function getAllDocuments(documents: TextDocuments<TextDocument>): readonly TextDocument[] {
  const candidate = documents as TextDocuments<TextDocument> & {
    all?: () => readonly TextDocument[];
  };
  return candidate.all?.() ?? [];
}

function resolveWorkspaceRootFromFilePath(filePath: string): string | null {
  try {
    const artifact = parseCustomExtensionArtifactFromPath(filePath);
    const contract = getCustomExtensionArtifactContract(artifact);
    const normalizedPath = path.normalize(filePath);
    const segments = normalizedPath.split(path.sep);
    const directoryIndex = segments.lastIndexOf(contract.directory);

    if (directoryIndex <= 0) {
      return null;
    }

    const rootPath = segments.slice(0, directoryIndex).join(path.sep);
    return rootPath.length > 0 ? rootPath : path.sep;
  } catch {
    return null;
  }
}

function applyOpenDocumentOverrides(
  scanResult: WorkspaceScanResult,
  documents: readonly TextDocument[],
): WorkspaceScanResult {
  const filesByUri = new Map(scanResult.files.map((file) => [file.uri, file]));

  for (const document of documents) {
    const filePath = getFilePathFromUri(document.uri);
    if (resolveWorkspaceRootFromFilePath(filePath) !== scanResult.rootPath) {
      continue;
    }

    try {
      const file = createWorkspaceScanFileFromText({
        workspaceRoot: scanResult.rootPath,
        absolutePath: filePath,
        text: document.getText(),
      });
      filesByUri.set(file.uri, file);
    } catch {
      continue;
    }
  }

  return buildWorkspaceScanResult(scanResult.rootPath, [...filesByUri.values()]);
}

function createWorkspaceDiagnosticsState(
  rootPath: string,
  documents: TextDocuments<TextDocument>,
): WorkspaceDiagnosticsState | null {
  try {
    const baseScanResult = scanWorkspaceFilesSync(rootPath);
    const scanResult = applyOpenDocumentOverrides(baseScanResult, getAllDocuments(documents));
    const registry = ElementRegistry.fromScanResult(scanResult);
    const graph = UnifiedVariableGraph.fromRegistry(registry);
    const variableFlowService = new VariableFlowService({ graph, registry });
    const activationChainService = ActivationChainService.fromRegistry(registry);

    return {
      rootPath,
      scanResult,
      registry,
      graph,
      variableFlowService,
      activationChainService,
    };
  } catch {
    return null;
  }
}

function resolveRequestForWorkspaceUri(
  uri: string,
  documents: TextDocuments<TextDocument>,
  workspaceState: WorkspaceDiagnosticsState | null,
): FragmentAnalysisRequest | null {
  const openDocument = documents.get(uri);
  if (openDocument) {
    return createFragmentRequest(openDocument);
  }

  const fileRecord = workspaceState?.registry.getFileByUri(uri);
  if (!fileRecord || !shouldRouteForDiagnostics(fileRecord.absolutePath)) {
    return null;
  }

  try {
    const text = readFileSync(fileRecord.absolutePath, 'utf8');
    return {
      uri,
      version: createSyntheticDocumentVersion(text),
      filePath: fileRecord.absolutePath,
      text,
    };
  } catch {
    return null;
  }
}

function publishDiagnosticsForUri(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  uri: string,
  workspaceState: WorkspaceDiagnosticsState | null,
): void {
  const request = resolveRequestForWorkspaceUri(uri, documents, workspaceState);
  if (!request) {
    traceFeatureRequest(connection, 'diagnostics', 'skip', {
      uri,
      version: null,
      routed: false,
    });
    connection.sendDiagnostics({ uri, diagnostics: [] });
    return;
  }

  traceFeatureRequest(connection, 'diagnostics', 'start', {
    uri: request.uri,
    version: request.version,
  });
  const localDiagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
  const filteredLocalDiagnostics = workspaceState
    ? localDiagnostics.filter((diagnostic) =>
        shouldKeepLocalSymbolDiagnostic(diagnostic, request, workspaceState.variableFlowService),
      )
    : localDiagnostics;
  const diagnostics = sortHostDiagnostics([
    ...filteredLocalDiagnostics,
    ...(workspaceState
      ? createWorkspaceVariableDiagnosticsForUri(uri, workspaceState.variableFlowService)
      : []),
  ]);
  traceRequestResult(connection, 'diagnostics', 'end', {
    uri: request.uri,
    version: request.version,
    count: diagnostics.length,
  });
  connection.sendDiagnostics({ uri: request.uri, diagnostics });
}

function shouldKeepLocalSymbolDiagnostic(
  diagnostic: import('vscode-languageserver').Diagnostic,
  request: FragmentAnalysisRequest,
  variableFlowService: VariableFlowService,
): boolean {
  if (
    diagnostic.code !== DiagnosticCode.UndefinedVariable &&
    diagnostic.code !== DiagnosticCode.UnusedVariable
  ) {
    return true;
  }

  const variableQuery = variableFlowService.queryAt(
    request.uri,
    positionToOffset(request.text, diagnostic.range.start),
  );

  if (!variableQuery) {
    return true;
  }

  if (diagnostic.code === DiagnosticCode.UndefinedVariable) {
    return variableQuery.writers.length === 0 && variableQuery.defaultValue === null;
  }

  return variableQuery.readers.length === 0;
}

function collectAffectedUris(
  changedUri: string,
  previousState: WorkspaceDiagnosticsState | null,
  nextState: WorkspaceDiagnosticsState | null,
): readonly string[] {
  const affected = new Set<string>([changedUri]);

  for (const state of [previousState, nextState]) {
    if (!state) {
      continue;
    }

    for (const uri of state.variableFlowService.collectAffectedUris([changedUri])) {
      affected.add(uri);
    }
  }

  return [...affected].sort((left, right) => left.localeCompare(right));
}

function resolveWorkspaceActivationChainService(
  uri: string,
  workspaceStateByRoot: ReadonlyMap<string, WorkspaceDiagnosticsState>,
): ActivationChainService | null {
  const workspaceRoot = resolveWorkspaceRootFromFilePath(getFilePathFromUri(uri));
  return workspaceRoot ? workspaceStateByRoot.get(workspaceRoot)?.activationChainService ?? null : null;
}

function resolveWorkspaceVariableFlowService(
  uri: string,
  workspaceStateByRoot: ReadonlyMap<string, WorkspaceDiagnosticsState>,
): VariableFlowService | null {
  const workspaceRoot = resolveWorkspaceRootFromFilePath(getFilePathFromUri(uri));
  return workspaceRoot ? workspaceStateByRoot.get(workspaceRoot)?.variableFlowService ?? null : null;
}

function isLorebookUriInState(state: WorkspaceDiagnosticsState | null, uri: string): boolean {
  return state?.registry.getFileByUri(uri)?.artifact === 'lorebook';
}

function collectAffectedCodeLensUris(
  changedUris: readonly string[],
  previousState: WorkspaceDiagnosticsState | null,
  nextState: WorkspaceDiagnosticsState | null,
): readonly string[] {
  const affected = new Set<string>();

  for (const state of [previousState, nextState]) {
    if (!state) {
      continue;
    }

    for (const uri of state.activationChainService.collectAffectedUris(changedUris)) {
      if (isLorebookUriInState(state, uri)) {
        affected.add(uri);
      }
    }
  }

  return [...affected].sort((left, right) => left.localeCompare(right));
}

function requestCodeLensRefresh(
  connection: Connection,
  workspaceClientState: WorkspaceClientState,
  reason: WorkspaceRefreshReason,
  affectedUris: readonly string[],
): void {
  if (reason === 'document-open' || affectedUris.length === 0) {
    traceFeatureRequest(connection, 'workspace', 'codelens-refresh-skip', {
      reason,
      affectedLorebooks: affectedUris.length,
      supported: workspaceClientState.codeLensRefreshSupport,
    });
    return;
  }

  if (!workspaceClientState.codeLensRefreshSupport) {
    traceFeatureRequest(connection, 'workspace', 'codelens-refresh-skip', {
      reason,
      affectedLorebooks: affectedUris.length,
      supported: false,
    });
    return;
  }

  traceFeaturePayload(connection, 'workspace', 'codelens-refresh-requested', {
    reason,
    affectedUris,
  });
  void connection.sendRequest(CodeLensRefreshRequest.type);
}

function refreshWorkspaceStateForUris(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  workspaceStateByRoot: Map<string, WorkspaceDiagnosticsState>,
  workspaceClientState: WorkspaceClientState,
  changedUris: readonly string[],
  reason: WorkspaceRefreshReason,
): void {
  const workspaceRoots = [
    ...new Set(
      changedUris
        .map((uri) => resolveWorkspaceRootFromFilePath(getFilePathFromUri(uri)))
        .filter((value): value is string => value !== null),
    ),
  ].sort((left, right) => left.localeCompare(right));

  const affectedCodeLensUris = new Set<string>();

  for (const workspaceRoot of workspaceRoots) {
    const workspaceChangedUris = changedUris
      .filter((uri) => resolveWorkspaceRootFromFilePath(getFilePathFromUri(uri)) === workspaceRoot)
      .sort((left, right) => left.localeCompare(right));
    const previousState = workspaceStateByRoot.get(workspaceRoot) ?? null;
    const nextState = createWorkspaceDiagnosticsState(workspaceRoot, documents);

    traceFeatureRequest(connection, 'workspace', 'state-rebuild-start', {
      rootPath: workspaceRoot,
      reason,
      changedUris: workspaceChangedUris.length,
    });

    if (nextState) {
      workspaceStateByRoot.set(workspaceRoot, nextState);
    } else {
      workspaceStateByRoot.delete(workspaceRoot);
    }

    const affectedUris = new Set<string>();
    for (const uri of workspaceChangedUris) {
      for (const affectedUri of collectAffectedUris(uri, previousState, nextState)) {
        affectedUris.add(affectedUri);
      }
      for (const affectedUri of collectAffectedCodeLensUris([uri], previousState, nextState)) {
        affectedCodeLensUris.add(affectedUri);
      }
    }

    traceFeatureRequest(connection, 'workspace', 'state-rebuild-end', {
      rootPath: workspaceRoot,
      reason,
      affectedDiagnosticsUris: affectedUris.size,
      affectedCodeLensUris: [...affectedCodeLensUris].filter(
        (uri) => resolveWorkspaceRootFromFilePath(getFilePathFromUri(uri)) === workspaceRoot,
      ).length,
      rebuilt: nextState !== null,
    });

    for (const uri of [...affectedUris].sort((left, right) => left.localeCompare(right))) {
      publishDiagnosticsForUri(connection, documents, uri, nextState);
    }
  }

  requestCodeLensRefresh(
    connection,
    workspaceClientState,
    reason,
    [...affectedCodeLensUris].sort((left, right) => left.localeCompare(right)),
  );
}

function refreshWorkspaceDiagnostics(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  workspaceStateByRoot: Map<string, WorkspaceDiagnosticsState>,
  workspaceClientState: WorkspaceClientState,
  document: TextDocument,
  reason: 'open' | 'change' | 'close',
): void {
  const filePath = getFilePathFromUri(document.uri);
  const workspaceRoot = resolveWorkspaceRootFromFilePath(filePath);

  if (!workspaceRoot) {
    if (reason === 'close') {
      fragmentAnalysisService.clearUri(document.uri);
      connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
      return;
    }

    publishDiagnosticsForUri(connection, documents, document.uri, null);
    return;
  }

  if (reason === 'close') {
    fragmentAnalysisService.clearUri(document.uri);
  }

  refreshWorkspaceStateForUris(
    connection,
    documents,
    workspaceStateByRoot,
    workspaceClientState,
    [document.uri],
    reason === 'open'
      ? 'document-open'
      : reason === 'change'
        ? 'document-change'
        : 'document-close',
  );
}

export function createInitializeResult(): InitializeResult {
  const runtimeAvailability = createCbsRuntimeAvailabilityContract();

  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Incremental,
      },
      codeLensProvider: {
        resolveProvider: false,
      },
      completionProvider: {},
      definitionProvider: true,
      documentFormattingProvider: true,
      referencesProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      executeCommandProvider: {
        commands: [ACTIVATION_CHAIN_CODELENS_COMMAND],
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
  const workspaceStateByRoot = new Map<string, WorkspaceDiagnosticsState>();
  let workspaceClientState = createDefaultWorkspaceClientState();
  const registry = new CBSBuiltinRegistry();
  const resolveRequest = createRequestResolver(documents);
  const codeLensProvider = new CodeLensProvider({
    analysisService: fragmentAnalysisService,
    resolveActivationChainService: (uri) =>
      resolveWorkspaceActivationChainService(uri, workspaceStateByRoot),
    resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
  });
  const completionProvider = new CompletionProvider(registry, {
    analysisService: fragmentAnalysisService,
    resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
  });
  const hoverProvider = new HoverProvider(registry, {
    analysisService: fragmentAnalysisService,
    resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
  });
  const formattingProvider = new FormattingProvider({
    analysisService: fragmentAnalysisService,
    resolveRequest,
  });
  const signatureHelpProvider = new SignatureHelpProvider(registry, fragmentAnalysisService);
  const foldingProvider = new FoldingProvider(fragmentAnalysisService);
  const semanticTokensProvider = new SemanticTokensProvider(fragmentAnalysisService, registry);

  connection.onInitialize(
    (params: InitializeParams): InitializeResult => {
      workspaceClientState = readWorkspaceClientState(params);
      const result = createInitializeResult();
      logFeature(connection, 'server', 'initialize', {
        textDocumentSync: TextDocumentSyncKind.Incremental,
      });
      traceFeatureRequest(connection, 'server', 'initialize', {
        codeLens: Boolean(result.capabilities.codeLensProvider),
        codeLensRefreshSupport: workspaceClientState.codeLensRefreshSupport,
        completion: Boolean(result.capabilities.completionProvider),
        definition: Boolean(result.capabilities.definitionProvider),
        formatting: Boolean(result.capabilities.documentFormattingProvider),
        references: Boolean(result.capabilities.referencesProvider),
        rename: Boolean(result.capabilities.renameProvider),
        hover: Boolean(result.capabilities.hoverProvider),
        signature: Boolean(result.capabilities.signatureHelpProvider),
        folding: Boolean(result.capabilities.foldingRangeProvider),
        semanticTokens: Boolean(result.capabilities.semanticTokensProvider),
        watchedFilesDynamicRegistration: workspaceClientState.watchedFilesDynamicRegistration,
      });
      traceFeaturePayload(connection, 'server', 'availability-contract', {
        availability: createRuntimeAvailabilityTracePayload(),
      });
      return result;
    },
  );
  const initializedConnection = connection as Connection & {
    onInitialized?: (handler: () => void) => unknown;
  };

  initializedConnection.onInitialized?.(() => {
    if (!workspaceClientState.watchedFilesDynamicRegistration) {
      traceFeatureRequest(connection, 'workspace', 'watch-registration-skip', {
        dynamicRegistration: false,
      });
      return;
    }

    traceFeatureRequest(connection, 'workspace', 'watch-registration-start', {
      relativePatternSupport: workspaceClientState.watchedFilesRelativePatternSupport,
      watcherCount: WATCHED_FILE_GLOB_PATTERNS.length,
    });
    void connection.client
      .register(DidChangeWatchedFilesNotification.type, createWatchedFilesRegistrationOptions())
      .then(() => {
        traceFeatureRequest(connection, 'workspace', 'watch-registration-end', {
          watcherCount: WATCHED_FILE_GLOB_PATTERNS.length,
        });
      })
      .catch(() => {
        traceFeatureRequest(connection, 'workspace', 'watch-registration-failed', {
          watcherCount: WATCHED_FILE_GLOB_PATTERNS.length,
        });
      });
  });
  connection.onExecuteCommand((_params: ExecuteCommandParams) => undefined);
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
  connection.onDocumentFormatting((
    params: DocumentFormattingParams,
    cancellationToken,
  ): TextEdit[] => {
    traceFeatureRequest(connection, 'formatting', 'start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'formatting', 'cancelled', {
        uri: params.textDocument.uri,
      });
      return [];
    }

    const result = formattingProvider.provide(params);
    traceRequestResult(connection, 'formatting', 'end', {
      uri: params.textDocument.uri,
      count: result.length,
    });
    return result;
  });
  connection.onDefinition((params: DefinitionParams, cancellationToken): Definition | null => {
    traceFeatureRequest(connection, 'definition', 'start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'definition', 'cancelled', {
        uri: params.textDocument.uri,
      });
      return null;
    }

    const provider = new DefinitionProvider(registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
      variableFlowService:
        resolveWorkspaceVariableFlowService(params.textDocument.uri, workspaceStateByRoot) ?? undefined,
    });
    const result = provider.provide(params, cancellationToken);
    const count = Array.isArray(result) ? result.length : result ? 1 : 0;
    traceRequestResult(connection, 'definition', 'end', {
      uri: params.textDocument.uri,
      count,
    });
    return result;
  });
  connection.onReferences((params: ReferenceParams, cancellationToken): Location[] => {
    traceFeatureRequest(connection, 'references', 'start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'references', 'cancelled', {
        uri: params.textDocument.uri,
      });
      return [];
    }

    const provider = new ReferencesProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
      variableFlowService:
        resolveWorkspaceVariableFlowService(params.textDocument.uri, workspaceStateByRoot) ?? undefined,
    });
    const result = provider.provide(params, cancellationToken);
    traceRequestResult(connection, 'references', 'end', {
      uri: params.textDocument.uri,
      count: result.length,
    });
    return result;
  });
  connection.onPrepareRename((
    params: TextDocumentPositionParams,
    cancellationToken,
  ): LSPRange | null => {
    traceFeatureRequest(connection, 'rename', 'prepare-start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'rename', 'prepare-cancelled', {
        uri: params.textDocument.uri,
      });
      return null;
    }

    const provider = new RenameProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
      resolveUriRequest: (uri) =>
        resolveRequestForWorkspaceUri(
          uri,
          documents,
          resolveWorkspaceRootFromFilePath(getFilePathFromUri(uri))
            ? workspaceStateByRoot.get(resolveWorkspaceRootFromFilePath(getFilePathFromUri(uri))!) ?? null
            : null,
        ),
      variableFlowService:
        resolveWorkspaceVariableFlowService(params.textDocument.uri, workspaceStateByRoot) ?? undefined,
    });
    const prepareResult = provider.prepareRename(params, cancellationToken);
    const response = resolvePrepareRenameResponse(prepareResult);
    traceRequestResult(connection, 'rename', 'prepare-end', {
      uri: params.textDocument.uri,
      canRename: prepareResult.canRename,
    });
    return response;
  });
  connection.onRenameRequest((params: RenameParams, cancellationToken): WorkspaceEdit | null => {
    traceFeatureRequest(connection, 'rename', 'start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'rename', 'cancelled', {
        uri: params.textDocument.uri,
      });
      return null;
    }

    const provider = new RenameProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
      resolveUriRequest: (uri) =>
        resolveRequestForWorkspaceUri(
          uri,
          documents,
          resolveWorkspaceRootFromFilePath(getFilePathFromUri(uri))
            ? workspaceStateByRoot.get(resolveWorkspaceRootFromFilePath(getFilePathFromUri(uri))!) ?? null
            : null,
        ),
      variableFlowService:
        resolveWorkspaceVariableFlowService(params.textDocument.uri, workspaceStateByRoot) ?? undefined,
    });
    const prepareResult = provider.prepareRename(params, cancellationToken);
    if (!prepareResult.canRename) {
      if (prepareResult.message === 'Request cancelled') {
        traceRequestResult(connection, 'rename', 'cancelled', {
          uri: params.textDocument.uri,
        });
        return null;
      }

      throw createRenameRequestError(
        prepareResult.message ?? 'Rename is not available at the current position.',
      );
    }

    const result = provider.provideRename(params, cancellationToken);
    traceRequestResult(connection, 'rename', 'end', {
      uri: params.textDocument.uri,
      documentChanges: result?.documentChanges?.length ?? 0,
    });
    return result;
  });
  connection.onCodeLens((params: CodeLensParams, cancellationToken) => {
    traceFeatureRequest(connection, 'codelens', 'start', {
      uri: params.textDocument.uri,
      cancelled: shouldSkipRequest(cancellationToken),
    });
    if (shouldSkipRequest(cancellationToken)) {
      traceRequestResult(connection, 'codelens', 'cancelled', {
        uri: params.textDocument.uri,
      });
      return [];
    }

    const result = codeLensProvider.provide(params, cancellationToken);
    traceRequestResult(connection, 'codelens', 'end', {
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
    refreshWorkspaceDiagnostics(
      connection,
      documents,
      workspaceStateByRoot,
      workspaceClientState,
      event.document,
      'open',
    );
  });

  documents.onDidChangeContent((event) => {
    traceFeatureRequest(connection, 'server', 'document-change', {
      uri: event.document.uri,
      version: event.document.version,
    });
    refreshWorkspaceDiagnostics(
      connection,
      documents,
      workspaceStateByRoot,
      workspaceClientState,
      event.document,
      'change',
    );
  });

  documents.onDidClose((event) => {
    traceFeatureRequest(connection, 'server', 'document-close', {
      uri: event.document.uri,
      version: event.document.version,
    });
    refreshWorkspaceDiagnostics(
      connection,
      documents,
      workspaceStateByRoot,
      workspaceClientState,
      event.document,
      'close',
    );
  });

  const watchedFilesConnection = connection as Connection & {
    onDidChangeWatchedFiles?: (handler: (params: DidChangeWatchedFilesParams) => void) => unknown;
  };

  watchedFilesConnection.onDidChangeWatchedFiles?.((params: DidChangeWatchedFilesParams) => {
    const relevantChanges = params.changes.filter(
      (change) => resolveWorkspaceRootFromFilePath(getFilePathFromUri(change.uri)) !== null,
    );
    if (relevantChanges.length === 0) {
      traceFeatureRequest(connection, 'workspace', 'watched-files-skip', {
        changes: 0,
      });
      return;
    }

    traceFeaturePayload(connection, 'workspace', 'watched-files-change', {
      changes: relevantChanges.map((change) => ({
        type: change.type,
        uri: change.uri,
      })),
    });

    const urisByReason = new Map<WorkspaceRefreshReason, Set<string>>();
    for (const change of relevantChanges) {
      const reason =
        change.type === FileChangeType.Created
          ? 'watched-file-create'
          : change.type === FileChangeType.Deleted
            ? 'watched-file-delete'
            : 'watched-file-change';
      if (!urisByReason.has(reason)) {
        urisByReason.set(reason, new Set<string>());
      }
      urisByReason.get(reason)?.add(change.uri);
    }

    for (const [reason, uris] of urisByReason) {
      refreshWorkspaceStateForUris(
        connection,
        documents,
        workspaceStateByRoot,
        workspaceClientState,
        [...uris].sort((left, right) => left.localeCompare(right)),
        reason,
      );
    }
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
