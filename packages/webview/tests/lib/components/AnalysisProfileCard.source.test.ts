import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import ProfileCardSource from '../../../src/lib/components/analysis-showcase/AnalysisProfileCard.svelte?raw';

describe('AnalysisProfileCard source contract', () => {
  it('compiles without throwing', () => {
    expect(() =>
      compile(ProfileCardSource, { name: 'AnalysisProfileCard', filename: 'AnalysisProfileCard.svelte' }),
    ).not.toThrow();
  });

  it('renders creator-focused CTA paragraph for the none state', () => {
    expect(ProfileCardSource).toMatch(/Reveal your character's variables/i);
  });

  it('includes AnalysisProfileActions subcomponent with profileKind and canOpenReport', () => {
    expect(ProfileCardSource).toMatch(/AnalysisProfileActions/);
    expect(ProfileCardSource).toMatch(/profileKind/);
    expect(ProfileCardSource).toMatch(/canOpenReport/);
  });

  it('passes stableId and remaining action callbacks to the subcomponent', () => {
    expect(ProfileCardSource).toMatch(/\{stableId\}/);
    expect(ProfileCardSource).toMatch(/\{onAnalyze\}/);
    expect(ProfileCardSource).toMatch(/\{onOpenReport\}/);
  });

  it('uses a collapsed native disclosure for the profile overview', () => {
    expect(ProfileCardSource).toMatch(/<details[^>]*class="profile-card"/);
    expect(ProfileCardSource).toMatch(/<summary[^>]*class="profile-card__summary"/);
    expect(ProfileCardSource).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
  });

  it('omits findings and showcase actions', () => {
    expect(ProfileCardSource).not.toMatch(/findings/i);
    expect(ProfileCardSource).not.toMatch(/onOpenShowcase/);
    expect(ProfileCardSource).not.toMatch(/onShareAnalysis/);
  });

  it('does not rely on color alone for freshness or status', () => {
    expect(ProfileCardSource).toMatch(/aria-live\s*=\s*"polite"/);
    expect(ProfileCardSource).toMatch(/\{vm\.stateLabel\}/);
  });

  it('never references a quality score', () => {
    expect(ProfileCardSource).not.toMatch(/score/i);
  });
});
