import { describe, it, expect } from 'vitest';
import { analyzeTextMentions } from './text-mention';

describe('analyzeTextMentions', () => {
  it('should find text mentions for variables and functions >= 3 characters', () => {
    const entries = [{ id: 'entry1', name: 'Entry 1', content: 'This mentions myVar and callMe() function. Short hp.' }];
    const variables = new Set(['myVar', 'hp', 'xx']);
    const functions = new Set(['callMe', 'go']);

    const result = analyzeTextMentions(entries, variables, functions);

    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([
      { sourceEntry: 'entry1', target: 'myVar', type: 'variable-mention' },
      { sourceEntry: 'entry1', target: 'callMe', type: 'lua-mention' },
    ]));
  });

  it('should not match short names (< 3 chars)', () => {
    const entries = [{ id: 'e1', name: 'E1', content: 'hp is too short, ab also' }];
    const result = analyzeTextMentions(entries, new Set(['hp', 'ab']), new Set(['go']));
    expect(result).toHaveLength(0);
  });

  it('should not match substrings within larger words', () => {
    const entries = [{ id: 'e1', name: 'E1', content: 'The myVariable is different from myVar' }];
    const result = analyzeTextMentions(entries, new Set(['myVar']), new Set());
    // 'myVar' appears standalone AND as prefix of 'myVariable'
    // The regex should match standalone 'myVar' at end of string
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ sourceEntry: 'e1', target: 'myVar', type: 'variable-mention' });
  });

  it('should handle Korean/Unicode context', () => {
    const entries = [{ id: 'e1', name: 'E1', content: '이것은 playerHP를 참조합니다' }];
    const result = analyzeTextMentions(entries, new Set(['playerHP']), new Set());
    expect(result).toHaveLength(1);
  });

  it('should skip entries with empty content', () => {
    const entries = [
      { id: 'e1', name: 'E1', content: '' },
      { id: 'e2', name: 'E2', content: 'has playerHP here' },
    ];
    const result = analyzeTextMentions(entries, new Set(['playerHP']), new Set());
    expect(result).toHaveLength(1);
    expect(result[0].sourceEntry).toBe('e2');
  });

  it('should detect mentions across multiple entries', () => {
    const entries = [
      { id: 'e1', name: 'E1', content: 'references foo_bar' },
      { id: 'e2', name: 'E2', content: 'also mentions foo_bar and baz_qux' },
    ];
    const result = analyzeTextMentions(entries, new Set(['foo_bar', 'baz_qux']), new Set());
    expect(result).toHaveLength(3);
  });

  it('should use name as fallback when id is empty', () => {
    const entries = [{ id: '', name: 'FallbackName', content: 'has myFunc call' }];
    const result = analyzeTextMentions(entries, new Set(), new Set(['myFunc']));
    expect(result).toHaveLength(1);
    expect(result[0].sourceEntry).toBe('FallbackName');
  });

  it('should handle regex special characters in names', () => {
    const entries = [{ id: 'e1', name: 'E1', content: 'value is get(x) here' }];
    const result = analyzeTextMentions(entries, new Set(), new Set(['get(x)']));
    expect(result).toHaveLength(1);
  });
});
