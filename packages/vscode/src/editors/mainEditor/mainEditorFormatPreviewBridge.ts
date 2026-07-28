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
} from '@risuai-workbench/core';
import type {
  HtmlStructuredState,
  MainEditorFormatPreviewRequestPayload,
  MainEditorFormatPreviewResultPayload,
  MainEditorHtmlPreviewContextPayload,
  MainEditorSimulatorProfilePayload,
  MainEditorVariableOverridesPayload,
  PromptStructuredState,
  RegexStructuredState,
} from './mainEditorTypes';
import { createPreviewBaseResultFields } from './shared/bridge-helpers';

/**
 * createMainEditorFormatPreviewResult 함수.
 * structured format preview request를 core regex/prompt/html adapter로 라우팅함.
 *
 * @param document - canonical VS Code TextDocument
 * @param payload - webview format preview request
 * @returns webview에 보낼 format preview result
 */
export async function createMainEditorFormatPreviewResult(
  document: vscode.TextDocument,
  payload: MainEditorFormatPreviewRequestPayload,
  expectedFormatKind?: 'regex' | 'prompt' | 'html' | 'lorebook',
): Promise<MainEditorFormatPreviewResultPayload> {
  if (payload.documentUri !== document.uri.toString()) {
    return createStaleFormatPreviewResult(document, payload, 'Format preview request document URI does not match the open TextDocument.');
  }
  if (expectedFormatKind && payload.formatKind !== expectedFormatKind) {
    return createFormatPreviewErrorResult(document, payload, 'FORMAT_MISMATCH', 'Format preview request format does not match the open document.');
  }

  const variables = createProfileVariableContext(payload.profile, payload.overrides);
  if (payload.formatKind === 'regex') {
    const preview = createRegexMainEditorPreview(toRegexEditorState(payload.state), {
      sampleInput: payload.sampleInput,
      variables,
    });
    const htmlContext = await createHtmlPreviewContext(document, payload.profile);
    return {
      ...toFormatResult(document, payload, preview.output, preview.status, preview.diagnostics, preview.metadata),
      regex: preview.regex,
      ...(htmlContext ? { htmlContext } : {}),
    };
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

async function createHtmlPreviewContext(
  ownerDocument: vscode.TextDocument,
  profile: MainEditorSimulatorProfilePayload | undefined,
): Promise<MainEditorHtmlPreviewContextPayload | undefined> {
  const sourceUris = dedupeStrings([
    ...(profile?.htmlContext.enabledHtmlDocumentUris ?? []),
    ...(await discoverProjectHtmlDocumentUris(ownerDocument.uri)),
  ]);
  if (sourceUris.length === 0) return undefined;

  const sourceHtmlParts: string[] = [];
  for (const sourceUri of sourceUris) {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(sourceUri));
      sourceHtmlParts.push(document.getText());
    } catch {
      // Ignore stale simulator profile HTML context entries; regex preview should still render its own output.
    }
  }
  if (sourceHtmlParts.length === 0) return undefined;

  return {
    sourceUris,
    sourceHtml: sourceHtmlParts.join('\n'),
  };
}

async function discoverProjectHtmlDocumentUris(ownerUri: vscode.Uri): Promise<string[]> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(ownerUri);
  const candidates = await vscode.workspace.findFiles('**/*.risuhtml');
  const workspaceRootPath = workspaceFolder?.uri.fsPath;
  return candidates
    .filter((candidate) => !workspaceRootPath || isSameOrChildPath(candidate.fsPath, workspaceRootPath))
    .sort((left, right) => compareHtmlContextUris(left, right, ownerUri))
    .map((candidate) => candidate.toString());
}

function compareHtmlContextUris(left: vscode.Uri, right: vscode.Uri, ownerUri: vscode.Uri): number {
  return scoreHtmlContextUri(right, ownerUri) - scoreHtmlContextUri(left, ownerUri)
    || (left.fsPath ?? '').localeCompare(right.fsPath ?? '');
}

function scoreHtmlContextUri(candidate: vscode.Uri, ownerUri: vscode.Uri): number {
  const candidatePath = candidate.fsPath ?? '';
  const ownerPath = ownerUri.fsPath ?? '';
  let score = 0;
  if (candidatePath.endsWith('/html/background.risuhtml')) score += 100;
  if (pathDirname(pathDirname(candidatePath)) === pathDirname(pathDirname(ownerPath))) score += 50;
  if (isSameOrChildPath(ownerPath, pathDirname(pathDirname(candidatePath)))) score += 25;
  return score;
}

function isSameOrChildPath(candidatePath: string, parentPath: string): boolean {
  return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}/`);
}

function pathDirname(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index <= 0 ? '' : filePath.slice(0, index);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function createProfileVariableContext(
  profile: MainEditorSimulatorProfilePayload | undefined,
  overrides?: MainEditorVariableOverridesPayload,
) {
  return mergeSimulatorProfileVariables(profile?.variables ?? {}, overrides);
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
    ...createPreviewBaseResultFields(payload, document),
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
    ...createPreviewBaseResultFields(payload, document),
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
    ...createPreviewBaseResultFields(payload, document),
    formatKind: payload.formatKind,
    sectionName: payload.sectionName,
    status: 'stale',
    output: '',
    diagnostics: [{ severity: 'warning', message, code: 'staleDocument' }],
    metadata: { stale: 'true' },
  };
}
