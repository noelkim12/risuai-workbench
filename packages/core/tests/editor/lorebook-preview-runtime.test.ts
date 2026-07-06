import { describe, expect, it } from 'vitest';
import { createLorebookContentRuntimePreview } from '../../src/domain/editor';

describe('lorebook CONTENT runtime preview', () => {
  it('applies preview overrides to output and binding metadata', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: 'Mood: {{getvar::mood}}',
      overrides: { chatVariables: { mood: 'calm' } },
    });

    expect(preview.status).toBe('ok');
    expect(preview.output).toContain('calm');
    expect(preview.bindings).toEqual([
      expect.objectContaining({
        variableName: 'mood',
        status: 'resolved',
        source: 'previewOverride',
        rawValue: 'calm',
      }),
    ]);
  });

  it('distinguishes missing variables and keeps raw fallback possible', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: 'Mood: {{getvar::mood}}',
      overrides: {},
    });

    expect(preview.bindings).toEqual([
      expect.objectContaining({
        variableName: 'mood',
        status: 'missing',
        source: 'missing',
        rawValue: '',
      }),
    ]);
    expect(preview.warnings).toEqual([
      expect.objectContaining({ code: 'CBSVAR_MISSING', variableName: 'mood' }),
    ]);
  });

  it('injects runtime context overrides for chat index and last message id macros', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: '{{chat_index}}/{{lastmessageid}}',
      overrides: { contextVariables: { chatIndex: '7', lastmessageid: '3' } },
    });

    expect(preview.output).toBe('7/3');
    expect(preview.bindings).toEqual([
      expect.objectContaining({
        variableName: 'chatIndex',
        scope: 'context',
        status: 'resolved',
        source: 'previewOverride',
        rawValue: '7',
      }),
      expect.objectContaining({
        variableName: 'lastmessageid',
        scope: 'context',
        status: 'resolved',
        source: 'previewOverride',
        rawValue: '3',
      }),
    ]);
  });

  it('prints null lastmessageid preview overrides as explicit context values', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: '{{lastmessageid}}',
      overrides: { contextVariables: { lastmessageid: 'null' } },
    });
    const nullPreview = createLorebookContentRuntimePreview({
      contentText: '{{lastmessageid}}',
      overrides: { contextVariables: { lastmessageid: null } },
    });

    expect(preview.status).toBe('ok');
    expect(preview.output).toBe('null');
    expect(preview.bindings).toEqual([
      expect.objectContaining({
        variableName: 'lastmessageid',
        scope: 'context',
        status: 'resolved',
        source: 'previewOverride',
        rawValue: 'null',
      }),
    ]);
    expect(nullPreview.status).toBe('ok');
    expect(nullPreview.output).toBe('null');
    expect(nullPreview.bindings[0]?.rawValue).toBe('null');
  });

  it('surfaces getvar reads inside legacy inline calc conditions for the variable drawer', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText:
        '{{#if {{? ({{getvar::ct_Mode}} != 1) && ({{getvar::ct_UseMemory}} == 1) }} }}memory{{/if}}',
      overrides: {},
    });

    expect(preview.bindings.map((binding) => binding.variableName).sort()).toEqual([
      'ct_Mode',
      'ct_UseMemory',
    ]);
    expect(preview.bindings).toEqual([
      expect.objectContaining({ variableName: 'ct_Mode', operation: 'getvar', status: 'missing' }),
      expect.objectContaining({
        variableName: 'ct_UseMemory',
        operation: 'getvar',
        status: 'missing',
      }),
    ]);
  });

  it('adds direct and nested #when comparison candidates to variable bindings', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: [
        '{{#when::{{equal::{{getvar::first}}::1}}::and::{{equal::{{getvar::lang}}::0}}::and::{{equal::{{getvar::user_role}}::student}}}}ok{{/when}}',
        '{{#when::{{getvar::el_popup}}::is::2}}popup{{/when}}',
        '{{#when::feature::tis::1}}enabled{{/when}}',
      ].join('\n'),
      overrides: {},
    });

    const bindingsByName = new Map(
      preview.bindings.map((binding) => [binding.variableName, binding]),
    );
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
    expect(bindingsByName.get('feature')?.candidates).toContainEqual({
      value: '1',
      source: 'usage',
      label: '1',
    });
  });

  it('adds implicit #when condition controls to variable bindings', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: [
        '{{#when::var::mood}}truthy{{/when}}',
        '{{#when::mode::vis::hard}}hard{{/when}}',
        '{{#when::toggle::nsfw}}toggle{{/when}}',
        '{{#when::platform::tis::0}}zero{{/when}}',
        '{{#when::feature::tis::1}}one{{/when}}',
        '{{#when::{{chat_index}}::<=::40}}early{{/when}}',
      ].join('\n'),
      overrides: {
        chatVariables: { mood: '1', mode: 'hard' },
        toggleValues: { nsfw: true, platform: false, feature: true },
        contextVariables: { chatIndex: '20' },
      },
    });

    const bindingsByKey = new Map(
      preview.bindings.map((binding) => [
        `${binding.variableName}\u0000${binding.scope}\u0000${binding.operation}`,
        binding,
      ]),
    );
    expect(bindingsByKey.get('mood\u0000chat\u0000getvar')).toMatchObject({
      variableName: 'mood',
      scope: 'chat',
      rawValue: '1',
    });
    expect(bindingsByKey.get('mode\u0000chat\u0000getvar')?.candidates).toContainEqual({
      value: 'hard',
      source: 'usage',
      label: 'hard',
    });
    expect(bindingsByKey.get('nsfw\u0000toggle\u0000gettoggle')).toMatchObject({
      variableName: 'nsfw',
      scope: 'toggle',
      rawValue: 'true',
    });
    expect(bindingsByKey.get('nsfw\u0000toggle\u0000gettoggle')?.candidates).toEqual([
      { value: '0', source: 'usage', label: '0' },
      { value: '1', source: 'usage', label: '1' },
    ]);
    expect(bindingsByKey.get('platform\u0000toggle\u0000#when:tis')).toMatchObject({
      variableName: 'platform',
      scope: 'toggle',
      rawValue: '0',
    });
    expect(bindingsByKey.get('platform\u0000toggle\u0000#when:tis')?.candidates).toContainEqual({
      value: '0',
      source: 'usage',
      label: '0',
    });
    expect(bindingsByKey.get('feature\u0000toggle\u0000#when:tis')).toMatchObject({
      variableName: 'feature',
      scope: 'toggle',
      rawValue: '1',
    });
    expect(bindingsByKey.get('feature\u0000toggle\u0000#when:tis')?.candidates).toContainEqual({
      value: '1',
      source: 'usage',
      label: '1',
    });
    expect(bindingsByKey.get('chatIndex\u0000context\u0000context')).toMatchObject({
      variableName: 'chatIndex',
      scope: 'context',
      rawValue: '20',
    });
    expect(bindingsByKey.get('chatIndex\u0000context\u0000context')?.candidates).toContainEqual({
      value: '40',
      source: 'usage',
      label: '40',
    });
  });

  it('compares #when:tis 0/1 literals against boolean toggle overrides', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: [
        '{{#when::platform::tis::0}}literal zero{{/when}}',
        '{{#when::feature::tis::1}}literal one{{/when}}',
      ].join('\n'),
      overrides: { toggleValues: { platform: false, feature: true } },
    });

    expect(preview.output).toBe('literal zero\nliteral one');
    expect(preview.bindings).toContainEqual(
      expect.objectContaining({
        variableName: 'platform',
        operation: '#when:tis',
        rawValue: '0',
      }),
    );
    expect(preview.bindings).toContainEqual(
      expect.objectContaining({
        variableName: 'feature',
        operation: '#when:tis',
        rawValue: '1',
      }),
    );
  });

  it('surfaces bare #when toggle controls with 0/1 candidates and boolean raw values', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: '{{#when::toggle::lb-sns.anon}}anonymous{{/when}}',
      overrides: { toggleValues: { 'lb-sns.anon': false } },
    });

    expect(preview.output).toBe('');
    expect(preview.bindings).toContainEqual(
      expect.objectContaining({
        variableName: 'lb-sns.anon',
        scope: 'toggle',
        operation: 'gettoggle',
        rawValue: 'false',
        candidates: [
          { value: '0', source: 'usage', label: '0' },
          { value: '1', source: 'usage', label: '1' },
        ],
      }),
    );
  });

  it('keeps #when:tis global toggle literal fallback compatibility', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: '{{#when::platform::tis::0}}literal zero{{/when}}',
      baseContext: { toggleValues: { platform: true } },
      overrides: { globalVariables: { toggle_platform: '0' } },
    });

    expect(preview.output).toBe('literal zero');
  });

  it('returns trace, effects, and diagnostics for trace panel rendering', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: '{{setvar::mood::angry}} {{#if {{? 1>=1}}}}yes{{/if}}',
      overrides: { chatVariables: { mood: 'calm' } },
      executionMode: 'execute',
    });

    expect(preview.trace.length).toBeGreaterThan(0);
    expect(preview.effects).toEqual([
      expect.objectContaining({ operation: 'setvar', committed: false, target: 'mood' }),
    ]);
    expect(
      preview.diagnostics.every(
        (diagnostic) => diagnostic.source === 'parser' || diagnostic.source === 'simulator',
      ),
    ).toBe(true);
  });

  it('maps trace source lines to compact preview output lines', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: [
        '{{#if {{? 0}}}}',
        'hidden',
        '{{/if}}',
        'visible',
        '{{#if {{? 1}}}}',
        'shown',
        '{{/if}}',
      ].join('\n'),
      overrides: {},
    });

    const truthyIfTrace = preview.trace.find(
      (event) => event.node === '#if' && event.details?.truthy === 'true',
    );

    expect(truthyIfTrace).toEqual(
      expect.objectContaining({
        range: expect.objectContaining({ line: 4 }),
        outputLine: 2,
        outputColumn: 0,
      }),
    );
  });

  it('maps same-line if traces to left-to-right preview columns', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: '{{#if {{? 1}}}}Korean{{/if}} and {{#if {{? 1}}}}Japanese{{/if}}.',
      overrides: {},
    });

    const ifTraces = preview.trace.filter(
      (event) => event.node === '#if' && event.details?.truthy === 'true',
    );

    expect(preview.output).toBe('Korean and Japanese.');
    expect(ifTraces).toEqual([
      expect.objectContaining({ outputLine: 0, outputColumn: 0 }),
      expect.objectContaining({ outputLine: 0, outputColumn: 'Korean and '.length }),
    ]);
  });

  it('does not assign inline preview positions to child traces inside if conditions', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText:
        '{{#if {{? {{getvar::vg_Language}} != 2}}}}- The field names and the value of Encounter Type must remain in English.{{/if}}',
      overrides: { chatVariables: { vg_Language: '1' } },
    });

    const childTraces = preview.trace.filter(
      (event) => event.node === '?' || event.node === 'getvar',
    );

    expect(preview.output).toBe(
      '- The field names and the value of Encounter Type must remain in English.',
    );
    expect(preview.trace).toContainEqual(
      expect.objectContaining({ node: '#if', outputLine: 0, outputColumn: 0 }),
    );
    expect(childTraces.length).toBeGreaterThan(0);
  });

  it('positions standalone getvar chip on the next preview line when source contains a newline', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText:
        'Encounter Type: The general form of the encounter. Must be exactly one of the following values only.\n{{getvar::vg_Choice_Type}}',
      overrides: { chatVariables: { vg_Choice_Type: 'battle' } },
    });

    expect(preview.output).toBe(
      'Encounter Type: The general form of the encounter. Must be exactly one of the following values only.\nbattle',
    );
    expect(preview.trace).toContainEqual(
      expect.objectContaining({
        node: 'getvar',
        outputLine: 1,
        outputColumn: 0,
      }),
    );
  });

  it('preserves the blank line after a standalone empty getvar output', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: ['Use Conditions', '{{getvar::vg_ArousalResponse}}', '', '### Format'].join(
        '\n',
      ),
      overrides: {},
      executionMode: 'execute',
    });

    expect(preview.output).toBe(['Use Conditions', '', '', '### Format'].join('\n'));
    expect(preview.output.split('\n')).toEqual(['Use Conditions', '', '', '### Format']);
    expect(preview.trace).toContainEqual(
      expect.objectContaining({
        node: 'getvar',
        outputLine: 1,
        outputColumn: 0,
      }),
    );
  });

  it('keeps an empty inline getvar trace anchored before the following newline', () => {
    const coreLine =
      '  - Core: Directly advances the current storyline and begins a consecutive encounter sequence with a standard initial encounter. The Difficulty refers only to that initial encounter, not to the full consecutive encounter sequence.';
    const preview = createLorebookContentRuntimePreview({
      contentText: [
        `${coreLine}{{getvar::vg_Flag_Goal}}`,
        '  - Side: A self-contained side event not directly related to the main storyline.',
      ].join('\n'),
      overrides: {},
    });

    expect(preview.output).toBe(
      [
        coreLine,
        '  - Side: A self-contained side event not directly related to the main storyline.',
      ].join('\n'),
    );
    expect(preview.trace).toContainEqual(
      expect.objectContaining({
        node: 'getvar',
        outputLine: 0,
        outputColumn: coreLine.length,
      }),
    );
  });

  it('keeps empty inline getvar traces anchored after #if body trimming', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: [
        '{{#if {{? 1}}}}',
        '- Core: Text.{{getvar::vg_Flag_Goal}}',
        '- Side: Text.',
        '{{/if}}',
      ].join('\n'),
      overrides: {},
    });

    expect(preview.output).toBe(['- Core: Text.', '- Side: Text.'].join('\n'));
    expect(preview.trace).toContainEqual(
      expect.objectContaining({
        node: 'getvar',
        outputLine: 0,
        outputColumn: '- Core: Text.'.length,
      }),
    );
  });

  it('injects 0/1 boolean candidates for simple #if {{getvar}} truthiness checks', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: [
        '{{#if {{getvar::is_active}}}}active{{/if}}',
        '{{#if {{getglobalvar::toggle_pov}}}}pov mode{{/if}}',
      ].join('\n'),
      overrides: {},
    });

    const bindingsByName = new Map(
      preview.bindings.map((binding) => [binding.variableName, binding]),
    );

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
  });
});
