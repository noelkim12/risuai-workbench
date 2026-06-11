import { describe, expect, it } from 'vitest';
import { runRegexWorkerRequest } from '../../../../src/lib/components/editor/regex/regexWorkerRunner';

const defaultLimits = { maxInputLength: 50_000, maxMatches: 1_000, maxOutputLength: 50_000 };

describe('runRegexWorkerRequest', () => {
  it('returns matches, captures, output, and performance', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r1',
      pattern: 'name:(.*)',
      flags: 'g',
      replacement: 'Hello $1',
      sampleInput: 'name:value',
      limits: defaultLimits,
    });

    expect(result.status).toBe('ok');
    expect(result.matches).toEqual([
      expect.objectContaining({
        text: 'name:value',
        index: 0,
        length: 10,
        captures: [{ name: '1', text: 'value' }],
        namedCaptures: [],
      }),
    ]);
    expect(result.output).toBe('Hello value');
    expect(result.performance.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.performance.matchCount).toBe(1);
  });

  it('collects named captures', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r2',
      pattern: 'name:(?<value>.*)',
      flags: '',
      replacement: '$<value>',
      sampleInput: 'name:value',
      limits: defaultLimits,
    });

    expect(result.status).toBe('ok');
    expect(result.matches).toEqual([
      expect.objectContaining({
        captures: [{ name: '1', text: 'value' }],
        namedCaptures: [{ name: 'value', text: 'value' }],
      }),
    ]);
    expect(result.output).toBe('value');
  });

  it('returns one match for non-global regexes', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r3',
      pattern: 'a',
      flags: '',
      replacement: 'x',
      sampleInput: 'aaa',
      limits: defaultLimits,
    });

    expect(result.status).toBe('ok');
    expect(result.matches).toHaveLength(1);
    expect(result.output).toBe('xaa');
  });

  it('advances zero-length global matches', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r4',
      pattern: 'a*',
      flags: 'g',
      replacement: 'x',
      sampleInput: 'bbb',
      limits: defaultLimits,
    });

    expect(result.status).toBe('ok');
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.length).toBeLessThanOrEqual(4);
  });

  it('returns compile errors as diagnostics', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r5',
      pattern: '(',
      flags: '',
      replacement: 'x',
      sampleInput: 'sample',
      limits: defaultLimits,
    });

    expect(result.status).toBe('error');
    expect(result.output).toBe('');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'RISUREGEX_JS_COMPILE_ERROR', severity: 'error' }),
    ]);
    expect(result.matches).toEqual([]);
  });

  it('aborts oversized input before compiling', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r6',
      pattern: 'sample',
      flags: '',
      replacement: 'x',
      sampleInput: 'sample',
      limits: { ...defaultLimits, maxInputLength: 3 },
    });

    expect(result.status).toBe('aborted');
    expect(result.output).toBe('');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'RISUREGEX_INPUT_TOO_LONG', severity: 'error' }),
    ]);
    expect(result.matches).toEqual([]);
  });

  it('truncates oversized output with a warning diagnostic', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r7',
      pattern: 'a',
      flags: 'g',
      replacement: 'long',
      sampleInput: 'aaa',
      limits: { ...defaultLimits, maxOutputLength: 5 },
    });

    expect(result.status).toBe('partial');
    expect(result.output).toBe('longl');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'RISUREGEX_OUTPUT_TOO_LONG', severity: 'warning' }),
    ]);
  });

  it('bounds zero-length global replacement output before full allocation', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r7b',
      pattern: '(?=a)',
      flags: 'g',
      replacement: '0123456789'.repeat(1_000),
      sampleInput: 'aaa',
      limits: { ...defaultLimits, maxOutputLength: 7 },
    });

    expect(result.status).toBe('partial');
    expect(result.output).toBe('0123456');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'RISUREGEX_OUTPUT_TOO_LONG', severity: 'warning' }),
    ]);
  });

  it('stops global matching at maxMatches', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r8',
      pattern: 'a',
      flags: 'g',
      replacement: 'x',
      sampleInput: 'aaaa',
      limits: { ...defaultLimits, maxMatches: 2 },
    });

    expect(result.status).toBe('ok');
    expect(result.matches).toHaveLength(2);
    expect(result.performance.matchCount).toBe(2);
  });

  it('reproduces multi-capture bracketed field replacement (user scenario)', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r9',
      pattern: '\\[Date: (.*?) \\| Daypart: (.*?) \\| Crowding: (.*?) \\| Heroine: (.*?) \\| Purpose: (.*?) \\| Line: (.*?) \\| Destination Station: (.*?) \\| Remain Stops: (.*?)\\]',
      flags: '',
      replacement: '($1 $2) $6: $3 $4 $5 $8 $7',
      sampleInput: '[Date: date | Daypart: daypart | Crowding: list | Heroine: heroine | Purpose: purpose | Line: line | Destination Station: station | Remain Stops: stops]',
      limits: defaultLimits,
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('(date daypart) line: list heroine purpose stops station');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].captures).toHaveLength(8);
  });

  it('returns ok with 11 captures and CBS-like replacement (user regression)', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r11cap',
      pattern: '\\[Heroine: (.*?) \\| Clothing: (.*?) \\| Underwear: (.*?) \\| Posture: (.*?) \\| Line: (.*?) \\| Station: (.*?) \\| Stops: (.*?) \\| Purpose: (.*?) \\| Arousal: (.*?) \\| Alert: (.*?) \\| Attention: (.*?)\\]',
      flags: '',
      replacement: '$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,{{calc::$9/150*100}}',
      sampleInput: '[Heroine: heroine | Clothing: clothing | Underwear: underwear | Posture: posture | Line: line | Station: station | Stops: stops | Purpose: purpose | Arousal: arousal | Alert: alert | Attention: attention]',
      limits: defaultLimits,
    });

    expect(result.status).toBe('ok');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].captures).toHaveLength(11);
    expect(result.matches[0].captures[8]).toEqual({ name: '9', text: 'arousal' });
    expect(result.matches[0].captures[9]).toEqual({ name: '10', text: 'alert' });
    expect(result.matches[0].captures[10]).toEqual({ name: '11', text: 'attention' });
    expect(result.output).toBe('heroine,clothing,underwear,posture,line,station,stops,purpose,arousal,alert,attention,{{calc::arousal/150*100}}');
  });

  it('returns original input when there are no matches', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r10',
      pattern: 'nomatch',
      flags: 'g',
      replacement: 'x',
      sampleInput: 'aaa',
      limits: defaultLimits,
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('aaa');
    expect(result.matches).toEqual([]);
    expect(result.performance.matchCount).toBe(0);
  });

  it('treats invalid $ sequences as literal text (regression)', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r11',
      pattern: '(a)',
      flags: '',
      replacement: '$0 $x $$ $&',
      sampleInput: 'a',
      limits: defaultLimits,
    });

    expect(result.output).toBe('$0 $x $ a');
  });

  it('treats out-of-range two-digit captures as literal (regression)', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r12',
      pattern: '(a)',
      flags: '',
      replacement: '$20 $00 $10',
      sampleInput: 'a',
      limits: defaultLimits,
    });

    expect(result.output).toBe('$20 $00 a0');
  });

  it('treats unmatched named captures as literal when no named groups exist (regression)', () => {
    const result = runRegexWorkerRequest({
      requestId: 'r13',
      pattern: '(a)',
      flags: '',
      replacement: '$<x> $<x',
      sampleInput: 'a',
      limits: defaultLimits,
    });

    expect(result.output).toBe('$<x> $<x');
  });
});
