import fs from 'node:fs';
import path from 'node:path';
import { MAX_VARS_IN_REPORT } from '@/domain';
import { mdRow } from '../../shared';
import type { ModuleReportData } from './types';

/** module analysis Markdown report를 생성한다. */
export function renderModuleMarkdown(data: ModuleReportData, outputDir: string): void {
  const out: string[] = [];

  out.push(`# ${data.moduleName} — Module Analysis`);
  out.push('');
  out.push('> Auto-generated artifact-wide analysis of an extracted RisuAI module.');
  out.push('');
  out.push('## Summary');
  out.push('| Metric | Value |');
  out.push('|--------|-------|');
  out.push(mdRow(['Module Name', data.moduleName]));
  out.push(mdRow(['Lorebook Entries', String(data.collected.lorebookCBS.length)]));
  out.push(mdRow(['Regex Scripts', String(data.collected.regexCBS.length)]));
  out.push(mdRow(['Lua Scripts', String(data.collected.luaCBS.length)]));
  out.push(mdRow(['Background HTML', data.collected.htmlCBS ? 'Yes' : 'No']));
  out.push(mdRow(['Unique CBS Variables', String(data.unifiedGraph.size)]));
  out.push('');

  out.push('## Unified CBS Variables');
  out.push('');
  if (data.unifiedGraph.size === 0) {
    out.push('> ℹ️ No CBS variables found.');
  } else {
    out.push('| Variable | Direction | Writers | Readers | Default |');
    out.push('|----------|-----------|---------|---------|---------|');
    let count = 0;
    for (const [varName, entry] of data.unifiedGraph) {
      if (count >= MAX_VARS_IN_REPORT) {
        out.push(mdRow(['...', `${data.unifiedGraph.size - count} more`, '', '', '']));
        break;
      }
      out.push(
        mdRow([
          `\`${varName}\``,
          entry.direction,
          entry.crossElementWriters.join(', ') || '—',
          entry.crossElementReaders.join(', ') || '—',
          entry.defaultValue ?? '—',
        ]),
      );
      count += 1;
    }
  }
  out.push('');

  out.push('## Lorebook ↔ Regex Correlation');
  out.push('');
  out.push(mdRow(['Shared Variables', String(data.lorebookRegexCorrelation.summary.totalShared)]));
  out.push(mdRow(['Lorebook-only Variables', String(data.lorebookRegexCorrelation.summary.totalLBOnly)]));
  out.push(mdRow(['Regex-only Variables', String(data.lorebookRegexCorrelation.summary.totalRXOnly)]));
  out.push('');

  if (data.lorebookRegexCorrelation.sharedVars.length > 0) {
    out.push('| Variable | Direction | Lorebook Entries | Regex Scripts |');
    out.push('|----------|-----------|------------------|---------------|');
    for (const shared of data.lorebookRegexCorrelation.sharedVars) {
      out.push(
        mdRow([
          `\`${shared.varName}\``,
          shared.direction,
          shared.lorebookEntries.join(', ') || '—',
          shared.regexScripts.join(', ') || '—',
        ]),
      );
    }
    out.push('');
  }

  if (data.lorebookStructure) {
    out.push('## Lorebook Structure');
    out.push('');
    out.push(mdRow(['Total Entries', String(data.lorebookStructure.stats.totalEntries)]));
    out.push(mdRow(['Total Folders', String(data.lorebookStructure.stats.totalFolders)]));
    out.push(mdRow(['With CBS', String(data.lorebookStructure.stats.withCBS)]));
    out.push('');
  }

  const analysisDir = path.join(outputDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'module-analysis.md'), out.join('\n'), 'utf-8');
}
