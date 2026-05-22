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
      expect.objectContaining({ variableName: 'mood', status: 'resolved', source: 'previewOverride', rawValue: 'calm' }),
    ]);
  });

  it('distinguishes missing variables and keeps raw fallback possible', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: 'Mood: {{getvar::mood}}',
      overrides: {},
    });

    expect(preview.bindings).toEqual([
      expect.objectContaining({ variableName: 'mood', status: 'missing', source: 'missing', rawValue: '' }),
    ]);
    expect(preview.warnings).toEqual([
      expect.objectContaining({ code: 'CBSVAR_MISSING', variableName: 'mood' }),
    ]);
  });

  it('surfaces getvar reads inside legacy inline calc conditions for the variable drawer', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: '{{#if {{? ({{getvar::ct_Mode}} != 1) && ({{getvar::ct_UseMemory}} == 1) }} }}memory{{/if}}',
      overrides: {},
    });

    expect(preview.bindings.map((binding) => binding.variableName).sort()).toEqual(['ct_Mode', 'ct_UseMemory']);
    expect(preview.bindings).toEqual([
      expect.objectContaining({ variableName: 'ct_Mode', operation: 'getvar', status: 'missing' }),
      expect.objectContaining({ variableName: 'ct_UseMemory', operation: 'getvar', status: 'missing' }),
    ]);
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
    expect(preview.diagnostics.every((diagnostic) => diagnostic.source === 'parser' || diagnostic.source === 'simulator')).toBe(true);
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

    const truthyIfTrace = preview.trace.find((event) => event.node === '#if' && event.details?.truthy === 'true');

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

    const ifTraces = preview.trace.filter((event) => event.node === '#if' && event.details?.truthy === 'true');

    expect(preview.output).toBe('Korean and Japanese.');
    expect(ifTraces).toEqual([
      expect.objectContaining({ outputLine: 0, outputColumn: 0 }),
      expect.objectContaining({ outputLine: 0, outputColumn: 'Korean and '.length }),
    ]);
  });

  it('does not assign inline preview positions to child traces inside if conditions', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: '{{#if {{? {{getvar::vg_Language}} != 2}}}}- The field names and the value of Encounter Type must remain in English.{{/if}}',
      overrides: { chatVariables: { vg_Language: '1' } },
    });

    const childTraces = preview.trace.filter((event) => event.node === '?' || event.node === 'getvar');

    expect(preview.output).toBe('- The field names and the value of Encounter Type must remain in English.');
    expect(preview.trace).toContainEqual(expect.objectContaining({ node: '#if', outputLine: 0, outputColumn: 0 }));
    expect(childTraces.length).toBeGreaterThan(0);
  });

  it('positions standalone getvar chip on the next preview line when source contains a newline', () => {
    const preview = createLorebookContentRuntimePreview({
      contentText: 'Encounter Type: The general form of the encounter. Must be exactly one of the following values only.\n{{getvar::vg_Choice_Type}}',
      overrides: { chatVariables: { vg_Choice_Type: 'battle' } },
    });

    expect(preview.output).toBe('Encounter Type: The general form of the encounter. Must be exactly one of the following values only.\nbattle');
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
      contentText: ['Use Conditions', '{{getvar::vg_ArousalResponse}}', '', '### Format'].join('\n'),
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
});
