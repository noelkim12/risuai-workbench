import { describe, expect, it } from 'vitest';
import {
  buildVariableDrawerSummary,
  coerceRawOverride,
  createFallbackGetvarBindings,
  createVariableBindingKey,
  dedupeVariableBindings,
  mergeCandidateLists,
  toOverridePatch,
  type VariableDrawerBindingView,
} from '../../../../../src/lib/components/editor/variables/variableDrawerTypes';

describe('variable drawer helpers', () => {
  const bindings: VariableDrawerBindingView[] = [
    { variableName: 'mood', scope: 'chat', operation: 'getvar', status: 'resolved', source: 'previewOverride', valueKind: 'string', rawValue: 'calm', candidates: [], usageRanges: [] },
    { variableName: 'is_night', scope: 'toggle', operation: 'getvar', status: 'missing', source: 'missing', valueKind: 'boolean', rawValue: '', candidates: [], usageRanges: [] },
    { variableName: 'actor', scope: 'iterator', operation: 'foreach', status: 'runtimeUnknown', source: 'runtimeUnknown', valueKind: 'unknown', rawValue: '', candidates: [], usageRanges: [] },
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
    expect(toOverridePatch({ ...bindings[0], rawValue: 'angry' })).toEqual({ chatVariables: { mood: 'angry' } });
    expect(toOverridePatch({ ...bindings[1], rawValue: 'true' })).toEqual({ toggleValues: { is_night: true } });
  });

  it('deduplicates candidates by value and preserves first source label', () => {
    expect(mergeCandidateLists([
      { value: 'calm', source: 'usage', label: 'calm' },
      { value: 'calm', source: '.risuvar', label: 'calm from file' },
      { value: 'angry', source: 'profile', label: 'angry' },
    ])).toEqual([
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

    expect(bindings.map((binding) => binding.variableName).sort()).toEqual(['ct_Mode', 'ct_UseMemory']);
    expect(bindings).toEqual([
      expect.objectContaining({ variableName: 'ct_Mode', operation: 'getvar', status: 'missing' }),
      expect.objectContaining({ variableName: 'ct_UseMemory', operation: 'getvar', status: 'missing' }),
    ]);
  });
});
