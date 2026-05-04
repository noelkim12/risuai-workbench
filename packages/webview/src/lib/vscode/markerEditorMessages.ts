/**
 * Root Marker Editor webview outbound message helpers.
 * @file packages/webview/src/lib/vscode/markerEditorMessages.ts
 */

import {
  MARKER_EDITOR_PROTOCOL,
  MARKER_EDITOR_PROTOCOL_VERSION,
  type MarkerEditorSelectImageMessage,
  type MarkerEditorWebviewMessage,
} from '../types';
import type {
  MarkerEditorResetRequestPayload,
  MarkerEditorSavePayload,
  MarkerEditorSelectImagePayload,
} from '../types/markerEditor';

/**
 * createMarkerEditorSaveMessage 함수.
 * Marker field save 요청을 extension host가 처리할 versioned message로 생성함.
 *
 * @param payload - 저장할 marker URI, editor mode, 변경 field 값
 * @returns Marker Editor save request message
 */
export function createMarkerEditorSaveMessage(payload: MarkerEditorSavePayload): MarkerEditorWebviewMessage {
  return {
    protocol: MARKER_EDITOR_PROTOCOL,
    version: MARKER_EDITOR_PROTOCOL_VERSION,
    type: 'marker-editor/save',
    payload,
  };
}

/**
 * createMarkerEditorResetMessage 함수.
 * Marker editor reset 요청을 extension host가 처리할 versioned message로 생성함.
 *
 * @param payload - reset 대상 marker URI와 editor mode
 * @returns Marker Editor reset request message
 */
export function createMarkerEditorResetMessage(payload: MarkerEditorResetRequestPayload): MarkerEditorWebviewMessage {
  return {
    protocol: MARKER_EDITOR_PROTOCOL,
    version: MARKER_EDITOR_PROTOCOL_VERSION,
    type: 'marker-editor/reset',
    payload,
  };
}

/**
 * createMarkerEditorSelectImageMessage 함수.
 * Image picker open 요청을 extension host가 처리할 versioned message로 생성함.
 *
 * @param payload - image 선택 기준이 되는 marker/root URI와 editor mode
 * @returns Marker Editor select image request message
 */
export function createMarkerEditorSelectImageMessage(
  payload: MarkerEditorSelectImagePayload,
): MarkerEditorSelectImageMessage {
  return {
    protocol: MARKER_EDITOR_PROTOCOL,
    version: MARKER_EDITOR_PROTOCOL_VERSION,
    type: 'marker-editor/selectImage',
    payload,
  };
}
