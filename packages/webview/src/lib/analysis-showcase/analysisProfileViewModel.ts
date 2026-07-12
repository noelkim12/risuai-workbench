import type { AnalysisShowcase } from 'risu-workbench-core';
import type { BrowserAnalysisProfile } from '../types';

const METRIC_LABELS: Readonly<Record<string, string>> = {
  variables: 'Variables',
  connectedVariables: 'Connected Variables',
  lorebookEntries: 'Lorebook Entries',
  luaFiles: 'Lua Files',
  luaFunctions: 'Lua Functions',
  regexScripts: 'Regex Scripts',
  activationChains: 'Activation Chains',
};

const METRIC_ORDER = [
  'variables',
  'connectedVariables',
  'lorebookEntries',
  'luaFiles',
  'luaFunctions',
  'regexScripts',
  'activationChains',
] as const;

export type AnalysisProfileViewModel = {
  readonly stateLabel: string;
  readonly generatedAtLabel: string | null;
  readonly metrics: readonly { readonly id: string; readonly label: string; readonly value: number }[];
  readonly canOpenShowcase: boolean;
  readonly canOpenReport: boolean;
  readonly canShare: boolean;
  readonly isOutdated: boolean;
};

function toMetricArray(metrics: AnalysisShowcase['metrics']): readonly { readonly id: string; readonly label: string; readonly value: number }[] {
  const result: { id: string; label: string; value: number }[] = [];
  for (const id of METRIC_ORDER) {
    const value = metrics[id];
    if (value !== undefined) {
      result.push({ id, label: METRIC_LABELS[id] ?? id, value });
    }
  }
  return result;
}

function invalidStateLabel(reason: 'malformed' | 'unsupported-version' | 'artifact-mismatch'): string {
  switch (reason) {
    case 'malformed':
      return 'Analysis data is unreadable';
    case 'unsupported-version':
      return 'Analysis data has an unsupported version';
    case 'artifact-mismatch':
      return 'Analysis data does not match this artifact';
  }
}

export function toAnalysisProfileViewModel(profile: BrowserAnalysisProfile): AnalysisProfileViewModel {
  switch (profile.kind) {
    case 'none':
      return {
        stateLabel: 'No analysis yet',
        generatedAtLabel: null,
        metrics: [],
        canOpenShowcase: false,
        canOpenReport: false,
        canShare: false,
        isOutdated: false,
      };
    case 'legacy':
      return {
        stateLabel: 'Legacy report available',
        generatedAtLabel: null,
        metrics: [],
        canOpenShowcase: false,
        canOpenReport: true,
        canShare: false,
        isOutdated: false,
      };
    case 'invalid':
      return {
        stateLabel: invalidStateLabel(profile.reason),
        generatedAtLabel: null,
        metrics: [],
        canOpenShowcase: false,
        canOpenReport: false,
        canShare: false,
        isOutdated: false,
      };
    case 'available':
      return {
        stateLabel: profile.freshness === 'fresh' ? 'Up to date' : 'Outdated',
        generatedAtLabel: profile.showcase.generatedAt,
        metrics: toMetricArray(profile.showcase.metrics),
        canOpenShowcase: true,
        canOpenReport: profile.reportAvailable,
        canShare: true,
        isOutdated: profile.freshness === 'outdated',
      };
  }
}
