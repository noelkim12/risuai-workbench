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
  CodeActionKind,
  CodeLensRefreshRequest,
  createConnection,
  type Connection,
  DidChangeWatchedFilesNotification,
  type DidChangeWatchedFilesParams,
  type ExecuteCommandParams,
  FileChangeType,
  type InitializeParams,
  type InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  createCbsRuntimeAvailabilityContract,
  type LuaLsCompanionRuntime,
  createNormalizedRuntimeAvailabilitySnapshot,
  createRuntimeAvailabilityTracePayload,
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
} from './core';

import {
  assembleDiagnosticsForRequest,
  routeDiagnosticsForDocument,
} from './utils/diagnostics-router';
import { CompletionProvider } from './features/completion';
import {
  ACTIVATION_CHAIN_CODELENS_COMMAND,
  CodeLensProvider,
} from './features/codelens';
import { CodeActionProvider } from './features/codeActions';
import { DocumentSymbolProvider } from './features/documentSymbol';
import { FormattingProvider } from './features/formatting';
import { FoldingProvider } from './features/folding';
import { HoverProvider } from './features/hover';
import {
  SemanticTokensProvider,
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
} from './features/semanticTokens';
import { SignatureHelpProvider } from './features/signature';


import {
  type CbsLspRuntimeConfigOverrides,
  resolveRuntimeConfig,
} from './config/runtime-config';
import {
  ServerFeatureRegistrar,
  type ServerFeatureRegistrarProviders,
} from './helpers/server-helper';
import {
  createDefaultWorkspaceClientState,
  createFragmentRequest,
  createIncrementalWorkspaceDiagnosticsState,
  createWatchedFilesRegistrationOptions,
  createWorkspaceDiagnosticsState,
  readWorkspaceClientState,
  resolveRequestForWorkspaceUri,
  resolveWorkspaceActivationChainService,
  resolveWorkspaceStateForUri,
  resolveWorkspaceVariableFlowService,
  WATCHED_FILE_GLOB_PATTERNS,
  type WorkspaceClientState,
  type WorkspaceDiagnosticsState,
  type WorkspaceRefreshReason,
} from './helpers/server-workspace-helper';
import { CbsLspPathHelper } from './helpers/path-helper';
import {
  configureServerTracing,
  logFeature,
  traceFeatureRequest,
  traceFeatureResult,
  traceFeaturePayload,
} from './utils/server-tracing';
import {
  createLuaLsProcessManager,
  type LuaLsProcessEvent,
  type LuaLsProcessManager,
} from './providers/lua/lualsProcess';
import {
  createLuaLsDocumentRouter,
  shouldRouteDocumentToLuaLs,
} from './providers/lua/lualsDocuments';
import { createLuaLsProxy } from './providers/lua/lualsProxy';

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


/**
 * publishDiagnosticsForUri 함수.
 * local diagnostics와 workspace-level diagnostics를 병합해 한 URI에 publish함.
 * server.ts는 orchestration(요청 해석, trace, lifecycle timing, transport)만 담당하고,
 * diagnostics 조립/필터/병합은 diagnostics-router.ts의 assembleDiagnosticsForRequest에 위임함.
 *
 * @param connection - diagnostics를 publish할 LSP connection
 * @param documents - 현재 열려 있는 text document manager
 * @param uri - diagnostics를 계산할 대상 문서 URI
 * @param workspaceState - cross-file variable 정보를 제공할 workspace state
 */
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
  // 로컬 심볼 진단은 워크스페이스 변수 흐름 상태와 비교해 필터링된 후 병합됨 (중복/충돌 진단 억제)
  const diagnostics = assembleDiagnosticsForRequest({
    localDiagnostics,
    workspaceVariableFlowService: workspaceState?.variableFlowService ?? null,
    request,
  });

  traceFeatureResult(connection, 'diagnostics', 'end', {
    uri: request.uri,
    version: request.version,
    count: diagnostics.length,
  });
  connection.sendDiagnostics({ uri: request.uri, diagnostics });
}

/**
 * collectAffectedUris 함수.
 * 변경 URI 전후 상태를 비교해 다시 publish해야 할 diagnostics 대상을 수집함.
 *
 * @param changedUri - 직접 변경된 문서 URI
 * @param previousState - 변경 전 workspace state
 * @param nextState - 변경 후 workspace state
 * @returns diagnostics 영향을 받는 URI 목록
 */
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


/**
 * isLorebookUriInState 함수.
 * 특정 URI가 현재 workspace state에서 lorebook artifact인지 확인함.
 *
 * @param state - 조회할 workspace state
 * @param uri - artifact 타입을 확인할 문서 URI
 * @returns lorebook artifact이면 true
 */
function isLorebookUriInState(state: WorkspaceDiagnosticsState | null, uri: string): boolean {
  return state?.registry.getFileByUri(uri)?.artifact === 'lorebook';
}

/**
 * collectAffectedCodeLensUris 함수.
 * activation-chain 변화로 다시 계산해야 할 lorebook CodeLens 대상을 모음.
 *
 * @param changedUris - 직접 변경된 문서 URI 목록
 * @param previousState - 변경 전 workspace state
 * @param nextState - 변경 후 workspace state
 * @returns CodeLens refresh가 필요한 lorebook URI 목록
 */
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

/**
 * requestCodeLensRefresh 함수.
 * 조건이 맞을 때만 workspace/codeLens/refresh 요청을 보냄.
 *
 * @param connection - refresh request를 보낼 LSP connection
 * @param workspaceClientState - client capability 지원 상태
 * @param reason - 이번 refresh가 발생한 원인
 * @param affectedUris - 영향을 받은 lorebook URI 목록
 */
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

/**
 * refreshWorkspaceStateForUris 함수.
 * 변경 URI가 속한 workspace를 다시 빌드하고 diagnostics/CodeLens 후속 작업까지 연결함.
 * Flow: 이전 workspace snapshot에서 영향 범위를 먼저 모으고, 새 snapshot을 rebuild한 뒤, 갱신 후 영향 범위를 다시 합쳐 publish/refresh 대상을 확정함.
 *
 * @param connection - diagnostics/trace/request를 보낼 LSP connection
 * @param documents - 현재 열려 있는 text document manager
 * @param workspaceStateByRoot - rootPath 기준 workspace state 맵
 * @param workspaceClientState - client capability 지원 상태
 * @param luaLsDocumentRouter - workspace Lua mirror를 동기화할 router
 * @param changedUris - 갱신을 유발한 문서 URI 목록
 * @param reason - open/change/close 또는 watched-file 기반 refresh 원인
 */
function refreshWorkspaceStateForUris(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  workspaceStateByRoot: Map<string, WorkspaceDiagnosticsState>,
  workspaceClientState: WorkspaceClientState,
  luaLsDocumentRouter: ReturnType<typeof createLuaLsDocumentRouter>,
  changedUris: readonly string[],
  reason: WorkspaceRefreshReason,
): void {
  const workspaceRoots = [
    ...new Set(
      changedUris
        .map((uri) =>
          CbsLspPathHelper.resolveWorkspaceRootFromFilePath(CbsLspPathHelper.getFilePathFromUri(uri)),
        )
        .filter((value): value is string => value !== null),
    ),
  ].sort((left, right) => left.localeCompare(right));

  const affectedCodeLensUris = new Set<string>();

  for (const workspaceRoot of workspaceRoots) {
    const workspaceChangedUris = changedUris
      .filter(
        (uri) =>
          CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
            CbsLspPathHelper.getFilePathFromUri(uri),
          ) === workspaceRoot,
      )
      .sort((left, right) => left.localeCompare(right));
    // 변경을 적용하기 전 snapshot이다. 삭제/이동처럼 "예전 상태에만 존재하던" 영향 URI를 잡는 기준으로 쓴다.
    const previousState = workspaceStateByRoot.get(workspaceRoot) ?? null;
    const affectedUris = new Set<string>();

    // old graph/service 기준 영향을 먼저 모아야, 이번 변경으로 사라진 reader/writer/activation 관계도 republish 대상에 포함할 수 있다.
    for (const uri of workspaceChangedUris) {
      for (const affectedUri of collectAffectedUris(uri, previousState, null)) {
        affectedUris.add(affectedUri);
      }
      for (const affectedUri of collectAffectedCodeLensUris([uri], previousState, null)) {
        affectedCodeLensUris.add(affectedUri);
      }
    }

    // 변경을 반영한 뒤 publish/router sync에 사용할 새 snapshot이다.
    // 기존 state가 있으면 incremental rebuild를, 없으면 full workspace scan을 선택한다.
    const nextState = previousState
      ? createIncrementalWorkspaceDiagnosticsState(previousState, documents, workspaceChangedUris)
      : createWorkspaceDiagnosticsState(workspaceRoot, documents);
    const refreshMode = previousState ? 'incremental' : 'full';

    traceFeatureRequest(connection, 'workspace', 'state-rebuild-start', {
      rootPath: workspaceRoot,
      reason,
      changedUris: workspaceChangedUris.length,
      mode: refreshMode,
    });

    // nextState가 있으면 새 workspace snapshot을 map/Lua mirror에 설치하고,
    // 없으면 이번 rebuild 뒤에 유지할 state가 없다는 뜻이므로 기존 snapshot과 mirror를 함께 정리한다.
    if (nextState) {
      workspaceStateByRoot.set(workspaceRoot, nextState);
      luaLsDocumentRouter.syncWorkspaceDocuments(workspaceRoot, nextState.scanResult.files);
    } else {
      workspaceStateByRoot.delete(workspaceRoot);
      luaLsDocumentRouter.clearWorkspaceDocuments(workspaceRoot);
    }

    // new graph/service 기준 영향을 다시 모아야, 새 writer/reader/activation chain이 만들어낸 후속 URI도 함께 republish할 수 있다.
    for (const uri of workspaceChangedUris) {
      for (const affectedUri of collectAffectedUris(uri, null, nextState)) {
        affectedUris.add(affectedUri);
      }
      for (const affectedUri of collectAffectedCodeLensUris([uri], null, nextState)) {
        affectedCodeLensUris.add(affectedUri);
      }
    }

    traceFeatureRequest(connection, 'workspace', 'state-rebuild-end', {
      rootPath: workspaceRoot,
      reason,
      mode: refreshMode,
      affectedDiagnosticsUris: affectedUris.size,
      affectedCodeLensUris: [...affectedCodeLensUris].filter(
        (uri) =>
          CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
            CbsLspPathHelper.getFilePathFromUri(uri),
          ) === workspaceRoot,
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

/**
 * refreshWorkspaceDiagnostics 함수.
 * 문서 open/change/close 이벤트를 standalone/workspace 경로로 분기해 진단을 갱신함.
 *
 * @param connection - diagnostics/trace를 보낼 LSP connection
 * @param documents - 현재 열려 있는 text document manager
 * @param workspaceStateByRoot - rootPath 기준 workspace state 맵
 * @param workspaceClientState - client capability 지원 상태
 * @param luaLsDocumentRouter - LuaLS mirror 동기화를 담당하는 router
 * @param document - 방금 lifecycle 이벤트가 발생한 문서
 * @param reason - open/change/close 중 현재 문서 이벤트 종류
 */
function refreshWorkspaceDiagnostics(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  workspaceStateByRoot: Map<string, WorkspaceDiagnosticsState>,
  workspaceClientState: WorkspaceClientState,
  luaLsDocumentRouter: ReturnType<typeof createLuaLsDocumentRouter>,
  document: TextDocument,
  reason: 'open' | 'change' | 'close',
): void {
  const filePath = CbsLspPathHelper.getFilePathFromUri(document.uri);
  const workspaceRoot = CbsLspPathHelper.resolveWorkspaceRootFromFilePath(filePath);

  if (!workspaceRoot) {
    if (shouldRouteDocumentToLuaLs(filePath)) {
      if (reason === 'close') {
        luaLsDocumentRouter.closeStandaloneDocument(document.uri);
      } else {
        luaLsDocumentRouter.syncStandaloneDocument(document);
      }
    }

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
    luaLsDocumentRouter,
    [document.uri],
    reason === 'open'
      ? 'document-open'
      : reason === 'change'
        ? 'document-change'
        : 'document-close',
  );
}

/**
 * createInitializeResult 함수.
 * 현재 LuaLS runtime 상태를 바탕으로 LSP capability와 experimental availability를 구성함.
 *
 * @param luaLsRuntime - initialize 시점 LuaLS companion runtime 스냅샷
 * @returns capability와 availability payload가 들어 있는 initialize result
 */
export function createInitializeResult(
  luaLsRuntime: LuaLsCompanionRuntime,
): InitializeResult {
  const runtimeAvailability = createCbsRuntimeAvailabilityContract(luaLsRuntime);

  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Incremental,
      },
      codeLensProvider: {
        resolveProvider: false,
      },
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix],
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
        availabilitySnapshot: createNormalizedRuntimeAvailabilitySnapshot(luaLsRuntime),
        excludedArtifacts: runtimeAvailability.excludedArtifacts,
        featureAvailability: runtimeAvailability.featureAvailability,
      },
    },
  };
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
  luaLsRootPath: string | null;
  resolvedRuntimeConfig: ReturnType<typeof resolveRuntimeConfig>;
  workspaceClientState: WorkspaceClientState;
}

interface ServerRegistrationContext {
  connection: Connection;
  documents: TextDocuments<TextDocument>;
  luaLsDocumentRouter: ReturnType<typeof createLuaLsDocumentRouter>;
  luaLsProcessManager: LuaLsProcessManager;
  luaLsProxy: ReturnType<typeof createLuaLsProxy>;
  options: ServerRegistrationOptions;
  providers: ServerFeatureRegistrarProviders;
  registry: CBSBuiltinRegistry;
  workspaceStateByRoot: Map<string, WorkspaceDiagnosticsState>;
}

/**
 * createServerRuntimeState 함수.
 * register helper들이 공유할 mutable runtime state 기본값을 만듦.
 *
 * @param options - 초기 runtime config를 해석할 서버 등록 옵션
 * @returns tracing이 적용된 초기 runtime state
 */
function createServerRuntimeState(options: ServerRegistrationOptions): ServerRuntimeState {
  const resolvedRuntimeConfig = resolveRuntimeConfig({
    cwd: options.cwd,
    env: options.env,
    overrides: options.runtimeConfig,
  });
  configureServerTracing(resolvedRuntimeConfig.config.logLevel);

  return {
    luaLsRootPath: null,
    resolvedRuntimeConfig,
    workspaceClientState: createDefaultWorkspaceClientState(),
  };
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
  workspaceStateByRoot: Map<string, WorkspaceDiagnosticsState>
): ServerFeatureRegistrarProviders {
  const resolveRequest = (uri: string): FragmentAnalysisRequest | null => {
    const document = documents.get(uri);
    return document ? createFragmentRequest(document) : null;
  };

  return {
    codeActionProvider: new CodeActionProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest,
    }),
    codeLensProvider: new CodeLensProvider({
      analysisService: fragmentAnalysisService,
      resolveActivationChainService: (uri) =>
        resolveWorkspaceActivationChainService(uri, workspaceStateByRoot),
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
    }),
    completionProvider: new CompletionProvider(registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => resolveRequest(textDocument.uri),
    }),
    documentSymbolProvider: new DocumentSymbolProvider(fragmentAnalysisService),
    foldingProvider: new FoldingProvider(fragmentAnalysisService),
    formattingProvider: new FormattingProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest,
    }),
    hoverProvider: new HoverProvider(registry, {
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
  const workspaceStateByRoot = new Map<string, WorkspaceDiagnosticsState>();
  const registry = new CBSBuiltinRegistry();
  const luaLsProcessManager = createTracedLuaLsProcessManager(connection, options);
  const luaLsDocumentRouter = createLuaLsDocumentRouter(luaLsProcessManager);
  const luaLsProxy = createLuaLsProxy(luaLsProcessManager);

  return {
    connection,
    documents,
    luaLsDocumentRouter,
    luaLsProcessManager,
    luaLsProxy,
    options,
    providers: createServerFeatureProviders(documents, registry, workspaceStateByRoot),
    registry,
    workspaceStateByRoot,
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
function resolveInitializeRootPath(
  params: InitializeParams,
  runtimeConfig: ReturnType<typeof resolveRuntimeConfig>,
): string | null {
  return (
    runtimeConfig.config.workspacePath ??
    (params.workspaceFolders?.[0]?.uri
        ? CbsLspPathHelper.getFilePathFromUri(params.workspaceFolders[0].uri)
        : params.rootUri
          ? CbsLspPathHelper.getFilePathFromUri(params.rootUri)
          : null)
  );
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
): void {
  const { connection, luaLsProcessManager, options } = context;

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    // initialize payload를 runtime/client state로 해석하고 capability + availability snapshot을 확정함.
    runtimeState.resolvedRuntimeConfig = resolveRuntimeConfig({
      cwd: options.cwd,
      env: options.env,
      initializationOptions: params.initializationOptions,
      overrides: options.runtimeConfig,
    });
    configureServerTracing(runtimeState.resolvedRuntimeConfig.config.logLevel);
    runtimeState.workspaceClientState = readWorkspaceClientState(params);
    runtimeState.luaLsRootPath = resolveInitializeRootPath(params, runtimeState.resolvedRuntimeConfig);

    const luaLsRuntime = luaLsProcessManager.prepareForInitialize({
      overrideExecutablePath: runtimeState.resolvedRuntimeConfig.config.luaLsExecutablePath,
      rootPath: runtimeState.luaLsRootPath,
    });
    const result = createInitializeResult(luaLsRuntime);

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
      watchedFilesDynamicRegistration: runtimeState.workspaceClientState.watchedFilesDynamicRegistration,
      workspaceOverride: Boolean(runtimeState.resolvedRuntimeConfig.config.workspacePath),
    });
    traceFeaturePayload(connection, 'server', 'availability-contract', {
      availability: createRuntimeAvailabilityTracePayload(luaLsRuntime),
      runtimeConfig: runtimeState.resolvedRuntimeConfig.config,
      runtimeConfigSources: runtimeState.resolvedRuntimeConfig.sources,
    });

    return result;
  });

  const initializedConnection = connection as Connection & {
    onInitialized?: (handler: () => void) => unknown;
  };
  initializedConnection.onInitialized?.(() => {
    // initialize에서 확정된 root/client capability를 기준으로 LuaLS sidecar와 watched-file 구독을 시작함.
    void luaLsProcessManager.start({ rootPath: runtimeState.luaLsRootPath }).catch(() => undefined);

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

  connection.onExecuteCommand((_params: ExecuteCommandParams) => {
    // executeCommand surface는 현재 capability contract 유지용 placeholder로만 남겨둠.
    return undefined;
  });
  connection.onShutdown(async () => {
    // sidecar와 fragment cache를 정리하고 shutdown trace/log를 남김.
    await luaLsProcessManager.shutdown();
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
    luaLsProxy: context.luaLsProxy,
    providers: context.providers,
    registry: context.registry,
    resolveWorkspaceRequest: (uri) =>
      resolveRequestForWorkspaceUri(
        uri,
        context.documents,
        resolveWorkspaceStateForUri(uri, context.workspaceStateByRoot),
      ),
    resolveWorkspaceVariableFlowService: (uri) =>
      resolveWorkspaceVariableFlowService(uri, context.workspaceStateByRoot),
  }).registerAll();
}

/**
 * registerDocumentLifecycleHandlers 함수.
 * open/change/close 문서 이벤트를 diagnostics/workspace refresh 경로에 연결함.
 * Flow: 문서 lifecycle 이벤트를 trace로 남기고 refreshWorkspaceDiagnostics로 위임함.
 *
 * @param context - connection, workspace state, Lua router가 담긴 등록 context
 * @param runtimeState - 최신 client capability가 담긴 mutable runtime 상태
 */
function registerDocumentLifecycleHandlers(
  context: ServerRegistrationContext,
  runtimeState: ServerRuntimeState,
): void {
  const { connection, documents, luaLsDocumentRouter, workspaceStateByRoot } = context;

  documents.onDidOpen((event) => {
    // open된 문서를 standalone/workspace 진단 루프에 편입시킴.
    traceFeatureRequest(connection, 'server', 'document-open', {
      uri: event.document.uri,
      version: event.document.version,
    });
    refreshWorkspaceDiagnostics(
      connection,
      documents,
      workspaceStateByRoot,
      runtimeState.workspaceClientState,
      luaLsDocumentRouter,
      event.document,
      'open',
    );
  });

  documents.onDidChangeContent((event) => {
    // 변경된 문서를 기준으로 diagnostics/workspace graph를 다시 갱신함.
    traceFeatureRequest(connection, 'server', 'document-change', {
      uri: event.document.uri,
      version: event.document.version,
    });
    refreshWorkspaceDiagnostics(
      connection,
      documents,
      workspaceStateByRoot,
      runtimeState.workspaceClientState,
      luaLsDocumentRouter,
      event.document,
      'change',
    );
  });

  documents.onDidClose((event) => {
    // 닫힌 문서를 cache/router/workspace refresh 경로에서 정리함.
    traceFeatureRequest(connection, 'server', 'document-close', {
      uri: event.document.uri,
      version: event.document.version,
    });
    refreshWorkspaceDiagnostics(
      connection,
      documents,
      workspaceStateByRoot,
      runtimeState.workspaceClientState,
      luaLsDocumentRouter,
      event.document,
      'close',
    );
  });
}

/**
 * registerWatchedFilesHandlers 함수.
 * workspace watched-file 변경을 grouped refresh reason으로 다시 분배함.
 * Flow: 관련 없는 변경을 걸러내고, 남은 URI를 reason별로 묶어 workspace rebuild 경로로 전달함.
 *
 * @param context - connection, workspace state, Lua router가 담긴 등록 context
 * @param runtimeState - 최신 client capability가 담긴 mutable runtime 상태
 */
function registerWatchedFilesHandlers(
  context: ServerRegistrationContext,
  runtimeState: ServerRuntimeState,
): void {
  const { connection, documents, luaLsDocumentRouter, workspaceStateByRoot } = context;
  const watchedFilesConnection = connection as Connection & {
    onDidChangeWatchedFiles?: (handler: (params: DidChangeWatchedFilesParams) => void) => unknown;
  };

  watchedFilesConnection.onDidChangeWatchedFiles?.((params: DidChangeWatchedFilesParams) => {
    // workspace 외부 파일 변경을 refresh reason별 URI 묶음으로 재분배해 rebuild 경로에 태움.
    const relevantChanges = params.changes.filter(
      (change) =>
        CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
          CbsLspPathHelper.getFilePathFromUri(change.uri),
        ) !== null,
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
        runtimeState.workspaceClientState,
        luaLsDocumentRouter,
        [...uris].sort((left, right) => left.localeCompare(right)),
        reason,
      );
    }
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

  registerServerLifecycleHandlers(context, runtimeState);
  registerFeatureHandlers(context);
  registerDocumentLifecycleHandlers(context, runtimeState);
  registerWatchedFilesHandlers(context, runtimeState);
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
