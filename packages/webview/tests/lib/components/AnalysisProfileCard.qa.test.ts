import { describe, expect, it } from 'vitest';
import type { AnalysisShowcase } from 'risu-workbench-core';
import type { BrowserAnalysisProfile, BrowserArtifactCard } from '../../../src/lib/types';
import { toAnalysisProfileViewModel } from '../../../src/lib/analysis-showcase/analysisProfileViewModel';
import { compile } from 'svelte/compiler';
import ProfileCardSource from '../../../src/lib/components/analysis-showcase/AnalysisProfileCard.svelte?raw';
import ActionsSource from '../../../src/lib/components/analysis-showcase/AnalysisProfileActions.svelte?raw';
import DetailViewSource from '../../../src/lib/components/ArtifactDetailView.svelte?raw';

// ---- Manual QA Harness ----
// The project has no jsdom/DOM-rendering harness; this test verifies
// the full view-model-to-component chain for each profile state
// through view model evaluation and source compilation/structure checks.

const showcase: AnalysisShowcase = {
  version: 1,
  artifact: { stableId: 'character:test', name: 'Test', type: 'character' },
  generatedAt: '2026-07-10T12:00:00.000Z',
  metrics: { variables: 10, connectedVariables: 5, lorebookEntries: 42, activationChains: 100 },
  distributions: { elements: [], variableConnectivity: [] },
  findings: { error: 0, warning: 3, information: 7 },
  traits: [
    { id: 'cross-layer', label: 'Cross-layer' },
    { id: 'deep-lore', label: 'Deep lore' },
  ],
  report: { html: 'charx-analysis.html' },
};

function makeCard(kind: 'character' | 'module' | 'plugin', profile: BrowserAnalysisProfile): BrowserArtifactCard {
  const base = {
    stableId: `${kind}:test`,
    manifestId: 'test',
    name: 'Test Artifact',
    status: 'ready' as const,
    markerUri: 'file:///test',
    rootUri: 'file:///test',
    rootPathLabel: 'workspace/test',
    markerPathLabel: '.risuchar',
    warnings: [],
    analysisProfile: profile,
  };
  if (kind === 'character') {
    return {
      ...base,
      artifactKind: 'character',
      creator: 'tester',
      characterVersion: '1.0.0',
      sourceFormat: 'json' as const,
      tags: [],
      flags: { utilityBot: false, lowLevelAccess: false },
    };
  }
  if (kind === 'module') {
    return {
      ...base,
      artifactKind: 'module',
      description: 'Test module',
      sourceFormat: 'json' as const,
      flags: { lowLevelAccess: false, hideIcon: false, hasCjs: false, hasMcp: false },
    };
  }
  return {
    ...base,
    artifactKind: 'plugin',
    description: 'Test plugin',
    framework: 'vanilla' as const,
  };
}

describe('Manual QA: profile state rendering for character and module', () => {
  describe('none state', () => {
    const profile: BrowserAnalysisProfile = { kind: 'none' };

    it('character card renders Reveal Analysis CTA', () => {
      const vm = toAnalysisProfileViewModel(profile);
      expect(vm.stateLabel).toBe('No analysis yet');
      expect(vm.canOpenShowcase).toBe(false);
      expect(vm.canOpenReport).toBe(false);
      expect(vm.canShare).toBe(false);
      expect(vm.metrics).toEqual([]);
    });

    it('module card renders Reveal Analysis CTA', () => {
      const card = makeCard('module', profile);
      const vm = toAnalysisProfileViewModel(card.analysisProfile);
      expect(vm.stateLabel).toBe('No analysis yet');
    });

    it('component source contains Reveal Analysis button', () => {
      expect(ActionsSource).toMatch(/Reveal Analysis/i);
    });
  });

  describe('legacy state', () => {
    const profile: BrowserAnalysisProfile = { kind: 'legacy', reportAvailable: true };

    it('character card renders Open Full Report + Re-analyze', () => {
      const vm = toAnalysisProfileViewModel(profile);
      expect(vm.stateLabel).toBe('Legacy report available');
      expect(vm.canOpenReport).toBe(true);
      expect(vm.canOpenShowcase).toBe(false);
      expect(vm.canShare).toBe(false);
      expect(vm.metrics).toEqual([]);
    });

    it('module card legacy state is identical', () => {
      const card = makeCard('module', profile);
      const vm = toAnalysisProfileViewModel(card.analysisProfile);
      expect(vm.canOpenReport).toBe(true);
    });

    it('component source contains Open Full Report for legacy', () => {
      expect(ActionsSource).toMatch(/Open Full Report/i);
    });
  });

  describe('invalid state', () => {
    it('malformed shows unreadable + Re-analyze', () => {
      const profile: BrowserAnalysisProfile = { kind: 'invalid', reason: 'malformed' };
      const vm = toAnalysisProfileViewModel(profile);
      expect(vm.stateLabel).toContain('unreadable');
      expect(vm.canOpenShowcase).toBe(false);
      expect(vm.canOpenReport).toBe(false);
    });

    it('unsupported-version shows unsupported version text', () => {
      const profile: BrowserAnalysisProfile = { kind: 'invalid', reason: 'unsupported-version' };
      expect(toAnalysisProfileViewModel(profile).stateLabel).toContain('unsupported version');
    });

    it('artifact-mismatch shows does not match text', () => {
      const profile: BrowserAnalysisProfile = { kind: 'invalid', reason: 'artifact-mismatch' };
      expect(toAnalysisProfileViewModel(profile).stateLabel).toContain('does not match');
    });

    it('component source contains Re-analyze for invalid', () => {
      expect(ActionsSource).toMatch(/Re-analyze/i);
    });
  });

  describe('available fresh state', () => {
    const profile: BrowserAnalysisProfile = {
      kind: 'available',
      freshness: 'fresh',
      reportAvailable: true,
      showcase,
    };

    it('character card shows Up to date + metrics + all actions', () => {
      const vm = toAnalysisProfileViewModel(profile);
      expect(vm.stateLabel).toBe('Up to date');
      expect(vm.isOutdated).toBe(false);
      expect(vm.generatedAtLabel).toBe('2026-07-10T12:00:00.000Z');
      expect(vm.metrics.length).toBe(4);
      expect(vm.canOpenShowcase).toBe(true);
      expect(vm.canOpenReport).toBe(true);
      expect(vm.canShare).toBe(true);
    });

    it('module card available fresh is identical', () => {
      const card = makeCard('module', profile);
      const vm = toAnalysisProfileViewModel(card.analysisProfile);
      expect(vm.stateLabel).toBe('Up to date');
    });

    it('component source omits showcase and image sharing actions', () => {
      expect(ActionsSource).not.toMatch(/Open Showcase/i);
      expect(ActionsSource).not.toMatch(/Share Image/i);
    });

    it('profile overview is collapsed behind a native disclosure', () => {
      expect(ProfileCardSource).toMatch(/<details[^>]*class="profile-card"/);
      expect(ProfileCardSource).toMatch(/<summary[^>]*class="profile-card__summary"/);
      expect(ProfileCardSource).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
    });

    it('profile overview omits findings', () => {
      expect(ProfileCardSource).not.toMatch(/findings/i);
    });
  });

  describe('available outdated state', () => {
    const profile: BrowserAnalysisProfile = {
      kind: 'available',
      freshness: 'outdated',
      reportAvailable: true,
      showcase,
    };

    it('marks outdated correctly', () => {
      const vm = toAnalysisProfileViewModel(profile);
      expect(vm.stateLabel).toBe('Outdated');
      expect(vm.isOutdated).toBe(true);
    });

    it('character and module both show outdated', () => {
      const charVm = toAnalysisProfileViewModel(makeCard('character', profile).analysisProfile);
      const modVm = toAnalysisProfileViewModel(makeCard('module', profile).analysisProfile);
      expect(charVm.isOutdated).toBe(true);
      expect(modVm.isOutdated).toBe(true);
    });
  });

  describe('available with missing report', () => {
    const profile: BrowserAnalysisProfile = {
      kind: 'available',
      freshness: 'fresh',
      reportAvailable: false,
      showcase,
    };

    it('disables Open Full Report button', () => {
      const vm = toAnalysisProfileViewModel(profile);
      expect(vm.canOpenReport).toBe(false);
      expect(vm.canOpenShowcase).toBe(true);
      expect(vm.canShare).toBe(true);
    });
  });

  describe('optional metric absent vs zero', () => {
    it('absent metrics are omitted from the view model', () => {
      const profile: BrowserAnalysisProfile = {
        kind: 'available',
        freshness: 'fresh',
        reportAvailable: true,
        showcase: { ...showcase, metrics: { variables: 10 } },
      };
      const vm = toAnalysisProfileViewModel(profile);
      const ids = vm.metrics.map((m) => m.id);
      expect(ids).toEqual(['variables']);
    });

    it('zero metrics are included with value 0', () => {
      const profile: BrowserAnalysisProfile = {
        kind: 'available',
        freshness: 'fresh',
        reportAvailable: true,
        showcase: { ...showcase, metrics: { variables: 0, luaFiles: 0 } },
      };
      const vm = toAnalysisProfileViewModel(profile);
      expect(vm.metrics.find((m) => m.id === 'variables')?.value).toBe(0);
      expect(vm.metrics.find((m) => m.id === 'luaFiles')?.value).toBe(0);
    });
  });
});

describe('Manual QA: plugin has no analysis surface', () => {
  it('plugin card always has none profile', () => {
    const card = makeCard('plugin', { kind: 'none' });
    expect(card.analysisProfile.kind).toBe('none');
  });

  it('ArtifactDetailView renders AnalysisProfileCard only for non-plugin', () => {
    // The component should be inside an {#if artifact.artifactKind !== 'plugin'} block
    expect(DetailViewSource).toMatch(/artifactKind !== 'plugin'/);
    expect(DetailViewSource).toMatch(/AnalysisProfileCard/);
  });

  it('standalone Analyze button is removed from detail actions', () => {
    // The old standalone Analyze button should not exist in the detail-actions
    expect(DetailViewSource).not.toMatch(/class="detail-action"[^>]*>[^<]*Analyze/);
  });

  it('Broadcast and Pack buttons are preserved', () => {
    expect(DetailViewSource).toMatch(/Broadcast/);
    expect(DetailViewSource).toMatch(/Pack/);
  });

  it('AnalysisProfileCard, AnalysisProfileActions, and ArtifactDetailView all compile', () => {
    expect(() =>
      compile(ProfileCardSource, { name: 'AnalysisProfileCard', filename: 'AnalysisProfileCard.svelte' }),
    ).not.toThrow();
    expect(() =>
      compile(ActionsSource, { name: 'AnalysisProfileActions', filename: 'AnalysisProfileActions.svelte' }),
    ).not.toThrow();
    expect(() =>
      compile(DetailViewSource, { name: 'ArtifactDetailView', filename: 'ArtifactDetailView.svelte' }),
    ).not.toThrow();
  });
});

describe('Manual QA: no quality score in any output', () => {
  it('view model JSON has no score field', () => {
    const profile: BrowserAnalysisProfile = {
      kind: 'available',
      freshness: 'fresh',
      reportAvailable: true,
      showcase,
    };
    const vm = toAnalysisProfileViewModel(profile);
    expect(JSON.stringify(vm)).not.toMatch(/score/i);
  });

  it('component source has no score reference', () => {
    expect(ProfileCardSource).not.toMatch(/score/i);
    expect(ActionsSource).not.toMatch(/score/i);
  });
});
