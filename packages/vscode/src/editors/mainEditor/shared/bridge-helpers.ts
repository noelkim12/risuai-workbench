/**
 * Shared bridge helper functions for main editor document freshness checks
 * and stale/error result base field construction.
 * @file packages/vscode/src/editors/mainEditor/shared/bridge-helpers.ts
 */

import * as vscode from 'vscode';

/**
 * Minimal payload contract for document freshness validation.
 * Bridge request payloads that carry `documentUri` and/or `documentVersion`
 * can satisfy this interface to use the shared freshness helpers.
 */
export interface MainEditorDocumentAwarePayload {
  documentUri: string;
  documentVersion: number;
}

/**
 * Document freshness check result indicating whether a request is still valid.
 */
export type MainEditorDocumentFreshness =
  | { fresh: true }
  | { fresh: false; reason: 'uri-mismatch' | 'version-mismatch' | 'both-mismatch' };

/**
 * Minimal payload contract for request-ID bearing payloads.
 */
export interface MainEditorRequestIdPayload {
  requestId: string;
}

/**
 * Base result fields shared across preview-like bridge result types.
 */
export interface MainEditorPreviewBaseResultFields {
  requestId: string;
  documentUri: string;
  documentVersion: number;
}

/**
 * checkMainEditorDocumentFreshness 함수.
 * Request payload의 documentUri/documentVersion이 현재 TextDocument와 일치하는지 검사함.
 *
 * @param payload - documentUri, documentVersion 필드를 포함한 request payload
 * @param document - 현재 canonical VS Code TextDocument
 * @param options - 검사 순서 제어: `checkVersionFirst`가 true면 version 먼저, 아니면 URI 먼저
 * @returns freshness 검사 결과
 */
export function checkMainEditorDocumentFreshness(
  payload: MainEditorDocumentAwarePayload,
  document: vscode.TextDocument,
  options?: { checkVersionFirst?: boolean },
): MainEditorDocumentFreshness {
  const uriMatch = payload.documentUri === document.uri.toString();
  const versionMatch = payload.documentVersion === document.version;

  if (uriMatch && versionMatch) return { fresh: true };

  if (options?.checkVersionFirst) {
    if (!versionMatch && !uriMatch) return { fresh: false, reason: 'both-mismatch' };
    if (!versionMatch) return { fresh: false, reason: 'version-mismatch' };
    return { fresh: false, reason: 'uri-mismatch' };
  }

  if (!uriMatch && !versionMatch) return { fresh: false, reason: 'both-mismatch' };
  if (!uriMatch) return { fresh: false, reason: 'uri-mismatch' };
  return { fresh: false, reason: 'version-mismatch' };
}

/**
 * createPreviewBaseResultFields 함수.
 * Preview 계열 bridge result에서 공통으로 반복되는 기본 필드를 생성함.
 *
 * @param payload - requestId를 포함한 request payload
 * @param document - 현재 canonical VS Code TextDocument
 * @returns 공통 result 기본 필드 (requestId, documentUri, documentVersion)
 */
export function createPreviewBaseResultFields(
  payload: MainEditorRequestIdPayload,
  document: vscode.TextDocument,
): MainEditorPreviewBaseResultFields {
  return {
    requestId: payload.requestId,
    documentUri: document.uri.toString(),
    documentVersion: document.version,
  };
}
