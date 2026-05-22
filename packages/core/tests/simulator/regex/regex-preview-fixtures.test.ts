import { describe, expect, it } from 'vitest';

import { DEFAULT_LIMITS, REGEX_PREVIEW_FIXTURES, simulateRisuRegexPreview } from '../../../src/simulator/regex';

describe('regex preview fixture corpus', () => {
  it('keeps the fixture corpus non-empty and typed around default limits', () => {
    expect(REGEX_PREVIEW_FIXTURES.length).toBeGreaterThan(0);
    expect(DEFAULT_LIMITS).toMatchObject({
      maxInputLength: 20_000,
      maxOutputLength: 20_000,
      maxMatches: 500,
      timeoutMs: 250,
    });
  });

  it.each(REGEX_PREVIEW_FIXTURES)('$id matches replacement and confidence exactly', (fixture) => {
    const result = simulateRisuRegexPreview({
      rawDocument: fixture.rawDocument,
      sampleInput: fixture.sampleInput,
      limits: DEFAULT_LIMITS,
    });

    expect(result.nativePreview.matches.map((match) => match.text)).toEqual(fixture.expectedMatchTexts);
    expect(result.replacementPreview.output).toBe(fixture.expectedReplacementOutput);
    expect(result.replacementPlan.confidence).toBe(fixture.expectedConfidence);
  });
});
