/**
 * Main editor regex/prompt/html format preview bridge.
 * @file packages/vscode/src/editors/mainEditor/mainEditorFormatPreviewBridge.ts
 */

import * as vscode from 'vscode';
import {
  createHtmlMainEditorPreview,
  createPromptMainEditorPreview,
  createRegexMainEditorPreview,
  mergeSimulatorProfileVariables,
  type HtmlEditorState,
  type PromptEditorState,
  type RegexEditorState,
} from 'risu-workbench-core';
import type {
  HtmlStructuredState,
  MainEditorFormatPreviewRequestPayload,
  MainEditorFormatPreviewResultPayload,
  MainEditorSimulatorProfilePayload,
  PromptStructuredState,
  RegexStructuredState,
} from './mainEditorTypes';

/**
 * createMainEditorFormatPreviewResult 함수.
 * structured format preview request를 core regex/prompt/html adapter로 라우팅함.
 *
 * @param document - canonical VS Code TextDocument
 * @param payload - webview format preview request
 * @returns webview에 보낼 format preview result
 */
export function createMainEditorFormatPreviewResult(
  document: vscode.TextDocument,
  payload: MainEditorFormatPreviewRequestPayload,
  expectedFormatKind?: 'regex' | 'prompt' | 'html' | 'lorebook',
): MainEditorFormatPreviewResultPayload {
  if (payload.documentUri !== document.uri.toString()) {
    return createStaleFormatPreviewResult(document, payload, 'Format preview request document URI does not match the open TextDocument.');
  }
  if (expectedFormatKind && payload.formatKind !== expectedFormatKind) {
    return createFormatPreviewErrorResult(document, payload, 'FORMAT_MISMATCH', 'Format preview request format does not match the open document.');
  }

  const variables = createProfileVariableContext(payload.profile);
  if (payload.formatKind === 'regex') {
    const preview = createRegexMainEditorPreview(toRegexEditorState(payload.state), {
      sampleInput: payload.sampleInput,
      variables,
    });
    return toFormatResult(document, payload, preview.output, preview.status, preview.diagnostics, preview.metadata);
  }
  if (payload.formatKind === 'prompt') {
    const preview = createPromptMainEditorPreview(toPromptEditorState(payload.state), {
      activeSection: payload.sectionName === 'TEXT' || payload.sectionName === 'INNER_FORMAT' || payload.sectionName === 'DEFAULT_TEXT'
        ? payload.sectionName
        : undefined,
      variables,
    });
    return toFormatResult(document, payload, preview.output, preview.status, preview.diagnostics, preview.metadata);
  }

  const preview = createHtmlMainEditorPreview(toHtmlEditorState(payload.state), {
    variables,
    scriptsEnabled: false,
  });
  return toFormatResult(document, payload, preview.output, preview.status, preview.diagnostics, preview.metadata);
}

function createProfileVariableContext(profile: MainEditorSimulatorProfilePayload | undefined) {
  return mergeSimulatorProfileVariables(profile?.variables ?? {});
}

function toRegexEditorState(state: RegexStructuredState | PromptStructuredState | HtmlStructuredState): RegexEditorState {
  if ('inText' in state) {
    return {
      frontmatter: stringifyFrontmatter(state.frontmatter),
      inText: state.inText,
      outText: state.outText,
    };
  }
  return { frontmatter: {}, inText: '', outText: '' };
}

function toPromptEditorState(state: RegexStructuredState | PromptStructuredState | HtmlStructuredState): PromptEditorState {
  if ('sections' in state) {
    return {
      frontmatter: stringifyFrontmatter(state.frontmatter),
      type: state.type,
      sections: state.sections,
    };
  }
  return { frontmatter: {}, type: 'plain', sections: { TEXT: '' } };
}

function toHtmlEditorState(state: RegexStructuredState | PromptStructuredState | HtmlStructuredState): HtmlEditorState {
  return 'contentText' in state ? state : { contentText: '' };
}

function stringifyFrontmatter(frontmatter: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    normalized[key] = value === null ? '' : String(value);
  }
  return normalized;
}

function toFormatResult(
  document: vscode.TextDocument,
  payload: MainEditorFormatPreviewRequestPayload,
  output: string,
  status: 'ok' | 'partial' | 'aborted' | 'error',
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; message: string; code?: string }>,
  metadata: Record<string, string>,
): MainEditorFormatPreviewResultPayload {
  return {
    requestId: payload.requestId,
    documentUri: document.uri.toString(),
    documentVersion: document.version,
    formatKind: payload.formatKind,
    sectionName: payload.sectionName,
    status,
    output,
    diagnostics,
    metadata,
  };
}

function createFormatPreviewErrorResult(
  document: vscode.TextDocument,
  payload: MainEditorFormatPreviewRequestPayload,
  code: string,
  message: string,
): MainEditorFormatPreviewResultPayload {
  return {
    requestId: payload.requestId,
    documentUri: document.uri.toString(),
    documentVersion: document.version,
    formatKind: payload.formatKind,
    sectionName: payload.sectionName,
    status: 'error',
    output: message,
    diagnostics: [{ severity: 'error', message, code }],
    metadata: { error: code },
  };
}

function createStaleFormatPreviewResult(
  document: vscode.TextDocument,
  payload: MainEditorFormatPreviewRequestPayload,
  message: string,
): MainEditorFormatPreviewResultPayload {
  return {
    requestId: payload.requestId,
    documentUri: document.uri.toString(),
    documentVersion: document.version,
    formatKind: payload.formatKind,
    sectionName: payload.sectionName,
    status: 'stale',
    output: '',
    diagnostics: [{ severity: 'warning', message, code: 'staleDocument' }],
    metadata: { stale: 'true' },
  };
}
