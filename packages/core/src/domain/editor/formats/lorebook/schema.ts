/**
 * Lorebook format의 frontmatter field 이름과 필수 section 이름 schema.
 * @file packages/core/src/domain/editor/formats/lorebook/schema.ts
 */

/** Lorebook frontmatter에서 구조화 UI가 인식하는 field 이름. */
export const LOREBOOK_FRONTMATTER_FIELDS = new Set([
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

/** Lorebook에서 반드시 존재해야 하는 section 이름. */
export const LOREBOOK_REQUIRED_SECTIONS = ['KEYS', 'CONTENT'] as const;

/** Lorebook scanner가 인식하는 section 이름. */
export const LOREBOOK_KNOWN_SECTIONS = ['KEYS', 'SECONDARY_KEYS', 'CONTENT'] as const;
