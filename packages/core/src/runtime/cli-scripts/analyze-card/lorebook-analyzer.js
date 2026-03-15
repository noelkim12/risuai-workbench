'use strict';

const { buildFolderMap, resolveFolderName } = require('../shared/risu-api');

/**
 * Analyze the internal structure of lorebook entries including folders,
 * activation modes, keywords, and CBS variable usage.
 *
 * @param {Object} card - Character card object
 * @returns {{ folders: Array, entries: Array, stats: Object, keywords: Object }}
 */
function analyzeLorebookStructure(card) {
  // Collect all entries from both sources
  const charBookEntries = card?.data?.character_book?.entries || [];
  const moduleEntries = card?.data?.extensions?.risuai?._moduleLorebook || [];
  const allEntries = [...charBookEntries, ...moduleEntries];

  const emptyResult = {
    folders: [],
    entries: [],
    stats: {
      totalEntries: 0,
      totalFolders: 0,
      activationModes: { normal: 0, constant: 0, selective: 0 },
      enabledCount: 0,
      withCBS: 0,
    },
    keywords: { all: [], overlaps: {} },
  };

  if (allEntries.length === 0) {
    return emptyResult;
  }

  // buildFolderMap returns a plain object { key: name }
  const folderMap = buildFolderMap(allEntries);

  // Filter out folder entries — they are metadata, not content
  const regularEntries = allEntries.filter((e) => e.mode !== 'folder');

  // Build folder list from the map
  const folders = Object.entries(folderMap).map(([id, name]) => ({ id, name }));

  // Stats accumulator
  const stats = {
    totalEntries: 0,
    totalFolders: folders.length,
    activationModes: { normal: 0, constant: 0, selective: 0 },
    enabledCount: 0,
    withCBS: 0,
  };

  // keyword → array of entry names that use it
  const keywordMap = new Map();

  const analyzedEntries = regularEntries.map((entry) => {
    stats.totalEntries++;

    // Activation mode
    if (entry.constant) {
      stats.activationModes.constant++;
    } else if (entry.selective) {
      stats.activationModes.selective++;
    } else {
      stats.activationModes.normal++;
    }

    // Enabled status (defaults to true if not explicitly false)
    if (entry.enabled !== false) {
      stats.enabledCount++;
    }

    // CBS variable presence (check for {{getvar::, {{setvar::, {{addvar::)
    const hasCBS = /\{\{(?:getvar|setvar|addvar)::/.test(entry.content || '');
    if (hasCBS) {
      stats.withCBS++;
    }

    // Keywords — field may be `keys` or `key`, may be string or array
    const keys = entry.keys || entry.key || [];
    const keyArray = Array.isArray(keys) ? keys : keys ? [keys] : [];
    const entryName = entry.name || entry.comment || `entry-${entry.id || 'unknown'}`;

    for (const kw of keyArray) {
      if (!kw) continue;
      const normalized = String(kw).trim();
      if (!normalized) continue;
      if (!keywordMap.has(normalized)) keywordMap.set(normalized, []);
      keywordMap.get(normalized).push(entryName);
    }

    // Folder name via risu-api utility
    const folderName = resolveFolderName(entry.folder, folderMap);

    return {
      name: entryName,
      folder: folderName || null,
      keywords: keyArray,
      enabled: entry.enabled !== false,
      constant: !!entry.constant,
      selective: !!entry.selective,
      hasCBS,
    };
  });

  // Keyword analysis: all unique keywords sorted + overlaps (keyword used by 2+ entries)
  const allKeywords = [...keywordMap.keys()].sort();
  const overlaps = {};
  for (const [kw, entries] of keywordMap) {
    if (entries.length > 1) {
      overlaps[kw] = entries;
    }
  }

  return {
    folders,
    entries: analyzedEntries,
    stats,
    keywords: { all: allKeywords, overlaps },
  };
}

module.exports = { analyzeLorebookStructure };
