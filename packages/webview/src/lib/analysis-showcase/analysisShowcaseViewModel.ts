/**
 * Showcase view model with deterministic hero metric preference.
 * @file packages/webview/src/lib/analysis-showcase/analysisShowcaseViewModel.ts
 */

import type { AnalysisShowcase } from '@risuai-workbench/core';

export interface ShowcaseMetric {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

export interface ShowcaseDistributionBucket {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface AnalysisShowcaseViewModel {
  readonly artifactName: string;
  readonly artifactType: 'character' | 'module';
  readonly generatedAtLabel: string;
  readonly heroMetric: ShowcaseMetric;
  readonly supportingMetrics: readonly ShowcaseMetric[];
  readonly elementDistribution: readonly ShowcaseDistributionBucket[];
  readonly variableConnectivity: readonly ShowcaseDistributionBucket[];
  readonly findings: { readonly error: number; readonly warning: number; readonly information: number };
  readonly freshness: 'fresh' | 'outdated';
}

const METRIC_LABELS: Readonly<Record<string, string>> = {
  variables: 'Variables',
  connectedVariables: 'Connected Variables',
  lorebookEntries: 'Lorebook Entries',
  luaFiles: 'Lua Files',
  luaFunctions: 'Lua Functions',
  regexScripts: 'Regex Scripts',
  assetFiles: 'Asset Files',
  activationChains: 'Activation Chains',
  totalElements: 'Total Elements',
};

export function toAnalysisShowcaseViewModel(
  showcase: AnalysisShowcase,
  freshness: 'fresh' | 'outdated',
): AnalysisShowcaseViewModel {
  const heroMetric = resolveHeroMetric(showcase);
  const supportingMetrics = resolveSupportingMetrics(showcase, heroMetric.id);

  return {
    artifactName: showcase.artifact.name,
    artifactType: showcase.artifact.type,
    generatedAtLabel: showcase.generatedAt,
    heroMetric,
    supportingMetrics,
    elementDistribution: showcase.distributions.elements,
    variableConnectivity: showcase.distributions.variableConnectivity,
    findings: showcase.findings,
    freshness,
  };
}

function resolveHeroMetric(showcase: AnalysisShowcase): ShowcaseMetric {
  const metrics = showcase.metrics;

  if (metrics.activationChains !== undefined) {
    return { id: 'activationChains', label: METRIC_LABELS.activationChains, value: metrics.activationChains };
  }

  if (metrics.connectedVariables !== undefined) {
    return { id: 'connectedVariables', label: METRIC_LABELS.connectedVariables, value: metrics.connectedVariables };
  }

  const totalElements = showcase.distributions.elements.reduce((sum, bucket) => sum + bucket.count, 0);
  return { id: 'totalElements', label: METRIC_LABELS.totalElements, value: totalElements };
}

function resolveSupportingMetrics(showcase: AnalysisShowcase, heroId: string): ShowcaseMetric[] {
  const metrics = showcase.metrics;
  const candidates: readonly { readonly id: string; readonly value: number | undefined }[] = [
    { id: 'variables', value: metrics.variables },
    { id: 'connectedVariables', value: metrics.connectedVariables },
    { id: 'lorebookEntries', value: metrics.lorebookEntries },
    { id: 'luaFiles', value: metrics.luaFiles },
    { id: 'luaFunctions', value: metrics.luaFunctions },
    { id: 'regexScripts', value: metrics.regexScripts },
    { id: 'assetFiles', value: metrics.assetFiles },
    { id: 'activationChains', value: metrics.activationChains },
  ];

  return candidates
    .filter(
      (entry): entry is { readonly id: string; readonly value: number } =>
        entry.value !== undefined && entry.id !== heroId,
    )
    .map((entry) => ({ id: entry.id, label: METRIC_LABELS[entry.id], value: entry.value }));
}
