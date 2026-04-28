/**
 * code action handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/CodeActionRegistrar.ts
 */

import type { CodeAction, CodeActionParams, Connection } from 'vscode-languageserver/node';

import { type CodeActionProvider, type UnresolvedCodeAction } from '../../../features/codeActions';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface CodeActionRegistrarContext {
  codeActionProvider: CodeActionProvider;
  connection: Connection;
  requestRunner: RequestHandlerRunner;
}

/**
 * CodeActionRegistrar 클래스.
 * codeAction/codeActionResolve registration을 server helper에서 분리함.
 */
export class CodeActionRegistrar implements FeatureRegistrar {
  private readonly codeActionProvider: CodeActionProvider;
  private readonly connection: Connection;
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * code action handler 등록에 필요한 connection/provider/runner를 보관함.
   *
   * @param context - code action registrar 의존성 모음
   */
  constructor(context: CodeActionRegistrarContext) {
    this.codeActionProvider = context.codeActionProvider;
    this.connection = context.connection;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * codeAction과 codeActionResolve handler를 기존 순서대로 등록함.
   */
  register(): void {
    this.registerCodeActionHandler();
    this.registerCodeActionResolveHandler();
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
}
