/**
 * cbs-lsp server feature handler registrar helper.
 * @file packages/cbs-lsp/src/helpers/server-helper.ts
 */

import { CBSBuiltinRegistry } from 'risu-workbench-core';
import {
  type CodeAction,
  type CodeActionParams,
  type CodeLensParams,
  type CompletionItem,
  type CompletionList,
  type CompletionParams,
  type Connection,
  type Definition,
  type DefinitionParams,
  type DocumentHighlight,
  type DocumentHighlightParams,
  type DocumentSymbol,
  type DocumentSymbolParams,
  type DocumentFormattingParams,
  type DocumentRangeFormattingParams,
  type DocumentOnTypeFormattingParams,
  type FoldingRangeParams,
  type Hover,
  type HoverParams,
  type InlayHint,
  type InlayHintParams,
  LSPErrorCodes,
  type Location,
  MarkupKind,
  type SelectionRange,
  type SelectionRangeParams,
  type Range as LSPRange,
  type ReferenceParams,
  type RenameParams,
  ResponseError,
  type SemanticTokensParams,
  type SemanticTokensRangeParams,
  type SignatureHelp,
  type SignatureHelpParams,
  type SymbolInformation,
  TextEdit,
  type TextDocumentPositionParams,
  type WorkspaceEdit,
  type WorkspaceSymbolParams,
  type CancellationToken,
} from 'vscode-languageserver/node';

import { fragmentAnalysisService, type FragmentAnalysisRequest } from '../core';
import { CodeActionProvider, type UnresolvedCodeAction } from '../features/codeActions';
import { CodeLensProvider } from '../features/codelens';
import { CompletionProvider, type UnresolvedCompletionItem } from '../features/completion';
import type { LuaLsCompanionController } from '../controllers/LuaLsCompanionController';
import { DefinitionProvider } from '../features/definition';
import { DocumentHighlightProvider } from '../features/documentHighlight';
import { DocumentSymbolProvider } from '../features/documentSymbol';
import { WorkspaceSymbolProvider } from '../features/workspaceSymbol';
import { FoldingProvider } from '../features/folding';
import { FormattingProvider } from '../features/formatting';
import { HoverProvider } from '../features/hover';
import { OnTypeFormattingProvider } from '../features/onTypeFormatting';
import { InlayHintProvider } from '../features/inlayHint';
import { ReferencesProvider } from '../features/references';
import { RenameProvider } from '../features/rename';
import { SelectionRangeProvider } from '../features/selectionRange';
import { SemanticTokensProvider } from '../features/semanticTokens';
import { SignatureHelpProvider } from '../features/signature';
import { RequestHandlerRunner } from '../handlers/RequestHandlerRunner';
import { CbsLspPathHelper } from './path-helper';
import { MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH } from '../indexer';
import { shouldRouteDocumentToLuaLs } from '../providers/lua/lualsDocuments';
import {
  buildLuaStateHoverOverlayMarkdown,
  buildLuaStateNameOverlayCompletions,
  mergeLuaHoverResponse,
  mergeLuaCompletionResponse,
} from '../providers/lua/responseMerger';
import { logFeature, traceFeatureRequest, traceFeatureResult } from '../utils/server-tracing';
import { VariableFlowService, type WorkspaceSnapshotState } from '../services';
import { isLuaArtifactPath } from '../utils/oversized-lua';

export interface ServerFeatureRegistrarProviders {
  codeActionProvider: CodeActionProvider;
  codeLensProvider: CodeLensProvider;
  completionProvider: CompletionProvider;
  documentHighlightProvider: DocumentHighlightProvider;
  documentSymbolProvider: DocumentSymbolProvider;
  foldingProvider: FoldingProvider;
  formattingProvider: FormattingProvider;
  hoverProvider: HoverProvider;
  onTypeFormattingProvider?: OnTypeFormattingProvider;
  inlayHintProvider: InlayHintProvider;
  selectionRangeProvider: SelectionRangeProvider;
  resolveRequest: (uri: string) => FragmentAnalysisRequest | null;
  semanticTokensProvider: SemanticTokensProvider;
  signatureHelpProvider: SignatureHelpProvider;
  workspaceSymbolProvider: WorkspaceSymbolProvider;
}

export interface ServerFeatureRegistrarContext {
  connection: Connection;
  luaLsProxy: Pick<
    LuaLsCompanionController,
    | 'getRuntime'
    | 'prepareRename'
    | 'provideCompletion'
    | 'provideDefinition'
    | 'provideDocumentHighlight'
    | 'provideDocumentSymbol'
    | 'provideHover'
    | 'provideReferences'
    | 'provideRename'
    | 'provideSignatureHelp'
  >;
  providers: ServerFeatureRegistrarProviders;
  registry: CBSBuiltinRegistry;
  resolveWorkspaceRequest: (uri: string) => FragmentAnalysisRequest | null;
  resolveWorkspaceVariableFlowContext: (uri: string) => {
    variableFlowService: VariableFlowService;
    workspaceSnapshot: WorkspaceSnapshotState;
  } | null;
}

/**
 * shouldSkipRequest 함수.
 * 취소 토큰이 이미 취소된 요청인지 helper 내부 공통 규칙으로 판별함.
 *
 * @param cancellationToken - 현재 callback에 전달된 취소 토큰
 * @returns 요청 처리를 바로 중단해야 하면 true
 */
function shouldSkipRequest(cancellationToken: CancellationToken | undefined): boolean {
  return cancellationToken?.isCancellationRequested ?? false;
}

/**
 * shouldSkipLuaLsProxyForRequest 함수.
 * oversized `.risulua` request에서 LuaLS proxy timeout 경로를 막음.
 *
 * @param request - 현재 문서의 fragment analysis request
 * @returns LuaLS proxy 호출을 건너뛰어야 하면 true
 */
export function shouldSkipLuaLsProxyForRequest(
  request: FragmentAnalysisRequest | null,
  filePath?: string,
): boolean {
  if (!request) {
    return filePath ? isLuaArtifactPath(filePath) : false;
  }

  return request.text.length > MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH;
}

/**
 * createRenameRequestError 함수.
 * rename 불가 상황을 LSP 응답 에러 형태로 감쌈.
 *
 * @param message - 클라이언트에 보여줄 rename 실패 이유
 * @returns rename request에서 throw할 ResponseError 인스턴스
 */
function createRenameRequestError(message: string): ResponseError<void> {
  return new ResponseError(LSPErrorCodes.RequestFailed, message);
}

/**
 * resolvePrepareRenameResponse 함수.
 * 내부 prepareRename 결과를 LSP host range 또는 에러로 변환함.
 *
 * @param result - rename provider가 계산한 prepare 결과
 * @returns host range가 있으면 반환하고, 취소면 null을 반환함
 */
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

/**
 * normalizeHoverContentsMarkdown 함수.
 * LSP hover contents를 markdown 병합용 문자열로 정규화함.
 *
 * @param contents - LSP Hover.contents payload
 * @returns markdown 문자열 또는 빈 문자열
 */
function normalizeHoverContentsMarkdown(contents: Hover['contents']): string {
  if (typeof contents === 'string') {
    return contents;
  }

  if (Array.isArray(contents)) {
    return contents
      .map((entry) => normalizeHoverContentsMarkdown(entry))
      .filter(Boolean)
      .join('\n\n');
  }

  if (typeof contents === 'object' && contents !== null) {
    const record = contents as Record<string, unknown>;
    if (typeof record.value === 'string') {
      return record.value;
    }

    if (typeof record.language === 'string' && typeof record.value === 'string') {
      return `\`\`\`${record.language}\n${record.value}\n\`\`\``;
    }
  }

  return '';
}

/**
 * mergeCbsAndLuaHover 함수.
 * `.risulua`에서 LuaLS hover와 CBS hover가 둘 다 있을 때 markdown 섹션으로 합침.
 *
 * @param cbsHover - CBS provider가 계산한 hover 결과
 * @param luaHover - LuaLS proxy와 RisuAI overlay가 계산한 hover 결과
 * @returns 둘 중 하나 또는 병합된 hover 결과
 */
function mergeCbsAndLuaHover(cbsHover: Hover | null, luaHover: Hover | null): Hover | null {
  if (!luaHover) {
    return cbsHover;
  }

  if (!cbsHover) {
    return luaHover;
  }

  const cbsMarkdown = normalizeHoverContentsMarkdown(cbsHover.contents);
  const luaMarkdown = normalizeHoverContentsMarkdown(luaHover.contents);

  return {
    ...luaHover,
    contents: {
      kind: MarkupKind.Markdown,
      value: [cbsMarkdown, luaMarkdown].filter(Boolean).join('\n\n---\n\n'),
    },
    range: cbsHover.range ?? luaHover.range,
  };
}

/**
 * mergeDefinitions 함수.
 * CBS와 LuaLS definition 응답을 같은 LSP Definition 배열로 합치고 중복 target을 제거함.
 *
 * @param cbsDefinition - CBS provider definition 결과
 * @param luaDefinition - LuaLS proxy definition 결과
 * @returns 병합된 definition 결과
 */
function mergeDefinitions(cbsDefinition: Definition | null, luaDefinition: Definition | null): Definition | null {
  const entries = [cbsDefinition, luaDefinition]
    .flatMap((definition) => {
      if (!definition) {
        return [];
      }

      return Array.isArray(definition) ? definition : [definition];
    });

  if (entries.length === 0) {
    return null;
  }

  const seen = new Set<string>();
  const merged = entries.filter((entry) => {
    const uri = 'targetUri' in entry ? String(entry.targetUri) : entry.uri;
    const range = ('targetRange' in entry ? entry.targetRange : entry.range) as LSPRange;
    const key = `${uri}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return merged as Definition;
}

function isPositionInsideCbsMacro(text: string, position: LSPRange['start']): boolean {
  const lines = text.split(/\n/u);
  const line = lines[position.line];
  if (line === undefined || position.character > line.length) {
    return false;
  }

  const prefix = line.slice(0, position.character);
  const macroStart = prefix.lastIndexOf('{{');
  if (macroStart === -1) {
    return false;
  }

  const closeBeforeMacro = prefix.lastIndexOf('}}');
  if (closeBeforeMacro > macroStart) {
    return false;
  }

  const macroEnd = line.indexOf('}}', macroStart + 2);
  return macroEnd === -1 || position.character <= macroEnd + 2;
}

/**
 * ServerFeatureRegistrar 클래스.
 * request/response 기반 feature callback 등록과 workspace-aware provider 조합을 한 객체에 모음.
 */
export class ServerFeatureRegistrar {
  private readonly codeActionProvider: CodeActionProvider;
  private readonly codeLensProvider: CodeLensProvider;
  private readonly completionProvider: CompletionProvider;
  private readonly connection: Connection;
  private readonly documentHighlightProvider: DocumentHighlightProvider;
  private readonly documentSymbolProvider: DocumentSymbolProvider;
  private readonly foldingProvider: FoldingProvider;
  private readonly formattingProvider: FormattingProvider;
  private readonly hoverProvider: HoverProvider;
  private readonly inlayHintProvider: InlayHintProvider;
  private readonly onTypeFormattingProvider: OnTypeFormattingProvider | undefined;
  private readonly selectionRangeProvider: SelectionRangeProvider;
  private readonly luaLsProxy: ServerFeatureRegistrarContext['luaLsProxy'];
  private readonly registry: CBSBuiltinRegistry;
  private readonly requestRunner: RequestHandlerRunner;
  private readonly resolveRequest: (uri: string) => FragmentAnalysisRequest | null;
  private readonly resolveWorkspaceRequest: (uri: string) => FragmentAnalysisRequest | null;
  private readonly resolveWorkspaceVariableFlowContextByUri: (uri: string) => {
    variableFlowService: VariableFlowService;
    workspaceSnapshot: WorkspaceSnapshotState;
  } | null;
  private readonly semanticTokensProvider: SemanticTokensProvider;
  private readonly signatureHelpProvider: SignatureHelpProvider;
  private readonly workspaceSymbolProvider: WorkspaceSymbolProvider;

  /**
   * constructor 함수.
   * feature callback 등록에 필요한 connection/provider/workspace resolver를 보관함.
   *
   * @param context - feature handler 등록에 필요한 server helper context
   */
  constructor(context: ServerFeatureRegistrarContext) {
    this.connection = context.connection;
    this.luaLsProxy = context.luaLsProxy;
    this.registry = context.registry;
    this.requestRunner = new RequestHandlerRunner(context.connection);
    this.codeActionProvider = context.providers.codeActionProvider;
    this.codeLensProvider = context.providers.codeLensProvider;
    this.completionProvider = context.providers.completionProvider;
    this.documentHighlightProvider = context.providers.documentHighlightProvider;
    this.documentSymbolProvider = context.providers.documentSymbolProvider;
    this.foldingProvider = context.providers.foldingProvider;
    this.formattingProvider = context.providers.formattingProvider;
    this.hoverProvider = context.providers.hoverProvider;
    this.inlayHintProvider = context.providers.inlayHintProvider;
    this.onTypeFormattingProvider = context.providers.onTypeFormattingProvider;
    this.selectionRangeProvider = context.providers.selectionRangeProvider;
    this.resolveRequest = context.providers.resolveRequest;
    this.resolveWorkspaceRequest = context.resolveWorkspaceRequest;
    this.resolveWorkspaceVariableFlowContextByUri = context.resolveWorkspaceVariableFlowContext;
    this.semanticTokensProvider = context.providers.semanticTokensProvider;
    this.signatureHelpProvider = context.providers.signatureHelpProvider;
    this.workspaceSymbolProvider = context.providers.workspaceSymbolProvider;
  }

  /**
   * registerAll 함수.
   * connection에 연결되는 모든 request/response 기반 feature handler를 등록함.
   */
  registerAll(): void {
    this.registerCodeActionHandler();
    this.registerCodeActionResolveHandler();
    this.registerCompletionHandler();
    this.registerCompletionResolveHandler();
    this.registerDocumentHighlightHandler();
    this.registerDocumentSymbolHandler();
    this.registerWorkspaceSymbolHandler();
    this.registerFormattingHandler();
    this.registerRangeFormattingHandler();
    this.registerOnTypeFormattingHandler();
    this.registerDefinitionHandler();
    this.registerReferencesHandler();
    this.registerPrepareRenameHandler();
    this.registerRenameHandler();
    this.registerCodeLensHandler();
    this.registerHoverHandler();
    this.registerInlayHintHandler();
    this.registerSelectionRangeHandler();
    this.registerSignatureHelpHandler();
    this.registerFoldingHandler();
    this.registerSemanticTokensHandler();
    this.registerSemanticTokensRangeHandler();
  }

  private createDefinitionProvider(uri: string): DefinitionProvider {
    const workspaceContext = this.resolveWorkspaceVariableFlowContextByUri(uri);
    return new DefinitionProvider(this.registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.resolveRequest(textDocument.uri),
      variableFlowService: workspaceContext?.variableFlowService,
    });
  }

  private createReferencesProvider(uri: string): ReferencesProvider {
    const workspaceContext = this.resolveWorkspaceVariableFlowContextByUri(uri);
    return new ReferencesProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.resolveRequest(textDocument.uri),
      variableFlowService: workspaceContext?.variableFlowService,
    });
  }

  private createRenameProvider(uri: string): RenameProvider {
    const workspaceContext = this.resolveWorkspaceVariableFlowContextByUri(uri);
    return new RenameProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.resolveRequest(textDocument.uri),
      resolveUriRequest: (targetUri) => this.resolveWorkspaceRequest(targetUri),
      variableFlowService: workspaceContext?.variableFlowService,
    });
  }

  private createHoverProvider(uri: string): HoverProvider {
    const workspaceContext = this.resolveWorkspaceVariableFlowContextByUri(uri);
    if (!workspaceContext) {
      return this.hoverProvider;
    }

    return new HoverProvider(this.registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.resolveRequest(textDocument.uri),
      variableFlowService: workspaceContext.variableFlowService,
      workspaceSnapshot: workspaceContext.workspaceSnapshot,
    });
  }

  private createCompletionProvider(uri: string): CompletionProvider {
    const workspaceContext = this.resolveWorkspaceVariableFlowContextByUri(uri);
    if (!workspaceContext) {
      return this.completionProvider;
    }

    return new CompletionProvider(this.registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.resolveRequest(textDocument.uri),
      variableFlowService: workspaceContext.variableFlowService,
      workspaceSnapshot: workspaceContext.workspaceSnapshot,
    });
  }

  /**
   * provideCbsCompletionItems 함수.
   * 현재 URI에 맞는 CBS completion provider 결과에 resolve payload를 보강함.
   *
   * @param params - completion 요청 파라미터
   * @param cancellationToken - 취소 여부를 확인할 토큰
   * @returns CBS completion 후보 목록
   */
  private provideCbsCompletionItems(
    params: CompletionParams,
    cancellationToken?: CancellationToken,
  ): CompletionItem[] {
    const provider = this.createCompletionProvider(params.textDocument.uri);
    const unresolved = provider.provideUnresolved(params, cancellationToken);
    return unresolved.map((completionItem) => ({
      ...completionItem,
      data: {
        ...completionItem.data,
        cbs: {
          ...completionItem.data.cbs,
          uri: params.textDocument.uri,
          position: params.position,
        },
      },
    })) as CompletionItem[];
  }

  private registerCodeActionHandler(): void {
    this.connection.onCodeAction((params: CodeActionParams, cancellationToken): CodeAction[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'codeAction',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => {
          const unresolved = this.codeActionProvider.provideUnresolved(params);
          return unresolved.map((action) => ({
            ...action,
            data: {
              ...action.data,
              cbs: {
                ...action.data.cbs,
                uri: params.textDocument.uri,
              },
            },
          })) as CodeAction[];
        },
        startDetails: (requestParams) => ({
          diagnostics: requestParams.context.diagnostics.length,
        }),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerCodeActionResolveHandler(): void {
    this.connection.onCodeActionResolve((action: CodeAction, cancellationToken): CodeAction => {
      const actionData = action.data as { cbs?: { uri?: string } } | undefined;
      const uri = actionData?.cbs?.uri;

      if (!uri) {
        return action;
      }

      return this.requestRunner.runSync({
        empty: action,
        feature: 'codeActionResolve',
        getUri: () => uri,
        params: action,
        run: () => {
          const unresolved = action as UnresolvedCodeAction;
          const params: CodeActionParams = {
            textDocument: { uri },
            range: action.diagnostics?.[0]?.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            context: { diagnostics: action.diagnostics ?? [] },
          };
          const resolved = this.codeActionProvider.resolve(unresolved, params);
          return resolved ?? action;
        },
        summarize: (result) => ({ resolved: result !== action }),
        token: cancellationToken,
      });
    });
  }

  private registerCompletionResolveHandler(): void {
    this.connection.onCompletionResolve((item: CompletionItem, cancellationToken): CompletionItem => {
      const itemData = item.data as { cbs?: { uri?: string; position?: { line: number; character: number } } } | undefined;
      const uri = itemData?.cbs?.uri;

      if (!uri) {
        return item;
      }

      let resolveDurationMs = 0;
      return this.requestRunner.runSync({
        empty: item,
        feature: 'completionResolve',
        getUri: () => uri,
        params: item,
        run: () => {
          const startTime = performance.now();
          const unresolved = item as UnresolvedCompletionItem;
          const provider = this.createCompletionProvider(uri);
          const resolved = provider.resolve(unresolved, {
            textDocument: { uri },
            position: itemData?.cbs?.position ?? { line: 0, character: 0 },
          }, cancellationToken);
          const result = resolved ?? item;
          resolveDurationMs = Math.round(performance.now() - startTime);
          traceFeatureResult(this.connection, 'completionResolve', 'build', {
            uri,
            durationMs: resolveDurationMs,
            resolved: result !== item,
          });
          return result;
        },
        summarize: (result) => ({ resolved: result !== item, durationMs: resolveDurationMs }),
        token: cancellationToken,
      });
    });
  }

  private registerCompletionHandler(): void {
    this.connection.onCompletion((params: CompletionParams, cancellationToken) => {
      const filePath = CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri);
      const routedToLuaLs = shouldRouteDocumentToLuaLs(filePath);
      const routingRequest = routedToLuaLs ? this.resolveRequest(params.textDocument.uri) : null;
      const skipLuaLsProxy = routedToLuaLs && shouldSkipLuaLsProxyForRequest(routingRequest, filePath);
      logFeature(this.connection, 'completion', 'start', {
        uri: params.textDocument.uri,
        routedToLuaLs,
        luaProxySkipped: skipLuaLsProxy,
      });

      if (routedToLuaLs) {
        let luaCompletionDurationMs = 0;
        return this.requestRunner.runAsync<
          CompletionParams,
          CompletionItem[] | CompletionList
        >({
          empty: [],
          feature: 'completion',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: async () => {
            const startTime = performance.now();
            const cbsCompletion = this.provideCbsCompletionItems(params, cancellationToken);
            const cbsDurationMs = Math.round(performance.now() - startTime);
            const workspaceRequest = skipLuaLsProxy ? null : this.resolveWorkspaceRequest(params.textDocument.uri);
            const workspaceVariableFlowService = this.resolveWorkspaceVariableFlowContextByUri(
              params.textDocument.uri,
            )?.variableFlowService ?? null;
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
            if (skipLuaLsProxy) {
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
              luaCompletionDurationMs = Math.round(performance.now() - luaCompletionStartTime);
            }
            const overlay = buildLuaStateNameOverlayCompletions({
              params,
              request: workspaceRequest,
              variableFlowService: workspaceVariableFlowService,
            });

            return mergeLuaCompletionResponse(
              mergeLuaCompletionResponse(luaCompletion, overlay),
              cbsCompletion,
            );
          },
          summarize: (result) => {
            const count = Array.isArray(result) ? result.length : result.items.length;
            traceFeatureResult(this.connection, 'luaProxy', 'completion-end', {
              uri: params.textDocument.uri,
              companionStatus: this.luaLsProxy.getRuntime().status,
              count,
              durationMs: luaCompletionDurationMs,
            });
            logFeature(this.connection, 'luaProxy', 'completion-end', {
              uri: params.textDocument.uri,
              companionStatus: this.luaLsProxy.getRuntime().status,
              count,
              durationMs: luaCompletionDurationMs,
            });
              return {
                count,
                durationMs: luaCompletionDurationMs,
              source: skipLuaLsProxy ? 'luaProxySkipped' : 'luaProxy',
            };
          },
          token: cancellationToken,
        });
      }

      let completionDurationMs = 0;
      return this.requestRunner.runSync({
        empty: [],
        feature: 'completion',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        recoverOnError: true,
        run: () => {
          const startTime = performance.now();
          const result = this.provideCbsCompletionItems(params, cancellationToken);
          completionDurationMs = Math.round(performance.now() - startTime);
          traceFeatureResult(this.connection, 'completion', 'build', {
            uri: params.textDocument.uri,
            durationMs: completionDurationMs,
            count: result.length,
          });
          logFeature(this.connection, 'completion', 'build', {
            uri: params.textDocument.uri,
            durationMs: completionDurationMs,
            count: result.length,
          });
          return result;
        },
        summarize: (result) => ({ count: result.length, durationMs: completionDurationMs }),
        token: cancellationToken,
      });
    });
  }

  private registerDocumentSymbolHandler(): void {
    this.connection.onDocumentSymbol((params: DocumentSymbolParams, cancellationToken) => {
      const filePath = CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri);
      const routedToLuaLs = shouldRouteDocumentToLuaLs(filePath);
      const routingRequest = routedToLuaLs ? this.resolveRequest(params.textDocument.uri) : null;
      const skipLuaLsProxy = routedToLuaLs && shouldSkipLuaLsProxyForRequest(routingRequest, filePath);

      if (routedToLuaLs) {
        return this.requestRunner.runAsync<DocumentSymbolParams, DocumentSymbol[]>({
          empty: [],
          feature: 'documentSymbol',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: async () => {
            const cbsSymbols = routingRequest
              ? this.documentSymbolProvider.provide(params, routingRequest, cancellationToken)
              : [];
            if (skipLuaLsProxy) {
              return cbsSymbols;
            }

            const luaSymbols = await this.luaLsProxy.provideDocumentSymbol(params, cancellationToken);
            return [...cbsSymbols, ...luaSymbols];
          },
          summarize: (result) => ({
            count: result.length,
            source: skipLuaLsProxy ? 'luaProxySkipped' : 'cbsAndLuaProxy',
          }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: [],
        feature: 'documentSymbol',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => {
          const request = this.resolveRequest(params.textDocument.uri);
          return request ? this.documentSymbolProvider.provide(params, request, cancellationToken) : [];
        },
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerWorkspaceSymbolHandler(): void {
    const workspaceSymbolConnection = this.connection as Connection & {
      onWorkspaceSymbol?: (
        handler: (params: WorkspaceSymbolParams, cancellationToken: CancellationToken) => SymbolInformation[],
      ) => unknown;
    };
    workspaceSymbolConnection.onWorkspaceSymbol?.((params, cancellationToken): SymbolInformation[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'workspaceSymbol',
        getUri: () => 'workspace://symbol',
        params,
        run: () => this.workspaceSymbolProvider.provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerDocumentHighlightHandler(): void {
    this.connection.onDocumentHighlight((params: DocumentHighlightParams, cancellationToken) => {
      const filePath = CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri);
      const routedToLuaLs = shouldRouteDocumentToLuaLs(filePath);
      const routingRequest = routedToLuaLs ? this.resolveRequest(params.textDocument.uri) : null;
      const skipLuaLsProxy = routedToLuaLs && shouldSkipLuaLsProxyForRequest(routingRequest, filePath);

      if (routedToLuaLs) {
        return this.requestRunner.runAsync<DocumentHighlightParams, DocumentHighlight[]>({
          empty: [],
          feature: 'documentHighlight',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: async () => {
            const cbsHighlights = this.documentHighlightProvider.provide(params, cancellationToken);
            if (
              cbsHighlights.length > 0 &&
              routingRequest &&
              isPositionInsideCbsMacro(routingRequest.text, params.position)
            ) {
              return cbsHighlights;
            }

            if (skipLuaLsProxy) {
              return cbsHighlights;
            }

            const luaHighlights = await this.luaLsProxy.provideDocumentHighlight(params, cancellationToken);
            return [...cbsHighlights, ...luaHighlights];
          },
          summarize: (result) => ({
            count: result.length,
            source: skipLuaLsProxy ? 'luaProxySkipped' : 'cbsAndLuaProxy',
          }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: [],
        feature: 'documentHighlight',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.documentHighlightProvider.provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerFormattingHandler(): void {
    this.connection.onDocumentFormatting((params: DocumentFormattingParams, cancellationToken): TextEdit[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'formatting',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.formattingProvider.provide(params),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerSelectionRangeHandler(): void {
    this.connection.onSelectionRanges((params: SelectionRangeParams, cancellationToken): SelectionRange[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'selectionRange',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.selectionRangeProvider.provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerRangeFormattingHandler(): void {
    this.connection.onDocumentRangeFormatting((
      params: DocumentRangeFormattingParams,
      cancellationToken,
    ): TextEdit[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'rangeFormatting',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.formattingProvider.provideRange(params),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerOnTypeFormattingHandler(): void {
    this.connection.onDocumentOnTypeFormatting((
      params: DocumentOnTypeFormattingParams,
      cancellationToken,
    ): TextEdit[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'formattingOnType',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.onTypeFormattingProvider?.provide(params) ?? [],
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerDefinitionHandler(): void {
    this.connection.onDefinition((params: DefinitionParams, cancellationToken) => {
      const filePath = CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri);
      const routedToLuaLs = shouldRouteDocumentToLuaLs(filePath);
      const routingRequest = routedToLuaLs ? this.resolveRequest(params.textDocument.uri) : null;
      const skipLuaLsProxy = routedToLuaLs && shouldSkipLuaLsProxyForRequest(routingRequest, filePath);

      if (routedToLuaLs) {
        return this.requestRunner.runAsync<DefinitionParams, Definition | null>({
          empty: null,
          feature: 'definition',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: async () => {
            const cbsDefinition = this.createDefinitionProvider(params.textDocument.uri).provide(
              params,
              cancellationToken,
            );

            if (cbsDefinition && routingRequest && isPositionInsideCbsMacro(routingRequest.text, params.position)) {
              return cbsDefinition;
            }

            if (skipLuaLsProxy) {
              return cbsDefinition;
            }

            const luaDefinition = await this.luaLsProxy.provideDefinition(params, cancellationToken);
            return mergeDefinitions(cbsDefinition, luaDefinition);
          },
          summarize: (result) => ({
            count: Array.isArray(result) ? result.length : result ? 1 : 0,
            source: skipLuaLsProxy ? 'luaProxySkipped' : 'cbsAndLuaProxy',
          }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: null,
        feature: 'definition',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.createDefinitionProvider(params.textDocument.uri).provide(params, cancellationToken),
        summarize: (result) => ({
          count: Array.isArray(result) ? result.length : result ? 1 : 0,
        }),
        token: cancellationToken,
      });
    });
  }

  private registerReferencesHandler(): void {
    this.connection.onReferences((params: ReferenceParams, cancellationToken) => {
      const filePath = CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri);
      const routedToLuaLs = shouldRouteDocumentToLuaLs(filePath);
      const routingRequest = routedToLuaLs ? this.resolveRequest(params.textDocument.uri) : null;
      const skipLuaLsProxy = routedToLuaLs && shouldSkipLuaLsProxyForRequest(routingRequest, filePath);

      if (routedToLuaLs) {
        return this.requestRunner.runAsync<ReferenceParams, Location[]>({
          empty: [],
          feature: 'references',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: async () => {
            const cbsReferences = this.createReferencesProvider(params.textDocument.uri).provide(
              params,
              cancellationToken,
            );
            if (
              cbsReferences.length > 0 &&
              routingRequest &&
              isPositionInsideCbsMacro(routingRequest.text, params.position)
            ) {
              return cbsReferences;
            }

            if (skipLuaLsProxy) {
              return cbsReferences;
            }

            const luaReferences = await this.luaLsProxy.provideReferences(params, cancellationToken);
            return [...cbsReferences, ...luaReferences];
          },
          summarize: (result) => ({
            count: result.length,
            source: skipLuaLsProxy ? 'luaProxySkipped' : 'cbsAndLuaProxy',
          }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: [],
        feature: 'references',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.createReferencesProvider(params.textDocument.uri).provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerPrepareRenameHandler(): void {
    this.connection.onPrepareRename((params: TextDocumentPositionParams, cancellationToken) => {
      const filePath = CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri);
      const routedToLuaLs = shouldRouteDocumentToLuaLs(filePath);
      const routingRequest = routedToLuaLs ? this.resolveRequest(params.textDocument.uri) : null;
      const skipLuaLsProxy = routedToLuaLs && shouldSkipLuaLsProxyForRequest(routingRequest, filePath);

      if (routedToLuaLs) {
        return this.requestRunner.runAsync<
          TextDocumentPositionParams,
          LSPRange | { placeholder: string; range: LSPRange } | null
        >({
          empty: null,
          feature: 'rename',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          phases: {
            start: 'prepare-start',
            cancelled: 'prepare-cancelled',
            end: 'prepare-end',
          },
          recoverOnError: true,
          run: async () => {
            const prepareResult = this.createRenameProvider(params.textDocument.uri).prepareRename(
              params,
              cancellationToken,
            );
            if (prepareResult.canRename && prepareResult.hostRange) {
              return prepareResult.hostRange;
            }

            if (skipLuaLsProxy || prepareResult.message === 'Request cancelled') {
              return null;
            }

            return this.luaLsProxy.prepareRename(params, cancellationToken);
          },
          summarize: (result) => ({ canRename: result !== null }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: {
          canRename: false,
          response: null as LSPRange | null,
        },
        feature: 'rename',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        phases: {
          start: 'prepare-start',
          cancelled: 'prepare-cancelled',
          end: 'prepare-end',
        },
        run: () => {
          const prepareResult = this.createRenameProvider(params.textDocument.uri).prepareRename(
            params,
            cancellationToken,
          );
          return {
            canRename: prepareResult.canRename,
            response: resolvePrepareRenameResponse(prepareResult),
          };
        },
        summarize: (result) => ({ canRename: result.canRename }),
        token: cancellationToken,
      }).response;
    });
  }

  private registerRenameHandler(): void {
    this.connection.onRenameRequest((params: RenameParams, cancellationToken) => {
      const filePath = CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri);
      const routedToLuaLs = shouldRouteDocumentToLuaLs(filePath);
      const routingRequest = routedToLuaLs ? this.resolveRequest(params.textDocument.uri) : null;
      const skipLuaLsProxy = routedToLuaLs && shouldSkipLuaLsProxyForRequest(routingRequest, filePath);

      if (routedToLuaLs) {
        return this.requestRunner.runAsync<RenameParams, WorkspaceEdit | null>({
          empty: null,
          feature: 'rename',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: async () => {
            const provider = this.createRenameProvider(params.textDocument.uri);
            const prepareResult = provider.prepareRename(params, cancellationToken);
            if (prepareResult.canRename) {
              return provider.provideRename(params, cancellationToken);
            }

            if (skipLuaLsProxy || prepareResult.message === 'Request cancelled') {
              return null;
            }

            return this.luaLsProxy.provideRename(params, cancellationToken);
          },
          summarize: (result) => ({ documentChanges: result?.documentChanges?.length ?? 0 }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: null,
        feature: 'rename',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => {
          const provider = this.createRenameProvider(params.textDocument.uri);
          const prepareResult = provider.prepareRename(params, cancellationToken);
          if (!prepareResult.canRename) {
            if (prepareResult.message === 'Request cancelled') {
              return null;
            }

            throw createRenameRequestError(
              prepareResult.message ?? 'Rename is not available at the current position.',
            );
          }

          return provider.provideRename(params, cancellationToken);
        },
        summarize: (result) => ({ documentChanges: result?.documentChanges?.length ?? 0 }),
        token: cancellationToken,
      });
    });
  }

  private registerCodeLensHandler(): void {
    this.connection.onCodeLens((params: CodeLensParams, cancellationToken) => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'codelens',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.codeLensProvider.provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerHoverHandler(): void {
    this.connection.onHover((params: HoverParams, cancellationToken) => {
      const filePath = CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri);
      const routedToLuaLs = shouldRouteDocumentToLuaLs(filePath);
      const routingRequest = routedToLuaLs ? this.resolveRequest(params.textDocument.uri) : null;
      const skipLuaLsProxy = routedToLuaLs && shouldSkipLuaLsProxyForRequest(routingRequest, filePath);
      traceFeatureRequest(this.connection, 'hover', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
        luaProxySkipped: skipLuaLsProxy,
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'hover', 'cancelled', { uri: params.textDocument.uri });
        return null;
      }

      if (routedToLuaLs) {
        const cbsHover = this.createHoverProvider(params.textDocument.uri).provide(
          params,
          cancellationToken,
        );

        if (cbsHover && routingRequest && isPositionInsideCbsMacro(routingRequest.text, params.position)) {
          traceFeatureResult(this.connection, 'hover', 'end', {
            uri: params.textDocument.uri,
            hasResult: true,
            source: 'cbs',
          });
          return cbsHover;
        }

        if (skipLuaLsProxy) {
          traceFeatureResult(this.connection, 'luaProxy', 'hover-skipped', {
            uri: params.textDocument.uri,
            reason: 'oversized',
          });
          traceFeatureResult(this.connection, 'hover', 'end', {
            uri: params.textDocument.uri,
            hasResult: cbsHover !== null,
            source: 'luaProxySkipped',
          });
          return cbsHover;
        }

        traceFeatureRequest(this.connection, 'luaProxy', 'hover-start', {
          uri: params.textDocument.uri,
          companionStatus: this.luaLsProxy.getRuntime().status,
        });

        const workspaceRequest = this.resolveRequest(params.textDocument.uri);
        const workspaceVariableFlowService = this.resolveWorkspaceVariableFlowContextByUri(
          params.textDocument.uri,
        )?.variableFlowService ?? null;

        return this.luaLsProxy.provideHover(params, cancellationToken).then((result) => {
          const overlayMarkdown = buildLuaStateHoverOverlayMarkdown({
            params,
            request: workspaceRequest,
            variableFlowService: workspaceVariableFlowService,
          });
          const luaHover = mergeLuaHoverResponse(result, overlayMarkdown);
          const mergedHover = mergeCbsAndLuaHover(cbsHover, luaHover);
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
        });
      }

      const result = this.createHoverProvider(params.textDocument.uri).provide(
        params,
        cancellationToken,
      );
      traceFeatureResult(this.connection, 'hover', 'end', {
        uri: params.textDocument.uri,
        hasResult: result !== null,
      });
      return result;
    });
  }

  private registerInlayHintHandler(): void {
    this.connection.languages.inlayHint.on((params: InlayHintParams, cancellationToken): InlayHint[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'inlayHint',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.inlayHintProvider.provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerSignatureHelpHandler(): void {
    this.connection.onSignatureHelp((params: SignatureHelpParams, cancellationToken) => {
      const filePath = CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri);
      const routedToLuaLs = shouldRouteDocumentToLuaLs(filePath);
      const routingRequest = routedToLuaLs ? this.resolveRequest(params.textDocument.uri) : null;
      const skipLuaLsProxy = routedToLuaLs && shouldSkipLuaLsProxyForRequest(routingRequest, filePath);

      if (routedToLuaLs) {
        return this.requestRunner.runAsync<SignatureHelpParams, SignatureHelp | null>({
          empty: null,
          feature: 'signature',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: async () => {
            const cbsSignature = routingRequest
              ? this.signatureHelpProvider.provide(params, routingRequest, cancellationToken)
              : null;
            if (
              cbsSignature &&
              routingRequest &&
              isPositionInsideCbsMacro(routingRequest.text, params.position)
            ) {
              return cbsSignature;
            }

            if (skipLuaLsProxy) {
              return cbsSignature;
            }

            const luaSignature = await this.luaLsProxy.provideSignatureHelp(params, cancellationToken);
            return luaSignature ?? cbsSignature;
          },
          summarize: (result) => ({
            hasResult: result !== null,
            source: skipLuaLsProxy ? 'luaProxySkipped' : 'cbsAndLuaProxy',
          }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: null,
        feature: 'signature',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => {
          const request = this.resolveRequest(params.textDocument.uri);
          return request ? this.signatureHelpProvider.provide(params, request, cancellationToken) : null;
        },
        summarize: (result) => ({ hasResult: result !== null }),
        token: cancellationToken,
      });
    });
  }

  private registerFoldingHandler(): void {
    this.connection.onFoldingRanges((params: FoldingRangeParams, cancellationToken) => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'folding',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => {
          const request = this.resolveRequest(params.textDocument.uri);
          return request ? this.foldingProvider.provide(params, request, cancellationToken) : [];
        },
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerSemanticTokensHandler(): void {
    this.connection.languages.semanticTokens.on((params: SemanticTokensParams, cancellationToken) => {
      return this.requestRunner.runSync({
        empty: { data: [] },
        feature: 'semanticTokens',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => {
          const request = this.resolveRequest(params.textDocument.uri);
          return request
            ? this.semanticTokensProvider.provide(params, request, cancellationToken)
            : { data: [] };
        },
        summarize: (result) => ({ count: result.data.length }),
        token: cancellationToken,
      });
    });
  }

  private registerSemanticTokensRangeHandler(): void {
    this.connection.languages.semanticTokens.onRange((params: SemanticTokensRangeParams, cancellationToken) => {
      return this.requestRunner.runSync({
        empty: { data: [] },
        feature: 'semanticTokensRange',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => {
          const request = this.resolveRequest(params.textDocument.uri);
          return request
            ? this.semanticTokensProvider.provideRange(params, request, cancellationToken)
            : { data: [] };
        },
        summarize: (result) => ({ count: result.data.length }),
        token: cancellationToken,
      });
    });
  }
}
