import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { extractCBSVarOps } from '../../../src/domain';
import { createAstConditionCandidateExtractor } from '../../../src/domain/cbs/condition-candidates';

const multipleWhenExample = readFileSync(
  new URL('../../../../../test_suites/multiple_when_example.risulorebook', import.meta.url),
  'utf8',
);

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

  it('collects implicit #when control variable reads', () => {
    const result = extractCBSVarOps(
      [
        '{{#when::var::mood}}ok{{/when}}',
        '{{#when::mode::vis::hard}}ok{{/when}}',
        '{{#when::toggle::nsfw}}ok{{/when}}',
        '{{#when::platform::tis::0}}ok{{/when}}',
        '{{#when::{{chat_index}}::<=::40}}ok{{/when}}',
      ].join('\n'),
    );

    expect(Array.from(result.reads).sort()).toEqual([
      'chatIndex',
      'mode',
      'mood',
      'nsfw',
      'platform',
    ]);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('collects bare runtime context macros as drawer-readable variables', () => {
    const result = extractCBSVarOps('{{chat_index}}/{{chatindex}}/{{lastmessageid}}');

    expect(Array.from(result.reads).sort()).toEqual(['chatIndex', 'lastmessageid']);
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
    const result = createAstConditionCandidateExtractor().extract(
      '{{#if {{? {{getvar::lang}} == 1}}}}Korean{{/if}}',
    );
    expect(result).toEqual([{ variableName: 'lang', value: '1' }]);
  });

  it('extracts multiple conditions for the same variable', () => {
    const source =
      '{{#if {{? {{getvar::vg_Language}} == 1}}}}Korean{{/if}}{{#if {{? {{getvar::vg_Language}} == 3}}}}Japanese{{/if}}';
    const result = createAstConditionCandidateExtractor().extract(source);
    expect(result).toContainEqual({ variableName: 'vg_Language', value: '1' });
    expect(result).toContainEqual({ variableName: 'vg_Language', value: '3' });
  });

  it('extracts getglobalvar comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract(
      '{{#if {{? {{getglobalvar::toggle}} = true}}}}on{{/if}}',
    );
    expect(result).toEqual([{ variableName: 'toggle', value: 'true' }]);
  });

  it('handles reversed literal-on-left comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract(
      '{{#if {{? 5 >= {{getvar::score}}}}}}win{{/if}}',
    );
    expect(result).toEqual([{ variableName: 'score', value: '5' }]);
  });

  it('skips expressions without clear literal side', () => {
    const result = createAstConditionCandidateExtractor().extract(
      '{{#if {{? {{getvar::a}} == {{getvar::b}}}}}}ok{{/if}}',
    );
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
    const result = createAstConditionCandidateExtractor().extract(
      '{{#if {{? ({{getvar::vg_Choice_Flag}} == 4)}} }}skipped{{/if}}',
    );
    expect(result).toEqual([{ variableName: 'vg_Choice_Flag', value: '4' }]);
  });

  it('does not throw on malformed input', () => {
    expect(() =>
      createAstConditionCandidateExtractor().extract('{{#if {{? {{getvar::x}} == 1'),
    ).not.toThrow();
  });

  it('filters out null literal candidates but injects non-null sentinel', () => {
    const result = createAstConditionCandidateExtractor().extract(
      '{{#if {{? {{getvar::vg_FirstKiss}} != null}}}}already kissed{{/if}}',
    );
    expect(result).toEqual([{ variableName: 'vg_FirstKiss', value: '__risu_test_nonnull__' }]);
  });

  it('filters out undefined literal candidates but injects is-null sentinel', () => {
    const result = createAstConditionCandidateExtractor().extract(
      '{{#if {{? {{getvar::x}} == undefined}}}}ok{{/if}}',
    );
    expect(result).toEqual([{ variableName: 'x', value: '__risu_test_isnull__' }]);
  });

  it('preserves non-null candidates alongside null comparisons and injects sentinel', () => {
    const source =
      '{{#if {{? {{getvar::vg_FirstKiss}} != null}}}}already kissed{{/if}}{{#if {{? {{getvar::vg_FirstKiss}} == 1}}}}first time{{/if}}';
    const result = createAstConditionCandidateExtractor().extract(source);
    expect(result).toContainEqual({ variableName: 'vg_FirstKiss', value: '1' });
    expect(result).toContainEqual({ variableName: 'vg_FirstKiss', value: '__risu_test_nonnull__' });
  });

  it('injects non-null sentinel for != null comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract(
      '{{#if {{? {{getvar::x}} != null}}}}ok{{/if}}',
    );
    expect(result).toContainEqual({ variableName: 'x', value: '__risu_test_nonnull__' });
  });

  it('injects is-null sentinel for == null comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract(
      '{{#if {{? {{getvar::x}} == null}}}}ok{{/if}}',
    );
    expect(result).toContainEqual({ variableName: 'x', value: '__risu_test_isnull__' });
  });

  it('injects sentinels for reversed null comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract(
      '{{#if {{? null != {{getvar::y}}}}}}ok{{/if}}',
    );
    expect(result).toContainEqual({ variableName: 'y', value: '__risu_test_nonnull__' });
  });

  it('extracts direct and nested #when candidates from the multiple when lorebook case', () => {
    const result = createAstConditionCandidateExtractor().extract(multipleWhenExample);

    expect(result).toContainEqual({ variableName: 'first', value: '1' });
    expect(result).toContainEqual({ variableName: 'lang', value: '0' });
    expect(result).toContainEqual({ variableName: 'user_role', value: 'student' });
    expect(result).toContainEqual({ variableName: 'el_popup', value: '2' });
    expect(result).toContainEqual({ variableName: 'chatIndex', value: '40' });
  });

  it('extracts direct #when getglobalvar comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract(
      '{{#when::{{getglobalvar::toggle_lang}}::is::0}}English{{/when}}',
    );

    expect(result).toEqual([{ variableName: 'toggle_lang', value: '0' }]);
  });

  it('creates candidates for chat_index runtime context macros in #when comparisons', () => {
    const result = createAstConditionCandidateExtractor().extract(
      '{{#when::{{chat_index}}::<=::40}}early{{/when}}{{#when::{{lastmessageid}}::<=::3}}last{{/when}}',
    );

    expect(result).toEqual([
      { variableName: 'chatIndex', value: '40' },
      { variableName: 'lastmessageid', value: '3' },
    ]);
  });

  it('extracts implicit #when var, vis, bare toggle, toggle literal, and chatindex candidates', () => {
    const result = createAstConditionCandidateExtractor().extract(
      [
        '{{#when::var::mood}}truthy{{/when}}',
        '{{#when::mode::vis::hard}}hard{{/when}}',
        '{{#when::mode::visnot::easy}}not easy{{/when}}',
        '{{#when::toggle::lb-sns.anon}}toggle{{/when}}',
        '{{#when::platform::tis::0}}zero{{/when}}',
        '{{#when::platform::tisnot::1}}not one{{/when}}',
        '{{#when::{{chatindex}}::<=::40}}early{{/when}}',
      ].join('\n'),
    );

    expect(result).toContainEqual({ variableName: 'mode', value: 'hard' });
    expect(result).toContainEqual({ variableName: 'mode', value: 'easy' });
    expect(result).toContainEqual({ variableName: 'lb-sns.anon', value: '0' });
    expect(result).toContainEqual({ variableName: 'lb-sns.anon', value: '1' });
    expect(result).toContainEqual({ variableName: 'platform', value: '0' });
    expect(result).toContainEqual({ variableName: 'platform', value: '1' });
    expect(result).toContainEqual({ variableName: 'chatIndex', value: '40' });
    expect(result).not.toContainEqual({ variableName: 'mood', value: expect.any(String) });
  });

  describe('simple truthiness checks (#if {{getvar}} / #if {{getglobalvar}})', () => {
    it('injects 0/1 boolean candidates for #if {{getvar::is_active}}', () => {
      const result = createAstConditionCandidateExtractor().extract(
        '{{#if {{getvar::is_active}}}}active{{/if}}',
      );

      expect(result).toContainEqual({ variableName: 'is_active', value: '0' });
      expect(result).toContainEqual({ variableName: 'is_active', value: '1' });
    });

    it('injects 0/1 boolean candidates for #if {{getglobalvar::toggle_pov}}', () => {
      const result = createAstConditionCandidateExtractor().extract(
        '{{#if {{getglobalvar::toggle_pov}}}}pov mode{{/if}}',
      );

      expect(result).toContainEqual({ variableName: 'toggle_pov', value: '0' });
      expect(result).toContainEqual({ variableName: 'toggle_pov', value: '1' });
    });

    it('injects 0/1 boolean candidates for #if_pure with getglobalvar', () => {
      const result = createAstConditionCandidateExtractor().extract(
        '{{#if_pure {{getglobalvar::debug_mode}}}}debug{{/if_pure}}',
      );

      expect(result).toContainEqual({ variableName: 'debug_mode', value: '0' });
      expect(result).toContainEqual({ variableName: 'debug_mode', value: '1' });
    });

    it('handles parenthesized truthiness expressions', () => {
      const result = createAstConditionCandidateExtractor().extract(
        '{{#if {{? ({{getvar::enabled}})}}}}on{{/if}}',
      );

      expect(result).toContainEqual({ variableName: 'enabled', value: '0' });
      expect(result).toContainEqual({ variableName: 'enabled', value: '1' });
    });

    it('injects 0/1 for bare math truthiness {{? {{getvar::flag}}}}', () => {
      const result = createAstConditionCandidateExtractor().extract(
        '{{#if {{? {{getvar::flag}}}}}}on{{/if}}',
      );

      expect(result).toContainEqual({ variableName: 'flag', value: '0' });
      expect(result).toContainEqual({ variableName: 'flag', value: '1' });
    });

    it('injects 0/1 for bare math truthiness {{? {{getglobalvar::toggle}}}}', () => {
      const result = createAstConditionCandidateExtractor().extract(
        '{{#if {{? {{getglobalvar::toggle}}}}}}on{{/if}}',
      );

      expect(result).toContainEqual({ variableName: 'toggle', value: '0' });
      expect(result).toContainEqual({ variableName: 'toggle', value: '1' });
    });

    it('does NOT inject 0/1 when a comparison operator is present', () => {
      const result = createAstConditionCandidateExtractor().extract(
        '{{#if {{? {{getvar::count}} == 5}}}}five{{/if}}',
      );

      // Should only have the comparison candidate, not 0/1 toggle candidates
      expect(result).toEqual([{ variableName: 'count', value: '5' }]);
    });

    it('does NOT inject 0/1 for math expressions with arithmetic like {{? {{getvar::score}} + 1}}', () => {
      const result = createAstConditionCandidateExtractor().extract(
        '{{#if {{? {{getvar::score}} + 1}}}}high{{/if}}',
      );

      expect(result).toEqual([]);
    });

    it('does NOT inject 0/1 for math expressions with logical operators like {{? {{getvar::a}} && {{getvar::b}}}}', () => {
      const result = createAstConditionCandidateExtractor().extract(
        '{{#if {{? {{getvar::a}} && {{getvar::b}}}}}}ok{{/if}}',
      );

      expect(result).toEqual([]);
    });

    it('does NOT inject 0/1 for parenthesized multi-variable math expressions', () => {
      const result = createAstConditionCandidateExtractor().extract(
        '{{#if {{? ({{getvar::a}} && {{getvar::b}})}}}}ok{{/if}}',
      );

      expect(result).toEqual([]);
    });

    it('deduplicates across multiple truthiness checks for the same variable', () => {
      const result = createAstConditionCandidateExtractor().extract(
        [
          '{{#if {{getvar::flag}}}}a{{/if}}',
          '{{#if {{getvar::flag}}}}b{{/if}}',
        ].join('\n'),
      );

      const flagCandidates = result.filter((c) => c.variableName === 'flag');
      expect(flagCandidates).toHaveLength(2);
      expect(flagCandidates).toContainEqual({ variableName: 'flag', value: '0' });
      expect(flagCandidates).toContainEqual({ variableName: 'flag', value: '1' });
    });

    it('coexists with explicit comparison candidates for other variables', () => {
      const result = createAstConditionCandidateExtractor().extract(
        [
          '{{#if {{getvar::is_active}}}}active{{/if}}',
          '{{#if {{? {{getvar::lang}} == 1}}}}Korean{{/if}}',
        ].join('\n'),
      );

      expect(result).toContainEqual({ variableName: 'is_active', value: '0' });
      expect(result).toContainEqual({ variableName: 'is_active', value: '1' });
      expect(result).toContainEqual({ variableName: 'lang', value: '1' });
    });
  });
});
