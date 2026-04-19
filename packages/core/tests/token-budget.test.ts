import { describe, expect, it } from 'vitest';
import { analyzeTokenBudget, estimateTokens } from '@/domain/analyze/token-budget';

describe('estimateTokens', () => {
  it('estimates roughly one token per four latin characters', () => {
    expect(estimateTokens('hello world')).toBeCloseTo(3, 0);
  });

  it('uses a conservative estimate for CJK text', () => {
    expect(estimateTokens('안녕하세요')).toBeCloseTo(5, 0);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('handles mixed latin and CJK content', () => {
    expect(estimateTokens('Hello 안녕')).toBe(4);
  });

  it('excludes CBS macros from token count', () => {
    const text = 'Hello {{getvar::mode}} world';
    const withoutMacro = 'Hello  world';

    expect(estimateTokens(text)).toBeLessThanOrEqual(estimateTokens(withoutMacro) + 1);
  });
});

describe('analyzeTokenBudget', () => {
  it('calculates category totals', () => {
    const result = analyzeTokenBudget([
      { category: 'lorebook', name: 'entry_1', text: 'Short entry text.', alwaysActive: false },
      { category: 'lorebook', name: 'entry_2', text: 'Another entry.', alwaysActive: true },
      { category: 'character', name: 'description', text: 'Character description here.', alwaysActive: true },
    ]);

    expect(result.byCategory.lorebook?.count).toBe(2);
    expect(result.byCategory.character?.count).toBe(1);
    expect(result.totals.worstCaseTokens).toBeGreaterThan(0);
  });

  it('separates always-active from conditional tokens', () => {
    const result = analyzeTokenBudget([
      { category: 'lorebook', name: 'constant', text: 'always on', alwaysActive: true },
      { category: 'lorebook', name: 'selective', text: 'sometimes on', alwaysActive: false },
    ]);

    expect(result.totals.alwaysActiveTokens).toBeGreaterThan(0);
    expect(result.totals.conditionalTokens).toBeGreaterThan(0);
    expect(result.totals.worstCaseTokens).toBe(
      result.totals.alwaysActiveTokens + result.totals.conditionalTokens,
    );
  });

  it('warns when worst-case exceeds typical context', () => {
    const result = analyzeTokenBudget([
      { category: 'lorebook', name: 'huge', text: 'x'.repeat(100000), alwaysActive: true },
    ]);

    expect(result.warnings.some((warning) => warning.severity === 'error')).toBe(true);
  });

  it('warns when a single component exceeds threshold', () => {
    const result = analyzeTokenBudget([
      { category: 'lorebook', name: 'big', text: 'x'.repeat(10000), alwaysActive: false },
    ]);

    expect(result.warnings.some((warning) => warning.severity === 'warning')).toBe(true);
  });

  it('returns no warnings for small content', () => {
    const result = analyzeTokenBudget([
      { category: 'character', name: 'description', text: 'Short.', alwaysActive: true },
    ]);

    expect(result.warnings).toHaveLength(0);
  });
});
