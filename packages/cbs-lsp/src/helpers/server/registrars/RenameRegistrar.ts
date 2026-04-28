/**
 * rename와 prepareRename handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/RenameRegistrar.ts
 */

import {
  type Connection,
  LSPErrorCodes,
  type Range as LSPRange,
  type RenameParams,
  ResponseError,
  type TextDocumentPositionParams,
  type WorkspaceEdit,
} from 'vscode-languageserver/node';

import type { RenameProvider } from '../../../features/navigation';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { LuaLsFallbackService } from '../lua/LuaLsFallbackService';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface RenameRegistrarContext {
  connection: Connection;
  createRenameProvider: (uri: string) => RenameProvider;
  luaLsFallbackService: LuaLsFallbackService;
  requestRunner: RequestHandlerRunner;
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
 * RenameRegistrar 클래스.
 * prepareRename/rename registration과 비-Lua error 변환을 server helper에서 분리함.
 */
export class RenameRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly createRenameProvider: RenameRegistrarContext['createRenameProvider'];
  private readonly luaLsFallbackService: LuaLsFallbackService;
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * rename handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - rename registrar 의존성 모음
   */
  constructor(context: RenameRegistrarContext) {
    this.connection = context.connection;
    this.createRenameProvider = context.createRenameProvider;
    this.luaLsFallbackService = context.luaLsFallbackService;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * prepareRename과 rename handler를 기존 순서대로 등록함.
   */
  register(): void {
    this.registerPrepareRenameHandler();
    this.registerRenameHandler();
  }

  /**
   * registerPrepareRenameHandler 함수.
   * textDocument/prepareRename handler만 등록함.
   */
  registerPrepareRenameHandler(): void {
    this.connection.onPrepareRename((params: TextDocumentPositionParams, cancellationToken) => {
      const route = this.luaLsFallbackService.resolveRoute(params.textDocument.uri);

      if (route.routedToLuaLs) {
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
          run: () => this.luaLsFallbackService.prepareRenameWithFallback(params, route, cancellationToken),
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

  /**
   * registerRenameHandler 함수.
   * textDocument/rename handler만 등록함.
   */
  registerRenameHandler(): void {
    this.connection.onRenameRequest((params: RenameParams, cancellationToken) => {
      const route = this.luaLsFallbackService.resolveRoute(params.textDocument.uri);

      if (route.routedToLuaLs) {
        return this.requestRunner.runAsync<RenameParams, WorkspaceEdit | null>({
          empty: null,
          feature: 'rename',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: () => this.luaLsFallbackService.provideRenameWithFallback(params, route, cancellationToken),
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
}
