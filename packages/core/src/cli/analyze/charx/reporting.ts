import fs from 'node:fs';
import path from 'node:path';
import { MAX_VARS_IN_REPORT, type LorebookStructureResult } from '@/domain';
import { mdRow } from '../../shared';
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
export function renderMarkdown(data: CharxReportData, outputDir: string): void {
  const sections = [
    renderHeader(data),
    renderUnifiedCBSGraph(data.unifiedGraph),
    renderCrossElementSummary(data.unifiedGraph),
    renderLorebookRegexCorrelation(data.lorebookRegexCorrelation),
    renderDefaultVariablesMapping(data.defaultVariables, data.unifiedGraph),
    renderHTMLAnalysis(data.htmlAnalysis),
    renderLorebookStructure(data.lorebookStructure),
    renderUnmappedVariables(data.unifiedGraph),
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

function renderHeader(data: CharxReportData): string[] {
  const specVersion = getCharxSpec(data.charx);
  const hasHTML = Boolean(data.htmlAnalysis?.cbsData);
  const varCount = data.unifiedGraph ? data.unifiedGraph.size : 0;

  return [
    `# ${data.characterName} — Character Card Analysis`,
    '',
    '> Auto-generated comprehensive analysis of RisuAI character card structure.',
    '',
    '## Card Info',
    '| Metric | Value |',
    '|--------|-------|',
    mdRow(['Card Name', data.characterName || 'unknown']),
    mdRow(['Spec Version', specVersion]),
    mdRow(['Lorebook Entries', String(data.lorebookStructure?.stats?.totalEntries || 0)]),
    mdRow(['Regex Scripts', String(0)]),
    mdRow(['Lua Files', String(0)]),
    mdRow(['HTML Present', hasHTML ? 'Yes' : 'No']),
    mdRow(['Variables Count', String(varCount)]),
    '',
  ];
}

function renderUnifiedCBSGraph(unifiedGraph: Map<string, UnifiedVarEntry>): string[] {
  const out: string[] = ['## Unified CBS Variable Graph', ''];

  if (!unifiedGraph || unifiedGraph.size === 0) {
    out.push('> ℹ️ No data available');
    return out;
  }

  const totalSize = unifiedGraph.size;
  const entries = [...unifiedGraph.entries()];
  const shown = entries.slice(0, MAX_VARS_IN_REPORT);

  if (totalSize > MAX_VARS_IN_REPORT) {
    out.push(`> ⚠️ Showing ${MAX_VARS_IN_REPORT} of ${totalSize} variables`);
    out.push('');
  }

  out.push('| Variable | Elements | Direction | Default Value | Writers | Readers |');
  out.push('|----------|----------|-----------|---------------|---------|---------|');

  for (const [varName, entry] of shown) {
    const defaultVal = entry.defaultValue !== null ? entry.defaultValue : '—';
    const writers =
      entry.crossElementWriters.length > 0 ? entry.crossElementWriters.join(', ') : '—';
    const readers =
      entry.crossElementReaders.length > 0 ? entry.crossElementReaders.join(', ') : '—';
    out.push(
      mdRow([varName, String(entry.elementCount), entry.direction, defaultVal, writers, readers]),
    );
  }

  out.push('');
  return out;
}

function renderCrossElementSummary(unifiedGraph: Map<string, UnifiedVarEntry>): string[] {
  const out: string[] = ['## Cross-Element Summary', ''];

  if (!unifiedGraph || unifiedGraph.size === 0) {
    out.push('> ℹ️ No data available');
    return out;
  }

  const pairCounts: Record<string, number> = {};

  for (const [, entry] of unifiedGraph) {
    const sourceTypes = Object.keys(entry.sources);
    if (sourceTypes.length < 2) continue;

    for (let i = 0; i < sourceTypes.length; i += 1) {
      for (let j = i + 1; j < sourceTypes.length; j += 1) {
        const key = [sourceTypes[i], sourceTypes[j]].sort().join('↔');
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }
    }
  }

  const pairs = Object.entries(pairCounts).filter(([, count]) => count > 0);
  if (pairs.length === 0) {
    out.push('> ℹ️ No cross-element variable sharing detected');
    return out;
  }

  out.push('| Element Pair | Shared Variables |');
  out.push('|--------------|------------------|');
  for (const [pair, count] of pairs.sort((a, b) => b[1] - a[1])) {
    out.push(mdRow([pair, String(count)]));
  }

  out.push('');
  return out;
}

function renderLorebookRegexCorrelation(correlation: LorebookRegexCorrelation): string[] {
  const out: string[] = ['## Lorebook ↔ Regex Correlation', ''];

  if (!correlation || correlation.sharedVars.length === 0) {
    out.push('> ℹ️ No data available');
    out.push('');
    if (correlation) {
      out.push(...renderOnlyVarsList('Lorebook-Only Variables', correlation.lorebookOnlyVars));
      out.push(...renderOnlyVarsList('Regex-Only Variables', correlation.regexOnlyVars));
    }
    return out;
  }

  out.push('### Shared Variables');
  out.push('');
  out.push('| Variable | Direction | Lorebook Entries | Regex Scripts |');
  out.push('|----------|-----------|------------------|---------------|');

  for (const sv of correlation.sharedVars) {
    out.push(
      mdRow([
        sv.varName,
        sv.direction,
        sv.lorebookEntries.join(', ') || '—',
        sv.regexScripts.join(', ') || '—',
      ]),
    );
  }

  out.push('');
  out.push(...renderOnlyVarsList('Lorebook-Only Variables', correlation.lorebookOnlyVars));
  out.push(...renderOnlyVarsList('Regex-Only Variables', correlation.regexOnlyVars));
  return out;
}

function renderOnlyVarsList(title: string, vars: string[]): string[] {
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
): string[] {
  const out: string[] = ['## DefaultVariables Mapping', ''];

  const keys = Object.keys(defaultVariables || {});
  if (keys.length === 0) {
    out.push('> ℹ️ No data available');
    return out;
  }

  out.push('| Variable | Default Value | Used By |');
  out.push('|----------|---------------|---------|');
  for (const varName of keys) {
    let usedBy = '—';
    if (unifiedGraph && unifiedGraph.has(varName)) {
      const entry = unifiedGraph.get(varName);
      if (entry) usedBy = Object.keys(entry.sources).join(', ') || '—';
    }
    out.push(mdRow([varName, String(defaultVariables[varName]), usedBy]));
  }

  out.push('');
  return out;
}

function renderHTMLAnalysis(htmlAnalysis: HtmlResult): string[] {
  const out: string[] = ['## BackgroundHTML Analysis', ''];

  if (!htmlAnalysis || !htmlAnalysis.cbsData) {
    out.push('> ℹ️ No BackgroundHTML found in this card');
    return out;
  }

  const reads = htmlAnalysis.cbsData.reads || new Set<string>();
  const writes = htmlAnalysis.cbsData.writes || new Set<string>();

  out.push('### CBS Variables in HTML');
  out.push('');

  if (reads.size === 0 && writes.size === 0) {
    out.push('> ℹ️ No CBS variables found in HTML');
  } else {
    out.push('| Variable | Operation |');
    out.push('|----------|-----------|');
    for (const variable of reads) out.push(mdRow([variable, 'read']));
    for (const variable of writes) {
      if (!reads.has(variable)) out.push(mdRow([variable, 'write']));
    }
  }

  out.push('');
  if (htmlAnalysis.assetRefs.length > 0) {
    out.push('### Asset References');
    out.push('');
    for (const ref of htmlAnalysis.assetRefs) {
      out.push(`- ${ref}`);
    }
    out.push('');
  }

  return out;
}

function renderLorebookStructure(lorebookStructure: LorebookStructureResult): string[] {
  const out: string[] = ['## Lorebook Structure', ''];

  if (!lorebookStructure || lorebookStructure.stats.totalEntries === 0) {
    out.push('> ℹ️ No data available');
    return out;
  }

  const { folders, entries, stats, keywords } = lorebookStructure;

  if (folders.length > 0) {
    out.push('### Folder Tree');
    out.push('');
    for (const folder of folders) {
      out.push(`- 📁 **${folder.name || folder.id || 'unknown'}**`);
      const folderEntries = entries.filter((entry) => entry.folder === (folder.name || folder.id));
      for (const entry of folderEntries) {
        out.push(
          `  - ${entry.name}${entry.constant ? ' _(constant)_' : ''}${entry.enabled === false ? ' _(disabled)_' : ''}`,
        );
      }
    }

    const unfoldered = entries.filter((entry) => !entry.folder);
    if (unfoldered.length > 0) {
      out.push('- 📁 **_(no folder)_**');
      for (const entry of unfoldered) {
        out.push(
          `  - ${entry.name}${entry.constant ? ' _(constant)_' : ''}${entry.enabled === false ? ' _(disabled)_' : ''}`,
        );
      }
    }
    out.push('');
  }

  out.push('### Activation Modes');
  out.push('');
  out.push('| Mode | Count |');
  out.push('|------|-------|');
  out.push(mdRow(['Normal', String(stats.activationModes.normal)]));
  out.push(mdRow(['Constant', String(stats.activationModes.constant)]));
  out.push(mdRow(['Selective', String(stats.activationModes.selective)]));
  out.push(mdRow(['Enabled', String(stats.enabledCount)]));
  out.push(mdRow(['Disabled', String(stats.totalEntries - stats.enabledCount)]));
  out.push(mdRow(['With CBS', String(stats.withCBS)]));
  out.push(mdRow(['Without CBS', String(stats.totalEntries - stats.withCBS)]));
  out.push('');

  const overlaps = keywords.overlaps || {};
  const overlapKeys = Object.keys(overlaps);
  if (overlapKeys.length > 0) {
    out.push('### Keyword Overlaps');
    out.push('');
    out.push('Keywords shared by 2+ entries:');
    out.push('');
    out.push('| Keyword | Shared By |');
    out.push('|---------|-----------|');
    for (const keyword of overlapKeys) {
      out.push(mdRow([keyword, overlaps[keyword].join(', ')]));
    }
    out.push('');
  }

  return out;
}

function renderUnmappedVariables(unifiedGraph: Map<string, UnifiedVarEntry>): string[] {
  const out: string[] = ['## Unmapped Variables', ''];

  if (!unifiedGraph || unifiedGraph.size === 0) {
    out.push('> ℹ️ No data available');
    return out;
  }

  const isolated = [...unifiedGraph.entries()].filter(
    ([, entry]) => entry.direction === 'isolated',
  );
  if (isolated.length === 0) {
    out.push('> ℹ️ No unmapped (isolated) variables found');
    return out;
  }

  out.push('Variables that appear in only one element type:');
  out.push('');
  out.push('| Variable | Element | Reads/Writes |');
  out.push('|----------|---------|--------------|');

  for (const [varName, entry] of isolated) {
    const sourceType = Object.keys(entry.sources)[0];
    const source = entry.sources[sourceType];
    const ops: string[] = [];
    if (source.readers.length > 0) ops.push('read');
    if (source.writers.length > 0) ops.push('write');
    out.push(mdRow([varName, sourceType, ops.join(', ') || '—']));
  }

  out.push('');
  return out;
}
