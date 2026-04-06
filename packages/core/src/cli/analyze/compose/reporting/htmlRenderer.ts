import fs from 'node:fs';
import path from 'node:path';
import { createVisualizationDoc, buildMetricGrid, buildChartPanel, buildDiagramPanel, buildFindingsPanel, buildTablePanel } from '../../shared/view-model';
import { renderHtmlReportShell } from '../../shared/html-report-shell';
import { escapeHtml } from '../../../shared';
import { createSourceId } from '../../shared/source-links';
import { type Locale, t } from '../../shared/i18n';
import type { VisualizationSource } from '../../shared/visualization-types';
import type { ComposeReportData } from '../types';

/** compose HTML 리포트를 생성한다. */
export function renderComposeHtml(data: ComposeReportData, analysisDir: string, locale: Locale = 'ko'): void {
  const { result } = data;
  const sources = buildSources(data);
  const doc = createVisualizationDoc('compose', 'Composition Analysis');

  doc.summary.score = result.summary.compatibilityScore;
  doc.summary.totals = [
    { label: t(locale, 'compose.label.artifacts'), value: result.artifacts.length },
    { label: t(locale, 'compose.label.conflicts'), value: result.summary.totalConflicts, severity: result.summary.totalConflicts > 0 ? 'warning' : 'info' },
    { label: t(locale, 'common.label.variables'), value: result.mergedVariableFlow.summary.totalVariables },
    { label: t(locale, 'compose.label.compatibility'), value: `${result.summary.compatibilityScore}/100`, severity: result.summary.compatibilityScore >= 80 ? 'info' : result.summary.compatibilityScore >= 50 ? 'warning' : 'error' },
  ];
  doc.summary.highlights = [
    {
      title: t(locale, 'compose.highlight.compatScore'),
      message: t(locale, 'compose.highlight.compatMsg', result.summary.compatibilityScore),
      severity: result.summary.compatibilityScore >= 80 ? 'info' : result.summary.compatibilityScore >= 50 ? 'warning' : 'error',
    },
    ...(result.conflicts.length > 0
      ? result.conflicts.slice(0, 2).map((conflict) => ({
          title: conflict.type,
          message: conflict.message,
          severity: conflict.severity,
        }))
      : [{ title: t(locale, 'compose.label.conflicts'), message: t(locale, 'compose.highlight.noConflicts'), severity: 'info' as const }]),
  ];
  doc.summary.nextActions = buildNextActions(data, locale);
  doc.sources = sources;
  doc.panels = [
    buildMetricGrid('compose-overview', t(locale, 'common.label.overview'), [
      { label: t(locale, 'compose.label.artifacts'), value: result.artifacts.length },
      { label: t(locale, 'compose.label.conflicts'), value: result.summary.totalConflicts, severity: result.summary.totalConflicts > 0 ? 'warning' : 'info' },
      { label: t(locale, 'common.label.flowIssues'), value: result.mergedVariableFlow.summary.withIssues, severity: result.mergedVariableFlow.summary.withIssues > 0 ? 'warning' : 'info' },
      { label: t(locale, 'compose.label.compatibilityScore'), value: result.summary.compatibilityScore, severity: result.summary.compatibilityScore >= 80 ? 'info' : result.summary.compatibilityScore >= 50 ? 'warning' : 'error' },
    ]),
    buildChartPanel('compose-severity-histogram', t(locale, 'compose.chart.severityHistogram'), {
      type: 'bar',
      data: {
        labels: [t(locale, 'shell.filter.error'), t(locale, 'shell.filter.warning'), t(locale, 'shell.filter.info')],
        datasets: [{
          data: [result.summary.bySeverity.error ?? 0, result.summary.bySeverity.warning ?? 0, result.summary.bySeverity.info ?? 0],
          backgroundColor: ['#f87171', '#f59e0b', '#38bdf8'],
        }],
      },
    }),
    buildChartPanel('compose-type-distribution', t(locale, 'compose.chart.typeDistribution'), buildConflictTypeChart(data)),
    buildDiagramPanel('compose-conflict-graph', t(locale, 'compose.panel.conflictGraph'), 'cytoscape', buildConflictGraph(data), 'flow', 320),
    buildFindingsPanel('compose-risks', t(locale, 'compose.panel.findings'), result.conflicts.length > 0 ? result.conflicts.map((conflict) => ({
      severity: conflict.severity,
      message: conflict.message,
      sourceIds: conflict.sources.map((source) => createSourceId(`${source.artifact}:${source.element}`)),
    })) : [{ severity: 'info', message: t(locale, 'compose.finding.noConflicts'), sourceIds: [] }]),
    buildTablePanel(
      'compose-conflicts',
      t(locale, 'compose.panel.conflictTable'),
      [t(locale, 'compose.table.severity'), t(locale, 'compose.table.type'), t(locale, 'compose.table.message'), t(locale, 'compose.table.sources')],
      result.conflicts.length > 0
        ? result.conflicts.map((conflict) => ({
            cells: [conflict.severity, conflict.type, escapeHtml(conflict.message), escapeHtml(conflict.sources.map((source) => `${source.artifact}:${source.element}`).join(', '))],
            severity: conflict.severity,
            sourceIds: conflict.sources.map((source) => createSourceId(`${source.artifact}:${source.element}`)),
            searchText: [conflict.type, conflict.message, ...conflict.sources.map((source) => `${source.artifact}:${source.element}`)].join(' '),
          }))
        : [{ cells: ['info', 'none', t(locale, 'compose.finding.noConflicts'), '—'], severity: 'info' }],
      'sources',
      t(locale, 'compose.filter.conflicts'),
    ),
    buildTablePanel(
      'compose-pair-hotspots',
      t(locale, 'compose.panel.conflictPairs'),
      [t(locale, 'compose.label.artifacts'), t(locale, 'compose.label.conflicts'), t(locale, 'compose.table.severities'), t(locale, 'compose.table.types')],
      buildConflictPairRows(data, locale),
      'sources',
      t(locale, 'compose.filter.pairs'),
    ),
  ];

  fs.mkdirSync(analysisDir, { recursive: true });
  const { html, clientJs } = renderHtmlReportShell(doc, locale);
  fs.writeFileSync(path.join(analysisDir, 'compose-analysis.html'), html, 'utf-8');
  fs.writeFileSync(path.join(analysisDir, 'report.js'), clientJs, 'utf-8');
}

function buildConflictGraph(data: ComposeReportData): Record<string, unknown> {
  const nodeIds = new Set<string>();
  const edges: Array<Record<string, unknown>> = [];
  const pairHotspots = buildConflictPairs(data);

  for (const conflict of data.result.conflicts) {
    for (const source of conflict.sources) {
      nodeIds.add(source.artifact);
      nodeIds.add(`${source.artifact}:${source.element}`);
      edges.push({
        data: {
          id: `${source.artifact}:${source.element}:${conflict.type}`,
          source: source.artifact,
          target: `${source.artifact}:${source.element}`,
          label: conflict.type,
          severity: conflict.severity,
        },
      });
    }
  }

  return {
    summary: {
      artifacts: data.result.artifacts.length,
      hotspots: pairHotspots.slice(0, 5).map((pair) => ({
        pair: pair.label,
        conflicts: pair.conflicts,
        severities: pair.severities,
      })),
    },
    elements: [
      ...[...nodeIds].map((id) => ({ data: { id, label: id } })),
      ...edges,
    ],
  };
}

function buildConflictTypeChart(data: ComposeReportData): Record<string, unknown> {
  const entries = Object.entries(data.result.summary.byType);
  return {
    type: 'bar',
    data: {
      labels: entries.map(([type]) => type),
      datasets: [
        {
          data: entries.map(([, count]) => count),
          backgroundColor: entries.map(([type]) =>
            type.includes('namespace') ? '#f59e0b' : type.includes('collision') ? '#38bdf8' : '#f87171',
          ),
        },
      ],
    },
  };
}

function buildConflictPairRows(data: ComposeReportData, locale: Locale): Array<{
  cells: string[];
  severity: 'info' | 'warning' | 'error';
  searchText: string;
}> {
  const pairs = buildConflictPairs(data);
  if (pairs.length === 0) {
    return [{ cells: ['—', '0', '—', t(locale, 'compose.empty.noPairConflicts')], severity: 'info', searchText: 'no pair conflicts' }];
  }

  return pairs.map((pair) => ({
    cells: [pair.label, String(pair.conflicts), pair.severities.join(', '), pair.types.join(', ')],
    severity: pair.highestSeverity,
    searchText: [pair.label, ...pair.severities, ...pair.types].join(' '),
  }));
}

function buildConflictPairs(data: ComposeReportData): Array<{
  label: string;
  conflicts: number;
  severities: string[];
  types: string[];
  highestSeverity: 'info' | 'warning' | 'error';
}> {
  const pairMap = new Map<string, { conflicts: number; severities: Set<string>; types: Set<string>; highestSeverity: 'info' | 'warning' | 'error' }>();

  for (const conflict of data.result.conflicts) {
    const artifacts = [...new Set(conflict.sources.map((source) => source.artifact))].sort((left, right) => left.localeCompare(right));
    const label = artifacts.length >= 2 ? artifacts.join(' ↔ ') : `${artifacts[0] ?? 'single-artifact'} ↔ self`;
    const existing = pairMap.get(label) ?? {
      conflicts: 0,
      severities: new Set<string>(),
      types: new Set<string>(),
      highestSeverity: 'info' as const,
    };
    existing.conflicts += 1;
    existing.severities.add(conflict.severity);
    existing.types.add(conflict.type);
    existing.highestSeverity = pickHigherSeverity(existing.highestSeverity, conflict.severity);
    pairMap.set(label, existing);
  }

  return [...pairMap.entries()]
    .map(([label, value]) => ({
      label,
      conflicts: value.conflicts,
      severities: [...value.severities],
      types: [...value.types],
      highestSeverity: value.highestSeverity,
    }))
    .sort((left, right) => right.conflicts - left.conflicts || left.label.localeCompare(right.label));
}

function pickHigherSeverity(
  left: 'info' | 'warning' | 'error',
  right: 'info' | 'warning' | 'error',
): 'info' | 'warning' | 'error' {
  const rank = { info: 0, warning: 1, error: 2 } as const;
  return rank[right] > rank[left] ? right : left;
}

function buildSources(data: ComposeReportData): VisualizationSource[] {
  const sources: VisualizationSource[] = [];
  for (const conflict of data.result.conflicts) {
    for (const source of conflict.sources) {
      sources.push({
        id: createSourceId(`${source.artifact}:${source.element}`),
        label: `${source.artifact}:${source.element}`,
        path: source.artifact,
        elementType: 'compose-source',
      });
    }
  }
  return sources.filter((source, index, array) => array.findIndex((item) => item.id === source.id) === index);
}

function buildNextActions(data: ComposeReportData, locale: Locale): string[] {
  if (data.result.conflicts.length === 0) {
    return [t(locale, 'compose.action.noIssues')];
  }

  const actions: string[] = [t(locale, 'compose.action.reviewGraph')];
  if (data.result.conflicts.some((conflict) => conflict.type === 'namespace-missing')) {
    actions.push(t(locale, 'compose.action.namespaceVars'));
  }
  if (data.result.conflicts.some((conflict) => conflict.type === 'variable-name-collision')) {
    actions.push(t(locale, 'compose.action.renameCollisions'));
  }
  return actions;
}
