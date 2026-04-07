import { escapeHtml } from '../../shared';
import { type Locale, t } from './i18n';
import { buildReportDataAsset, type ReportDataPanelPayload } from './report-data-asset';
import { getReportClientJs } from './report-client-js';
import { formatSourceLabels, resolveSource } from './source-links';
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
  const sectionHtml = sections.map((section) => renderSection(doc, section.id, t(locale, section.labelKey), section.descriptionKey, locale)).join('');

  const clientI18n: Record<string, string> = {
    'shell.chart.total': t(locale, 'shell.chart.total'),
    'shell.chart.fallback': t(locale, 'shell.chart.fallback'),
    'shell.chart.missingPayload': t(locale, 'shell.chart.missingPayload'),
    'shell.chart.unsupportedType': t(locale, 'shell.chart.unsupportedType'),
    'shell.diagram.nodes': t(locale, 'shell.diagram.nodes'),
    'shell.diagram.edges': t(locale, 'shell.diagram.edges'),
    'shell.diagram.noEdges': t(locale, 'shell.diagram.noEdges'),
    'shell.forceGraph.empty': t(locale, 'shell.forceGraph.empty'),
    'shell.forceGraph.alwaysActive': t(locale, 'shell.forceGraph.alwaysActive'),
    'shell.forceGraph.normal': t(locale, 'shell.forceGraph.normal'),
    'shell.forceGraph.selective': t(locale, 'shell.forceGraph.selective'),
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

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            bg: { DEFAULT: '#0c0e1a', elevated: '#12152a', panel: '#161930', 'panel-2': '#1a1e3a' },
            border: '#252a48',
            text: { DEFAULT: '#eaedf6', muted: '#a0a8c4' },
            accent: { info: '#60a5fa', warning: '#f0a030', error: '#f06060', neutral: '#64748b' },
            glass: { bg: 'rgba(22,25,48,0.65)', border: 'rgba(255,255,255,0.07)' },
          },
          fontFamily: {
            sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
          },
          borderRadius: { pill: '999px' },
          animation: {
            'fade-in': 'fadeIn 0.5s ease-out',
            'ring-fill': 'ringFill 0.8s ease-out',
            'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
          },
          keyframes: {
            fadeIn: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
            ringFill: { from: { opacity: '0', transform: 'scale(0.85)' }, to: { opacity: '1', transform: 'none' } },
            pulseGlow: { '0%, 100%': { opacity: '0.7' }, '50%': { opacity: '1' } },
          },
        },
      },
    }
  <\/script>
  <style type="text/tailwindcss">
    @layer base {
      html { min-height: 100%; }
      body {
        @apply min-h-screen bg-bg text-text font-sans leading-relaxed antialiased;
        background-image:
          radial-gradient(ellipse 80% 50% at 50% -10%, rgba(100, 60, 200, 0.12) 0%, transparent 60%),
          radial-gradient(ellipse 60% 40% at 80% 50%, rgba(60, 120, 250, 0.05) 0%, transparent 50%);
      }
      button, input { font: inherit; }
      code, pre { @apply font-mono; }
      code { @apply bg-purple-500/10 text-purple-300 px-[7px] py-[2px] rounded-md text-[0.88em]; }
      [data-library="text"] pre { @apply m-0 whitespace-pre-wrap text-[0.9rem] text-text; }
      td { @apply px-4 py-3 border-b border-white/[0.04] text-left align-top text-text; }
    }
    @layer components {
      .glass {
        @apply bg-glass-bg border border-glass-border rounded-2xl;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
      }
      .glass-gradient::before {
        content: '';
        @apply absolute inset-0 pointer-events-none;
        background: linear-gradient(135deg, rgba(100, 80, 200, 0.08) 0%, rgba(60, 130, 246, 0.06) 50%, transparent 100%);
      }
      .score-ring {
        @apply w-[110px] h-[110px] rounded-full grid place-items-center mb-5 animate-ring-fill;
        background: conic-gradient(#60a5fa calc(var(--score, 0) * 1%), rgba(255,255,255,0.06) 0);
        box-shadow: 0 0 30px rgba(96, 165, 250, 0.15), inset 0 0 20px rgba(96, 165, 250, 0.05);
      }
      .score-ring > span {
        @apply w-[84px] h-[84px] rounded-full bg-bg grid place-items-center text-2xl font-extrabold tracking-tight;
      }
      .dot-grid {
        background-image:
          linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
        background-size: 24px 24px;
      }
      .metric-card-glow::before {
        content: '';
        @apply absolute inset-0 rounded-xl pointer-events-none;
        padding: 1px;
        background: linear-gradient(180deg, rgba(255,255,255,0.06), transparent 60%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
      }
      .metric-card-bar::after {
        content: '';
        @apply absolute top-0 left-0 right-0 h-[2px];
        background: rgba(100, 116, 139, 0.3);
      }
      .metric-card-bar.severity-info::after { @apply bg-accent-info; }
      .metric-card-bar.severity-warning::after { @apply bg-accent-warning; }
      .metric-card-bar.severity-error::after { @apply bg-accent-error; }
      .hero-title {
        @apply mt-4 mb-3 font-extrabold leading-tight tracking-tight;
        font-size: clamp(1.8rem, 3vw, 2.6rem);
        background: linear-gradient(180deg, #fff 30%, #a0a8c4 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .metric-value-gradient {
        @apply font-extrabold tracking-tight;
        font-size: clamp(1.4rem, 3vw, 2rem);
        background: linear-gradient(135deg, #fff 20%, #a0a8c4 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .diagram-node {
        @apply relative py-3.5 px-[18px] min-w-[120px] rounded-xl text-center font-bold transition-all duration-200;
        background: linear-gradient(180deg, rgba(40, 45, 90, 0.9), rgba(20, 24, 50, 0.95));
        border: 1px solid rgba(96, 130, 230, 0.25);
        box-shadow: 0 0 15px rgba(96, 130, 230, 0.08);
      }
      .diagram-node:hover {
        border-color: rgba(96, 165, 250, 0.5);
        box-shadow: 0 0 25px rgba(96, 165, 250, 0.15);
        @apply -translate-y-px;
      }
      .finding-item {
        @apply px-[18px] py-4 rounded-xl border border-glass-border bg-[rgba(12,14,26,0.5)] border-l-[3px] border-l-accent-neutral transition-all duration-200;
      }
      .finding-item:hover { @apply bg-bg-panel -translate-y-px; box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
      .finding-item.severity-info { @apply border-l-accent-info; background: linear-gradient(90deg, rgba(96, 165, 250, 0.04), transparent 30%); }
      .finding-item.severity-warning { @apply border-l-accent-warning; background: linear-gradient(90deg, rgba(240, 160, 48, 0.04), transparent 30%); }
      .finding-item.severity-error { @apply border-l-accent-error; background: linear-gradient(90deg, rgba(240, 96, 96, 0.04), transparent 30%); }
      .sev-chip {
        @apply py-2 px-4 rounded-pill border border-border bg-[rgba(22,25,48,0.5)] text-text-muted cursor-pointer text-sm font-medium transition-all duration-200;
      }
      .sev-chip:hover { @apply border-text-muted/30 text-text; }
      .sev-chip.active { @apply border-accent-info/40 text-text bg-accent-info/[0.08]; }
      .sev-chip[data-severity="error"].active { border-color: rgba(240, 96, 96, 0.5); @apply bg-accent-error/[0.08]; box-shadow: 0 0 20px rgba(240, 96, 96, 0.2); }
      .sev-chip[data-severity="warning"].active { border-color: rgba(240, 160, 48, 0.5); @apply bg-accent-warning/[0.08]; box-shadow: 0 0 20px rgba(240, 160, 48, 0.2); }
      .sev-chip[data-severity="info"].active { border-color: rgba(96, 165, 250, 0.5); @apply bg-accent-info/[0.08]; box-shadow: 0 0 20px rgba(96, 165, 250, 0.2); }
      .panel-tool-button {
        @apply inline-flex items-center gap-2 py-2 px-4 rounded-pill border border-border bg-[rgba(22,25,48,0.5)] text-text-muted cursor-pointer text-sm font-medium transition-all duration-200;
      }
      .panel-tool-button:hover { @apply border-text-muted/30 text-text; }
      .panel-tool-button.active { @apply border-accent-info/40 text-text bg-accent-info/[0.08]; box-shadow: 0 0 20px rgba(96, 165, 250, 0.2); }
      /* JS-generated diagram classes */
      .diagram-flow { @apply flex flex-wrap gap-3.5 items-center; }
      .diagram-arrow { @apply text-text-muted text-xl; }
      .cyto-summary { @apply grid gap-3.5; }
      .cyto-stat-grid { @apply grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3; }
      .cyto-stat { @apply p-3.5 rounded-xl bg-bg-panel/60 border border-glass-border; }
      .cyto-stat strong { @apply block text-xl mb-1.5; }
      .force-graph-legend { @apply flex flex-wrap gap-3.5 pt-2.5 text-[0.82rem] text-text-muted; }
      .force-graph-legend span { @apply whitespace-nowrap; }
      .force-graph-chip {
        @apply inline-flex items-center gap-2 py-1.5 px-3 rounded-pill border border-border bg-[rgba(22,25,48,0.5)] text-text-muted cursor-pointer text-[0.82rem] font-medium transition-all duration-200;
      }
      .force-graph-chip:hover { @apply border-text-muted/30 text-text; }
      .force-graph-chip.active { @apply text-text; box-shadow: 0 0 18px rgba(255,255,255,0.08); }
      .force-graph-chip-dot { @apply inline-block w-2.5 h-2.5 rounded-full; }
      .force-graph-chip[data-node-type="always-active"].active { border-color: rgba(248, 113, 113, 0.45); background: rgba(248, 113, 113, 0.08); }
      .force-graph-chip[data-node-type="normal"].active { border-color: rgba(96, 165, 250, 0.45); background: rgba(96, 165, 250, 0.08); }
      .force-graph-chip[data-node-type="selective"].active { border-color: rgba(52, 211, 153, 0.45); background: rgba(52, 211, 153, 0.08); }
      .force-graph-chip[data-node-type="regex"].active { border-color: rgba(167, 139, 250, 0.45); background: rgba(167, 139, 250, 0.08); }
      .force-graph-chip[data-node-type="lua-function"].active { border-color: rgba(45, 212, 191, 0.45); background: rgba(45, 212, 191, 0.08); }
      .force-graph-chip[data-node-type="lua-function-core"].active { border-color: rgba(236, 72, 153, 0.45); background: rgba(236, 72, 153, 0.08); }
      .force-graph-chip[data-node-type="trigger-keyword"].active { border-color: rgba(244, 63, 94, 0.45); background: rgba(244, 63, 94, 0.08); }
      .force-graph-chip[data-node-type="variable"].active { border-color: rgba(251, 191, 36, 0.45); background: rgba(251, 191, 36, 0.08); }
      .force-graph-chip[data-edge-type="keyword"].active { border-color: rgba(96, 165, 250, 0.45); background: rgba(96, 165, 250, 0.08); }
      .force-graph-chip[data-edge-type="variable"].active { border-color: rgba(251, 191, 36, 0.45); background: rgba(251, 191, 36, 0.08); }
      .force-graph-chip[data-edge-type="lore-direct"].active { border-color: rgba(45, 212, 191, 0.45); background: rgba(45, 212, 191, 0.08); }
      .force-graph-chip[data-edge-type="text-mention"].active { border-color: rgba(244, 114, 182, 0.45); background: rgba(244, 114, 182, 0.08); }
      .force-graph-chip[data-edge-type="lua-call"].active { border-color: rgba(129, 140, 248, 0.45); background: rgba(129, 140, 248, 0.08); }
      .diagram-fallback { @apply text-text-muted text-sm; }
      .chart-fallback { @apply text-text-muted text-sm; }
      [data-force-graph-fullscreen-host="true"]:fullscreen {
        width: 100%;
        max-width: none;
        min-height: 100vh;
        border-radius: 0;
        padding: 24px;
        overflow: auto;
        background: #090b14;
      }
      [data-force-graph-fullscreen-host="true"]:fullscreen [data-force-graph-surface="true"] {
        min-height: calc(100vh - 136px) !important;
      }
      .node-details-modal[open] {
        background: #0f111a;
        border: 1px solid #1e293b;
        border-radius: 8px;
        color: #eaedf6;
        padding: 16px;
        box-sizing: border-box;
        width: min(80vw, calc(100vw - 32px));
        max-width: 80vw;
        height: min(90vh, calc(100vh - 32px));
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      }
      .node-details-modal::backdrop { background: rgba(0,0,0,0.6); backdrop-filter: blur(2px); }
      .node-details-modal h3 { font-size: 16px; font-weight: 600; margin: 0 0 12px 0; border-bottom: 1px solid #1e293b; padding-bottom: 8px; color: #60a5fa; }
      .node-details-list { list-style: none; padding: 0; margin: 0; font-size: 13px; line-height: 1.5; flex: 1 1 auto; overflow: auto; }
      .node-details-list li { margin-bottom: 6px; word-break: break-word; }
      .node-details-list li strong { color: #a0a8c4; display: inline-block; min-width: 110px; vertical-align: top; }
      .node-details-pre {
        margin: 6px 0 0;
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid #1e293b;
        background: rgba(7, 11, 23, 0.95);
        color: #dbe7ff;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-x: auto;
        font-size: 12px;
        line-height: 1.55;
      }
      .node-details-close {
        margin-top: 16px; padding: 6px 12px; background: #1e293b; color: #eaedf6;
        border: none; border-radius: 4px; cursor: pointer; float: right;
      }
      .node-details-close:hover { background: #334155; }
    }
    @layer components {
      .tab-button.active { @apply text-text border-b-accent-info; }
    }
    @layer utilities {
      .section-card { @apply hidden opacity-0 transition-opacity duration-300; }
      .section-card.active { @apply block opacity-100; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"><\/script>
</head>
<body>
  <div class="max-w-[1480px] mx-auto px-4 py-5 pb-9 lg:px-10 lg:py-9 lg:pb-14 animate-fade-in font-sans">
    <section class="grid grid-cols-1 lg:grid-cols-[1.6fr_minmax(320px,0.9fr)] gap-5 mb-7">
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
      ${sections.map((section, index) => `<button type="button" class="tab-button appearance-none border-none border-b-2 border-transparent bg-transparent text-text-muted px-5 py-3 cursor-pointer font-medium text-sm transition-all duration-200 relative hover:text-text${index === 0 ? ' active' : ''}" data-tab="${section.id}">${escapeHtml(t(locale, section.labelKey))}</button>`).join('')}
    </nav>

    ${sectionHtml}

    <footer class="mt-8 pt-5 border-t border-border text-text-muted text-sm text-center">${escapeHtml(t(locale, 'shell.footer', capitalize(doc.artifactType)))}</footer>
  </div>

  <dialog id="node-details-dialog" class="node-details-modal">
    <h3 id="node-details-title" tabindex="-1">Node Details</h3>
    <ul id="node-details-list" class="node-details-list"></ul>
    <button id="node-details-close" class="node-details-close" type="button" data-node-details-close="true">Close</button>
  </dialog>

  <script src="./${escapeHtml(dataAsset.fileName)}"><\/script>
  <script src="./report.js"><\/script>
</body>
</html>`;

  return { html, clientJs: getReportClientJs(), assets: [dataAsset] };
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
  const rows = panel.rows.length
    ? panel.rows
        .map((row) => {
          const sourceLabels = row.sourceIds?.length ? formatSourceLabels(doc, row.sourceIds) : '';
          const searchText = row.searchText || [...row.cells, sourceLabels].join(' ');
          return `<tr data-search-text="${escapeHtml(searchText)}" data-severity-item="true" data-severity="${row.severity ?? 'neutral'}">${row.cells.map((cell) => `<td>${cell}</td>`).join('')}${hasSourceColumn ? `<td class="text-text-muted">${escapeHtml(sourceLabels || '—')}</td>` : ''}</tr>`;
        })
        .join('')
    : `<tr><td colspan="${panel.columns.length + (hasSourceColumn ? 1 : 0)}" class="text-text-muted">${escapeHtml(t(locale, 'shell.empty.rows'))}</td></tr>`;
  const columns = hasSourceColumn
    ? [...panel.columns, t(locale, 'shell.source.header')]
    : panel.columns;

  return `<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="table" data-panel-id="${escapeHtml(panel.id)}"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-['◆'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">${escapeHtml(panel.title)}</h3>${panel.description ? `<p class="m-0 text-text-muted">${escapeHtml(panel.description)}</p>` : ''}</div></div>${panel.rows.length ? renderSeverityFilterBar(locale) : ''}${panel.filterPlaceholder ? `<div class="flex flex-col lg:flex-row justify-between gap-2.5 items-stretch lg:items-center mb-3.5"><input class="w-full lg:w-[min(360px,100%)] py-2.5 px-3.5 rounded-xl border border-border bg-[rgba(12,14,26,0.8)] text-text transition-all duration-200 focus:outline-none focus:border-accent-info/50 focus:ring-[3px] focus:ring-accent-info/[0.12]" type="text" placeholder="${escapeHtml(panel.filterPlaceholder)}" data-table-filter-target="${escapeHtml(panel.id)}"></div>` : ''}<div class="overflow-auto rounded-xl border border-glass-border"><table class="w-full border-collapse min-w-[640px]"><thead><tr>${columns.map((column) => `<th class="sticky top-0 px-4 py-3 border-b border-white/[0.04] text-left align-top bg-gradient-to-b from-[rgba(22,28,55,0.98)] to-[rgba(18,22,44,0.98)] text-text-muted text-xs font-semibold tracking-wider uppercase">${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody class="[&_tr:nth-child(even)_td]:bg-white/[0.015] [&_tr:hover_td]:bg-accent-info/[0.04]">${rows}</tbody></table></div></article>`;
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

function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/<\/script/gi, '<\\/script');
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
    }
  }

  return panels;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildHeroDescription(doc: AnalysisVisualizationDoc): string {
  return `${capitalize(doc.artifactType)} artifact summary with progressive drill-down from headline metrics to evidence-linked details.`;
}

function getSectionDescription(section: VisualizationSection, locale: Locale): string {
  const key = `shell.section.${section}.desc`;
  return t(locale, key);
}

function _renderSourceDebug(doc: AnalysisVisualizationDoc, sourceId: string): string {
  const source = resolveSource(doc, sourceId);
  return source ? `${source.label} (${source.elementType})` : sourceId;
}

void _renderSourceDebug;
