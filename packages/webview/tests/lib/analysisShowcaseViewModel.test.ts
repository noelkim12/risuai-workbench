import { describe, expect, it } from 'vitest';
import type { AnalysisShowcase } from '@risuai-workbench/core';
import { toAnalysisShowcaseViewModel } from '../../src/lib/analysis-showcase/analysisShowcaseViewModel';

const baseShowcase: AnalysisShowcase = {
  version: 1,
  artifact: { stableId: 'char-1', name: 'Merry Sisters', type: 'character' },
  generatedAt: '2026-07-10T00:00:00.000Z',
  metrics: { variables: 12, connectedVariables: 8, lorebookEntries: 50, assetFiles: 24, activationChains: 5 },
  distributions: {
    elements: [
      { id: 'lorebooks', label: 'Lorebooks', count: 3 },
      { id: 'lua', label: 'Lua', count: 5 },
    ],
    variableConnectivity: [
      { id: 'bridged', label: 'Bridged', count: 8 },
      { id: 'isolated', label: 'Isolated', count: 4 },
    ],
  },
  findings: { error: 0, warning: 2, information: 5 },
  traits: [
    { id: 'cross-layer', label: 'Cross-layer' },
    { id: 'deep-lore', label: 'Deep lore' },
  ],
  report: { html: 'charx-analysis.html' },
};

describe('toAnalysisShowcaseViewModel', () => {
  it('prefers activationChains as hero metric when present', () => {
    const vm = toAnalysisShowcaseViewModel(baseShowcase, 'fresh');
    expect(vm.heroMetric).toEqual({ id: 'activationChains', label: 'Activation Chains', value: 5 });
  });

  it('falls back to connectedVariables when activationChains is absent', () => {
    const showcase: AnalysisShowcase = {
      ...baseShowcase,
      metrics: { variables: 12, connectedVariables: 8, lorebookEntries: 50 },
    };
    const vm = toAnalysisShowcaseViewModel(showcase, 'fresh');
    expect(vm.heroMetric).toEqual({ id: 'connectedVariables', label: 'Connected Variables', value: 8 });
  });

  it('falls back to sum of element distribution counts when neither activationChains nor connectedVariables', () => {
    const showcase: AnalysisShowcase = {
      ...baseShowcase,
      metrics: { variables: 12, lorebookEntries: 50 },
    };
    const vm = toAnalysisShowcaseViewModel(showcase, 'fresh');
    expect(vm.heroMetric).toEqual({ id: 'totalElements', label: 'Total Elements', value: 8 });
  });

  it('presents only defined supporting metrics', () => {
    const showcase: AnalysisShowcase = {
      ...baseShowcase,
      metrics: { variables: 12, activationChains: 5 },
    };
    const vm = toAnalysisShowcaseViewModel(showcase, 'fresh');
    const metricIds = vm.supportingMetrics.map((m) => m.id);
    expect(metricIds).toContain('variables');
    expect(metricIds).not.toContain('connectedVariables');
    expect(metricIds).not.toContain('lorebookEntries');
  });

  it('presents asset file count as a supporting metric', () => {
    const vm = toAnalysisShowcaseViewModel(baseShowcase, 'fresh');

    expect(vm.supportingMetrics).toContainEqual({ id: 'assetFiles', label: 'Asset Files', value: 24 });
  });

  it('omits legacy traits while passing findings counts and freshness through', () => {
    const vm = toAnalysisShowcaseViewModel(baseShowcase, 'outdated');
    expect(vm).not.toHaveProperty('traits');
    expect(vm.findings).toEqual({ error: 0, warning: 2, information: 5 });
    expect(vm.freshness).toBe('outdated');
  });

  it('includes artifact identity', () => {
    const vm = toAnalysisShowcaseViewModel(baseShowcase, 'fresh');
    expect(vm.artifactName).toBe('Merry Sisters');
    expect(vm.artifactType).toBe('character');
  });

  it('includes distribution summaries', () => {
    const vm = toAnalysisShowcaseViewModel(baseShowcase, 'fresh');
    expect(vm.elementDistribution).toEqual(baseShowcase.distributions.elements);
    expect(vm.variableConnectivity).toEqual(baseShowcase.distributions.variableConnectivity);
  });

  it('includes generatedAt label', () => {
    const vm = toAnalysisShowcaseViewModel(baseShowcase, 'fresh');
    expect(vm.generatedAtLabel).toBe('2026-07-10T00:00:00.000Z');
  });
});
