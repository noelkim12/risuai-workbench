/**
 * cbs-lsp server feature handler registrar helper.
 * @file packages/cbs-lsp/src/helpers/server-helper.ts
 */

import { CBSBuiltinRegistry } from 'risu-workbench-core';
import {
  type CodeAction,
  type CodeActionParams,
  type CodeLensParams,
  type CompletionParams,
  type Connection,
  type Definition,
  type DefinitionParams,
  type DocumentSymbol,
  type DocumentSymbolParams,
  type DocumentFormattingParams,
  type FoldingRangeParams,
  type HoverParams,
  LSPErrorCodes,
  type Location,
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
import { DefinitionProvider } from '../features/definition';
import { DocumentSymbolProvider } from '../features/documentSymbol';
import { FoldingProvider } from '../features/folding';
import { FormattingProvider } from '../features/formatting';
import { HoverProvider } from '../features/hover';
import { ReferencesProvider } from '../features/references';
import { RenameProvider } from '../features/rename';
import { SemanticTokensProvider } from '../features/semanticTokens';
import { SignatureHelpProvider } from '../features/signature';
import { CbsLspPathHelper } from './path-helper';
import { shouldRouteDocumentToLuaLs } from '../providers/lua/lualsDocuments';
import { createLuaLsProxy } from '../providers/lua/lualsProxy';
import { isRequestCancelled } from '../utils/request-cancellation';
import { traceFeatureRequest, traceFeatureResult } from '../utils/server-tracing';
import { VariableFlowService } from '../services';

export interface ServerFeatureRegistrarProviders {
  codeActionProvider: CodeActionProvider;
  codeLensProvider: CodeLensProvider;
  completionProvider: CompletionProvider;
  documentSymbolProvider: DocumentSymbolProvider;
  foldingProvider: FoldingProvider;
  formattingProvider: FormattingProvider;
  hoverProvider: HoverProvider;
  resolveRequest: (uri: string) => FragmentAnalysisRequest | null;
  semanticTokensProvider: SemanticTokensProvider;
  signatureHelpProvider: SignatureHelpProvider;
}

export interface ServerFeatureRegistrarContext {
  connection: Connection;
  luaLsProxy: ReturnType<typeof createLuaLsProxy>;
  providers: ServerFeatureRegistrarProviders;
  registry: CBSBuiltinRegistry;
  resolveWorkspaceRequest: (uri: string) => FragmentAnalysisRequest | null;
  resolveWorkspaceVariableFlowService: (uri: string) => VariableFlowService | null;
}

/**
 * shouldSkipRequest 함수.
 * 취소 토큰이 이미 취소된 요청인지 helper 내부 공통 규칙으로 판별함.
 *
 * @param cancellationToken - 현재 callback에 전달된 취소 토큰
 * @returns 요청 처리를 바로 중단해야 하면 true
 */
function shouldSkipRequest(cancellationToken: CancellationToken | undefined): boolean {
  return isRequestCancelled(cancellationToken);
}

/**
 * createRenameRequestError 함수.
 * rename 불가 상황을 LSP 응답 에러 형태로 감쌈.
 *
 * @param message - 클라이언트에 보여줄 rename 실패 이유
 * @returns rename request에서 throw할 ResponseError 인스턴스
 */
function createRenameRequestError(message: string): ResponseError<void> {
  return new ResponseError(-32600 as typeof LSPErrorCodes.ServerCancelled, message);
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
  private readonly documentSymbolProvider: DocumentSymbolProvider;
  private readonly foldingProvider: FoldingProvider;
  private readonly formattingProvider: FormattingProvider;
  private readonly hoverProvider: HoverProvider;
  private readonly luaLsProxy: ReturnType<typeof createLuaLsProxy>;
  private readonly registry: CBSBuiltinRegistry;
  private readonly resolveRequest: (uri: string) => FragmentAnalysisRequest | null;
  private readonly resolveWorkspaceRequest: (uri: string) => FragmentAnalysisRequest | null;
  private readonly resolveWorkspaceVariableFlowServiceByUri: (uri: string) => VariableFlowService | null;
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
    this.codeActionProvider = context.providers.codeActionProvider;
    this.codeLensProvider = context.providers.codeLensProvider;
    this.completionProvider = context.providers.completionProvider;
    this.documentSymbolProvider = context.providers.documentSymbolProvider;
    this.foldingProvider = context.providers.foldingProvider;
    this.formattingProvider = context.providers.formattingProvider;
    this.hoverProvider = context.providers.hoverProvider;
    this.resolveRequest = context.providers.resolveRequest;
    this.resolveWorkspaceRequest = context.resolveWorkspaceRequest;
    this.resolveWorkspaceVariableFlowServiceByUri = context.resolveWorkspaceVariableFlowService;
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
    this.registerDocumentSymbolHandler();
    this.registerFormattingHandler();
    this.registerDefinitionHandler();
    this.registerReferencesHandler();
    this.registerPrepareRenameHandler();
    this.registerRenameHandler();
    this.registerCodeLensHandler();
    this.registerHoverHandler();
    this.registerSignatureHelpHandler();
    this.registerFoldingHandler();
    this.registerSemanticTokensHandler();
  }

  private createDefinitionProvider(uri: string): DefinitionProvider {
    return new DefinitionProvider(this.registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.resolveRequest(textDocument.uri),
      variableFlowService: this.resolveWorkspaceVariableFlowServiceByUri(uri) ?? undefined,
    });
  }

  private createReferencesProvider(uri: string): ReferencesProvider {
    return new ReferencesProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.resolveRequest(textDocument.uri),
      variableFlowService: this.resolveWorkspaceVariableFlowServiceByUri(uri) ?? undefined,
    });
  }

  private createRenameProvider(uri: string): RenameProvider {
    return new RenameProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.resolveRequest(textDocument.uri),
      resolveUriRequest: (targetUri) => this.resolveWorkspaceRequest(targetUri),
      variableFlowService: this.resolveWorkspaceVariableFlowServiceByUri(uri) ?? undefined,
    });
  }

  private registerCodeActionHandler(): void {
    this.connection.onCodeAction((params: CodeActionParams, cancellationToken): CodeAction[] => {
      traceFeatureRequest(this.connection, 'codeAction', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
        diagnostics: params.context.diagnostics.length,
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'codeAction', 'cancelled', { uri: params.textDocument.uri });
        return [];
      }

      const result = this.codeActionProvider.provide(params);
      traceFeatureResult(this.connection, 'codeAction', 'end', {
        uri: params.textDocument.uri,
        count: result.length,
      });
      return result;
    });
  }

  private registerCompletionHandler(): void {
    this.connection.onCompletion((params: CompletionParams, cancellationToken) => {
      traceFeatureRequest(this.connection, 'completion', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'completion', 'cancelled', { uri: params.textDocument.uri });
        return [];
      }

      const result = this.completionProvider.provide(params, cancellationToken);
      traceFeatureResult(this.connection, 'completion', 'end', {
        uri: params.textDocument.uri,
        count: result.length,
      });
      return result;
    });
  }

  private registerDocumentSymbolHandler(): void {
    this.connection.onDocumentSymbol((params: DocumentSymbolParams, cancellationToken): DocumentSymbol[] => {
      traceFeatureRequest(this.connection, 'documentSymbol', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'documentSymbol', 'cancelled', { uri: params.textDocument.uri });
        return [];
      }

      const request = this.resolveRequest(params.textDocument.uri);
      const result = request ? this.documentSymbolProvider.provide(params, request, cancellationToken) : [];
      traceFeatureResult(this.connection, 'documentSymbol', 'end', {
        uri: params.textDocument.uri,
        count: result.length,
      });
      return result;
    });
  }

  private registerFormattingHandler(): void {
    this.connection.onDocumentFormatting((params: DocumentFormattingParams, cancellationToken): TextEdit[] => {
      traceFeatureRequest(this.connection, 'formatting', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'formatting', 'cancelled', { uri: params.textDocument.uri });
        return [];
      }

      const result = this.formattingProvider.provide(params);
      traceFeatureResult(this.connection, 'formatting', 'end', {
        uri: params.textDocument.uri,
        count: result.length,
      });
      return result;
    });
  }

  private registerDefinitionHandler(): void {
    this.connection.onDefinition((params: DefinitionParams, cancellationToken): Definition | null => {
      traceFeatureRequest(this.connection, 'definition', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'definition', 'cancelled', { uri: params.textDocument.uri });
        return null;
      }

      const result = this.createDefinitionProvider(params.textDocument.uri).provide(params, cancellationToken);
      const count = Array.isArray(result) ? result.length : result ? 1 : 0;
      traceFeatureResult(this.connection, 'definition', 'end', {
        uri: params.textDocument.uri,
        count,
      });
      return result;
    });
  }

  private registerReferencesHandler(): void {
    this.connection.onReferences((params: ReferenceParams, cancellationToken): Location[] => {
      traceFeatureRequest(this.connection, 'references', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'references', 'cancelled', { uri: params.textDocument.uri });
        return [];
      }

      const result = this.createReferencesProvider(params.textDocument.uri).provide(params, cancellationToken);
      traceFeatureResult(this.connection, 'references', 'end', {
        uri: params.textDocument.uri,
        count: result.length,
      });
      return result;
    });
  }

  private registerPrepareRenameHandler(): void {
    this.connection.onPrepareRename((params: TextDocumentPositionParams, cancellationToken): LSPRange | null => {
      traceFeatureRequest(this.connection, 'rename', 'prepare-start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'rename', 'prepare-cancelled', { uri: params.textDocument.uri });
        return null;
      }

      const prepareResult = this.createRenameProvider(params.textDocument.uri).prepareRename(
        params,
        cancellationToken,
      );
      const response = resolvePrepareRenameResponse(prepareResult);
      traceFeatureResult(this.connection, 'rename', 'prepare-end', {
        uri: params.textDocument.uri,
        canRename: prepareResult.canRename,
      });
      return response;
    });
  }

  private registerRenameHandler(): void {
    this.connection.onRenameRequest((params: RenameParams, cancellationToken): WorkspaceEdit | null => {
      traceFeatureRequest(this.connection, 'rename', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'rename', 'cancelled', { uri: params.textDocument.uri });
        return null;
      }

      const provider = this.createRenameProvider(params.textDocument.uri);
      const prepareResult = provider.prepareRename(params, cancellationToken);
      if (!prepareResult.canRename) {
        if (prepareResult.message === 'Request cancelled') {
          traceFeatureResult(this.connection, 'rename', 'cancelled', { uri: params.textDocument.uri });
          return null;
        }

        throw createRenameRequestError(
          prepareResult.message ?? 'Rename is not available at the current position.',
        );
      }

      const result = provider.provideRename(params, cancellationToken);
      traceFeatureResult(this.connection, 'rename', 'end', {
        uri: params.textDocument.uri,
        documentChanges: result?.documentChanges?.length ?? 0,
      });
      return result;
    });
  }

  private registerCodeLensHandler(): void {
    this.connection.onCodeLens((params: CodeLensParams, cancellationToken) => {
      traceFeatureRequest(this.connection, 'codelens', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'codelens', 'cancelled', { uri: params.textDocument.uri });
        return [];
      }

      const result = this.codeLensProvider.provide(params, cancellationToken);
      traceFeatureResult(this.connection, 'codelens', 'end', {
        uri: params.textDocument.uri,
        count: result.length,
      });
      return result;
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

        return this.luaLsProxy.provideHover(params, cancellationToken).then((result) => {
          traceFeatureResult(this.connection, 'luaProxy', 'hover-end', {
            uri: params.textDocument.uri,
            companionStatus: this.luaLsProxy.getRuntime().status,
            hasResult: result !== null,
          });
          traceFeatureResult(this.connection, 'hover', 'end', {
            uri: params.textDocument.uri,
            hasResult: result !== null,
            source: 'luaProxy',
          });
          return result;
        });
      }

      const result = this.hoverProvider.provide(params, cancellationToken);
      traceFeatureResult(this.connection, 'hover', 'end', {
        uri: params.textDocument.uri,
        hasResult: result !== null,
      });
      return result;
    });
  }

  private registerSignatureHelpHandler(): void {
    this.connection.onSignatureHelp((params: SignatureHelpParams, cancellationToken) => {
      traceFeatureRequest(this.connection, 'signature', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'signature', 'cancelled', { uri: params.textDocument.uri });
        return null;
      }

      const request = this.resolveRequest(params.textDocument.uri);
      const result = request ? this.signatureHelpProvider.provide(params, request, cancellationToken) : null;
      traceFeatureResult(this.connection, 'signature', 'end', {
        uri: params.textDocument.uri,
        hasResult: result !== null,
      });
      return result;
    });
  }

  private registerFoldingHandler(): void {
    this.connection.onFoldingRanges((params: FoldingRangeParams, cancellationToken) => {
      traceFeatureRequest(this.connection, 'folding', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'folding', 'cancelled', { uri: params.textDocument.uri });
        return [];
      }

      const request = this.resolveRequest(params.textDocument.uri);
      const result = request ? this.foldingProvider.provide(params, request, cancellationToken) : [];
      traceFeatureResult(this.connection, 'folding', 'end', {
        uri: params.textDocument.uri,
        count: result.length,
      });
      return result;
    });
  }

  private registerSemanticTokensHandler(): void {
    this.connection.languages.semanticTokens.on((params: SemanticTokensParams, cancellationToken) => {
      traceFeatureRequest(this.connection, 'semanticTokens', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'semanticTokens', 'cancelled', { uri: params.textDocument.uri });
        return { data: [] };
      }

      const request = this.resolveRequest(params.textDocument.uri);
      const result = request
        ? this.semanticTokensProvider.provide(params, request, cancellationToken)
        : { data: [] };
      traceFeatureResult(this.connection, 'semanticTokens', 'end', {
        uri: params.textDocument.uri,
        count: result.data.length,
      });
      return result;
    });
  }
}
