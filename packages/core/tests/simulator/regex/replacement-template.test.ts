import { describe, expect, it } from 'vitest';

import { createSimpleReplacementDiff, previewRegexReplacement } from '../../../src/simulator/regex';

describe('previewRegexReplacement', () => {
  it('applies global native replacement semantics and captures template references', () => {
    const result = previewRegexReplacement({
      pattern: '(?<key>[A-Z]+):(\\d+)',
      jsFlags: 'g',
      sampleInput: 'HP:12 MP:7',
      replacement: '$<key>=$2',
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('HP=12 MP=7');
    expect(result.diagnostics).toEqual([]);
    expect(result.captureReferences).toEqual([
      { token: '$<key>', kind: 'named', name: 'key' },
      { token: '$2', kind: 'numeric', index: 2 },
    ]);
    expect(result.diff).toEqual([
      { operation: 'equal', kind: 'equal', text: 'HP' },
      { operation: 'delete', kind: 'delete', text: ':12 MP:' },
      { operation: 'insert', kind: 'insert', text: '=12 MP=' },
      { operation: 'equal', kind: 'equal', text: '7' },
    ]);
  });

  it('replaces only the first match when the global flag is absent', () => {
    const result = previewRegexReplacement({
      pattern: '\\d+',
      jsFlags: '',
      sampleInput: 'a1 b22',
      replacement: 'N',
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('aN b22');
    expect(result.diff).toEqual([
      { operation: 'equal', kind: 'equal', text: 'a' },
      { operation: 'delete', kind: 'delete', text: '1' },
      { operation: 'insert', kind: 'insert', text: 'N' },
      { operation: 'equal', kind: 'equal', text: ' b22' },
    ]);
  });

  it('returns original input and equal-only diff when there is no match', () => {
    const result = previewRegexReplacement({
      pattern: 'z+',
      jsFlags: 'g',
      sampleInput: 'abc',
      replacement: 'x',
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('abc');
    expect(result.diff).toEqual([{ operation: 'equal', kind: 'equal', text: 'abc' }]);
    expect(result.diagnostics).toEqual([]);
  });

  it('returns compile diagnostics for invalid native patterns without throwing', () => {
    const result = previewRegexReplacement({
      pattern: '(',
      jsFlags: '',
      sampleInput: 'text',
      replacement: 'x',
    });

    expect(result.status).toBe('error');
    expect(result.output).toBe('text');
    expect(result.diff).toEqual([{ operation: 'equal', kind: 'equal', text: 'text' }]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'RISUREGEX_JS_COMPILE_ERROR',
      severity: 'error',
      source: 'risuregex-js',
      details: { pattern: '(', jsFlags: '' },
    });
  });

  it('truncates replacement output at maxOutputLength with a partial diagnostic', () => {
    const limits = { maxOutputLength: 5 };
    const result = previewRegexReplacement({
      pattern: 'a',
      jsFlags: 'g',
      sampleInput: 'aaa',
      replacement: 'bbbb',
      limits,
    });

    expect(limits).toEqual({ maxOutputLength: 5 });
    expect(result.status).toBe('partial');
    expect(result.output).toBe('bbbbb');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'RISUREGEX_REPLACEMENT_OUTPUT_LIMIT',
        severity: 'warning',
        source: 'risuregex-js',
        details: { outputLength: 12, maxOutputLength: 5 },
      }),
    ]);
  });

  it('collects native replacement token kinds in first-seen order', () => {
    const result = previewRegexReplacement({
      pattern: '(a)',
      jsFlags: '',
      sampleInput: 'cat',
      replacement: "$$ $& $` $' $1 $<word> $1",
    });

    expect(result.captureReferences).toEqual([
      { token: '$$', kind: 'escaped-dollar' },
      { token: '$&', kind: 'match' },
      { token: '$`', kind: 'prefix' },
      { token: "$'", kind: 'suffix' },
      { token: '$1', kind: 'numeric', index: 1 },
      { token: '$<word>', kind: 'named', name: 'word' },
    ]);
  });
});

describe('createSimpleReplacementDiff', () => {
  it('creates deterministic delete and insert chunks', () => {
    expect(createSimpleReplacementDiff('abcXYZdef', 'abc12def')).toEqual([
      { operation: 'equal', kind: 'equal', text: 'abc' },
      { operation: 'delete', kind: 'delete', text: 'XYZ' },
      { operation: 'insert', kind: 'insert', text: '12' },
      { operation: 'equal', kind: 'equal', text: 'def' },
    ]);
  });
});
