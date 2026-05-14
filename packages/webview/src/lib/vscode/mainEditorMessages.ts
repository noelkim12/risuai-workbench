/**
 * Main Editor webview outbound message helpers.
 * @file packages/webview/src/lib/vscode/mainEditorMessages.ts
 */

import {
  MAIN_EDITOR_PROTOCOL,
  MAIN_EDITOR_PROTOCOL_VERSION,
  type MainEditorEditMessage,
  type MainEditorFormatPreviewRequestMessage,
  type MainEditorLspCodeLensRequestMessage,
  type MainEditorLspCompletionRequestMessage,
  type MainEditorLspDefinitionRequestMessage,
  type MainEditorLspHoverRequestMessage,
  type MainEditorLspPrepareRenameRequestMessage,
  type MainEditorLspReferencesRequestMessage,
  type MainEditorLspRevealLocationRequestMessage,
  type MainEditorLspRenameRequestMessage,
  type MainEditorLspWorkspaceSymbolsRequestMessage,
  type MainEditorPreviewRequestMessage,
  type MainEditorPreviewRuntimeRequestMessage,
  type MainEditorReadyMessage,
  type MainEditorSimulatorProfileListRequestMessage,
  type MainEditorSimulatorProfileSaveRequestMessage,
  type MainEditorStructuredEditMessage,
  type MainEditorUpdatePreferencesMessage,
  type MainEditorVariableCandidatesRequestMessage,
} from '../types';
import type {
  MainEditorCodeLensRequestPayload,
  MainEditorEditPayload,
  MainEditorFormatPreviewRequestPayload,
  MainEditorLspCompletionRequestPayload,
  MainEditorLspDefinitionRequestPayload,
  MainEditorLspHoverRequestPayload,
  MainEditorPrepareRenameRequestPayload,
  MainEditorPreviewRequestPayload,
  MainEditorPreviewRuntimeRequestPayload,
  MainEditorRevealLocationRequestPayload,
  MainEditorReferencesRequestPayload,
  MainEditorRenameRequestPayload,
  MainEditorSimulatorProfileListRequestPayload,
  MainEditorSimulatorProfileSaveRequestPayload,
  MainEditorStructuredEditPayload,
  MainEditorUpdatePreferencesPayload,
  MainEditorVariableCandidatesRequestPayload,
  MainEditorWorkspaceSymbolsRequestPayload,
} from '../types/mainEditor';

/**
 * createMainEditorReadyMessage 함수.
 * main editor webview가 초기화됐음을 extension host에 알림.
 *
 * @param documentUri - 준비된 custom editor 문서 URI
 * @returns ready message envelope
 */
export function createMainEditorReadyMessage(documentUri: string): MainEditorReadyMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/ready',
    payload: { documentUri },
  };
}

/**
 * createMainEditorEditMessage 함수.
 * debounced raw text edit request를 typed envelope로 감쌈.
 *
 * @param payload - raw edit request payload
 * @returns edit message envelope
 */
export function createMainEditorEditMessage(payload: MainEditorEditPayload): MainEditorEditMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/edit',
    payload,
  };
}

/**
 * createMainEditorStructuredEditMessage 함수.
 * structured state edit request를 typed envelope로 감쌈.
 *
 * @param payload - structured edit request payload
 * @returns structuredEdit message envelope
 */
export function createMainEditorStructuredEditMessage(
  payload: MainEditorStructuredEditPayload,
): MainEditorStructuredEditMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/structuredEdit',
    payload,
  };
}

/**
 * createMainEditorUpdatePreferencesMessage 함수.
 * format-scoped UI preference 변경 요청을 typed envelope로 감쌈.
 *
 * @param payload - preference update payload
 * @returns updatePreferences message envelope
 */
export function createMainEditorUpdatePreferencesMessage(
  payload: MainEditorUpdatePreferencesPayload,
): MainEditorUpdatePreferencesMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/updatePreferences',
    payload,
  };
}

/**
 * createMainEditorLspCompletionRequestMessage 함수.
 * Monaco completion request를 typed envelope로 감쌈.
 *
 * @param payload - completion request payload
 * @returns lspCompletion message envelope
 */
export function createMainEditorLspCompletionRequestMessage(
  payload: MainEditorLspCompletionRequestPayload,
): MainEditorLspCompletionRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspCompletion',
    payload,
  };
}

/**
 * createMainEditorLspHoverRequestMessage 함수.
 * Monaco hover request를 typed envelope로 감쌈.
 *
 * @param payload - hover request payload
 * @returns lspHover message envelope
 */
export function createMainEditorLspHoverRequestMessage(
  payload: MainEditorLspHoverRequestPayload,
): MainEditorLspHoverRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspHover',
    payload,
  };
}

/**
 * createMainEditorLspDefinitionRequestMessage 함수.
 * Monaco definition request를 typed envelope로 감쌈.
 *
 * @param payload - definition request payload
 * @returns lspDefinition message envelope
 */
export function createMainEditorLspDefinitionRequestMessage(
  payload: MainEditorLspDefinitionRequestPayload,
): MainEditorLspDefinitionRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspDefinition',
    payload,
  };
}

/**
 * createMainEditorLspReferencesMessage 함수.
 * Monaco references request를 typed envelope로 감쌈.
 *
 * @param payload - references request payload
 * @returns lspReferences message envelope
 */
export function createMainEditorLspReferencesMessage(
  payload: MainEditorReferencesRequestPayload,
): MainEditorLspReferencesRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspReferences',
    payload,
  };
}

/**
 * createMainEditorLspPrepareRenameMessage 함수.
 * Monaco prepare rename request를 typed envelope로 감쌈.
 *
 * @param payload - prepare rename request payload
 * @returns lspPrepareRename message envelope
 */
export function createMainEditorLspPrepareRenameMessage(
  payload: MainEditorPrepareRenameRequestPayload,
): MainEditorLspPrepareRenameRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspPrepareRename',
    payload,
  };
}

/**
 * createMainEditorLspRenameMessage 함수.
 * Monaco rename request를 typed envelope로 감쌈.
 *
 * @param payload - rename request payload
 * @returns lspRename message envelope
 */
export function createMainEditorLspRenameMessage(payload: MainEditorRenameRequestPayload): MainEditorLspRenameRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspRename',
    payload,
  };
}

/**
 * createMainEditorLspCodeLensMessage 함수.
 * Monaco CodeLens request를 typed envelope로 감쌈.
 *
 * @param payload - CodeLens request payload
 * @returns lspCodeLens message envelope
 */
export function createMainEditorLspCodeLensMessage(payload: MainEditorCodeLensRequestPayload): MainEditorLspCodeLensRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspCodeLens',
    payload,
  };
}

/**
 * createMainEditorLspWorkspaceSymbolsMessage 함수.
 * Workspace symbol search request를 typed envelope로 감쌈.
 *
 * @param payload - workspace symbol request payload
 * @returns lspWorkspaceSymbols message envelope
 */
export function createMainEditorLspWorkspaceSymbolsMessage(
  payload: MainEditorWorkspaceSymbolsRequestPayload,
): MainEditorLspWorkspaceSymbolsRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspWorkspaceSymbols',
    payload,
  };
}

/**
 * createMainEditorLspRevealLocationMessage 함수.
 * Workspace symbol/reference 선택 reveal 요청을 typed envelope로 감쌈.
 *
 * @param payload - reveal location request payload
 * @returns lspRevealLocation message envelope
 */
export function createMainEditorLspRevealLocationMessage(
  payload: MainEditorRevealLocationRequestPayload,
): MainEditorLspRevealLocationRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspRevealLocation',
    payload,
  };
}

/**
 * createMainEditorPreviewRequestMessage 함수.
 * quick preview request를 typed envelope로 감쌈.
 *
 * @param payload - preview request payload
 * @returns previewRequest message envelope
 */
export function createMainEditorPreviewRequestMessage(
  payload: MainEditorPreviewRequestPayload,
): MainEditorPreviewRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/previewRequest',
    payload,
  };
}

/**
 * createMainEditorPreviewRuntimeRequestMessage 함수.
 * variable override가 포함된 runtime preview request를 typed envelope로 감쌈.
 *
 * @param payload - runtime preview request payload
 * @returns previewRuntimeRequest message envelope
 */
export function createMainEditorPreviewRuntimeRequestMessage(
  payload: MainEditorPreviewRuntimeRequestPayload,
): MainEditorPreviewRuntimeRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/previewRuntimeRequest',
    payload,
  };
}

/**
 * createMainEditorFormatPreviewRequestMessage 함수.
 * format preview request를 typed envelope로 감쌈.
 *
 * @param payload - format preview request payload
 * @returns formatPreviewRequest message envelope
 */
export function createMainEditorFormatPreviewRequestMessage(
  payload: MainEditorFormatPreviewRequestPayload,
): MainEditorFormatPreviewRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/formatPreviewRequest',
    payload,
  };
}

/**
 * createMainEditorSimulatorProfileListRequestMessage 함수.
 * simulator profile 목록 요청을 typed envelope로 감쌈.
 *
 * @param payload - profile list request payload
 * @returns simulatorProfileListRequest message envelope
 */
export function createMainEditorSimulatorProfileListRequestMessage(
  payload: MainEditorSimulatorProfileListRequestPayload,
): MainEditorSimulatorProfileListRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/simulatorProfileListRequest',
    payload,
  };
}

/**
 * createMainEditorSimulatorProfileSaveRequestMessage 함수.
 * simulator profile 저장 요청을 typed envelope로 감쌈.
 *
 * @param payload - profile save request payload
 * @returns simulatorProfileSaveRequest message envelope
 */
export function createMainEditorSimulatorProfileSaveRequestMessage(
  payload: MainEditorSimulatorProfileSaveRequestPayload,
): MainEditorSimulatorProfileSaveRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/simulatorProfileSaveRequest',
    payload,
  };
}

/**
 * createMainEditorVariableCandidatesRequestMessage 함수.
 * variable drawer lazy candidate request를 typed envelope로 감쌈.
 *
 * @param payload - lazy candidate request payload
 * @returns variableCandidatesRequest message envelope
 */
export function createMainEditorVariableCandidatesRequestMessage(
  payload: MainEditorVariableCandidatesRequestPayload,
): MainEditorVariableCandidatesRequestMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/variableCandidatesRequest',
    payload,
  };
}
