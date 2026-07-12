import type { AnalysisShowcase } from 'risu-workbench-core';

const METRIC_KEYS: ReadonlySet<string> = new Set([
  'variables',
  'connectedVariables',
  'lorebookEntries',
  'luaFiles',
  'luaFunctions',
  'regexScripts',
  'assetFiles',
  'activationChains',
]);

const TRAIT_IDS = new Set([
  'cross-layer',
  'chain-reaction',
  'deep-lore',
  'lua-driven',
  'regex-rich',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isBucket(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    hasOnlyKeys(value, ['id', 'label', 'count']) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.label === 'string' &&
    value.label.length > 0 &&
    isCount(value.count)
  );
}

function isSafeReportName(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.includes('/') || value.includes('\\')) return false;
  try {
    const decoded = decodeURIComponent(value);
    return !decoded.includes('/') && !decoded.includes('\\') && decoded !== '.' && decoded !== '..' && decoded.endsWith('.html');
  } catch (error) {
    if (error instanceof URIError) return false;
    throw error;
  }
}

function hasValidMetrics(value: unknown): boolean {
  if (!isPlainRecord(value) || !Object.keys(value).every((key) => METRIC_KEYS.has(key))) return false;
  return Object.values(value).every(isCount);
}

export function isAnalysisShowcase(value: unknown): value is AnalysisShowcase {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ['version', 'artifact', 'generatedAt', 'metrics', 'distributions', 'findings', 'traits', 'report']) ||
    value.version !== 1 ||
    typeof value.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    !hasValidMetrics(value.metrics)
  ) {
    return false;
  }

  const { artifact, distributions, findings, report, traits } = value;
  return (
    isPlainRecord(artifact) &&
    hasOnlyKeys(artifact, ['stableId', 'name', 'type']) &&
    typeof artifact.stableId === 'string' && artifact.stableId.length > 0 &&
    typeof artifact.name === 'string' && artifact.name.length > 0 &&
    (artifact.type === 'character' || artifact.type === 'module') &&
    isPlainRecord(distributions) &&
    hasOnlyKeys(distributions, ['elements', 'variableConnectivity']) &&
    Array.isArray(distributions.elements) && distributions.elements.every(isBucket) &&
    Array.isArray(distributions.variableConnectivity) && distributions.variableConnectivity.every(isBucket) &&
    isPlainRecord(findings) &&
    hasOnlyKeys(findings, ['error', 'warning', 'information']) &&
    isCount(findings.error) && isCount(findings.warning) && isCount(findings.information) &&
    Array.isArray(traits) && traits.length <= 4 && traits.every((trait) =>
      isPlainRecord(trait) && hasOnlyKeys(trait, ['id', 'label']) &&
      typeof trait.id === 'string' && TRAIT_IDS.has(trait.id) &&
      typeof trait.label === 'string' && trait.label.length > 0) &&
    isPlainRecord(report) && hasOnlyKeys(report, ['html']) && isSafeReportName(report.html)
  );
}
