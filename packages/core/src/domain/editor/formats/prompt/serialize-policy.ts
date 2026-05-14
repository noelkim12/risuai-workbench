/**
 * `.risuprompt` 직렬화 정책 — warning이 하나라도 있으면 재조립을 차단.
 * @file packages/core/src/domain/editor/formats/prompt/serialize-policy.ts
 */

import type { EditorDocumentModel, PromptEditorState } from '../../document-model/types';

/**
 * canSerializePromptModel 함수.
 * prompt editor model의 warning 목록이 비어 있을 때만 직렬화를 허용함.
 * `unsupported-section`, `duplicate-section` 등 어떤 warning이든 재조립을 차단함.
 *
 * @param model - 직렬화 전에 warning 정책을 검사할 prompt editor model
 * @returns warning이 없어 재조립이 안전하면 true, 원문을 그대로 반환해야 하면 false
 */
export function canSerializePromptModel(model: EditorDocumentModel<PromptEditorState>): boolean {
  return model.warnings.length === 0;
}
