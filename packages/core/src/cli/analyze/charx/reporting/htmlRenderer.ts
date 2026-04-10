import fs from 'node:fs';
import path from 'node:path';
import { ELEMENT_TYPES, MAX_VARS_IN_REPORT } from '@/domain';
import { buildLorebookStructureTree } from '@/domain/lorebook/structure';
import { escapeHtml } from '../../../shared';
import { renderHtmlReportShell } from '../../shared/html-report-shell';
import { type Locale, t } from '../../shared/i18n';
import { buildLuaInteractionFlow } from '../../shared/lua-interaction-builder';
import { buildRelationshipNetworkPanel } from '../../shared/relationship-network-builders';
import { registerSource } from '../../shared/source-links';
import { collectRegexScriptInfosFromDir } from '../../shared/cross-cutting';
import {
  buildChartPanel,
  buildDiagramPanel,
  buildFindingsPanel,
  buildMetricGrid,
  buildTablePanel,
  createVisualizationDoc,
} from '../../shared/view-model';
import type { SectionDefinition, TablePanel, VisualizationPanel, VisualizationSource } from '../../shared/visualization-types';
import { type CharxReportData } from '../types';

const CHARX_SECTIONS: SectionDefinition[] = [
  { id: 'overview', labelKey: 'shell.tab.overview', descriptionKey: 'shell.section.overview.desc' },
  { id: 'flow', labelKey: 'shell.tab.flow', descriptionKey: 'shell.section.flow.desc' },
  { id: 'lua', labelKey: 'shell.tab.lua', descriptionKey: 'shell.section.lua.desc' },
  { id: 'graph', labelKey: 'shell.tab.graph', descriptionKey: 'shell.section.graph.desc' },
  { id: 'risks', labelKey: 'shell.tab.risks', descriptionKey: 'shell.section.risks.desc' },
  { id: 'sources', labelKey: 'shell.tab.sources', descriptionKey: 'shell.section.sources.desc' },
];

/**
 * charx 분석 결과를 shared visualization shell 기반 HTML 리포트로 저장
 * @param data - charx 분석 결과
 * @param outputDir - 분석 산출물 루트 디렉토리
 * @param locale - 리포트 언어 설정
 */
export function renderHtml(data: CharxReportData, outputDir: string, locale: Locale = 'ko'): void {
  const sources: VisualizationSource[] = [];
  const metrics = collectCharxMetrics(data, sources);
  const doc = createVisualizationDoc('charx', data.characterName);
  const regexScriptInfos = collectRegexScriptInfosFromDir(path.join(outputDir, 'regex'));
  const relationshipNetwork = buildRelationshipNetworkPanel(
    'charx-relationship-network',
    {
      lorebookStructure: data.lorebookStructure,
      lorebookActivationChain: data.lorebookActivationChain,
      lorebookRegexCorrelation: data.lorebookRegexCorrelation,
      lorebookCBS: data.collected.lorebookCBS,
      regexCBS: data.collected.regexCBS,
      regexNodeNames: regexScriptInfos.map((script) => script.name),
      regexScriptInfos,
      luaArtifacts: data.luaArtifacts ?? [],
      textMentions: data.textMentions,
    },
    locale,
    'graph',
  );

  doc.sections = CHARX_SECTIONS;
  doc.summary.score = metrics.score;
  doc.summary.totals = [
    { label: t(locale, 'common.label.variables'), value: metrics.totalVariables },
    { label: t(locale, 'common.label.bridged'), value: metrics.bridgedCount, severity: metrics.bridgedCount > 0 ? 'info' : 'warning' },
    { label: t(locale, 'common.label.isolated'), value: metrics.isolatedCount, severity: metrics.isolatedCount > metrics.bridgedCount ? 'warning' : 'info' },
    { label: t(locale, 'common.label.lorebookEntries'), value: data.lorebookStructure?.stats?.totalEntries || 0 },
    { label: t(locale, 'charx.label.sharedLbRx'), value: metrics.sharedVarCount, severity: metrics.sharedVarCount > 0 ? 'info' : 'warning' },
    { label: t(locale, 'charx.label.defaultVariables'), value: Object.keys(data.defaultVariables || {}).length },
  ];
  doc.summary.highlights = buildSummaryHighlights(data, metrics, locale);
  doc.summary.nextActions = buildNextActions(data, metrics, locale);
  doc.sources = sources;
  doc.panels = [
    buildMetricGrid('charx-overview', t(locale, 'charx.panel.characterOverview'), [
      { label: t(locale, 'charx.label.lorebookEntries'), value: data.lorebookStructure?.stats?.totalEntries || 0 },
      { label: t(locale, 'charx.label.folders'), value: data.lorebookStructure?.stats?.totalFolders || 0 },
      { label: t(locale, 'charx.label.withCBS'), value: data.lorebookStructure?.stats?.withCBS || 0 },
      { label: t(locale, 'common.label.backgroundHtml'), value: data.htmlAnalysis?.cbsData ? t(locale, 'common.label.present') : t(locale, 'common.label.missing'), severity: data.htmlAnalysis?.cbsData ? 'info' : 'warning' },
      { label: t(locale, 'charx.label.assetRefs'), value: data.htmlAnalysis?.assetRefs.length || 0 },
      { label: t(locale, 'common.label.sharedVars'), value: metrics.sharedVarCount, severity: metrics.sharedVarCount > 0 ? 'info' : 'warning' },
    ]),
    buildChartPanel('element-distribution', t(locale, 'charx.chart.elementDistribution'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(metrics.elementCounts).map((label) => capitalize(label)),
        datasets: [
          {
            data: Object.values(metrics.elementCounts),
            backgroundColor: ['#60a5fa', '#34d399', '#f59e0b', '#f87171', '#a78bfa'],
          },
        ],
      },
      options: { plugins: { legend: { position: 'right' } } },
    }),
    buildChartPanel('variable-connectivity', t(locale, 'charx.chart.variableConnectivity'), {
      type: 'bar',
      data: {
        labels: [t(locale, 'common.label.bridged'), t(locale, 'common.label.isolated')],
        datasets: [
          {
            data: [metrics.bridgedCount, metrics.isolatedCount],
            backgroundColor: ['#38bdf8', '#f59e0b'],
          },
        ],
      },
    }),
    buildChartPanel('activation-modes', t(locale, 'charx.chart.activationModes'), {
      type: 'bar',
      data: {
        labels: [
          t(locale, 'charx.chart.constant'),
          t(locale, 'charx.chart.keyword'),
          t(locale, 'charx.chart.keywordMulti'),
          t(locale, 'charx.chart.referenceOnly'),
        ],
        datasets: [
          {
            data: [
              metrics.activationModes.constant,
              metrics.activationModes.keyword,
              metrics.activationModes.keywordMulti,
              metrics.activationModes.referenceOnly,
            ],
            backgroundColor: ['#f87171', '#60a5fa', '#34d399', '#94a3b8'],
          },
        ],
      },
    }),
    buildDiagramPanel(
      'runtime-flow',
      t(locale, 'charx.panel.runtimeFlow'),
      'mermaid',
      buildRuntimeFlowDiagram(metrics, locale),
      'flow',
      220,
    ),
    buildDiagramPanel(
      'lorebook-structure',
      t(locale, 'charx.panel.lorebookStructure'),
      'text',
      buildLorebookStructureText(data, locale),
      'flow',
      280,
    ),
    buildDiagramPanel('variable-flow', t(locale, 'common.label.variableFlow'), 'text', buildVariableFlowText(data, locale), 'flow', 260),
    buildTablePanel(
      'lorebook-activation-chain',
      t(locale, 'md.charx.activationChain'),
      [t(locale, 'md.charx.chainFlow'), t(locale, 'md.charx.chainStatus'), t(locale, 'md.charx.chainKeywords'), t(locale, 'md.charx.chainBlockedBy')],
      buildActivationChainRows(data),
      'flow',
    ),
    ...(relationshipNetwork ? [relationshipNetwork] : []),
    ...buildLuaPanels(data, locale),
    buildFindingsPanel('charx-risks', t(locale, 'charx.panel.riskHighlights'), buildFindings(data, metrics, locale)),
    buildFindingsPanel('charx-dead-code', t(locale, 'charx.panel.deadCode'), buildDeadCodeFindings(data, locale)),
    buildTablePanel(
      'unified-variables',
      t(locale, 'charx.panel.unifiedVars'),
      [t(locale, 'common.table.variable'), t(locale, 'common.table.elements'), t(locale, 'common.table.direction'), t(locale, 'common.table.default'), t(locale, 'common.table.writers'), t(locale, 'common.table.readers')],
      buildUnifiedVariableRows(data, sources, locale),
      'sources',
      t(locale, 'charx.filter.variables'),
    ),
    buildTablePanel(
      'shared-variables',
      t(locale, 'charx.panel.sharedVars'),
      [t(locale, 'common.table.variable'), t(locale, 'common.table.direction'), t(locale, 'common.label.lorebookEntries'), t(locale, 'charx.table.regexScripts')],
      buildSharedVariableRows(data, sources, locale),
      'sources',
    ),
    buildTablePanel(
      'default-variables',
      t(locale, 'charx.panel.defaultVarsMapping'),
      [t(locale, 'common.table.variable'), t(locale, 'charx.table.defaultValue'), t(locale, 'charx.table.usedBy')],
      buildDefaultVariableRows(data, locale),
      'sources',
    ),
    buildTablePanel(
      'background-html',
      t(locale, 'charx.panel.bgHtmlAnalysis'),
      [t(locale, 'charx.table.variableAsset'), t(locale, 'charx.table.operation'), t(locale, 'charx.table.evidence')],
      buildBackgroundHtmlRows(data, locale),
      'sources',
    ),
  ];

  const outPath = path.join(outputDir, 'analysis');
  fs.mkdirSync(outPath, { recursive: true });
  const reportBaseName = 'charx-analysis';
  const { html, clientJs, assets } = renderHtmlReportShell(doc, { locale, reportBaseName });
  fs.writeFileSync(path.join(outPath, `${reportBaseName}.html`), html, 'utf8');
  fs.writeFileSync(path.join(outPath, 'report.js'), clientJs, 'utf8');
  for (const asset of assets) {
    fs.writeFileSync(path.join(outPath, asset.fileName), asset.contents, 'utf8');
  }
}

interface CharxMetricSummary {
  totalVariables: number;
  bridgedCount: number;
  isolatedCount: number;
  sharedVarCount: number;
  unusedDefaultCount: number;
  htmlReadCount: number;
  htmlWriteCount: number;
  score: number | null;
  elementCounts: Record<string, number>;
  activationModes: {
    constant: number;
    keyword: number;
    keywordMulti: number;
    referenceOnly: number;
  };
}

function collectCharxMetrics(data: CharxReportData, sources: VisualizationSource[]): CharxMetricSummary {
  const elementCounts: Record<string, number> = {
    [ELEMENT_TYPES.LOREBOOK]: 0,
    [ELEMENT_TYPES.REGEX]: 0,
    [ELEMENT_TYPES.LUA]: 0,
    [ELEMENT_TYPES.HTML]: 0,
    [ELEMENT_TYPES.TYPESCRIPT]: 0,
  };

  let isolatedCount = 0;
  let bridgedCount = 0;
  for (const [varName, entry] of data.unifiedGraph.entries()) {
    if (entry.direction === 'isolated') isolatedCount += 1;
    if (entry.direction === 'bridged') bridgedCount += 1;

    for (const [elementType, source] of Object.entries(entry.sources)) {
      if (elementCounts[elementType] !== undefined) {
        elementCounts[elementType] += 1;
      }
      for (const name of [...source.readers, ...source.writers]) {
        registerSource(sources, name, elementType, name);
      }
      registerSource(sources, varName, 'variable', `variables/${varName}`);
    }
  }

  for (const entry of data.lorebookStructure?.entries || []) {
    registerSource(sources, entry.name, 'lorebook-entry', entry.folder ? `lorebooks/${entry.folder}/${entry.name}` : `lorebooks/${entry.name}`);
  }
  for (const assetRef of data.htmlAnalysis?.assetRefs || []) {
    registerSource(sources, assetRef, 'html-asset', assetRef);
  }

  const htmlReads = Array.from(data.htmlAnalysis?.cbsData?.reads || []);
  const htmlWrites = Array.from(data.htmlAnalysis?.cbsData?.writes || []);
  const activationModes = data.lorebookStructure?.stats?.activationModes || {
    constant: 0,
    keyword: 0,
    keywordMulti: 0,
    referenceOnly: 0,
  };
  const unusedDefaultCount = Object.keys(data.defaultVariables || {}).filter(
    (varName) => !data.unifiedGraph.has(varName),
  ).length;
  const totalVariables = data.unifiedGraph.size;
  const score = totalVariables === 0 ? null : Math.max(0, Math.min(100, Math.round(((bridgedCount + data.lorebookRegexCorrelation.sharedVars.length) / Math.max(totalVariables, 1)) * 100)));

  return {
    totalVariables,
    bridgedCount,
    isolatedCount,
    sharedVarCount: data.lorebookRegexCorrelation.sharedVars.length,
    unusedDefaultCount,
    htmlReadCount: htmlReads.length,
    htmlWriteCount: htmlWrites.length,
    score,
    elementCounts,
    activationModes,
  };
}

function buildSummaryHighlights(
  data: CharxReportData,
  metrics: CharxMetricSummary,
  locale: Locale,
): Array<{ title: string; message: string; severity: 'info' | 'warning' | 'error' }> {
  const highlights: Array<{ title: string; message: string; severity: 'info' | 'warning' | 'error' }> = [];

  highlights.push({
    title: t(locale, 'charx.highlight.variableTopology'),
    message:
      metrics.bridgedCount > 0
        ? t(locale, 'charx.highlight.bridgedMsg', metrics.bridgedCount)
        : t(locale, 'charx.highlight.noBridgedMsg'),
    severity: metrics.bridgedCount > 0 ? 'info' : 'warning',
  });

  if (metrics.isolatedCount > 0) {
    highlights.push({
      title: t(locale, 'charx.highlight.isolatedVariables'),
      message: t(locale, 'charx.highlight.isolatedMsg', metrics.isolatedCount),
      severity: metrics.isolatedCount > metrics.bridgedCount ? 'warning' : 'info',
    });
  }

  highlights.push({
    title: t(locale, 'charx.highlight.lorebookRegexBridge'),
    message:
      metrics.sharedVarCount > 0
        ? t(locale, 'charx.highlight.sharedVarsMsg', metrics.sharedVarCount)
        : t(locale, 'charx.highlight.noSharedVarsMsg'),
    severity: metrics.sharedVarCount > 0 ? 'info' : 'warning',
  });

  if (metrics.unusedDefaultCount > 0) {
    highlights.push({
      title: t(locale, 'charx.highlight.unusedDefaults'),
      message: t(locale, 'charx.highlight.unusedDefaultsMsg', metrics.unusedDefaultCount),
      severity: 'warning',
    });
  }

  if (!data.htmlAnalysis?.cbsData && (data.htmlAnalysis?.assetRefs.length || 0) === 0) {
    highlights.push({
      title: t(locale, 'charx.highlight.backgroundHtml'),
      message: t(locale, 'charx.highlight.noBgHtmlMsg'),
      severity: 'info',
    });
  }

  return highlights.slice(0, 4);
}

function buildActivationChainRows(data: CharxReportData): TablePanel['rows'] {
  return data.lorebookActivationChain.edges.map((edge) => ({
    cells: [
      `${escapeHtml(edge.sourceId)} → ${escapeHtml(edge.targetId)}`,
      escapeHtml(edge.status),
      escapeHtml([...edge.matchedKeywords, ...edge.matchedSecondaryKeywords].join(', ') || '—'),
      escapeHtml(edge.blockedBy.join(', ') || '—'),
    ],
    severity: edge.status === 'blocked' ? 'warning' : edge.status === 'partial' ? 'info' : undefined,
    searchText: [
      edge.sourceId,
      edge.targetId,
      edge.status,
      ...edge.matchedKeywords,
      ...edge.matchedSecondaryKeywords,
      ...edge.blockedBy,
    ].join(' '),
  }));
}

function buildNextActions(data: CharxReportData, metrics: CharxMetricSummary, locale: Locale): string[] {
  const actions: string[] = [];

  if (metrics.isolatedCount > metrics.bridgedCount) {
    actions.push(t(locale, 'charx.action.reviewIsolated'));
  }
  if (metrics.sharedVarCount > 0) {
    actions.push(t(locale, 'charx.action.inspectSharedVars'));
  }
  if (data.variableFlow.summary.withIssues > 0) {
    actions.push(t(locale, 'charx.action.checkVariableFlow'));
  }
  if (metrics.unusedDefaultCount > 0) {
    actions.push(t(locale, 'charx.action.trimUnusedDefaults'));
  }
  if (data.htmlAnalysis?.cbsData) {
    actions.push(t(locale, 'charx.action.validateBgHtml'));
  }
  if (actions.length === 0) {
    actions.push(t(locale, 'charx.action.noRisk'));
  }

  return actions;
}

function buildFindings(
  data: CharxReportData,
  metrics: CharxMetricSummary,
  locale: Locale,
): Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> {
  const findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> = [];

  if (metrics.totalVariables === 0) {
    findings.push({ severity: 'error', message: t(locale, 'charx.finding.noVariables'), sourceIds: [] });
  }
  if (metrics.isolatedCount > metrics.bridgedCount && metrics.totalVariables > 0) {
    findings.push({
      severity: 'warning',
      message: t(locale, 'charx.finding.isolatedDominant', metrics.isolatedCount, metrics.totalVariables),
      sourceIds: [],
    });
  }
  if (metrics.sharedVarCount > 0) {
    findings.push({
      severity: 'info',
      message: t(locale, 'charx.finding.sharedVars', metrics.sharedVarCount),
      sourceIds: [],
    });
  }
  if (metrics.unusedDefaultCount > 0) {
    findings.push({
      severity: 'warning',
      message: t(locale, 'charx.finding.unusedDefaults', metrics.unusedDefaultCount),
      sourceIds: [],
    });
  }
  if (data.htmlAnalysis?.cbsData) {
    findings.push({
      severity: 'info',
      message: t(locale, 'charx.finding.bgHtmlTouches', metrics.htmlReadCount, metrics.htmlWriteCount),
      sourceIds: [],
    });
  }
  if ((data.lorebookStructure?.stats?.enabledCount || 0) < (data.lorebookStructure?.stats?.totalEntries || 0)) {
    findings.push({
      severity: 'warning',
      message: t(locale, 'charx.finding.disabledEntries', (data.lorebookStructure?.stats?.totalEntries || 0) - (data.lorebookStructure?.stats?.enabledCount || 0)),
      sourceIds: [],
    });
  }
  if (data.variableFlow.summary.withIssues > 0) {
    findings.push({
      severity: 'warning',
      message: t(locale, 'charx.finding.variableFlowIssues', data.variableFlow.summary.withIssues),
      sourceIds: [],
    });
  }

  return findings;
}

function buildDeadCodeFindings(
  data: CharxReportData,
  locale: Locale,
): Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> {
  return data.deadCode.findings.length > 0
    ? data.deadCode.findings.map((finding) => ({
        severity: finding.severity,
        message: `${finding.type}: ${finding.message}`,
        sourceIds: [],
      }))
    : [{ severity: 'info', message: t(locale, 'common.finding.noDeadCode'), sourceIds: [] }];
}

function buildUnifiedVariableRows(
  data: CharxReportData,
  sources: VisualizationSource[],
  locale: Locale,
): TablePanel['rows'] {
  const entries = Array.from(data.unifiedGraph.entries())
    .sort(([, a], [, b]) => b.elementCount - a.elementCount)
    .slice(0, MAX_VARS_IN_REPORT);

  if (entries.length === 0) {
    return [{ cells: [t(locale, 'charx.empty.noVarsFound'), '—', '—', '—', '—', '—'] }];
  }

  return entries.map(([varName, entry]) => {
    const elementBadges = Object.keys(entry.sources)
      .map((elementType) => `<code>${escapeHtml(elementType)}</code>`)
      .join(' ');
    const writers = Object.entries(entry.sources)
      .filter(([, source]) => source.writers.length > 0)
      .map(([elementType, source]) => `<b>${escapeHtml(elementType)}</b>: ${source.writers.map((item) => escapeHtml(item)).join(', ')}`)
      .join('<br>') || '—';
    const readers = Object.entries(entry.sources)
      .filter(([, source]) => source.readers.length > 0)
      .map(([elementType, source]) => `<b>${escapeHtml(elementType)}</b>: ${source.readers.map((item) => escapeHtml(item)).join(', ')}`)
      .join('<br>') || '—';
    const sourceIds = sources.filter((source) => source.label === varName || source.label.includes(varName)).map((source) => source.id);

    return {
      cells: [
        `<code>${escapeHtml(varName)}</code>`,
        elementBadges || '—',
        `<code>${escapeHtml(entry.direction)}</code>`,
        `<code>${escapeHtml(entry.defaultValue)}</code>`,
        writers,
        readers,
      ],
      sourceIds,
      severity: entry.direction === 'isolated' ? 'warning' : 'info',
      searchText: [varName, ...Object.keys(entry.sources), entry.direction, entry.crossElementReaders.join(' '), entry.crossElementWriters.join(' ')].join(' '),
    };
  });
}

function buildSharedVariableRows(
  data: CharxReportData,
  sources: VisualizationSource[],
  locale: Locale,
): TablePanel['rows'] {
  const rows = data.lorebookRegexCorrelation.sharedVars.map((entry) => ({
    cells: [
      `<code>${escapeHtml(entry.varName)}</code>`,
      `<code>${escapeHtml(entry.direction)}</code>`,
      escapeHtml(entry.lorebookEntries.join(', ') || '—'),
      escapeHtml(entry.regexScripts.join(', ') || '—'),
    ],
    sourceIds: sources
      .filter((source) => entry.lorebookEntries.includes(source.label) || entry.regexScripts.includes(source.label))
      .map((source) => source.id),
    severity: 'info' as const,
    searchText: [entry.varName, ...entry.lorebookEntries, ...entry.regexScripts].join(' '),
  }));

  return rows.length > 0 ? rows : [{ cells: [t(locale, 'charx.empty.noSharedVars'), '—', '—', '—'] }];
}

function buildDefaultVariableRows(data: CharxReportData, locale: Locale): TablePanel['rows'] {
  const keys = Object.keys(data.defaultVariables || {});
  if (keys.length === 0) {
    return [{ cells: [t(locale, 'charx.empty.noDefaultVars'), '—', '—'] }];
  }

  return keys.map((varName) => {
    const entry = data.unifiedGraph.get(varName);
    const usedBy = entry ? Object.keys(entry.sources).join(', ') || '—' : '—';
    return {
      cells: [
        `<code>${escapeHtml(varName)}</code>`,
        `<code>${escapeHtml(String(data.defaultVariables[varName]))}</code>`,
        escapeHtml(usedBy),
      ],
      severity: entry ? 'info' : 'warning',
      searchText: [varName, String(data.defaultVariables[varName]), usedBy].join(' '),
    };
  });
}

function buildBackgroundHtmlRows(data: CharxReportData, locale: Locale): TablePanel['rows'] {
  const rows: TablePanel['rows'] = [];
  const reads = Array.from(data.htmlAnalysis?.cbsData?.reads || []);
  const writes = Array.from(data.htmlAnalysis?.cbsData?.writes || []);

  for (const variable of reads) {
    rows.push({
      cells: [`<code>${escapeHtml(variable)}</code>`, t(locale, 'charx.html.read'), t(locale, 'charx.html.cbsAccess')],
      severity: 'info',
      searchText: `${variable} read html`,
    });
  }
  for (const variable of writes) {
    rows.push({
      cells: [`<code>${escapeHtml(variable)}</code>`, reads.includes(variable) ? t(locale, 'charx.html.readWrite') : t(locale, 'charx.html.write'), t(locale, 'charx.html.cbsAccess')],
      severity: 'warning',
      searchText: `${variable} write html`,
    });
  }
  for (const assetRef of data.htmlAnalysis?.assetRefs || []) {
    rows.push({
      cells: [escapeHtml(assetRef), t(locale, 'charx.html.asset'), t(locale, 'charx.html.assetRef')],
      severity: 'info',
      searchText: `${assetRef} asset html`,
    });
  }

  return rows.length > 0 ? rows : [{ cells: [t(locale, 'charx.empty.noBgHtml'), '—', '—'] }];
}

function buildRuntimeFlowDiagram(metrics: CharxMetricSummary, locale: Locale): string {
  const collectLabel = t(locale, 'charx.flow.collectSources', metrics.totalVariables);
  const correlateLabel = t(locale, 'charx.flow.correlateGraph');
  const bridgedLabel = t(locale, 'charx.flow.bridgedVars', metrics.bridgedCount);
  const isolatedLabel = t(locale, 'charx.flow.isolatedVars', metrics.isolatedCount);
  const sharedLabel = t(locale, 'charx.flow.sharedVars', metrics.sharedVarCount);

  return [
    'flowchart TD',
    `${collectLabel} --> ${correlateLabel}`,
    `${correlateLabel} --> ${bridgedLabel}`,
    `${correlateLabel} --> ${isolatedLabel}`,
    `${correlateLabel} --> ${sharedLabel}`,
  ].join('\n');
}

function buildVariableFlowText(data: CharxReportData, locale: Locale): string {
  const issueRows = data.variableFlow.variables
    .filter((entry) => entry.issues.length > 0)
    .slice(0, 10)
    .map((entry) => `${entry.varName}: ${entry.issues.map((issue) => issue.type).join(', ')}`);

  return [
    t(locale, 'common.diagram.trackedVars', data.variableFlow.summary.totalVariables),
    t(locale, 'common.diagram.varsWithIssues', data.variableFlow.summary.withIssues),
    ...issueRows,
  ].join('\n');
}

function buildLorebookStructureText(data: CharxReportData, locale: Locale): string {
  if (!data.lorebookStructure || data.lorebookStructure.stats.totalEntries === 0) {
    return t(locale, 'charx.empty.noLorebookFolders');
  }

  const { roots, rootEntries } = buildLorebookStructureTree(data.lorebookStructure);

  const renderFolder = (folder: { name?: string; children?: unknown[]; entries?: Array<{ id: string; name: string; enabled?: boolean }> }, depth = 0): string[] => {
    const lines = [`${'  '.repeat(depth)}- ${folder.name || 'unnamed folder'}`];
    if (Array.isArray(folder.entries)) {
      for (const entry of dedupeLorebookEntries(folder.entries)) {
        lines.push(`${'  '.repeat(depth + 1)}• ${entry.name}${entry.enabled === false ? ' (disabled)' : ''}`);
      }
    }
    if (Array.isArray(folder.children)) {
      for (const child of folder.children) {
        if (typeof child === 'object' && child !== null) {
          lines.push(...renderFolder(child as { name?: string; children?: unknown[]; entries?: Array<{ id: string; name: string; enabled?: boolean }> }, depth + 1));
        }
      }
    }
    return lines;
  };

  const lines = roots.flatMap((folder) => renderFolder(folder));
  for (const entry of dedupeLorebookEntries(rootEntries)) {
    lines.push(`- • ${entry.name}${entry.enabled === false ? ' (disabled)' : ''}`);
  }
  return lines.join('\n');
}

function dedupeLorebookEntries<T extends { id: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** charx 리포트에 포함할 Lua 분석 패널들을 생성한다 */
function buildLuaPanels(data: CharxReportData, locale: Locale): VisualizationPanel[] {
  const artifacts = data.luaArtifacts ?? [];
  if (artifacts.length === 0) return [];

  const panels: VisualizationPanel[] = [];

  // 집계 메트릭
  let totalFunctions = 0;
  let totalStateVars = 0;
  let totalHandlers = 0;
  for (const artifact of artifacts) {
    totalFunctions += artifact.collected.functions.length;
    totalStateVars += artifact.collected.stateVars.size;
    totalHandlers += artifact.collected.handlers.length;
  }

  // 개요 메트릭 그리드
  panels.push(buildMetricGrid('charx-lua-overview', t(locale, 'lua.panel.overview'), [
    { label: t(locale, 'lua.metric.files'), value: artifacts.length },
    { label: t(locale, 'lua.metric.functions'), value: totalFunctions },
    { label: t(locale, 'lua.metric.stateVars'), value: totalStateVars },
    { label: t(locale, 'lua.metric.handlers'), value: totalHandlers },
  ], 'lua'));

  for (const artifact of artifacts) {
    panels.push(buildDiagramPanel(
      `charx-lua-flow-${artifact.baseName}`,
      t(locale, 'lua.panel.flowchart', artifact.baseName),
      'lua-flow',
      buildLuaInteractionFlow(artifact, locale),
      'lua',
    ));
  }

  // 상태 소유권 테이블
  const stateRows: TablePanel['rows'] = [];
  for (const artifact of artifacts) {
    for (const [varName, stateVar] of artifact.collected.stateVars) {
      stateRows.push({
        cells: [
          `<code>${escapeHtml(varName)}</code>`,
          escapeHtml(artifact.baseName),
          escapeHtml([...stateVar.readBy].join(', ') || '—'),
          escapeHtml([...stateVar.writtenBy].join(', ') || '—'),
        ],
        searchText: [varName, artifact.baseName, ...stateVar.readBy, ...stateVar.writtenBy].join(' '),
      });
    }
  }
  if (stateRows.length > 0) {
    panels.push(buildTablePanel(
      'charx-lua-state-ownership',
      t(locale, 'lua.panel.stateOwnership'),
      [t(locale, 'common.table.variable'), t(locale, 'lua.html.owner'), t(locale, 'lua.html.reads'), t(locale, 'lua.html.writes')],
      stateRows,
      'lua',
    ));
  }

  // 상관관계 테이블 — 로어북 + 정규식 상관관계 결합
  const correlationRows: TablePanel['rows'] = [];
  for (const artifact of artifacts) {
    if (artifact.lorebookCorrelation) {
      for (const bridged of artifact.lorebookCorrelation.bridgedVars) {
        correlationRows.push({
          cells: [
            `<code>${escapeHtml(bridged.varName)}</code>`,
            escapeHtml(artifact.baseName),
            t(locale, 'lua.html.lbBridged'),
          ],
          searchText: [bridged.varName, artifact.baseName, 'lorebook'].join(' '),
        });
      }
    }
    if (artifact.regexCorrelation) {
      for (const bridged of artifact.regexCorrelation.bridgedVars) {
        correlationRows.push({
          cells: [
            `<code>${escapeHtml(bridged.varName)}</code>`,
            escapeHtml(artifact.baseName),
            t(locale, 'lua.html.rxBridged'),
          ],
          searchText: [bridged.varName, artifact.baseName, 'regex'].join(' '),
        });
      }
    }
  }
  if (correlationRows.length > 0) {
    panels.push(buildTablePanel(
      'charx-lua-correlation',
      t(locale, 'lua.panel.correlation'),
      [t(locale, 'common.table.variable'), t(locale, 'lua.html.owner'), t(locale, 'lua.html.correlation')],
      correlationRows,
      'lua',
    ));
  }

  return panels;
}
