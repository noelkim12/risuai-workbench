import { describe, expect, it } from 'vitest';
import { analyzePromptChain } from '@/domain/analyze/prompt-chain';

describe('analyzePromptChain', () => {
  it('identifies external dependency when prompt reads a var not written in chain', () => {
    const result = analyzePromptChain([
      { name: 'system', text: 'You are {{getvar::persona}}', type: 'plain' },
      { name: 'main', text: 'Respond as {{getvar::persona}}', type: 'chat' },
    ]);

    expect(result.externalDeps).toContain('persona');
  });

  it('detects late-write when a variable is written after it was needed', () => {
    const result = analyzePromptChain([
      { name: 'main', text: '{{getvar::mode}} response', type: 'chat' },
      { name: 'setup', text: '{{setvar::mode::story}}', type: 'plain' },
    ]);

    expect(result.issues.some((issue) => issue.type === 'late-write')).toBe(true);
  });

  it('tracks satisfied deps across chain links', () => {
    const result = analyzePromptChain([
      { name: 'init', text: '{{setvar::mode::story}}', type: 'plain' },
      { name: 'main', text: '{{getvar::mode}} response', type: 'chat' },
    ]);

    expect(result.chain[1]!.satisfiedDeps).toContain('mode');
    expect(result.chain[1]!.unsatisfiedDeps).not.toContain('mode');
  });

  it('identifies self-contained variables', () => {
    const result = analyzePromptChain([
      { name: 'init', text: '{{setvar::lang::ko}}', type: 'plain' },
      { name: 'main', text: '{{getvar::lang}}', type: 'chat' },
    ]);

    expect(result.selfContainedVars).toContain('lang');
  });

  it('detects redundant writes without an intervening read', () => {
    const result = analyzePromptChain([
      { name: 'init1', text: '{{setvar::mode::story}}', type: 'plain' },
      { name: 'init2', text: '{{setvar::mode::battle}}', type: 'plain' },
      { name: 'main', text: '{{getvar::mode}}', type: 'chat' },
    ]);

    expect(result.issues.some((issue) => issue.type === 'redundant-write')).toBe(true);
  });

  it('detects empty links', () => {
    const result = analyzePromptChain([
      { name: 'empty', text: '', type: 'plain' },
      { name: 'main', text: 'Hello', type: 'chat' },
    ]);

    expect(result.issues.some((issue) => issue.type === 'empty-link')).toBe(true);
  });

  it('calculates total estimated tokens', () => {
    const result = analyzePromptChain([
      { name: 'init', text: 'Setup text here', type: 'plain' },
      { name: 'main', text: 'Main response template', type: 'chat' },
    ]);

    expect(result.totalEstimatedTokens).toBeGreaterThan(0);
  });
});
