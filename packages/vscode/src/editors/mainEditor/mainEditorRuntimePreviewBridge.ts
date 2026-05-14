/**
 * Main editor Phase 5 runtime preview bridge.
 * @file packages/vscode/src/editors/mainEditor/mainEditorRuntimePreviewBridge.ts
 */

import * as vscode from 'vscode';
import { createLorebookContentRuntimePreview } from 'risu-workbench-core';
import type { MainEditorPreviewRuntimeRequestPayload, MainEditorPreviewRuntimeResultPayload } from './mainEditorTypes';

/**
 * createMainEditorRuntimePreviewResult 함수.
 * Preview override request를 core runtime preview DTO로 변환함.
 *
 * @param document - canonical VS Code TextDocument
 * @param payload - webview runtime preview request
 * @returns webview에 보낼 Phase 5 runtime preview result
 */
export function createMainEditorRuntimePreviewResult(
  document: vscode.TextDocument,
  payload: MainEditorPreviewRuntimeRequestPayload,
): MainEditorPreviewRuntimeResultPayload {
  if (payload.documentUri !== document.uri.toString()) {
    return createStaleRuntimePreviewResult(document, payload, 'Runtime preview request document URI does not match the open TextDocument.');
  }

  const preview = createLorebookContentRuntimePreview({
    contentText: payload.contentText,
    overrides: payload.overrides,
    executionMode: 'execute',
  });

  return {
    requestId: payload.requestId,
    documentUri: document.uri.toString(),
    documentVersion: document.version,
    contentVersion: payload.contentVersion,
    formatKind: payload.formatKind,
    sectionName: payload.sectionName,
    status: preview.status,
    output: preview.output,
    bindings: preview.bindings,
    warnings: preview.warnings,
    diagnostics: preview.diagnostics,
    effects: preview.effects,
    trace: preview.trace,
    coverageSummary: preview.coverageSummary,
  };
}

/**
 * createStaleRuntimePreviewResult 함수.
 * Runtime preview stale guard 실패를 JSON result DTO로 반환함.
 *
 * @param document - 현재 canonical TextDocument
 * @param payload - stale 처리할 원본 request
 * @param message - stale 이유
 * @returns stale runtime preview result
 */
function createStaleRuntimePreviewResult(
  document: vscode.TextDocument,
  payload: MainEditorPreviewRuntimeRequestPayload,
  message: string,
): MainEditorPreviewRuntimeResultPayload {
  return {
    requestId: payload.requestId,
    documentUri: document.uri.toString(),
    documentVersion: document.version,
    contentVersion: payload.contentVersion,
    formatKind: payload.formatKind,
    sectionName: payload.sectionName,
    status: 'stale',
    output: '',
    bindings: [],
    warnings: [],
    diagnostics: [{ source: 'simulator', severity: 'warning', message, code: 'staleDocument' }],
    effects: [],
    trace: [],
    coverageSummary: '0 macros, 0 unknown',
  };
}
