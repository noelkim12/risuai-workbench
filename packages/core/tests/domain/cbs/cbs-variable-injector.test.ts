/**
 * CBS preview variable injector engine tests.
 * @file packages/core/tests/domain/cbs/cbs-variable-injector.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  createCbsPreviewVariableInjection,
  type CbsPreviewVariableInjectionInput,
  type CbsPreviewVariableReference,
} from '../../../src/domain/cbs';

/**
 * createOccurrence helper.
 * Creates a CbsPreviewVariableReference-compatible object for testing.
 * Includes deterministic range and key position metadata.
 *
 * @param variableName - Variable name
 * @param direction - Access direction ('read' or 'write')
 * @param operation - CBS operation
 * @param startOffset - Optional start offset for deterministic positioning (default: 0)
 * @returns Preview variable reference object with full metadata
 */
function createOccurrence(
  variableName: string,
  direction: 'read' | 'write',
  operation: CbsPreviewVariableReference['operation'],
  startOffset: number = 0,
): CbsPreviewVariableReference {
  // Deterministic Position objects matching CBSVariableOccurrence shape
  const keyStart = { line: 0, character: startOffset };
  const keyEnd = { line: 0, character: startOffset + variableName.length };
  const range = {
    start: { line: 0, character: startOffset },
    end: { line: 0, character: startOffset + variableName.length + 10 }, // Include macro wrapper
  };

  return {
    variableName,
    direction,
    operation,
    range,
    keyStart,
    keyEnd,
  };
}

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

  it('resolves chat precedence: previewOverride > chatVariable > characterDefault > templateDefault', () => {
    const input: CbsPreviewVariableInjectionInput = {
      source: '{{getvar::mood}} {{getvar::rank}} {{getvar::tone}} {{getvar::pace}}',
      baseContext: {
        chatVariables: { rank: 'chat-rank' },
      },
      previewOverrides: {
        chatVariables: { mood: 'calm' },
      },
      workspaceDefaults: {
        characterDefaultVariables: { tone: 'character-tone' },
        templateDefaultVariables: { pace: 'template-pace' },
      },
    };

    const result = createCbsPreviewVariableInjection(input);

    expect(result.bindings).toHaveLength(4);

    // mood: previewOverride (highest precedence)
    expect(result.bindings[0]).toMatchObject({
      variableName: 'mood',
      scope: 'chat',
      direction: 'read',
      status: 'resolved',
      source: 'previewOverride',
      valuePreview: 'calm',
    });

    // rank: chatVariable (from baseContext)
    expect(result.bindings[1]).toMatchObject({
      variableName: 'rank',
      scope: 'chat',
      direction: 'read',
      status: 'resolved',
      source: 'chatVariable',
      valuePreview: 'chat-rank',
    });

    // tone: characterDefault
    expect(result.bindings[2]).toMatchObject({
      variableName: 'tone',
      scope: 'chat',
      direction: 'read',
      status: 'resolved',
      source: 'characterDefault',
      valuePreview: 'character-tone',
    });

    // pace: templateDefault
    expect(result.bindings[3]).toMatchObject({
      variableName: 'pace',
      scope: 'chat',
      direction: 'read',
      status: 'resolved',
      source: 'templateDefault',
      valuePreview: 'template-pace',
    });

    // No warnings for resolved variables
    const moodWarning = result.warnings.find(w => w.variableName === 'mood');
    const rankWarning = result.warnings.find(w => w.variableName === 'rank');
    const toneWarning = result.warnings.find(w => w.variableName === 'tone');
    const paceWarning = result.warnings.find(w => w.variableName === 'pace');
    expect(moodWarning).toBeUndefined();
    expect(rankWarning).toBeUndefined();
    expect(toneWarning).toBeUndefined();
    expect(paceWarning).toBeUndefined();
  });

  it('resolves falsy own-property values as resolved without warnings', () => {
    const input: CbsPreviewVariableInjectionInput = {
      occurrences: [
        createOccurrence('empty', 'read', 'getvar'),
        createOccurrence('zero', 'read', 'getvar'),
        createOccurrence('off', 'read', 'getvar'),
        createOccurrence('nil', 'read', 'getvar'),
      ],
      previewOverrides: {
        chatVariables: {
          empty: '',
          zero: 0,
          off: false,
          nil: null,
        },
      },
    };

    const result = createCbsPreviewVariableInjection(input);

    expect(result.bindings).toHaveLength(4);

    // empty: '' should be resolved
    expect(result.bindings[0]).toMatchObject({
      variableName: 'empty',
      status: 'resolved',
      source: 'previewOverride',
      valuePreview: '',
    });

    // zero: 0 should be resolved
    expect(result.bindings[1]).toMatchObject({
      variableName: 'zero',
      status: 'resolved',
      source: 'previewOverride',
      valuePreview: '0',
    });

    // off: false should be resolved
    expect(result.bindings[2]).toMatchObject({
      variableName: 'off',
      status: 'resolved',
      source: 'previewOverride',
      valuePreview: 'false',
    });

    // nil: null should be resolved
    expect(result.bindings[3]).toMatchObject({
      variableName: 'nil',
      status: 'resolved',
      source: 'previewOverride',
      valuePreview: 'null',
    });

    // No warnings for any of these variables
    expect(result.warnings).toHaveLength(0);
  });

  it('resolves pre-extracted refs for getglobalvar, gettoggle, and tempvar', () => {
    const input: CbsPreviewVariableInjectionInput = {
      occurrences: [
        createOccurrence('globalFlag', 'read', 'getglobalvar'),
        createOccurrence('toggleMode', 'read', 'gettoggle'),
        createOccurrence('tempValue', 'read', 'tempvar'),
      ],
      previewOverrides: {
        globalVariables: { globalFlag: 'global-val' },
        toggleValues: { toggleMode: true },
        tempVariables: { tempValue: 42 },
      },
    };

    const result = createCbsPreviewVariableInjection(input);

    expect(result.bindings).toHaveLength(3);

    // getglobalvar -> global scope, globalVariable source
    expect(result.bindings[0]).toMatchObject({
      variableName: 'globalFlag',
      scope: 'global',
      direction: 'read',
      status: 'resolved',
      source: 'globalVariable',
      valuePreview: 'global-val',
    });

    // gettoggle -> toggle scope, toggleValue source
    expect(result.bindings[1]).toMatchObject({
      variableName: 'toggleMode',
      scope: 'toggle',
      direction: 'read',
      status: 'resolved',
      source: 'toggleValue',
      valuePreview: 'true',
    });

    // tempvar -> temp scope, tempVariable source
    expect(result.bindings[2]).toMatchObject({
      variableName: 'tempValue',
      scope: 'temp',
      direction: 'read',
      status: 'resolved',
      source: 'tempVariable',
      valuePreview: '42',
    });
  });

  it('preserves occurrence order and duplicates for repeated/adjacent reads', () => {
    const input: CbsPreviewVariableInjectionInput = {
      source: '{{getvar::first}}{{getvar::last}} {{getvar::first}}',
      previewOverrides: {
        chatVariables: {
          first: 'John',
          last: 'Doe',
        },
      },
    };

    const result = createCbsPreviewVariableInjection(input);

    // Should have 3 bindings in occurrence order (first, last, first)
    expect(result.bindings).toHaveLength(3);

    expect(result.bindings[0]).toMatchObject({
      variableName: 'first',
      status: 'resolved',
      valuePreview: 'John',
    });

    expect(result.bindings[1]).toMatchObject({
      variableName: 'last',
      status: 'resolved',
      valuePreview: 'Doe',
    });

    // Duplicate first should appear again, not deduplicated
    expect(result.bindings[2]).toMatchObject({
      variableName: 'first',
      status: 'resolved',
      valuePreview: 'John',
    });

    // Verify order is preserved - third binding should be first occurrence again
    expect(result.bindings[0].variableName).toBe('first');
    expect(result.bindings[1].variableName).toBe('last');
    expect(result.bindings[2].variableName).toBe('first');
  });

  it('returns empty arrays for source with no CBS variables', () => {
    const input: CbsPreviewVariableInjectionInput = {
      source: 'plain text only',
    };

    const result = createCbsPreviewVariableInjection(input);

    // Empty bindings
    expect(result.bindings).toHaveLength(0);

    // Empty warnings
    expect(result.warnings).toHaveLength(0);

    // Empty coverage notes
    expect(result.coverageNotes).toHaveLength(0);

    // Valid effective context
    expect(result.effectiveContext).toBeDefined();
    expect(result.effectiveContext.chatVariables).toEqual({});
  });

  it('resolves baseContext characterDefaultVariables and templateDefaultVariables via effective context', () => {
    const input: CbsPreviewVariableInjectionInput = {
      source: '{{getvar::charBase}} {{getvar::tmplBase}}',
      baseContext: {
        characterDefaultVariables: { charBase: 'from-base-char' },
        templateDefaultVariables: { tmplBase: 'from-base-tmpl' },
      },
    };

    const result = createCbsPreviewVariableInjection(input);

    expect(result.bindings).toHaveLength(2);

    // charBase: from baseContext.characterDefaultVariables
    expect(result.bindings[0]).toMatchObject({
      variableName: 'charBase',
      scope: 'chat',
      direction: 'read',
      status: 'resolved',
      source: 'characterDefault',
      valuePreview: 'from-base-char',
    });

    // tmplBase: from baseContext.templateDefaultVariables
    expect(result.bindings[1]).toMatchObject({
      variableName: 'tmplBase',
      scope: 'chat',
      direction: 'read',
      status: 'resolved',
      source: 'templateDefault',
      valuePreview: 'from-base-tmpl',
    });

    // Verify effective context includes the baseContext defaults
    expect(result.effectiveContext.characterDefaultVariables).toEqual({
      charBase: 'from-base-char',
    });
    expect(result.effectiveContext.templateDefaultVariables).toEqual({
      tmplBase: 'from-base-tmpl',
    });

    // No warnings for resolved variables
    expect(result.warnings).toHaveLength(0);
  });
});
