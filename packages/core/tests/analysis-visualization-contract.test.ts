import { describe, expect, it } from 'vitest';
import { renderHtmlReportShell } from '@/cli/analyze/shared/html-report-shell';
import type { AnalysisVisualizationDoc } from '@/cli/analyze/shared/visualization-types';

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
    const html = renderHtmlReportShell(minimalDoc, 'en');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('includes visualization tab navigation and severity filter chips', () => {
    const html = renderHtmlReportShell(minimalDoc, 'en');

    expect(html).toContain('Overview');
    expect(html).toContain('Flow');
    expect(html).toContain('Risks');
    expect(html).toContain('Sources');
    expect(html).toContain('sev-chip');
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

    const html = renderHtmlReportShell(doc, 'en');

    expect(html).toContain('data-panel-kind="metric-grid"');
    expect(html).toContain('data-panel-kind="findings"');
    expect(html).toContain('data-panel-kind="table"');
    expect(html).toContain('data-panel-kind="chart"');
    expect(html).toContain('data-panel-kind="diagram"');
    expect(html).toContain('data-panel-id="element-distribution"');
    expect(html).toContain('data-panel-id="variable-flow"');
    expect(html).toContain('Total');
    expect(html).toContain('mode');
    expect(html).toContain('regex/main');
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

    const html = renderHtmlReportShell(doc, 'en');

    expect(html).toContain('type="application/json"');
    expect(html).toContain('data-chart-config');
    expect(html).toContain('data-diagram-payload');
    expect(html).toContain('data-library="mermaid"');
    expect(html).toContain('data-library="chartjs"');
  });

  it('includes D3 and Tailwind CDN scripts unconditionally', () => {
    const html = renderHtmlReportShell(minimalDoc, 'en');

    expect(html).toContain('cdn.jsdelivr.net/npm/d3@7');
    expect(html).toContain('cdn.tailwindcss.com');
    expect(html).toContain('tailwind.config');
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

    const html = renderHtmlReportShell(doc, 'en');

    expect(html).toContain('class="chart-mount');
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

    const html = renderHtmlReportShell(doc, 'en');

    expect(html).toContain('data-panel-kind="diagram"');
    expect(html).toContain('data-panel-id="test-force-graph"');
    expect(html).toContain('data-library="force-graph"');
    expect(html).toContain('data-diagram-payload');
  });
});
