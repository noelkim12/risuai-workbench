'use strict';

const path = require('path');
const fs = require('fs');
const { extractCBSVarOps, buildFolderMap, resolveFolderName } = require('../shared/risu-api');
const { ELEMENT_TYPES } = require('./constants');

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function dirExists(dirPath) {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function readTextIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function listJsonFilesRecursive(rootDir) {
  if (!dirExists(rootDir)) return [];

  const out = [];
  function walk(curDir) {
    const entries = fs.readdirSync(curDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const e of entries) {
      const full = path.join(curDir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }

      if (!e.isFile()) continue;
      const lower = e.name.toLowerCase();
      if (!lower.endsWith('.json')) continue;
      if (e.name === '_order.json') continue;
      if (e.name === 'manifest.json') continue;
      out.push(full);
    }
  }

  walk(rootDir);
  out.sort((a, b) => toPosix(path.relative(rootDir, a)).localeCompare(toPosix(path.relative(rootDir, b))));
  return out;
}

function resolveOrderedFiles(dir, files) {
  const orderPath = path.join(dir, '_order.json');
  const manifest = readJsonIfExists(orderPath);
  if (!Array.isArray(manifest) || manifest.length === 0) return files;

  const fileMap = new Map();
  for (const f of files) {
    const rel = toPosix(path.relative(dir, f));
    fileMap.set(rel, f);
  }

  const ordered = [];

  for (const relRaw of manifest) {
    if (typeof relRaw !== 'string' || relRaw.length === 0) continue;
    const rel = toPosix(relRaw);

    if (fileMap.has(rel)) {
      ordered.push(fileMap.get(rel));
      fileMap.delete(rel);
      continue;
    }

    // regex/_order.json may store basenames rather than relative paths
    const baseOnly = rel.split('/').pop();
    if (baseOnly && fileMap.has(baseOnly)) {
      ordered.push(fileMap.get(baseOnly));
      fileMap.delete(baseOnly);
    }
  }

  if (fileMap.size > 0) {
    const orphans = [...fileMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, abs] of orphans) {
      ordered.push(abs);
    }
  }

  return ordered;
}

function stripJsonExt(fileName) {
  return fileName.toLowerCase().endsWith('.json') ? fileName.slice(0, -5) : fileName;
}

function getStringField(obj, key) {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj[key] === 'string') return obj[key];
  if (obj.data && typeof obj.data === 'object' && typeof obj.data[key] === 'string') return obj.data[key];
  return '';
}

/**
 * Collect CBS variable operations from all lorebook entries.
 *
 * Folder-first behavior:
 * - If <outputDir>/lorebooks exists, it reads lorebook JSON files (respects lorebooks/_order.json).
 * - Otherwise it falls back to card.data.character_book and card.data.extensions.risuai._moduleLorebook.
 *
 * @param {Object} card - Character card object
 * @param {string} [outputDir] - Extracted output directory
 * @returns {Array<ElementCBSData>} Array of lorebook CBS data
 */
function collectLorebookCBS(card, outputDir) {
  if (outputDir) {
    const lorebooksDir = path.join(outputDir, 'lorebooks');
    if (dirExists(lorebooksDir)) {
      return collectLorebookCBSFromDir(lorebooksDir);
    }
  }

  return collectLorebookCBSFromCard(card);
}

function collectLorebookCBSFromDir(lorebooksDir) {
  const manifestPath = path.join(lorebooksDir, 'manifest.json');
  const manifest = readJsonIfExists(manifestPath);
  if (isPlainObject(manifest) && Array.isArray(manifest.entries)) {
    return collectLorebookCBSFromManifest(lorebooksDir, manifest.entries);
  }

  const files = resolveOrderedFiles(lorebooksDir, listJsonFilesRecursive(lorebooksDir));
  if (files.length === 0) return [];

  const results = [];

  for (const filePath of files) {
    const relPosix = toPosix(path.relative(lorebooksDir, filePath));
    pushLorebookCBSFromFile(results, filePath, relPosix, null);
  }

  return results;
}

function collectLorebookCBSFromManifest(lorebooksDir, manifestEntries) {
  const files = listJsonFilesRecursive(lorebooksDir);
  const fileMap = new Map();
  for (const filePath of files) {
    const rel = toPosix(path.relative(lorebooksDir, filePath));
    fileMap.set(rel, filePath);
  }

  const usedFiles = new Set();
  const results = [];

  for (const rec of manifestEntries) {
    if (!isPlainObject(rec)) continue;
    if (rec.type !== 'entry' || typeof rec.path !== 'string' || rec.path.length === 0) continue;

    const rel = toPosix(rec.path);
    const filePath = fileMap.get(rel);
    if (!filePath) continue;

    usedFiles.add(rel);
    pushLorebookCBSFromFile(results, filePath, rel, rec.source === 'module' ? 'module' : null);
  }

  const orphans = [...fileMap.keys()]
    .filter((rel) => !usedFiles.has(rel))
    .sort((a, b) => a.localeCompare(b));
  for (const rel of orphans) {
    pushLorebookCBSFromFile(results, fileMap.get(rel), rel, null);
  }

  return results;
}

function pushLorebookCBSFromFile(results, filePath, relPosix, source) {
  const raw = readJsonIfExists(filePath);
  if (!raw) return;

  const baseName = stripJsonExt(relPosix);
  const entries = Array.isArray(raw) ? raw : [raw];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object') continue;

    const mode = entry.mode || (entry.data && entry.data.mode);
    if (mode === 'folder') continue;

    const content = getStringField(entry, 'content');
    const { reads, writes } = extractCBSVarOps(content || '');
    if (reads.size === 0 && writes.size === 0) continue;

    const leafName = entries.length > 1 ? `${baseName}#${i}` : baseName;
    const elementName = source === 'module' ? `[module]/${leafName}` : leafName;
    results.push({ elementType: ELEMENT_TYPES.LOREBOOK, elementName, reads, writes });
  }
}

function collectLorebookCBSFromCard(card) {
  if (!card || !card.data) {
    return [];
  }

  const results = [];

  // Process character_book entries
  const charBookEntries = card.data.character_book?.entries || [];
  if (charBookEntries.length > 0) {
    const folderMap = buildFolderMap(charBookEntries);

    for (const entry of charBookEntries) {
      // Skip folder entries
      if (entry.mode === 'folder') {
        continue;
      }

      // Extract CBS operations from entry content
      const { reads, writes } = extractCBSVarOps(entry.content || '');

      // Skip entries with no CBS operations
      if (reads.size === 0 && writes.size === 0) {
        continue;
      }

      // Build element name with folder prefix if applicable
      const folderName = resolveFolderName(entry.folder, folderMap);
      const entryName = entry.name || entry.comment || 'unnamed';
      const elementName = folderName ? `${folderName}/${entryName}` : entryName;

      results.push({
        elementType: ELEMENT_TYPES.LOREBOOK,
        elementName,
        reads,
        writes
      });
    }
  }

  // Process module lorebook entries
  const moduleEntries = card.data.extensions?.risuai?._moduleLorebook || [];
  if (moduleEntries.length > 0) {
    const folderMap = buildFolderMap(moduleEntries);

    for (const entry of moduleEntries) {
      // Skip folder entries
      if (entry.mode === 'folder') {
        continue;
      }

      // Extract CBS operations from entry content
      const { reads, writes } = extractCBSVarOps(entry.content || '');

      // Skip entries with no CBS operations
      if (reads.size === 0 && writes.size === 0) {
        continue;
      }

      // Build element name with [module] prefix and folder if applicable
      const folderName = resolveFolderName(entry.folder, folderMap);
      const entryName = entry.name || entry.comment || 'unnamed';
      const baseName = folderName ? `${folderName}/${entryName}` : entryName;
      const elementName = `[module]/${baseName}`;

      results.push({
        elementType: ELEMENT_TYPES.LOREBOOK,
        elementName,
        reads,
        writes
      });
    }
  }

  return results;
}

/**
 * Collect CBS variable operations from regex (customScript) scripts.
 *
 * Folder-first behavior:
 * - If <outputDir>/regex exists, it reads regex JSON files (respects regex/_order.json).
 * - Otherwise it falls back to card.data.extensions.risuai.customScripts.
 *
 * @param {Object} card - Character card object
 * @param {string} [outputDir] - Extracted output directory
 * @returns {Array<ElementCBSData>} Array of regex CBS data
 */
function collectRegexCBS(card, outputDir) {
  if (outputDir) {
    const regexDir = path.join(outputDir, 'regex');
    if (dirExists(regexDir)) {
      return collectRegexCBSFromDir(regexDir);
    }
  }

  return collectRegexCBSFromCard(card);
}

function collectRegexCBSFromDir(regexDir) {
  const files = resolveOrderedFiles(regexDir, listJsonFilesRecursive(regexDir));
  if (files.length === 0) return [];

  const results = [];

  for (const filePath of files) {
    const raw = readJsonIfExists(filePath);
    if (!raw || typeof raw !== 'object') continue;

    const elementName = path.basename(filePath, '.json');

    const inText = getStringField(raw, 'in');
    const outText = getStringField(raw, 'out');
    const flagText = getStringField(raw, 'flag');

    const inOps = extractCBSVarOps(inText || '');
    const outOps = extractCBSVarOps(outText || '');
    const flagOps = extractCBSVarOps(flagText || '');

    let reads = new Set([...inOps.reads, ...outOps.reads, ...flagOps.reads]);
    let writes = new Set([...inOps.writes, ...outOps.writes, ...flagOps.writes]);

    // Fallback: some scripts may store the payload in a single field
    if (reads.size === 0 && writes.size === 0) {
      const alt = getStringField(raw, 'script') || getStringField(raw, 'content');
      const altOps = extractCBSVarOps(alt || '');
      reads = altOps.reads;
      writes = altOps.writes;
    }

    if (reads.size === 0 && writes.size === 0) continue;

    results.push({ elementType: ELEMENT_TYPES.REGEX, elementName, reads, writes });
  }

  return results;
}

function collectRegexCBSFromCard(card) {
  if (!card || !card.data) {
    return [];
  }

  const results = [];
  const scripts = card.data.extensions?.risuai?.customScripts || [];

  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];

    // Collect CBS operations from all three fields
    const inOps = extractCBSVarOps(script.in || '');
    const outOps = extractCBSVarOps(script.out || '');
    const flagOps = extractCBSVarOps(script.flag || '');

    // Merge reads and writes from all fields
    const reads = new Set([...inOps.reads, ...outOps.reads, ...flagOps.reads]);
    const writes = new Set([...inOps.writes, ...outOps.writes, ...flagOps.writes]);

    // Skip scripts with no CBS operations
    if (reads.size === 0 && writes.size === 0) {
      continue;
    }

    // Build element name from comment, name, or index
    const elementName = script.comment || script.name || `unnamed-script-${i}`;

    results.push({
      elementType: ELEMENT_TYPES.REGEX,
      elementName,
      reads,
      writes
    });
  }

  return results;
}

function parseDefaultVariablesText(raw) {
  const variables = {};
  if (typeof raw !== 'string' || !raw.trim()) return variables;

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      variables[line] = '';
    } else {
      const key = line.slice(0, eqIdx);
      const val = line.slice(eqIdx + 1);
      variables[key] = val;
    }
  }

  return variables;
}

function parseDefaultVariablesJson(raw) {
  const variables = {};
  if (!raw) return variables;

  if (isPlainObject(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      variables[String(k)] = typeof v === 'string' ? v : String(v);
    }
    return variables;
  }

  if (Array.isArray(raw)) {
    for (const rec of raw) {
      if (!rec || typeof rec !== 'object') continue;
      const key = typeof rec.key === 'string' ? rec.key : (typeof rec.name === 'string' ? rec.name : '');
      if (!key) continue;
      const val = typeof rec.value === 'string' ? rec.value : (rec.value == null ? '' : String(rec.value));
      variables[key] = val;
    }
  }

  return variables;
}

/**
 * Collect variables from defaultVariables.
 *
 * Folder-first behavior:
 * - If <outputDir>/variables/default.json exists, it reads that.
 * - Otherwise it falls back to card.data.extensions.risuai.defaultVariables (key=value lines).
 *
 * @param {Object} card - Character card object
 * @param {string} [outputDir] - Extracted output directory
 * @returns {Object} { variables: Object, cbsData: Array }
 */
function collectVariablesCBS(card, outputDir) {
  if (outputDir) {
    const jsonPath = path.join(outputDir, 'variables', 'default.json');
    const rawJson = readJsonIfExists(jsonPath);
    if (rawJson) {
      return { variables: parseDefaultVariablesJson(rawJson), cbsData: [] };
    }

    const txtPath = path.join(outputDir, 'variables', 'default.txt');
    const rawText = readTextIfExists(txtPath);
    if (rawText && rawText.trim()) {
      return { variables: parseDefaultVariablesText(rawText), cbsData: [] };
    }
  }

  const raw = card?.data?.extensions?.risuai?.defaultVariables || '';
  return { variables: parseDefaultVariablesText(raw), cbsData: [] };
}

function collectHTMLCBSFromString(html, elementName) {
  const assetRefs = [];

  if (!html) {
    return { cbsData: null, assetRefs: [] };
  }

  // Extract CBS operations
  const { reads, writes } = extractCBSVarOps(html);

  // Extract asset references
  const srcMatches = html.matchAll(/src=["']([^"']+)["']/g);
  const urlMatches = html.matchAll(/url\(["']?([^"')]+)["']?\)/g);

  const refs = new Set();
  for (const m of srcMatches) {
    if (m[1]) refs.add(m[1]);
  }
  for (const m of urlMatches) {
    if (m[1]) refs.add(m[1]);
  }

  const cbsData = {
    elementType: ELEMENT_TYPES.HTML,
    elementName,
    reads,
    writes
  };

  return { cbsData, assetRefs: [...refs] };
}

/**
 * Collect CBS variable operations from backgroundHTML.
 *
 * Folder-first behavior:
 * - If <outputDir>/html/background.html exists, it reads that.
 * - Otherwise it falls back to card.data.extensions.risuai.backgroundHTML.
 *
 * @param {Object} card - Character card object
 * @param {string} [outputDir] - Extracted output directory
 * @returns {Object} { cbsData: ElementCBSData, assetRefs: string[] }
 */
function collectHTMLCBS(card, outputDir) {
  if (outputDir) {
    const htmlPath = path.join(outputDir, 'html', 'background.html');
    const html = readTextIfExists(htmlPath);
    if (html) {
      return collectHTMLCBSFromString(html, 'background.html');
    }
  }

  const html = card?.data?.extensions?.risuai?.backgroundHTML || '';
  return collectHTMLCBSFromString(html, 'background.html');
}

/**
 * Collect CBS variable operations from TypeScript files in tstl/ directory.
 * Scans for vars.set/get, setChatVar/getChatVar, setState/getState patterns.
 *
 * @param {string} outputDir - Output directory path
 * @returns {Array<ElementCBSData>} Array of TS file CBS data
 */
function collectTSCBS(outputDir) {
  try {
    // Find tstl directory
    let tstlDir = path.join(outputDir, '..', 'tstl');
    if (!fs.existsSync(tstlDir)) {
      tstlDir = path.join(outputDir, 'tstl');
    }
    if (!fs.existsSync(tstlDir)) {
      return [];
    }

    const results = [];
    const files = fs.readdirSync(tstlDir).filter(f => f.endsWith('.ts'));

    for (const fileName of files) {
      const filePath = path.join(tstlDir, fileName);
      const content = fs.readFileSync(filePath, 'utf-8');

      const reads = new Set();
      const writes = new Set();

      // vars.set(id, 'varName', ...)
      for (const m of content.matchAll(/vars\.set\(\w+,\s*["']([^"']+)["']/g)) {
        writes.add(m[1]);
      }

      // vars.get(id, 'varName', ...)
      for (const m of content.matchAll(/vars\.get\(\w+,\s*["']([^"']+)["']/g)) {
        reads.add(m[1]);
      }

      // setChatVar(id, 'varName', ...)
      for (const m of content.matchAll(/setChatVar\(\w+,\s*["']([^"']+)["']/g)) {
        writes.add(m[1]);
      }

      // getChatVar(id, 'varName', ...)
      for (const m of content.matchAll(/getChatVar\(\w+,\s*["']([^"']+)["']/g)) {
        reads.add(m[1]);
      }

      // setState(id, 'varName', ...)
      for (const m of content.matchAll(/setState\(\w+,\s*["']([^"']+)["']/g)) {
        writes.add(m[1]);
      }

      // getState(id, 'varName', ...)
      for (const m of content.matchAll(/getState\(\w+,\s*["']([^"']+)["']/g)) {
        reads.add(m[1]);
      }

      // Skip files with no CBS operations
      if (reads.size === 0 && writes.size === 0) {
        continue;
      }

      results.push({
        elementType: ELEMENT_TYPES.TYPESCRIPT,
        elementName: fileName,
        reads,
        writes
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Import Lua analysis data from .analysis.json files.
 * Reads JSON files produced by analyze.js --json and converts them to ElementCBSData objects.
 *
 * @param {string} outputDir - Directory containing lua/ subdirectory with .analysis.json files
 * @returns {Array<ElementCBSData>} Array of lua CBS data
 */
function importLuaAnalysis(outputDir) {
  try {
    const luaDir = path.join(outputDir, 'lua');
    if (!fs.existsSync(luaDir)) return [];

    const jsonFiles = fs.readdirSync(luaDir)
      .filter(f => f.endsWith('.analysis.json'));

    if (jsonFiles.length === 0) return [];

    return jsonFiles.flatMap(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(luaDir, file), 'utf8'));
        const baseName = path.basename(file, '.analysis.json');

        // stateVars: { varName: { readBy: string[], writtenBy: string[], ... } }
        const reads = new Set();
        const writes = new Set();
        const readersByVar = {};
        const writersByVar = {};

        if (data.stateVars && typeof data.stateVars === 'object') {
          for (const [varName, info] of Object.entries(data.stateVars)) {
            if (info.readBy && info.readBy.length > 0) {
              reads.add(varName);
              const owners = info.readBy.filter(s => typeof s === 'string' && s.length > 0);
              if (owners.length > 0) readersByVar[varName] = owners;
            }
            if (info.writtenBy && info.writtenBy.length > 0) {
              writes.add(varName);
              const owners = info.writtenBy.filter(s => typeof s === 'string' && s.length > 0);
              if (owners.length > 0) writersByVar[varName] = owners;
            }
          }
        }

        return [{ elementType: ELEMENT_TYPES.LUA, elementName: baseName, reads, writes, readersByVar, writersByVar }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

module.exports = {
  collectLorebookCBS,
  collectRegexCBS,
  importLuaAnalysis,
  collectVariablesCBS,
  collectHTMLCBS,
  collectTSCBS
};
