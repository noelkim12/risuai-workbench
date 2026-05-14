/**
 * Main editor lazy variable candidate bridge.
 * @file packages/vscode/src/editors/mainEditor/mainEditorVariableCandidatesBridge.ts
 */

import { TextDecoder } from 'node:util';
import * as vscode from 'vscode';
import { parseToggleDefinitions, parseVariableContent } from 'risu-workbench-core';
import type {
  MainEditorVariableCandidatePayload,
  MainEditorVariableCandidatesRequestPayload,
  MainEditorVariableCandidatesResultPayload,
} from './mainEditorTypes';

const WORKSPACE_VARIABLE_GLOB = '**/*.{risuvar,risutoggle}';
const WORKSPACE_VARIABLE_EXCLUDE_GLOB = '**/node_modules/**';
const WORKSPACE_VARIABLE_FILE_LIMIT = 200;
const TEXT_DECODER = new TextDecoder('utf-8');

/**
 * createMainEditorVariableCandidatesResult 함수.
 * Drawer lazy section 요청에 대해 extension-host candidate DTO를 생성함.
 *
 * @param document - canonical TextDocument
 * @param payload - lazy candidate request
 * @returns candidate result; stale/unsupported 상태에서는 안전한 empty fallback을 반환함
 */
export async function createMainEditorVariableCandidatesResult(
  document: vscode.TextDocument,
  payload: MainEditorVariableCandidatesRequestPayload,
): Promise<MainEditorVariableCandidatesResultPayload> {
  if (payload.documentUri !== document.uri.toString() || payload.documentVersion !== document.version) {
    return createVariableCandidatesResult(document, payload, {}, true);
  }

  if (payload.scope !== 'workspace' || !vscode.workspace.workspaceFolders) {
    return createVariableCandidatesResult(document, payload, Object.fromEntries(payload.variableNames.map((name) => [name, []])), false);
  }

  const candidatesByVariable = await collectWorkspaceVariableCandidates(payload.variableNames);
  return createVariableCandidatesResult(document, payload, candidatesByVariable, false);
}

/**
 * collectWorkspaceVariableCandidates 함수.
 * `.risuvar`와 `.risutoggle` 파일을 bounded scan으로 읽어 요청 변수 후보만 수집함.
 *
 * @param variableNames - candidate를 요청한 variable 이름 목록
 * @returns variable별 candidate map
 */
async function collectWorkspaceVariableCandidates(
  variableNames: readonly string[],
): Promise<Record<string, MainEditorVariableCandidatePayload[]>> {
  const requestedNames = new Set(variableNames);
  const candidatesByVariable = Object.fromEntries(variableNames.map((name) => [name, [] as MainEditorVariableCandidatePayload[]]));
  const files = await vscode.workspace.findFiles(
    WORKSPACE_VARIABLE_GLOB,
    WORKSPACE_VARIABLE_EXCLUDE_GLOB,
    WORKSPACE_VARIABLE_FILE_LIMIT,
  );

  for (const file of files) {
    const content = await readWorkspaceTextFile(file);
    if (content === undefined) continue;
    if (file.fsPath.endsWith('.risuvar')) {
      addRisuvarCandidates(candidatesByVariable, requestedNames, content);
    } else if (file.fsPath.endsWith('.risutoggle')) {
      addRisutoggleCandidates(candidatesByVariable, requestedNames, content);
    }
  }

  return candidatesByVariable;
}

/**
 * readWorkspaceTextFile 함수.
 * Workspace file read 실패를 webview로 throw하지 않고 empty fallback으로 낮춤.
 *
 * @param uri - 읽을 workspace 파일 URI
 * @returns UTF-8 text 또는 읽기 실패 시 undefined
 */
async function readWorkspaceTextFile(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return TEXT_DECODER.decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

/**
 * addRisuvarCandidates 함수.
 * `.risuvar` key-value content에서 requested variable 후보를 추가함.
 *
 * @param candidatesByVariable - 누적 candidate map
 * @param requestedNames - requested variable set
 * @param content - `.risuvar` 원문
 */
function addRisuvarCandidates(
  candidatesByVariable: Record<string, MainEditorVariableCandidatePayload[]>,
  requestedNames: ReadonlySet<string>,
  content: string,
): void {
  try {
    const variables = parseVariableContent(content);
    for (const [name, value] of Object.entries(variables)) {
      if (!requestedNames.has(name)) continue;
      candidatesByVariable[name]?.push({ value, source: '.risuvar', label: `${value} · .risuvar` });
    }
  } catch {
    // Parse failures intentionally keep the lazy bridge on safe empty fallback.
  }
}

/**
 * addRisutoggleCandidates 함수.
 * `.risutoggle` definition에서 boolean 후보를 추가함.
 *
 * @param candidatesByVariable - 누적 candidate map
 * @param requestedNames - requested variable set
 * @param content - `.risutoggle` 원문
 */
function addRisutoggleCandidates(
  candidatesByVariable: Record<string, MainEditorVariableCandidatePayload[]>,
  requestedNames: ReadonlySet<string>,
  content: string,
): void {
  try {
    for (const definition of parseToggleDefinitions(content)) {
      for (const name of [definition.name, definition.globalVariableName]) {
        if (!requestedNames.has(name)) continue;
        candidatesByVariable[name]?.push(
          { value: 'true', source: 'toggle', label: 'true · toggle' },
          { value: 'false', source: 'toggle', label: 'false · toggle' },
        );
      }
    }
  } catch {
    // Parse failures intentionally keep the lazy bridge on safe empty fallback.
  }
}

/**
 * createVariableCandidatesResult 함수.
 * Candidate bridge result envelope payload를 생성함.
 *
 * @param document - 현재 canonical TextDocument
 * @param payload - 원본 lazy candidate request
 * @param candidatesByVariable - variable별 candidate map
 * @param stale - stale request 여부
 * @returns candidate result payload
 */
function createVariableCandidatesResult(
  document: vscode.TextDocument,
  payload: MainEditorVariableCandidatesRequestPayload,
  candidatesByVariable: Record<string, MainEditorVariableCandidatePayload[]>,
  stale: boolean,
): MainEditorVariableCandidatesResultPayload {
  return {
    requestId: payload.requestId,
    documentUri: document.uri.toString(),
    documentVersion: document.version,
    contentVersion: payload.contentVersion,
    scope: payload.scope,
    candidatesByVariable,
    stale,
  };
}
