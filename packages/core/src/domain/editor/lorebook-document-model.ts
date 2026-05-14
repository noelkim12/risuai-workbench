/**
 * `.risulorebook` 문서를 구조화 편집 상태로 파싱하고 다시 원문으로 조립하는 모델 유틸입니다.
 * @file packages/core/src/domain/editor/lorebook-document-model.ts
 */

import type { EditorDocumentModel, EditorDocumentWarning, EditorFrontmatterField, LorebookEditorState } from './document-model-types';
import { scanEditorDocumentSections } from './section-scanner';

const LOREBOOK_FRONTMATTER_FIELDS = new Set([
  'name',
  'comment',
  'mode',
  'constant',
  'selective',
  'insertion_order',
  'case_sensitive',
  'use_regex',
  'folder',
  'extensions',
  'book_version',
  'activation_percent',
  'id',
]);

const LOREBOOK_REQUIRED_SECTIONS = ['KEYS', 'CONTENT'] as const;

/**
 * parseLorebookEditorDocument 함수.
 * `.risulorebook` 원문을 Main Editor가 다루는 frontmatter, keys, content 상태로 분해합니다.
 *
 * @param source - section-scanner가 marker와 range를 계산할 `.risulorebook` 전체 원문입니다.
 * @returns range, warning, 구조화 상태를 포함한 lorebook editor model을 반환합니다.
 */
export function parseLorebookEditorDocument(source: string): EditorDocumentModel<LorebookEditorState> {
  const scanned = scanEditorDocumentSections(source, {
    knownSections: ['KEYS', 'SECONDARY_KEYS', 'CONTENT'],
  });
  const warnings = [...scanned.warnings];
  const firstSections = new Map(scanned.sections.map((section) => [section.name, section]));
  for (const requiredSection of LOREBOOK_REQUIRED_SECTIONS) {
    if (!firstSections.has(requiredSection)) {
      warnings.push({
        code: 'missing-section',
        severity: 'error',
        message: `.risulorebook requires @@@ ${requiredSection}.`,
        range: { startOffset: source.length, endOffset: source.length },
        sectionName: requiredSection,
      });
    }
  }

  const frontmatterFields = scanned.frontmatter?.fields ?? [];
  const unknownFrontmatter = frontmatterFields.filter((field) => !LOREBOOK_FRONTMATTER_FIELDS.has(field.key));
  warnings.push(...unknownFrontmatter.map(createUnsupportedFrontmatterWarning));

  return {
    formatKind: 'lorebook',
    source,
    lineEnding: scanned.lineEnding,
    hasFinalNewline: scanned.hasFinalNewline,
    frontmatter: scanned.frontmatter,
    sections: scanned.sections,
    warnings,
    state: {
      frontmatter: Object.fromEntries(frontmatterFields.map((field) => [field.key, field.value])),
      unknownFrontmatter,
      keysText: firstSections.get('KEYS')?.normalizedContent ?? '',
      secondaryKeysText: firstSections.get('SECONDARY_KEYS')?.normalizedContent ?? '',
      contentText: firstSections.get('CONTENT')?.normalizedContent ?? '',
      hasSecondaryKeysSection: firstSections.has('SECONDARY_KEYS'),
    },
  };
}

/**
 * reassembleLorebookEditorDocument 함수.
 * lorebook 편집 상태를 marker 순서가 안정적인 `.risulorebook` 원문으로 재조립합니다.
 *
 * @param model - 기존 줄바꿈, final newline, 구조 경고를 보존하기 위한 lorebook editor model입니다.
 * @param state - 사용자가 편집한 frontmatter와 section 본문을 반영할 다음 상태입니다.
 * @returns 안전하게 재조립된 `.risulorebook` 원문을 반환합니다.
 */
export function reassembleLorebookEditorDocument(
  model: EditorDocumentModel<LorebookEditorState>,
  state: LorebookEditorState,
): string {
  if (hasUnsafeStructuralWarning(model)) {
    return model.source;
  }

  const lineEnding = model.lineEnding;
  const frontmatterLines = [...(model.frontmatter?.fields ?? [])].map(
    (field) => `${field.key}: ${state.frontmatter[field.key] ?? field.value}`,
  );
  for (const [key, value] of Object.entries(state.frontmatter)) {
    if (!frontmatterLines.some((line) => line.startsWith(`${key}:`))) {
      frontmatterLines.push(`${key}: ${value}`);
    }
  }

  const lines = [
    '---',
    ...frontmatterLines,
    '---',
    '@@@ KEYS',
    state.keysText,
    ...(state.hasSecondaryKeysSection ? ['@@@ SECONDARY_KEYS', state.secondaryKeysText] : []),
    '@@@ CONTENT',
    state.contentText,
  ];
  const joined = lines.join(lineEnding);
  return model.hasFinalNewline && !joined.endsWith(lineEnding) ? `${joined}${lineEnding}` : joined;
}

/**
 * createUnsupportedFrontmatterWarning 함수.
 * 구조화 UI가 노출하지 않는 lorebook frontmatter field를 보존 경고로 변환합니다.
 *
 * @param field - 사용자에게 위치와 field 이름을 알려야 하는 원본 frontmatter field입니다.
 * @returns editor warning 목록에 추가할 unsupported frontmatter warning을 반환합니다.
 */
function createUnsupportedFrontmatterWarning(field: EditorFrontmatterField): EditorDocumentWarning {
  return {
    code: 'unsupported-frontmatter-field',
    severity: 'warning',
    message: `Frontmatter field "${field.key}" is not exposed by the Phase 2 structured editor and will be preserved as raw text.`,
    range: field.range,
    fieldName: field.key,
  };
}

/**
 * hasUnsafeStructuralWarning 함수.
 * 자동 재조립이 원문 구조를 손상할 수 있는 경고가 있는지 확인합니다.
 *
 * @param model - 재조립 전에 error와 비보존 warning을 검사할 lorebook editor model입니다.
 * @returns 원문을 그대로 돌려야 하는 위험 경고가 있으면 true를 반환합니다.
 */
function hasUnsafeStructuralWarning(model: EditorDocumentModel<LorebookEditorState>): boolean {
  return model.warnings.some(
    (warning) => warning.severity === 'error' || warning.code !== 'unsupported-frontmatter-field',
  );
}
