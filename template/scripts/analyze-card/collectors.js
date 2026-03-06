'use strict';

const path = require('path');
const fs = require('fs');
const { extractCBSVarOps, buildFolderMap, resolveFolderName } = require('../shared/risu-api');
const { ELEMENT_TYPES } = require('./constants');


/**
 * Collect CBS variable operations from all lorebook entries.
 * Scans both character_book.entries and extensions.risuai._moduleLorebook.
 * 
 * @param {Object} card - Character card object
 * @returns {Array<ElementCBSData>} Array of lorebook CBS data
 */
function collectLorebookCBS(card) {
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
 * Scans script.in, script.out, and script.flag fields for CBS variables.
 * 
 * @param {Object} card - Character card object
 * @returns {Array<ElementCBSData>} Array of regex CBS data
 */
function collectRegexCBS(card) {
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

/**
 * Collect variables from defaultVariables field.
 * Parses key=value pairs (one per line).
 * 
 * @param {Object} card - Character card object
 * @returns {Object} { variables: Object, cbsData: Array }
 */
function collectVariablesCBS(card) {
  const raw = card?.data?.extensions?.risuai?.defaultVariables || '';
  const variables = {};
  
  if (raw.trim()) {
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
  }
  
  return { variables, cbsData: [] };
}

/**
 * Collect CBS variable operations from backgroundHTML.
 * Extracts CBS vars and asset references from HTML string.
 * 
 * @param {Object} card - Character card object
 * @returns {Object} { cbsData: ElementCBSData, assetRefs: string[] }
 */
function collectHTMLCBS(card) {
  const html = card?.data?.extensions?.risuai?.backgroundHTML || '';
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
    elementName: 'background.html',
    reads,
    writes
  };
  
  return { cbsData, assetRefs: [...refs] };
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
  } catch (err) {
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
        
        if (data.stateVars && typeof data.stateVars === 'object') {
          for (const [varName, info] of Object.entries(data.stateVars)) {
            if (info.readBy && info.readBy.length > 0) reads.add(varName);
            if (info.writtenBy && info.writtenBy.length > 0) writes.add(varName);
          }
        }
        
        return [{ elementType: ELEMENT_TYPES.LUA, elementName: baseName, reads, writes }];
      } catch (e) {
        return [];
      }
    });
  } catch (e) {
    return [];
  }
}

module.exports = { collectLorebookCBS, collectRegexCBS, importLuaAnalysis, collectVariablesCBS, collectHTMLCBS, collectTSCBS };
