/**
 * workspace 상태를 반영한 CBS provider 생성 전용 factory.
 * @file packages/cbs-lsp/src/helpers/server/WorkspaceAwareProviderFactory.ts
 */

import { type CancellationToken, type CompletionItem, type CompletionParams } from 'vscode-languageserver/node';

import { fragmentAnalysisService } from '../../core';
import { CompletionProvider } from '../../features/completion';
import { DefinitionProvider } from '../../features/definition';
import { HoverProvider } from '../../features/hover';
import { ReferencesProvider } from '../../features/references';
import { RenameProvider } from '../../features/rename';
import type { WorkspaceAwareProviderFactoryContext } from './types';

/**
 * WorkspaceAwareProviderFactory 클래스.
 * URI별 workspace variable-flow context를 주입한 provider 인스턴스를 만듦.
 */
export class WorkspaceAwareProviderFactory {
  private readonly context: WorkspaceAwareProviderFactoryContext;

  /**
   * constructor 함수.
   * provider 생성에 필요한 registry와 resolver seam을 보관함.
   *
   * @param context - workspace-aware provider 생성에 필요한 의존성 묶음
   */
  constructor(context: WorkspaceAwareProviderFactoryContext) {
    this.context = context;
  }

  /**
   * createDefinitionProvider 함수.
   * 현재 URI workspace context를 반영한 definition provider를 만듦.
   *
   * @param uri - workspace variable-flow context를 조회할 문서 URI
   * @returns definition 요청에 사용할 provider
   */
  createDefinitionProvider(uri: string): DefinitionProvider {
    const workspaceContext = this.context.resolveWorkspaceVariableFlowContext(uri);
    return new DefinitionProvider(this.context.registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.context.resolveRequest(textDocument.uri),
      variableFlowService: workspaceContext?.variableFlowService,
    });
  }

  /**
   * createReferencesProvider 함수.
   * 현재 URI workspace context를 반영한 references provider를 만듦.
   *
   * @param uri - workspace variable-flow context를 조회할 문서 URI
   * @returns references 요청에 사용할 provider
   */
  createReferencesProvider(uri: string): ReferencesProvider {
    const workspaceContext = this.context.resolveWorkspaceVariableFlowContext(uri);
    return new ReferencesProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.context.resolveRequest(textDocument.uri),
      variableFlowService: workspaceContext?.variableFlowService,
    });
  }

  /**
   * createRenameProvider 함수.
   * 현재 URI workspace context와 workspace URI resolver를 반영한 rename provider를 만듦.
   *
   * @param uri - workspace variable-flow context를 조회할 문서 URI
   * @returns rename 요청에 사용할 provider
   */
  createRenameProvider(uri: string): RenameProvider {
    const workspaceContext = this.context.resolveWorkspaceVariableFlowContext(uri);
    return new RenameProvider({
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.context.resolveRequest(textDocument.uri),
      resolveUriRequest: (targetUri) => this.context.resolveWorkspaceRequest(targetUri),
      variableFlowService: workspaceContext?.variableFlowService,
    });
  }

  /**
   * createHoverProvider 함수.
   * workspace snapshot이 있으면 hover provider에 workspace context를 주입함.
   *
   * @param uri - workspace variable-flow context를 조회할 문서 URI
   * @returns hover 요청에 사용할 provider
   */
  createHoverProvider(uri: string): HoverProvider {
    const workspaceContext = this.context.resolveWorkspaceVariableFlowContext(uri);
    if (!workspaceContext) {
      return this.context.hoverProvider;
    }

    return new HoverProvider(this.context.registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.context.resolveRequest(textDocument.uri),
      variableFlowService: workspaceContext.variableFlowService,
      workspaceSnapshot: workspaceContext.workspaceSnapshot,
    });
  }

  /**
   * createCompletionProvider 함수.
   * workspace snapshot이 있으면 completion provider에 workspace context를 주입함.
   *
   * @param uri - workspace variable-flow context를 조회할 문서 URI
   * @returns completion 요청에 사용할 provider
   */
  createCompletionProvider(uri: string): CompletionProvider {
    const workspaceContext = this.context.resolveWorkspaceVariableFlowContext(uri);
    if (!workspaceContext) {
      return this.context.completionProvider;
    }

    return new CompletionProvider(this.context.registry, {
      analysisService: fragmentAnalysisService,
      resolveRequest: ({ textDocument }) => this.context.resolveRequest(textDocument.uri),
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
  provideCbsCompletionItems(params: CompletionParams, cancellationToken?: CancellationToken): CompletionItem[] {
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
}
