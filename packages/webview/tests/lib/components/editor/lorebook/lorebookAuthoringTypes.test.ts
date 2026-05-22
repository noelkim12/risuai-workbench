import { describe, expect, it } from 'vitest';
import {
  CBS_SNIPPET_GROUPS,
  LOREBOOK_BOOLEAN_FIELDS,
  LOREBOOK_TEXT_FIELDS,
  buildLorebookSummary,
  normalizeLineSeparatedKeys,
} from '../../../../../src/lib/components/editor/lorebook/lorebookAuthoringTypes';

describe('lorebook authoring helpers', () => {
  it('normalizes line separated keys without converting them to chips', () => {
    expect(normalizeLineSeparatedKeys(' alpha \n\n beta \r\n gamma ')).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('builds a collapsed summary with key counts and boolean labels', () => {
    const summary = buildLorebookSummary({
      frontmatter: {
        name: 'Memory Entry',
        mode: 'normal',
        constant: 'false',
        selective: 'true',
        case_sensitive: 'false',
        use_regex: 'true',
      },
      keysText: 'alpha\nbeta',
      secondaryKeysText: 'gamma',
    });

    expect(summary.title).toBe('Memory Entry');
    expect(summary.mode).toBe('normal');
    expect(summary.keyCount).toBe(2);
    expect(summary.secondaryKeyCount).toBe(1);
    expect(summary.booleanBadges).toEqual(['selective', 'use_regex']);
  });

  it('keeps exposed field lists stable', () => {
    expect(LOREBOOK_TEXT_FIELDS.map((field) => field.key)).toEqual([
      'name',
      'comment',
      'mode',
      'insertion_order',
    ]);
    expect(LOREBOOK_BOOLEAN_FIELDS.map((field) => field.key)).toEqual([
      'constant',
      'selective',
      'case_sensitive',
      'use_regex',
    ]);
  });

  it('defines intention-first CBS snippet labels', () => {
    expect(CBS_SNIPPET_GROUPS.flatMap((group) => group.variants).map((variant) => variant.label)).toEqual([
      '변수 읽기 · getvar',
      '변수 쓰기 · setvar',
      '조건 분기 · #if',
      '반복 · #each',
      '수식 계산 · calc',
      '현재 슬롯 사용 · slot',
    ]);
  });
});
