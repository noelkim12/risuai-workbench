/**
 * LuaLS fallback/merge orchestration for server feature handlers.
 * @file packages/cbs-lsp/src/helpers/server/lua/LuaLsFallbackService.ts
 */

import { RISUAI_LUA_RUNTIME_STUB_FILE_NAME } from 'risu-workbench-core';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type CancellationToken,
  type CompletionItem,
  type CompletionList,
  type CompletionParams,
  type Connection,
  type DefinitionParams,
  type DocumentHighlight,
  type DocumentHighlightParams,
  type DocumentSymbol,
  type DocumentSymbolParams,
  type Hover,
  type HoverParams,
  type Location,
  type Range as LSPRange,
  type ReferenceParams,
  type RenameParams,
  type SignatureHelp,
  type SignatureHelpParams,
  type SymbolInformation,
  type TextDocumentPositionParams,
  type WorkspaceEdit,
} from 'vscode-languageserver/node';

import type { DocumentHighlightProvider } from '../../../features/documentHighlight';
import type { DocumentSymbolProvider } from '../../../features/documentSymbol';
import type { DefinitionProvider } from '../../../features/definition';
import type { HoverProvider } from '../../../features/hover';
import type { ReferencesProvider } from '../../../features/references';
import type { RenameProvider } from '../../../features/rename';
import type { SignatureHelpProvider } from '../../../features/signature';
import { isLuaLsSymbolInformation } from '../../../providers/lua/lualsProxy';
import {
  buildLuaStateHoverOverlayMarkdown,
  buildLuaStateNameOverlayCompletions,
  mergeLuaCompletionResponse,
  mergeLuaHoverResponse,
} from '../../../providers/lua/responseMerger';
import {
  buildRisuAiRuntimeCompletionItems,
  createRisuAiRuntimeDefinition,
  createRisuAiRuntimeHover,
} from '../../../providers/lua/risuaiRuntimeOverlay';
import { getDefaultRisuAiLuaStubRootPath } from '../../../providers/lua/typeStubs';
import { logFeature, traceFeatureRequest, traceFeatureResult } from '../../../utils/server-tracing';
import type { ServerFeatureRegistrarContext, ServerWorkspaceVariableFlowContext } from '../types';
import type { LuaLsRequestGate, LuaLsRoutingContext } from './LuaLsRequestGate';
import {
  collectCompletionResponseLabels,
  mergeCbsAndLuaHover,
  mergeDefinitions,
  type DefinitionResponse,
} from './LuaLsResponseMerge';

const RISUAI_RUNTIME_STUB_URI = pathToFileURL(
  path.join(getDefaultRisuAiLuaStubRootPath(), RISUAI_LUA_RUNTIME_STUB_FILE_NAME),
).href;

export interface LuaLsFallbackServiceContext {
  connection: Connection;
  createDefinitionProvider: (uri: string) => DefinitionProvider;
  createHoverProvider: (uri: string) => HoverProvider;
  createReferencesProvider: (uri: string) => ReferencesProvider;
  createRenameProvider: (uri: string) => RenameProvider;
  documentHighlightProvider: DocumentHighlightProvider;
  documentSymbolProvider: DocumentSymbolProvider;
  luaLsProxy: ServerFeatureRegistrarContext['luaLsProxy'];
  luaLsRequestGate: LuaLsRequestGate;
  provideCbsCompletionItems: (params: CompletionParams, cancellationToken?: CancellationToken) => CompletionItem[];
  resolveRequest: ServerFeatureRegistrarContext['providers']['resolveRequest'];
  resolveWorkspaceRequest: (uri: string) => ReturnType<ServerFeatureRegistrarContext['resolveWorkspaceRequest']>;
  resolveWorkspaceVariableFlowContext: (uri: string) => ServerWorkspaceVariableFlowContext | null;
  signatureHelpProvider: SignatureHelpProvider;
}

/**
 * LuaLsFallbackService 클래스.
 * CBS provider 결과와 LuaLS proxy 결과, runtime/state overlay 병합 순서를 보존해 제공함.
 */
export class LuaLsFallbackService {
  private readonly connection: Connection;
  private readonly createDefinitionProvider: LuaLsFallbackServiceContext['createDefinitionProvider'];
  private readonly createHoverProvider: LuaLsFallbackServiceContext['createHoverProvider'];
  private readonly createReferencesProvider: LuaLsFallbackServiceContext['createReferencesProvider'];
  private readonly createRenameProvider: LuaLsFallbackServiceContext['createRenameProvider'];
  private readonly documentHighlightProvider: DocumentHighlightProvider;
  private readonly documentSymbolProvider: DocumentSymbolProvider;
  private readonly luaLsProxy: ServerFeatureRegistrarContext['luaLsProxy'];
  private readonly luaLsRequestGate: LuaLsRequestGate;
  private readonly provideCbsCompletionItems: LuaLsFallbackServiceContext['provideCbsCompletionItems'];
  private readonly resolveRequest: ServerFeatureRegistrarContext['providers']['resolveRequest'];
  private readonly resolveWorkspaceRequest: LuaLsFallbackServiceContext['resolveWorkspaceRequest'];
  private readonly resolveWorkspaceVariableFlowContext: LuaLsFallbackServiceContext['resolveWorkspaceVariableFlowContext'];
  private readonly signatureHelpProvider: SignatureHelpProvider;

  /**
   * constructor 함수.
   * fallback/merge에 필요한 provider, LuaLS proxy, workspace resolver를 보관함.
   *
   * @param context - LuaLS fallback service 의존성 모음
   */
  constructor(context: LuaLsFallbackServiceContext) {
    this.connection = context.connection;
    this.createDefinitionProvider = context.createDefinitionProvider;
    this.createHoverProvider = context.createHoverProvider;
    this.createReferencesProvider = context.createReferencesProvider;
    this.createRenameProvider = context.createRenameProvider;
    this.documentHighlightProvider = context.documentHighlightProvider;
    this.documentSymbolProvider = context.documentSymbolProvider;
    this.luaLsProxy = context.luaLsProxy;
    this.luaLsRequestGate = context.luaLsRequestGate;
    this.provideCbsCompletionItems = context.provideCbsCompletionItems;
    this.resolveRequest = context.resolveRequest;
    this.resolveWorkspaceRequest = context.resolveWorkspaceRequest;
    this.resolveWorkspaceVariableFlowContext = context.resolveWorkspaceVariableFlowContext;
    this.signatureHelpProvider = context.signatureHelpProvider;
  }

  /**
   * resolveRoute 함수.
   * handler가 summary/log source를 유지하도록 LuaLS routing context를 노출함.
   *
   * @param uri - LSP 요청 대상 문서 URI
   * @returns LuaLS routing context
   */
  resolveRoute(uri: string): LuaLsRoutingContext {
    return this.luaLsRequestGate.resolve(uri);
  }

  /**
   * provideDocumentSymbolWithFallback 함수.
   * CBS document symbols에 LuaLS document symbols를 기존 규칙으로 병합함.
   *
   * @param params - document symbol 요청 파라미터
   * @param route - 미리 계산한 LuaLS routing context
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns CBS/LuaLS document symbol 결과
   */
  async provideDocumentSymbolWithFallback(
    params: DocumentSymbolParams,
    route: LuaLsRoutingContext,
    cancellationToken?: CancellationToken,
  ): Promise<DocumentSymbol[] | SymbolInformation[]> {
    const cbsSymbols = route.request
      ? this.documentSymbolProvider.provide(params, route.request, cancellationToken)
      : [];
    if (route.skipLuaLsProxy) {
      return cbsSymbols;
    }

    const luaSymbols = await this.luaLsProxy.provideDocumentSymbol(params, cancellationToken);
    if (luaSymbols.every(isLuaLsSymbolInformation)) {
      return cbsSymbols.length > 0 ? cbsSymbols : luaSymbols;
    }
    const luaDocumentSymbols = luaSymbols.filter(
      (symbol): symbol is DocumentSymbol => !isLuaLsSymbolInformation(symbol),
    );
    return [...cbsSymbols, ...luaDocumentSymbols];
  }

  /**
   * provideSignatureHelpWithFallback 함수.
   * CBS macro 내부 signature를 우선하고 그 외 위치는 LuaLS signature로 fallback함.
   *
   * @param params - signature help 요청 파라미터
   * @param route - 미리 계산한 LuaLS routing context
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns signature help 결과 또는 null
   */
  async provideSignatureHelpWithFallback(
    params: SignatureHelpParams,
    route: LuaLsRoutingContext,
    cancellationToken?: CancellationToken,
  ): Promise<SignatureHelp | null> {
    const cbsSignature = route.request
      ? this.signatureHelpProvider.provide(params, route.request, cancellationToken)
      : null;
    if (cbsSignature && route.isInsideCbsMacro(params.position)) {
      return cbsSignature;
    }

    if (route.skipLuaLsProxy) {
      return cbsSignature;
    }

    const luaSignature = await this.luaLsProxy.provideSignatureHelp(params, cancellationToken);
    return luaSignature ?? cbsSignature;
  }

  /**
   * provideDocumentHighlightWithFallback 함수.
   * CBS macro highlight를 우선하고 나머지는 LuaLS highlight를 additive merge함.
   *
   * @param params - document highlight 요청 파라미터
   * @param route - 미리 계산한 LuaLS routing context
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns document highlight 목록
   */
  async provideDocumentHighlightWithFallback(
    params: DocumentHighlightParams,
    route: LuaLsRoutingContext,
    cancellationToken?: CancellationToken,
  ): Promise<DocumentHighlight[]> {
    const cbsHighlights = this.documentHighlightProvider.provide(params, cancellationToken);
    if (cbsHighlights.length > 0 && route.isInsideCbsMacro(params.position)) {
      return cbsHighlights;
    }

    if (route.skipLuaLsProxy) {
      return cbsHighlights;
    }

    const luaHighlights = await this.luaLsProxy.provideDocumentHighlight(params, cancellationToken);
    return [...cbsHighlights, ...luaHighlights];
  }

  /**
   * provideReferencesWithFallback 함수.
   * CBS references를 먼저 계산하고 LuaLS references를 기존 순서로 뒤에 붙임.
   *
   * @param params - references 요청 파라미터
   * @param route - 미리 계산한 LuaLS routing context
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns reference location 목록
   */
  async provideReferencesWithFallback(
    params: ReferenceParams,
    route: LuaLsRoutingContext,
    cancellationToken?: CancellationToken,
  ): Promise<Location[]> {
    const cbsReferences = this.createReferencesProvider(params.textDocument.uri).provide(params, cancellationToken);
    if (cbsReferences.length > 0 && route.isInsideCbsMacro(params.position)) {
      return cbsReferences;
    }

    if (route.skipLuaLsProxy) {
      return cbsReferences;
    }

    const luaReferences = await this.luaLsProxy.provideReferences(params, cancellationToken);
    return [...cbsReferences, ...luaReferences];
  }

  /**
   * provideDefinitionWithFallback 함수.
   * CBS definition, runtime definition, LuaLS definition을 기존 순서와 dedupe 규칙으로 병합함.
   *
   * @param params - definition 요청 파라미터
   * @param route - 미리 계산한 LuaLS routing context
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns definition 응답 또는 null
   */
  async provideDefinitionWithFallback(
    params: DefinitionParams,
    route: LuaLsRoutingContext,
    cancellationToken?: CancellationToken,
  ): Promise<DefinitionResponse | null> {
    const cbsDefinition = this.createDefinitionProvider(params.textDocument.uri).provide(params, cancellationToken);

    if (route.isInsideCbsMacro(params.position)) {
      return cbsDefinition;
    }

    const runtimeDefinition = route.request
      ? createRisuAiRuntimeDefinition(route.request.text, params.position, RISUAI_RUNTIME_STUB_URI)
      : null;

    if (route.skipLuaLsProxy) {
      return mergeDefinitions(cbsDefinition, runtimeDefinition);
    }

    const luaDefinition = await this.luaLsProxy.provideDefinition(params, cancellationToken);
    return mergeDefinitions(mergeDefinitions(cbsDefinition, runtimeDefinition), luaDefinition);
  }

  /**
   * provideHoverWithFallback 함수.
   * CBS hover, LuaLS hover, state overlay, runtime overlay를 기존 순서로 병합함.
   *
   * @param params - hover 요청 파라미터
   * @param route - 미리 계산한 LuaLS routing context
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns hover 응답 또는 null
   */
  async provideHoverWithFallback(
    params: HoverParams,
    route: LuaLsRoutingContext,
    cancellationToken?: CancellationToken,
  ): Promise<Hover | null> {
    const cbsHover = this.createHoverProvider(params.textDocument.uri).provide(params, cancellationToken);

    if (route.isInsideCbsMacro(params.position)) {
      traceFeatureResult(this.connection, 'hover', 'end', {
        uri: params.textDocument.uri,
        hasResult: cbsHover !== null,
        source: 'cbs',
      });
      return cbsHover;
    }

    const runtimeHover = route.request
      ? createRisuAiRuntimeHover(route.request.text, params.position)
      : null;

    if (route.skipLuaLsProxy) {
      traceFeatureResult(this.connection, 'luaProxy', 'hover-skipped', {
        uri: params.textDocument.uri,
        reason: 'oversized',
      });
      traceFeatureResult(this.connection, 'hover', 'end', {
        uri: params.textDocument.uri,
        hasResult: cbsHover !== null || runtimeHover !== null,
        source: 'luaProxySkipped',
      });
      return mergeCbsAndLuaHover(cbsHover, runtimeHover);
    }

    traceFeatureRequest(this.connection, 'luaProxy', 'hover-start', {
      uri: params.textDocument.uri,
      companionStatus: this.luaLsProxy.getRuntime().status,
    });

    const workspaceRequest = route.request;
    const workspaceVariableFlowService = this.resolveWorkspaceVariableFlowContext(
      params.textDocument.uri,
    )?.variableFlowService ?? null;

    const result = await this.luaLsProxy.provideHover(params, cancellationToken);
    const overlayMarkdown = buildLuaStateHoverOverlayMarkdown({
      params,
      request: workspaceRequest,
      variableFlowService: workspaceVariableFlowService,
    });
    const luaHover = mergeLuaHoverResponse(result, overlayMarkdown);
    const luaHoverWithRuntime = mergeLuaHoverResponse(luaHover, runtimeHover);
    const mergedHover = mergeCbsAndLuaHover(cbsHover, luaHoverWithRuntime);
    traceFeatureResult(this.connection, 'luaProxy', 'hover-end', {
      uri: params.textDocument.uri,
      companionStatus: this.luaLsProxy.getRuntime().status,
      hasResult: mergedHover !== null,
    });
    traceFeatureResult(this.connection, 'hover', 'end', {
      uri: params.textDocument.uri,
      hasResult: mergedHover !== null,
      source: 'luaProxy',
    });
    return mergedHover;
  }

  /**
   * provideCompletionWithFallback 함수.
   * LuaLS result → runtime overlay → state overlay → CBS completion 순서로 completion을 병합함.
   *
   * @param params - completion 요청 파라미터
   * @param route - 미리 계산한 LuaLS routing context
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @param onLuaDuration - LuaLS proxy 요청 duration 전달 callback
   * @returns completion 응답
   */
  async provideCompletionWithFallback(
    params: CompletionParams,
    route: LuaLsRoutingContext,
    cancellationToken?: CancellationToken,
    onLuaDuration?: (durationMs: number) => void,
  ): Promise<CompletionItem[] | CompletionList> {
    const startTime = performance.now();
    const cbsCompletion = this.provideCbsCompletionItems(params, cancellationToken);
    const cbsDurationMs = Math.round(performance.now() - startTime);
    traceFeatureResult(this.connection, 'completion', 'build', {
      uri: params.textDocument.uri,
      durationMs: cbsDurationMs,
      count: cbsCompletion.length,
      source: 'cbsFallback',
    });
    logFeature(this.connection, 'completion', 'build', {
      uri: params.textDocument.uri,
      durationMs: cbsDurationMs,
      count: cbsCompletion.length,
      source: 'cbsFallback',
    });

    let luaCompletion: CompletionItem[] | CompletionList = [];
    if (route.skipLuaLsProxy) {
      traceFeatureResult(this.connection, 'luaProxy', 'completion-skipped', {
        uri: params.textDocument.uri,
        reason: 'oversized',
      });
    } else {
      traceFeatureRequest(this.connection, 'luaProxy', 'completion-start', {
        uri: params.textDocument.uri,
        companionStatus: this.luaLsProxy.getRuntime().status,
      });
      const luaCompletionStartTime = performance.now();
      luaCompletion = await this.luaLsProxy.provideCompletion(params, cancellationToken);
      onLuaDuration?.(Math.round(performance.now() - luaCompletionStartTime));
    }

    const runtimeCompletionOverlay = route.request
      ? buildRisuAiRuntimeCompletionItems({
          source: route.request.text,
          position: params.position,
          existingLabels: collectCompletionResponseLabels(luaCompletion),
        })
      : [];
    const workspaceRequest = route.skipLuaLsProxy
      ? null
      : this.resolveWorkspaceRequest(params.textDocument.uri);
    const workspaceVariableFlowService = this.resolveWorkspaceVariableFlowContext(
      params.textDocument.uri,
    )?.variableFlowService ?? null;
    const stateNameOverlay = buildLuaStateNameOverlayCompletions({
      params,
      request: workspaceRequest,
      variableFlowService: workspaceVariableFlowService,
    });

    return mergeLuaCompletionResponse(
      mergeLuaCompletionResponse(
        mergeLuaCompletionResponse(luaCompletion, runtimeCompletionOverlay),
        stateNameOverlay,
      ),
      cbsCompletion,
    );
  }

  /**
   * prepareRenameWithFallback 함수.
   * CBS prepareRename 결과를 우선하고 불가 시 LuaLS prepareRename으로 fallback함.
   *
   * @param params - prepareRename 요청 파라미터
   * @param route - 미리 계산한 LuaLS routing context
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns prepareRename 응답 또는 null
   */
  async prepareRenameWithFallback(
    params: TextDocumentPositionParams,
    route: LuaLsRoutingContext,
    cancellationToken?: CancellationToken,
  ): Promise<LSPRange | { placeholder: string; range: LSPRange } | null> {
    const prepareResult = this.createRenameProvider(params.textDocument.uri).prepareRename(params, cancellationToken);
    if (prepareResult.canRename && prepareResult.hostRange) {
      return prepareResult.hostRange;
    }

    if (route.skipLuaLsProxy || prepareResult.message === 'Request cancelled') {
      return null;
    }

    return this.luaLsProxy.prepareRename(params, cancellationToken);
  }

  /**
   * provideRenameWithFallback 함수.
   * CBS rename 가능 시 CBS edit를 반환하고 아니면 LuaLS rename으로 fallback함.
   *
   * @param params - rename 요청 파라미터
   * @param route - 미리 계산한 LuaLS routing context
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns workspace edit 또는 null
   */
  async provideRenameWithFallback(
    params: RenameParams,
    route: LuaLsRoutingContext,
    cancellationToken?: CancellationToken,
  ): Promise<WorkspaceEdit | null> {
    const provider = this.createRenameProvider(params.textDocument.uri);
    const prepareResult = provider.prepareRename(params, cancellationToken);
    if (prepareResult.canRename) {
      return provider.provideRename(params, cancellationToken);
    }

    if (route.skipLuaLsProxy || prepareResult.message === 'Request cancelled') {
      return null;
    }

    return this.luaLsProxy.provideRename(params, cancellationToken);
  }

  /**
   * provideDocumentSymbolCbsOnly 함수.
   * LuaLS 라우팅이 아닌 문서에서 CBS document symbols만 계산함.
   *
   * @param params - document symbol 요청 파라미터
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns CBS document symbol 목록
   */
  provideDocumentSymbolCbsOnly(
    params: DocumentSymbolParams,
    cancellationToken?: CancellationToken,
  ): DocumentSymbol[] {
    const request = this.resolveRequest(params.textDocument.uri);
    return request ? this.documentSymbolProvider.provide(params, request, cancellationToken) : [];
  }

  /**
   * provideDocumentHighlightCbsOnly 함수.
   * LuaLS 라우팅이 아닌 문서에서 CBS document highlights만 계산함.
   *
   * @param params - document highlight 요청 파라미터
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns CBS document highlight 목록
   */
  provideDocumentHighlightCbsOnly(
    params: DocumentHighlightParams,
    cancellationToken?: CancellationToken,
  ): DocumentHighlight[] {
    return this.documentHighlightProvider.provide(params, cancellationToken);
  }

  /**
   * provideSignatureHelpCbsOnly 함수.
   * LuaLS 라우팅이 아닌 문서에서 CBS signature help만 계산함.
   *
   * @param params - signature help 요청 파라미터
   * @param cancellationToken - 원본 LSP 취소 토큰
   * @returns CBS signature help 또는 null
   */
  provideSignatureHelpCbsOnly(
    params: SignatureHelpParams,
    cancellationToken?: CancellationToken,
  ): SignatureHelp | null {
    const request = this.resolveRequest(params.textDocument.uri);
    return request ? this.signatureHelpProvider.provide(params, request, cancellationToken) : null;
  }
}
