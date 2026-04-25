/**
 * CBS language server bootstrap, lifecycle wiring, and workspace refresh orchestration entry.
 * Runtime entry flows from 
 * `packages/cbs-lsp/src/cli.ts` `executeCli()` 
 * -> `startServer()` 
 * -> `registerServer()` 
 * -> `connection.listen()`.
 * @file packages/cbs-lsp/src/server.ts
 */

import {
  CBSBuiltinRegistry,
} from 'risu-workbench-core';
import {
  createConnection,
  type Connection,
  type DidChangeConfigurationParams,
  DidChangeWatchedFilesNotification,
  type DidChangeWatchedFilesParams,
  type InitializeParams,
  type InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD,
  createNormalizedRuntimeAvailabilitySnapshot,
  createRuntimeAvailabilityTracePayload,
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
  type RuntimeOperatorContractOptions,
} from './core';
import { CompletionProvider } from './features/completion';
import { CodeLensProvider } from './features/codelens';
import { CodeActionProvider } from './features/codeActions';
import { CodeLensRefreshScheduler } from './controllers/CodeLensRefreshScheduler';
import { DocumentHighlightProvider } from './features/documentHighlight';
import { DocumentSymbolProvider } from './features/documentSymbol';
import { WorkspaceSymbolProvider } from './features/workspaceSymbol';
import { FormattingProvider } from './features/formatting';
import { FoldingProvider } from './features/folding';
import { HoverProvider } from './features/hover';
import { OnTypeFormattingProvider } from './features/onTypeFormatting';
import { InlayHintProvider } from './features/inlayHint';
import { SelectionRangeProvider } from './features/selectionRange';
import { SemanticTokensProvider } from './features/semanticTokens';
import { SignatureHelpProvider } from './features/signature';


import {
  collectRuntimeConfigReloadGuidance,
  type CbsLspRuntimeConfigOverrides,
  diffResolvedRuntimeConfig,
  resolveRuntimeConfig,
} from './config/runtime-config';
import {
  ServerFeatureRegistrar,
  type ServerFeatureRegistrarProviders,
} from './helpers/server-helper';
import {
  createDefaultWorkspaceClientState,
  createFragmentRequest,
  createWatchedFilesRegistrationOptions,
  readWorkspaceClientState,
  resolveRequestForWorkspaceUri,
  WATCHED_FILE_GLOB_PATTERNS,
  type WorkspaceClientState,
} from './helpers/server-workspace-helper';
import { DiagnosticsPublisher } from './controllers/DiagnosticsPublisher';
import { LuaLsCompanionController, createLuaLsCompanionController } from './controllers/LuaLsCompanionController';
import { WorkspaceRefreshController } from './controllers/WorkspaceRefreshController';
import { WorkspaceStateRepository } from './controllers/WorkspaceStateRepository';
import { CbsLspPathHelper } from './helpers/path-helper';
import {
  configureServerTracing,
  configureServerTimelineLog,
  logFeature,
  traceFeatureRequest,
  traceFeaturePayload,
  traceFeatureResult,
  warnFeature,
} from './utils/server-tracing';
import { createInitializeResult } from './server/capabilities';
import { registerExecuteCommandHandler } from './server/commands';
import {
  createLuaLsProcessManager,
  type LuaLsProcessEvent,
  type LuaLsProcessManager,
} from './providers/lua/lualsProcess';

/**
 * traceLuaLsProcessEvent 함수.
 * LuaLS sidecar runtime event를 server trace/log 채널로 승격함.
 *
 * @param connection - trace/log를 남길 활성 LSP connection
 * @param event - LuaLS process manager가 방출한 runtime event
 */
function traceLuaLsProcessEvent(connection: Connection, event: LuaLsProcessEvent): void {
  const payload = {
    ...event.runtime,
    stderrLine: event.stderrLine,
  };

  traceFeaturePayload(connection, 'lua', event.type, payload);

  if (event.type === 'initialized' || event.type === 'unavailable' || event.type === 'crashed') {
    logFeature(connection, 'lua', event.type, {
      health: event.runtime.health,
      status: event.runtime.status,
    });
  }
}


export interface ServerRegistrationOptions {
  createLuaLsProcessManager?: () => LuaLsProcessManager;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  runtimeConfig?: CbsLspRuntimeConfigOverrides;
}

export interface ServerStartOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  runtimeConfig?: CbsLspRuntimeConfigOverrides;
}

interface ServerRuntimeState {
  initializeParams: InitializeParams | null;
  initializeWorkspaceRoot: ResolvedInitializeWorkspaceRoot;
  resolvedRuntimeConfig: ReturnType<typeof resolveRuntimeConfig>;
  runtimeSettings: unknown;
  serverInitialized: boolean;
  workspaceClientState: WorkspaceClientState;
}

interface ResolvedInitializeWorkspaceRoot {
  rootPath: string | null;
  source: 'initialize.rootUri' | 'initialize.workspaceFolders[0]' | 'none' | 'runtime-config.workspacePath';
  workspaceFolderCount: number;
}

interface ServerRegistrationContext {
  connection: Connection;
  documents: TextDocuments<TextDocument>;
  luaLsCompanionController: LuaLsCompanionController;
  options: ServerRegistrationOptions;
  providers: ServerFeatureRegistrarProviders;
  registry: CBSBuiltinRegistry;
  workspaceStateRepository: WorkspaceStateRepository;
}

/**
 * createServerRuntimeState 함수.
 * register helper들이 공유할 mutable runtime state 기본값을 만듦.
 *
 * @param options - 초기 runtime config를 해석할 서버 등록 옵션
 * @returns tracing이 적용된 초기 runtime state
 */
function createServerRuntimeState(options: ServerRegistrationOptions): ServerRuntimeState {
  configureServerTimelineLog(options.env?.CBS_LSP_TIMELINE_LOG ?? options.env?.CBS_LSP_TIMELINE_LOG_PATH);
  const resolvedRuntimeConfig = resolveRuntimeConfig({
    cwd: options.cwd,
    env: options.env,
    overrides: options.runtimeConfig,
  });
  configureServerTracing(resolvedRuntimeConfig.config.logLevel);

  return {
    initializeParams: null,
    initializeWorkspaceRoot: {
      rootPath: null,
      source: 'none',
      workspaceFolderCount: 0,
    },
    resolvedRuntimeConfig,
    runtimeSettings: undefined,
    serverInitialized: false,
    workspaceClientState: createDefaultWorkspaceClientState(),
  };
}

/**
 * shouldRestartLuaLsForConfigReload 함수.
 * runtime config reload 결과가 LuaLS companion 재기동까지 필요한지 판별함.
 *
 * @param previousRuntimeConfig - 변경 전 resolved runtime config
 * @param nextRuntimeConfig - 변경 후 resolved runtime config
 * @param previousWorkspaceRoot - 변경 전 initialize/runtime 기준 workspace root
 * @param nextWorkspaceRoot - 변경 후 initialize/runtime 기준 workspace root
 * @returns executable 또는 root가 바뀌어 재기동이 필요하면 true
 */
function shouldRestartLuaLsForConfigReload(
  previousRuntimeConfig: ReturnType<typeof resolveRuntimeConfig>,
  nextRuntimeConfig: ReturnType<typeof resolveRuntimeConfig>,
  previousWorkspaceRoot: string | null,
  nextWorkspaceRoot: string | null,
): boolean {
  return (
    previousRuntimeConfig.config.luaLsExecutablePath !== nextRuntimeConfig.config.luaLsExecutablePath ||
    previousWorkspaceRoot !== nextWorkspaceRoot
  );
}

/**
 * createTracedLuaLsProcessManager 함수.
 * LuaLS runtime event가 server trace/log로 연결된 process manager를 준비함.
 *
 * @param connection - LuaLS event를 기록할 LSP connection
 * @param options - 서버 등록 시 전달된 process factory 옵션
 * @returns trace wiring이 완료된 LuaLS process manager
 */
function createTracedLuaLsProcessManager(
  connection: Connection,
  options: ServerRegistrationOptions,
): LuaLsProcessManager {
  return (
    options.createLuaLsProcessManager?.() ??
    createLuaLsProcessManager({
      onEvent: (event) => {
        traceLuaLsProcessEvent(connection, event);
      },
    })
  );
}

/**
 * createServerFeatureProviders 함수.
 * registerServer 안에서 재사용할 provider 인스턴스를 한 번에 생성함.
 *
 * @param documents - 현재 열려 있는 text document manager
 * @param registry - builtin/source-of-truth registry 인스턴스
 * @param workspaceStateByRoot - workspace service lookup에 사용할 상태 맵
 * @returns reusable feature provider와 request resolver 묶음
 */
function createServerFeatureProviders(
  documents: TextDocuments<TextDocument>,
  registry: CBSBuiltinRegistry,
  workspaceStateRepository: WorkspaceStateRepository,
): ServerFeatureRegistrarProviders {
  const resolveRequest = (uri: string): FragmentAnalysisRequest | null => {
    const document = documents.get(uri);
    return document ? createFragmentRequest(document) : null;
  };

  const formattingProvider = new FormattingProvider({
    analysisService: fragmentAnalysisService,
    resolveRequest,
  });

  return {
    codeActionProvider: new CodeActionProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest,
    }),
    codeLensProvider: new CodeLensProvider({
      analysisService: fragmentAnalysisService,
      resolveActivationChainService: (uri) =>
        workspaceStateRepository.getByUri(uri)?.activationChainService ?? null,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
    }),
    completionProvider: new CompletionProvider(registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
    }),
    documentHighlightProvider: new DocumentHighlightProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
    }),
    documentSymbolProvider: new DocumentSymbolProvider(fragmentAnalysisService),
    workspaceSymbolProvider: new WorkspaceSymbolProvider({
      resolveWorkspaceStates: () => {
        const roots = workspaceStateRepository.listRoots();
        return roots.map((root) => workspaceStateRepository.getByRoot(root)).filter((state): state is NonNullable<typeof state> => state != null);
      },
    }),
    foldingProvider: new FoldingProvider(fragmentAnalysisService),
    formattingProvider,
    onTypeFormattingProvider: new OnTypeFormattingProvider({
      analysisService: fragmentAnalysisService,
      formattingProvider,
      resolveRequest,
    }),
    hoverProvider: new HoverProvider(registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
    }),
    inlayHintProvider: new InlayHintProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
    }),
    selectionRangeProvider: new SelectionRangeProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
    }),
    resolveRequest,
    semanticTokensProvider: new SemanticTokensProvider(fragmentAnalysisService, registry),
    signatureHelpProvider: new SignatureHelpProvider(registry, fragmentAnalysisService),
  };
}

/**
 * createServerRegistrationContext 함수.
 * register helper들이 공유할 connection/state/provider 묶음을 만듦.
 *
 * @param connection - handler를 연결할 LSP connection
 * @param documents - open/change/close lifecycle을 공유할 text document manager
 * @param options - 서버 등록 시 전달된 옵션
 * @returns helper 등록 단계가 공유할 context 객체
 */
function createServerRegistrationContext(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  options: ServerRegistrationOptions,
): ServerRegistrationContext {
  const workspaceStateRepository = new WorkspaceStateRepository();
  const registry = new CBSBuiltinRegistry();
  const luaLsProcessManager = createTracedLuaLsProcessManager(connection, options);
  const luaLsCompanionController = createLuaLsCompanionController(luaLsProcessManager);

  return {
    connection,
    documents,
    luaLsCompanionController,
    options,
    providers: createServerFeatureProviders(documents, registry, workspaceStateRepository),
    registry,
    workspaceStateRepository,
  };
}

/**
 * resolveInitializeRootPath 함수.
 * initialize payload와 runtime override를 합쳐 LuaLS/workspace root를 결정함.
 *
 * @param params - 현재 initialize payload
 * @param runtimeConfig - precedence가 반영된 runtime config 결과
 * @returns 최종 workspace root 경로 또는 null
 */
function resolveInitializeWorkspaceRoot(
  params: InitializeParams,
  runtimeConfig: ReturnType<typeof resolveRuntimeConfig>,
): ResolvedInitializeWorkspaceRoot {
  if (runtimeConfig.config.workspacePath) {
    return {
      rootPath: runtimeConfig.config.workspacePath,
      source: 'runtime-config.workspacePath',
      workspaceFolderCount: params.workspaceFolders?.length ?? 0,
    };
  }

  const workspaceFolderUri = params.workspaceFolders?.[0]?.uri;
  if (workspaceFolderUri) {
    return {
      rootPath: CbsLspPathHelper.getFilePathFromUri(workspaceFolderUri),
      source: 'initialize.workspaceFolders[0]',
      workspaceFolderCount: params.workspaceFolders?.length ?? 0,
    };
  }

  if (params.rootUri) {
    return {
      rootPath: CbsLspPathHelper.getFilePathFromUri(params.rootUri),
      source: 'initialize.rootUri',
      workspaceFolderCount: params.workspaceFolders?.length ?? 0,
    };
  }

  return {
    rootPath: null,
    source: 'none',
    workspaceFolderCount: params.workspaceFolders?.length ?? 0,
  };
}

/**
 * createRuntimeOperatorOptionsForSession 함수.
 * initialize 시점 선택 정보와 현재 workspace 상태를 합쳐 availability query가 재사용할 operator snapshot 옵션을 만듦.
 *
 * @param runtimeState - initialize와 client capability를 추적하는 서버 runtime 상태
 * @param workspaceStateRepository - 현재 세션에서 활성화된 workspace root 저장소
 * @returns 현재 세션 기준 runtime availability operator 옵션
 */
function createRuntimeOperatorOptionsForSession(
  runtimeState: ServerRuntimeState,
  workspaceStateRepository: WorkspaceStateRepository,
): RuntimeOperatorContractOptions {
  const fallbackWorkspaceRoot = workspaceStateRepository.listRoots()[0] ?? null;
  const resolvedWorkspaceRoot =
    runtimeState.initializeWorkspaceRoot.rootPath ?? fallbackWorkspaceRoot;
  const resolvedWorkspaceRootSource = runtimeState.initializeWorkspaceRoot.rootPath
    ? runtimeState.initializeWorkspaceRoot.source
    : fallbackWorkspaceRoot
      ? 'document-artifact-path'
      : 'none';

  return {
    initializeWorkspaceFolderCount: runtimeState.initializeWorkspaceRoot.workspaceFolderCount,
    resolvedWorkspaceRoot,
    resolvedWorkspaceRootSource,
    watchedFilesDynamicRegistration: runtimeState.workspaceClientState.watchedFilesDynamicRegistration,
  };
}

/**
 * registerAgentQueryHandlers 함수.
 * agent/automation이 현재 LSP 세션의 runtime availability snapshot을 직접 요청할 custom JSON-RPC surface를 등록함.
 *
 * @param context - connection, LuaLS controller, workspace state가 담긴 등록 context
 * @param runtimeState - initialize 이후 갱신되는 mutable runtime 상태
 */
function registerAgentQueryHandlers(
  context: ServerRegistrationContext,
  runtimeState: ServerRuntimeState,
): void {
  const requestConnection = context.connection as Connection & {
    onRequest?: (
      method: string,
      handler: () => ReturnType<typeof createNormalizedRuntimeAvailabilitySnapshot>,
    ) => unknown;
  };

  requestConnection.onRequest?.(CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD, () => {
    const operatorOptions = createRuntimeOperatorOptionsForSession(
      runtimeState,
      context.workspaceStateRepository,
    );
    const availabilitySnapshot = createNormalizedRuntimeAvailabilitySnapshot(
      context.luaLsCompanionController.getRuntime(),
      operatorOptions,
    );

    traceFeatureRequest(context.connection, 'server', 'runtime-availability-query-start', {
      method: CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD,
      resolvedWorkspaceRoot: availabilitySnapshot.operator.workspace.resolvedWorkspaceRoot,
      resolvedWorkspaceRootSource: availabilitySnapshot.operator.workspace.resolvedWorkspaceRootSource,
    });
    traceFeaturePayload(context.connection, 'server', 'runtime-availability-query-payload', {
      method: CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD,
      snapshot: availabilitySnapshot,
    });
    traceFeatureResult(context.connection, 'server', 'runtime-availability-query-end', {
      companionStatus: availabilitySnapshot.companions[0]?.status ?? 'unavailable',
      method: CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD,
    });

    return availabilitySnapshot;
  });
}

/**
 * registerServerLifecycleHandlers 함수.
 * initialize/initialized/shutdown와 watched-files registration lifecycle을 등록함.
 * Flow: initialize에서 runtime/capability를 확정하고, initialized에서 sidecar/watcher를 붙이고, shutdown에서 상태를 정리함.
 *
 * @param context - connection, process manager, provider가 담긴 등록 context
 * @param runtimeState - initialize 이후 갱신되는 mutable runtime 상태
 */
function registerServerLifecycleHandlers(
  context: ServerRegistrationContext,
  runtimeState: ServerRuntimeState,
  workspaceRefreshController: WorkspaceRefreshController,
): void {
  const { connection, luaLsCompanionController, options } = context;

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    // initialize payload를 runtime/client state로 해석하고 capability + availability snapshot을 확정함.
    runtimeState.initializeParams = params;
    runtimeState.runtimeSettings = params.initializationOptions;
    runtimeState.resolvedRuntimeConfig = resolveRuntimeConfig({
      cwd: options.cwd,
      env: options.env,
      initializationOptions: params.initializationOptions,
      overrides: options.runtimeConfig,
    });
    configureServerTimelineLog(options.env?.CBS_LSP_TIMELINE_LOG ?? options.env?.CBS_LSP_TIMELINE_LOG_PATH);
    configureServerTracing(runtimeState.resolvedRuntimeConfig.config.logLevel);
    runtimeState.workspaceClientState = readWorkspaceClientState(params);
    runtimeState.initializeWorkspaceRoot = resolveInitializeWorkspaceRoot(
      params,
      runtimeState.resolvedRuntimeConfig,
    );

    const luaLsRuntime = luaLsCompanionController.prepareForInitialize({
      overrideExecutablePath: runtimeState.resolvedRuntimeConfig.config.luaLsExecutablePath,
      rootPath: runtimeState.initializeWorkspaceRoot.rootPath,
    });
    const operatorOptions = {
      initializeWorkspaceFolderCount: runtimeState.initializeWorkspaceRoot.workspaceFolderCount,
      resolvedWorkspaceRoot: runtimeState.initializeWorkspaceRoot.rootPath,
      resolvedWorkspaceRootSource: runtimeState.initializeWorkspaceRoot.source,
      watchedFilesDynamicRegistration: runtimeState.workspaceClientState.watchedFilesDynamicRegistration,
    } as const;
    const result = createInitializeResult(params, luaLsRuntime, operatorOptions);

    logFeature(connection, 'server', 'initialize', {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    });
    traceFeatureRequest(connection, 'server', 'initialize', {
      codeLens: Boolean(result.capabilities.codeLensProvider),
      codeAction: Boolean(result.capabilities.codeActionProvider),
      codeLensRefreshSupport: runtimeState.workspaceClientState.codeLensRefreshSupport,
      completion: Boolean(result.capabilities.completionProvider),
      definition: Boolean(result.capabilities.definitionProvider),
      documentSymbol: Boolean(result.capabilities.documentSymbolProvider),
      formatting: Boolean(result.capabilities.documentFormattingProvider),
      references: Boolean(result.capabilities.referencesProvider),
      rename: Boolean(result.capabilities.renameProvider),
      hover: Boolean(result.capabilities.hoverProvider),
      signature: Boolean(result.capabilities.signatureHelpProvider),
      folding: Boolean(result.capabilities.foldingRangeProvider),
      logLevel: runtimeState.resolvedRuntimeConfig.config.logLevel,
      semanticTokens: Boolean(result.capabilities.semanticTokensProvider),
      startupWorkspaceRootSource: runtimeState.initializeWorkspaceRoot.source,
      readOnlyBridge: result.experimental?.cbs?.operator.scope.readOnlyBridge,
      multiFileEdit: result.experimental?.cbs?.operator.scope.multiFileEdit,
      workspaceFolderCount: runtimeState.initializeWorkspaceRoot.workspaceFolderCount,
      watchedFilesDynamicRegistration: runtimeState.workspaceClientState.watchedFilesDynamicRegistration,
      workspaceOverride: Boolean(runtimeState.resolvedRuntimeConfig.config.workspacePath),
    });
    traceFeaturePayload(connection, 'server', 'availability-contract', {
      availability: createRuntimeAvailabilityTracePayload(luaLsRuntime, operatorOptions),
      runtimeConfig: runtimeState.resolvedRuntimeConfig.config,
      runtimeConfigSources: runtimeState.resolvedRuntimeConfig.sources,
    });

    return result;
  });

  registerExecuteCommandHandler(connection);

  const initializedConnection = connection as Connection & {
    onInitialized?: (handler: () => void) => unknown;
  };
  initializedConnection.onInitialized?.(() => {
    // initialize에서 확정된 root/client capability를 기준으로 LuaLS sidecar와 watched-file 구독을 시작함.
    runtimeState.serverInitialized = true;
    void luaLsCompanionController.start(runtimeState.initializeWorkspaceRoot.rootPath).catch(() => undefined);

    if (!runtimeState.workspaceClientState.watchedFilesDynamicRegistration) {
      traceFeatureRequest(connection, 'workspace', 'watch-registration-skip', {
        dynamicRegistration: false,
      });
      return;
    }

    traceFeatureRequest(connection, 'workspace', 'watch-registration-start', {
      relativePatternSupport: runtimeState.workspaceClientState.watchedFilesRelativePatternSupport,
      watcherCount: WATCHED_FILE_GLOB_PATTERNS.length,
    });
    void connection.client
      .register(DidChangeWatchedFilesNotification.type, createWatchedFilesRegistrationOptions())
      .then(() => {
        // dynamic watched-files registration이 성공했음을 trace로 남김.
        traceFeatureRequest(connection, 'workspace', 'watch-registration-end', {
          watcherCount: WATCHED_FILE_GLOB_PATTERNS.length,
        });
      })
      .catch(() => {
        // watched-files registration 실패를 trace로 남겨 이후 운영 디버깅 근거를 유지함.
        traceFeatureRequest(connection, 'workspace', 'watch-registration-failed', {
          watcherCount: WATCHED_FILE_GLOB_PATTERNS.length,
        });
      });
  });

  const configurationConnection = connection as Connection & {
    onDidChangeConfiguration?: (
      handler: (params: DidChangeConfigurationParams) => void,
    ) => unknown;
  };
  configurationConnection.onDidChangeConfiguration?.((params: DidChangeConfigurationParams) => {
    const previousRuntimeConfig = runtimeState.resolvedRuntimeConfig;
    const previousWorkspaceRoot = runtimeState.initializeWorkspaceRoot.rootPath;

    traceFeaturePayload(connection, 'server', 'config-reload-start', {
      previousRuntimeConfig: previousRuntimeConfig.config,
      settings: params.settings ?? null,
    });

    runtimeState.runtimeSettings = params.settings;

    let nextRuntimeConfig: ReturnType<typeof resolveRuntimeConfig>;
    try {
      nextRuntimeConfig = resolveRuntimeConfig({
        cwd: options.cwd,
        env: options.env,
        initializationOptions: runtimeState.runtimeSettings,
        overrides: options.runtimeConfig,
      });
    } catch (error) {
      warnFeature(connection, 'server', 'config-reload-failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return;
    }

    const nextWorkspaceRoot = resolveInitializeWorkspaceRoot(
      runtimeState.initializeParams ?? ({ capabilities: {} } as InitializeParams),
      nextRuntimeConfig,
    );
    const diff = diffResolvedRuntimeConfig(previousRuntimeConfig, nextRuntimeConfig);
    const guidance = collectRuntimeConfigReloadGuidance(params.settings);

    runtimeState.resolvedRuntimeConfig = nextRuntimeConfig;
    runtimeState.initializeWorkspaceRoot = nextWorkspaceRoot;
    configureServerTracing(nextRuntimeConfig.config.logLevel);

    logFeature(connection, 'server', 'config-reload', {
      changedFields: diff.changedFields.length,
      logLevel: nextRuntimeConfig.config.logLevel,
      workspaceRoot: nextWorkspaceRoot.rootPath,
    });

    if (guidance.length > 0) {
      for (const entry of guidance) {
        warnFeature(connection, 'server', 'config-guidance', {
          key: entry.key,
          message: entry.message,
        });
      }
    }

    workspaceRefreshController.refreshTrackedWorkspaces('configuration-change');

    const requiresRestart = shouldRestartLuaLsForConfigReload(
      previousRuntimeConfig,
      nextRuntimeConfig,
      previousWorkspaceRoot,
      nextWorkspaceRoot.rootPath,
    );

    void luaLsCompanionController
      .reloadRuntimeConfiguration({
        overrideExecutablePath: nextRuntimeConfig.config.luaLsExecutablePath,
        refreshExecutablePath:
          previousRuntimeConfig.config.luaLsExecutablePath !==
          nextRuntimeConfig.config.luaLsExecutablePath,
        restart: runtimeState.serverInitialized && requiresRestart,
        rootPath: nextWorkspaceRoot.rootPath,
      })
      .catch(() => undefined);
  });

  connection.onShutdown(async () => {
    // sidecar와 fragment cache를 정리하고 shutdown trace/log를 남김.
    await luaLsCompanionController.shutdown();
    runtimeState.serverInitialized = false;
    logFeature(connection, 'server', 'shutdown');
    traceFeatureRequest(connection, 'server', 'shutdown');
    fragmentAnalysisService.clearAll();
  });
}

/**
 * registerFeatureHandlers 함수.
 * request/response 기반 LSP feature handler들을 connection에 등록함.
 * Flow: 각 handler가 trace 시작 → cancellation gate → provider delegation → trace 종료 순서를 공통으로 따름.
 *
 * @param context - connection, workspace state, provider가 담긴 등록 context
 */
function registerFeatureHandlers(context: ServerRegistrationContext): void {
  new ServerFeatureRegistrar({
    connection: context.connection,
    luaLsProxy: context.luaLsCompanionController,
    providers: context.providers,
    registry: context.registry,
    resolveWorkspaceRequest: (uri) =>
      resolveRequestForWorkspaceUri(
        uri,
        context.documents,
        context.workspaceStateRepository.getByUri(uri),
      ),
    resolveWorkspaceVariableFlowContext: (uri) => {
      const workspaceState = context.workspaceStateRepository.getByUri(uri);
      if (!workspaceState) {
        return null;
      }

      return {
        variableFlowService: workspaceState.variableFlowService,
        workspaceSnapshot: workspaceState.workspaceSnapshot,
      };
    },
  }).registerAll();
}

/**
 * registerDocumentLifecycleHandlers 함수.
 * open/change/close 문서 이벤트를 diagnostics/workspace refresh 경로에 연결함.
 * Flow: 문서 lifecycle 이벤트를 trace로 남기고 refreshWorkspaceDiagnostics로 위임함.
 *
 * @param context - connection과 documents가 담긴 등록 context
 * @param workspaceRefreshController - 문서 lifecycle refresh를 조율할 controller
 */
function registerDocumentLifecycleHandlers(
  context: ServerRegistrationContext,
  workspaceRefreshController: WorkspaceRefreshController,
): void {
  const { connection, documents } = context;

  documents.onDidOpen((event) => {
    // open된 문서를 standalone/workspace 진단 루프에 편입시킴.
    traceFeatureRequest(connection, 'server', 'document-open', {
      uri: event.document.uri,
      version: event.document.version,
    });
    workspaceRefreshController.refreshDocumentLifecycle(event.document, 'open');
  });

  documents.onDidChangeContent((event) => {
    // 변경된 문서를 기준으로 diagnostics/workspace graph를 다시 갱신함.
    traceFeatureRequest(connection, 'server', 'document-change', {
      uri: event.document.uri,
      version: event.document.version,
    });
    workspaceRefreshController.refreshDocumentLifecycle(event.document, 'change');
  });

  documents.onDidClose((event) => {
    // 닫힌 문서를 cache/router/workspace refresh 경로에서 정리함.
    traceFeatureRequest(connection, 'server', 'document-close', {
      uri: event.document.uri,
      version: event.document.version,
    });
    workspaceRefreshController.refreshDocumentLifecycle(event.document, 'close');
  });
}

/**
 * registerWatchedFilesHandlers 함수.
 * workspace watched-file 변경을 grouped refresh reason으로 다시 분배함.
 * Flow: 관련 없는 변경을 걸러내고, 남은 URI를 reason별로 묶어 workspace rebuild 경로로 전달함.
 *
 * @param context - connection이 담긴 등록 context
 * @param workspaceRefreshController - watched-file refresh를 조율할 controller
 */
function registerWatchedFilesHandlers(
  context: ServerRegistrationContext,
  workspaceRefreshController: WorkspaceRefreshController,
): void {
  const { connection } = context;
  const watchedFilesConnection = connection as Connection & {
    onDidChangeWatchedFiles?: (handler: (params: DidChangeWatchedFilesParams) => void) => unknown;
  };

  watchedFilesConnection.onDidChangeWatchedFiles?.((params: DidChangeWatchedFilesParams) => {
    workspaceRefreshController.refreshWatchedFiles(params);
  });
}

/**
 * registerServer 함수.
 * LSP connection에 CBS language server lifecycle과 feature handler를 한 번에 등록함.
 * Flow: runtime config 해석 → LuaLS/process 및 provider 준비 → initialize/initialized/shutdown 등록 → feature/document/workspace handler 등록.
 *
 * @param connection - initialize, request, notification handler를 연결할 LSP connection
 * @param documents - open/change/close lifecycle을 공유할 text document manager
 * @param options - standalone runtime config, env, LuaLS process factory 같은 서버 등록 옵션
 */
export function registerServer(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  options: ServerRegistrationOptions = {},
): void {
  const runtimeState = createServerRuntimeState(options);
  const context = createServerRegistrationContext(connection, documents, options);
  const codeLensRefreshScheduler = new CodeLensRefreshScheduler({
    connection,
    supportsRefresh: () => runtimeState.workspaceClientState.codeLensRefreshSupport,
  });
  const diagnosticsPublisher = new DiagnosticsPublisher({
    connection,
    documents,
    supportsVersion: () => runtimeState.workspaceClientState.publishDiagnosticsVersionSupport,
  });
  context.luaLsCompanionController.onPublishDiagnostics((payload) => {
    diagnosticsPublisher.publishLuaDiagnostics(payload);
  });
  const workspaceRefreshController = new WorkspaceRefreshController({
    codeLensRefreshScheduler,
    connection,
    diagnosticsPublisher,
    documents,
    luaLsCompanionController: context.luaLsCompanionController,
    workspaceStateRepository: context.workspaceStateRepository,
  });

  registerServerLifecycleHandlers(context, runtimeState, workspaceRefreshController);
  registerAgentQueryHandlers(context, runtimeState);
  registerFeatureHandlers(context);
  registerDocumentLifecycleHandlers(context, workspaceRefreshController);
  registerWatchedFilesHandlers(context, workspaceRefreshController);
}

/**
 * startServer 함수.
 * CBS language server stdio transport를 초기화하고 listen 상태로 진입함.
 *
 * @param options - standalone startup에 적용할 env/runtime config 옵션
 * @returns 반환값 없음
 */
export function startServer(options: ServerStartOptions = {}): void {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  registerServer(connection, documents, options);
  documents.listen(connection);
  connection.listen();
}
