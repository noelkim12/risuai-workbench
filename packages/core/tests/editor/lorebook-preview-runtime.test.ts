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
});
