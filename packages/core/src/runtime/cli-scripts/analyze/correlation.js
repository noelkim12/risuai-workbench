const fs = require("fs");
const path = require("path");
const {
  parsePngTextChunks,
  decodeCharacterJsonFromChunks,
  buildFolderMap,
  resolveFolderName,
  extractCBSVarOps,
  parseCardFile,
} = require("../shared/risu-api");



function buildLorebookFolderMap(entries) {
  return buildFolderMap(entries, { fallbackName: "unnamed" });
}

function extractCBSVariables(entries) {
  const folderMap = buildLorebookFolderMap(entries);
  const vars = new Map();

  for (const entry of entries) {
    if (entry.mode === "folder" || !entry.content) continue;
    const folderName = entry.folder ? resolveFolderName(entry.folder, folderMap, () => null) : null;
    const entryLabel = folderName ? `${folderName}/${entry.name}` : entry.name;
    const ops = extractCBSVarOps(entry.content);
    for (const v of ops.reads) {
      if (!vars.has(v)) vars.set(v, { readers: new Set(), writers: new Set() });
      vars.get(v).readers.add(entryLabel);
    }
    for (const v of ops.writes) {
      if (!vars.has(v)) vars.set(v, { readers: new Set(), writers: new Set() });
      vars.get(v).writers.add(entryLabel);
    }
  }

  return vars;
}

function extractRegexCBSVariables(customScripts) {
  const vars = new Map();

  for (let i = 0; i < customScripts.length; i++) {
    const script = customScripts[i] || {};
    const label = script.comment && script.comment.trim() ? script.comment.trim() : `#${i}`;
    const fields = [script.in, script.out, script.ableFlag];

    for (const field of fields) {
      if (typeof field !== "string" || field.length === 0) continue;
      const ops = extractCBSVarOps(field);
      for (const v of ops.reads) {
        if (!vars.has(v)) vars.set(v, { readers: new Set(), writers: new Set() });
        vars.get(v).readers.add(label);
      }
      for (const v of ops.writes) {
        if (!vars.has(v)) vars.set(v, { readers: new Set(), writers: new Set() });
        vars.get(v).writers.add(label);
      }
    }
  }

  return vars;
}

function buildLorebookCorrelation(params) {
  const cardArg = params && params.cardArg ? params.cardArg : null;
  const collected = params && params.collected ? params.collected : null;
  if (!cardArg || !collected) return null;
  if (!fs.existsSync(cardArg)) {
    console.error(`  ⚠️  --card 파일을 찾을 수 없습니다: ${cardArg}`);
    return null;
  }

  const card = parseCardFile(cardArg);
  if (!card) return null;

  const entries = card.data?.character_book?.entries || [];
  if (!entries.length) {
    console.log("  ⚠️  --card: lorebook 엔트리가 없습니다.");
    return null;
  }

  const cbsVars = extractCBSVariables(entries);
  const folderMap = buildLorebookFolderMap(entries);
  const allVarNames = new Set([...collected.stateVars.keys(), ...cbsVars.keys()]);
  const correlations = [];

  for (const varName of [...allVarNames].sort()) {
    const lua = collected.stateVars.get(varName);
    const cbs = cbsVars.get(varName);

    const entry = {
      varName,
      luaReaders: lua ? [...lua.readBy].filter((n) => n !== "<top-level>") : [],
      luaWriters: lua ? [...lua.writtenBy].filter((n) => n !== "<top-level>") : [],
      lorebookReaders: cbs ? [...cbs.readers] : [],
      lorebookWriters: cbs ? [...cbs.writers] : [],
      luaOnly: Boolean(lua) && !cbs,
      lorebookOnly: !lua && Boolean(cbs),
    };

    const hasLuaWrite = entry.luaWriters.length > 0;
    const hasLuaRead = entry.luaReaders.length > 0;
    const hasLbRead = entry.lorebookReaders.length > 0;
    const hasLbWrite = entry.lorebookWriters.length > 0;

    if ((hasLuaWrite || hasLuaRead) && (hasLbRead || hasLbWrite)) {
      entry.direction = hasLuaWrite && hasLbRead && !hasLbWrite && !hasLuaRead ? "lua→lorebook" : hasLbWrite && hasLuaRead && !hasLuaWrite && !hasLbRead ? "lorebook→lua" : "bidirectional";
    } else {
      entry.direction = "isolated";
    }

    correlations.push(entry);
  }

  const entryInfos = [];
  for (const e of entries) {
    if (e.mode === "folder") continue;
    const folderName = e.folder ? resolveFolderName(e.folder, folderMap, () => null) : null;
    const ops = extractCBSVarOps(e.content || "");
    const usedVars = new Set([...ops.reads, ...ops.writes]);
    const luaDeps = new Set();
    for (const v of usedVars) {
      const sv = collected.stateVars.get(v);
      if (sv) for (const fn of sv.writtenBy) if (fn !== "<top-level>") luaDeps.add(fn);
    }
    if (usedVars.size > 0) {
      entryInfos.push({
        name: e.name,
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
    totalEntries: entries.filter((e) => e.mode !== "folder").length,
    totalFolders: entries.filter((e) => e.mode === "folder").length,
    bridgedVars: correlations.filter((c) => c.direction !== "isolated"),
    luaOnlyVars: correlations.filter((c) => c.luaOnly),
    lorebookOnlyVars: correlations.filter((c) => c.lorebookOnly),
  };
}

function buildRegexCorrelation(params) {
  const cardArg = params && params.cardArg ? params.cardArg : null;
  const collected = params && params.collected ? params.collected : null;
  if (!cardArg || !collected) return null;
  if (!fs.existsSync(cardArg)) {
    console.error(`  ⚠️  --card 파일을 찾을 수 없습니다: ${cardArg}`);
    return null;
  }

  const card = parseCardFile(cardArg);
  if (!card) return null;

  const scripts = card.data?.extensions?.risuai?.customScripts;
  if (!scripts) {
    console.log("  ⚠️  --card: regex(customScripts) 엔트리가 없습니다.");
    return null;
  }

  const totalScripts = scripts.length;
  const activeScriptsList = scripts.filter((s) => s && s.type !== "disabled");
  const regexVars = extractRegexCBSVariables(activeScriptsList);
  const allVarNames = new Set([...collected.stateVars.keys(), ...regexVars.keys()]);
  const correlations = [];

  for (const varName of [...allVarNames].sort()) {
    const lua = collected.stateVars.get(varName);
    const regex = regexVars.get(varName);

    const entry = {
      varName,
      luaReaders: lua ? [...lua.readBy].filter((n) => n !== "<top-level>") : [],
      luaWriters: lua ? [...lua.writtenBy].filter((n) => n !== "<top-level>") : [],
      regexReaders: regex ? [...regex.readers] : [],
      regexWriters: regex ? [...regex.writers] : [],
      luaOnly: Boolean(lua) && !regex,
      regexOnly: !lua && Boolean(regex),
    };

    const hasLuaWrite = entry.luaWriters.length > 0;
    const hasLuaRead = entry.luaReaders.length > 0;
    const hasRegexRead = entry.regexReaders.length > 0;
    const hasRegexWrite = entry.regexWriters.length > 0;

    if ((hasLuaWrite || hasLuaRead) && (hasRegexRead || hasRegexWrite)) {
      entry.direction = hasLuaWrite && hasRegexRead && !hasRegexWrite && !hasLuaRead ? "lua→regex" : hasRegexWrite && hasLuaRead && !hasLuaWrite && !hasRegexRead ? "regex→lua" : "bidirectional";
    } else {
      entry.direction = "isolated";
    }

    correlations.push(entry);
  }

  const scriptInfos = [];
  for (let i = 0; i < activeScriptsList.length; i++) {
    const script = activeScriptsList[i] || {};
    const usedVars = new Set();
    const fields = [script.in, script.out, script.ableFlag];
    const comment = script.comment && script.comment.trim() ? script.comment.trim() : `#${i}`;

    for (const field of fields) {
      if (typeof field !== "string" || field.length === 0) continue;
      const ops = extractCBSVarOps(field);
      for (const key of ops.reads) usedVars.add(key);
      for (const key of ops.writes) usedVars.add(key);
    }

    const luaDeps = new Set();
    for (const v of usedVars) {
      const sv = collected.stateVars.get(v);
      if (sv) for (const fn of sv.writtenBy) if (fn !== "<top-level>") luaDeps.add(fn);
    }

    if (usedVars.size > 0) {
      scriptInfos.push({
        comment,
        type: script.type || "unknown",
        inPattern: typeof script.in === "string" ? script.in : "",
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
    bridgedVars: correlations.filter((c) => c.direction !== "isolated"),
    luaOnlyVars: correlations.filter((c) => c.luaOnly),
    regexOnlyVars: correlations.filter((c) => c.regexOnly),
  };
}

module.exports = {
  buildLorebookCorrelation,
  buildRegexCorrelation,
};
