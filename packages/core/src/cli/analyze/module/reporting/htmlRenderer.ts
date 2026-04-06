import fs from 'node:fs';
import path from 'node:path';
import { buildLorebookStructureTree } from '@/domain/lorebook/structure';
import { buildRelationshipNetworkPanel } from '../../shared/force-graph-builders';
import { escapeHtml } from '../../../shared';
import { collectRegexScriptInfosFromDir } from '../../shared/cross-cutting';
import { buildChartPanel, buildDiagramPanel, buildFindingPanel, buildTablePanel } from '../../shared/view-model';
import { renderHtmlReportShell } from '../../shared/html-report-shell';
import { createSourceId, dedupeSources } from '../../shared/source-links';
import type { AnalysisVisualizationDoc, SectionDefinition, VisualizationPanel, VisualizationSource } from '../../shared/visualization-types';
import type { ModuleReportData } from '../types';
import { type Locale, t } from '../../shared/i18n';

// ── Section definitions (질문 기반) ───────────────────────────────

const MODULE_SECTIONS: SectionDefinition[] = [
  { id: 'overview', labelKey: 'shell.tab.overview', descriptionKey: 'shell.section.overview.desc' },
  { id: 'structure', labelKey: 'shell.tab.structure', descriptionKey: 'shell.section.structure.desc' },
  { id: 'improvements', labelKey: 'shell.tab.improvements', descriptionKey: 'shell.section.improvements.desc' },
  { id: 'details', labelKey: 'shell.tab.details', descriptionKey: 'shell.section.details.desc' },
];

// ── Score computation (100점 감점 방식) ───────────────────────────

function computeModuleScore(data: ModuleReportData): number {
  let score = 100;

  // 컴포넌트 다양성 (-20): 1타입만 사용 시
  const componentTypes = new Set<string>();
  if (data.collected.lorebookCBS.length > 0) componentTypes.add('lorebook');
  if (data.collected.regexCBS.length > 0) componentTypes.add('regex');
  if (data.collected.luaCBS.length > 0) componentTypes.add('lua');
  if (data.collected.htmlCBS) componentTypes.add('html');
  if (componentTypes.size <= 1) score -= 20;

  // 변수 통합도 (-25): bridged/total 비율
  const totalVars = data.unifiedGraph.size;
  if (totalVars > 0) {
    const bridged = Array.from(data.unifiedGraph.values()).filter((v) => v.direction === 'bridged').length;
    const ratio = bridged / totalVars;
    score -= Math.round((1 - ratio) * 25);
  }

  // LB↔Regex 상관 (-15): 둘 다 있는데 공유 0
  if (data.collected.lorebookCBS.length > 0 && data.collected.regexCBS.length > 0 && data.lorebookRegexCorrelation.summary.totalShared === 0) {
    score -= 15;
  }

  // Dead code (-15): findings × 3
  score -= Math.min(15, data.deadCode.summary.totalFindings * 3);

  // Flow 이슈 (-15): issues × 5
  score -= Math.min(15, data.variableFlow.summary.withIssues * 5);

  // Token budget (-10): error 경고 시
  if (data.tokenBudget.warnings.some((w) => w.severity === 'error')) score -= 10;
  else if (data.tokenBudget.warnings.some((w) => w.severity === 'warning')) score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ── Main renderer ────────────────────────────────────────────────

/** module analysis HTML report를 생성한다. */
export function renderModuleHtml(data: ModuleReportData, outputDir: string, locale: Locale = 'ko'): void {
  const sources = buildSources(data);
  const score = computeModuleScore(data);
  const panels = buildAllPanels(data, sources, outputDir, locale);

  const doc: AnalysisVisualizationDoc = {
    artifactType: 'module',
    artifactName: data.moduleName,
    sections: MODULE_SECTIONS,
    summary: {
      score,
      totals: buildSummaryTotals(data, locale),
      highlights: buildHighlights(data, locale),
      nextActions: buildNextActions(data, locale),
    },
    panels,
    sources,
  };

  const analysisDir = path.join(outputDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  const { html, clientJs } = renderHtmlReportShell(doc, locale);
  fs.writeFileSync(
    path.join(analysisDir, 'module-analysis.html'),
    html,
    'utf-8',
  );
  fs.writeFileSync(path.join(analysisDir, 'report.js'), clientJs, 'utf-8');
}

// ── Summary totals ───────────────────────────────────────────────

function buildSummaryTotals(data: ModuleReportData, locale: Locale) {
  const componentCount =
    (data.collected.lorebookCBS.length > 0 ? 1 : 0) +
    (data.collected.regexCBS.length > 0 ? 1 : 0) +
    (data.collected.luaCBS.length > 0 ? 1 : 0) +
    (data.collected.htmlCBS ? 1 : 0);
  const totalVars = data.unifiedGraph.size;
  const bridged = totalVars > 0 ? Array.from(data.unifiedGraph.values()).filter((v) => v.direction === 'bridged').length : 0;
  const bridgedPct = totalVars > 0 ? Math.round((bridged / totalVars) * 100) : 0;

  return [
    { label: t(locale, 'module.label.components'), value: componentCount },
    { label: t(locale, 'module.label.totalVars'), value: totalVars },
    { label: t(locale, 'module.label.bridgedRatio'), value: `${bridgedPct}%`, severity: bridgedPct < 20 && totalVars > 3 ? 'warning' as const : 'info' as const },
    {
      label: t(locale, 'module.label.worstCaseTokens'),
      value: data.tokenBudget.totals.worstCaseTokens,
      severity: data.tokenBudget.warnings.some((w) => w.severity === 'error') ? 'error' as const : data.tokenBudget.warnings.length > 0 ? 'warning' as const : 'info' as const,
    },
  ];
}

// ── Highlights (최대 3개, 의미 있는 것만) ────────────────────────

function buildHighlights(data: ModuleReportData, locale: Locale) {
  const highlights: AnalysisVisualizationDoc['summary']['highlights'] = [];

  // LB↔Regex 공유
  if (data.lorebookRegexCorrelation.summary.totalShared > 0) {
    highlights.push({
      title: t(locale, 'module.highlight.sharedVars'),
      message: t(locale, 'module.highlight.lbRxShared', data.collected.lorebookCBS.length, data.collected.regexCBS.length, data.lorebookRegexCorrelation.summary.totalShared),
      severity: 'info',
    });
  }

  // Isolated 비율
  const totalVars = data.unifiedGraph.size;
  if (totalVars > 0) {
    const isolated = Array.from(data.unifiedGraph.values()).filter((v) => v.direction === 'isolated').length;
    const pct = Math.round((isolated / totalVars) * 100);
    if (pct > 50) {
      highlights.push({
        title: t(locale, 'charx.highlight.isolatedVars'),
        message: t(locale, 'module.highlight.isolatedRatio', pct),
        severity: 'warning',
      });
    }
  }

  // Token budget (항상)
  const worstK = Math.round(data.tokenBudget.totals.worstCaseTokens / 1000);
  const largest = data.tokenBudget.components.length > 0
    ? [...data.tokenBudget.components].sort((a, b) => b.estimatedTokens - a.estimatedTokens)[0]
    : null;
  highlights.push({
    title: t(locale, 'charx.highlight.tokenBudget'),
    message: t(locale, 'module.highlight.tokenBudgetTop', worstK, largest?.name ?? '—'),
    severity: data.tokenBudget.warnings.some((w) => w.severity === 'error') ? 'error' : 'info',
  });

  return highlights.slice(0, 3);
}

// ── Panels ───────────────────────────────────────────────────────

function buildAllPanels(data: ModuleReportData, sources: VisualizationSource[], outputDir: string, locale: Locale): VisualizationPanel[] {
  const panels: VisualizationPanel[] = [];

  // === 개요 탭 ===
  panels.push(buildComponentDistributionChart(data, locale));
  panels.push(buildVariableConnectivityChart(data, locale));

  // === 구조 탭 ===
  const relationshipNetwork = buildRelationshipNetworkPanel('module-relationship-network', {
    lorebookStructure: data.lorebookStructure,
    lorebookRegexCorrelation: data.lorebookRegexCorrelation,
    lorebookCBS: data.collected.lorebookCBS,
    regexCBS: data.collected.regexCBS,
    regexNodeNames: collectRegexScriptInfosFromDir(path.join(outputDir, 'regex'), '[module]').map((script) => script.name),
  }, locale, 'structure');
  if (relationshipNetwork) panels.push(relationshipNetwork);

  if (data.lorebookStructure && data.lorebookStructure.entries.length > 0) {
    panels.push(buildLorebookTreePanel(data, locale));
  }

  if (data.lorebookRegexCorrelation.sharedVars.length > 0) {
    panels.push(buildLbRxCorrelationTable(data, locale));
  }

  panels.push(buildRuntimeSnapshotPanel(data, locale));

  // === 개선점 탭 ===
  panels.push(buildFindingPanel(
    'module-findings',
    t(locale, 'module.panel.findings'),
    buildFindings(data, locale),
    'improvements',
  ));

  panels.push(buildFindingPanel(
    'module-dead-code',
    t(locale, 'module.panel.deadCode'),
    buildDeadCodeFindings(data, locale),
    'improvements',
  ));

  if (data.variableFlow.summary.withIssues > 0) {
    panels.push(buildDiagramPanel(
      'module-var-flow-summary',
      t(locale, 'module.panel.variableFlowSummary'),
      'text',
      buildVariableFlowSummary(data, locale),
      'improvements',
    ));
  }

  // === 상세 탭 ===
  panels.push(buildTablePanel(
    'module-var-table',
    t(locale, 'module.panel.variableTable'),
    [t(locale, 'common.table.variable'), t(locale, 'common.table.direction'), t(locale, 'common.table.readers'), t(locale, 'common.table.writers')],
    Array.from(data.unifiedGraph.entries()).map(([varName, entry]) => ({
      cells: [
        `<code>${escapeHtml(varName)}</code>`,
        escapeHtml(entry.direction),
        escapeHtml(entry.crossElementReaders.join(', ') || '—'),
        escapeHtml(entry.crossElementWriters.join(', ') || '—'),
      ],
      sourceIds: sources.filter((source) => source.label.includes(varName)).map((source) => source.id),
      searchText: [varName, entry.direction, ...entry.crossElementReaders, ...entry.crossElementWriters].join(' '),
    })),
    'details',
    t(locale, 'charx.filter.variables'),
  ));

  panels.push(buildTokenConsumptionTable(data, locale));

  return panels;
}

// ── Overview charts ──────────────────────────────────────────────

function buildComponentDistributionChart(data: ModuleReportData, locale: Locale): VisualizationPanel {
  const typeCounts = new Map<string, number>();
  for (const [, entry] of data.unifiedGraph) {
    for (const type of Object.keys(entry.sources)) {
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }
  }
  const labels = [...typeCounts.keys()];
  const values = labels.map((l) => typeCounts.get(l)!);
  const colors = labels.map((l) => {
    if (l === 'lorebook') return '#60a5fa';
    if (l === 'regex') return '#a78bfa';
    if (l === 'lua') return '#34d399';
    if (l === 'html') return '#f59e0b';
    return '#94a3b8';
  });

  const panel = buildChartPanel(
    'module-component-dist',
    t(locale, 'module.panel.componentDistribution'),
    {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors }] },
    },
    'overview',
  );
  panel.description = t(locale, 'module.panel.componentDistributionDesc');
  return panel;
}

function buildVariableConnectivityChart(data: ModuleReportData, locale: Locale): VisualizationPanel {
  const bridged = Array.from(data.unifiedGraph.values()).filter((v) => v.direction === 'bridged').length;
  const isolated = data.unifiedGraph.size - bridged;

  const panel = buildChartPanel(
    'module-var-connectivity',
    t(locale, 'module.panel.variableConnectivity'),
    {
      type: 'bar',
      data: {
        labels: [t(locale, 'common.label.bridged'), t(locale, 'common.label.isolated')],
        datasets: [{ data: [bridged, isolated], backgroundColor: ['#34d399', '#f87171'] }],
      },
    },
    'overview',
  );
  panel.description = t(locale, 'module.panel.variableConnectivityDesc');
  return panel;
}

// ── Structure panels ─────────────────────────────────────────────

function buildLorebookTreePanel(data: ModuleReportData, locale: Locale): VisualizationPanel {
  const structure = data.lorebookStructure!;
  const lines: string[] = [];
  const { roots, rootEntries } = buildLorebookStructureTree(structure);

  const renderFolder = (folder: (typeof roots)[number], depth = 0): void => {
    lines.push(`${'  '.repeat(depth)}📁 ${folder.name}`);
    for (const entry of folder.entries) {
      const flags = [
        entry.constant ? '🔴 constant' : entry.selective ? '🟢 selective' : '🔵 normal',
        entry.hasCBS ? 'CBS' : '',
        !entry.enabled ? 'disabled' : '',
      ].filter(Boolean).join(' | ');
      lines.push(`${'  '.repeat(depth + 1)}└─ ${entry.name} [${flags}]`);
    }
    for (const child of folder.children) renderFolder(child, depth + 1);
  };

  for (const folder of roots) renderFolder(folder);
  for (const entry of rootEntries) {
    const flags = [
      entry.constant ? '🔴 constant' : entry.selective ? '🟢 selective' : '🔵 normal',
      entry.hasCBS ? 'CBS' : '',
      !entry.enabled ? 'disabled' : '',
    ].filter(Boolean).join(' | ');
    lines.push(`└─ ${entry.name} [${flags}]`);
  }

  return buildDiagramPanel(
    'module-lorebook-tree',
    t(locale, 'module.panel.lorebookTree'),
    'text',
    lines.join('\n'),
    'structure',
  );
}

function buildLbRxCorrelationTable(data: ModuleReportData, locale: Locale): VisualizationPanel {
  return buildTablePanel(
    'module-lb-rx-correlation',
    t(locale, 'module.panel.lbRxCorrelation'),
    [t(locale, 'common.table.variable'), t(locale, 'common.table.direction'), t(locale, 'charx.table.lorebookEntries'), t(locale, 'charx.table.regexScripts')],
    data.lorebookRegexCorrelation.sharedVars.map((sv) => ({
      cells: [
        `<code>${escapeHtml(sv.varName)}</code>`,
        escapeHtml(sv.direction),
        escapeHtml(sv.lorebookEntries.join(', ')),
        escapeHtml(sv.regexScripts.join(', ')),
      ],
      searchText: [sv.varName, sv.direction, ...sv.lorebookEntries, ...sv.regexScripts].join(' '),
    })),
    'structure',
  );
}

function buildRuntimeSnapshotPanel(data: ModuleReportData, locale: Locale): VisualizationPanel {
  return buildDiagramPanel(
    'module-runtime',
    t(locale, 'module.panel.runtimeSnapshot'),
    'text',
    buildFlowSummary(data, locale),
    'structure',
  );
}

// ── Token consumption table ──────────────────────────────────────

function buildTokenConsumptionTable(data: ModuleReportData, locale: Locale): VisualizationPanel {
  const sorted = [...data.tokenBudget.components].sort((a, b) => b.estimatedTokens - a.estimatedTokens);
  const total = data.tokenBudget.totals.worstCaseTokens || 1;

  return buildTablePanel(
    'module-token-consumption',
    t(locale, 'module.panel.tokenConsumption'),
    [t(locale, 'module.table.component'), t(locale, 'common.table.type'), t(locale, 'module.table.tokens'), t(locale, 'module.table.percentage')],
    sorted.map((c) => ({
      cells: [
        escapeHtml(c.name),
        escapeHtml(c.category),
        String(c.estimatedTokens),
        `${Math.round((c.estimatedTokens / total) * 100)}%`,
      ],
      severity: c.estimatedTokens > total * 0.3 ? 'warning' as const : 'info' as const,
      searchText: [c.name, c.category, String(c.estimatedTokens)].join(' '),
    })),
    'details',
  );
}

// ── Sources ──────────────────────────────────────────────────────

function buildSources(data: ModuleReportData): VisualizationSource[] {
  const sources: VisualizationSource[] = [];

  for (const element of [
    ...data.collected.lorebookCBS,
    ...data.collected.regexCBS,
    ...data.collected.luaCBS,
    ...(data.collected.htmlCBS ? [data.collected.htmlCBS] : []),
  ]) {
    const id = createSourceId(element.elementName, element.elementType);
    sources.push({
      id,
      label: element.elementName,
      path: element.elementName,
      elementType: element.elementType,
    });
  }

  return dedupeSources(sources);
}

// ── Next actions ─────────────────────────────────────────────────

function buildNextActions(data: ModuleReportData, locale: Locale): string[] {
  const actions: string[] = [];
  if (data.tokenBudget.warnings.length > 0) {
    actions.push(t(locale, 'module.action.reviewTokens'));
  }
  if (data.lorebookRegexCorrelation.summary.totalShared > 0) {
    actions.push(t(locale, 'module.action.reviewShared'));
  }
  if (data.variableFlow.summary.withIssues > 0) {
    actions.push(t(locale, 'module.action.inspectFlow'));
  }
  const totalVars = data.unifiedGraph.size;
  if (totalVars > 0) {
    const isolated = Array.from(data.unifiedGraph.values()).filter((v) => v.direction === 'isolated').length;
    if (isolated / totalVars > 0.5) {
      actions.push(t(locale, 'module.action.reviewIsolated'));
    }
  }
  if (data.lorebookStructure && data.lorebookStructure.entries.length >= 2) {
    actions.push(t(locale, 'module.action.reviewRelationshipNetwork'));
  }
  if (data.collected.luaCBS.length === 0) {
    actions.push(t(locale, 'module.action.noLuaState'));
  }
  if (data.collected.htmlCBS) {
    actions.push(t(locale, 'module.action.bgHtmlRefs'));
  }
  if (actions.length === 0) {
    actions.push(t(locale, 'module.action.noFollowUp'));
  }
  return actions;
}

// ── Findings (with action guides) ────────────────────────────────

function buildFindings(data: ModuleReportData, locale: Locale): Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> {
  const findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> = [];

  if (data.collected.lorebookCBS.length === 0) {
    findings.push({ severity: 'warning', message: t(locale, 'module.finding.noLorebookCbs'), sourceIds: [] });
  }
  if (data.collected.regexCBS.length === 0) {
    findings.push({ severity: 'warning', message: t(locale, 'module.finding.noRegexCbs'), sourceIds: [] });
  }
  if (data.lorebookRegexCorrelation.summary.totalShared > 0) {
    findings.push({
      severity: 'info',
      message: `${t(locale, 'module.finding.sharedVars', data.lorebookRegexCorrelation.summary.totalShared)} → ${t(locale, 'module.finding.actionGuide.sharedVars')}`,
      sourceIds: [],
    });
  }
  for (const warning of data.tokenBudget.warnings) {
    findings.push({
      severity: warning.severity,
      message: `${warning.message} → ${t(locale, 'module.finding.actionGuide.tokenBudget')}`,
      sourceIds: [],
    });
  }
  if (data.variableFlow.summary.withIssues > 0) {
    findings.push({
      severity: 'warning',
      message: `${t(locale, 'module.finding.flowIssues', data.variableFlow.summary.withIssues)} → ${t(locale, 'module.finding.actionGuide.flowIssue')}`,
      sourceIds: [],
    });
  }

  return findings;
}

function buildDeadCodeFindings(data: ModuleReportData, locale: Locale) {
  return data.deadCode.findings.length > 0
    ? data.deadCode.findings.map((finding) => ({
        severity: finding.severity,
        message: `${finding.type}: ${finding.message} → ${t(locale, 'module.finding.actionGuide.deadCode')}`,
        sourceIds: [],
      }))
    : [{ severity: 'info' as const, message: t(locale, 'common.finding.noDeadCode'), sourceIds: [] }];
}

// ── Helpers ──────────────────────────────────────────────────────

function buildFlowSummary(data: ModuleReportData, locale: Locale): string {
  return [
    t(locale, 'module.flow.collect'),
    `  ${t(locale, 'module.flow.lorebook', data.collected.lorebookCBS.length)}`,
    `  ${t(locale, 'module.flow.regex', data.collected.regexCBS.length)}`,
    `  ${t(locale, 'module.flow.lua', data.collected.luaCBS.length)}`,
    `  ${t(locale, 'module.flow.html', data.collected.htmlCBS ? 1 : 0)}`,
    '',
    t(locale, 'module.flow.correlate'),
    `  ${t(locale, 'module.flow.unifiedVars', data.unifiedGraph.size)}`,
    `  ${t(locale, 'module.flow.sharedLbRx', data.lorebookRegexCorrelation.summary.totalShared)}`,
  ].join('\n');
}

function buildVariableFlowSummary(data: ModuleReportData, locale: Locale): string {
  const issueRows = data.variableFlow.variables
    .filter((entry) => entry.issues.length > 0)
    .slice(0, 8)
    .map((entry) => `${entry.varName}: ${entry.issues.map((issue) => issue.type).join(', ')}`);

  return [
    t(locale, 'common.diagram.trackedVars', data.variableFlow.summary.totalVariables),
    t(locale, 'common.diagram.varsWithIssues', data.variableFlow.summary.withIssues),
    ...issueRows,
  ].join('\n');
}
