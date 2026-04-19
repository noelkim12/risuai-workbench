import fs from 'node:fs';
import path from 'node:path';
import { type Locale, t } from '../shared/i18n';
import type { ComposeReportData } from './types';

/** compose Markdown 리포트를 생성한다. */
export function renderComposeMarkdown(data: ComposeReportData, analysisDir: string, locale: Locale = 'ko'): void {
  const { result } = data;
  const lines: string[] = [];

  lines.push('# ' + t(locale, 'md.compose.title'));
  lines.push('');
  lines.push('**' + t(locale, 'md.compose.compatScore') + '** ' + result.summary.compatibilityScore + '/100');
  lines.push('');
  lines.push('## ' + t(locale, 'md.compose.artifacts'));
  lines.push('');
  for (const artifact of result.artifacts) {
    lines.push(`- **${artifact.name}** (${artifact.type})`);
  }
  lines.push('');

  lines.push('## ' + t(locale, 'md.compose.conflicts'));
  lines.push('');
  if (result.conflicts.length === 0) {
    lines.push(t(locale, 'md.compose.noConflicts'));
    lines.push('');
  } else {
    lines.push(`| ${t(locale, 'common.table.severity')} | ${t(locale, 'common.table.type')} | ${t(locale, 'common.table.message')} |`);
    lines.push('|----------|------|---------|');
    for (const conflict of result.conflicts) {
      lines.push(`| ${conflict.severity} | ${conflict.type} | ${conflict.message.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }

  lines.push('## ' + t(locale, 'md.compose.mergedFlow'));
  lines.push('');
  lines.push('- ' + t(locale, 'md.compose.varsTracked', result.mergedVariableFlow.summary.totalVariables));
  lines.push('- ' + t(locale, 'md.compose.varsWithIssues', result.mergedVariableFlow.summary.withIssues));
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*' + t(locale, 'md.compose.footer') + '*');
  lines.push('*' + t(locale, 'md.compose.scoreNote') + '*');

  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'compose-analysis.md'), lines.join('\n'), 'utf-8');
}
