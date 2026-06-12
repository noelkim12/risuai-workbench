import { describe, expect, it } from 'vitest';
import { analyzeRegexRisks } from '../../../src/simulator/regex/static-analysis';

function codes(pattern: string, flags = 'g'): string[] {
  return analyzeRegexRisks({ pattern, flags, maxPatternLength: 2_000 }).map((finding) => finding.code);
}

describe('analyzeRegexRisks', () => {
  it('flags nested quantifiers', () => {
    expect(codes('(a+)+$')).toContain('NESTED_QUANTIFIER');
  });

  it('returns static alternative suggestions for risk findings', () => {
    const findings = analyzeRegexRisks({ pattern: '(a+)+$', flags: 'g', maxPatternLength: 2_000 });

    expect(findings).toEqual([
      expect.objectContaining({
        code: 'NESTED_QUANTIFIER',
        suggestions: [
          expect.objectContaining({
            title: expect.stringContaining('Flatten'),
            example: expect.stringContaining('a+$'),
          }),
        ],
      }),
    ]);
  });

  it('flags repeated wildcard groups', () => {
    expect(codes('(.*)+')).toContain('REPEATED_WILDCARD');
  });

  it('flags ambiguous alternation under repetition', () => {
    expect(codes('(a|aa)+$')).toContain('AMBIGUOUS_ALTERNATION');
  });

  it('flags greedy dot before a literal suffix', () => {
    expect(codes('.*END')).toContain('GREEDY_DOT_PREFIX');
  });

  it('flags backreferences', () => {
    expect(codes('(\\w+)\\1')).toContain('BACKREFERENCE');
  });

  it('flags global regexes that can match empty strings', () => {
    expect(codes('a*', 'g')).toContain('GLOBAL_EMPTY_MATCH');
  });

  it('returns parse errors as risk findings without throwing', () => {
    const findings = analyzeRegexRisks({ pattern: '(', flags: 'g', maxPatternLength: 2_000 });

    expect(findings).toEqual([
      expect.objectContaining({ code: 'REGEX_PARSE_ERROR', severity: 'error' }),
    ]);
  });

  it('returns length errors as risk findings without throwing', () => {
    const findings = analyzeRegexRisks({ pattern: 'abcd', flags: 'g', maxPatternLength: 3 });

    expect(findings).toEqual([
      expect.objectContaining({ code: 'REGEX_PARSE_ERROR', severity: 'error' }),
    ]);
  });
});
