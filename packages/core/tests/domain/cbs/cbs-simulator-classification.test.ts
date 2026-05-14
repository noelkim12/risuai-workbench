import { describe, expect, it } from 'vitest';

import {
  assertCbsSupportClassificationCoverage,
  CBSBuiltinRegistry,
  CBS_SIMULATOR_SUPPORT_CLASSIFICATION,
  CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
  getCbsSupportClassification,
} from '../../../src/domain';
import {
  CBS_SIMULATOR_FIXED_CLOCK_ISO,
  CBS_SIMULATOR_FIXED_CLOCK_TIME,
  CBS_SIMULATOR_PARITY_FIXTURES,
  CBS_SIMULATOR_RANDOM_SEQUENCE,
  getCbsSimulatorParityFixture,
} from './fixtures/cbs-simulator-parity-fixtures';

const SUPPORT_CLASSES = new Set([
  'supported',
  'approximate',
  'unsupported',
  'runtime-unknown',
  'effect-only',
]);

describe('CBS simulator support classification', () => {
  it('covers every builtin registry canonical name exactly once', () => {
    const registry = new CBSBuiltinRegistry();
    const coverage = assertCbsSupportClassificationCoverage(registry);

    expect(registry.getAll()).toHaveLength(175);
    expect(coverage.missingClassifications).toEqual([]);
    expect(coverage.extraClassifications).toEqual([]);
    expect(Object.keys(CBS_SIMULATOR_SUPPORT_CLASSIFICATION)).toHaveLength(175);
    expect(new Set(Object.keys(CBS_SIMULATOR_SUPPORT_CLASSIFICATION)).size).toBe(175);
    expect(Object.values(CBS_SIMULATOR_SUPPORT_CLASSIFICATION).every((value) => SUPPORT_CLASSES.has(value))).toBe(
      true,
    );
  });

  it('normalizes aliases through the registry lookup surface', () => {
    const registry = new CBSBuiltinRegistry();

    expect(getCbsSupportClassification('USER', registry)).toBe('supported');
    expect(getCbsSupportClassification('set_var', registry)).toBe('effect-only');
    expect(getCbsSupportClassification(':each', registry)).toBe('supported');
    expect(getCbsSupportClassification('video img', registry)).toBe('unsupported');
    expect(getCbsSupportClassification('not_a_macro', registry)).toBeUndefined();
  });

  it('classifies runtime-dependent macro families as explicit non-silent policies', () => {
    const registry = new CBSBuiltinRegistry();

    expect(getCbsSupportClassification('char', registry)).toBe('runtime-unknown');
    expect(getCbsSupportClassification('role', registry)).toBe('runtime-unknown');
    expect(getCbsSupportClassification('chatindex', registry)).toBe('runtime-unknown');
    expect(getCbsSupportClassification('isfirstmsg', registry)).toBe('runtime-unknown');
    expect(getCbsSupportClassification('history', registry)).toBe('runtime-unknown');
    expect(getCbsSupportClassification('persona', registry)).toBe('runtime-unknown');
    expect(getCbsSupportClassification('lorebook', registry)).toBe('runtime-unknown');
    expect(getCbsSupportClassification('moduleenabled', registry)).toBe('runtime-unknown');
    expect(getCbsSupportClassification('model', registry)).toBe('runtime-unknown');
    expect(getCbsSupportClassification('risu', registry)).toBe('runtime-unknown');
    expect(getCbsSupportClassification('asset', registry)).toBe('unsupported');
    expect(getCbsSupportClassification('chardisplayasset', registry)).toBe('unsupported');
    expect(getCbsSupportClassification('screenwidth', registry)).toBe('runtime-unknown');
  });
});

describe('CBS simulator upstream parity fixture corpus', () => {
  it('contains required P0/P1 fixture sources without executing upstream runtime code', () => {
    expect(CBS_SIMULATOR_PARITY_FIXTURES.map((fixture) => fixture.source)).toEqual(
      expect.arrayContaining([
        'Hello {{not_a_macro::x}}',
        '{{equal::{{user}}::Noel}}',
        '{{getvar::mood}}',
        '{{getvar::missing_mood}}',
        '{{#when::1}}yes{{/}}',
        '{{#when::0}}yes{{:else}}no{{/}}',
        '{{#each ["a","b"] as item}}{{slot::item}}{{/}}',
        '{{isotime}}',
        '{{random::a::b}} {{random::a::b}}',
        '{{setvar::mood::calm}}',
      ]),
    );
    expect(CBS_SIMULATOR_FIXED_CLOCK_ISO).toBe('2026-05-05T00:00:00.000Z');
    expect(CBS_SIMULATOR_FIXED_CLOCK_TIME).toBe('00:00:00');
    expect(CBS_SIMULATOR_RANDOM_SEQUENCE).toEqual([0.1, 0.9]);
  });

  it('records variable precedence as chat before character and template defaults', () => {
    const fixture = getCbsSimulatorParityFixture(
      'variable precedence uses chat before character and template defaults',
    );

    expect(fixture).toEqual(
      expect.objectContaining({
        source: '{{getvar::mood}}',
        expectedOutput: 'calm',
        supportClass: 'supported',
      }),
    );
    expect(fixture?.context).toEqual({
      chatVariables: { mood: 'calm' },
      characterDefaultVariables: { mood: 'angry' },
      templateDefaultVariables: { mood: 'sad' },
    });

    const missingFixture = getCbsSimulatorParityFixture('variable precedence missing value returns blank intent');
    expect(missingFixture).toEqual(
      expect.objectContaining({
        source: '{{getvar::missing_mood}}',
        expectedOutput: '',
      }),
    );
    expect(missingFixture?.context).toEqual({
      chatVariables: {},
      characterDefaultVariables: {},
      templateDefaultVariables: {},
    });
  });

  it('records fixed clock as provider intent with time-only isotime output', () => {
    const fixture = getCbsSimulatorParityFixture('fixed clock uses injected provider');

    expect(fixture).toEqual(
      expect.objectContaining({
        source: '{{isotime}}',
        expectedOutput: CBS_SIMULATOR_FIXED_CLOCK_TIME,
      }),
    );
    expect(fixture?.context).toEqual({ clockIso: CBS_SIMULATOR_FIXED_CLOCK_ISO });
  });

  it('records unknown macro preserves source fixture intent', () => {
    const fixture = getCbsSimulatorParityFixture('unknown macro preserves source');

    expect(fixture).toEqual(
      expect.objectContaining({
        source: 'Hello {{not_a_macro::x}}',
        expectedOutput: 'Hello {{not_a_macro::x}}',
        supportClass: 'unsupported',
      }),
    );
    expect(fixture?.unsupportedIntent).toEqual(
      expect.objectContaining({
        source: 'Hello {{not_a_macro::x}}',
        preservedSource: '{{not_a_macro::x}}',
        supportClass: 'unsupported',
      }),
    );
    expect(fixture?.unsupportedIntent?.diagnostics).toEqual([
      {
        code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
        macroName: 'not_a_macro',
        severity: 'warning',
        preservesSource: true,
      },
    ]);
  });

  it('records effect-only setvar fixture without mutating caller context', () => {
    const fixture = getCbsSimulatorParityFixture('setvar records effect only');

    expect(fixture?.supportClass).toBe('effect-only');
    expect(fixture?.expectedOutput).toBe('');
    expect(fixture?.expectedEffects).toEqual([{ type: 'setvar', key: 'mood', value: 'calm' }]);
  });
});
