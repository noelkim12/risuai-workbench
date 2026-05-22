/**
 * Lorebook authoring UI descriptors and pure helpers.
 * @file packages/webview/src/lib/components/editor/lorebook/lorebookAuthoringTypes.ts
 */

import type { LorebookEditorState } from 'risu-workbench-core';

export type LorebookTextFieldKey =
  | 'name'
  | 'comment'
  | 'mode'
  | 'insertion_order'
  | 'activation_percent'
  | 'id'
  | 'book_version';

export type LorebookBooleanFieldKey = 'constant' | 'selective' | 'case_sensitive' | 'use_regex';

export interface LorebookTextFieldDescriptor {
  key: LorebookTextFieldKey;
  label: string;
  inputKind: 'text' | 'select';
  options?: readonly string[];
}

export interface LorebookBooleanFieldDescriptor {
  key: LorebookBooleanFieldKey;
  label: string;
}

export interface CbsSnippetVariant {
  label: string;
  insertText: string;
  cursorOffset: number;
}

export interface CbsSnippetGroup {
  id: string;
  label: string;
  variants: readonly CbsSnippetVariant[];
}

export interface LorebookSummary {
  title: string;
  mode: string;
  keyCount: number;
  secondaryKeyCount: number;
  booleanBadges: string[];
}

export interface LorebookSummaryInput {
  frontmatter: LorebookEditorState['frontmatter'];
  keysText: string;
  secondaryKeysText: string;
}

export const LOREBOOK_TEXT_FIELDS: readonly LorebookTextFieldDescriptor[] = [
  { key: 'name', label: 'Name', inputKind: 'text' },
  { key: 'comment', label: 'Comment', inputKind: 'text' },
  { key: 'mode', label: 'Mode', inputKind: 'select', options: ['normal', 'constant', 'selective'] },
  { key: 'insertion_order', label: 'Insertion order', inputKind: 'text' },
  // { key: 'activation_percent', label: 'Activation percent', inputKind: 'text' },
  // { key: 'id', label: 'ID', inputKind: 'text' },
  // { key: 'book_version', label: 'Book version', inputKind: 'text' },
];

export const LOREBOOK_BOOLEAN_FIELDS: readonly LorebookBooleanFieldDescriptor[] = [
  { key: 'constant', label: 'Constant' },
  { key: 'selective', label: 'Selective' },
  { key: 'case_sensitive', label: 'Case sensitive' },
  { key: 'use_regex', label: 'Use regex' },
];

export const CBS_SNIPPET_GROUPS: readonly CbsSnippetGroup[] = [
  {
    id: 'variables',
    label: 'Variables',
    variants: [
      { label: '변수 읽기 · getvar', insertText: '{{getvar::variable_name}}', cursorOffset: -2 },
      {
        label: '변수 쓰기 · setvar',
        insertText: '{{setvar::variable_name::value}}',
        cursorOffset: -2,
      },
    ],
  },
  {
    id: 'flow',
    label: 'Flow',
    variants: [
      {
        label: '조건 분기 · #if',
        insertText: '{{#if condition}}\n  content\n{{/if}}',
        cursorOffset: -16,
      },
      {
        label: '반복 · #each',
        insertText: '{{#each items item}}\n  {{slot::item}}\n{{/each}}',
        cursorOffset: -25,
      },
    ],
  },
  {
    id: 'utility',
    label: 'Utility',
    variants: [
      { label: '수식 계산 · calc', insertText: '{{calc::1+1}}', cursorOffset: -2 },
      { label: '현재 슬롯 사용 · slot', insertText: '{{slot}}', cursorOffset: 0 },
    ],
  },
];

/**
 * normalizeLineSeparatedKeys 함수.
 * textarea 원문을 줄 단위 key 목록으로 정규화함.
 *
 * @param value - 사용자가 입력한 line-separated key 텍스트
 * @returns 빈 줄과 주변 공백을 제거한 key 배열
 */
export function normalizeLineSeparatedKeys(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * buildLorebookSummary 함수.
 * 접힌 frontmatter bar에 표시할 핵심 metadata를 계산함.
 *
 * @param input - lorebook state 중 summary에 필요한 필드
 * @returns title/mode/key count/badge로 구성된 summary
 */
export function buildLorebookSummary(input: LorebookSummaryInput): LorebookSummary {
  const title = input.frontmatter.name?.trim() || 'Untitled lorebook';
  const mode = input.frontmatter.mode?.trim() || 'normal';
  const booleanBadges = LOREBOOK_BOOLEAN_FIELDS.filter(
    (field) => input.frontmatter[field.key] === 'true',
  ).map((field) => field.key);

  return {
    title,
    mode,
    keyCount: normalizeLineSeparatedKeys(input.keysText).length,
    secondaryKeyCount: normalizeLineSeparatedKeys(input.secondaryKeysText).length,
    booleanBadges,
  };
}
