import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml } from '../../shared';
import { type Locale, t } from './i18n';
import { buildReportDataAsset, type ReportDataPanelPayload } from './report-data-asset';
import { formatSourceLabels } from './source-links';
import { severityBadge, severityClass } from './theme';
import type {
  AnalysisVisualizationDoc,
  ChartPanel,
  DiagramPanel,
  FindingsPanel,
  HtmlReportRenderOptions,
  HtmlReportOutput,
  MetricGridPanel,
  SectionDefinition,
  TablePanel,
  VisualizationPanel,
  VisualizationSection,
} from './visualization-types';

const DEFAULT_SECTIONS: ReadonlyArray<SectionDefinition> = [
  { id: 'overview', labelKey: 'shell.tab.overview', descriptionKey: 'shell.section.overview.desc' },
  { id: 'flow', labelKey: 'shell.tab.flow', descriptionKey: 'shell.section.flow.desc' },
  { id: 'risks', labelKey: 'shell.tab.risks', descriptionKey: 'shell.section.risks.desc' },
  { id: 'sources', labelKey: 'shell.tab.sources', descriptionKey: 'shell.section.sources.desc' },
];

const SHELL_ASSET_DIR = path.join(__dirname, 'report-shell');
const TEMPLATE_PATH = path.join(SHELL_ASSET_DIR, 'template.html');
const CLIENT_JS_PATH = path.join(SHELL_ASSET_DIR, 'client.js');

let cachedTemplate: string | null = null;
let cachedClientJs: string | null = null;

/** report-shell/template.html을 디스크에서 한 번만 읽어 캐시한다 */
function loadTemplate(): string {
  if (cachedTemplate == null) {
    cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  }
  return cachedTemplate;
}

/** report-shell/client.js를 디스크에서 한 번만 읽어 캐시한다 */
function loadClientJs(): string {
  if (cachedClientJs == null) {
    cachedClientJs = fs.readFileSync(CLIENT_JS_PATH, 'utf8');
  }
  return cachedClientJs;
}

/**
 * visualization 문서를 HTML 리포트로 렌더링
 * @param doc - 렌더링할 visualization 문서
 * @param options - 출력 언어 + report 파일명 옵션
 * @returns html (완성된 HTML 문서) + clientJs (외부 report.js 소스)
 */
export function renderHtmlReportShell(doc: AnalysisVisualizationDoc, options: HtmlReportRenderOptions): HtmlReportOutput {
  const locale = options.locale ?? 'ko';
  const title = `${capitalize(doc.artifactType)} Analysis: ${doc.artifactName}`;
  const sections = doc.sections ?? DEFAULT_SECTIONS;

  const clientI18n: Record<string, string> = {
    'shell.chart.total': t(locale, 'shell.chart.total'),
    'shell.chart.fallback': t(locale, 'shell.chart.fallback'),
    'shell.chart.missingPayload': t(locale, 'shell.chart.missingPayload'),
    'shell.chart.unsupportedType': t(locale, 'shell.chart.unsupportedType'),
    'shell.diagram.nodes': t(locale, 'shell.diagram.nodes'),
    'shell.diagram.edges': t(locale, 'shell.diagram.edges'),
    'shell.diagram.noEdges': t(locale, 'shell.diagram.noEdges'),
    'lua.diagram.renderFailed': t(locale, 'lua.diagram.renderFailed'),
    'lua.diagram.empty': t(locale, 'lua.diagram.empty'),
    'lua.diagram.loadingFailed': t(locale, 'lua.diagram.loadingFailed'),
    'shell.forceGraph.empty': t(locale, 'shell.forceGraph.empty'),
    'shell.forceGraph.alwaysActive': t(locale, 'shell.forceGraph.alwaysActive'),
    'shell.forceGraph.keyword': t(locale, 'shell.forceGraph.keyword'),
    'shell.forceGraph.keywordMulti': t(locale, 'shell.forceGraph.keywordMulti'),
    'shell.forceGraph.referenceOnly': t(locale, 'shell.forceGraph.referenceOnly'),
    'shell.forceGraph.regex': t(locale, 'shell.forceGraph.regex'),
    'shell.forceGraph.variable': t(locale, 'shell.forceGraph.variable'),
    'shell.forceGraph.luaFunction': t(locale, 'shell.forceGraph.luaFunction'),
    'shell.forceGraph.luaFunctionCore': t(locale, 'shell.forceGraph.luaFunctionCore'),
    'shell.forceGraph.triggerKeyword': t(locale, 'shell.forceGraph.triggerKeyword'),
    'shell.forceGraph.edgeKeyword': t(locale, 'shell.forceGraph.edgeKeyword'),
    'shell.forceGraph.edgeVariable': t(locale, 'shell.forceGraph.edgeVariable'),
    'shell.forceGraph.edgeLoreDirect': t(locale, 'shell.forceGraph.edgeLoreDirect'),
    'shell.forceGraph.edgeTextMention': t(locale, 'shell.forceGraph.edgeTextMention'),
    'shell.forceGraph.edgeLuaCall': t(locale, 'shell.forceGraph.edgeLuaCall'),
    'shell.forceGraph.enterFullscreen': t(locale, 'shell.forceGraph.enterFullscreen'),
    'shell.forceGraph.exitFullscreen': t(locale, 'shell.forceGraph.exitFullscreen'),
  };
  const dataAsset = buildReportDataAsset({
    reportBaseName: options.reportBaseName,
    i18n: clientI18n,
    panels: collectReportPanelPayloads(doc),
  });

  const body = renderBody(doc, sections, title, locale);
  const html = loadTemplate()
    .replace('{{LOCALE}}', locale)
    .replace('{{TITLE}}', escapeHtml(title))
    .replace('{{BODY}}', body)
    .replace('{{DATA_SCRIPT_FILENAME}}', escapeHtml(dataAsset.fileName));

  return { html, clientJs: loadClientJs(), assets: [dataAsset] };
}

/** 동적 본문 영역(hero, nav, sections, footer)을 만들어 template {{BODY}} 슬롯에 들어갈 문자열을 반환한다 */
function renderBody(
  doc: AnalysisVisualizationDoc,
  sections: ReadonlyArray<SectionDefinition>,
  title: string,
  locale: Locale,
): string {
  const sectionHtml = sections.map((section) => renderSection(doc, section.id, t(locale, section.labelKey), section.descriptionKey, locale)).join('');
  const tabsHtml = sections
    .map(
      (section, index) =>
        `<button type="button" class="tab-button appearance-none border-none border-b-2 border-transparent bg-transparent text-text-muted px-5 py-3 cursor-pointer font-medium text-sm transition-all duration-200 relative hover:text-text${index === 0 ? ' active' : ''}" data-tab="${section.id}">${escapeHtml(t(locale, section.labelKey))}</button>`,
    )
    .join('');

  return `<section class="grid grid-cols-1 lg:grid-cols-[1.6fr_minmax(320px,0.9fr)] gap-5 mb-7">
      <div class="glass glass-gradient relative overflow-hidden p-7">
        <div>
          <span class="inline-flex items-center gap-2 py-1.5 px-3.5 rounded-pill border border-purple-500/25 bg-purple-500/10 text-purple-300 text-xs font-semibold tracking-widest uppercase animate-pulse-glow">${escapeHtml(t(locale, 'shell.hero.kicker'))}</span>
          <h1 class="hero-title">${escapeHtml(title)}</h1>
          <p class="text-text-muted max-w-[72ch]">${escapeHtml(t(locale, 'shell.hero.desc', capitalize(doc.artifactType)))}</p>
          ${renderSummaryTotals(doc.summary.totals)}
          ${renderHighlights(doc, locale)}
        </div>
      </div>
      <aside class="glass p-6">
        ${renderSidebar(doc, locale)}
      </aside>
    </section>

    <nav class="flex flex-wrap mb-5 border-b border-border" aria-label="Visualization sections">
      ${tabsHtml}
    </nav>

    ${sectionHtml}

    <footer class="mt-8 pt-5 border-t border-border text-text-muted text-sm text-center">${escapeHtml(t(locale, 'shell.footer', capitalize(doc.artifactType)))}</footer>`;
}

function renderSection(doc: AnalysisVisualizationDoc, section: VisualizationSection, label: string, descriptionKey: string, locale: Locale): string {
  const panels = doc.panels.filter((panel) => resolveSection(panel) === section);
  const isFirstSection = (doc.sections ?? DEFAULT_SECTIONS)[0]?.id === section;
  const content = panels.length
    ? panels.map((panel) => renderPanel(doc, panel, locale)).join('')
    : `<div class="text-text-muted text-sm">${escapeHtml(t(locale, 'shell.empty.section'))}</div>`;

  return `<section class="section-card glass p-[22px] mb-5${isFirstSection ? ' active' : ''}" data-tab="${section}"><div class="flex flex-wrap items-baseline justify-between gap-3 mb-4"><div><h2 class="mb-0 tracking-tight">${label}</h2><p class="m-0 text-text-muted">${escapeHtml(t(locale, descriptionKey))}</p></div></div>${content}${section === 'sources' ? renderSources(doc, locale) : ''}</section>`;
}

function renderPanel(doc: AnalysisVisualizationDoc, panel: VisualizationPanel, locale: Locale): string {
  switch (panel.kind) {
    case 'metric-grid':
      return renderMetricPanel(panel);
    case 'chart':
      return renderChartPanel(panel);
    case 'diagram':
      return renderDiagramPanel(panel, locale);
    case 'findings':
      return renderFindingsPanel(doc, panel, locale);
    case 'table':
      return renderTablePanel(doc, panel, locale);
  }
}

function renderMetricPanel(panel: MetricGridPanel): string {
  return `<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="metric-grid" data-panel-id="${escapeHtml(panel.id)}"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-['◆'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">${escapeHtml(panel.title)}</h3>${panel.description ? `<p class="m-0 text-text-muted">${escapeHtml(panel.description)}</p>` : ''}</div></div><div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">${panel.items
    .map(
      (item) => `<div class="relative overflow-hidden p-[18px] rounded-xl bg-gradient-to-b from-bg-panel to-bg-elevated border border-glass-border transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] metric-card-glow metric-card-bar ${severityClass(item.severity)}" data-severity-item="true" data-severity="${item.severity ?? 'neutral'}"><span class="block text-text-muted text-[0.82rem] mb-2.5">${escapeHtml(item.label)}</span><div class="metric-value-gradient">${escapeHtml(String(item.value))}</div></div>`,
    )
    .join('')}</div></article>`;
}

function renderChartPanel(panel: ChartPanel): string {
  return `<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="chart" data-panel-id="${escapeHtml(panel.id)}" data-library="chartjs" data-report-payload-key="${escapeHtml(panel.id)}"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-['◆'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">${escapeHtml(panel.title)}</h3>${panel.description ? `<p class="m-0 text-text-muted">${escapeHtml(panel.description)}</p>` : ''}</div>${severityBadge('info')}</div><div class="relative min-h-[260px] p-2 rounded-xl bg-[rgba(12,14,26,0.6)] border border-glass-border dot-grid" style="height:${panel.height ?? 300}px"><div class="chart-mount w-full" style="height:100%"></div><div class="chart-fallback text-text-muted text-sm"></div></div></article>`;
}

function renderDiagramPanel(panel: DiagramPanel, locale: Locale): string {
  const isRelationshipNetwork = isRelationshipNetworkPanel(panel);
  const fallback =
    panel.library === 'text'
      ? `<pre>${escapeHtml(typeof panel.payload === 'string' ? panel.payload : JSON.stringify(panel.payload, null, 2))}</pre>`
      : panel.library === 'lua-flow' && typeof panel.payload === 'string'
        ? panel.payload
        : `<div class="diagram-fallback">${escapeHtml(t(locale, 'shell.diagram.fallback'))}</div>`;
  const panelAttrs = isRelationshipNetwork
    ? ' data-force-graph-mode="relationship-network" data-force-graph-fullscreen-host="true"'
    : '';
  const surfaceAttrs = isRelationshipNetwork ? ' data-force-graph-surface="true"' : '';
  const headerActions = `${isRelationshipNetwork ? `<button type="button" class="panel-tool-button" data-force-graph-fullscreen-toggle="true">${escapeHtml(t(locale, 'shell.forceGraph.enterFullscreen'))}</button>` : ''}${severityBadge('info')}`;

  return `<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="diagram" data-panel-id="${escapeHtml(panel.id)}" data-library="${escapeHtml(panel.library)}" data-report-payload-key="${escapeHtml(panel.id)}"${panelAttrs}><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-['◆'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">${escapeHtml(panel.title)}</h3>${panel.description ? `<p class="m-0 text-text-muted">${escapeHtml(panel.description)}</p>` : ''}</div><div class="flex flex-wrap items-center gap-2">${headerActions}</div></div><div class="p-4 rounded-xl bg-[rgba(12,14,26,0.6)] border border-glass-border dot-grid" data-library="${escapeHtml(panel.library)}"${surfaceAttrs} style="min-height:${panel.height ?? 220}px"><div class="diagram-mount">${fallback}</div></div></article>`;
}

function isRelationshipNetworkPanel(panel: DiagramPanel): boolean {
  return panel.library === 'force-graph' && (panel.id === 'charx-relationship-network' || panel.id === 'module-relationship-network');
}

function renderFindingsPanel(doc: AnalysisVisualizationDoc, panel: FindingsPanel, locale: Locale): string {
  if (panel.findings.length === 0) {
    return `<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="findings" data-panel-id="${escapeHtml(panel.id)}"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-['◆'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">${escapeHtml(panel.title)}</h3>${panel.description ? `<p class="m-0 text-text-muted">${escapeHtml(panel.description)}</p>` : ''}</div></div><div class="text-text-muted text-sm">${escapeHtml(t(locale, 'shell.empty.findings'))}</div></article>`;
  }

  return `<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="findings" data-panel-id="${escapeHtml(panel.id)}"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-['◆'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">${escapeHtml(panel.title)}</h3>${panel.description ? `<p class="m-0 text-text-muted">${escapeHtml(panel.description)}</p>` : ''}</div></div>${renderSeverityFilterBar(locale)}<div class="grid gap-3">${panel.findings
    .map((finding) => {
      const sourceLabels = finding.sourceIds.length ? formatSourceLabels(doc, finding.sourceIds) : t(locale, 'shell.source.noSourceLinks');
      return `<div class="finding-item ${severityClass(finding.severity)}" data-severity-item="true" data-severity="${finding.severity}"><div class="flex flex-wrap gap-3 items-start">${severityBadge(finding.severity)}<div>${escapeHtml(finding.message)}</div></div><div class="mt-3 pt-2.5 border-t border-white/[0.04] text-text-muted text-[0.83rem]">${escapeHtml(t(locale, 'shell.source.header'))}: ${escapeHtml(sourceLabels)}</div></div>`;
    })
    .join('')}</div></article>`;
}

function renderTablePanel(doc: AnalysisVisualizationDoc, panel: TablePanel, locale: Locale): string {
  const hasSourceColumn = panel.rows.some((row) => (row.sourceIds?.length ?? 0) > 0);
  // 큰 표는 본문 HTML 크기를 키우는 주범이므로 rows는 sidecar data bundle로 분리하고
  // client.js가 hydrateTables()에서 tbody를 채운다. rows가 비어 있을 때만 placeholder를 인라인 렌더링한다.
  const rowsHtml = panel.rows.length
    ? ''
    : `<tr><td colspan="${panel.columns.length + (hasSourceColumn ? 1 : 0)}" class="text-text-muted">${escapeHtml(t(locale, 'shell.empty.rows'))}</td></tr>`;
  const columns = hasSourceColumn
    ? [...panel.columns, t(locale, 'shell.source.header')]
    : panel.columns;

  return `<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="table" data-panel-id="${escapeHtml(panel.id)}"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-['◆'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">${escapeHtml(panel.title)}</h3>${panel.description ? `<p class="m-0 text-text-muted">${escapeHtml(panel.description)}</p>` : ''}</div></div>${panel.rows.length ? renderSeverityFilterBar(locale) : ''}${panel.filterPlaceholder ? `<div class="flex flex-col lg:flex-row justify-between gap-2.5 items-stretch lg:items-center mb-3.5"><input class="w-full lg:w-[min(360px,100%)] py-2.5 px-3.5 rounded-xl border border-border bg-[rgba(12,14,26,0.8)] text-text transition-all duration-200 focus:outline-none focus:border-accent-info/50 focus:ring-[3px] focus:ring-accent-info/[0.12]" type="text" placeholder="${escapeHtml(panel.filterPlaceholder)}" data-table-filter-target="${escapeHtml(panel.id)}"></div>` : ''}<div class="overflow-auto rounded-xl border border-glass-border"><table class="w-full border-collapse min-w-[640px]"><thead><tr>${columns.map((column) => `<th class="sticky top-0 px-4 py-3 border-b border-white/[0.04] text-left align-top bg-gradient-to-b from-[rgba(22,28,55,0.98)] to-[rgba(18,22,44,0.98)] text-text-muted text-xs font-semibold tracking-wider uppercase">${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody class="[&_tr:nth-child(even)_td]:bg-white/[0.015] [&_tr:hover_td]:bg-accent-info/[0.04]" data-report-table-body="true">${rowsHtml}</tbody></table></div></article>`;
}

function buildTablePanelPayload(doc: AnalysisVisualizationDoc, panel: TablePanel): ReportDataPanelPayload {
  const hasSourceColumn = panel.rows.some((row) => (row.sourceIds?.length ?? 0) > 0);
  const rows = panel.rows.map((row) => {
    const sourceLabels = row.sourceIds?.length ? formatSourceLabels(doc, row.sourceIds) : '';
    const searchText = row.searchText || [...row.cells, sourceLabels].join(' ');
    const entry: {
      cells: string[];
      severity?: string;
      searchText?: string;
      sourceLabelsHtml?: string;
    } = {
      cells: row.cells,
      severity: row.severity ?? 'neutral',
      searchText,
    };
    if (hasSourceColumn) entry.sourceLabelsHtml = escapeHtml(sourceLabels || '—');
    return entry;
  });
  return { kind: 'table', payload: { hasSourceColumn, rows } };
}

function renderSeverityFilterBar(locale: Locale): string {
  return `<div class="flex flex-wrap gap-2.5 mb-4" aria-label="Severity filters" data-severity-filter-bar="true"><button type="button" class="sev-chip active" data-severity="all">${escapeHtml(t(locale, 'shell.filter.all'))}</button><button type="button" class="sev-chip" data-severity="error">${escapeHtml(t(locale, 'shell.filter.error'))}</button><button type="button" class="sev-chip" data-severity="warning">${escapeHtml(t(locale, 'shell.filter.warning'))}</button><button type="button" class="sev-chip" data-severity="info">${escapeHtml(t(locale, 'shell.filter.info'))}</button></div>`;
}

function renderSources(doc: AnalysisVisualizationDoc, locale: Locale): string {
  if (doc.sources.length === 0) {
    return `<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="sources"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-['◆'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">${escapeHtml(t(locale, 'shell.source.header'))}</h3><p class="m-0 text-text-muted">${escapeHtml(t(locale, 'shell.empty.sources'))}</p></div></div></article>`;
  }

  return `<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="sources"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-['◆'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">${escapeHtml(t(locale, 'shell.source.header'))}</h3><p class="m-0 text-text-muted">${escapeHtml(t(locale, 'shell.source.desc'))}</p></div></div><div class="overflow-auto rounded-xl border border-glass-border"><table class="w-full border-collapse min-w-[640px]"><thead><tr><th class="sticky top-0 px-4 py-3 border-b border-white/[0.04] text-left align-top bg-gradient-to-b from-[rgba(22,28,55,0.98)] to-[rgba(18,22,44,0.98)] text-text-muted text-xs font-semibold tracking-wider uppercase">ID</th><th class="sticky top-0 px-4 py-3 border-b border-white/[0.04] text-left align-top bg-gradient-to-b from-[rgba(22,28,55,0.98)] to-[rgba(18,22,44,0.98)] text-text-muted text-xs font-semibold tracking-wider uppercase">Label</th><th class="sticky top-0 px-4 py-3 border-b border-white/[0.04] text-left align-top bg-gradient-to-b from-[rgba(22,28,55,0.98)] to-[rgba(18,22,44,0.98)] text-text-muted text-xs font-semibold tracking-wider uppercase">Element Type</th><th class="sticky top-0 px-4 py-3 border-b border-white/[0.04] text-left align-top bg-gradient-to-b from-[rgba(22,28,55,0.98)] to-[rgba(18,22,44,0.98)] text-text-muted text-xs font-semibold tracking-wider uppercase">Path</th></tr></thead><tbody class="[&_tr:nth-child(even)_td]:bg-white/[0.015] [&_tr:hover_td]:bg-accent-info/[0.04]">${doc.sources
    .map((source) => `<tr><td class="px-4 py-3 border-b border-white/[0.04] text-left align-top text-text"><code class="bg-accent-info/10 px-[7px] py-[2px] rounded-md text-[0.88rem]">${escapeHtml(source.id)}</code></td><td class="px-4 py-3 border-b border-white/[0.04] text-left align-top text-text">${escapeHtml(source.label)}</td><td class="px-4 py-3 border-b border-white/[0.04] text-left align-top text-text">${escapeHtml(source.elementType)}</td><td class="px-4 py-3 border-b border-white/[0.04] text-left align-top text-text">${escapeHtml(source.path || '—')}</td></tr>`)
    .join('')}</tbody></table></div></article>`;
}

function renderSummaryTotals(
  totals: AnalysisVisualizationDoc['summary']['totals'],
): string {
  if (totals.length === 0) return '';
  return `<div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3 mt-6">${totals
    .map(
      (item) => `<div class="relative overflow-hidden p-[18px] rounded-xl bg-gradient-to-b from-bg-panel to-bg-elevated border border-glass-border transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] metric-card-glow metric-card-bar ${severityClass(item.severity)}" data-severity-item="true" data-severity="${item.severity ?? 'neutral'}"><span class="block text-text-muted text-[0.82rem] mb-2.5">${escapeHtml(item.label)}</span><div class="metric-value-gradient">${escapeHtml(String(item.value))}</div></div>`,
    )
    .join('')}</div>`;
}

function renderHighlights(doc: AnalysisVisualizationDoc, locale: Locale): string {
  if (doc.summary.highlights.length === 0) {
    return `<div class="grid gap-2.5 mt-5"><div class="grid grid-cols-[auto_1fr] items-start gap-3 py-3.5 px-4 rounded-[14px] border border-glass-border bg-[rgba(12,14,26,0.5)] transition-colors duration-150 hover:bg-bg-panel/60"><span class="badge inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-accent-info/[0.14] text-blue-300 border border-accent-info/20">\u25cf info</span><div><strong class="block mb-0.5">${escapeHtml(t(locale, 'shell.highlight.noHighlights'))}</strong><span class="text-text-muted">${escapeHtml(t(locale, 'shell.highlight.noHighlightsDesc'))}</span></div></div></div>`;
  }

  return `<div class="grid gap-2.5 mt-5">${doc.summary.highlights
    .map((highlight) => `<div class="grid grid-cols-[auto_1fr] items-start gap-3 py-3.5 px-4 rounded-[14px] border border-glass-border bg-[rgba(12,14,26,0.5)] transition-colors duration-150 hover:bg-bg-panel/60" data-severity-item="true" data-severity="${highlight.severity}">${severityBadge(highlight.severity)}<div><strong class="block mb-0.5">${escapeHtml(highlight.title)}</strong><span class="text-text-muted">${escapeHtml(highlight.message)}</span></div></div>`)
    .join('')}</div>`;
}

function renderSidebar(doc: AnalysisVisualizationDoc, locale: Locale): string {
  const score = Math.max(0, Math.min(100, Number(doc.summary.score ?? 0)));
  return `${doc.summary.score != null ? `<div class="score-ring" style="--score:${score}"><span>${score}</span></div>` : ''}<h2 class="mb-3.5 tracking-tight">${escapeHtml(t(locale, 'shell.sidebar.nextActions'))}</h2>${doc.summary.nextActions.length ? `<ul class="m-0 pl-5 text-text-muted [&_li+li]:mt-2">${doc.summary.nextActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ul>` : `<p class="text-text-muted">${escapeHtml(t(locale, 'shell.sidebar.noActions'))}</p>`}<div class="text-text-muted mt-3.5">${escapeHtml(`${doc.panels.length} panels \u00b7 ${doc.sources.length} sources`)}</div>`;
}

function resolveSection(panel: VisualizationPanel): VisualizationSection {
  if (panel.section) return panel.section;
  if (panel.kind === 'diagram') return 'flow';
  if (panel.kind === 'findings') return 'risks';
  if (panel.kind === 'table') return 'sources';
  return 'overview';
}

function collectReportPanelPayloads(doc: AnalysisVisualizationDoc): Record<string, ReportDataPanelPayload> {
  const panels: Record<string, ReportDataPanelPayload> = {};

  for (const panel of doc.panels) {
    if (panel.kind === 'chart') {
      panels[panel.id] = { kind: 'chart', payload: panel.config };
      continue;
    }
    if (panel.kind === 'diagram') {
      panels[panel.id] = { kind: 'diagram', payload: panel.payload };
      continue;
    }
    if (panel.kind === 'table' && panel.rows.length > 0) {
      panels[panel.id] = buildTablePanelPayload(doc, panel);
    }
  }

  return panels;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
