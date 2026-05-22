import { describe, expect, it } from 'vitest';

import { simulateRegexCbsSections } from '../../../src/simulator/regex';

describe('regex CBS section dry-run adapter', () => {
  it('simulates requested pattern and replacement sections with shared context', () => {
    const result = simulateRegexCbsSections({
      patternSource: '{{getvar::pattern}}',
      replacementSource: 'Hello {{getvar::name}}',
      simulatePattern: true,
      simulateReplacement: true,
      context: {
        chatVariables: {
          pattern: 'HP:(\\d+)',
          name: 'Noel',
        },
      },
    });

    expect(result.status).toBe('ok');
    expect(result.pattern.output).toBe('HP:(\\d+)');
    expect(result.replacement.output).toBe('Hello Noel');
    expect(result.pattern.coverage.byMacroName.getvar).toBe(1);
    expect(result.replacement.coverage.byMacroName.getvar).toBe(1);
    expect(result.diagnostics).toEqual([]);
  });

  it('passes through unrequested pattern sections without adapter diagnostics', () => {
    const result = simulateRegexCbsSections({
      patternSource: 'HP:(\\d+)',
      replacementSource: 'Hello {{getvar::name}}',
      simulatePattern: false,
      simulateReplacement: true,
      context: {
        chatVariables: {
          name: 'Noel',
        },
      },
    });

    expect(result.status).toBe('ok');
    expect(result.pattern).toMatchObject({
      status: 'ok',
      output: 'HP:(\\d+)',
      diagnostics: [],
      effects: [],
      trace: [],
      coverage: {
        totalMacros: 0,
        bySupportClass: {},
        unknownMacros: [],
        byMacroName: {},
      },
    });
    expect(result.pattern.document).toEqual({ nodes: [], diagnostics: [] });
    expect(result.replacement.output).toBe('Hello Noel');
    expect(result.diagnostics).toEqual([]);
  });

  it('maps CBS diagnostics into regex-local combined diagnostics', () => {
    const result = simulateRegexCbsSections({
      patternSource: 'A{{slot}}',
      replacementSource: '{{inlay::portrait}}',
      simulatePattern: true,
      simulateReplacement: true,
    });

    expect(result.status).toBe('partial');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBSSIM001',
          severity: 'warning',
          source: 'cbs-simulator',
          message: expect.stringContaining('slot'),
        }),
        expect.objectContaining({
          code: 'CBSSIM001',
          severity: 'warning',
          source: 'cbs-simulator',
          message: expect.stringContaining('inlay'),
        }),
      ]),
    );
    expect(result.diagnostics.every((diagnostic) => diagnostic.source.startsWith('cbs-'))).toBe(true);
  });
});
