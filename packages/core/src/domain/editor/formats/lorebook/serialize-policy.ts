/**
 * `.risulorebook` 직렬화 정책 — warning 목록이 재조립을 허용하는지 판별.
 * @file packages/core/src/domain/editor/formats/lorebook/serialize-policy.ts
 */

import type { EditorDocumentModel, LorebookEditorState } from '../../document-model/types';

/**
 * canSerializeLorebookModel 함수.
 * lorebook editor model의 warning 목록이 안전한 재조립을 허용하는지 판별함.
 * error severity warning이 없고 모든 warning이 `unsupported-frontmatter-field`인 경우에만 직렬화를 허용함.
 * `duplicate-section`, `missing-section`, `unsupported-section`, `malformed-frontmatter` 등은 직렬화를 차단함.
 *
 * @param model - 직렬화 전에 warning 정책을 검사할 lorebook editor model
 * @returns 재조립이 안전하면 true, 원문을 그대로 반환해야 하면 false
 */
export function canSerializeLorebookModel(model: EditorDocumentModel<LorebookEditorState>): boolean {
  return !model.warnings.some(
    (warning) => warning.severity === 'error' || warning.code !== 'unsupported-frontmatter-field',
  );
}
