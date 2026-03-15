import fs from 'node:fs';
import {
  buildRisuFolderMap,
  resolveRisuFolderName,
  extractCBSVarOps,
  parseCardFile,
} from '../../shared';
import { type CollectedData, type LorebookCorrelation, type RegexCorrelation } from './types';

function extractCBSVariables(entries: any[]): Map<string, { readers: Set<string>; writers: Set<string> }> {
  const folderMap = buildRisuFolderMap(entries as any);
  const vars = new Map<string, { readers: Set<string>; writers: Set<string> }>();

  for (const entry of entries) {
    if (entry.mode === 'folder' || !entry.content) continue;
    const folderName = entry.folder
      ? resolveRisuFolderName(entry.folder, folderMap, (ref) => ref)
      : null;
    const entryLabel = folderName ? `${folderName}/${entry.name}` : entry.name;
    const ops = extractCBSVarOps(String(entry.content));

    for (const varName of ops.reads) {
      if (!vars.has(varName)) vars.set(varName, { readers: new Set(), writers: new Set() });
      vars.get(varName)!.readers.add(entryLabel);
    }
    for (const varName of ops.writes) {
      if (!vars.has(varName)) vars.set(varName, { readers: new Set(), writers: new Set() });
      vars.get(varName)!.writers.add(entryLabel);
    }
  }

  return vars;
}

function extractRegexCBSVariables(
  customScripts: any[],
): Map<string, { readers: Set<string>; writers: Set<string> }> {
  const vars = new Map<string, { readers: Set<string>; writers: Set<string> }>();

  for (let i = 0; i < customScripts.length; i += 1) {
    const script = customScripts[i] || {};
    const label = script.comment && String(script.comment).trim() ? String(script.comment).trim() : `#${i}`;
    const fields = [script.in, script.out, script.ableFlag];

    for (const field of fields) {
      if (typeof field !== 'string' || field.length === 0) continue;
      const ops = extractCBSVarOps(field);
      for (const varName of ops.reads) {
        if (!vars.has(varName)) vars.set(varName, { readers: new Set(), writers: new Set() });
        vars.get(varName)!.readers.add(label);
      }
      for (const varName of ops.writes) {
        if (!vars.has(varName)) vars.set(varName, { readers: new Set(), writers: new Set() });
        vars.get(varName)!.writers.add(label);
      }
    }
  }

  return vars;
}

export function buildLorebookCorrelation(params: {
  cardArg: string | null;
  collected: CollectedData;
}): LorebookCorrelation | null {
  const { cardArg, collected } = params;
  if (!cardArg || !collected) return null;
  if (!fs.existsSync(cardArg)) {
    console.error(`  ⚠️  --card 파일을 찾을 수 없습니다: ${cardArg}`);
    return null;
  }

  const card = parseCardFile(cardArg) as any;
  if (!card) return null;

  const entries = card.data?.character_book?.entries || [];
  if (!entries.length) {
    console.log('  ⚠️  --card: lorebook 엔트리가 없습니다.');
    return null;
  }

  const cbsVars = extractCBSVariables(entries);
  const folderMap = buildRisuFolderMap(entries as any);
  const allVarNames = new Set([...collected.stateVars.keys(), ...cbsVars.keys()]);

  const correlations = [...allVarNames]
    .sort()
    .map((varName) => {
      const lua = collected.stateVars.get(varName);
      const cbs = cbsVars.get(varName);

      const entry = {
        varName,
        luaReaders: lua ? [...lua.readBy].filter((n) => n !== '<top-level>') : [],
        luaWriters: lua ? [...lua.writtenBy].filter((n) => n !== '<top-level>') : [],
        lorebookReaders: cbs ? [...cbs.readers] : [],
        lorebookWriters: cbs ? [...cbs.writers] : [],
        luaOnly: Boolean(lua) && !cbs,
        lorebookOnly: !lua && Boolean(cbs),
        direction: 'isolated',
      };

      const hasLuaWrite = entry.luaWriters.length > 0;
      const hasLuaRead = entry.luaReaders.length > 0;
      const hasLbRead = entry.lorebookReaders.length > 0;
      const hasLbWrite = entry.lorebookWriters.length > 0;

      if ((hasLuaWrite || hasLuaRead) && (hasLbRead || hasLbWrite)) {
        if (hasLuaWrite && hasLbRead && !hasLbWrite && !hasLuaRead) {
          entry.direction = 'lua→lorebook';
        } else if (hasLbWrite && hasLuaRead && !hasLuaWrite && !hasLbRead) {
          entry.direction = 'lorebook→lua';
        } else {
          entry.direction = 'bidirectional';
        }
      }

      return entry;
    });

  const entryInfos: LorebookCorrelation['entryInfos'] = [];
  for (const entry of entries) {
    if (entry.mode === 'folder') continue;
    const folderName = entry.folder
      ? resolveRisuFolderName(entry.folder, folderMap, (ref) => ref)
      : null;
    const ops = extractCBSVarOps(entry.content || '');
    const usedVars = new Set([...ops.reads, ...ops.writes]);
    const luaDeps = new Set<string>();

    for (const varName of usedVars) {
      const sv = collected.stateVars.get(varName);
      if (sv) {
        for (const fnName of sv.writtenBy) {
          if (fnName !== '<top-level>') luaDeps.add(fnName);
        }
      }
    }

    if (usedVars.size > 0) {
      entryInfos.push({
        name: entry.name,
        folder: folderName,
        vars: [...usedVars].sort(),
        luaDeps: [...luaDeps].sort(),
      });
    }
  }

  return {
    correlations,
    entryInfos,
    loreApiCalls: collected.loreApiCalls,
    totalEntries: entries.filter((e: any) => e.mode !== 'folder').length,
    totalFolders: entries.filter((e: any) => e.mode === 'folder').length,
    bridgedVars: correlations.filter((c) => c.direction !== 'isolated'),
    luaOnlyVars: correlations.filter((c) => c.luaOnly),
    lorebookOnlyVars: correlations.filter((c) => c.lorebookOnly),
  };
}

export function buildRegexCorrelation(params: {
  cardArg: string | null;
  collected: CollectedData;
}): RegexCorrelation | null {
  const { cardArg, collected } = params;
  if (!cardArg || !collected) return null;
  if (!fs.existsSync(cardArg)) {
    console.error(`  ⚠️  --card 파일을 찾을 수 없습니다: ${cardArg}`);
    return null;
  }

  const card = parseCardFile(cardArg) as any;
  if (!card) return null;

  const scripts = card.data?.extensions?.risuai?.customScripts;
  if (!scripts) {
    console.log('  ⚠️  --card: regex(customScripts) 엔트리가 없습니다.');
    return null;
  }

  const totalScripts = scripts.length;
  const activeScriptsList = scripts.filter((script: any) => script && script.type !== 'disabled');
  const regexVars = extractRegexCBSVariables(activeScriptsList);
  const allVarNames = new Set([...collected.stateVars.keys(), ...regexVars.keys()]);

  const correlations = [...allVarNames]
    .sort()
    .map((varName) => {
      const lua = collected.stateVars.get(varName);
      const regex = regexVars.get(varName);

      const entry = {
        varName,
        luaReaders: lua ? [...lua.readBy].filter((n) => n !== '<top-level>') : [],
        luaWriters: lua ? [...lua.writtenBy].filter((n) => n !== '<top-level>') : [],
        regexReaders: regex ? [...regex.readers] : [],
        regexWriters: regex ? [...regex.writers] : [],
        luaOnly: Boolean(lua) && !regex,
        regexOnly: !lua && Boolean(regex),
        direction: 'isolated',
      };

      const hasLuaWrite = entry.luaWriters.length > 0;
      const hasLuaRead = entry.luaReaders.length > 0;
      const hasRegexRead = entry.regexReaders.length > 0;
      const hasRegexWrite = entry.regexWriters.length > 0;

      if ((hasLuaWrite || hasLuaRead) && (hasRegexRead || hasRegexWrite)) {
        if (hasLuaWrite && hasRegexRead && !hasRegexWrite && !hasLuaRead) {
          entry.direction = 'lua→regex';
        } else if (hasRegexWrite && hasLuaRead && !hasLuaWrite && !hasRegexRead) {
          entry.direction = 'regex→lua';
        } else {
          entry.direction = 'bidirectional';
        }
      }

      return entry;
    });

  const scriptInfos: RegexCorrelation['scriptInfos'] = [];
  for (let i = 0; i < activeScriptsList.length; i += 1) {
    const script = activeScriptsList[i] || {};
    const usedVars = new Set<string>();
    const fields = [script.in, script.out, script.ableFlag];
    const comment = script.comment && String(script.comment).trim() ? String(script.comment).trim() : `#${i}`;

    for (const field of fields) {
      if (typeof field !== 'string' || field.length === 0) continue;
      const ops = extractCBSVarOps(field);
      for (const key of ops.reads) usedVars.add(key);
      for (const key of ops.writes) usedVars.add(key);
    }

    const luaDeps = new Set<string>();
    for (const varName of usedVars) {
      const sv = collected.stateVars.get(varName);
      if (sv) {
        for (const fnName of sv.writtenBy) {
          if (fnName !== '<top-level>') luaDeps.add(fnName);
        }
      }
    }

    if (usedVars.size > 0) {
      scriptInfos.push({
        comment,
        type: script.type || 'unknown',
        inPattern: typeof script.in === 'string' ? script.in : '',
        vars: [...usedVars].sort(),
        luaDeps: [...luaDeps].sort(),
      });
    }
  }

  return {
    correlations,
    scriptInfos,
    totalScripts,
    activeScripts: activeScriptsList.length,
    bridgedVars: correlations.filter((c) => c.direction !== 'isolated'),
    luaOnlyVars: correlations.filter((c) => c.luaOnly),
    regexOnlyVars: correlations.filter((c) => c.regexOnly),
  };
}
