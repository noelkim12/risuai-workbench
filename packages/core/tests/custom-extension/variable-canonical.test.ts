import { describe, it, expect } from 'vitest';
import {
  parseVariableContent,
  serializeVariableContent,
  extractVariablesFromCharx,
  extractVariablesFromModule,
  injectVariablesIntoCharx,
  injectVariablesIntoModule,
  buildVariablePath,
  resolveDuplicateVariableSources,
  VariableAdapterError,
  type VariableContent,
  type VariableSource,
} from '../../src/domain/custom-extension/extensions/variable';

describe('parseVariableContent', () => {
  it('returns empty object for empty string', () => {
    expect(parseVariableContent('')).toEqual({});
  });

  it('returns empty object for whitespace-only string', () => {
    expect(parseVariableContent('   ')).toEqual({});
    expect(parseVariableContent('\t\n\r')).toEqual({});
  });

  it('parses simple key=value pairs', () => {
    const input = 'var1=1\nvar2=test\nvar3=532';
    expect(parseVariableContent(input)).toEqual({
      var1: '1',
      var2: 'test',
      var3: '532',
    });
  });

  it('splits on first equals only (value can contain =)', () => {
    const input = 'key=a=b=c';
    expect(parseVariableContent(input)).toEqual({
      key: 'a=b=c',
    });
  });

  it('preserves whitespace in values exactly', () => {
    const input = 'key= value with spaces ';
    expect(parseVariableContent(input)).toEqual({
      key: ' value with spaces ',
    });
  });

  it('preserves single space value (edge case from spec)', () => {
    // From spec: ct_generatedHTML=  (single space)
    const input = 'ct_generatedHTML= ';
    expect(parseVariableContent(input)).toEqual({
      ct_generatedHTML: ' ',
    });
  });

  it('handles empty value (key=)', () => {
    const input = 'key=';
    expect(parseVariableContent(input)).toEqual({
      key: '',
    });
  });

  it('handles lines without equals (key gets empty value)', () => {
    const input = 'noequals';
    expect(parseVariableContent(input)).toEqual({
      noequals: '',
    });
  });

  it('skips empty lines', () => {
    const input = 'var1=1\n\nvar2=2\n\n\nvar3=3';
    expect(parseVariableContent(input)).toEqual({
      var1: '1',
      var2: '2',
      var3: '3',
    });
  });

  it('skips whitespace-only lines', () => {
    const input = 'var1=1\n   \n\t\nvar2=2';
    expect(parseVariableContent(input)).toEqual({
      var1: '1',
      var2: '2',
    });
  });

  it('handles CRLF line endings', () => {
    const input = 'var1=1\r\nvar2=2\r\nvar3=3';
    expect(parseVariableContent(input)).toEqual({
      var1: '1',
      var2: '2',
      var3: '3',
    });
  });

  it('handles mixed line endings', () => {
    const input = 'var1=1\r\nvar2=2\nvar3=3';
    expect(parseVariableContent(input)).toEqual({
      var1: '1',
      var2: '2',
      var3: '3',
    });
  });

  it('preserves key with internal whitespace (not trimmed)', () => {
    // Per spec: trim is applied to whole line only for empty check
    // key/value internal whitespace is preserved
    const input = ' key with spaces =value';
    expect(parseVariableContent(input)).toEqual({
      ' key with spaces ': 'value',
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

  it('handles # as part of key (not comment)', () => {
    // Per spec: # is not a comment marker
    const input = '#comment=somevalue';
    expect(parseVariableContent(input)).toEqual({
      '#comment': 'somevalue',
    });
  });

  it('handles key starting with =', () => {
    const input = '=value';
    expect(parseVariableContent(input)).toEqual({
      '': 'value',
    });
  });

  it('handles value with only equals signs', () => {
    const input = 'key====';
    expect(parseVariableContent(input)).toEqual({
      key: '===',
    });
  });
});

describe('serializeVariableContent', () => {
  it('returns empty string for empty object', () => {
    expect(serializeVariableContent({})).toBe('');
  });

  it('serializes simple key=value pairs', () => {
    const content: VariableContent = {
      var1: '1',
      var2: 'test',
      var3: '532',
    };
    expect(serializeVariableContent(content)).toBe('var1=1\nvar2=test\nvar3=532');
  });

  it('serializes empty values as key=', () => {
    const content: VariableContent = {
      empty: '',
    };
    expect(serializeVariableContent(content)).toBe('empty=');
  });

  it('preserves whitespace in values', () => {
    const content: VariableContent = {
      key: ' value with spaces ',
    };
    expect(serializeVariableContent(content)).toBe('key= value with spaces ');
  });

  it('preserves single space value', () => {
    const content: VariableContent = {
      ct_generatedHTML: ' ',
    };
    expect(serializeVariableContent(content)).toBe('ct_generatedHTML= ');
  });

  it('preserves values containing equals signs', () => {
    const content: VariableContent = {
      key: 'a=b=c',
    };
    expect(serializeVariableContent(content)).toBe('key=a=b=c');
  });
});

describe('parse/serialize round-trip', () => {
  it('round-trips simple content', () => {
    const original = 'var1=1\nvar2=test\nvar3=532';
    const parsed = parseVariableContent(original);
    const serialized = serializeVariableContent(parsed);
    expect(serialized).toBe(original);
  });

  it('round-trips content with empty values', () => {
    const original = 'var1=1\nempty=\nvar2=2';
    const parsed = parseVariableContent(original);
    const serialized = serializeVariableContent(parsed);
    expect(serialized).toBe(original);
  });

  it('round-trips content with values containing equals', () => {
    const original = 'key=a=b=c\nother=simple';
    const parsed = parseVariableContent(original);
    const serialized = serializeVariableContent(parsed);
    expect(serialized).toBe(original);
  });

  it('round-trips content with whitespace preservation', () => {
    const original = 'key= value with spaces ';
    const parsed = parseVariableContent(original);
    const serialized = serializeVariableContent(parsed);
    expect(serialized).toBe(original);
  });

  it('round-trips single space value (spec edge case)', () => {
    const original = 'ct_generatedHTML= ';
    const parsed = parseVariableContent(original);
    const serialized = serializeVariableContent(parsed);
    expect(serialized).toBe(original);
    expect(parsed.ct_generatedHTML).toBe(' ');
  });

  it('normalizes CRLF to LF on round-trip', () => {
    const original = 'var1=1\r\nvar2=2';
    const parsed = parseVariableContent(original);
    const serialized = serializeVariableContent(parsed);
    expect(serialized).toBe('var1=1\nvar2=2');
  });

  it('removes empty lines on round-trip', () => {
    const original = 'var1=1\n\nvar2=2';
    const parsed = parseVariableContent(original);
    const serialized = serializeVariableContent(parsed);
    expect(serialized).toBe('var1=1\nvar2=2');
  });
});

describe('extractVariablesFromCharx', () => {
  it('returns null when extensions.risuai.defaultVariables is missing', () => {
    const upstream = {};
    expect(extractVariablesFromCharx(upstream, 'charx')).toBeNull();
  });

  it('returns null when extensions is missing', () => {
    const upstream = {};
    expect(extractVariablesFromCharx(upstream, 'charx')).toBeNull();
  });

  it('returns null when risuai is missing', () => {
    const upstream = { extensions: {} };
    expect(extractVariablesFromCharx(upstream, 'charx')).toBeNull();
  });

  it('returns null when defaultVariables is null', () => {
    const upstream = { extensions: { risuai: { defaultVariables: null as unknown as Record<string, string> } } };
    expect(extractVariablesFromCharx(upstream, 'charx')).toBeNull();
  });

  it('extracts variables from charx upstream', () => {
    const upstream = {
      extensions: {
        risuai: {
          defaultVariables: {
            var1: '1',
            var2: 'test',
          },
        },
      },
    };
    expect(extractVariablesFromCharx(upstream, 'charx')).toEqual({
      var1: '1',
      var2: 'test',
    });
  });

  it('converts non-string values to strings', () => {
    const upstream = {
      extensions: {
        risuai: {
          defaultVariables: {
            num: 123,
            bool: true,
            str: 'text',
          } as unknown as Record<string, string>,
        },
      },
    };
    expect(extractVariablesFromCharx(upstream, 'charx')).toEqual({
      num: '123',
      bool: 'true',
      str: 'text',
    });
  });

  it('throws for module target', () => {
    const upstream = {
      extensions: {
        risuai: {
          defaultVariables: { var1: '1' },
        },
      },
    };
    expect(() => extractVariablesFromCharx(upstream, 'module')).toThrow(VariableAdapterError);
    expect(() => extractVariablesFromCharx(upstream, 'module')).toThrow('Expected target "charx", got "module"');
  });

  it('throws for preset target', () => {
    const upstream = {
      extensions: {
        risuai: {
          defaultVariables: { var1: '1' },
        },
      },
    };
    expect(() => extractVariablesFromCharx(upstream, 'preset')).toThrow(VariableAdapterError);
    expect(() => extractVariablesFromCharx(upstream, 'preset')).toThrow('Target "preset" does not support .risuvar');
  });
});

describe('extractVariablesFromModule', () => {
  it('returns null when defaultVariables is missing', () => {
    const upstream = {};
    expect(extractVariablesFromModule(upstream, 'module')).toBeNull();
  });

  it('returns null when defaultVariables is null', () => {
    const upstream = { defaultVariables: null as unknown as Record<string, string> };
    expect(extractVariablesFromModule(upstream, 'module')).toBeNull();
  });

  it('extracts variables from module upstream', () => {
    const upstream = {
      defaultVariables: {
        var1: '1',
        var2: 'test',
      },
    };
    expect(extractVariablesFromModule(upstream, 'module')).toEqual({
      var1: '1',
      var2: 'test',
    });
  });

  it('converts non-string values to strings', () => {
    const upstream = {
      defaultVariables: {
        num: 123,
        bool: true,
        str: 'text',
      } as unknown as Record<string, string>,
    };
    expect(extractVariablesFromModule(upstream, 'module')).toEqual({
      num: '123',
      bool: 'true',
      str: 'text',
    });
  });

  it('throws for charx target', () => {
    const upstream = { defaultVariables: { var1: '1' } };
    expect(() => extractVariablesFromModule(upstream, 'charx')).toThrow(VariableAdapterError);
    expect(() => extractVariablesFromModule(upstream, 'charx')).toThrow('Expected target "module", got "charx"');
  });

  it('throws for preset target', () => {
    const upstream = { defaultVariables: { var1: '1' } };
    expect(() => extractVariablesFromModule(upstream, 'preset')).toThrow(VariableAdapterError);
    expect(() => extractVariablesFromModule(upstream, 'preset')).toThrow('Target "preset" does not support .risuvar');
  });
});

describe('injectVariablesIntoCharx', () => {
  it('injects variables into charx upstream as string', () => {
    const upstream: { extensions?: { risuai?: { defaultVariables?: unknown } } } = {};
    const content: VariableContent = { var1: '1', var2: 'test' };
    injectVariablesIntoCharx(upstream, content, 'charx');
    // In charx, defaultVariables is stored as a string (newline-separated key=value pairs)
    expect(upstream.extensions?.risuai?.defaultVariables).toBe('var1=1\nvar2=test');
  });

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

  it('throws for module target', () => {
    const upstream: { extensions?: { risuai?: { defaultVariables?: Record<string, string> } } } = {};
    expect(() => injectVariablesIntoCharx(upstream, { var1: '1' }, 'module')).toThrow(VariableAdapterError);
  });

  it('throws for preset target', () => {
    const upstream: { extensions?: { risuai?: { defaultVariables?: Record<string, string> } } } = {};
    expect(() => injectVariablesIntoCharx(upstream, { var1: '1' }, 'preset')).toThrow(VariableAdapterError);
  });
});

describe('injectVariablesIntoModule', () => {
  it('injects variables into module upstream', () => {
    const upstream: { defaultVariables?: Record<string, string> } = {};
    const content: VariableContent = { var1: '1', var2: 'test' };
    injectVariablesIntoModule(upstream, content, 'module');
    expect(upstream.defaultVariables).toEqual({
      var1: '1',
      var2: 'test',
    });
  });

  it('deletes field when content is null', () => {
    const upstream: { defaultVariables?: Record<string, string> } = {
      defaultVariables: { var1: '1' },
    };
    injectVariablesIntoModule(upstream, null, 'module');
    expect(upstream.defaultVariables).toBeUndefined();
  });

  it('throws for charx target', () => {
    const upstream: { defaultVariables?: Record<string, string> } = {};
    expect(() => injectVariablesIntoModule(upstream, { var1: '1' }, 'charx')).toThrow(VariableAdapterError);
  });

  it('throws for preset target', () => {
    const upstream: { defaultVariables?: Record<string, string> } = {};
    expect(() => injectVariablesIntoModule(upstream, { var1: '1' }, 'preset')).toThrow(VariableAdapterError);
  });
});

describe('buildVariablePath', () => {
  it('builds path for charx target', () => {
    expect(buildVariablePath('charx', 'MyCharacter')).toBe('variables/MyCharacter.risuvar');
  });

  it('builds path for module target', () => {
    expect(buildVariablePath('module', 'MyModule')).toBe('variables/MyModule.risuvar');
  });

  it('sanitizes special characters in name', () => {
    expect(buildVariablePath('charx', 'name/with/slashes')).toBe('variables/name_with_slashes.risuvar');
    expect(buildVariablePath('module', 'name.with.dots')).toBe('variables/name_with_dots.risuvar');
  });

  it('preserves Korean characters', () => {
    expect(buildVariablePath('charx', '캐릭터이름')).toBe('variables/캐릭터이름.risuvar');
    expect(buildVariablePath('module', '모듈이름')).toBe('variables/모듈이름.risuvar');
  });

  it('preserves hyphens and underscores', () => {
    expect(buildVariablePath('charx', 'my-charx_name')).toBe('variables/my-charx_name.risuvar');
  });

  it('throws for empty targetName', () => {
    expect(() => buildVariablePath('charx', '')).toThrow(VariableAdapterError);
    expect(() => buildVariablePath('module', '')).toThrow('module target requires targetName for variable path');
  });

  it('throws for preset target', () => {
    expect(() => buildVariablePath('preset', 'MyPreset')).toThrow(VariableAdapterError);
    expect(() => buildVariablePath('preset', 'MyPreset')).toThrow('Target "preset" does not support .risuvar');
  });
});

describe('resolveDuplicateVariableSources', () => {
  it('returns single source', () => {
    const sources: Array<VariableSource & { content: VariableContent }> = [
      { target: 'charx', source: 'variables/test.risuvar', content: { var1: '1' } },
    ];
    expect(resolveDuplicateVariableSources(sources)).toEqual(sources[0]);
  });

  it('throws for no sources', () => {
    expect(() => resolveDuplicateVariableSources([])).toThrow(VariableAdapterError);
    expect(() => resolveDuplicateVariableSources([])).toThrow('No variable sources provided');
  });

  it('throws for multiple file sources', () => {
    const sources: Array<VariableSource & { content: VariableContent }> = [
      { target: 'charx', source: 'variables/a.risuvar', content: { var1: '1' } },
      { target: 'charx', source: 'variables/b.risuvar', content: { var2: '2' } },
    ];
    expect(() => resolveDuplicateVariableSources(sources)).toThrow(VariableAdapterError);
    expect(() => resolveDuplicateVariableSources(sources)).toThrow('multiple .risuvar files found');
  });

  it('throws for multiple metadata sources', () => {
    const sources: Array<VariableSource & { content: VariableContent }> = [
      { target: 'charx', source: 'charx.json defaultVariables', content: { var1: '1' } },
      { target: 'charx', source: 'metadata.json variables', content: { var2: '2' } },
    ];
    expect(() => resolveDuplicateVariableSources(sources)).toThrow(VariableAdapterError);
    expect(() => resolveDuplicateVariableSources(sources)).toThrow('multiple metadata variable fields found');
  });

  it('throws for mixed file and metadata sources', () => {
    const sources: Array<VariableSource & { content: VariableContent }> = [
      { target: 'charx', source: 'variables/test.risuvar', content: { var1: '1' } },
      { target: 'charx', source: 'charx.json defaultVariables', content: { var2: '2' } },
    ];
    expect(() => resolveDuplicateVariableSources(sources)).toThrow(VariableAdapterError);
    expect(() => resolveDuplicateVariableSources(sources)).toThrow('both file');
  });
});

describe('real-world variable patterns', () => {
  it('handles typical RPG module variables', () => {
    const input = 'hp=100\nmp=50\ngold=0\nlevel=1';
    const parsed = parseVariableContent(input);
    expect(parsed).toEqual({
      hp: '100',
      mp: '50',
      gold: '0',
      level: '1',
    });
    expect(serializeVariableContent(parsed)).toBe(input);
  });

  it('handles date variables', () => {
    const input = 'ct_StartDate=2025-03-03';
    const parsed = parseVariableContent(input);
    expect(parsed.ct_StartDate).toBe('2025-03-03');
  });

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
