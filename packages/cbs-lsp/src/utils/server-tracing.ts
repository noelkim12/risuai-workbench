/**
 * cbs-lsp server feature trace helpers.
 * @file packages/cbs-lsp/src/server-tracing.ts
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Connection } from 'vscode-languageserver/node';

import type { CbsLspLogLevel } from '../config/runtime-config';

/**
 * CbsLspFeatureName 타입.
 * cbs-lsp server trace/log에서 쓰는 feature scope 이름을 고정함.
 */
export type CbsLspFeatureName =
  | 'server'
  | 'workspace'
  | 'lua'
  | 'luaProxy'
  | 'diagnostics'
  | 'codeAction'
  | 'codeActionResolve'
  | 'codelens'
  | 'completion'
  | 'completionResolve'
  | 'documentSymbol'
  | 'documentHighlight'
  | 'formatting'
  | 'rangeFormatting'
  | 'formattingOnType'
  | 'definition'
  | 'references'
  | 'rename'
  | 'hover'
  | 'inlayHint'
  | 'selectionRange'
  | 'signature'
  | 'folding'
  | 'semanticTokens'
  | 'semanticTokensRange'
  | 'workspaceSymbol';

/**
 * FeatureTraceDetails 타입.
 * key=value trace에 붙일 경량 메타데이터 필드를 표현함.
 */
export interface FeatureTraceDetails {
  uri?: string;
  version?: number | string | null;
  [key: string]: number | string | boolean | null | undefined;
}

/**
 * FeatureTracePayload 타입.
 * stable JSON trace로 직렬화할 structured payload를 나타냄.
 */
export type FeatureTracePayload = unknown;

const LOG_LEVEL_RANK: Record<CbsLspLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

let currentServerLogLevel: CbsLspLogLevel = 'debug';
let currentTimelineLogPath: string | null = null;

/**
 * configureServerTimelineLog 함수.
 * request/feature 흐름을 JSONL 파일로 남길 durable timeline 경로를 설정함.
 *
 * @param filePath - timeline JSONL 파일 경로, 비어 있으면 파일 로그 비활성화
 */
export function configureServerTimelineLog(filePath: string | null | undefined): void {
  const normalized = typeof filePath === 'string' ? filePath.trim() : '';
  currentTimelineLogPath = normalized.length > 0 ? normalized : null;
}

/**
 * configureServerTracing 함수.
 * server trace/log helper가 따를 현재 log level gate를 갱신함.
 *
 * @param logLevel - 이후 trace/log emission 판단에 사용할 runtime log level
 */
export function configureServerTracing(logLevel: CbsLspLogLevel): void {
  currentServerLogLevel = logLevel;
}

/**
 * appendTimelineEntry 함수.
 * Output/tracer와 같은 feature event를 append-only JSONL timeline에 기록함.
 *
 * @param level - timeline event level
 * @param feature - 기능 이름
 * @param phase - feature 내부 phase 이름
 * @param details - 선택적 상세 정보
 */
function appendTimelineEntry(
  level: 'trace' | 'info' | 'warn',
  feature: CbsLspFeatureName,
  phase: string,
  details?: FeatureTraceDetails,
): void {
  if (!currentTimelineLogPath) {
    return;
  }

  try {
    mkdirSync(path.dirname(currentTimelineLogPath), { recursive: true });
    appendFileSync(
      currentTimelineLogPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        pid: process.pid,
        level,
        feature,
        phase,
        details: details ?? {},
      })}\n`,
      'utf8',
    );
  } catch (error) {
    void error;
    // Timeline logging must never break LSP request handling.
  }
}

/**
 * shouldEmitTrace 함수.
 * 현재 log level에서 verbose trace를 내보낼지 판별함.
 *
 * @returns tracer.log 호출을 허용해야 하면 true
 */
function shouldEmitTrace(): boolean {
  return LOG_LEVEL_RANK[currentServerLogLevel] >= LOG_LEVEL_RANK.debug;
}

/**
 * shouldEmitLog 함수.
 * 현재 log level에서 운영 로그를 내보낼지 판별함.
 *
 * @returns console.log 호출을 허용해야 하면 true
 */
function shouldEmitLog(): boolean {
  return LOG_LEVEL_RANK[currentServerLogLevel] >= LOG_LEVEL_RANK.info;
}

/**
 * shouldEmitWarn 함수.
 * 현재 log level에서 warning 성격 운영 로그를 내보낼지 판별함.
 *
 * @returns console.log 호출을 허용해야 하면 true
 */
function shouldEmitWarn(): boolean {
  return LOG_LEVEL_RANK[currentServerLogLevel] >= LOG_LEVEL_RANK.warn;
}

/**
 * formatFeatureTraceMessage 함수.
 * feature 이름과 phase를 사람이 읽기 쉬운 trace 메시지로 정리함.
 *
 * @param feature - trace를 남길 기능 이름
 * @param phase - 기능 내부 phase 이름
 * @returns 공통 prefix가 포함된 trace 메시지
 */
function formatFeatureTraceMessage(feature: CbsLspFeatureName, phase: string): string {
  return `[cbs-lsp:${feature}] ${phase}`;
}

/**
 * formatFeatureTraceDetails 함수.
 * verbose trace payload를 안정적인 key=value 문자열로 정규화함.
 *
 * @param details - trace에 실을 부가 정보
 * @returns trace verbose 문자열, 내용이 없으면 undefined
 */
function formatFeatureTraceDetails(details?: FeatureTraceDetails): string | undefined {
  if (!details) {
    return undefined;
  }

  const entries = Object.entries(details).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return undefined;
  }

  return entries.map(([key, value]) => `${key}=${String(value)}`).join(' ');
}

/**
 * traceFeature 함수.
 * connection tracer를 통해 feature-scoped trace를 남김.
 *
 * @param connection - 활성 LSP connection
 * @param feature - 기능 이름
 * @param phase - trace phase 이름
 * @param details - 선택적 상세 정보
 */
export function traceFeature(
  connection: Connection,
  feature: CbsLspFeatureName,
  phase: string,
  details?: FeatureTraceDetails,
): void {
  appendTimelineEntry('trace', feature, phase, details);

  if (!shouldEmitTrace()) {
    return;
  }

  connection.tracer.log(
    formatFeatureTraceMessage(feature, phase),
    formatFeatureTraceDetails(details),
  );
}

/**
 * traceFeatureRequest 함수.
 * request 시작/중간 phase를 semantic alias로 분리해 남김.
 *
 * @param connection - 활성 LSP connection
 * @param feature - 기능 이름
 * @param phase - trace phase 이름
 * @param details - 선택적 상세 정보
 */
export function traceFeatureRequest(
  connection: Connection,
  feature: CbsLspFeatureName,
  phase: string,
  details?: FeatureTraceDetails,
): void {
  traceFeature(connection, feature, phase, details);
}

/**
 * traceFeatureResult 함수.
 * request 종료/취소 결과 phase를 semantic alias로 분리해 남김.
 *
 * @param connection - 활성 LSP connection
 * @param feature - 기능 이름
 * @param phase - trace phase 이름
 * @param details - 선택적 상세 정보
 */
export function traceFeatureResult(
  connection: Connection,
  feature: CbsLspFeatureName,
  phase: string,
  details?: FeatureTraceDetails,
): void {
  traceFeature(connection, feature, phase, details);
}

/**
 * stableSerializeFeatureTracePayload 함수.
 * nested payload를 key order가 고정된 JSON 문자열로 직렬화함.
 *
 * @param payload - stable trace로 남길 structured payload
 * @returns key 순서가 고정된 JSON 문자열
 */
function stableSerializeFeatureTracePayload(payload: FeatureTracePayload): string {
  if (payload === null || typeof payload !== 'object') {
    return JSON.stringify(payload);
  }

  if (Array.isArray(payload)) {
    return `[${payload.map((entry) => stableSerializeFeatureTracePayload(entry)).join(',')}]`;
  }

  const entries = Object.entries(payload).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(
      ([key, value]) => `${JSON.stringify(key)}:${stableSerializeFeatureTracePayload(value)}`,
    )
    .join(',')}}`;
}

/**
 * traceFeaturePayload 함수.
 * machine-readable JSON payload를 trace verbose 채널에 고정된 순서로 남김.
 *
 * @param connection - 활성 LSP connection
 * @param feature - 기능 이름
 * @param phase - trace phase 이름
 * @param payload - JSON으로 읽을 수 있는 structured payload
 */
export function traceFeaturePayload(
  connection: Connection,
  feature: CbsLspFeatureName,
  phase: string,
  payload: FeatureTracePayload,
): void {
  if (!shouldEmitTrace()) {
    return;
  }

  connection.tracer.log(
    formatFeatureTraceMessage(feature, phase),
    stableSerializeFeatureTracePayload(payload),
  );
}

/**
 * logFeature 함수.
 * connection console을 통해 feature-scoped 운영 로그를 남김.
 *
 * @param connection - 활성 LSP connection
 * @param feature - 기능 이름
 * @param message - 기록할 운영 메시지
 * @param details - 선택적 상세 정보
 */
export function logFeature(
  connection: Connection,
  feature: CbsLspFeatureName,
  message: string,
  details?: FeatureTraceDetails,
): void {
  appendTimelineEntry('info', feature, message, details);

  if (!shouldEmitLog()) {
    return;
  }

  const verboseDetails = formatFeatureTraceDetails(details);
  const suffix = verboseDetails ? ` ${verboseDetails}` : '';
  connection.console.log(`${formatFeatureTraceMessage(feature, message)}${suffix}`);
}

/**
 * warnFeature 함수.
 * connection console을 통해 warning 성격의 운영 가이드를 남김.
 *
 * @param connection - 활성 LSP connection
 * @param feature - 기능 이름
 * @param message - 기록할 warning/guidance 메시지
 * @param details - 선택적 상세 정보
 */
export function warnFeature(
  connection: Connection,
  feature: CbsLspFeatureName,
  message: string,
  details?: FeatureTraceDetails,
): void {
  appendTimelineEntry('warn', feature, message, details);

  if (!shouldEmitWarn()) {
    return;
  }

  const verboseDetails = formatFeatureTraceDetails(details);
  const suffix = verboseDetails ? ` ${verboseDetails}` : '';
  connection.console.log(`${formatFeatureTraceMessage(feature, message)}${suffix}`);
}
