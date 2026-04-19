import fs from 'node:fs';
import path from 'node:path';
import { buildChartPanel, buildDiagramPanel, buildFindingPanel, buildMetricGrid, buildTablePanel } from '../../shared/view-model';
import { buildPromptChainGraphPanel } from '../../shared/relationship-network-builders';
import { escapeHtml } from '../../../shared';
import { renderHtmlReportShell } from '../../shared/html-report-shell';
import { createSourceId, dedupeSources } from '../../shared/source-links';
import { type Locale, t } from '../../shared/i18n';
import type { AnalysisVisualizationDoc, SectionDefinition, VisualizationPanel, VisualizationSource } from '../../shared/visualization-types';
import type { PresetReportData } from '../types';

// ── Section definitions (질문 기반) ───────────────────────────────

const PRESET_SECTIONS: SectionDefinition[] = [
  { id: 'overview', labelKey: 'shell.tab.overview', descriptionKey: 'shell.section.overview.desc' },
  { id: 'chain', labelKey: 'shell.tab.chain', descriptionKey: 'shell.section.chain.desc' },
  { id: 'improvements', labelKey: 'shell.tab.improvements', descriptionKey: 'shell.section.improvements.desc' },
  { id: 'details', labelKey: 'shell.tab.details', descriptionKey: 'shell.section.details.desc' },
];

// ── Score computation (100점 감점 방식) ───────────────────────────

function computePresetScore(data: PresetReportData): number {
  let score = 100;

  // Chain 건강 (-25): issues per chain link
  if (data.promptChain.chain.length > 0) {
    const issueRatio = data.promptChain.issues.length / data.promptChain.chain.length;
    score -= Math.min(25, Math.round(issueRatio * 25));
  }

  // 외부 의존성 (-15)
  if (data.promptChain.externalDeps.length > 0) {
    score -= Math.min(15, data.promptChain.externalDeps.length * 3);
  }

  // Template 활용 (-15): 템플릿 없으면 감점
  if (data.collected.promptTemplates.length === 0 && data.collected.prompts.length > 2) {
    score -= 15;
  }

  // Dead code (-15): findings × 3
  score -= Math.min(15, data.deadCode.summary.totalFindings * 3);

  // Flow 이슈 (-15): issues × 5
  score -= Math.min(15, data.variableFlow.summary.withIssues * 5);

  // Model 설정 (-5)
  if (!data.collected.model) score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ── Main renderer ────────────────────────────────────────────────

/** preset analysis HTML report를 생성한다. */
export function renderPresetHtml(data: PresetReportData, outputDir: string, locale: Locale = 'ko'): void {
  const sources = buildSources(data);
  const score = computePresetScore(data);
  const panels = buildAllPanels(data, locale);

  const doc: AnalysisVisualizationDoc = {
    artifactType: 'preset',
    artifactName: data.presetName,
    sections: PRESET_SECTIONS,
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
  const reportBaseName = 'preset-analysis';
  const { html, clientJs, assets } = renderHtmlReportShell(doc, { locale, reportBaseName });
  fs.writeFileSync(path.join(analysisDir, `${reportBaseName}.html`), html, 'utf-8');
  fs.writeFileSync(path.join(analysisDir, 'report.js'), clientJs, 'utf-8');
  for (const asset of assets) {
    fs.writeFileSync(path.join(analysisDir, asset.fileName), asset.contents, 'utf-8');
  }
}

// ── Summary totals ───────────────────────────────────────────────

function buildSummaryTotals(data: PresetReportData, locale: Locale) {
  return [
    { label: t(locale, 'preset.label.prompts'), value: data.collected.prompts.length },
    { label: t(locale, 'preset.label.templates'), value: data.collected.promptTemplates.length },
    { label: t(locale, 'preset.label.chainSteps'), value: data.promptChain.chain.length },
    {
      label: t(locale, 'preset.label.totalTokens'),
      value: data.promptChain.totalEstimatedTokens,
      severity: 'info' as const,
    },
    ...(data.promptChain.externalDeps.length > 0
      ? [{ label: t(locale, 'preset.label.externalDeps'), value: data.promptChain.externalDeps.length, severity: 'warning' as const }]
      : []),
  ];
}

// ── Highlights ───────────────────────────────────────────────────

function buildHighlights(data: PresetReportData, locale: Locale) {
  const highlights: AnalysisVisualizationDoc['summary']['highlights'] = [];

  // Chain summary (항상)
  const totalK = Math.round(data.promptChain.totalEstimatedTokens / 1000);
  highlights.push({
    title: t(locale, 'preset.highlight.promptChain'),
    message: t(locale, 'preset.highlight.chainSummary', data.promptChain.chain.length, totalK),
    severity: data.promptChain.issues.length > 0 ? 'warning' : 'info',
  });

  // External deps
  if (data.promptChain.externalDeps.length > 0) {
    highlights.push({
      title: t(locale, 'preset.label.externalDeps'),
      message: t(locale, 'preset.highlight.externalDeps', data.promptChain.externalDeps.length),
      severity: 'warning',
    });
  }

  // Largest prompt (항상)
  const largest = data.promptChain.chain.length > 0
    ? [...data.promptChain.chain].sort((a, b) => b.estimatedTokens - a.estimatedTokens)[0]
    : null;
  if (largest) {
    highlights.push({
      title: t(locale, 'preset.label.prompts'),
      message: t(locale, 'preset.highlight.largestPrompt', largest.name, Math.round(largest.estimatedTokens / 1000)),
      severity: 'info',
    });
  }

  return highlights.slice(0, 3);
}

// ── Panels ───────────────────────────────────────────────────────

function buildAllPanels(data: PresetReportData, locale: Locale): VisualizationPanel[] {
  const panels: VisualizationPanel[] = [];

  // === 개요 탭 ===
  panels.push(buildMetricGrid('preset-overview', t(locale, 'common.label.overview'), [
    { label: t(locale, 'preset.label.promptFiles'), value: data.collected.prompts.length },
    { label: t(locale, 'preset.label.templateItems'), value: data.collected.promptTemplates.length },
    { label: t(locale, 'module.label.regexScripts'), value: data.collected.regexCBS.length },
    { label: t(locale, 'preset.label.modelConfig'), value: data.collected.model ? t(locale, 'common.label.present') : t(locale, 'common.label.missing'), severity: data.collected.model ? 'info' : 'warning' },
    { label: t(locale, 'common.label.flowIssues'), value: data.variableFlow.summary.withIssues, severity: data.variableFlow.summary.withIssues > 0 ? 'warning' : 'info' },
    { label: t(locale, 'common.label.deadCode'), value: data.deadCode.summary.totalFindings, severity: data.deadCode.summary.totalFindings > 0 ? 'warning' : 'info' },
  ], 'overview'));

  // === 프롬프트 체인 탭 ===
  // Chain diagram (mermaid)
  panels.push(buildDiagramPanel(
    'preset-chain-diagram',
    t(locale, 'preset.panel.chainDiagram'),
    'mermaid',
    buildPromptChainDiagram(data, locale),
    'chain',
  ));

  const chainGraph = buildPromptChainGraphPanel(
    'preset-chain-dep-graph',
    data.promptChain,
    data.collected.regexCBS,
    locale,
    'chain',
  );
  if (chainGraph) {
    panels.push(chainGraph);
  }

  // Chain token distribution (horizontalBar — 가독성 개선!)
  const chainTokenPanel = buildChartPanel(
    'preset-chain-tokens',
    t(locale, 'preset.panel.chainTokens'),
    buildPromptChainTokenChart(data),
    'chain',
    Math.max(300, data.promptChain.chain.length * 36),
  );
  chainTokenPanel.description = t(locale, 'preset.panel.chainTokensDesc');
  panels.push(chainTokenPanel);

  // Chain health metric grid
  panels.push(buildMetricGrid('preset-chain-health', t(locale, 'preset.panel.chainHealth'), [
    { label: t(locale, 'preset.metric.selfContained'), value: data.promptChain.selfContainedVars.length },
    { label: t(locale, 'preset.metric.externalDeps'), value: data.promptChain.externalDeps.length, severity: data.promptChain.externalDeps.length > 0 ? 'warning' : 'info' },
    { label: t(locale, 'preset.metric.totalTokens'), value: data.promptChain.totalEstimatedTokens },
    { label: t(locale, 'preset.metric.chainIssues'), value: data.promptChain.issues.length, severity: data.promptChain.issues.length > 0 ? 'warning' : 'info' },
  ], 'chain'));

  // === 개선점 탭 ===
  // Chain issue findings
  const chainFindings = buildFindingPanel(
    'preset-chain-findings',
    t(locale, 'preset.panel.promptChainIssues'),
    buildPromptChainFindings(data, locale),
    'improvements',
  );
  chainFindings.description = t(locale, 'preset.panel.findingsDesc');
  panels.push(chainFindings);

  // External deps table (조건부)
  if (data.promptChain.externalDeps.length > 0) {
    panels.push(buildTablePanel(
      'preset-ext-deps',
      t(locale, 'preset.panel.externalDepsTable'),
      [t(locale, 'common.table.variable'), t(locale, 'common.table.type')],
      data.promptChain.externalDeps.map((dep) => ({
        cells: [`<code>${escapeHtml(dep)}</code>`, 'external'],
        severity: 'warning' as const,
      })),
      'improvements',
    ));
  }

  // Dead code findings
  panels.push(buildFindingPanel(
    'preset-dead-code',
    t(locale, 'preset.panel.deadCode'),
    buildDeadCodeFindings(data, locale),
    'improvements',
  ));

  // Variable flow summary (이슈 있을 때만)
  if (data.variableFlow.summary.withIssues > 0) {
    panels.push(buildDiagramPanel(
      'preset-var-flow-summary',
      t(locale, 'preset.panel.variableFlowSummary'),
      'text',
      buildVariableFlowSummary(data, locale),
      'improvements',
    ));
  }

  // General findings
  panels.push(buildFindingPanel(
    'preset-risks',
    t(locale, 'preset.panel.risks'),
    buildFindings(data, locale),
    'improvements',
  ));

  // === 상세 탭 ===
  // Prompt/template variable table
  panels.push(buildTablePanel(
    'preset-var-table',
    t(locale, 'preset.panel.promptVarTable'),
    [t(locale, 'preset.table.source'), t(locale, 'preset.table.reads'), t(locale, 'preset.table.writes'), t(locale, 'common.table.sources')],
    [
      ...data.collected.prompts.map((prompt) => ({
        cells: [escapeHtml(prompt.name), escapeHtml([...prompt.reads].join(', ') || '—'), escapeHtml([...prompt.writes].join(', ') || '—'), escapeHtml(`[preset]/prompt/${prompt.name}`)],
        sourceIds: [createSourceId(`[preset]/prompt/${prompt.name}`)],
        searchText: [prompt.name, prompt.chainType, ...prompt.reads, ...prompt.writes].join(' '),
      })),
      ...data.collected.promptTemplates.map((template) => ({
        cells: [escapeHtml(template.name), escapeHtml([...template.reads].join(', ') || '—'), escapeHtml([...template.writes].join(', ') || '—'), escapeHtml(`[preset]/template/${template.name}`)],
        sourceIds: [createSourceId(`[preset]/template/${template.name}`)],
        searchText: [template.name, template.chainType, ...template.reads, ...template.writes].join(' '),
      })),
    ],
    'details',
    t(locale, 'charx.filter.variables'),
  ));

  // Chain steps table
  panels.push(buildTablePanel(
    'preset-chain-steps',
    t(locale, 'preset.panel.chainStepsTable'),
    [t(locale, 'preset.table.index'), t(locale, 'preset.table.name'), t(locale, 'common.table.type'), t(locale, 'preset.table.tokens'), t(locale, 'preset.table.conditional'), t(locale, 'preset.table.satisfied'), t(locale, 'preset.table.unsatisfied')],
    data.promptChain.chain.map((link) => ({
      cells: [
        String(link.index),
        escapeHtml(link.name),
        escapeHtml(link.type),
        String(link.estimatedTokens),
        link.hasConditional ? t(locale, 'common.label.yes') : t(locale, 'common.label.no'),
        escapeHtml(link.satisfiedDeps.join(', ') || '—'),
        escapeHtml(link.unsatisfiedDeps.join(', ') || '—'),
      ],
      severity: link.unsatisfiedDeps.length > 0 ? 'warning' as const : 'info' as const,
      searchText: [link.name, link.type, ...link.satisfiedDeps, ...link.unsatisfiedDeps].join(' '),
    })),
    'details',
    t(locale, 'preset.filter.promptChain'),
  ));

  return panels;
}

// ── Chart builders ───────────────────────────────────────────────

function buildPromptChainTokenChart(data: PresetReportData): Record<string, unknown> {
  return {
    type: 'horizontalBar',
    data: {
      labels: data.promptChain.chain.map((link) => link.name),
      datasets: [
        {
          data: data.promptChain.chain.map((link) => link.estimatedTokens),
          backgroundColor: data.promptChain.chain.map((link) =>
            link.unsatisfiedDeps.length > 0 ? '#f59e0b' : '#38bdf8',
          ),
        },
      ],
    },
  };
}

// ── Diagrams ─────────────────────────────────────────────────────

function buildPromptChainDiagram(data: PresetReportData, locale: Locale): string {
  const lines = ['flowchart TD'];
  if (data.promptChain.chain.length === 0) {
    lines.push(`Empty["${t(locale, 'preset.diagram.noChainLinks')}"]`);
    return lines.join('\n');
  }

  data.promptChain.chain.forEach((link, index) => {
    const tokenLabel = `${link.estimatedTokens}t`;
    const hasIssue = link.unsatisfiedDeps.length > 0;
    const nodeLabel = escapeMermaid(`${link.name} (${link.type}) [${tokenLabel}]`);
    lines.push(`L${index}["${nodeLabel}"]`);
    if (hasIssue) {
      lines.push(`style L${index} stroke:#f87171,stroke-width:2px`);
    }
    if (index > 0) {
      lines.push(`L${index - 1} --> L${index}`);
    }
  });

  return lines.join('\n');
}

// ── Sources ──────────────────────────────────────────────────────

function buildSources(data: PresetReportData): VisualizationSource[] {
  const sources: VisualizationSource[] = [];
  for (const prompt of data.collected.prompts) {
    sources.push({
      id: createSourceId(`[preset]/prompt/${prompt.name}`),
      label: `[preset]/prompt/${prompt.name}`,
      path: prompt.sourcePath ?? `prompts/${prompt.name}.txt`,
      elementType: 'prompt',
    });
  }
  for (const template of data.collected.promptTemplates) {
    sources.push({
      id: createSourceId(`[preset]/template/${template.name}`),
      label: `[preset]/template/${template.name}`,
      path: template.sourcePath ?? `prompt_template/${template.name}.json`,
      elementType: 'template',
    });
  }
  for (const regex of data.collected.regexCBS) {
    sources.push({
      id: createSourceId(regex.elementName),
      label: regex.elementName,
      path: regex.elementName,
      elementType: regex.elementType,
    });
  }
  return dedupeSources(sources);
}

// ── Next actions ─────────────────────────────────────────────────

function buildNextActions(data: PresetReportData, locale: Locale): string[] {
  const actions: string[] = [];
  if (data.promptChain.externalDeps.length > 0) {
    actions.push(t(locale, 'preset.action.resolveExtDeps'));
  }
  if (data.collected.promptTemplates.length === 0) {
    actions.push(t(locale, 'preset.action.noTemplateChain'));
  }
  if (data.promptChain.issues.length > 0) {
    actions.push(t(locale, 'preset.action.inspectChainIssues'));
  }
  if (data.variableFlow.summary.withIssues > 0) {
    actions.push(t(locale, 'preset.action.inspectFlow'));
  }
  if (!data.collected.model) {
    actions.push(t(locale, 'preset.action.missingModel'));
  }
  if (data.collected.regexCBS.length > 0) {
    actions.push(t(locale, 'preset.action.reviewRegex'));
  }
  if (actions.length === 0) {
    actions.push(t(locale, 'preset.action.noFollowUp'));
  }
  return actions;
}

// ── Findings (with action guides) ────────────────────────────────

function buildFindings(data: PresetReportData, locale: Locale): Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> {
  const findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> = [];
  if (data.collected.prompts.length === 0) {
    findings.push({ severity: 'warning', message: t(locale, 'preset.finding.noPrompts'), sourceIds: [] });
  }
  if (data.collected.promptTemplates.length === 0) {
    findings.push({ severity: 'warning', message: t(locale, 'preset.finding.noTemplates'), sourceIds: [] });
  }
  if (data.unifiedGraph.size > 0) {
    findings.push({ severity: 'info', message: t(locale, 'preset.finding.cbsMapped', data.unifiedGraph.size), sourceIds: [] });
  }
  if (data.promptChain.externalDeps.length > 0) {
    findings.push({
      severity: 'warning',
      message: `${t(locale, 'preset.finding.extDeps', data.promptChain.externalDeps.length)} → ${t(locale, 'preset.finding.actionGuide.externalDep')}`,
      sourceIds: [],
    });
  }
  if (data.variableFlow.summary.withIssues > 0) {
    findings.push({
      severity: 'warning',
      message: `${t(locale, 'preset.finding.flowRisks', data.variableFlow.summary.withIssues)} → ${t(locale, 'preset.finding.actionGuide.flowIssue')}`,
      sourceIds: [],
    });
  }
  return findings;
}

function buildPromptChainFindings(data: PresetReportData, locale: Locale) {
  return data.promptChain.issues.length > 0
    ? data.promptChain.issues.map((issue) => ({
        severity: issue.severity,
        message: `${issue.type}: ${issue.message} → ${t(locale, 'preset.finding.actionGuide.chainIssue')}`,
        sourceIds: [],
      }))
    : [{ severity: 'info' as const, message: t(locale, 'preset.finding.noPromptChainIssues'), sourceIds: [] }];
}

function buildDeadCodeFindings(data: PresetReportData, locale: Locale) {
  return data.deadCode.findings.length > 0
    ? data.deadCode.findings.map((finding) => ({
        severity: finding.severity,
        message: `${finding.type}: ${finding.message} → ${t(locale, 'preset.finding.actionGuide.deadCode')}`,
        sourceIds: [],
      }))
    : [{ severity: 'info' as const, message: t(locale, 'common.finding.noDeadCode'), sourceIds: [] }];
}

// ── Helpers ──────────────────────────────────────────────────────

function buildVariableFlowSummary(data: PresetReportData, locale: Locale): string {
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

function escapeMermaid(value: string): string {
  return value.replace(/"/g, '\\"');
}
