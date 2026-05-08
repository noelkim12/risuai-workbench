/**
 * CBS preview variable injector engine tests.
 * @file packages/core/tests/domain/cbs/cbs-variable-injector.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  createCbsPreviewVariableInjection,
  type CbsPreviewVariableInjectionInput,
} from '../../../src/domain/cbs';

describe('CBS preview variable injector engine', () => {
  it('returns occurrence-order bindings for mood read missing and score write writeOnly/runtimeUnknown', () => {
    const input: CbsPreviewVariableInjectionInput = {
      source: '{{getvar::mood}} {{setvar::score::2}}',
    };

    const result = createCbsPreviewVariableInjection(input);

    // Verify effectiveContext.chatVariables equals {}
    expect(result.effectiveContext.chatVariables).toEqual({});

    // Verify bindings in occurrence order
    expect(result.bindings).toHaveLength(2);

    // First binding: mood read
    expect(result.bindings[0]).toMatchObject({
      variableName: 'mood',
      scope: 'chat',
      direction: 'read',
      status: 'missing',
      source: 'missing',
      valuePreview: undefined,
    });

    // Second binding: score write
    expect(result.bindings[1]).toMatchObject({
      variableName: 'score',
      scope: 'chat',
      direction: 'write',
      status: 'writeOnly',
      source: 'runtimeUnknown',
      valuePreview: undefined,
    });

    // Verify warnings include CBSVAR_MISSING for mood and CBSVAR_WRITE_ONLY for score
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'CBSVAR_MISSING',
        variableName: 'mood',
      }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'CBSVAR_WRITE_ONLY',
        variableName: 'score',
      }),
    );

    // Verify coverageNotes are generated
    expect(result.coverageNotes).toHaveLength(2);
    expect(result.coverageNotes[0]).toMatchObject({
      key: 'mood',
      status: 'missing',
    });
    expect(result.coverageNotes[1]).toMatchObject({
      key: 'score',
      status: 'writeOnly',
    });

    // Verify effects is an array (empty for now in Task 1)
    expect(result.effects).toEqual([]);
  });
});
