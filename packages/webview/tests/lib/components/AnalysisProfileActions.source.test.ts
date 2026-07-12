import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import ActionsSource from '../../../src/lib/components/analysis-showcase/AnalysisProfileActions.svelte?raw';

describe('AnalysisProfileActions source contract (regression)', () => {
  it('compiles without throwing', () => {
    expect(() =>
      compile(ActionsSource, { name: 'AnalysisProfileActions', filename: 'AnalysisProfileActions.svelte' }),
    ).not.toThrow();
  });

  it('renders Reveal Analysis button for none state', () => {
    expect(ActionsSource).toMatch(/Reveal Analysis/i);
  });

  it('renders Open Full Report for legacy and available states', () => {
    expect(ActionsSource).toMatch(/Open Full Report/i);
  });

  it('renders Re-analyze for legacy, invalid, and available states', () => {
    expect(ActionsSource).toMatch(/Re-analyze/i);
  });

  it('omits showcase and image sharing actions', () => {
    expect(ActionsSource).not.toMatch(/Open Showcase/i);
    expect(ActionsSource).not.toMatch(/Share Image/i);
  });

  it('binds disabled to canOpenReport on the report button', () => {
    expect(ActionsSource).toMatch(/disabled.*canOpenReport/);
  });

  it('posts only stableId through action callbacks', () => {
    expect(ActionsSource).toMatch(/onAnalyze.*stableId/);
    expect(ActionsSource).toMatch(/onOpenReport.*stableId/);
  });

  it('never references a quality score', () => {
    expect(ActionsSource).not.toMatch(/score/i);
  });
});
