import { describe, expect, it } from 'vitest';
import { renderHtmlReportShell } from '../src/cli/analyze/shared/html-report-shell';
import type { AnalysisVisualizationDoc } from '../src/cli/analyze/shared/visualization-types';

describe('analysis visualization contract', () => {
  const minimalDoc: AnalysisVisualizationDoc = {
    artifactType: 'charx',
    artifactName: 'Alice',
    summary: {
      score: 84,
      totals: [{ label: 'Variables', value: 12, severity: 'info' }],
      highlights: [{ title: 'Bridged vars', message: '4 variables bridge multiple sources.', severity: 'warning' }],
      nextActions: ['Review bridged variables for intentional coupling.'],
    },
    panels: [],
    sources: [],
  };

  it('renders valid html document', () => {
    const { html } = renderHtmlReportShell(minimalDoc, 'en');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('includes visualization tab navigation without a global severity filter bar', () => {
    const { html } = renderHtmlReportShell(minimalDoc, 'en');

    expect(html).not.toContain('aria-label="Severity filters"');
    expect(html).toContain('aria-label="Visualization sections"');
    expect(html).toContain('<button type="button" class="tab-button appearance-none border-none border-b-2 border-transparent bg-transparent text-text-muted px-5 py-3 cursor-pointer font-medium text-sm transition-all duration-200 relative hover:text-text active" data-tab="overview">Overview</button>');
    expect(html).toContain('<section class="section-card glass p-[22px] mb-5 active" data-tab="overview">');
    expect(html).toContain('data-severity="warning"');
  });

  it('renders metric grids, findings, tables, chart mounts, and diagram mounts with panel metadata', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'metric-grid',
          id: 'summary',
          title: 'Summary',
          items: [{ label: 'Total', value: 42, severity: 'info' }],
        },
        {
          kind: 'findings',
          id: 'risks',
          title: 'Risks',
          findings: [{ severity: 'error', message: 'Unused prompt branch detected.', sourceIds: ['src-0'] }],
        },
        {
          kind: 'table',
          id: 'variables',
          title: 'Variables',
          columns: ['Name', 'Phase'],
          rows: [{ cells: ['mode', 'story'], sourceIds: ['src-0'] }],
        },
        {
          kind: 'chart',
          id: 'element-distribution',
          title: 'Element Distribution',
          library: 'chartjs',
          config: {
            type: 'doughnut',
            data: { labels: ['Lorebook', 'Regex'], datasets: [{ data: [3, 1] }] },
          },
        },
        {
          kind: 'diagram',
          id: 'variable-flow',
          title: 'Variable Flow',
          library: 'mermaid',
          payload: 'flowchart TD\nA-->B',
        },
        {
          kind: 'diagram',
          id: 'compose-graph',
          title: 'Compose Graph',
          library: 'cytoscape',
          payload: {
            elements: [
              { data: { id: 'module-a', label: 'module-a' } },
              { data: { id: 'module-b', label: 'module-b' } },
              { data: { id: 'edge-1', source: 'module-a', target: 'module-b' } },
            ],
          },
        },
      ],
      sources: [{ id: 'src-0', label: 'regex/main', path: 'regex/main.json', elementType: 'regex' }],
    };

    const { html } = renderHtmlReportShell(doc, 'en');

    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="metric-grid" data-panel-id="summary">');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="findings" data-panel-id="risks">');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="table" data-panel-id="variables">');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="chart" data-panel-id="element-distribution" data-library="chartjs">');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="diagram" data-panel-id="variable-flow" data-library="mermaid">');
    expect(html).toContain('class="chart-mount w-full" style="height:100%"');
    expect(html).toContain('class="diagram-mount"');
    expect(html).toContain('Total');
    expect(html).toContain('mode');
    expect(html).toContain('regex/main');
  });

  it('renders panel-local severity filters for findings and tables and scopes the client filter logic per panel', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'metric-grid',
          id: 'summary',
          title: 'Summary',
          items: [{ label: 'Total', value: 42, severity: 'info' }],
        },
        {
          kind: 'findings',
          id: 'risks',
          title: 'Risks',
          findings: [{ severity: 'error', message: 'Unused prompt branch detected.', sourceIds: ['src-0'] }],
        },
        {
          kind: 'table',
          id: 'variables',
          title: 'Variables',
          filterPlaceholder: 'Filter variables',
          columns: ['Name', 'Phase'],
          rows: [{ cells: ['mode', 'story'], severity: 'warning', sourceIds: ['src-0'] }],
        },
      ],
      sources: [{ id: 'src-0', label: 'regex/main', path: 'regex/main.json', elementType: 'regex' }],
    };

    const { html, clientJs } = renderHtmlReportShell(doc, 'en');

    expect(html).not.toContain('<div class="flex flex-wrap gap-2.5 mb-5" aria-label="Severity filters">');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="metric-grid" data-panel-id="summary"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-[\'◆\'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">Summary</h3></div></div><div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="findings" data-panel-id="risks"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-[\'◆\'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">Risks</h3></div></div><div class="flex flex-wrap gap-2.5 mb-4" aria-label="Severity filters" data-severity-filter-bar="true"><button type="button" class="sev-chip active" data-severity="all">All</button><button type="button" class="sev-chip" data-severity="error">Error</button><button type="button" class="sev-chip" data-severity="warning">Warning</button><button type="button" class="sev-chip" data-severity="info">Info</button></div>');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="table" data-panel-id="variables"><div class="flex flex-wrap items-baseline justify-between gap-2.5 mb-4 relative"><div><h3 class="mb-0 tracking-tight before:content-[\'◆\'] before:mr-2 before:text-[0.7em] before:opacity-40 before:align-middle">Variables</h3></div></div><div class="flex flex-wrap gap-2.5 mb-4" aria-label="Severity filters" data-severity-filter-bar="true"><button type="button" class="sev-chip active" data-severity="all">All</button><button type="button" class="sev-chip" data-severity="error">Error</button><button type="button" class="sev-chip" data-severity="warning">Warning</button><button type="button" class="sev-chip" data-severity="info">Info</button></div>');
    expect(clientJs).toContain("const filterBars = Array.from(docRoot.querySelectorAll('[data-severity-filter-bar=\"true\"]'));");
    expect(clientJs).toContain("const panel = bar.closest('[data-panel-id]');");
    expect(clientJs).toContain("const items = Array.from(panel.querySelectorAll('[data-severity-item=\"true\"]'));");
    expect(clientJs).not.toContain("const chips = Array.from(docRoot.querySelectorAll('.sev-chip'));\n");
    expect(clientJs).not.toContain("const items = Array.from(docRoot.querySelectorAll('[data-severity-item=\"true\"]'));\n");
  });

  it('embeds visualization payloads as JSON script blocks for offline initialization', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'chart',
          id: 'chart-1',
          title: 'Chart',
          library: 'chartjs',
          config: {
            type: 'bar',
            data: { labels: ['A'], datasets: [{ data: [1] }] },
          },
        },
        {
          kind: 'diagram',
          id: 'diagram-1',
          title: 'Flow',
          library: 'mermaid',
          payload: 'flowchart TD\nA-->B',
        },
      ],
      sources: [],
    };

    const { html } = renderHtmlReportShell(doc, 'en');

    expect(html).toContain('<script id="report-i18n" type="application/json">');
    expect(html).toContain('<script src="./report.js"><\/script>');
    expect(html).toContain('<script type="application/json" data-chart-config>');
    expect(html).toContain('<script type="application/json" data-diagram-payload>');
    expect(html).toContain('data-library="mermaid"');
    expect(html).toContain('data-library="chartjs"');
  });

  it('includes D3 and Tailwind CDN scripts unconditionally', () => {
    const { html } = renderHtmlReportShell(minimalDoc, 'en');

    expect(html).toContain('<script src="https://cdn.tailwindcss.com"><\/script>');
    expect(html).toContain('<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"><\/script>');
    expect(html).toContain('tailwind.config = {');
  });

  it('renders chart panels with div mount instead of canvas', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'chart',
          id: 'test-chart',
          title: 'Test Chart',
          library: 'chartjs',
          config: {
            type: 'bar',
            data: { labels: ['A'], datasets: [{ data: [1] }] },
          },
        },
      ],
      sources: [],
    };

    const { html } = renderHtmlReportShell(doc, 'en');

    expect(html).toContain('class="chart-mount w-full" style="height:100%"');
    expect(html).not.toContain('<canvas');
  });

  it('renders force-graph diagram panels with D3 library attribute', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'diagram',
          id: 'test-force-graph',
          title: 'Test Force Graph',
          library: 'force-graph',
          payload: {
            nodes: [
              { id: 'a', label: 'Node A', type: 'normal', color: '#60a5fa' },
              { id: 'b', label: 'Node B', type: 'regex', color: '#a78bfa' },
            ],
            edges: [{ source: 'a', target: 'b', type: 'variable', label: 'x' }],
          },
        },
      ],
      sources: [],
    };

    const { html } = renderHtmlReportShell(doc, 'en');

    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="diagram" data-panel-id="test-force-graph" data-library="force-graph">');
    expect(html).toContain('<script type="application/json" data-diagram-payload>');
    expect(html).toContain('data-library="force-graph"');
  });

  it('defers hidden force-graph rendering until the section becomes active', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      sections: [
        { id: 'overview', labelKey: 'shell.tab.overview', descriptionKey: 'shell.section.overview.desc' },
        { id: 'graph', labelKey: 'shell.tab.graph', descriptionKey: 'shell.section.graph.desc' },
      ],
      panels: [
        {
          kind: 'diagram',
          id: 'hidden-force-graph',
          title: 'Hidden Force Graph',
          library: 'force-graph',
          section: 'graph',
          payload: {
            nodes: [
              { id: 'a', label: 'Node A', type: 'normal', color: '#60a5fa' },
              { id: 'b', label: 'Node B', type: 'regex', color: '#a78bfa' },
            ],
            edges: [{ source: 'a', target: 'b', type: 'variable', label: 'x' }],
          },
        },
      ],
      sources: [],
    };

    const { clientJs } = renderHtmlReportShell(doc, 'en');

    expect(clientJs).toContain('function renderVisibleForceGraphs(scope) {');
    expect(clientJs).toContain("root.querySelectorAll('[data-panel-kind=\"diagram\"][data-library=\"force-graph\"]')");
    expect(clientJs).toContain("window.requestAnimationFrame(function() {");
    expect(clientJs).toContain('renderVisibleForceGraphs(targetSection);');
    expect(clientJs).toContain("window.addEventListener('resize', () => {");
  });

  it('keeps a lorebook > regex > variable node size hierarchy in the force-graph client', () => {
    const { clientJs } = renderHtmlReportShell(minimalDoc, 'en');

    expect(clientJs).toContain('function getNodeCircleRadius(node) {');
    expect(clientJs).toContain("if (node.type === 'variable') return 10;");
    expect(clientJs).toContain("if (node.type === 'regex') return 14;");
    expect(clientJs).toContain('return 18;');
  });

  it('does not auto-fit over an explicit user zoom after simulation settles', () => {
    const { clientJs } = renderHtmlReportShell(minimalDoc, 'en');

    expect(clientJs).toContain('var hasUserZoomed = false;');
    expect(clientJs).toContain('var isApplyingAutoFit = false;');
    expect(clientJs).toContain('if (!isApplyingAutoFit) hasUserZoomed = true;');
    expect(clientJs).toContain('if (!hasUserZoomed) fitGraph(true);');
  });
});
