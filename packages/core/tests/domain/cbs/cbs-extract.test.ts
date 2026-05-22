import { describe, expect, it } from 'vitest';

import { extractCBSVarOps } from '../../../src/domain';
import { createAstConditionCandidateExtractor } from '../../../src/domain/cbs/condition-candidates';

describe('extractCBSVarOps', () => {
  it('adds getvar names to reads', () => {
    const result = extractCBSVarOps('{{getvar::varName}}');

    expect(Array.from(result.reads).sort()).toEqual(['varName']);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('adds setvar names to writes', () => {
    const result = extractCBSVarOps('{{setvar::varName}}');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual(['varName']);
  });

  it('adds addvar names to writes', () => {
    const result = extractCBSVarOps('{{addvar::varName}}');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual(['varName']);
  });

  it('adds setdefaultvar names to writes', () => {
    const result = extractCBSVarOps('{{setdefaultvar::varName::fallback}}');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual(['varName']);
  });

  it('returns empty read and write sets for an empty string', () => {
    const result = extractCBSVarOps('');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('captures both reads and writes from mixed operations', () => {
    const result = extractCBSVarOps('{{setvar::a}} {{getvar::b}}');

    expect(Array.from(result.reads).sort()).toEqual(['b']);
    expect(Array.from(result.writes).sort()).toEqual(['a']);
  });

  it('ignores getvar without an argument', () => {
    const result = extractCBSVarOps('{{getvar}}');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('collects variable operations from normal block bodies', () => {
    const result = extractCBSVarOps(
      '{{#when::ready}}before {{getvar::inside}} {{setvar::written::1}}{{/}}',
    );

    expect(Array.from(result.reads).sort()).toEqual(['inside']);
    expect(Array.from(result.writes).sort()).toEqual(['written']);
  });

  it('collects getvar reads nested in #if inline math conditions', () => {
    const result = extractCBSVarOps('{{#if {{? {{getvar::ct_Language}} == 1}}}}ok{{/if}}');

    expect(Array.from(result.reads).sort()).toEqual(['ct_Language']);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('collects getglobalvar reads as reads', () => {
    const result = extractCBSVarOps('{{getglobalvar::globalFlag}}');

    expect(Array.from(result.reads).sort()).toEqual(['globalFlag']);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('collects getglobalvar reads nested in #if inline math conditions with hyphen/dot names', () => {
    const result = extractCBSVarOps(
      '{{#if {{? {{getglobalvar::toggle_dialogues_dynamic-gpt-5.4}}=1}}}}ok{{/if}}',
    );

    expect(Array.from(result.reads).sort()).toEqual(['toggle_dialogues_dynamic-gpt-5.4']);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('ignores variable operations that appear inside pure-mode block bodies', () => {
    const result = extractCBSVarOps(
      '{{#escape}}before {{getvar::hidden}} {{setvar::ignored::1}}{{/}} {{getvar::visible}}',
    );

    expect(Array.from(result.reads).sort()).toEqual(['visible']);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('ignores dynamic first arguments', () => {
    const result = extractCBSVarOps(
      '{{getvar::{{user}}}} {{setvar::{{bot}}::1}} {{addvar::{{char}}::2}}',
    );

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('returns best-effort static results without throwing on malformed input', () => {
    expect(() => extractCBSVarOps('{{setvar::safe::1}} {{getvar::')).not.toThrow();

    const result = extractCBSVarOps('{{setvar::safe::1}} {{getvar::');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual(['safe']);
  });
});

describe('createAstConditionCandidateExtractor().extract', () => {
  it('extracts equality comparison values from #if math expressions', () => {
    const result = createAstConditionCandidateExtractor().extract('{{#if {{? {{getvar::lang}} == 1}}}}Korean{{/if}}');
    expect(result).toEqual([{ variableName: 'lang', value: '1' }]);
  });

  it('extracts multiple conditions for the same variable', () => {
    const source = '{{#if {{? {{getvar::vg_Language}} == 1}}}}Korean{{/if}}{{#if {{? {{getvar::vg_Language}} == 3}}}}Japanese{{/if}}';
    const result = createAstConditionCandidateExtractor().extract(source);
    expect(result).toContainEqual({ variableName: 'vg_Language', value: '1' });
    expect(result).toContainEqual({ variableName: 'vg_Language', value: '3' });
  });

  it('extracts getglobalvar comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract('{{#if {{? {{getglobalvar::toggle}} = true}}}}on{{/if}}');
    expect(result).toEqual([{ variableName: 'toggle', value: 'true' }]);
  });

  it('handles reversed literal-on-left comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract('{{#if {{? 5 >= {{getvar::score}}}}}}win{{/if}}');
    expect(result).toEqual([{ variableName: 'score', value: '5' }]);
  });

  it('skips expressions without clear literal side', () => {
    const result = createAstConditionCandidateExtractor().extract('{{#if {{? {{getvar::a}} == {{getvar::b}}}}}}ok{{/if}}');
    expect(result).toEqual([]);
  });

  it('returns empty array for non-conditional text', () => {
    const result = createAstConditionCandidateExtractor().extract('{{getvar::x}} {{setvar::y::1}}');
    expect(result).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(createAstConditionCandidateExtractor().extract('')).toEqual([]);
  });

  it('extracts from parenthesized math expressions', () => {
    const result = createAstConditionCandidateExtractor().extract('{{#if {{? ({{getvar::vg_Choice_Flag}} == 4)}} }}skipped{{/if}}');
    expect(result).toEqual([{ variableName: 'vg_Choice_Flag', value: '4' }]);
  });

  it('does not throw on malformed input', () => {
    expect(() => createAstConditionCandidateExtractor().extract('{{#if {{? {{getvar::x}} == 1')).not.toThrow();
  });

  it('filters out null literal candidates but injects non-null sentinel', () => {
    const result = createAstConditionCandidateExtractor().extract('{{#if {{? {{getvar::vg_FirstKiss}} != null}}}}already kissed{{/if}}');
    expect(result).toEqual([{ variableName: 'vg_FirstKiss', value: '__risu_test_nonnull__' }]);
  });

  it('filters out undefined literal candidates but injects is-null sentinel', () => {
    const result = createAstConditionCandidateExtractor().extract('{{#if {{? {{getvar::x}} == undefined}}}}ok{{/if}}');
    expect(result).toEqual([{ variableName: 'x', value: '__risu_test_isnull__' }]);
  });

  it('preserves non-null candidates alongside null comparisons and injects sentinel', () => {
    const source = '{{#if {{? {{getvar::vg_FirstKiss}} != null}}}}already kissed{{/if}}{{#if {{? {{getvar::vg_FirstKiss}} == 1}}}}first time{{/if}}';
    const result = createAstConditionCandidateExtractor().extract(source);
    expect(result).toContainEqual({ variableName: 'vg_FirstKiss', value: '1' });
    expect(result).toContainEqual({ variableName: 'vg_FirstKiss', value: '__risu_test_nonnull__' });
  });

  it('injects non-null sentinel for != null comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract('{{#if {{? {{getvar::x}} != null}}}}ok{{/if}}');
    expect(result).toContainEqual({ variableName: 'x', value: '__risu_test_nonnull__' });
  });

  it('injects is-null sentinel for == null comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract('{{#if {{? {{getvar::x}} == null}}}}ok{{/if}}');
    expect(result).toContainEqual({ variableName: 'x', value: '__risu_test_isnull__' });
  });

  it('injects sentinels for reversed null comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract('{{#if {{? null != {{getvar::y}}}}}}ok{{/if}}');
    expect(result).toContainEqual({ variableName: 'y', value: '__risu_test_nonnull__' });
  });
});
