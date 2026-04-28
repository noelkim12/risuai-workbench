/**
 * cbs-lsp server feature handler registrar helper.
 * @file packages/cbs-lsp/src/helpers/server-helper.ts
 */

import type { CancellationToken, CompletionItem, CompletionParams } from 'vscode-languageserver/node';

import type { CompletionProvider } from '../features/completion';
import type { DefinitionProvider } from '../features/definition';
import type { HoverProvider } from '../features/hover';
import type { ReferencesProvider } from '../features/references';
import type { RenameProvider } from '../features/rename';
import { RequestHandlerRunner } from '../handlers/RequestHandlerRunner';
import { WorkspaceAwareProviderFactory } from './server/WorkspaceAwareProviderFactory';
import { LuaLsFallbackService } from './server/lua/LuaLsFallbackService';
import { LuaLsRequestGate } from './server/lua/LuaLsRequestGate';
import { CodeActionRegistrar } from './server/registrars/CodeActionRegistrar';
import { CodeLensRegistrar } from './server/registrars/CodeLensRegistrar';
import { CompletionRegistrar } from './server/registrars/CompletionRegistrar';
import { DefinitionRegistrar } from './server/registrars/DefinitionRegistrar';
import { DocumentHighlightRegistrar } from './server/registrars/DocumentHighlightRegistrar';
import { DocumentSymbolRegistrar } from './server/registrars/DocumentSymbolRegistrar';
import type { FeatureRegistrar } from './server/registrars/FeatureRegistrar';
import { FoldingRegistrar } from './server/registrars/FoldingRegistrar';
import { FormattingRegistrar } from './server/registrars/FormattingRegistrar';
import { HoverRegistrar } from './server/registrars/HoverRegistrar';
import { InlayHintRegistrar } from './server/registrars/InlayHintRegistrar';
import { ReferencesRegistrar } from './server/registrars/ReferencesRegistrar';
import { RenameRegistrar } from './server/registrars/RenameRegistrar';
import { SelectionRangeRegistrar } from './server/registrars/SelectionRangeRegistrar';
import { SemanticTokensRegistrar } from './server/registrars/SemanticTokensRegistrar';
import { SignatureHelpRegistrar } from './server/registrars/SignatureHelpRegistrar';
import { WorkspaceSymbolRegistrar } from './server/registrars/WorkspaceSymbolRegistrar';
import type { ServerFeatureRegistrarContext } from './server/types';

export {
  isPositionInsideCbsMacro,
  shouldSkipLuaLsProxyForRequest,
} from './server/lua/LuaLsRequestGate';
export {
  collectCompletionResponseLabels,
  mergeCbsAndLuaHover,
  mergeDefinitions,
  normalizeHoverContentsMarkdown,
} from './server/lua/LuaLsResponseMerge';
export type {
  ServerFeatureRegistrarContext,
  ServerFeatureRegistrarProviders,
  ServerWorkspaceVariableFlowContext,
  WorkspaceAwareProviderFactoryContext,
  WorkspaceAwareProviders,
} from './server/types';
export type { FeatureRegistrar } from './server/registrars/FeatureRegistrar';

/**
 * ServerFeatureRegistrar 클래스.
 * shared dependencies와 ordered feature registrar 목록만 조립하는 composition root.
 */
export class ServerFeatureRegistrar {
  private readonly completionRegistrar: CompletionRegistrar;
  private readonly definitionRegistrar: DefinitionRegistrar;
  private readonly documentHighlightRegistrar: DocumentHighlightRegistrar;
  private readonly documentSymbolRegistrar: DocumentSymbolRegistrar;
  private readonly hoverRegistrar: HoverRegistrar;
  private readonly providerFactory: WorkspaceAwareProviderFactory;
  private readonly referencesRegistrar: ReferencesRegistrar;
  private readonly registrars: FeatureRegistrar[];
  private readonly renameRegistrar: RenameRegistrar;
  private readonly signatureHelpRegistrar: SignatureHelpRegistrar;

  /**
   * constructor 함수.
   * feature callback 등록에 필요한 shared service와 registrar 배열을 조립함.
   *
   * @param context - feature handler 등록에 필요한 server helper context
   */
  constructor(context: ServerFeatureRegistrarContext) {
    const requestRunner = new RequestHandlerRunner(context.connection);
    const luaLsRequestGate = new LuaLsRequestGate(context.providers.resolveRequest);
    this.providerFactory = new WorkspaceAwareProviderFactory({
      completionProvider: context.providers.completionProvider,
      hoverProvider: context.providers.hoverProvider,
      registry: context.registry,
      resolveRequest: context.providers.resolveRequest,
      resolveWorkspaceRequest: context.resolveWorkspaceRequest,
      resolveWorkspaceVariableFlowContext: context.resolveWorkspaceVariableFlowContext,
    });
    const luaLsFallbackService = new LuaLsFallbackService({
      connection: context.connection,
      createDefinitionProvider: (uri) => this.createDefinitionProvider(uri),
      createHoverProvider: (uri) => this.createHoverProvider(uri),
      createReferencesProvider: (uri) => this.createReferencesProvider(uri),
      createRenameProvider: (uri) => this.createRenameProvider(uri),
      documentHighlightProvider: context.providers.documentHighlightProvider,
      documentSymbolProvider: context.providers.documentSymbolProvider,
      luaLsProxy: context.luaLsProxy,
      luaLsRequestGate,
      provideCbsCompletionItems: (params, cancellationToken) => this.provideCbsCompletionItems(
        params,
        cancellationToken,
      ),
      resolveRequest: context.providers.resolveRequest,
      resolveWorkspaceRequest: context.resolveWorkspaceRequest,
      resolveWorkspaceVariableFlowContext: context.resolveWorkspaceVariableFlowContext,
      signatureHelpProvider: context.providers.signatureHelpProvider,
    });

    const codeActionRegistrar = new CodeActionRegistrar({
      codeActionProvider: context.providers.codeActionProvider,
      connection: context.connection,
      requestRunner,
    });
    this.completionRegistrar = new CompletionRegistrar({
      connection: context.connection,
      createCompletionProvider: (uri) => this.createCompletionProvider(uri),
      luaLsFallbackService,
      luaLsProxy: context.luaLsProxy,
      provideCbsCompletionItems: (params, cancellationToken) => this.provideCbsCompletionItems(
        params,
        cancellationToken,
      ),
      requestRunner,
    });
    this.documentHighlightRegistrar = new DocumentHighlightRegistrar({
      connection: context.connection,
      luaLsFallbackService,
      requestRunner,
    });
    this.documentSymbolRegistrar = new DocumentSymbolRegistrar({
      connection: context.connection,
      luaLsFallbackService,
      requestRunner,
    });
    const workspaceSymbolRegistrar = new WorkspaceSymbolRegistrar({
      connection: context.connection,
      requestRunner,
      workspaceSymbolProvider: context.providers.workspaceSymbolProvider,
    });
    const formattingRegistrar = new FormattingRegistrar({
      connection: context.connection,
      formattingProvider: context.providers.formattingProvider,
      onTypeFormattingProvider: context.providers.onTypeFormattingProvider,
      requestRunner,
    });
    this.definitionRegistrar = new DefinitionRegistrar({
      connection: context.connection,
      createDefinitionProvider: (uri) => this.createDefinitionProvider(uri),
      luaLsFallbackService,
      requestRunner,
    });
    this.referencesRegistrar = new ReferencesRegistrar({
      connection: context.connection,
      createReferencesProvider: (uri) => this.createReferencesProvider(uri),
      luaLsFallbackService,
      requestRunner,
    });
    this.renameRegistrar = new RenameRegistrar({
      connection: context.connection,
      createRenameProvider: (uri) => this.createRenameProvider(uri),
      luaLsFallbackService,
      requestRunner,
    });
    const codeLensRegistrar = new CodeLensRegistrar({
      codeLensProvider: context.providers.codeLensProvider,
      connection: context.connection,
      requestRunner,
    });
    this.hoverRegistrar = new HoverRegistrar({
      connection: context.connection,
      createHoverProvider: (uri) => this.createHoverProvider(uri),
      luaLsFallbackService,
    });
    const inlayHintRegistrar = new InlayHintRegistrar({
      connection: context.connection,
      inlayHintProvider: context.providers.inlayHintProvider,
      requestRunner,
    });
    const selectionRangeRegistrar = new SelectionRangeRegistrar({
      connection: context.connection,
      requestRunner,
      selectionRangeProvider: context.providers.selectionRangeProvider,
    });
    this.signatureHelpRegistrar = new SignatureHelpRegistrar({
      connection: context.connection,
      luaLsFallbackService,
      requestRunner,
    });
    const foldingRegistrar = new FoldingRegistrar({
      connection: context.connection,
      foldingProvider: context.providers.foldingProvider,
      requestRunner,
      resolveRequest: context.providers.resolveRequest,
    });
    const semanticTokensRegistrar = new SemanticTokensRegistrar({
      connection: context.connection,
      requestRunner,
      resolveRequest: context.providers.resolveRequest,
      semanticTokensProvider: context.providers.semanticTokensProvider,
    });

    this.registrars = [
      codeActionRegistrar,
      this.completionRegistrar,
      this.documentHighlightRegistrar,
      this.documentSymbolRegistrar,
      workspaceSymbolRegistrar,
      formattingRegistrar,
      this.definitionRegistrar,
      this.referencesRegistrar,
      this.renameRegistrar,
      codeLensRegistrar,
      this.hoverRegistrar,
      inlayHintRegistrar,
      selectionRangeRegistrar,
      this.signatureHelpRegistrar,
      foldingRegistrar,
      semanticTokensRegistrar,
    ];
    this.preserveCompatibilityWrapperSeams();
  }

  /**
   * registerAll 함수.
   * ordered registrar 목록을 순회해 모든 feature handler를 등록함.
   */
  registerAll(): void {
    for (const registrar of this.registrars) {
      registrar.register();
    }
  }

  private createDefinitionProvider(uri: string): DefinitionProvider {
    return this.providerFactory.createDefinitionProvider(uri);
  }

  private createReferencesProvider(uri: string): ReferencesProvider {
    return this.providerFactory.createReferencesProvider(uri);
  }

  private createRenameProvider(uri: string): RenameProvider {
    return this.providerFactory.createRenameProvider(uri);
  }

  private createHoverProvider(uri: string): HoverProvider {
    return this.providerFactory.createHoverProvider(uri);
  }

  private createCompletionProvider(uri: string): CompletionProvider {
    return this.providerFactory.createCompletionProvider(uri);
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
    return this.providerFactory.provideCbsCompletionItems(params, cancellationToken);
  }

  private registerCompletionHandler(): void {
    this.completionRegistrar.registerCompletionHandler();
  }

  private registerCompletionResolveHandler(): void {
    this.completionRegistrar.registerCompletionResolveHandler();
  }

  private registerDefinitionHandler(): void {
    this.definitionRegistrar.register();
  }

  private registerDocumentHighlightHandler(): void {
    this.documentHighlightRegistrar.register();
  }

  private registerDocumentSymbolHandler(): void {
    this.documentSymbolRegistrar.register();
  }

  private registerHoverHandler(): void {
    this.hoverRegistrar.register();
  }

  private registerPrepareRenameHandler(): void {
    this.renameRegistrar.registerPrepareRenameHandler();
  }

  private registerReferencesHandler(): void {
    this.referencesRegistrar.register();
  }

  private registerRenameHandler(): void {
    this.renameRegistrar.registerRenameHandler();
  }

  private registerSignatureHelpHandler(): void {
    this.signatureHelpRegistrar.register();
  }

  private preserveCompatibilityWrapperSeams(): void {
    void this.registerCompletionHandler;
    void this.registerCompletionResolveHandler;
    void this.registerDefinitionHandler;
    void this.registerDocumentHighlightHandler;
    void this.registerDocumentSymbolHandler;
    void this.registerHoverHandler;
    void this.registerPrepareRenameHandler;
    void this.registerReferencesHandler;
    void this.registerRenameHandler;
    void this.registerSignatureHelpHandler;
  }
}
