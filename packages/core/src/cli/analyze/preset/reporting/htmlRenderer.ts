import fs from 'node:fs';
import path from 'node:path';
import { buildFindingPanel, buildMetricGrid, buildTablePanel } from '../../shared/view-model';
import { renderHtmlReportShell } from '../../shared/html-report-shell';
import { createSourceId, dedupeSources } from '../../shared/source-links';
import type { AnalysisVisualizationDoc, VisualizationSource } from '../../shared/visualization-types';
import type { PresetReportData } from '../types';

/** preset analysis HTML report를 생성한다. */
export function renderPresetHtml(data: PresetReportData, outputDir: string): void {
  const sources = buildSources(data);

  const doc: AnalysisVisualizationDoc = {
    artifactType: 'preset',
    artifactName: data.presetName,
    summary: {
      totals: [
        { label: 'Prompts', value: data.collected.prompts.length },
        { label: 'Templates', value: data.collected.promptTemplates.length },
        { label: 'Regex', value: data.collected.regexCBS.length },
        { label: 'Variables', value: data.unifiedGraph.size },
      ],
      highlights: [
        {
          title: 'Template chain',
          message: `${data.collected.promptTemplates.length} prompt template items were collected`,
          severity: data.collected.promptTemplates.length > 0 ? 'info' : 'warning',
        },
      ],
      nextActions: buildNextActions(data),
    },
    panels: [
      buildMetricGrid('preset-overview', 'Overview', [
        { label: 'Prompt files', value: data.collected.prompts.length },
        { label: 'Template items', value: data.collected.promptTemplates.length },
        { label: 'Regex scripts', value: data.collected.regexCBS.length },
        { label: 'Model config', value: data.collected.model ? 'Present' : 'Missing' },
      ]),
      {
        kind: 'diagram',
        id: 'preset-flow',
        title: 'Prompt template chain',
        section: 'flow',
        library: 'text',
        payload: buildTemplateFlow(data),
      },
      buildFindingPanel('preset-risks', 'Risks', buildFindings(data)),
      buildTablePanel(
        'preset-sources',
        'Prompt and variable sources',
        ['Source', 'Reads', 'Writes'],
        [
          ...data.collected.prompts.map((prompt) => ({
            cells: [escapeHtml(prompt.name), escapeHtml([...prompt.reads].join(', ') || '—'), escapeHtml([...prompt.writes].join(', ') || '—')],
            sourceIds: [createSourceId(`[preset]/prompt/${prompt.name}`)],
          })),
          ...data.collected.promptTemplates.map((template) => ({
            cells: [escapeHtml(template.name), escapeHtml([...template.reads].join(', ') || '—'), escapeHtml([...template.writes].join(', ') || '—')],
            sourceIds: [createSourceId(`[preset]/template/${template.name}`)],
          })),
        ],
        'sources',
      ),
    ],
    sources,
  };

  const analysisDir = path.join(outputDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'preset-analysis.html'), renderHtmlReportShell(doc), 'utf-8');
}

function buildSources(data: PresetReportData): VisualizationSource[] {
  const sources: VisualizationSource[] = [];
  for (const prompt of data.collected.prompts) {
    sources.push({
      id: createSourceId(`[preset]/prompt/${prompt.name}`),
      label: `[preset]/prompt/${prompt.name}`,
      path: `prompts/${prompt.name}.txt`,
      elementType: 'prompt',
    });
  }
  for (const template of data.collected.promptTemplates) {
    sources.push({
      id: createSourceId(`[preset]/template/${template.name}`),
      label: `[preset]/template/${template.name}`,
      path: `prompt_template/${template.name}.json`,
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

function buildTemplateFlow(data: PresetReportData): string {
  const lines = ['PROMPTS'];
  for (const prompt of data.collected.prompts) {
    lines.push(`  -> ${prompt.name}`);
  }
  lines.push('', 'PROMPT TEMPLATE');
  for (const template of data.collected.promptTemplates) {
    lines.push(`  -> ${template.name}`);
  }
  lines.push('', 'UNIFIED VARS');
  lines.push(`  -> ${data.unifiedGraph.size} total variables`);
  return lines.join('\n');
}

function buildNextActions(data: PresetReportData): string[] {
  const actions: string[] = [];
  if (data.collected.promptTemplates.length === 0) {
    actions.push('No prompt template chain was found; verify whether prompt_template extraction is expected.');
  }
  if (!data.collected.model) {
    actions.push('Model configuration is missing; confirm provider-specific model extraction.');
  }
  if (data.collected.regexCBS.length > 0) {
    actions.push('Review regex-driven variable writes alongside prompt reads for ordering assumptions.');
  }
  if (actions.length === 0) {
    actions.push('No immediate follow-up detected.');
  }
  return actions;
}

function buildFindings(data: PresetReportData): Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> {
  const findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string; sourceIds: string[] }> = [];
  if (data.collected.prompts.length === 0) {
    findings.push({ severity: 'warning', message: 'No prompt files were collected.', sourceIds: [] });
  }
  if (data.collected.promptTemplates.length === 0) {
    findings.push({ severity: 'warning', message: 'No prompt template items were collected.', sourceIds: [] });
  }
  if (data.unifiedGraph.size > 0) {
    findings.push({ severity: 'info', message: `${data.unifiedGraph.size} CBS variables were mapped across prompt sources.`, sourceIds: [] });
  }
  return findings;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
