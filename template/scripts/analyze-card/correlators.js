'use strict';

const { ELEMENT_TYPES, MAX_VARS_IN_REPORT } = require('./constants');

const ELEMENT_TYPE_ORDER = Object.values(ELEMENT_TYPES);

/**
 * Build unified CBS variable graph from all collected element data.
 *
 * @param {Array<ElementCBSData>} allCollected - All ElementCBSData from all collectors
 * @param {Object} defaultVariables - Key-value pairs from defaultVariables field
 * @returns {Map<string, UnifiedVarEntry>} varName -> entry
 */
function buildUnifiedCBSGraph(allCollected, defaultVariables) {
  const graph = new Map();

  for (const element of allCollected || []) {
    if (!element) {
      continue;
    }

    const { elementType, elementName, reads, writes } = element;

    for (const varName of reads || []) {
      ensureEntry(graph, varName);
      const entry = graph.get(varName);
      ensureSource(entry, elementType);
      entry.sources[elementType].readers.push(elementName);
    }

    for (const varName of writes || []) {
      ensureEntry(graph, varName);
      const entry = graph.get(varName);
      ensureSource(entry, elementType);
      entry.sources[elementType].writers.push(elementName);
    }
  }

  const defaults = defaultVariables || {};
  for (const [varName, entry] of graph.entries()) {
    entry.defaultValue = defaults[varName] !== undefined ? String(defaults[varName]) : null;

    const sourceTypes = Object.keys(entry.sources);
    entry.elementCount = sourceTypes.length;
    entry.direction = entry.elementCount >= 2 ? 'bridged' : 'isolated';

    entry.crossElementWriters = sourceTypes
      .filter((type) => entry.sources[type].writers.length > 0)
      .sort(sortElementTypes);

    entry.crossElementReaders = sourceTypes
      .filter((type) => entry.sources[type].readers.length > 0)
      .sort(sortElementTypes);
  }

  const sorted = [...graph.entries()].sort((a, b) => {
    const aEntry = a[1];
    const bEntry = b[1];

    if (aEntry.direction !== bEntry.direction) {
      return aEntry.direction === 'bridged' ? -1 : 1;
    }

    if (aEntry.elementCount !== bEntry.elementCount) {
      return bEntry.elementCount - aEntry.elementCount;
    }

    return a[0].localeCompare(b[0]);
  });

  return new Map(sorted.slice(0, MAX_VARS_IN_REPORT));
}

function ensureEntry(graph, varName) {
  if (graph.has(varName)) {
    return;
  }

  graph.set(varName, {
    varName,
    sources: {},
    defaultValue: null,
    elementCount: 0,
    direction: 'isolated',
    crossElementWriters: [],
    crossElementReaders: []
  });
}

function ensureSource(entry, elementType) {
  if (!entry.sources[elementType]) {
    entry.sources[elementType] = { readers: [], writers: [] };
  }
}

function sortElementTypes(a, b) {
  const aIndex = ELEMENT_TYPE_ORDER.indexOf(a);
  const bIndex = ELEMENT_TYPE_ORDER.indexOf(b);

  if (aIndex === -1 && bIndex === -1) {
    return a.localeCompare(b);
  }

  if (aIndex === -1) {
    return 1;
  }

  if (bIndex === -1) {
    return -1;
  }

  return aIndex - bIndex;
}

/**
 * Find direct correlations between lorebook and regex elements via shared CBS variables.
 * Analyzes data flow direction without Lua as intermediary.
 *
 * @param {Array<import('./constants').ElementCBSData>} lorebookCBS - from collectLorebookCBS()
 * @param {Array<import('./constants').ElementCBSData>} regexCBS - from collectRegexCBS()
 * @returns {{ sharedVars: Array<{varName: string, direction: string, lorebookEntries: string[], regexScripts: string[]}>, lorebookOnlyVars: string[], regexOnlyVars: string[], summary: {totalShared: number, totalLBOnly: number, totalRXOnly: number} }}
 */
function buildLorebookRegexCorrelation(lorebookCBS, regexCBS) {
  // Build var → element name maps for reads/writes per element type
  const lbReads = new Map();   // varName → array of lorebook entry names
  const lbWrites = new Map();  // varName → array of lorebook entry names
  const rxReads = new Map();   // varName → array of regex script names
  const rxWrites = new Map();  // varName → array of regex script names

  for (const element of lorebookCBS) {
    for (const v of element.reads) {
      if (!lbReads.has(v)) lbReads.set(v, []);
      lbReads.get(v).push(element.elementName);
    }
    for (const v of element.writes) {
      if (!lbWrites.has(v)) lbWrites.set(v, []);
      lbWrites.get(v).push(element.elementName);
    }
  }

  for (const element of regexCBS) {
    for (const v of element.reads) {
      if (!rxReads.has(v)) rxReads.set(v, []);
      rxReads.get(v).push(element.elementName);
    }
    for (const v of element.writes) {
      if (!rxWrites.has(v)) rxWrites.set(v, []);
      rxWrites.get(v).push(element.elementName);
    }
  }

  // Find all unique var names in each element type
  const lbVars = new Set([...lbReads.keys(), ...lbWrites.keys()]);
  const rxVars = new Set([...rxReads.keys(), ...rxWrites.keys()]);

  // Shared = appears in both lorebook and regex
  const sharedVarNames = [...lbVars].filter(v => rxVars.has(v));

  const sharedVars = sharedVarNames.map(varName => {
    const lbIsReader = lbReads.has(varName);
    const lbIsWriter = lbWrites.has(varName);
    const rxIsReader = rxReads.has(varName);
    const rxIsWriter = rxWrites.has(varName);

    // Determine direction:
    // lorebook→regex: lorebook writes (produces) and regex reads (consumes)
    // regex→lorebook: regex writes and lorebook reads
    // bidirectional: both sides write or both sides read
    let direction;
    if (lbIsWriter && rxIsReader && !rxIsWriter && !lbIsReader) {
      direction = 'lorebook\u2192regex';
    } else if (rxIsWriter && lbIsReader && !lbIsWriter && !rxIsReader) {
      direction = 'regex\u2192lorebook';
    } else {
      direction = 'bidirectional';
    }

    return {
      varName,
      direction,
      lorebookEntries: [
        ...(lbReads.get(varName) || []),
        ...(lbWrites.get(varName) || [])
      ].filter((v, i, a) => a.indexOf(v) === i),  // unique
      regexScripts: [
        ...(rxReads.get(varName) || []),
        ...(rxWrites.get(varName) || [])
      ].filter((v, i, a) => a.indexOf(v) === i)   // unique
    };
  });

  // Sort: bidirectional first, then lorebook→regex, then regex→lorebook
  sharedVars.sort((a, b) => {
    const order = { 'bidirectional': 0, 'lorebook\u2192regex': 1, 'regex\u2192lorebook': 2 };
    return (order[a.direction] || 0) - (order[b.direction] || 0);
  });

  const lorebookOnlyVars = [...lbVars].filter(v => !rxVars.has(v));
  const regexOnlyVars = [...rxVars].filter(v => !lbVars.has(v));

  return {
    sharedVars,
    lorebookOnlyVars,
    regexOnlyVars,
    summary: {
      totalShared: sharedVars.length,
      totalLBOnly: lorebookOnlyVars.length,
      totalRXOnly: regexOnlyVars.length
    }
  };
}

module.exports = { buildUnifiedCBSGraph, buildLorebookRegexCorrelation };
