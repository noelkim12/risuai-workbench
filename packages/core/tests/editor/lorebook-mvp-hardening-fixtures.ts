/**
 * Phase 6 lorebook MVP hardening acceptance fixture corpus.
 * @file packages/core/tests/editor/lorebook-mvp-hardening-fixtures.ts
 */

export interface LorebookMvpHardeningFixture {
  id: string;
  description: string;
  source: string;
  expectedWarningCodes: string[];
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

/**
 * createLargeContentLine 함수.
 * large lorebook smoke fixture의 deterministic CONTENT line을 만듦.
 *
 * @param index - 생성할 line 번호
 * @returns CBS expression을 포함한 CONTENT line
 */
function createLargeContentLine(index: number): string {
  return `Line ${index}: {{#if {{equal::{{getvar::mood}}::calm}}}}calm branch ${index}{{/if}}`;
}

export const LOREBOOK_MVP_HARDENING_FIXTURES: LorebookMvpHardeningFixture[] = [
  {
    id: 'day-editing-entry',
    description: 'Representative editable lorebook entry with unknown frontmatter preserved as advanced metadata.',
    expectedWarningCodes: ['unsupported-frontmatter-field'],
    source: joinLf([
      '---',
      'name: Day Editing Entry',
      'comment: Used for Phase 6 MVP acceptance',
      'mode: normal',
      'constant: false',
      'selective: true',
      'insertion_order: 10',
      'case_sensitive: false',
      'use_regex: false',
      'advanced_keep: preserved',
      '---',
      '@@@ KEYS',
      'alpha',
      'beta',
      '@@@ SECONDARY_KEYS',
      'gamma',
      '@@@ CONTENT',
      'Hello {{user}}. Mood is {{getvar::mood}}.',
      '',
    ]),
  },
  {
    id: 'crlf-entry',
    description: 'CRLF source that must keep CRLF and final newline after structured edits.',
    expectedWarningCodes: [],
    source: joinCrlf([
      '---',
      'name: CRLF Entry',
      'mode: normal',
      'constant: false',
      'selective: false',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'windows',
      '@@@ CONTENT',
      'Line ending must stay CRLF.',
      '',
    ]),
  },
  {
    id: 'folder-entry',
    description: 'Folder lorebook edge case without SECONDARY_KEYS section.',
    expectedWarningCodes: [],
    source: joinLf([
      '---',
      'name: Folder',
      'comment: Folder entry',
      'mode: folder',
      'constant: false',
      'selective: false',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'folder-key',
      '@@@ CONTENT',
      '',
    ]),
  },
  {
    id: 'malformed-preserve-raw',
    description: 'Malformed required section source must preserve raw source during reassembly.',
    expectedWarningCodes: ['missing-section'],
    source: joinLf(['---', 'name: Broken Entry', '---', '@@@ KEYS', 'alpha']),
  },
  {
    id: 'large-entry-smoke',
    description: 'Large deterministic CONTENT smoke fixture for parser/reassembly and handoff size.',
    expectedWarningCodes: [],
    source: joinLf([
      '---',
      'name: Large Entry Smoke',
      'mode: normal',
      'constant: false',
      'selective: true',
      'insertion_order: 999',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'large',
      'stress',
      '@@@ SECONDARY_KEYS',
      'secondary-large',
      '@@@ CONTENT',
      ...Array.from({ length: 1200 }, (_unused, index) => createLargeContentLine(index + 1)),
      '',
    ]),
  },
];
