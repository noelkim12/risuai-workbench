import { describe, expect, it } from 'vitest';

import {
  RISU_REGEX_DIRECTIVE_REFERENCES,
  buildRegexReplacementPlan,
  getRisuRegexOrder,
  hasRisuRegexDirective,
  parseRisuRegexFlags,
  previewRegexReplacement,
} from '../../../src/simulator/regex';

describe('regex directive replacement planning', () => {
  it('maps move_top and order directives into a simulated top placement DTO', () => {
    const parsed = parseRisuRegexFlags('g<move_top><order 3>');
    const replacementPreview = previewRegexReplacement({
      pattern: 'a',
      jsFlags: parsed.jsFlags,
      sampleInput: 'a a',
      replacement: 'b',
    });

    const plan = buildRegexReplacementPlan({ directives: parsed.directives, replacementPreview });

    expect(plan).toEqual({
      output: 'b b',
      placement: 'top',
      order: 3,
      newlinePolicy: 'preserve',
      repeatBack: false,
      cbs: false,
      confidence: 'simulated',
      appliedDirectives: [
        { kind: 'move_top', raw: '<move_top>' },
        { kind: 'order', raw: '<order 3>', order: 3 },
      ],
      appliedDirectiveRawTokens: ['<move_top>', '<order 3>'],
    });
  });

  it('preserves replacement output exactly while honoring no_end_nl newline policy', () => {
    const parsed = parseRisuRegexFlags('<no_end_nl>');
    const replacementPreview = previewRegexReplacement({
      pattern: 'a',
      jsFlags: parsed.jsFlags,
      sampleInput: 'a',
      replacement: 'b\n',
    });

    const plan = buildRegexReplacementPlan({ directives: parsed.directives, replacementPreview });

    expect(plan.output).toBe('b\n');
    expect(plan.newlinePolicy).toBe('preserve-without-auto-suffix');
    expect(plan.placement).toBe('match');
    expect(plan.confidence).toBe('simulated');
    expect(plan.appliedDirectiveRawTokens).toEqual(['<no_end_nl>']);
  });

  it('uses match placement and verified confidence without directives', () => {
    const parsed = parseRisuRegexFlags('g');
    const replacementPreview = previewRegexReplacement({
      pattern: 'a',
      jsFlags: parsed.jsFlags,
      sampleInput: 'a a',
      replacement: 'b',
    });

    const plan = buildRegexReplacementPlan({ directives: parsed.directives, replacementPreview });

    expect(plan).toEqual({
      output: 'b b',
      placement: 'match',
      newlinePolicy: 'preserve',
      repeatBack: false,
      cbs: false,
      confidence: 'verified',
      appliedDirectives: [],
      appliedDirectiveRawTokens: [],
    });
  });

  it('maps inject, move_bottom, repeat_back, and cbs directive values', () => {
    const injectPlan = buildRegexReplacementPlan({
      directives: parseRisuRegexFlags('<inject><repeat_back><cbs>').directives,
      replacementPreview: { output: 'x' },
    });
    const bottomPlan = buildRegexReplacementPlan({
      directives: parseRisuRegexFlags('<move_bottom>').directives,
      replacementPreview: { output: 'y' },
    });

    expect(injectPlan).toMatchObject({
      output: 'x',
      placement: 'inject',
      repeatBack: true,
      cbs: true,
      confidence: 'simulated',
    });
    expect(bottomPlan).toMatchObject({ output: 'y', placement: 'bottom' });
  });

  it('exposes pure directive helpers', () => {
    const directives = parseRisuRegexFlags('<repeat_back><order 7>').directives;

    expect(hasRisuRegexDirective(directives, 'repeat_back')).toBe(true);
    expect(hasRisuRegexDirective(directives, 'cbs')).toBe(false);
    expect(getRisuRegexOrder(directives)).toBe(7);
    expect(getRisuRegexOrder([])).toBeUndefined();
  });

  it('lists exactly the supported directive registry entries', () => {
    expect(RISU_REGEX_DIRECTIVE_REFERENCES).toEqual([
      'inject',
      'move_top',
      'move_bottom',
      'repeat_back',
      'order',
      'cbs',
      'no_end_nl',
    ]);
  });
});
