import { describe, expect, it } from 'vitest';
import {
  buildVariableDrawerSummary,
  coerceRawOverride,
  createFallbackGetvarBindings,
  createRegexFallbackBindings,
  createVariableBindingKey,
  dedupeVariableBindings,
  isBareBooleanToggle,
  mergeCandidateLists,
  toOverridePatch,
  type VariableDrawerBindingView,
} from '../../../../../src/lib/components/editor/variables/variableDrawerHelpers';

describe('variable drawer helpers', () => {
  const bindings: VariableDrawerBindingView[] = [
    {
      variableName: 'mood',
      scope: 'chat',
      operation: 'getvar',
      status: 'resolved',
      source: 'previewOverride',
      valueKind: 'string',
      rawValue: 'calm',
      candidates: [],
      usageRanges: [],
    },
    {
      variableName: 'is_night',
      scope: 'toggle',
      operation: 'getvar',
      status: 'missing',
      source: 'missing',
      valueKind: 'boolean',
      rawValue: '',
      candidates: [],
      usageRanges: [],
    },
    {
      variableName: 'actor',
      scope: 'iterator',
      operation: 'foreach',
      status: 'runtimeUnknown',
      source: 'runtimeUnknown',
      valueKind: 'unknown',
      rawValue: '',
      candidates: [],
      usageRanges: [],
    },
  ];

  it('builds drawer summary counts', () => {
    expect(buildVariableDrawerSummary(bindings, 'Default')).toEqual({
      profileLabel: 'Default',
      usedCount: 3,
      missingCount: 1,
      runtimeUnknownCount: 1,
    });
  });

  it('coerces raw boolean and number values without blocking fallback input', () => {
    expect(coerceRawOverride('boolean', 'true')).toEqual(true);
    expect(coerceRawOverride('boolean', 'false')).toEqual(false);
    expect(coerceRawOverride('number', '42')).toEqual('42');
    expect(coerceRawOverride('string', ' calm ')).toEqual(' calm ');
  });

  it('maps binding scopes to override patches', () => {
    expect(toOverridePatch({ ...bindings[0], rawValue: 'angry' })).toEqual({
      chatVariables: { mood: 'angry' },
    });
    expect(toOverridePatch({ ...bindings[1], rawValue: 'true' })).toEqual({
      toggleValues: { is_night: true },
    });
    expect(toOverridePatch({ ...bindings[1], rawValue: '0' })).toEqual({
      toggleValues: { is_night: false },
    });
    expect(toOverridePatch({ ...bindings[1], rawValue: '1' })).toEqual({
      toggleValues: { is_night: true },
    });
    expect(
      toOverridePatch({
        ...bindings[1],
        variableName: 'platform',
        operation: '#when:tis',
        rawValue: '0',
        valueKind: 'number',
      }),
    ).toEqual({
      toggleValues: { platform: false },
    });
    expect(
      toOverridePatch({
        ...bindings[1],
        variableName: 'feature',
        operation: '#when:tis',
        rawValue: '1',
        valueKind: 'number',
      }),
    ).toEqual({
      toggleValues: { feature: true },
    });
    expect(
      toOverridePatch({
        ...bindings[0],
        variableName: 'chatIndex',
        scope: 'context',
        operation: 'context',
        rawValue: '40',
      }),
    ).toEqual({
      contextVariables: { chatIndex: '40' },
    });
  });

  it('deduplicates candidates by value and preserves first source label', () => {
    expect(
      mergeCandidateLists([
        { value: 'calm', source: 'usage', label: 'calm' },
        { value: 'calm', source: '.risuvar', label: 'calm from file' },
        { value: 'angry', source: 'profile', label: 'angry' },
      ]),
    ).toEqual([
      { value: 'calm', source: 'usage', label: 'calm' },
      { value: 'angry', source: 'profile', label: 'angry' },
    ]);
  });

  it('deduplicates variable bindings by drawer key and merges usage metadata', () => {
    const duplicated = dedupeVariableBindings([
      {
        variableName: 'ct_Target_Name',
        scope: 'chat',
        direction: 'read',
        operation: 'getvar',
        status: 'resolved',
        source: 'profile',
        valueKind: 'string',
        rawValue: 'Noel',
        candidates: [{ value: 'Noel', source: 'profile', label: 'Noel' }],
        usageRanges: [{ line: 0, character: 0, endLine: 0, endCharacter: 27 }],
      },
      {
        variableName: 'ct_Target_Name',
        scope: 'chat',
        direction: 'read',
        operation: 'getvar',
        status: 'resolved',
        source: 'profile',
        valueKind: 'string',
        rawValue: 'Noel',
        candidates: [
          { value: 'Noel', source: 'usage', label: 'duplicate Noel' },
          { value: 'Risu', source: 'usage', label: 'Risu' },
        ],
        usageRanges: [{ line: 1, character: 3, endLine: 1, endCharacter: 30 }],
      },
    ]);

    expect(duplicated).toHaveLength(1);
    expect(createVariableBindingKey(duplicated[0])).toBe('ct_Target_Name\u0000chat\u0000getvar');
    expect(duplicated[0].usageRanges).toEqual([
      { line: 0, character: 0, endLine: 0, endCharacter: 27 },
      { line: 1, character: 3, endLine: 1, endCharacter: 30 },
    ]);
    expect(duplicated[0].candidates).toEqual([
      { value: 'Noel', source: 'profile', label: 'Noel' },
      { value: 'Risu', source: 'usage', label: 'Risu' },
    ]);
  });

  it('creates fallback getvar bindings from nested inline calc conditions', () => {
    const bindings = createFallbackGetvarBindings(
      '{{#if {{? ({{getvar::ct_Mode}} != 1) && ({{getvar::ct_UseMemory}} == 1) }} }}memory{{/if}}',
    );

    expect(bindings.map((binding) => binding.variableName).sort()).toEqual([
      'ct_Mode',
      'ct_UseMemory',
    ]);
    expect(bindings).toEqual([
      expect.objectContaining({ variableName: 'ct_Mode', operation: 'getvar', status: 'missing' }),
      expect.objectContaining({
        variableName: 'ct_UseMemory',
        operation: 'getvar',
        status: 'missing',
      }),
    ]);
  });

  it('creates fallback getglobalvar bindings with global scope and operation from nested inline conditions', () => {
    const bindings = createFallbackGetvarBindings(
      '{{#if {{? {{getglobalvar::toggle_dialogues_dynamic-gpt-5.4}}=1}}}}ok{{/if}}',
    );

    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      variableName: 'toggle_dialogues_dynamic-gpt-5.4',
      operation: 'getglobalvar',
      scope: 'global',
      status: 'missing',
    });
  });

  it('adds direct and nested #when comparison candidates to fallback getvar bindings', () => {
    const bindings = createFallbackGetvarBindings(
      [
        '{{#when::{{equal::{{getvar::first}}::1}}::and::{{equal::{{getvar::lang}}::0}}::and::{{equal::{{getvar::user_role}}::student}}}}ok{{/when}}',
        '{{#when::{{getvar::el_popup}}::is::2}}popup{{/when}}',
      ].join('\n'),
    );

    const bindingsByName = new Map(bindings.map((binding) => [binding.variableName, binding]));
    expect(bindingsByName.get('first')?.candidates).toContainEqual({
      value: '1',
      source: 'usage',
      label: '1',
    });
    expect(bindingsByName.get('lang')?.candidates).toContainEqual({
      value: '0',
      source: 'usage',
      label: '0',
    });
    expect(bindingsByName.get('user_role')?.candidates).toContainEqual({
      value: 'student',
      source: 'usage',
      label: 'student',
    });
    expect(bindingsByName.get('el_popup')?.candidates).toContainEqual({
      value: '2',
      source: 'usage',
      label: '2',
    });
  });

  it('identifies bare boolean toggle rows that should render as slide/toggle', () => {
    // Bare gettoggle with boolean valueKind → true
    expect(
      isBareBooleanToggle({
        variableName: 'nsfw',
        scope: 'toggle',
        operation: 'gettoggle',
        status: 'missing',
        source: 'missing',
        valueKind: 'boolean',
        rawValue: '',
        candidates: [],
        usageRanges: [],
      }),
    ).toBe(true);

    // Bare gettoggle with 0/1 candidates but non-boolean valueKind → true
    expect(
      isBareBooleanToggle({
        variableName: 'lb-sns.anon',
        scope: 'toggle',
        operation: 'gettoggle',
        status: 'runtimeUnknown',
        source: 'runtimeUnknown',
        valueKind: 'unknown',
        rawValue: '',
        candidates: [
          { value: '0', source: 'usage', label: '0' },
          { value: '1', source: 'usage', label: '1' },
        ],
        usageRanges: [],
      }),
    ).toBe(true);

    // #when:tis literal comparison → false (not a bare toggle)
    expect(
      isBareBooleanToggle({
        variableName: 'platform',
        scope: 'toggle',
        operation: '#when:tis',
        status: 'missing',
        source: 'missing',
        valueKind: 'unknown',
        rawValue: '',
        candidates: [{ value: '0', source: 'usage', label: '0' }],
        usageRanges: [],
      }),
    ).toBe(false);

    // Chat scope getvar with 0/1 truthiness candidates → true (extended)
    expect(
      isBareBooleanToggle({
        ...bindings[0],
        candidates: [
          { value: '0', source: 'usage', label: '0' },
          { value: '1', source: 'usage', label: '1' },
        ],
      }),
    ).toBe(true);

    // Global scope getglobalvar with boolean valueKind → true (extended truthiness)
    expect(
      isBareBooleanToggle({
        variableName: 'x',
        scope: 'global',
        operation: 'getglobalvar',
        status: 'resolved',
        source: 'previewOverride',
        valueKind: 'boolean',
        rawValue: '',
        candidates: [],
        usageRanges: [],
      }),
    ).toBe(true);

    // Non-0/1 candidates on toggle → false
    expect(
      isBareBooleanToggle({
        variableName: 'mode',
        scope: 'toggle',
        operation: 'gettoggle',
        status: 'missing',
        source: 'missing',
        valueKind: 'unknown',
        rawValue: '',
        candidates: [
          { value: 'easy', source: 'usage', label: 'easy' },
          { value: 'hard', source: 'usage', label: 'hard' },
        ],
        usageRanges: [],
      }),
    ).toBe(false);

    // Chat scope getvar with 0/1 truthiness candidates → true (extended)
    expect(
      isBareBooleanToggle({
        variableName: 'is_active',
        scope: 'chat',
        operation: 'getvar',
        status: 'missing',
        source: 'missing',
        valueKind: 'unknown',
        rawValue: '',
        candidates: [
          { value: '0', source: 'usage', label: '0' },
          { value: '1', source: 'usage', label: '1' },
        ],
        usageRanges: [],
      }),
    ).toBe(true);

    // Global scope getglobalvar with 0/1 truthiness candidates → true (extended)
    expect(
      isBareBooleanToggle({
        variableName: 'toggle_pov',
        scope: 'global',
        operation: 'getglobalvar',
        status: 'missing',
        source: 'missing',
        valueKind: 'unknown',
        rawValue: '',
        candidates: [
          { value: '0', source: 'usage', label: '0' },
          { value: '1', source: 'usage', label: '1' },
        ],
        usageRanges: [],
      }),
    ).toBe(true);

    // Chat scope getvar with boolean valueKind → true (extended)
    expect(
      isBareBooleanToggle({
        variableName: 'enabled',
        scope: 'chat',
        operation: 'getvar',
        status: 'resolved',
        source: 'previewOverride',
        valueKind: 'boolean',
        rawValue: 'true',
        candidates: [],
        usageRanges: [],
      }),
    ).toBe(true);

    // Global scope getglobalvar without 0/1 candidates → false
    expect(
      isBareBooleanToggle({
        variableName: 'name',
        scope: 'global',
        operation: 'getglobalvar',
        status: 'resolved',
        source: 'previewOverride',
        valueKind: 'string',
        rawValue: 'world',
        candidates: [],
        usageRanges: [],
      }),
    ).toBe(false);

    // Chat scope getvar with non-0/1 candidates → false
    expect(
      isBareBooleanToggle({
        variableName: 'mode',
        scope: 'chat',
        operation: 'getvar',
        status: 'missing',
        source: 'missing',
        valueKind: 'unknown',
        rawValue: '',
        candidates: [{ value: 'easy', source: 'usage', label: 'easy' }],
        usageRanges: [],
      }),
    ).toBe(false);
  });

  it('creates fallback bindings for implicit #when condition controls', () => {
    const bindings = createFallbackGetvarBindings(
      [
        '{{#when::var::mood}}truthy{{/when}}',
        '{{#when::mode::vis::hard}}hard{{/when}}',
        '{{#when::toggle::nsfw}}toggle{{/when}}',
        '{{#when::platform::tis::0}}zero{{/when}}',
        '{{#when::feature::tis::1}}one{{/when}}',
        '{{#when::{{chat_index}}::<=::40}}early{{/when}}',
      ].join('\n'),
    );

    const bindingsByKey = new Map(
      bindings.map((binding) => [
        `${binding.variableName}\u0000${binding.scope}\u0000${binding.operation}`,
        binding,
      ]),
    );

    expect(bindingsByKey.get('mood\u0000chat\u0000getvar')).toMatchObject({
      variableName: 'mood',
      scope: 'chat',
      operation: 'getvar',
    });
    expect(bindingsByKey.get('mode\u0000chat\u0000getvar')?.candidates).toContainEqual({
      value: 'hard',
      source: 'usage',
      label: 'hard',
    });
    expect(bindingsByKey.get('nsfw\u0000toggle\u0000gettoggle')).toMatchObject({
      variableName: 'nsfw',
      scope: 'toggle',
      operation: 'gettoggle',
      valueKind: 'boolean',
    });
    expect(bindingsByKey.get('nsfw\u0000toggle\u0000gettoggle')?.candidates).toEqual([
      { value: '0', source: 'usage', label: '0' },
      { value: '1', source: 'usage', label: '1' },
    ]);
    expect(bindingsByKey.get('platform\u0000toggle\u0000#when:tis')?.candidates).toContainEqual({
      value: '0',
      source: 'usage',
      label: '0',
    });
    expect(bindingsByKey.get('feature\u0000toggle\u0000#when:tis')?.candidates).toContainEqual({
      value: '1',
      source: 'usage',
      label: '1',
    });
    expect(bindingsByKey.get('chatIndex\u0000context\u0000context')?.candidates).toContainEqual({
      value: '40',
      source: 'usage',
      label: '40',
    });
  });

  it('injects 0/1 boolean candidates for simple #if getvar/getglobalvar truthiness checks in fallback bindings', () => {
    const bindings = createFallbackGetvarBindings(
      [
        '{{#if {{getvar::is_active}}}}active{{/if}}',
        '{{#if {{getglobalvar::toggle_pov}}}}pov{{/if}}',
        '{{#if_pure {{getglobalvar::debug_mode}}}}debug{{/if_pure}}',
      ].join('\n'),
    );

    const bindingsByName = new Map(bindings.map((binding) => [binding.variableName, binding]));

    const isActive = bindingsByName.get('is_active');
    expect(isActive).toMatchObject({
      variableName: 'is_active',
      scope: 'chat',
      operation: 'getvar',
    });
    expect(isActive?.candidates).toContainEqual({ value: '0', source: 'usage', label: '0' });
    expect(isActive?.candidates).toContainEqual({ value: '1', source: 'usage', label: '1' });

    const togglePov = bindingsByName.get('toggle_pov');
    expect(togglePov).toMatchObject({
      variableName: 'toggle_pov',
      scope: 'global',
      operation: 'getglobalvar',
    });
    expect(togglePov?.candidates).toContainEqual({ value: '0', source: 'usage', label: '0' });
    expect(togglePov?.candidates).toContainEqual({ value: '1', source: 'usage', label: '1' });

    const debugMode = bindingsByName.get('debug_mode');
    expect(debugMode).toMatchObject({
      variableName: 'debug_mode',
      scope: 'global',
      operation: 'getglobalvar',
    });
    expect(debugMode?.candidates).toContainEqual({ value: '0', source: 'usage', label: '0' });
    expect(debugMode?.candidates).toContainEqual({ value: '1', source: 'usage', label: '1' });
  });

  it('does NOT inject 0/1 for complex math expressions in fallback bindings', () => {
    const bindings = createFallbackGetvarBindings(
      [
        '{{#if {{? {{getvar::score}} + 1}}}}high{{/if}}',
        '{{#if {{? {{getvar::a}} && {{getvar::b}}}}}}ok{{/if}}',
        '{{#if {{? ({{getvar::a}} && {{getvar::b}})}}}}ok{{/if}}',
      ].join('\n'),
    );

    const bindingsByName = new Map(bindings.map((binding) => [binding.variableName, binding]));

    for (const name of ['score', 'a', 'b']) {
      const binding = bindingsByName.get(name);
      if (!binding) continue;
      const values = binding.candidates.map((c) => c.value);
      expect(values).not.toContain('0');
      expect(values).not.toContain('1');
    }
  });

  it('maps truthiness toggle overrides to correct scope (chat/global)', () => {
    // Chat scope → chatVariables
    expect(
      toOverridePatch({
        variableName: 'is_active',
        scope: 'chat',
        operation: 'getvar',
        status: 'missing',
        source: 'missing',
        valueKind: 'unknown',
        rawValue: 'true',
        candidates: [
          { value: '0', source: 'usage', label: '0' },
          { value: '1', source: 'usage', label: '1' },
        ],
        usageRanges: [],
      }),
    ).toEqual({ chatVariables: { is_active: 'true' } });

    // Global scope → globalVariables
    expect(
      toOverridePatch({
        variableName: 'toggle_pov',
        scope: 'global',
        operation: 'getglobalvar',
        status: 'missing',
        source: 'missing',
        valueKind: 'unknown',
        rawValue: 'false',
        candidates: [
          { value: '0', source: 'usage', label: '0' },
          { value: '1', source: 'usage', label: '1' },
        ],
        usageRanges: [],
      }),
    ).toEqual({ globalVariables: { toggle_pov: 'false' } });
  });

  describe('regex fallback bindings (IN + OUT scanning)', () => {
    it('scans getvar references from both IN and OUT sections', () => {
      const bindings = createRegexFallbackBindings(
        '{{getvar::mood}}',
        '{{getvar::actor}}',
      );

      const names = bindings.map((binding) => binding.variableName).sort();
      expect(names).toEqual(['actor', 'mood']);
    });

    it('finds variables only in OUT section when IN is empty', () => {
      const bindings = createRegexFallbackBindings(
        '',
        '{{getglobalvar::platform}}',
      );

      expect(bindings).toHaveLength(1);
      expect(bindings[0]).toMatchObject({
        variableName: 'platform',
        operation: 'getglobalvar',
        scope: 'global',
        status: 'missing',
      });
    });

    it('finds variables only in IN section when OUT is empty', () => {
      const bindings = createRegexFallbackBindings(
        '{{getvar::input_var}}',
        '',
      );

      expect(bindings).toHaveLength(1);
      expect(bindings[0]).toMatchObject({
        variableName: 'input_var',
        operation: 'getvar',
        scope: 'chat',
        status: 'missing',
      });
    });

    it('deduplicates variables that appear in both IN and OUT sections', () => {
      const bindings = createRegexFallbackBindings(
        '{{getvar::shared}} and more',
        'also {{getvar::shared}} here',
      );

      expect(bindings).toHaveLength(1);
      expect(bindings[0].variableName).toBe('shared');
      expect(bindings[0].usageRanges).toHaveLength(2);
    });

    it('scans #when condition references from both sections', () => {
      const bindings = createRegexFallbackBindings(
        '{{#when::var::active}}on{{/when}}',
        '{{#when::toggle::nsfw}}hidden{{/when}}',
      );

      const bindingsByKey = new Map(
        bindings.map((binding) => [
          `${binding.variableName}\u0000${binding.scope}\u0000${binding.operation}`,
          binding,
        ]),
      );

      expect(bindingsByKey.get('active\u0000chat\u0000getvar')).toMatchObject({
        variableName: 'active',
        scope: 'chat',
        operation: 'getvar',
      });
      expect(bindingsByKey.get('nsfw\u0000toggle\u0000gettoggle')).toMatchObject({
        variableName: 'nsfw',
        scope: 'toggle',
        operation: 'gettoggle',
        valueKind: 'boolean',
      });
    });

    it('scans #when comparison candidates from OUT section', () => {
      const bindings = createRegexFallbackBindings(
        'plain in text',
        '{{#when::mode::vis::hard}}hard{{/when}}',
      );

      const modeBinding = bindings.find((binding) => binding.variableName === 'mode');
      expect(modeBinding?.candidates).toContainEqual({
        value: 'hard',
        source: 'usage',
        label: 'hard',
      });
    });

    it('returns empty array when both sections are empty', () => {
      const bindings = createRegexFallbackBindings('', '');
      expect(bindings).toEqual([]);
    });

    it('combines getvar and #when references from mixed CBS in both sections', () => {
      const bindings = createRegexFallbackBindings(
        '{{getvar::ct_Target_Name}}{{#if {{getvar::is_nsfw}}}}nsfw{{/if}}',
        '{{#when::ct_Target_Name::vis::Risu}}match{{/when}}',
      );

      const names = bindings.map((binding) => binding.variableName).sort();
      expect(names).toEqual(['ct_Target_Name', 'is_nsfw']);

      const targetBindings = bindings.filter((binding) => binding.variableName === 'ct_Target_Name');
      expect(targetBindings).toHaveLength(1);
      expect(targetBindings[0].candidates).toContainEqual({
        value: 'Risu',
        source: 'usage',
        label: 'Risu',
      });
    });
  });
});
