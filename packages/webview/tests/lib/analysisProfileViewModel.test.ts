import { describe, expect, it } from 'vitest';
import type { AnalysisShowcase } from 'risu-workbench-core';
import type { BrowserAnalysisProfile } from '../../src/lib/types';
import { toAnalysisProfileViewModel } from '../../src/lib/analysis-showcase/analysisProfileViewModel';

function makeShowcase(overrides: Partial<AnalysisShowcase['metrics']> = {}): AnalysisShowcase {
  return {
    version: 1,
    artifact: { stableId: 'character:test', name: 'Test', type: 'character' },
    generatedAt: '2026-07-10T12:00:00.000Z',
    metrics: { variables: 10, ...overrides },
    distributions: { elements: [], variableConnectivity: [] },
    findings: { error: 0, warning: 1, information: 2 },
    traits: [{ id: 'cross-layer', label: 'Cross-layer' }],
    report: { html: 'charx-analysis.html' },
  };
}

describe('toAnalysisProfileViewModel — none state', () => {
  const profile: BrowserAnalysisProfile = { kind: 'none' };

  it('shows a creator-focused state label', () => {
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.stateLabel).toBe('No analysis yet');
  });

  it('disables all actions', () => {
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.canOpenShowcase).toBe(false);
    expect(vm.canOpenReport).toBe(false);
    expect(vm.canShare).toBe(false);
  });

  it('has no metrics, generated time, or outdated flag', () => {
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.metrics).toEqual([]);
    expect(vm.generatedAtLabel).toBeNull();
    expect(vm.isOutdated).toBe(false);
  });
});

describe('toAnalysisProfileViewModel — legacy state', () => {
  const profile: BrowserAnalysisProfile = { kind: 'legacy', reportAvailable: true };

  it('shows a legacy state label', () => {
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.stateLabel).toBe('Legacy report available');
  });

  it('enables report opening only', () => {
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.canOpenReport).toBe(true);
    expect(vm.canOpenShowcase).toBe(false);
    expect(vm.canShare).toBe(false);
  });

  it('has no guessed metrics', () => {
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.metrics).toEqual([]);
    expect(vm.generatedAtLabel).toBeNull();
  });
});

describe('toAnalysisProfileViewModel — invalid state', () => {
  it('shows reason for malformed', () => {
    const profile: BrowserAnalysisProfile = { kind: 'invalid', reason: 'malformed' };
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.stateLabel).toContain('unreadable');
    expect(vm.canOpenShowcase).toBe(false);
    expect(vm.canOpenReport).toBe(false);
    expect(vm.canShare).toBe(false);
  });

  it('shows reason for unsupported-version', () => {
    const profile: BrowserAnalysisProfile = { kind: 'invalid', reason: 'unsupported-version' };
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.stateLabel).toContain('unsupported version');
  });

  it('shows reason for artifact-mismatch', () => {
    const profile: BrowserAnalysisProfile = { kind: 'invalid', reason: 'artifact-mismatch' };
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.stateLabel).toContain('does not match');
  });
});

describe('toAnalysisProfileViewModel — available state', () => {
  it('shows freshness and generated time for fresh profile', () => {
    const profile: BrowserAnalysisProfile = {
      kind: 'available',
      freshness: 'fresh',
      reportAvailable: true,
      showcase: makeShowcase(),
    };
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.stateLabel).toBe('Up to date');
    expect(vm.isOutdated).toBe(false);
    expect(vm.generatedAtLabel).toBe('2026-07-10T12:00:00.000Z');
  });

  it('marks outdated profile', () => {
    const profile: BrowserAnalysisProfile = {
      kind: 'available',
      freshness: 'outdated',
      reportAvailable: true,
      showcase: makeShowcase(),
    };
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.stateLabel).toBe('Outdated');
    expect(vm.isOutdated).toBe(true);
  });

  it('enables all actions when report is available', () => {
    const profile: BrowserAnalysisProfile = {
      kind: 'available',
      freshness: 'fresh',
      reportAvailable: true,
      showcase: makeShowcase(),
    };
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.canOpenShowcase).toBe(true);
    expect(vm.canOpenReport).toBe(true);
    expect(vm.canShare).toBe(true);
  });

  it('disables report action when report is missing', () => {
    const profile: BrowserAnalysisProfile = {
      kind: 'available',
      freshness: 'fresh',
      reportAvailable: false,
      showcase: makeShowcase(),
    };
    const vm = toAnalysisProfileViewModel(profile);
    expect(vm.canOpenShowcase).toBe(true);
    expect(vm.canOpenReport).toBe(false);
    expect(vm.canShare).toBe(true);
  });

  it('includes only present metrics — zero is included, absent is omitted', () => {
    const profile: BrowserAnalysisProfile = {
      kind: 'available',
      freshness: 'fresh',
      reportAvailable: true,
      showcase: makeShowcase({ variables: 0, lorebookEntries: 42 }),
    };
    const vm = toAnalysisProfileViewModel(profile);
    const ids = vm.metrics.map((m) => m.id);
    expect(ids).toContain('variables');
    expect(vm.metrics.find((m) => m.id === 'variables')?.value).toBe(0);
    expect(ids).toContain('lorebookEntries');
    expect(vm.metrics.find((m) => m.id === 'lorebookEntries')?.value).toBe(42);
    expect(ids).not.toContain('connectedVariables');
    expect(ids).not.toContain('luaFiles');
    expect(ids).not.toContain('luaFunctions');
    expect(ids).not.toContain('regexScripts');
    expect(ids).not.toContain('activationChains');
  });

  it('never exposes a quality score', () => {
    const profile: BrowserAnalysisProfile = {
      kind: 'available',
      freshness: 'fresh',
      reportAvailable: true,
      showcase: makeShowcase(),
    };
    const vm = toAnalysisProfileViewModel(profile);
    const json = JSON.stringify(vm);
    expect(json).not.toMatch(/score/i);
  });
});
