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
  type FoldingRangeParams,
  type HoverParams,
  type InlayHint,
  type InlayHintParams,
  LSPErrorCodes,
  type Location,
  type SelectionRange,
  type SelectionRangeParams,
  type Range as LSPRange,
  type ReferenceParams,
  type RenameParams,
  ResponseError,
  type SemanticTokensParams,
  type SignatureHelpParams,
  TextEdit,
  type TextDocumentPositionParams,
  type WorkspaceEdit,
  type CancellationToken,
} from 'vscode-languageserver/node';

import { fragmentAnalysisService, type FragmentAnalysisRequest } from '../core';
import { CodeActionProvider } from '../features/codeActions';
import { CodeLensProvider } from '../features/codelens';
import { CompletionProvider } from '../features/completion';
import type { LuaLsCompanionController } from '../controllers/LuaLsCompanionController';
import { DefinitionProvider } from '../features/definition';
import { DocumentHighlightProvider } from '../features/documentHighlight';
import { DocumentSymbolProvider } from '../features/documentSymbol';
import { FoldingProvider } from '../features/folding';
import { FormattingProvider } from '../features/formatting';
import { HoverProvider } from '../features/hover';
import { InlayHintProvider } from '../features/inlayHint';
import { ReferencesProvider } from '../features/references';
import { RenameProvider } from '../features/rename';
import { SelectionRangeProvider } from '../features/selectionRange';
import { SemanticTokensProvider } from '../features/semanticTokens';
import { SignatureHelpProvider } from '../features/signature';
import { RequestHandlerRunner } from '../handlers/RequestHandlerRunner';
import { CbsLspPathHelper } from './path-helper';
import { shouldRouteDocumentToLuaLs } from '../providers/lua/lualsDocuments';
import {
  buildLuaStateHoverOverlayMarkdown,
  buildLuaStateNameOverlayCompletions,
  mergeLuaHoverResponse,
  mergeLuaCompletionResponse,
} from '../providers/lua/responseMerger';
import { traceFeatureRequest, traceFeatureResult } from '../utils/server-tracing';
import { VariableFlowService, type WorkspaceSnapshotState } from '../services';

export interface ServerFeatureRegistrarProviders {
  codeActionProvider: CodeActionProvider;
  codeLensProvider: CodeLensProvider;
  completionProvider: CompletionProvider;
  documentHighlightProvider: DocumentHighlightProvider;
  documentSymbolProvider: DocumentSymbolProvider;
  foldingProvider: FoldingProvider;
  formattingProvider: FormattingProvider;
  hoverProvider: HoverProvider;
  inlayHintProvider: InlayHintProvider;
  selectionRangeProvider: SelectionRangeProvider;
  resolveRequest: (uri: string) => FragmentAnalysisRequest | null;
  semanticTokensProvider: SemanticTokensProvider;
  signatureHelpProvider: SignatureHelpProvider;
}

export interface ServerFeatureRegistrarContext {
  connection: Connection;
  luaLsProxy: Pick<LuaLsCompanionController, 'getRuntime' | 'provideCompletion' | 'provideHover'>;
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
  private readonly selectionRangeProvider: SelectionRangeProvider;
  private readonly luaLsProxy: Pick<LuaLsCompanionController, 'getRuntime' | 'provideCompletion' | 'provideHover'>;
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
    this.selectionRangeProvider = context.providers.selectionRangeProvider;
    this.resolveRequest = context.providers.resolveRequest;
    this.resolveWorkspaceRequest = context.resolveWorkspaceRequest;
    this.resolveWorkspaceVariableFlowContextByUri = context.resolveWorkspaceVariableFlowContext;
    this.semanticTokensProvider = context.providers.semanticTokensProvider;
    this.signatureHelpProvider = context.providers.signatureHelpProvider;
  }

  /**
   * registerAll 함수.
   * connection에 연결되는 모든 request/response 기반 feature handler를 등록함.
   */
  registerAll(): void {
    this.registerCodeActionHandler();
    this.registerCompletionHandler();
    this.registerDocumentHighlightHandler();
    this.registerDocumentSymbolHandler();
    this.registerFormattingHandler();
    this.registerRangeFormattingHandler();
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

  private registerCodeActionHandler(): void {
    this.connection.onCodeAction((params: CodeActionParams, cancellationToken): CodeAction[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'codeAction',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.codeActionProvider.provide(params),
        startDetails: (requestParams) => ({
          diagnostics: requestParams.context.diagnostics.length,
        }),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerCompletionHandler(): void {
    this.connection.onCompletion((params: CompletionParams, cancellationToken) => {
      const filePath = CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri);

      if (shouldRouteDocumentToLuaLs(filePath)) {
        return this.requestRunner.runAsync<
          CompletionParams,
          CompletionItem[] | CompletionList
        >({
          empty: [],
          feature: 'completion',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          run: async () => {
            const workspaceRequest = this.resolveWorkspaceRequest(params.textDocument.uri);
            const workspaceVariableFlowService = this.resolveWorkspaceVariableFlowContextByUri(
              params.textDocument.uri,
            )?.variableFlowService ?? null;
            traceFeatureRequest(this.connection, 'luaProxy', 'completion-start', {
              uri: params.textDocument.uri,
              companionStatus: this.luaLsProxy.getRuntime().status,
            });
            const luaCompletion = await this.luaLsProxy.provideCompletion(params, cancellationToken);
            const overlay = buildLuaStateNameOverlayCompletions({
              params,
              request: workspaceRequest,
              variableFlowService: workspaceVariableFlowService,
            });

            return mergeLuaCompletionResponse(luaCompletion, overlay);
          },
          summarize: (result) => {
            const count = Array.isArray(result) ? result.length : result.items.length;
            traceFeatureResult(this.connection, 'luaProxy', 'completion-end', {
              uri: params.textDocument.uri,
              companionStatus: this.luaLsProxy.getRuntime().status,
              count,
            });
            return {
              count,
              source: 'luaProxy',
            };
          },
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: [],
        feature: 'completion',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.createCompletionProvider(params.textDocument.uri).provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerDocumentSymbolHandler(): void {
    this.connection.onDocumentSymbol((params: DocumentSymbolParams, cancellationToken): DocumentSymbol[] => {
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

  private registerDocumentHighlightHandler(): void {
    this.connection.onDocumentHighlight((params: DocumentHighlightParams, cancellationToken): DocumentHighlight[] => {
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

  private registerDefinitionHandler(): void {
    this.connection.onDefinition((params: DefinitionParams, cancellationToken): Definition | null => {
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
    this.connection.onReferences((params: ReferenceParams, cancellationToken): Location[] => {
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
    this.connection.onPrepareRename((params: TextDocumentPositionParams, cancellationToken): LSPRange | null => {
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
    this.connection.onRenameRequest((params: RenameParams, cancellationToken): WorkspaceEdit | null => {
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
      traceFeatureRequest(this.connection, 'hover', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'hover', 'cancelled', { uri: params.textDocument.uri });
        return null;
      }

      if (shouldRouteDocumentToLuaLs(filePath)) {
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
          const mergedHover = mergeLuaHoverResponse(result, overlayMarkdown);
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
}
