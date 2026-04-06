import fs from 'node:fs';
import path from 'node:path';
import { MAX_VARS_IN_REPORT, type LorebookStructureResult } from '@/domain';
import { buildLorebookStructureTree } from '@/domain/lorebook/structure';
import { mdRow } from '../../shared';
import { type Locale, t } from '../shared/i18n';
import {
  type CharxReportData,
  type HtmlResult,
  type LorebookRegexCorrelation,
  type UnifiedVarEntry,
} from './types';

function getCharxSpec(charx: unknown): string {
  if (typeof charx !== 'object' || charx == null) return 'unknown';
  const record = charx as { spec?: string; data?: { spec?: string } };
  return record.data?.spec || record.spec || 'unknown';
}

/** 수집·분석 데이터를 Markdown 포맷 리포트로 렌더링하여 analysis/ 디렉토리에 저장한다. */
export function renderMarkdown(data: CharxReportData, outputDir: string, locale: Locale = 'ko'): void {
  const sections = [
    renderHeader(data, locale),
    renderUnifiedCBSGraph(data.unifiedGraph, locale),
    renderCrossElementSummary(data.unifiedGraph, locale),
    renderLorebookRegexCorrelation(data.lorebookRegexCorrelation, locale),
    renderDefaultVariablesMapping(data.defaultVariables, data.unifiedGraph, locale),
    renderHTMLAnalysis(data.htmlAnalysis, locale),
    renderTokenBudget(data, locale),
    renderVariableFlow(data, locale),
    renderDeadCode(data, locale),
    renderLorebookStructure(data.lorebookStructure, locale),
    renderUnmappedVariables(data.unifiedGraph, locale),
  ];

  const out: string[] = [];
  for (let i = 0; i < sections.length; i += 1) {
    out.push(...sections[i]);
    if (i < sections.length - 1) {
      out.push('', '---', '');
    }
  }

  const analysisDir = path.join(outputDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'charx-analysis.md'), out.join('\n'), 'utf8');
}

function renderHeader(data: CharxReportData, locale: Locale): string[] {
  const specVersion = getCharxSpec(data.charx);
  const hasHTML = Boolean(data.htmlAnalysis?.cbsData);
  const varCount = data.unifiedGraph ? data.unifiedGraph.size : 0;

  return [
    '# ' + t(locale, 'md.charx.title', data.characterName),
    '',
    '> ' + t(locale, 'md.charx.subtitle'),
    '',
    '## ' + t(locale, 'md.charx.cardInfo'),
    `| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`,
    '|--------|-------|',
    mdRow([t(locale, 'md.charx.cardName'), data.characterName || 'unknown']),
    mdRow([t(locale, 'md.charx.specVersion'), specVersion]),
    mdRow([t(locale, 'common.label.lorebookEntries'), String(data.lorebookStructure?.stats?.totalEntries || 0)]),
    mdRow([t(locale, 'md.charx.regexScripts'), String(0)]),
    mdRow([t(locale, 'md.charx.luaFiles'), String(0)]),
    mdRow([t(locale, 'md.charx.htmlPresent'), hasHTML ? t(locale, 'common.label.yes') : t(locale, 'common.label.no')]),
    mdRow([t(locale, 'md.charx.variablesCount'), String(varCount)]),
    '',
  ];
}

function renderUnifiedCBSGraph(unifiedGraph: Map<string, UnifiedVarEntry>, locale: Locale): string[] {
  const out: string[] = ['## ' + t(locale, 'md.charx.unifiedCbsGraph'), ''];

  if (!unifiedGraph || unifiedGraph.size === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'common.finding.noData'));
    return out;
  }

  const totalSize = unifiedGraph.size;
  const entries = [...unifiedGraph.entries()];
  const shown = entries.slice(0, MAX_VARS_IN_REPORT);

  if (totalSize > MAX_VARS_IN_REPORT) {
    out.push('> \u26A0\uFE0F ' + t(locale, 'md.charx.showing', MAX_VARS_IN_REPORT, totalSize));
    out.push('');
  }

  out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'common.table.elements')} | ${t(locale, 'common.table.direction')} | ${t(locale, 'md.charx.defaultValueCol')} | ${t(locale, 'common.table.writers')} | ${t(locale, 'common.table.readers')} |`);
  out.push('|----------|----------|-----------|---------------|---------|---------|');

  for (const [varName, entry] of shown) {
    const defaultVal = entry.defaultValue !== null ? entry.defaultValue : '\u2014';
    const writers =
      entry.crossElementWriters.length > 0 ? entry.crossElementWriters.join(', ') : '\u2014';
    const readers =
      entry.crossElementReaders.length > 0 ? entry.crossElementReaders.join(', ') : '\u2014';
    out.push(
      mdRow([varName, String(entry.elementCount), entry.direction, defaultVal, writers, readers]),
    );
  }

  out.push('');
  return out;
}

function renderCrossElementSummary(unifiedGraph: Map<string, UnifiedVarEntry>, locale: Locale): string[] {
  const out: string[] = ['## ' + t(locale, 'md.charx.crossElementSummary'), ''];

  if (!unifiedGraph || unifiedGraph.size === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'common.finding.noData'));
    return out;
  }

  const pairCounts: Record<string, number> = {};

  for (const [, entry] of unifiedGraph) {
    const sourceTypes = Object.keys(entry.sources);
    if (sourceTypes.length < 2) continue;

    for (let i = 0; i < sourceTypes.length; i += 1) {
      for (let j = i + 1; j < sourceTypes.length; j += 1) {
        const key = [sourceTypes[i], sourceTypes[j]].sort().join('\u2194');
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }
    }
  }

  const pairs = Object.entries(pairCounts).filter(([, count]) => count > 0);
  if (pairs.length === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'md.charx.noCrossElement'));
    return out;
  }

  out.push(`| ${t(locale, 'md.charx.elementPair')} | ${t(locale, 'md.charx.sharedVariables')} |`);
  out.push('|--------------|------------------|');
  for (const [pair, count] of pairs.sort((a, b) => b[1] - a[1])) {
    out.push(mdRow([pair, String(count)]));
  }

  out.push('');
  return out;
}

function renderLorebookRegexCorrelation(correlation: LorebookRegexCorrelation, locale: Locale): string[] {
  const out: string[] = ['## ' + t(locale, 'md.charx.lbRxCorrelation'), ''];

  if (!correlation || correlation.sharedVars.length === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'common.finding.noData'));
    out.push('');
    if (correlation) {
      out.push(...renderOnlyVarsList(t(locale, 'md.charx.lbOnlyVars'), correlation.lorebookOnlyVars, locale));
      out.push(...renderOnlyVarsList(t(locale, 'md.charx.rxOnlyVars'), correlation.regexOnlyVars, locale));
    }
    return out;
  }

  out.push('### ' + t(locale, 'md.charx.sharedVarsHeader'));
  out.push('');
  out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'common.table.direction')} | ${t(locale, 'common.label.lorebookEntries')} | ${t(locale, 'md.charx.regexScripts')} |`);
  out.push('|----------|-----------|------------------|---------------|');

  for (const sv of correlation.sharedVars) {
    out.push(
      mdRow([
        sv.varName,
        sv.direction,
        sv.lorebookEntries.join(', ') || '\u2014',
        sv.regexScripts.join(', ') || '\u2014',
      ]),
    );
  }

  out.push('');
  out.push(...renderOnlyVarsList(t(locale, 'md.charx.lbOnlyVars'), correlation.lorebookOnlyVars, locale));
  out.push(...renderOnlyVarsList(t(locale, 'md.charx.rxOnlyVars'), correlation.regexOnlyVars, locale));
  return out;
}

function renderOnlyVarsList(title: string, vars: string[], locale: Locale): string[] {
  if (!vars || vars.length === 0) return [];

  return [
    `### ${title}`,
    '',
    ...vars.map((variable) => `- \`${variable}\``),
    '',
  ];
}

function renderDefaultVariablesMapping(
  defaultVariables: Record<string, string>,
  unifiedGraph: Map<string, UnifiedVarEntry>,
  locale: Locale,
): string[] {
  const out: string[] = ['## ' + t(locale, 'md.charx.defaultVarsMapping'), ''];

  const keys = Object.keys(defaultVariables || {});
  if (keys.length === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'common.finding.noData'));
    return out;
  }

  out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'md.charx.defaultValueCol')} | ${t(locale, 'charx.table.usedBy')} |`);
  out.push('|----------|---------------|---------|');
  for (const varName of keys) {
    let usedBy = '\u2014';
    if (unifiedGraph && unifiedGraph.has(varName)) {
      const entry = unifiedGraph.get(varName);
      if (entry) usedBy = Object.keys(entry.sources).join(', ') || '\u2014';
    }
    out.push(mdRow([varName, String(defaultVariables[varName]), usedBy]));
  }

  out.push('');
  return out;
}

function renderHTMLAnalysis(htmlAnalysis: HtmlResult, locale: Locale): string[] {
  const out: string[] = ['## ' + t(locale, 'md.charx.bgHtmlAnalysis'), ''];

  if (!htmlAnalysis || !htmlAnalysis.cbsData) {
    out.push('> \u2139\uFE0F ' + t(locale, 'md.charx.noBgHtml'));
    return out;
  }

  const reads = htmlAnalysis.cbsData.reads || new Set<string>();
  const writes = htmlAnalysis.cbsData.writes || new Set<string>();

  out.push('### ' + t(locale, 'md.charx.cbsVarsInHtml'));
  out.push('');

  if (reads.size === 0 && writes.size === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'md.charx.noCbsVarsInHtml'));
  } else {
    out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'md.charx.operationCol')} |`);
    out.push('|----------|-----------|');
    for (const variable of reads) out.push(mdRow([variable, 'read']));
    for (const variable of writes) {
      if (!reads.has(variable)) out.push(mdRow([variable, 'write']));
    }
  }

  out.push('');
  if (htmlAnalysis.assetRefs.length > 0) {
    out.push('### ' + t(locale, 'md.charx.assetReferences'));
    out.push('');
    for (const ref of htmlAnalysis.assetRefs) {
      out.push(`- ${ref}`);
    }
    out.push('');
  }

  return out;
}

function renderTokenBudget(data: CharxReportData, locale: Locale): string[] {
  const out: string[] = ['## ' + t(locale, 'md.charx.tokenBudget'), ''];
  out.push('> ' + t(locale, 'md.charx.heuristic'), '');
  out.push(`| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`);
  out.push('|--------|-------|');
  out.push(mdRow([t(locale, 'md.charx.alwaysActiveTokens'), String(data.tokenBudget.totals.alwaysActiveTokens)]));
  out.push(mdRow([t(locale, 'md.charx.conditionalTokens'), String(data.tokenBudget.totals.conditionalTokens)]));
  out.push(mdRow([t(locale, 'md.charx.worstCaseTokens'), String(data.tokenBudget.totals.worstCaseTokens)]));
  out.push('');

  if (data.tokenBudget.warnings.length > 0) {
    out.push('### ' + t(locale, 'md.charx.budgetWarnings'), '');
    for (const warning of data.tokenBudget.warnings) {
      out.push(`- [${warning.severity}] ${warning.message}`);
    }
    out.push('');
  }

  return out;
}

function renderVariableFlow(data: CharxReportData, locale: Locale): string[] {
  const out: string[] = ['## ' + t(locale, 'md.charx.variableFlow'), ''];
  out.push(`| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`);
  out.push('|--------|-------|');
  out.push(mdRow([t(locale, 'md.charx.varsTracked'), String(data.variableFlow.summary.totalVariables)]));
  out.push(mdRow([t(locale, 'md.charx.varsWithIssues'), String(data.variableFlow.summary.withIssues)]));
  out.push('');

  const issueEntries = data.variableFlow.variables.filter((entry) => entry.issues.length > 0);
  if (issueEntries.length === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'common.finding.noFlowIssues'), '');
    return out;
  }

  out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'common.table.issues')} |`);
  out.push('|----------|--------|');
  for (const entry of issueEntries) {
    out.push(mdRow([`\`${entry.varName}\``, entry.issues.map((issue) => issue.type).join(', ')]));
  }
  out.push('');
  return out;
}

function renderDeadCode(data: CharxReportData, locale: Locale): string[] {
  const out: string[] = ['## ' + t(locale, 'md.charx.deadCode'), ''];
  if (data.deadCode.findings.length === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'common.finding.noDeadCode'), '');
    return out;
  }

  out.push(`| ${t(locale, 'common.table.type')} | ${t(locale, 'common.table.severity')} | ${t(locale, 'common.table.element')} | ${t(locale, 'common.table.message')} |`);
  out.push('|------|----------|---------|---------|');
  for (const finding of data.deadCode.findings) {
    out.push(mdRow([finding.type, finding.severity, `${finding.elementType}:${finding.elementName}`, finding.message]));
  }
  out.push('');
  return out;
}

function renderLorebookStructure(lorebookStructure: LorebookStructureResult, locale: Locale): string[] {
  const out: string[] = ['## ' + t(locale, 'md.charx.lorebookStructure'), ''];

  if (!lorebookStructure || lorebookStructure.stats.totalEntries === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'common.finding.noData'));
    return out;
  }

  const { folders, stats, keywords } = lorebookStructure;

  if (folders.length > 0) {
    const { roots, rootEntries } = buildLorebookStructureTree(lorebookStructure);
    out.push('### ' + t(locale, 'md.charx.folderTree'));
    out.push('');

    const renderFolder = (folder: (typeof roots)[number], depth = 0): void => {
      out.push(`${'  '.repeat(depth)}- \uD83D\uDCC1 **${folder.name || folder.id || 'unknown'}**`);
      for (const entry of folder.entries) {
        out.push(
          `${'  '.repeat(depth + 1)}- ${entry.name}${entry.constant ? ` _${t(locale, 'md.charx.constant')}_` : ''}${entry.enabled === false ? ` _${t(locale, 'md.charx.disabledEntry')}_` : ''}`,
        );
      }
      for (const child of folder.children) renderFolder(child, depth + 1);
    };

    for (const folder of roots) renderFolder(folder);
    if (rootEntries.length > 0) {
      out.push(`- \uD83D\uDCC1 **_${t(locale, 'md.charx.noFolder')}_**`);
      for (const entry of rootEntries) {
        out.push(
          `  - ${entry.name}${entry.constant ? ` _${t(locale, 'md.charx.constant')}_` : ''}${entry.enabled === false ? ` _${t(locale, 'md.charx.disabledEntry')}_` : ''}`,
        );
      }
    }
    out.push('');
  }

  out.push('### ' + t(locale, 'md.charx.activationModes'));
  out.push('');
  out.push(`| ${t(locale, 'md.charx.mode')} | ${t(locale, 'md.charx.count')} |`);
  out.push('|------|-------|');
  out.push(mdRow([t(locale, 'charx.chart.normal'), String(stats.activationModes.normal)]));
  out.push(mdRow([t(locale, 'charx.chart.constant'), String(stats.activationModes.constant)]));
  out.push(mdRow([t(locale, 'charx.chart.selective'), String(stats.activationModes.selective)]));
  out.push(mdRow([t(locale, 'md.charx.enabled'), String(stats.enabledCount)]));
  out.push(mdRow([t(locale, 'md.charx.disabled'), String(stats.totalEntries - stats.enabledCount)]));
  out.push(mdRow([t(locale, 'md.charx.withCBS'), String(stats.withCBS)]));
  out.push(mdRow([t(locale, 'md.charx.withoutCBS'), String(stats.totalEntries - stats.withCBS)]));
  out.push('');

  const overlaps = keywords.overlaps || {};
  const overlapKeys = Object.keys(overlaps);
  if (overlapKeys.length > 0) {
    out.push('### ' + t(locale, 'md.charx.keywordOverlaps'));
    out.push('');
    out.push(t(locale, 'md.charx.keywordSharedBy'));
    out.push('');
    out.push(`| ${t(locale, 'md.charx.keyword')} | ${t(locale, 'md.charx.sharedBy')} |`);
    out.push('|---------|-----------|');
    for (const keyword of overlapKeys) {
      out.push(mdRow([keyword, overlaps[keyword].join(', ')]));
    }
    out.push('');
  }

  return out;
}

function renderUnmappedVariables(unifiedGraph: Map<string, UnifiedVarEntry>, locale: Locale): string[] {
  const out: string[] = ['## ' + t(locale, 'md.charx.unmappedVars'), ''];

  if (!unifiedGraph || unifiedGraph.size === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'common.finding.noData'));
    return out;
  }

  const isolated = [...unifiedGraph.entries()].filter(
    ([, entry]) => entry.direction === 'isolated',
  );
  if (isolated.length === 0) {
    out.push('> \u2139\uFE0F ' + t(locale, 'md.charx.noUnmapped'));
    return out;
  }

  out.push(t(locale, 'md.charx.unmappedDesc'));
  out.push('');
  out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'common.table.element')} | ${t(locale, 'md.charx.readsWrites')} |`);
  out.push('|----------|---------|--------------|');

  for (const [varName, entry] of isolated) {
    const sourceType = Object.keys(entry.sources)[0];
    const source = entry.sources[sourceType];
    const ops: string[] = [];
    if (source.readers.length > 0) ops.push('read');
    if (source.writers.length > 0) ops.push('write');
    out.push(mdRow([varName, sourceType, ops.join(', ') || '\u2014']));
  }

  out.push('');
  return out;
}
