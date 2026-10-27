import { describe, it, expect } from 'vitest';
import {
  parseVariableContent,
  serializeVariableContent,
  extractVariablesFromCharx,
  injectVariablesIntoCharx,
  injectVariablesIntoModule,
  resolveDuplicateVariableSources,
  VariableAdapterError,
  type VariableContent,
  type VariableSource,
} from '../../src/domain/custom-extension/extensions/variable';

describe('parseVariableContent', () => {

  it('splits on first equals only (value can contain =)', () => {
    const input = 'key=a=b=c';
    expect(parseVariableContent(input)).toEqual({
      key: 'a=b=c',
    });
  });

  it('preserves single space value (edge case from spec)', () => {
    // From spec: ct_generatedHTML=  (single space)
    const input = 'ct_generatedHTML= ';
    expect(parseVariableContent(input)).toEqual({
      ct_generatedHTML: ' ',
    });
  });

  it('handles multiple variables with various edge cases', () => {
    const input = 'var1=1\nempty=\nnoequals\nwith=equals=in=value\n  spaces  =  preserved  ';
    expect(parseVariableContent(input)).toEqual({
      var1: '1',
      empty: '',
      noequals: '',
      with: 'equals=in=value',
      '  spaces  ': '  preserved  ',
    });
  });
});

describe('extractVariablesFromCharx', () => {

  it('converts non-string values to strings', () => {
    const upstream = {
      data: {
        extensions: {
          risuai: {
            defaultVariables: {
              num: 123,
              bool: true,
              str: 'text',
            } as unknown as Record<string, string>,
          },
        },
      },
    };
    expect(extractVariablesFromCharx(upstream, 'charx')).toEqual({
      num: '123',
      bool: 'true',
      str: 'text',
    });
  });
});

describe('injectVariablesIntoCharx', () => {

  it('creates nested structure if missing', () => {
    const upstream: { extensions?: { risuai?: { defaultVariables?: unknown } } } = {};
    const content: VariableContent = { var1: '1' };
    injectVariablesIntoCharx(upstream, content, 'charx');
    expect(upstream.extensions).toBeDefined();
    expect(upstream.extensions?.risuai).toBeDefined();
    expect(upstream.extensions?.risuai?.defaultVariables).toBe('var1=1');
  });

  it('deletes field when content is null', () => {
    const upstream: { extensions?: { risuai?: { defaultVariables?: Record<string, string> } } } = {
      extensions: {
        risuai: {
          defaultVariables: { var1: '1' },
        },
      },
    };
    injectVariablesIntoCharx(upstream, null, 'charx');
    expect(upstream.extensions?.risuai?.defaultVariables).toBeUndefined();
  });
});

describe('injectVariablesIntoModule', () => {

  it('deletes field when content is null', () => {
    const upstream: { defaultVariables?: Record<string, string> } = {
      defaultVariables: { var1: '1' },
    };
    injectVariablesIntoModule(upstream, null, 'module');
    expect(upstream.defaultVariables).toBeUndefined();
  });
});

describe('resolveDuplicateVariableSources', () => {

  it('throws for multiple file sources', () => {
    const sources: Array<VariableSource & { content: VariableContent }> = [
      { target: 'charx', source: 'variables/a.risuvar', content: { var1: '1' } },
      { target: 'charx', source: 'variables/b.risuvar', content: { var2: '2' } },
    ];
    expect(() => resolveDuplicateVariableSources(sources)).toThrow(VariableAdapterError);
    expect(() => resolveDuplicateVariableSources(sources)).toThrow('multiple .risuvar files found');
  });
});

describe('real-world variable patterns', () => {

  it('handles HTML content with equals (edge case)', () => {
    // HTML attributes contain = which should be preserved in value
    const input = 'ct_generatedHTML=<div class="test">';
    const parsed = parseVariableContent(input);
    expect(parsed.ct_generatedHTML).toBe('<div class="test">');
  });

  it('handles complex variable set round-trip', () => {
    const original = [
      'var1=1',
      'var2=test',
      'var3=532',
      'ct_StartDate=2025-03-03',
      'ct_generatedHTML= ',
      'empty=',
      'noequals',
    ].join('\n');

    const parsed = parseVariableContent(original);
    expect(parsed).toEqual({
      var1: '1',
      var2: 'test',
      var3: '532',
      ct_StartDate: '2025-03-03',
      ct_generatedHTML: ' ',
      empty: '',
      noequals: '',
    });

    const serialized = serializeVariableContent(parsed);
    // Note: noequals serializes as 'noequals=' because empty values are explicit
    expect(serialized).toBe(
      'var1=1\nvar2=test\nvar3=532\nct_StartDate=2025-03-03\nct_generatedHTML= \nempty=\nnoequals='
    );
  });
});
