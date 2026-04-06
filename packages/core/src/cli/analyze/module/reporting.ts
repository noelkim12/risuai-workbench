import fs from 'node:fs';
import path from 'node:path';
import { MAX_VARS_IN_REPORT } from '@/domain';
import { mdRow } from '../../shared';
import { type Locale, t } from '../shared/i18n';
import type { ModuleReportData } from './types';

/** module analysis Markdown report를 생성한다. */
export function renderModuleMarkdown(data: ModuleReportData, outputDir: string, locale: Locale = 'ko'): void {
  const out: string[] = [];

  out.push('# ' + t(locale, 'md.module.title', data.moduleName));
  out.push('');
  out.push('> ' + t(locale, 'md.module.subtitle'));
  out.push('');
  out.push('## ' + t(locale, 'md.module.summary'));
  out.push(`| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`);
  out.push('|--------|-------|');
  out.push(mdRow([t(locale, 'md.module.moduleName'), data.moduleName]));
  out.push(mdRow([t(locale, 'md.module.lorebookEntries'), String(data.collected.lorebookCBS.length)]));
  out.push(mdRow([t(locale, 'md.module.regexScripts'), String(data.collected.regexCBS.length)]));
  out.push(mdRow([t(locale, 'md.module.luaScripts'), String(data.collected.luaCBS.length)]));
  out.push(mdRow([t(locale, 'md.module.backgroundHtml'), data.collected.htmlCBS ? t(locale, 'common.label.yes') : t(locale, 'common.label.no')]));
  out.push(mdRow([t(locale, 'md.module.uniqueCbsVars'), String(data.unifiedGraph.size)]));
  out.push('');

  out.push(...renderTokenBudget(data, locale));
  out.push(...renderVariableFlow(data, locale));
  out.push(...renderDeadCode(data, locale));

  out.push('## ' + t(locale, 'md.module.unifiedCbsVars'));
  out.push('');
  if (data.unifiedGraph.size === 0) {
    out.push('> ℹ️ ' + t(locale, 'common.finding.noCbsVars'));
  } else {
    out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'common.table.direction')} | ${t(locale, 'common.table.writers')} | ${t(locale, 'common.table.readers')} | ${t(locale, 'common.table.default')} |`);
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

  out.push('## ' + t(locale, 'md.module.lbRxCorrelation'));
  out.push('');
  out.push(mdRow([t(locale, 'md.module.sharedVars'), String(data.lorebookRegexCorrelation.summary.totalShared)]));
  out.push(mdRow([t(locale, 'md.module.lbOnlyVars'), String(data.lorebookRegexCorrelation.summary.totalLBOnly)]));
  out.push(mdRow([t(locale, 'md.module.rxOnlyVars'), String(data.lorebookRegexCorrelation.summary.totalRXOnly)]));
  out.push('');

  if (data.lorebookRegexCorrelation.sharedVars.length > 0) {
    out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'common.table.direction')} | ${t(locale, 'common.label.lorebookEntries')} | ${t(locale, 'md.module.regexScripts')} |`);
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
    out.push('## ' + t(locale, 'md.module.lorebookStructure'));
    out.push('');
    out.push(mdRow([t(locale, 'md.module.totalEntries'), String(data.lorebookStructure.stats.totalEntries)]));
    out.push(mdRow([t(locale, 'md.module.totalFolders'), String(data.lorebookStructure.stats.totalFolders)]));
    out.push(mdRow([t(locale, 'md.charx.withCBS'), String(data.lorebookStructure.stats.withCBS)]));
    out.push('');
  }

  const analysisDir = path.join(outputDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'module-analysis.md'), out.join('\n'), 'utf-8');
}

function renderTokenBudget(data: ModuleReportData, locale: Locale): string[] {
  const out = ['## ' + t(locale, 'md.charx.tokenBudget'), ''];
  out.push('> ' + t(locale, 'md.charx.heuristic'), '');
  out.push(`| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`);
  out.push('|--------|-------|');
  out.push(mdRow([t(locale, 'md.charx.alwaysActiveTokens'), String(data.tokenBudget.totals.alwaysActiveTokens)]));
  out.push(mdRow([t(locale, 'md.charx.conditionalTokens'), String(data.tokenBudget.totals.conditionalTokens)]));
  out.push(mdRow([t(locale, 'md.charx.worstCaseTokens'), String(data.tokenBudget.totals.worstCaseTokens)]));
  out.push('');

  if (data.tokenBudget.warnings.length > 0) {
    out.push('### ' + t(locale, 'md.charx.budgetWarnings'), '');
    data.tokenBudget.warnings.forEach((warning) => {
      out.push(`- [${warning.severity}] ${warning.message}`);
    });
    out.push('');
  }

  return out;
}

function renderVariableFlow(data: ModuleReportData, locale: Locale): string[] {
  const out = ['## ' + t(locale, 'md.charx.variableFlow'), ''];
  out.push(`| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`);
  out.push('|--------|-------|');
  out.push(mdRow([t(locale, 'md.charx.varsTracked'), String(data.variableFlow.summary.totalVariables)]));
  out.push(mdRow([t(locale, 'md.charx.varsWithIssues'), String(data.variableFlow.summary.withIssues)]));
  out.push('');

  const issueEntries = data.variableFlow.variables.filter((entry) => entry.issues.length > 0);
  if (issueEntries.length === 0) {
    out.push('> ℹ️ ' + t(locale, 'common.finding.noFlowIssues'), '');
    return out;
  }

  out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'common.table.issues')} |`);
  out.push('|----------|--------|');
  issueEntries.forEach((entry) => {
    out.push(mdRow([`\`${entry.varName}\``, entry.issues.map((issue) => issue.type).join(', ')]));
  });
  out.push('');
  return out;
}

function renderDeadCode(data: ModuleReportData, locale: Locale): string[] {
  const out = ['## ' + t(locale, 'md.charx.deadCode'), ''];
  if (data.deadCode.findings.length === 0) {
    out.push('> ℹ️ ' + t(locale, 'common.finding.noDeadCode'), '');
    return out;
  }

  out.push(`| ${t(locale, 'common.table.type')} | ${t(locale, 'common.table.severity')} | ${t(locale, 'common.table.element')} | ${t(locale, 'common.table.message')} |`);
  out.push('|------|----------|---------|---------|');
  data.deadCode.findings.forEach((finding) => {
    out.push(mdRow([finding.type, finding.severity, `${finding.elementType}:${finding.elementName}`, finding.message]));
  });
  out.push('');
  return out;
}
