import fs from 'node:fs';
import path from 'node:path';
import { MAX_VARS_IN_REPORT } from '@/domain';
import { mdRow } from '../../shared';
import { type Locale, t } from '../shared/i18n';
import type { PresetReportData } from './types';

/** preset analysis Markdown report를 생성한다. */
export function renderPresetMarkdown(data: PresetReportData, outputDir: string, locale: Locale = 'ko'): void {
  const out: string[] = [];

  out.push('# ' + t(locale, 'md.preset.title', data.presetName));
  out.push('');
  out.push('> ' + t(locale, 'md.preset.subtitle'));
  out.push('');
  out.push('## ' + t(locale, 'md.preset.summary'));
  out.push(`| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`);
  out.push('|--------|-------|');
  out.push(mdRow([t(locale, 'md.preset.presetName'), data.presetName]));
  out.push(mdRow([t(locale, 'md.preset.promptFiles'), String(data.collected.prompts.length)]));
  out.push(mdRow([t(locale, 'md.preset.promptTemplateItems'), String(data.collected.promptTemplates.length)]));
  out.push(mdRow([t(locale, 'md.preset.regexScripts'), String(data.collected.regexCBS.length)]));
  out.push(mdRow([t(locale, 'md.preset.uniqueCbsVars'), String(data.unifiedGraph.size)]));
  out.push('');

  out.push(...renderVariableFlow(data, locale));
  out.push(...renderDeadCode(data, locale));
  out.push(...renderPromptChain(data, locale));

  out.push('## ' + t(locale, 'md.preset.promptSources'));
  out.push('');
  if (data.collected.prompts.length === 0) {
    out.push('> ℹ️ ' + t(locale, 'md.preset.noPrompts'));
  } else {
    out.push(`| ${t(locale, 'md.preset.prompt')} | ${t(locale, 'preset.table.reads')} | ${t(locale, 'preset.table.writes')} |`);
    out.push('|--------|-------|--------|');
    for (const prompt of data.collected.prompts) {
      out.push(mdRow([prompt.name, [...prompt.reads].join(', ') || '—', [...prompt.writes].join(', ') || '—']));
    }
  }
  out.push('');

  out.push('## ' + t(locale, 'md.preset.promptTemplateItemsHeader'));
  out.push('');
  if (data.collected.promptTemplates.length === 0) {
    out.push('> ℹ️ ' + t(locale, 'md.preset.noTemplates'));
  } else {
    out.push(`| ${t(locale, 'md.preset.template')} | ${t(locale, 'preset.table.reads')} | ${t(locale, 'preset.table.writes')} |`);
    out.push('|----------|-------|--------|');
    for (const template of data.collected.promptTemplates) {
      out.push(mdRow([template.name, [...template.reads].join(', ') || '—', [...template.writes].join(', ') || '—']));
    }
  }
  out.push('');

  out.push('## ' + t(locale, 'md.preset.unifiedCbsVars'));
  out.push('');
  if (data.unifiedGraph.size === 0) {
    out.push('> ℹ️ ' + t(locale, 'common.finding.noCbsVars'));
  } else {
    out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'common.table.direction')} | ${t(locale, 'common.table.readers')} | ${t(locale, 'common.table.writers')} |`);
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

  out.push('## ' + t(locale, 'md.preset.modelParams'));
  out.push('');
  out.push(mdRow([t(locale, 'md.preset.modelConfig'), data.collected.model ? JSON.stringify(data.collected.model) : '—']));
  out.push(mdRow([t(locale, 'md.preset.parameters'), data.collected.parameters ? JSON.stringify(data.collected.parameters) : '—']));
  out.push('');

  const analysisDir = path.join(outputDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'preset-analysis.md'), out.join('\n'), 'utf-8');
}

function renderVariableFlow(data: PresetReportData, locale: Locale): string[] {
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

function renderDeadCode(data: PresetReportData, locale: Locale): string[] {
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

function renderPromptChain(data: PresetReportData, locale: Locale): string[] {
  const out = ['## ' + t(locale, 'md.preset.promptChain'), ''];
  out.push(`| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`);
  out.push('|--------|-------|');
  out.push(mdRow([t(locale, 'md.preset.chainLinks'), String(data.promptChain.chain.length)]));
  out.push(mdRow([t(locale, 'md.preset.externalDeps'), String(data.promptChain.externalDeps.length)]));
  out.push(mdRow([t(locale, 'md.preset.selfContainedVars'), String(data.promptChain.selfContainedVars.length)]));
  out.push(mdRow([t(locale, 'md.preset.estimatedTokens'), String(data.promptChain.totalEstimatedTokens)]));
  out.push('');

  if (data.promptChain.chain.length > 0) {
    out.push(`| ${t(locale, 'preset.table.index')} | ${t(locale, 'preset.table.name')} | ${t(locale, 'common.table.type')} | ${t(locale, 'preset.table.tokens')} | ${t(locale, 'preset.table.satisfied')} | ${t(locale, 'preset.table.unsatisfied')} |`);
    out.push('|-------|------|------|--------|-----------|-------------|');
    data.promptChain.chain.forEach((link) => {
      out.push(
        mdRow([
          String(link.index),
          link.name,
          link.type,
          String(link.estimatedTokens),
          link.satisfiedDeps.join(', ') || '—',
          link.unsatisfiedDeps.join(', ') || '—',
        ]),
      );
    });
    out.push('');
  }

  if (data.promptChain.externalDeps.length > 0) {
    out.push('### ' + t(locale, 'md.preset.externalDepsHeader'), '');
    data.promptChain.externalDeps.forEach((dependency) => {
      out.push(`- \`${dependency}\``);
    });
    out.push('');
  }

  if (data.promptChain.issues.length > 0) {
    out.push('### ' + t(locale, 'md.preset.chainIssues'), '');
    data.promptChain.issues.forEach((issue) => {
      out.push(`- [${issue.severity}] ${issue.type}: ${issue.message}`);
    });
    out.push('');
  }

  return out;
}
