/**
 * completion과 completion resolve handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/CompletionRegistrar.ts
 */

import {
  type CancellationToken,
  type CompletionItem,
  type CompletionList,
  type CompletionParams,
  type Connection,
} from 'vscode-languageserver/node';

import type { CompletionProvider, UnresolvedCompletionItem } from '../../../features/completion';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import { logFeature, traceFeatureResult } from '../../../utils/server-tracing';
import type { LuaLsFallbackService } from '../lua/LuaLsFallbackService';
import type { ServerFeatureRegistrarContext } from '../types';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface CompletionRegistrarContext {
  connection: Connection;
  createCompletionProvider: (uri: string) => CompletionProvider;
  luaLsFallbackService: LuaLsFallbackService;
  luaLsProxy: ServerFeatureRegistrarContext['luaLsProxy'];
  provideCbsCompletionItems: (params: CompletionParams, cancellationToken?: CancellationToken) => CompletionItem[];
  requestRunner: RequestHandlerRunner;
}

/**
 * CompletionRegistrar 클래스.
 * completion과 completionResolve registration을 server helper에서 분리함.
 */
export class CompletionRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly createCompletionProvider: CompletionRegistrarContext['createCompletionProvider'];
  private readonly luaLsFallbackService: LuaLsFallbackService;
  private readonly luaLsProxy: ServerFeatureRegistrarContext['luaLsProxy'];
  private readonly provideCbsCompletionItems: CompletionRegistrarContext['provideCbsCompletionItems'];
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * completion handler 등록에 필요한 의존성과 provider seam을 보관함.
   *
   * @param context - completion registrar 의존성 모음
   */
  constructor(context: CompletionRegistrarContext) {
    this.connection = context.connection;
    this.createCompletionProvider = context.createCompletionProvider;
    this.luaLsFallbackService = context.luaLsFallbackService;
    this.luaLsProxy = context.luaLsProxy;
    this.provideCbsCompletionItems = context.provideCbsCompletionItems;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * completion과 completionResolve handler를 기존 순서대로 등록함.
   */
  register(): void {
    this.registerCompletionHandler();
    this.registerCompletionResolveHandler();
  }

  /**
   * registerCompletionHandler 함수.
   * textDocument/completion handler만 등록함.
   */
  registerCompletionHandler(): void {
    this.connection.onCompletion((params: CompletionParams, cancellationToken) => {
      const route = this.luaLsFallbackService.resolveRoute(params.textDocument.uri);
      logFeature(this.connection, 'completion', 'start', {
        uri: params.textDocument.uri,
        routedToLuaLs: route.routedToLuaLs,
        luaProxySkipped: route.skipLuaLsProxy,
      });

      if (route.routedToLuaLs) {
        let luaCompletionDurationMs = 0;
        return this.requestRunner.runAsync<CompletionParams, CompletionItem[] | CompletionList>({
          empty: [],
          feature: 'completion',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: async () => this.luaLsFallbackService.provideCompletionWithFallback(
            params,
            route,
            cancellationToken,
            (durationMs) => {
              luaCompletionDurationMs = durationMs;
            },
          ),
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
              source: route.sourceLabel('luaProxy'),
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

  /**
   * registerCompletionResolveHandler 함수.
   * completionItem/resolve handler만 등록함.
   */
  registerCompletionResolveHandler(): void {
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
}
