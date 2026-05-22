/**
 * Main Editor 리팩토링 Phase 0에서 현재 parser/serializer 동작을 고정하는 golden fixture 모음.
 * @file packages/core/tests/editor/editor-golden-fixtures.ts
 */

import type { MainEditorFormatKind } from '../../src/domain/editor';

export interface EditorGoldenFixture {
  id: string;
  formatKind: MainEditorFormatKind;
  description: string;
  source: string;
  expectedWarningCodes: string[];
  expectedCanRoundTrip: boolean;
}

/**
 * joinLf 함수.
 * LF line ending fixture source를 만듦.
 *
 * @param lines - fixture를 구성할 source line 목록
 * @returns LF로 이어 붙인 source text
 */
function joinLf(lines: string[]): string {
  return lines.join('\n');
}

/**
 * joinCrlf 함수.
 * CRLF line ending fixture source를 만듦.
 *
 * @param lines - fixture를 구성할 source line 목록
 * @returns CRLF로 이어 붙인 source text
 */
function joinCrlf(lines: string[]): string {
  return lines.join('\r\n');
}

export const EDITOR_GOLDEN_FIXTURES: EditorGoldenFixture[] = [
  {
    id: 'lorebook-basic-lf-final-newline',
    formatKind: 'lorebook',
    description: 'Editable lorebook entry with all primary sections and LF final newline.',
    expectedWarningCodes: [],
    expectedCanRoundTrip: true,
    source: joinLf([
      '---',
      'name: Basic Lorebook',
      'mode: normal',
      'constant: false',
      'selective: false',
      'insertion_order: 1',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'alpha',
      '@@@ CONTENT',
      'Hello {{user}}.',
      '',
    ]),
  },
  {
    id: 'lorebook-crlf-final-newline',
    formatKind: 'lorebook',
    description: 'Lorebook source with CRLF line endings and final newline.',
    expectedWarningCodes: [],
    expectedCanRoundTrip: true,
    source: joinCrlf([
      '---',
      'name: CRLF Lorebook',
      'mode: normal',
      'constant: false',
      'selective: false',
      'insertion_order: 2',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'windows',
      '@@@ CONTENT',
      'Line ending stays CRLF.',
      '',
    ]),
  },
  {
    id: 'lorebook-duplicate-content-current-behavior',
    formatKind: 'lorebook',
    description: 'Current behavior: duplicate CONTENT warns and the last CONTENT value is selected in state.',
    expectedWarningCodes: ['duplicate-section'],
    expectedCanRoundTrip: false,
    source: joinLf(['---', 'name: Duplicate Lorebook', '---', '@@@ KEYS', 'alpha', '@@@ CONTENT', 'first', '@@@ CONTENT', 'last']),
  },
  {
    id: 'lorebook-unsupported-frontmatter-current-behavior',
    formatKind: 'lorebook',
    description: 'Current behavior: unsupported lorebook frontmatter warns but can still round-trip.',
    expectedWarningCodes: ['unsupported-frontmatter-field'],
    expectedCanRoundTrip: true,
    source: joinLf(['---', 'name: Unknown Field', 'advanced_keep: preserved', '---', '@@@ KEYS', 'alpha', '@@@ CONTENT', 'Body']),
  },
  {
    id: 'regex-basic-lf-final-newline',
    formatKind: 'regex',
    description: 'Editable regex skeleton with IN and OUT sections.',
    expectedWarningCodes: [],
    expectedCanRoundTrip: true,
    source: joinLf(['---', 'comment: Rule', 'type: editdisplay', 'flag: g', '---', '@@@ IN', 'A', '@@@ OUT', 'B', '']),
  },
  {
    id: 'regex-duplicate-in-current-behavior',
    formatKind: 'regex',
    description: 'Current behavior: duplicate IN warns and the last IN value is selected in state.',
    expectedWarningCodes: ['duplicate-section'],
    expectedCanRoundTrip: false,
    source: joinLf(['---', 'comment: Duplicate Rule', '---', '@@@ IN', 'first', '@@@ IN', 'last', '@@@ OUT', 'B']),
  },
  {
    id: 'prompt-authornote-basic',
    formatKind: 'prompt',
    description: 'Authornote prompt with supported INNER_FORMAT and DEFAULT_TEXT sections.',
    expectedWarningCodes: [],
    expectedCanRoundTrip: true,
    source: joinLf(['---', 'type: authornote', 'name: Note', '---', '@@@ INNER_FORMAT', 'Inner', '@@@ DEFAULT_TEXT', 'Default', '']),
  },
  {
    id: 'prompt-forbidden-section-current-behavior',
    formatKind: 'prompt',
    description: 'Current behavior: unsupported prompt section blocks serializer and raw source is returned.',
    expectedWarningCodes: ['unsupported-section'],
    expectedCanRoundTrip: false,
    source: joinLf(['---', 'type: authornote', '---', '@@@ INNER_FORMAT', 'Inner', '@@@ EXTRA', 'keep']),
  },
  {
    id: 'html-identity',
    formatKind: 'html',
    description: 'HTML format is a full-file identity document model.',
    expectedWarningCodes: [],
    expectedCanRoundTrip: true,
    source: '<main>{{user}}</main>\n',
  },
];
