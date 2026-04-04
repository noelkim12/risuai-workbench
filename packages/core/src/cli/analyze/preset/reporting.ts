import fs from 'node:fs';
import path from 'node:path';
import { MAX_VARS_IN_REPORT } from '@/domain';
import { mdRow } from '../../shared';
import type { PresetReportData } from './types';

/** preset analysis Markdown report를 생성한다. */
export function renderPresetMarkdown(data: PresetReportData, outputDir: string): void {
  const out: string[] = [];

  out.push(`# ${data.presetName} — Preset Analysis`);
  out.push('');
  out.push('> Auto-generated artifact-wide analysis of an extracted RisuAI preset.');
  out.push('');
  out.push('## Summary');
  out.push('| Metric | Value |');
  out.push('|--------|-------|');
  out.push(mdRow(['Preset Name', data.presetName]));
  out.push(mdRow(['Prompt files', String(data.collected.prompts.length)]));
  out.push(mdRow(['Prompt template items', String(data.collected.promptTemplates.length)]));
  out.push(mdRow(['Regex scripts', String(data.collected.regexCBS.length)]));
  out.push(mdRow(['Unique CBS variables', String(data.unifiedGraph.size)]));
  out.push('');

  out.push('## Prompt Sources');
  out.push('');
  if (data.collected.prompts.length === 0) {
    out.push('> ℹ️ No prompt files found.');
  } else {
    out.push('| Prompt | Reads | Writes |');
    out.push('|--------|-------|--------|');
    for (const prompt of data.collected.prompts) {
      out.push(mdRow([prompt.name, [...prompt.reads].join(', ') || '—', [...prompt.writes].join(', ') || '—']));
    }
  }
  out.push('');

  out.push('## Prompt Template Items');
  out.push('');
  if (data.collected.promptTemplates.length === 0) {
    out.push('> ℹ️ No prompt template items found.');
  } else {
    out.push('| Template | Reads | Writes |');
    out.push('|----------|-------|--------|');
    for (const template of data.collected.promptTemplates) {
      out.push(mdRow([template.name, [...template.reads].join(', ') || '—', [...template.writes].join(', ') || '—']));
    }
  }
  out.push('');

  out.push('## Unified CBS Variables');
  out.push('');
  if (data.unifiedGraph.size === 0) {
    out.push('> ℹ️ No CBS variables found.');
  } else {
    out.push('| Variable | Direction | Readers | Writers |');
    out.push('|----------|-----------|---------|---------|');
    let count = 0;
    for (const [varName, entry] of data.unifiedGraph) {
      if (count >= MAX_VARS_IN_REPORT) {
        out.push(mdRow(['...', `${data.unifiedGraph.size - count} more`, '', '']));
        break;
      }
      out.push(
        mdRow([
          `\`${varName}\``,
          entry.direction,
          entry.crossElementReaders.join(', ') || '—',
          entry.crossElementWriters.join(', ') || '—',
        ]),
      );
      count += 1;
    }
  }
  out.push('');

  out.push('## Model & Parameters');
  out.push('');
  out.push(mdRow(['Model config', data.collected.model ? JSON.stringify(data.collected.model) : '—']));
  out.push(mdRow(['Parameters', data.collected.parameters ? JSON.stringify(data.collected.parameters) : '—']));
  out.push('');

  const analysisDir = path.join(outputDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'preset-analysis.md'), out.join('\n'), 'utf-8');
}
