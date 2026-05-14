/**
 * Main editor quick preview bridge.
 * @file packages/vscode/src/editors/mainEditor/mainEditorPreviewBridge.ts
 */

import * as vscode from 'vscode';
import { createLorebookContentPreview } from 'risu-workbench-core';
import type { MainEditorPreviewRequestPayload, MainEditorPreviewResultPayload } from './mainEditorTypes';

/**
 * createMainEditorPreviewResult 함수.
 * webview preview request를 core dry-run preview DTO로 변환함.
 *
 * @param document - canonical TextDocument
 * @param payload - webview preview request
 * @returns webview로 보낼 preview result payload
 */
export function createMainEditorPreviewResult(
  document: vscode.TextDocument,
  payload: MainEditorPreviewRequestPayload,
): MainEditorPreviewResultPayload {
  if (payload.documentUri !== document.uri.toString()) {
    return createStalePreviewResult(document, payload, 'Preview request document URI does not match the open TextDocument.');
  }

  const preview = createLorebookContentPreview(payload.contentText, {});
  return {
    requestId: payload.requestId,
    documentUri: document.uri.toString(),
    documentVersion: document.version,
    contentVersion: payload.contentVersion,
    formatKind: payload.formatKind,
    sectionName: payload.sectionName,
    status: preview.status,
    output: preview.output,
    diagnostics: preview.diagnostics,
    coverageSummary: preview.coverageSummary,
  };
}

function createStalePreviewResult(
  document: vscode.TextDocument,
  payload: MainEditorPreviewRequestPayload,
  message: string,
): MainEditorPreviewResultPayload {
  return {
    requestId: payload.requestId,
    documentUri: document.uri.toString(),
    documentVersion: document.version,
    contentVersion: payload.contentVersion,
    formatKind: payload.formatKind,
    sectionName: payload.sectionName,
    status: 'stale',
    output: '',
    diagnostics: [{ severity: 'warning', message, code: 'staleDocument' }],
    coverageSummary: '0 macros, 0 unknown',
  };
}
