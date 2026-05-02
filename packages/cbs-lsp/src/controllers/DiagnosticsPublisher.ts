/**
 * CBS LSP diagnostics publisher controller.
 * @file packages/cbs-lsp/src/controllers/DiagnosticsPublisher.ts
 */

import type { Connection } from 'vscode-languageserver/node';
import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import type { WorkspaceDiagnosticsState } from '../helpers/server-workspace-helper';
import { resolveRequestForWorkspaceUri } from '../helpers/server-workspace-helper';
import type { LuaLsPublishDiagnosticsEvent } from '../providers/lua/lualsProcess';
import {
  assembleDiagnosticsForRequest,
  type DiagnosticsFallbackTraceStats,
  routeDiagnosticsForDocument,
} from '../utils/diagnostics-router';
import { traceFeatureRequest, traceFeatureResult } from '../utils/server-tracing';

export interface DiagnosticsPublisherOptions {
  connection: Connection;
  documents: TextDocuments<TextDocument>;
  supportsVersion: () => boolean;
}

/**
 * DiagnosticsPublisher 클래스.
 * local diagnostics와 workspace diagnostics를 조립해 LSP publishDiagnostics로 내보냄.
 */
export class DiagnosticsPublisher {
  private readonly connection: Connection;

  private readonly documents: TextDocuments<TextDocument>;

  private readonly supportsVersion: () => boolean;

  /**
   * constructor 함수.
   * diagnostics publish에 필요한 connection/document/version-support 조회 함수를 보관함.
   *
   * @param options - diagnostics publisher 의존성 묶음
   */
  constructor(options: DiagnosticsPublisherOptions) {
    this.connection = options.connection;
    this.documents = options.documents;
    this.supportsVersion = options.supportsVersion;
  }

  /**
   * publish 함수.
   * 지정한 URI의 local/workspace diagnostics를 계산해 publishDiagnostics로 전송함.
   *
   * @param uri - diagnostics를 계산할 대상 문서 URI
   * @param workspaceState - cross-file variable 정보를 제공할 workspace state
   */
  publish(uri: string, workspaceState: WorkspaceDiagnosticsState | null): void {
    const request = resolveRequestForWorkspaceUri(uri, this.documents, workspaceState);
    if (!request) {
      traceFeatureRequest(this.connection, 'diagnostics', 'skip', {
        uri,
        version: null,
        routed: false,
      });
      this.connection.sendDiagnostics({ uri, diagnostics: [] });
      return;
    }

    traceFeatureRequest(this.connection, 'diagnostics', 'start', {
      uri: request.uri,
      version: request.version,
    });

    const localDiagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const fallbackTraceStats: DiagnosticsFallbackTraceStats = {
      attempts: 0,
      hits: 0,
      misses: 0,
      durationMs: 0,
      byCode: {},
    };
    const diagnostics = assembleDiagnosticsForRequest({
      fallbackTraceStats,
      localDiagnostics,
      workspaceVariableFlowService: workspaceState?.variableFlowService ?? null,
      request,
    });

    traceFeatureResult(this.connection, 'diagnostics', 'end', {
      uri: request.uri,
      version: request.version,
      count: diagnostics.length,
      fallbackAttempts: fallbackTraceStats.attempts,
      fallbackHits: fallbackTraceStats.hits,
      fallbackMisses: fallbackTraceStats.misses,
      fallbackDurationMs: Math.round(fallbackTraceStats.durationMs),
      fallbackCodes: JSON.stringify(fallbackTraceStats.byCode),
    });

    this.connection.sendDiagnostics({
      uri: request.uri,
      version:
        this.supportsVersion() && typeof request.version === 'number' ? request.version : undefined,
      diagnostics,
    });
  }

  /**
   * publishLuaDiagnostics 함수.
   * LuaLS sidecar가 보낸 diagnostics notification을 host `.risulua` URI 기준 publishDiagnostics로 승격함.
   *
   * @param payload - mirrored Lua URI를 host URI로 되돌린 Lua diagnostics payload
   */
  publishLuaDiagnostics(payload: LuaLsPublishDiagnosticsEvent): void {
    traceFeatureRequest(this.connection, 'luaProxy', 'diagnostics-start', {
      uri: payload.sourceUri,
      transportUri: payload.transportUri,
      version: payload.version ?? null,
    });
    traceFeatureResult(this.connection, 'luaProxy', 'diagnostics-end', {
      uri: payload.sourceUri,
      transportUri: payload.transportUri,
      count: payload.diagnostics.length,
      version: payload.version ?? null,
    });

    this.connection.sendDiagnostics({
      uri: payload.sourceUri,
      version: this.supportsVersion() && typeof payload.version === 'number' ? payload.version : undefined,
      diagnostics: [...payload.diagnostics],
    });
  }
}
