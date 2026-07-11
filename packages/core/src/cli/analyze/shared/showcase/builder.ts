import {
  ANALYSIS_SHOWCASE_VERSION,
  analysisShowcaseSchema,
  getCustomScripts,
  type AnalysisShowcase,
  type UnifiedVarEntry,
} from '@/domain';
import type { CharxReportData } from '../../charx/types';
import type { ModuleReportData } from '../../module/types';
import { t, type Locale } from '../i18n';

export type AnalysisShowcaseBuildInput =
  | {
      readonly kind: 'character';
      readonly stableId: string;
      readonly data: CharxReportData;
      readonly locale: Locale;
      readonly generatedAt: string;
      readonly reportHtml: 'charx-analysis.html';
    }
  | {
      readonly kind: 'module';
      readonly stableId: string;
      readonly data: ModuleReportData;
      readonly locale: Locale;
      readonly generatedAt: string;
      readonly reportHtml: 'module-analysis.html';
    };

type DerivedMetrics = {
  readonly activationChains: number;
  readonly assetFiles: number;
  readonly connectedVariables: number;
  readonly lorebookEntries: number;
  readonly luaFiles: number;
  readonly luaFunctions: number;
  readonly regexScripts: number;
  readonly variables: number;
};

export function buildAnalysisShowcase(input: AnalysisShowcaseBuildInput): AnalysisShowcase {
  const metrics = deriveMetrics(input);
  const payload = {
    version: ANALYSIS_SHOWCASE_VERSION,
    artifact: {
      stableId: input.stableId,
      name: getArtifactName(input),
      type: input.kind,
    },
    generatedAt: input.generatedAt,
    metrics: {
      variables: metrics.variables,
      connectedVariables: metrics.connectedVariables,
      lorebookEntries: metrics.lorebookEntries,
      luaFiles: metrics.luaFiles,
      luaFunctions: metrics.luaFunctions,
      regexScripts: metrics.regexScripts,
      assetFiles: metrics.assetFiles,
      activationChains: metrics.activationChains,
    },
    distributions: {
      elements: buildElementDistribution(input.data.unifiedGraph, input.locale),
      variableConnectivity: [
        { id: 'bridged', label: t(input.locale, 'common.label.bridged'), count: metrics.connectedVariables },
        { id: 'isolated', label: t(input.locale, 'common.label.isolated'), count: input.data.unifiedGraph.size - metrics.connectedVariables },
      ],
    },
    findings: deriveFindings(input.data.deadCode.findings),
    traits: [],
    report: { html: input.reportHtml },
  };

  return analysisShowcaseSchema.parse(payload);
}

function getArtifactName(input: AnalysisShowcaseBuildInput): string {
  switch (input.kind) {
    case 'character':
      return input.data.characterName;
    case 'module':
      return input.data.moduleName;
    default:
      return assertNever(input);
  }
}

function deriveMetrics(input: AnalysisShowcaseBuildInput): DerivedMetrics {
  return {
    variables: input.data.unifiedGraph.size,
    connectedVariables: Array.from(input.data.unifiedGraph.values()).filter((entry) => entry.direction === 'bridged').length,
    lorebookEntries: input.data.lorebookStructure?.stats.totalEntries ?? 0,
    luaFiles: input.data.luaArtifacts.length,
    luaFunctions: input.data.luaArtifacts.reduce((total, artifact) => total + artifact.serialized.functions.length, 0),
    regexScripts: input.kind === 'character' ? getCustomScripts(input.data.charx).length : input.data.collected.regexScriptTotal,
    assetFiles: input.data.assetFiles,
    activationChains: input.data.lorebookActivationChain.edges.length,
  };
}

function buildElementDistribution(graph: Map<string, UnifiedVarEntry>, locale: Locale): AnalysisShowcase['distributions']['elements'] {
  const counts = new Map<string, number>();
  for (const entry of graph.values()) {
    for (const elementType of Object.keys(entry.sources)) {
      counts.set(elementType, (counts.get(elementType) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => ({ id, label: sourceLabel(id, locale), count }));
}

function sourceLabel(id: string, locale: Locale): string {
  const key = SOURCE_LABEL_KEYS[id];
  return key === undefined ? id : t(locale, key);
}

function deriveFindings(findings: CharxReportData['deadCode']['findings']): AnalysisShowcase['findings'] {
  const warning = findings.filter((finding) => finding.severity === 'warning').length;
  const information = findings.filter((finding) => finding.severity === 'info').length;
  return { error: 0, warning, information };
}

const SOURCE_LABEL_KEYS: Record<string, string> = {
  html: 'common.label.backgroundHtml',
  lorebook: 'common.label.lorebook',
  lua: 'common.label.lua',
  regex: 'common.label.regex',
  typescript: 'common.label.runtimeSnapshot',
};

function assertNever(value: never): never {
  throw new Error(`Unexpected showcase build input: ${JSON.stringify(value)}`);
}
