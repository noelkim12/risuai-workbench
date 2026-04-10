import fs from 'node:fs';
import path from 'node:path';
import { buildLorebookStructureTree, type LorebookActivationMode } from '@/domain/lorebook/structure';

function formatLorebookModeBadge(mode: LorebookActivationMode): string {
  switch (mode) {
    case 'constant':
      return '🔴 always-active';
    case 'keywordMulti':
      return '🟢 keyword (multi)';
    case 'referenceOnly':
      return '⚪ reference-only';
    case 'keyword':
    default:
      return '🔵 keyword';
  }
}
import { buildRelationshipNetworkPanel } from '../../shared/relationship-network-builders';
import { escapeHtml } from '../../../shared';
import { collectRegexScriptInfosFromDir } from '../../shared/cross-cutting';
import { buildLuaInteractionFlow } from '../../shared/lua-interaction-builder';
import { buildChartPanel, buildDiagramPanel, buildFindingPanel, buildMetricGrid, buildTablePanel } from '../../shared/view-model';
import { renderHtmlReportShell } from '../../shared/html-report-shell';
import { createSourceId, dedupeSources } from '../../shared/source-links';
import type { AnalysisVisualizationDoc, SectionDefinition, TablePanel, VisualizationPanel, VisualizationSource } from '../../shared/visualization-types';
import type { ModuleReportData } from '../types';

const MAX_WRITE_ONLY_DEAD_CODE = 12;

import { type Locale, t } from '../../shared/i18n';

// ── Section definitions (질문 기반) ───────────────────────────────

const MODULE_SECTIONS: SectionDefinition[] = [
  { id: 'overview', labelKey: 'shell.tab.overview', descriptionKey: 'shell.section.overview.desc' },
  { id: 'structure', labelKey: 'shell.tab.structure', descriptionKey: 'shell.section.structure.desc' },
  { id: 'lua', labelKey: 'shell.tab.lua', descriptionKey: 'shell.section.lua.desc' },
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
  const reportBaseName = 'module-analysis';
  const { html, clientJs, assets } = renderHtmlReportShell(doc, { locale, reportBaseName });
  fs.writeFileSync(
    path.join(analysisDir, `${reportBaseName}.html`),
    html,
    'utf-8',
  );
  fs.writeFileSync(path.join(analysisDir, 'report.js'), clientJs, 'utf-8');
  for (const asset of assets) {
    fs.writeFileSync(path.join(analysisDir, asset.fileName), asset.contents, 'utf-8');
  }
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

  return highlights.slice(0, 3);
}

// ── Panels ───────────────────────────────────────────────────────

function buildAllPanels(data: ModuleReportData, sources: VisualizationSource[], outputDir: string, locale: Locale): VisualizationPanel[] {
  const panels: VisualizationPanel[] = [];

  // === 개요 탭 ===
  panels.push(buildComponentDistributionChart(data, locale));
  panels.push(buildVariableConnectivityChart(data, locale));

  // === 구조 탭 ===
  const regexScriptInfos = collectRegexScriptInfosFromDir(path.join(outputDir, 'regex'), '[module]');
  const relationshipNetwork = buildRelationshipNetworkPanel('module-relationship-network', {
      lorebookStructure: data.lorebookStructure,
      lorebookActivationChain: data.lorebookActivationChain,
      lorebookRegexCorrelation: data.lorebookRegexCorrelation,
      lorebookCBS: data.collected.lorebookCBS,
      regexCBS: data.collected.regexCBS,
      regexNodeNames: regexScriptInfos.map((script) => script.name),
      regexScriptInfos,
      luaArtifacts: data.luaArtifacts ?? [],
      textMentions: data.textMentions,
    }, locale, 'structure');
  if (relationshipNetwork) panels.push(relationshipNetwork);

  if (data.lorebookStructure && data.lorebookStructure.entries.length > 0) {
    panels.push(buildLorebookTreePanel(data, locale));
  }

  panels.push(buildActivationChainTable(data, locale));

  if (data.lorebookRegexCorrelation.sharedVars.length > 0) {
    panels.push(buildLbRxCorrelationTable(data, locale));
  }

  panels.push(buildRuntimeSnapshotPanel(data, locale));

  panels.push(...buildLuaPanels(data, locale));

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

function buildActivationChainTable(data: ModuleReportData, locale: Locale): VisualizationPanel {
  return buildTablePanel(
    'module-activation-chain',
    t(locale, 'md.charx.activationChain'),
    [t(locale, 'md.charx.chainFlow'), t(locale, 'md.charx.chainStatus'), t(locale, 'md.charx.chainKeywords'), t(locale, 'md.charx.chainBlockedBy')],
    data.lorebookActivationChain.edges.map((edge) => ({
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
    })),
    'structure',
  );
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
    for (const entry of dedupeLorebookEntries(folder.entries)) {
      const flags = [
        formatLorebookModeBadge(entry.activationMode),
        entry.hasCBS ? 'CBS' : '',
        !entry.enabled ? 'disabled' : '',
      ].filter(Boolean).join(' | ');
      lines.push(`${'  '.repeat(depth + 1)}└─ ${entry.name} [${flags}]`);
    }
    for (const child of folder.children) renderFolder(child, depth + 1);
  };

  for (const folder of roots) renderFolder(folder);
  for (const entry of dedupeLorebookEntries(rootEntries)) {
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

function dedupeLorebookEntries<T extends { id: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
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
  if (data.deadCode.findings.length === 0) {
    return [{ severity: 'info' as const, message: t(locale, 'common.finding.noDeadCode'), sourceIds: [] }];
  }

  let omittedWriteOnly = 0;
  let shownWriteOnly = 0;
  const findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> = [];

  for (const finding of data.deadCode.findings) {
    if (finding.type === 'write-only-variable') {
      if (shownWriteOnly >= MAX_WRITE_ONLY_DEAD_CODE) {
        omittedWriteOnly += 1;
        continue;
      }
      shownWriteOnly += 1;
    }

    findings.push({
      severity: finding.severity,
      message: `${finding.type}: ${finding.message} → ${t(locale, 'module.finding.actionGuide.deadCode')}`,
      sourceIds: [],
    });
  }

  if (omittedWriteOnly > 0) {
    findings.push({
      severity: 'info',
      message: t(locale, 'module.finding.writeOnlyOmitted', omittedWriteOnly),
      sourceIds: [],
    });
  }

  return findings;
}

// ── Helpers ──────────────────────────────────────────────────────

function buildFlowSummary(data: ModuleReportData, locale: Locale): string {
  return [
    t(locale, 'module.flow.collect'),
    `  ${t(locale, 'module.flow.lorebook', data.collected.lorebookCBS.length)}`,
    `  ${t(locale, 'module.flow.regex', data.collected.regexCBS.length, data.collected.regexScriptTotal)}`,
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

/** module 리포트에 포함할 Lua 분석 패널들을 생성한다 */
function buildLuaPanels(data: ModuleReportData, locale: Locale): VisualizationPanel[] {
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
  panels.push(buildMetricGrid('module-lua-overview', t(locale, 'lua.panel.overview'), [
    { label: t(locale, 'lua.metric.files'), value: artifacts.length },
    { label: t(locale, 'lua.metric.functions'), value: totalFunctions },
    { label: t(locale, 'lua.metric.stateVars'), value: totalStateVars },
    { label: t(locale, 'lua.metric.handlers'), value: totalHandlers },
  ], 'lua'));

  for (const artifact of artifacts) {
    panels.push(buildDiagramPanel(
      `module-lua-flow-${artifact.baseName}`,
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
      'module-lua-state-ownership',
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
      'module-lua-correlation',
      t(locale, 'lua.panel.correlation'),
      [t(locale, 'common.table.variable'), t(locale, 'lua.html.owner'), t(locale, 'lua.html.correlation')],
      correlationRows,
      'lua',
    ));
  }

  return panels;
}
