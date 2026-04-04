import fs from 'node:fs';
import path from 'node:path';
import { buildFindingPanel, buildMetricGrid, buildTablePanel } from '../../shared/view-model';
import { renderHtmlReportShell } from '../../shared/html-report-shell';
import { createSourceId, dedupeSources } from '../../shared/source-links';
import type { AnalysisVisualizationDoc, VisualizationSource } from '../../shared/visualization-types';
import type { ModuleReportData } from '../types';

/** module analysis HTML report를 생성한다. */
export function renderModuleHtml(data: ModuleReportData, outputDir: string): void {
  const sources = buildSources(data);

  const doc: AnalysisVisualizationDoc = {
    artifactType: 'module',
    artifactName: data.moduleName,
    summary: {
      totals: [
        { label: 'Lorebook', value: data.collected.lorebookCBS.length },
        { label: 'Regex', value: data.collected.regexCBS.length },
        { label: 'Lua', value: data.collected.luaCBS.length },
        { label: 'Variables', value: data.unifiedGraph.size },
      ],
      highlights: [
        {
          title: 'Shared variables',
          message: `${data.lorebookRegexCorrelation.summary.totalShared} lorebook/regex bridges detected`,
          severity: data.lorebookRegexCorrelation.summary.totalShared > 0 ? 'info' : 'warning',
        },
      ],
      nextActions: buildNextActions(data),
    },
    panels: [
      buildMetricGrid('module-overview', 'Overview', [
        { label: 'Lorebook entries', value: data.collected.lorebookCBS.length },
        { label: 'Regex scripts', value: data.collected.regexCBS.length },
        { label: 'Lua scripts', value: data.collected.luaCBS.length },
        { label: 'Background HTML', value: data.collected.htmlCBS ? 'Yes' : 'No' },
      ]),
      {
        kind: 'diagram',
        id: 'module-flow',
        title: 'Variable flow summary',
        section: 'flow',
        library: 'text',
        payload: buildFlowSummary(data),
      },
      buildFindingPanel('module-risks', 'Risks', buildFindings(data)),
      buildTablePanel(
        'module-sources',
        'Source-linked variables',
        ['Variable', 'Direction', 'Readers', 'Writers'],
        Array.from(data.unifiedGraph.entries()).map(([varName, entry]) => ({
          cells: [
            `<code>${escapeHtml(varName)}</code>`,
            escapeHtml(entry.direction),
            escapeHtml(entry.crossElementReaders.join(', ') || '—'),
            escapeHtml(entry.crossElementWriters.join(', ') || '—'),
          ],
          sourceIds: sources.filter((source) => source.label.includes(varName)).map((source) => source.id),
        })),
        'sources',
      ),
    ],
    sources,
  };

  const analysisDir = path.join(outputDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(
    path.join(analysisDir, 'module-analysis.html'),
    renderHtmlReportShell(doc),
    'utf-8',
  );
}

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

function buildNextActions(data: ModuleReportData): string[] {
  const actions: string[] = [];
  if (data.lorebookRegexCorrelation.summary.totalShared > 0) {
    actions.push('Review shared lorebook/regex variables for intentional cross-element coupling.');
  }
  if (data.collected.luaCBS.length === 0) {
    actions.push('No Lua state analysis was found; check whether triggerscript extraction is expected.');
  }
  if (data.collected.htmlCBS) {
    actions.push('Background HTML references CBS variables; verify runtime ordering against lorebook and regex usage.');
  }
  if (actions.length === 0) {
    actions.push('No immediate follow-up detected.');
  }
  return actions;
}

function buildFindings(data: ModuleReportData): Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> {
  const findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> = [];

  if (data.collected.lorebookCBS.length === 0) {
    findings.push({ severity: 'warning', message: 'No lorebook CBS activity was detected.', sourceIds: [] });
  }
  if (data.collected.regexCBS.length === 0) {
    findings.push({ severity: 'warning', message: 'No regex CBS activity was detected.', sourceIds: [] });
  }
  if (data.lorebookRegexCorrelation.summary.totalShared > 0) {
    findings.push({
      severity: 'info',
      message: `${data.lorebookRegexCorrelation.summary.totalShared} variables are shared between lorebook and regex.`,
      sourceIds: [],
    });
  }

  return findings;
}

function buildFlowSummary(data: ModuleReportData): string {
  return [
    'COLLECT',
    `  lorebook: ${data.collected.lorebookCBS.length}`,
    `  regex: ${data.collected.regexCBS.length}`,
    `  lua: ${data.collected.luaCBS.length}`,
    `  html: ${data.collected.htmlCBS ? 1 : 0}`,
    '',
    'CORRELATE',
    `  unified vars: ${data.unifiedGraph.size}`,
    `  shared lorebook/regex vars: ${data.lorebookRegexCorrelation.summary.totalShared}`,
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
