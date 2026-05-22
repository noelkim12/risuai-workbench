import { describe, expect, it } from 'vitest';

import { runNativeRegexPreview } from '../../../src/simulator/regex';

describe('runNativeRegexPreview', () => {
  it('collects global native matches with numeric and named captures', () => {
    const result = runNativeRegexPreview({
      pattern: '(?<label>[A-Z]+):(\\d+)',
      jsFlags: 'g',
      sampleInput: 'HP:12 MP:7',
    });

    expect(result.status).toBe('ok');
    expect(result.diagnostics).toEqual([]);
    expect(result.matches).toEqual([
      {
        text: 'HP:12',
        index: 0,
        length: 5,
        captures: [
          { name: '1', text: 'HP' },
          { name: '2', text: '12' },
        ],
        namedCaptures: [{ name: 'label', text: 'HP' }],
      },
      {
        text: 'MP:7',
        index: 6,
        length: 4,
        captures: [
          { name: '1', text: 'MP' },
          { name: '2', text: '7' },
        ],
        namedCaptures: [{ name: 'label', text: 'MP' }],
      },
    ]);
  });

  it('returns compile diagnostics for invalid native patterns', () => {
    const result = runNativeRegexPreview({
      pattern: '(',
      jsFlags: '',
      sampleInput: 'text',
    });

    expect(result.status).toBe('error');
    expect(result.matches).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'RISUREGEX_JS_COMPILE_ERROR',
      severity: 'error',
      source: 'risuregex-js',
      details: { pattern: '(', jsFlags: '' },
    });
  });

  it('aborts overlong input before compiling or matching', () => {
    const limits = { maxInputLength: 3 };
    const result = runNativeRegexPreview({
      pattern: '.',
      jsFlags: 'g',
      sampleInput: 'toolong',
      limits,
    });

    expect(limits).toEqual({ maxInputLength: 3 });
    expect(result.status).toBe('aborted');
    expect(result.matches).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'RISUREGEX_INPUT_TOO_LONG',
        severity: 'error',
        source: 'risuregex-js',
        details: { inputLength: 7, maxInputLength: 3 },
      }),
    ]);
  });

  it('advances zero-length global matches and reports match limits', () => {
    const result = runNativeRegexPreview({
      pattern: '.*?',
      jsFlags: 'g',
      sampleInput: 'ab',
      limits: { maxMatches: 2 },
    });

    expect(result.status).toBe('partial');
    expect(result.matches).toEqual([
      { text: '', index: 0, length: 0, captures: [], namedCaptures: [] },
      { text: '', index: 1, length: 0, captures: [], namedCaptures: [] },
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'RISUREGEX_MATCH_LIMIT',
        severity: 'error',
        source: 'risuregex-js',
        details: { maxMatches: 2 },
      }),
    ]);
  });

  it('collects only the first match without global flag', () => {
    const result = runNativeRegexPreview({
      pattern: '\\d+',
      jsFlags: '',
      sampleInput: 'a1 b22',
    });

    expect(result.status).toBe('ok');
    expect(result.matches).toEqual([
      { text: '1', index: 1, length: 1, captures: [], namedCaptures: [] },
    ]);
  });
});
