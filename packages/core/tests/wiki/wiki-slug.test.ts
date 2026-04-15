import { describe, expect, it } from 'vitest';
import { toWikiSlug } from '@/cli/analyze/shared/wiki/slug';

describe('wiki/slug', () => {
  it('preserves plain Korean names', () => {
    expect(toWikiSlug('강유라')).toBe('강유라');
  });

  it('replaces spaces with underscores', () => {
    expect(toWikiSlug('하루 이토')).toBe('하루_이토');
  });

  it('preserves emoji characters', () => {
    expect(toWikiSlug('🌟 이벤트 반전')).toBe('🌟_이벤트_반전');
  });

  it('strips filesystem-hostile characters', () => {
    expect(toWikiSlug('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });

  it('collapses multiple spaces into one underscore', () => {
    expect(toWikiSlug('a   b')).toBe('a_b');
  });

  it('trims leading and trailing whitespace', () => {
    expect(toWikiSlug('  foo  ')).toBe('foo');
  });

  it('returns "unnamed" for empty input after normalization', () => {
    expect(toWikiSlug('///')).toBe('unnamed');
    expect(toWikiSlug('')).toBe('unnamed');
    expect(toWikiSlug('   ')).toBe('unnamed');
  });
});
