import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHtml } from '../src/cli/analyze/charx/reporting/htmlRenderer';
import type { CharxReportData } from '../src/cli/analyze/charx/types';
import { renderModuleHtml } from '../src/cli/analyze/module/reporting/htmlRenderer';
import type { ModuleReportData } from '../src/cli/analyze/module/types';
import { renderHtmlReportShell } from '../src/cli/analyze/shared/html-report-shell';
import { t } from '../src/cli/analyze/shared/i18n';
import type { AnalysisVisualizationDoc, MermaidDiagramPayload } from '../src/cli/analyze/shared/visualization-types';
import { analyzeLuaSource } from '../src/domain/analyze/lua-core';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempOutputDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function buildLuaArtifact(fileName: string, source: string) {
  return analyzeLuaSource({
    filePath: `/tmp/${fileName}.lua`,
    source,
    charxArg: null,
  });
}

function readRenderedReport(outputDir: string, reportBaseName: 'charx-analysis' | 'module-analysis') {
  const analysisDir = path.join(outputDir, 'analysis');
  return {
    html: readFileSync(path.join(analysisDir, `${reportBaseName}.html`), 'utf-8'),
    dataJs: readFileSync(path.join(analysisDir, `${reportBaseName}.data.js`), 'utf-8'),
  };
}

function buildCharxRendererFixture(luaArtifacts: CharxReportData['luaArtifacts']): CharxReportData {
  return {
    charx: {},
    characterName: 'Alice',
    unifiedGraph: new Map(),
    lorebookRegexCorrelation: {
      sharedVars: [],
      lorebookOnlyVars: [],
      regexOnlyVars: [],
      summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 },
    },
    lorebookStructure: {
      folders: [],
      entries: [],
      stats: {
        totalEntries: 0,
        totalFolders: 0,
        activationModes: { constant: 0, keyword: 0, keywordMulti: 0, referenceOnly: 0 },
        enabledCount: 0,
        withCBS: 0,
      },
      keywords: { all: [], overlaps: {} },
    },
    lorebookActivationChain: {
      entries: [],
      edges: [],
      summary: {
        totalEntries: 0,
        possibleEdges: 0,
        partialEdges: 0,
        blockedEdges: 0,
        recursiveScanningEnabled: true,
      },
    },
    defaultVariables: {},
    htmlAnalysis: { cbsData: null, assetRefs: [] },
    tokenBudget: {
      totalWorstCaseTokens: 0,
      totalAlwaysActiveTokens: 0,
      totalConditionalTokens: 0,
      warnings: [],
      breakdown: [],
    },
    variableFlow: {
      variables: [],
      summary: { totalVariables: 0, withIssues: 0, byIssueType: {} },
    },
    deadCode: {
      findings: [],
      summary: { totalFindings: 0, byType: {}, bySeverity: {} },
    },
    textMentions: [],
    collected: {
      lorebookCBS: [],
      regexCBS: [],
      variables: { variables: {}, cbsData: [] },
      html: { cbsData: null, assetRefs: [] },
      tsCBS: [],
      luaCBS: [],
      luaArtifacts,
    },
    luaArtifacts,
  };
}

function buildModuleRendererFixture(luaArtifacts: ModuleReportData['luaArtifacts']): ModuleReportData {
  return {
    moduleName: 'sample-module',
    collected: {
      lorebookCBS: [],
      regexCBS: [],
      regexScriptTotal: 0,
      luaCBS: [],
      htmlCBS: null,
      metadata: {},
      luaArtifacts,
    },
    unifiedGraph: new Map(),
    lorebookRegexCorrelation: {
      sharedVars: [],
      lorebookOnlyVars: [],
      regexOnlyVars: [],
      summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 },
    },
    lorebookStructure: null,
    lorebookActivationChain: {
      entries: [],
      edges: [],
      summary: {
        totalEntries: 0,
        possibleEdges: 0,
        partialEdges: 0,
        blockedEdges: 0,
        recursiveScanningEnabled: true,
      },
    },
    tokenBudget: {
      totalWorstCaseTokens: 0,
      totalAlwaysActiveTokens: 0,
      totalConditionalTokens: 0,
      warnings: [],
      breakdown: [],
    },
    variableFlow: {
      variables: [],
      summary: { totalVariables: 0, withIssues: 0, byIssueType: {} },
    },
    deadCode: {
      findings: [],
      summary: { totalFindings: 0, byType: {}, bySeverity: {} },
    },
    textMentions: [],
    luaArtifacts,
  };
}

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

  function renderShell(doc: AnalysisVisualizationDoc = minimalDoc, reportBaseName = 'charx-analysis') {
    return renderHtmlReportShell(doc, { locale: 'en', reportBaseName });
  }

  it('renders valid html document', () => {
    const { html } = renderShell();

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('includes visualization tab navigation without a global severity filter bar', () => {
    const { html } = renderShell();

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

    const { html, assets } = renderShell(doc);

    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="metric-grid" data-panel-id="summary">');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="findings" data-panel-id="risks">');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="table" data-panel-id="variables">');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="chart" data-panel-id="element-distribution" data-library="chartjs" data-report-payload-key="element-distribution">');
    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="diagram" data-panel-id="variable-flow" data-library="mermaid" data-report-payload-key="variable-flow">');
    expect(html).toContain('class="chart-mount w-full" style="height:100%"');
    expect(html).toContain('class="diagram-mount"');
    expect(html).toContain('Total');
    expect(html).toContain('data-report-table-body="true"');
    // 표 rows는 본문 HTML 대신 sidecar data bundle로 분리되어 client.js가 hydrate한다.
    const dataAssetContents = assets.find((asset) => asset.fileName === 'charx-analysis.data.js')?.contents ?? '';
    expect(dataAssetContents).toContain('"mode"');
    expect(dataAssetContents).toContain('regex/main');
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

    const { html, clientJs } = renderShell(doc);

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

  it('externalizes table panel rows into the sidecar data bundle and hydrates them client-side', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'table',
          id: 'activation-chain',
          title: 'Activation Chain',
          columns: ['Flow', 'Status'],
          rows: [
            { cells: ['alpha → beta', '<code>ok</code>'], severity: 'warning', sourceIds: ['src-0'] },
            { cells: ['beta → gamma', '<code>blocked</code>'], severity: 'error', sourceIds: ['src-0'] },
          ],
        },
      ],
      sources: [{ id: 'src-0', label: 'lore/main', path: 'lore/main.json', elementType: 'lorebook' }],
    };

    const { html, clientJs, assets } = renderShell(doc);

    // 표 본문에는 row가 인라인되지 않고 빈 tbody만 남는다 — client.js가 data bundle에서 hydrate한다.
    expect(html).toContain('data-report-table-body="true"');
    expect(html).not.toContain('alpha → beta');
    expect(html).not.toContain('beta → gamma');
    expect(html).not.toContain('data-search-text="alpha');
    expect(clientJs).toContain('function hydrateTables()');
    expect(clientJs).toContain("tbody[data-report-table-body=\"true\"]");

    const contents = assets.find((asset) => asset.fileName === 'charx-analysis.data.js')?.contents ?? '';
    expect(contents).toContain('"kind":"table"');
    expect(contents).toContain('"hasSourceColumn":true');
    expect(contents).toContain('alpha → beta');
    expect(contents).toContain('"severity":"warning"');
    expect(contents).toContain('lore/main');
  });

  it('keeps empty table panels inline with their placeholder row (no sidecar entry needed)', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'table',
          id: 'empty-table',
          title: 'Empty Table',
          columns: ['A', 'B'],
          rows: [],
        },
      ],
      sources: [],
    };

    const { html, assets } = renderShell(doc);

    // 빈 표는 server 측에서 placeholder row를 인라인으로 유지한다.
    expect(html).toContain('colspan="2"');
    const contents = assets.find((asset) => asset.fileName === 'charx-analysis.data.js')?.contents ?? '';
    expect(contents).not.toContain('"empty-table"');
  });

  it('references a per-report sidecar data script instead of inline visualization payload scripts', () => {
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

    const { html, assets } = renderShell(doc);

    expect(html).toContain('<script src="./charx-analysis.data.js"><\/script>');
    expect(html).toContain('<script src="./report.js"><\/script>');
    expect(html).not.toContain('<script id="report-i18n" type="application/json">');
    expect(html).not.toContain('<script type="application/json" data-chart-config>');
    expect(html).not.toContain('<script type="application/json" data-diagram-payload>');
    expect(html).toContain('data-library="mermaid"');
    expect(html).toContain('data-library="chartjs"');
    expect(html).toContain('data-report-payload-key="chart-1"');
    expect(html).toContain('data-report-payload-key="diagram-1"');
    expect(assets).toContainEqual(expect.objectContaining({ fileName: 'charx-analysis.data.js', kind: 'data-js' }));
    expect(assets[0]?.contents).toContain('window.__RISU_REPORT_DATA__ = ');
  });

  it('loads Mermaid before report.js, exposes Mermaid i18n strings, and includes only the Lua HTML label shell hooks', () => {
    const { html, assets } = renderShell();
    const dataBundle = assets.find((asset) => asset.fileName === 'charx-analysis.data.js')?.contents ?? '';
    const mermaidScript = '<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>';
    const reportScript = '<script src="./report.js"></script>';

    expect(html).toContain(mermaidScript);
    expect(html.indexOf(mermaidScript)).toBeGreaterThan(-1);
    expect(html.indexOf(reportScript)).toBeGreaterThan(html.indexOf(mermaidScript));
    expect(html).toContain('.lua-flow-node {');
    expect(html).toContain('.lua-flow-node-badge {');
    expect(html).toContain('.lua-flow-node-title {');
    expect(html).toContain('.lua-flow-node-subtitle {');
    expect(dataBundle).toContain('"lua.diagram.renderFailed":"Lua Mermaid diagram could not be rendered."');
    expect(dataBundle).toContain('"lua.diagram.empty":"No Lua interaction flow was detected for this artifact."');
    expect(dataBundle).toContain('"lua.diagram.loadingFailed":"Lua Mermaid diagram payload could not be loaded."');
  });

  it('serializes structured Mermaid diagram payloads through the sidecar bundle while keeping legacy string payload support', () => {
    const structuredPayload: MermaidDiagramPayload = {
      kind: 'mermaid',
      definition: 'flowchart TD\nStart-->Stop',
      fallbackText: 'Start to stop flow',
    };

    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'diagram',
          id: 'diagram-legacy',
          title: 'Legacy Flow',
          library: 'mermaid',
          payload: 'flowchart TD\nA-->B',
        },
        {
          kind: 'diagram',
          id: 'diagram-structured',
          title: 'Structured Flow',
          library: 'mermaid',
          payload: structuredPayload,
        },
      ],
      sources: [],
    };

    const { html, assets } = renderShell(doc);
    const contents = assets.find((asset) => asset.fileName === 'charx-analysis.data.js')?.contents ?? '';

    expect(html).toContain('data-panel-id="diagram-legacy" data-library="mermaid" data-report-payload-key="diagram-legacy"');
    expect(html).toContain('data-panel-id="diagram-structured" data-library="mermaid" data-report-payload-key="diagram-structured"');
    expect(contents).toContain('"diagram-legacy"');
    expect(contents).toContain('flowchart TD');
    expect(contents).toContain('"diagram-structured"');
    expect(contents).toContain('"kind":"mermaid"');
    expect(contents).toContain('"definition":"flowchart TD');
    expect(contents).toContain('"fallbackText":"Start to stop flow"');
  });

  it('keeps legacy Mermaid string fallback while routing structured Mermaid payloads through explicit runtime helpers', () => {
    const { clientJs } = renderShell();

    expect(clientJs).toContain('function isStructuredMermaidPayload(payload) {');
    expect(clientJs).toContain('function ensureMermaidRuntime() {');
    expect(clientJs).toContain('function renderMermaidPanel(panel, mount, payload) {');
    expect(clientJs).toContain('function renderVisibleMermaidDiagrams(scope) {');
    expect(clientJs).toContain("if (library === 'mermaid') {");
    expect(clientJs).toContain("if (typeof payload === 'string') {");
    expect(clientJs).toContain('mount.innerHTML = renderSimpleFlow(payload);');
    expect(clientJs).toContain("if (isStructuredMermaidPayload(payload)) {");
    expect(clientJs).toContain('renderMermaidPanel(panel, mount, payload);');
    expect(clientJs).toContain("i18n['lua.diagram.renderFailed'] || 'Lua Mermaid diagram could not be rendered.'");
    expect(clientJs).toContain("i18n['lua.diagram.empty'] || 'No Lua interaction flow was detected for this artifact.'");
    expect(clientJs).toContain("i18n['lua.diagram.loadingFailed'] || 'Lua Mermaid diagram payload could not be loaded.'");
  });

  it('charx renderer places Lua report panels in a dedicated lua section with HTML lane diagrams', () => {
    const mainArtifact = buildLuaArtifact('main', [
      'function onoutput()',
      "  return getChatVar('ct_mode')",
      'end',
    ].join('\n'));
    const helperArtifact = buildLuaArtifact('helper', [
      'function oninput()',
      "  setChatVar('ct_state', 'ready')",
      'end',
    ].join('\n'));
    const outputDir = createTempOutputDir('risu-contract-charx-');

    renderHtml(buildCharxRendererFixture([mainArtifact, helperArtifact]), outputDir, 'en');

    const { html } = readRenderedReport(outputDir, 'charx-analysis');
    const flowSection = html.match(/<section class="section-card glass p-\[22px\] mb-5" data-tab="flow">[\s\S]*?<\/section>/)?.[0] ?? '';
    const luaSection = html.match(/<section class="section-card glass p-\[22px\] mb-5" data-tab="lua">[\s\S]*?<\/section>/)?.[0] ?? '';
    const graphSection = html.match(/<section class="section-card glass p-\[22px\] mb-5" data-tab="graph">[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(luaSection).toContain('data-panel-id="charx-lua-flow-main"');
    expect(luaSection).toContain('data-panel-id="charx-lua-flow-helper"');
    expect(luaSection).toContain('Lua Interaction Flowchart — main');
    expect(luaSection).toContain('Lua Interaction Flowchart — helper');
    expect(luaSection).toContain('data-library="lua-flow"');
    // HTML flow tree content is inline
    expect(luaSection).toContain('lf-diagram');
    expect(luaSection).toContain('lf-handler-tree');
    expect(luaSection).toContain('onoutput');
    expect(luaSection).toContain('oninput');
    expect(flowSection).not.toContain('charx-lua-flow-main');
    expect(flowSection).not.toContain('charx-lua-flow-helper');
    expect(graphSection).not.toContain('charx-lua-flow-main');
    expect(graphSection).not.toContain('charx-lua-flow-helper');
  });

  it('module renderer places Lua report panels in a dedicated lua section with HTML lane diagrams', () => {
    const runtimeArtifact = buildLuaArtifact('runtime', [
      'function onoutput()',
      "  return getChatVar('ct_runtime')",
      'end',
    ].join('\n'));
    const bridgeArtifact = buildLuaArtifact('bridge', [
      'function onbuttonclick()',
      "  setChatVar('ct_bridge', 'ok')",
      'end',
    ].join('\n'));
    const outputDir = createTempOutputDir('risu-contract-module-');

    renderModuleHtml(buildModuleRendererFixture([runtimeArtifact, bridgeArtifact]), outputDir, 'en');

    const { html } = readRenderedReport(outputDir, 'module-analysis');
    const overviewSection = html.match(/<section class="section-card glass p-\[22px\] mb-5 active" data-tab="overview">[\s\S]*?<\/section>/)?.[0] ?? '';
    const luaSection = html.match(/<section class="section-card glass p-\[22px\] mb-5" data-tab="lua">[\s\S]*?<\/section>/)?.[0] ?? '';
    const structureSection = html.match(/<section class="section-card glass p-\[22px\] mb-5" data-tab="structure">[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(luaSection).toContain('data-panel-id="module-lua-flow-runtime"');
    expect(luaSection).toContain('data-panel-id="module-lua-flow-bridge"');
    expect(luaSection).toContain('Lua Interaction Flowchart — runtime');
    expect(luaSection).toContain('Lua Interaction Flowchart — bridge');
    expect(luaSection).toContain('data-library="lua-flow"');
    expect(luaSection).toContain('lf-diagram');
    expect(luaSection).toContain('lf-handler-tree');
    expect(luaSection).toContain('onoutput');
    expect(luaSection).toContain('onbuttonclick');
    expect(overviewSection).not.toContain('module-lua-flow-runtime');
    expect(overviewSection).not.toContain('module-lua-flow-bridge');
    expect(structureSection).not.toContain('module-lua-flow-runtime');
    expect(structureSection).not.toContain('module-lua-flow-bridge');
  });

  it('exposes planned Lua Mermaid title and diagram state i18n keys in both locales', () => {
    expect(t('en', 'shell.tab.lua')).toBe('Lua');
    expect(t('ko', 'shell.tab.lua')).toBe('Lua');
    expect(t('en', 'shell.section.lua.desc')).toContain('Lua interaction flowcharts');
    expect(t('ko', 'shell.section.lua.desc')).toContain('Lua 상호작용 플로우차트');
    expect(t('en', 'lua.panel.flowchart', 'main')).toBe('Lua Interaction Flowchart — main');
    expect(t('ko', 'lua.panel.flowchart', '메인')).toBe('Lua 상호작용 플로우차트 — 메인');
    expect(t('en', 'lua.diagram.renderFailed')).toBe('Lua Mermaid diagram could not be rendered.');
    expect(t('en', 'lua.diagram.empty')).toBe('No Lua interaction flow was detected for this artifact.');
    expect(t('en', 'lua.diagram.loadingFailed')).toBe('Lua Mermaid diagram payload could not be loaded.');
    expect(t('ko', 'lua.diagram.renderFailed')).toBe('Lua Mermaid 다이어그램을 렌더링할 수 없습니다.');
    expect(t('ko', 'lua.diagram.empty')).toBe('이 아티팩트에서 감지된 Lua 상호작용 흐름이 없습니다.');
    expect(t('ko', 'lua.diagram.loadingFailed')).toBe('Lua Mermaid 다이어그램 payload를 불러올 수 없습니다.');
  });

  it('keeps legacy inline JSON parsing as a fallback when sidecar data is absent', () => {
    const { clientJs } = renderShell();

    expect(clientJs).toContain('function getReportDataBundle() {');
    expect(clientJs).toContain('var bundle = window.__RISU_REPORT_DATA__;');
    expect(clientJs).toContain("return parseJsonScript('[data-chart-config]', panel);");
    expect(clientJs).toContain("return parseJsonScript('[data-diagram-payload]', panel);");
  });

  it('includes D3 and Tailwind CDN scripts unconditionally', () => {
    const { html } = renderShell();

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

    const { html } = renderShell(doc);

    expect(html).toContain('class="chart-mount w-full" style="height:100%"');
    expect(html).not.toContain('<canvas');
  });

  it('renders force-graph diagram panels with D3 library attribute', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'diagram',
          id: 'charx-relationship-network',
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

    const { html } = renderShell(doc);

    expect(html).toContain('<article class="glass glass-gradient relative p-[22px] mb-[18px] last:mb-0" data-panel-kind="diagram" data-panel-id="charx-relationship-network" data-library="force-graph" data-report-payload-key="charx-relationship-network" data-force-graph-mode="relationship-network" data-force-graph-fullscreen-host="true">');
    expect(html).toContain('data-force-graph-surface="true"');
    expect(html).toContain('<button type="button" class="panel-tool-button" data-force-graph-fullscreen-toggle="true">Fullscreen</button>');
    expect(html).toContain('data-library="force-graph"');
    expect(html).toContain('data-report-payload-key="charx-relationship-network"');
  });

  it('keeps non-relationship force-graph panels free of relationship-only controls', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'diagram',
          id: 'preset-chain-dep-graph',
          title: 'Preset Chain Graph',
          library: 'force-graph',
          payload: {
            nodes: [{ id: 'a', label: 'Step A', type: 'normal', color: '#60a5fa' }],
            edges: [],
          },
        },
      ],
      sources: [],
    };

    const { html } = renderShell(doc, 'preset-analysis');
    const panelMarkup =
      html.match(/<article class="glass glass-gradient relative p-\[22px\] mb-\[18px\] last:mb-0" data-panel-kind="diagram" data-panel-id="preset-chain-dep-graph"[\s\S]*?<\/article>/)?.[0] ?? '';

    expect(panelMarkup).toContain('data-panel-id="preset-chain-dep-graph" data-library="force-graph"');
    expect(panelMarkup).not.toContain('data-force-graph-mode="relationship-network"');
    expect(panelMarkup).not.toContain('data-force-graph-fullscreen-host="true"');
    expect(panelMarkup).not.toContain('data-force-graph-fullscreen-toggle="true"');
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

    const { clientJs } = renderShell(doc);

    expect(clientJs).toContain('function renderVisibleForceGraphs(scope) {');
    expect(clientJs).toContain('function renderVisibleMermaidDiagrams(scope) {');
    expect(clientJs).toContain("root.querySelectorAll('[data-panel-kind=\"diagram\"][data-library=\"force-graph\"]')");
    expect(clientJs).toContain("root.querySelectorAll('[data-panel-kind=\"diagram\"][data-library=\"mermaid\"]')");
    expect(clientJs).toContain("window.requestAnimationFrame(function() {");
    expect(clientJs).toContain('renderVisibleMermaidDiagrams(targetSection);');
    expect(clientJs).toContain('renderVisibleForceGraphs(targetSection);');
    expect(clientJs).toContain("window.addEventListener('resize', () => {");
  });

  it('keeps a lorebook > regex > variable node size hierarchy in the force-graph client', () => {
    const { clientJs } = renderShell();

    expect(clientJs).toContain('function getNodeCircleRadius(node) {');
    expect(clientJs).toContain("if (node.type === 'variable') return 7;");
    expect(clientJs).toContain("if (node.type === 'regex') return 16;");
    expect(clientJs).toContain("if (node.type === 'lua-function') return 16;");
    expect(clientJs).toContain('return 20;');
  });

  it('assigns distinct node shapes by domain in the force-graph client', () => {
    const { clientJs } = renderShell();

    expect(clientJs).toContain('function getNodeShapeType(node) {');
    expect(clientJs).toContain("if (node.type === 'regex') return 'triangle';");
    expect(clientJs).toContain("if (node.type === 'lua-function' || node.type === 'lua-function-core') return 'square';");
    expect(clientJs).toContain("if (node.type === 'variable') return 'star';");
    expect(clientJs).toContain("if (node.type === 'trigger-keyword') return 'rect';");
    expect(clientJs).toContain("return d3.symbol().type(d3.symbolStar).size(Math.PI * radius * radius * 0.55)();");
    expect(clientJs).toContain("return d3.symbol().type(symbolType).size(Math.PI * radius * radius)();");
    expect(clientJs).toContain("node.append('path')");
    expect(clientJs).toContain("node.select('path')");
  });

  it('does not auto-fit over an explicit user zoom after simulation settles', () => {
    const { clientJs } = renderShell();

    expect(clientJs).toContain('var hasUserZoomed = false;');
    expect(clientJs).toContain('var isApplyingAutoFit = false;');
    expect(clientJs).toContain('if (!isApplyingAutoFit) hasUserZoomed = true;');
    expect(clientJs).toContain('if (!hasUserZoomed) fitGraph(true);');
  });

  it('adds fullscreen wiring and relationship-network legend filtering only for flagged force-graph panels', () => {
    const { clientJs, html } = renderShell();

    expect(clientJs).toContain("var panels = Array.from(docRoot.querySelectorAll('[data-force-graph-mode=\"relationship-network\"]'));");
    expect(clientJs).toContain("var isRelationshipNetwork = !!(panel && panel.getAttribute('data-force-graph-mode') === 'relationship-network');");
    expect(clientJs).toContain("legendDiv.setAttribute('data-force-graph-legend-filter', 'true');");
    expect(clientJs).toContain("panel.setAttribute('data-force-graph-active-types', Array.from(activeNodeTypes).join(','));");
    expect(clientJs).toContain("panel.setAttribute('data-force-graph-active-edge-types', Array.from(activeEdgeTypes).join(','));");
    expect(clientJs).toContain("var chip = buildLegendChip(entry, 'data-edge-type', activeEdgeTypes.has(entry.type));");
    expect(clientJs).toContain('function syncGraphVisibility() {');
    expect(clientJs).toContain('// Legend chip toggles only affect nodes of the toggled type. We used to');
    expect(clientJs).toContain("visibleNodeIds = new Set(nodes.filter(isNodeTypeVisible).map(function(nodeData) { return nodeData.id; }));");
    expect(clientJs).toContain('return isEdgeTypeVisible(edgeData) && visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);');
    expect(clientJs).toContain("edgeLegendEntries.forEach(function(entry) {");
    expect(clientJs).toContain("legendDiv.innerHTML = '<span style=\"color:#f87171\">");
    expect(clientJs).toContain("legendDiv.insertAdjacentHTML(");
    expect(clientJs).toContain("button.textContent = isFullscreen ? exitLabel : enterLabel;");
    expect(clientJs).toContain("docRoot.addEventListener('fullscreenchange', function() {");
    expect(html).toContain('.force-graph-chip[data-edge-type="keyword"].active');
    expect(html).toContain('.force-graph-chip[data-edge-type="variable"].active');
    expect(html).toContain('.force-graph-chip[data-edge-type="lore-direct"].active');
  });

  it('includes direct lua-to-lorebook edge legend support in the force-graph client', () => {
    const { clientJs, html } = renderShell();

    expect(clientJs).toContain("if (type === 'lore-direct') return 'lore-direct';");
    expect(clientJs).toContain("if (edgeType === 'lore-direct') return 'rgba(45,212,191,0.45)';");
    expect(clientJs).toContain("if (edgeType === 'lore-direct') return 'url(#arrow-lore-direct)';");
    expect(clientJs).toContain("i18n['shell.forceGraph.edgeLoreDirect'] || 'Lua direct lore access'");
    expect(html).toContain('<script src="./charx-analysis.data.js"></script>');
  });

  it('uses grouped legend labels that make lorebook node types explicit', () => {
    const { clientJs } = renderShell();

    expect(clientJs).toContain("i18n['shell.forceGraph.alwaysActive'] || 'Lorebook · Always active'");
    expect(clientJs).toContain("i18n['shell.forceGraph.keyword'] || 'Lorebook · Keyword'");
    expect(clientJs).toContain("i18n['shell.forceGraph.keywordMulti'] || 'Lorebook · Keyword (multi-key)'");
    expect(clientJs).toContain("i18n['shell.forceGraph.referenceOnly'] || 'Lorebook · Reference-only'");
    expect(clientJs).toContain("i18n['shell.forceGraph.regex'] || 'Regex script'");
    expect(clientJs).toContain("i18n['shell.forceGraph.luaFunctionCore'] || 'Lua core function'");
    expect(clientJs).toContain("i18n['shell.forceGraph.triggerKeyword'] || 'Trigger keyword'");
  });

  it('includes a reusable node details dialog and graph detail client wiring', () => {
    const { html, clientJs } = renderShell();

    expect(html).toContain('id="node-details-dialog"');
    expect(html).toContain('id="node-details-title" tabindex="-1"');
    expect(html).toContain('id="node-details-list"');
    expect(html).toContain('id="node-details-close" class="node-details-close" type="button" data-node-details-close="true"');
    expect(html).toContain('class="node-details-modal"');
    expect(clientJs).toContain("var dialog = document.getElementById('node-details-dialog');");
    expect(clientJs).toContain("node.on('click', function(event, d) {");
    expect(clientJs).toContain('dialog.showModal();');
    expect(clientJs).toContain("var block = document.createElement('pre');");
    expect(clientJs).toContain("block.className = 'node-details-pre';");
    expect(clientJs).toContain("if (shouldRenderBlockValue(key, valueText)) {");
    expect(clientJs).toContain("key === 'Expected vars'");
    expect(clientJs).toContain('dialog.scrollTop = 0;');
    expect(clientJs).toContain('dialogList.scrollTop = 0;');
    expect(clientJs).toContain('dialogTitle.focus();');
    expect(clientJs).toContain('event.preventDefault();');
    expect(clientJs).toContain('event.stopPropagation();');
    expect(clientJs).toContain("dialog.close('close-button');");
    expect(clientJs).toContain("if (node.type === 'trigger-keyword') return 12;");
    expect(clientJs).toContain("if (node.type === 'lua-function-core') return 24;");
    expect(clientJs).toContain("i18n['shell.forceGraph.luaFunctionCore'] || 'Lua core function'");
    expect(clientJs).toContain("i18n['shell.forceGraph.triggerKeyword'] || 'Trigger keyword'");
    expect(html).toContain('.node-details-pre');
    expect(html).toContain('width: min(80vw, calc(100vw - 32px));');
    expect(html).toContain('max-width: 80vw;');
    expect(html).toContain('height: min(90vh, calc(100vh - 32px));');
    expect(html).toContain('max-height: 90vh;');
    expect(html).toContain('.node-details-modal[open]');
    expect(html).not.toContain('.node-details-modal {\n        background: #0f111a;\n        border: 1px solid #1e293b;\n        border-radius: 8px;\n        color: #eaedf6;\n        padding: 16px;\n        box-sizing: border-box;\n        width: min(80vw, calc(100vw - 32px));\n        max-width: 80vw;\n        height: min(90vh, calc(100vh - 32px));\n        max-height: 90vh;\n        display: flex;');
  });

  it('preserves relationship-network grouping metadata in the sidecar payload bundle', () => {
    const doc: AnalysisVisualizationDoc = {
      ...minimalDoc,
      panels: [
        {
          kind: 'diagram',
          id: 'charx-relationship-network',
          title: 'Grouped Force Graph',
          library: 'force-graph',
          payload: {
            nodes: [
              {
                id: 'lb:Root/EntryA',
                label: 'EntryA',
                type: 'keyword',
                color: '#60a5fa',
                groupId: 'folder:Root',
                groupKind: 'lorebook-folder',
                groupLabel: 'Root',
                layoutBand: 'lorebook',
                layoutRank: 0,
              },
            ],
            edges: [],
            groups: [{ id: 'folder:Root', kind: 'lorebook-folder', label: 'Root', order: 0 }],
            layout: { strategy: 'grouped-deterministic-v1', signatureSalt: 'relationship-network-v1' },
          },
        },
      ],
      sources: [],
    };

    const { assets } = renderShell(doc);
    const contents = assets.find((asset) => asset.fileName === 'charx-analysis.data.js')?.contents ?? '';

    expect(contents).toContain('"groupId":"folder:Root"');
    expect(contents).toContain('"groupKind":"lorebook-folder"');
    expect(contents).toContain('"strategy":"grouped-deterministic-v1"');
  });

  it('keeps force-graph instances across visibility refreshes instead of remounting every time', () => {
    const { clientJs } = renderShell();

    expect(clientJs).toContain('const forceGraphState = new Map();');
    expect(clientJs).toContain('function getForceGraphStateKey(panel) {');
    expect(clientJs).toContain('function ensureForceGraph(panel, mount, payload) {');
    expect(clientJs).toContain('function buildForceGraphSignature(payload, panel) {');
    expect(clientJs).toContain("var activeTypes = panel && panel.getAttribute ? (panel.getAttribute('data-force-graph-active-types') || '') : '';");
    expect(clientJs).toContain("var activeEdgeTypes = panel && panel.getAttribute ? (panel.getAttribute('data-force-graph-active-edge-types') || '') : '';");
    expect(clientJs).toContain('function refreshForceGraphViewport(panel, mount) {');
    expect(clientJs).not.toContain('renderVisibleForceGraphs();\n            rafId = null;\n          });\n        }\n\n        function initForceGraph(mount, data) {');
  });

  it('rebuilds relationship-network force graphs when legend visibility changes and filters physics to visible nodes', () => {
    const { clientJs } = renderShell();

    expect(clientJs).toContain("nodes = allNodes.filter(function(node) {");
    expect(clientJs).toContain("edges = allEdges.filter(function(edge) {");
    expect(clientJs).toContain("ensureForceGraph(panel, mount, payload);");
    expect(clientJs).not.toContain("hoveredNodeId = null;\n                syncGraphVisibility();");
  });

  it('uses grouped deterministic seeding for relationship-network graphs', () => {
    const { clientJs } = renderShell();

    expect(clientJs).toContain('function buildInitialNodePositions(nodes, payload, centerX, centerY, graphH) {');
    expect(clientJs).toContain("if (node.layoutBand === 'variable')");
    expect(clientJs).toContain("var PINNABLE_GROUP_KINDS = { 'lorebook-folder': true, 'lua-file': true, 'lua-component': true };");
    expect(clientJs).toContain("if (node.groupId && PINNABLE_GROUP_KINDS[node.groupKind]) {");
    expect(clientJs).not.toContain('var seedRadius = Math.max(24, Math.min(nodes.length * 8, 96));');
  });

  it('emits syntactically valid report client javascript', () => {
    const { clientJs } = renderShell();

    expect(() => new Function(clientJs)).not.toThrow();
  });
});
