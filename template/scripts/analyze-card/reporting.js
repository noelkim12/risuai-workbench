'use strict';

const fs = require('fs');
const path = require('path');
const { MAX_VARS_IN_REPORT, MAX_ENTRIES_IN_REPORT, MAX_SCRIPTS_IN_REPORT, ELEMENT_TYPES } = require('./constants');

const mdRow = (cells) => '| ' + cells.join(' | ') + ' |';

/**
 * Render a comprehensive Markdown analysis report for a RisuAI character card.
 *
 * @param {Object} data - Aggregated analysis data
 * @param {string} outputDir - Base output directory (writes to <outputDir>/analysis/card-analysis.md)
 */
function renderMarkdown(data, outputDir) {
  const {
    card,
    cardName,
    unifiedGraph,
    lorebookRegexCorrelation,
    lorebookStructure,
    defaultVariables,
    htmlAnalysis,
    lorebookCBS,
    regexCBS,
    tsCBS,
    luaCBS
  } = data;

  const out = [];

  // ── Section 1: Header + Card Info ──
  renderHeader(out, card, cardName, data);

  out.push('');
  out.push('---');
  out.push('');

  // ── Section 2: Unified CBS Variable Graph ──
  renderUnifiedCBSGraph(out, unifiedGraph);

  out.push('');
  out.push('---');
  out.push('');

  // ── Section 3: Cross-Element Summary ──
  renderCrossElementSummary(out, unifiedGraph);

  out.push('');
  out.push('---');
  out.push('');

  // ── Section 4: Lorebook ↔ Regex Correlation ──
  renderLorebookRegexCorrelation(out, lorebookRegexCorrelation);

  out.push('');
  out.push('---');
  out.push('');

  // ── Section 5: DefaultVariables Mapping ──
  renderDefaultVariablesMapping(out, defaultVariables, unifiedGraph);

  out.push('');
  out.push('---');
  out.push('');

  // ── Section 6: BackgroundHTML Analysis ──
  renderHTMLAnalysis(out, htmlAnalysis);

  out.push('');
  out.push('---');
  out.push('');

  // ── Section 7: Lorebook Structure ──
  renderLorebookStructure(out, lorebookStructure);

  out.push('');
  out.push('---');
  out.push('');

  // ── Section 8: Unmapped Variables ──
  renderUnmappedVariables(out, unifiedGraph);

  // Write file
  const analysisDir = path.join(outputDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'card-analysis.md'), out.join('\n'), 'utf8');
}

// ── Section 1: Header + Card Info ──────────────────────────────────────────

function renderHeader(out, card, cardName, data) {
  const specVersion = card?.data?.spec || card?.spec || 'unknown';
  const lorebookEntryCount = data.lorebookStructure?.stats?.totalEntries || 0;
  const regexCount = (data.regexCBS || []).length;
  const luaCount = (data.luaCBS || []).length;
  const hasHTML = !!(data.htmlAnalysis?.cbsData);
  const varCount = data.unifiedGraph ? data.unifiedGraph.size : 0;

  out.push(`# ${cardName} — Character Card Analysis`);
  out.push('');
  out.push('> Auto-generated comprehensive analysis of RisuAI character card structure.');
  out.push('');
  out.push('## Card Info');
  out.push('| Metric | Value |');
  out.push('|--------|-------|');
  out.push(mdRow(['Card Name', cardName || 'unknown']));
  out.push(mdRow(['Spec Version', specVersion]));
  out.push(mdRow(['Lorebook Entries', String(lorebookEntryCount)]));
  out.push(mdRow(['Regex Scripts', String(regexCount)]));
  out.push(mdRow(['Lua Files', String(luaCount)]));
  out.push(mdRow(['HTML Present', hasHTML ? 'Yes' : 'No']));
  out.push(mdRow(['Variables Count', String(varCount)]));
  out.push('');
}

// ── Section 2: Unified CBS Variable Graph ──────────────────────────────────

function renderUnifiedCBSGraph(out, unifiedGraph) {
  out.push('## Unified CBS Variable Graph');
  out.push('');

  if (!unifiedGraph || unifiedGraph.size === 0) {
    out.push('> ℹ️ No data available');
    return;
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
    const elements = String(entry.elementCount);
    const direction = entry.direction;
    const defaultVal = entry.defaultValue !== null ? entry.defaultValue : '—';
    const writers = entry.crossElementWriters.length > 0
      ? entry.crossElementWriters.join(', ')
      : '—';
    const readers = entry.crossElementReaders.length > 0
      ? entry.crossElementReaders.join(', ')
      : '—';
    out.push(mdRow([varName, elements, direction, defaultVal, writers, readers]));
  }

  out.push('');
}

// ── Section 3: Cross-Element Summary ───────────────────────────────────────

function renderCrossElementSummary(out, unifiedGraph) {
  out.push('## Cross-Element Summary');
  out.push('');

  if (!unifiedGraph || unifiedGraph.size === 0) {
    out.push('> ℹ️ No data available');
    return;
  }

  // Collect element type pairs that share variables
  const typeList = Object.values(ELEMENT_TYPES);
  const pairCounts = {};

  for (const [, entry] of unifiedGraph) {
    const sourceTypes = Object.keys(entry.sources);
    if (sourceTypes.length < 2) continue;

    for (let i = 0; i < sourceTypes.length; i++) {
      for (let j = i + 1; j < sourceTypes.length; j++) {
        const key = [sourceTypes[i], sourceTypes[j]].sort().join('↔');
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }
    }
  }

  const pairs = Object.entries(pairCounts).filter(([, count]) => count > 0);

  if (pairs.length === 0) {
    out.push('> ℹ️ No cross-element variable sharing detected');
    return;
  }

  out.push('| Element Pair | Shared Variables |');
  out.push('|--------------|------------------|');

  for (const [pair, count] of pairs.sort((a, b) => b[1] - a[1])) {
    out.push(mdRow([pair, String(count)]));
  }

  out.push('');
}

// ── Section 4: Lorebook ↔ Regex Correlation ────────────────────────────────

function renderLorebookRegexCorrelation(out, correlation) {
  out.push('## Lorebook ↔ Regex Correlation');
  out.push('');

  if (!correlation || correlation.sharedVars.length === 0) {
    out.push('> ℹ️ No data available');
    out.push('');

    // Still show only-vars if present
    if (correlation) {
      renderOnlyVarsList(out, 'Lorebook-Only Variables', correlation.lorebookOnlyVars);
      renderOnlyVarsList(out, 'Regex-Only Variables', correlation.regexOnlyVars);
    }
    return;
  }

  out.push('### Shared Variables');
  out.push('');
  out.push('| Variable | Direction | Lorebook Entries | Regex Scripts |');
  out.push('|----------|-----------|------------------|---------------|');

  for (const sv of correlation.sharedVars) {
    out.push(mdRow([
      sv.varName,
      sv.direction,
      sv.lorebookEntries.join(', ') || '—',
      sv.regexScripts.join(', ') || '—'
    ]));
  }

  out.push('');

  renderOnlyVarsList(out, 'Lorebook-Only Variables', correlation.lorebookOnlyVars);
  renderOnlyVarsList(out, 'Regex-Only Variables', correlation.regexOnlyVars);
}

function renderOnlyVarsList(out, title, vars) {
  if (!vars || vars.length === 0) return;

  out.push(`### ${title}`);
  out.push('');
  for (const v of vars) {
    out.push(`- \`${v}\``);
  }
  out.push('');
}

// ── Section 5: DefaultVariables Mapping ────────────────────────────────────

function renderDefaultVariablesMapping(out, defaultVariables, unifiedGraph) {
  out.push('## DefaultVariables Mapping');
  out.push('');

  const defaults = defaultVariables || {};
  const keys = Object.keys(defaults);

  if (keys.length === 0) {
    out.push('> ℹ️ No data available');
    return;
  }

  out.push('| Variable | Default Value | Used By |');
  out.push('|----------|---------------|---------|');

  for (const varName of keys) {
    const defaultVal = String(defaults[varName]);
    let usedBy = '—';

    if (unifiedGraph && unifiedGraph.has(varName)) {
      const entry = unifiedGraph.get(varName);
      usedBy = Object.keys(entry.sources).join(', ') || '—';
    }

    out.push(mdRow([varName, defaultVal, usedBy]));
  }

  out.push('');
}

// ── Section 6: BackgroundHTML Analysis ─────────────────────────────────────

function renderHTMLAnalysis(out, htmlAnalysis) {
  out.push('## BackgroundHTML Analysis');
  out.push('');

  if (!htmlAnalysis || !htmlAnalysis.cbsData) {
    out.push('> ℹ️ No BackgroundHTML found in this card');
    return;
  }

  const cbsData = htmlAnalysis.cbsData;
  const reads = cbsData.reads || new Set();
  const writes = cbsData.writes || new Set();

  out.push('### CBS Variables in HTML');
  out.push('');

  if (reads.size === 0 && writes.size === 0) {
    out.push('> ℹ️ No CBS variables found in HTML');
  } else {
    out.push('| Variable | Operation |');
    out.push('|----------|-----------|');

    for (const v of reads) {
      out.push(mdRow([v, 'read']));
    }
    for (const v of writes) {
      if (!reads.has(v)) {
        out.push(mdRow([v, 'write']));
      } else {
        // Already listed as read, update with read+write
      }
    }

    // Handle vars that are both read and written
    for (const v of writes) {
      if (reads.has(v)) {
        // Replace the read-only row — simpler to just add write entries that weren't reads
      }
    }
  }

  out.push('');

  // Asset references
  const assetRefs = htmlAnalysis.assetRefs || [];
  if (assetRefs.length > 0) {
    out.push('### Asset References');
    out.push('');
    for (const ref of assetRefs) {
      out.push(`- ${ref}`);
    }
  }

  out.push('');
}

// ── Section 7: Lorebook Structure ──────────────────────────────────────────

function renderLorebookStructure(out, lorebookStructure) {
  out.push('## Lorebook Structure');
  out.push('');

  if (!lorebookStructure || lorebookStructure.stats.totalEntries === 0) {
    out.push('> ℹ️ No data available');
    return;
  }

  const { folders, entries, stats, keywords } = lorebookStructure;

  // Folder tree
  if (folders.length > 0) {
    out.push('### Folder Tree');
    out.push('');
    for (const folder of folders) {
      out.push(`- 📁 **${folder.name || folder.id}**`);
      // List entries in this folder
      const folderEntries = entries.filter((e) => e.folder === (folder.name || folder.id));
      for (const entry of folderEntries) {
        out.push(`  - ${entry.name}${entry.constant ? ' _(constant)_' : ''}${!entry.enabled ? ' _(disabled)_' : ''}`);
      }
    }

    // Entries without folder
    const unfolderedEntries = entries.filter((e) => !e.folder);
    if (unfolderedEntries.length > 0) {
      out.push('- 📁 **_(no folder)_**');
      for (const entry of unfolderedEntries) {
        out.push(`  - ${entry.name}${entry.constant ? ' _(constant)_' : ''}${!entry.enabled ? ' _(disabled)_' : ''}`);
      }
    }
    out.push('');
  }

  // Activation mode stats
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

  // Keyword overlap table
  const overlaps = keywords.overlaps || {};
  const overlapKeys = Object.keys(overlaps);

  if (overlapKeys.length > 0) {
    out.push('### Keyword Overlaps');
    out.push('');
    out.push('Keywords shared by 2+ entries:');
    out.push('');
    out.push('| Keyword | Shared By |');
    out.push('|---------|-----------|');

    for (const kw of overlapKeys) {
      out.push(mdRow([kw, overlaps[kw].join(', ')]));
    }
    out.push('');
  }
}

// ── Section 8: Unmapped Variables ──────────────────────────────────────────

function renderUnmappedVariables(out, unifiedGraph) {
  out.push('## Unmapped Variables');
  out.push('');

  if (!unifiedGraph || unifiedGraph.size === 0) {
    out.push('> ℹ️ No data available');
    return;
  }

  const isolated = [...unifiedGraph.entries()]
    .filter(([, entry]) => entry.direction === 'isolated');

  if (isolated.length === 0) {
    out.push('> ℹ️ No unmapped (isolated) variables found');
    return;
  }

  out.push('Variables that appear in only one element type:');
  out.push('');
  out.push('| Variable | Element | Reads/Writes |');
  out.push('|----------|---------|--------------|');

  for (const [varName, entry] of isolated) {
    const sourceType = Object.keys(entry.sources)[0];
    const source = entry.sources[sourceType];
    const ops = [];
    if (source.readers.length > 0) ops.push('read');
    if (source.writers.length > 0) ops.push('write');
    out.push(mdRow([varName, sourceType, ops.join(', ') || '—']));
  }

  out.push('');
}

module.exports = { renderMarkdown };
