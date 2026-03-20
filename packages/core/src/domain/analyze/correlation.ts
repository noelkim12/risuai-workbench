import { ELEMENT_TYPES, MAX_VARS_IN_REPORT, type ElementType } from './constants';
import { extractCBSVarOps } from '../card/cbs';
import { buildFolderMap as buildRisuFolderMap, resolveFolderName as resolveRisuFolderName } from '../lorebook/folders';
import { type CollectedData, type LorebookCorrelation, type RegexCorrelation } from './lua-analysis-types';

const ELEMENT_TYPE_ORDER = Object.values(ELEMENT_TYPES);

export interface ElementCBSData {
  elementType: ElementType | string;
  elementName: string;
  reads: Set<string>;
  writes: Set<string>;
  readersByVar?: Record<string, string[]>;
  writersByVar?: Record<string, string[]>;
}

interface ElementSource {
  readers: string[];
  writers: string[];
}

export interface UnifiedVarEntry {
  varName: string;
  sources: Record<string, ElementSource>;
  defaultValue: string | null;
  elementCount: number;
  direction: 'isolated' | 'bridged';
  crossElementWriters: string[];
  crossElementReaders: string[];
}

export interface LorebookRegexSharedVar {
  varName: string;
  direction: 'lorebook->regex' | 'regex->lorebook' | 'bidirectional';
  lorebookEntries: string[];
  regexScripts: string[];
}

export interface LorebookRegexCorrelation {
  sharedVars: LorebookRegexSharedVar[];
  lorebookOnlyVars: string[];
  regexOnlyVars: string[];
  summary: {
    totalShared: number;
    totalLBOnly: number;
    totalRXOnly: number;
  };
}

export function buildUnifiedCBSGraph(
  allCollected: ElementCBSData[] | null | undefined,
  defaultVariables: Record<string, unknown> | null | undefined,
): Map<string, UnifiedVarEntry> {
  const graph = new Map<string, UnifiedVarEntry>();

  for (const element of allCollected || []) {
    if (!element) continue;
    const { elementType, elementName, reads, writes, readersByVar, writersByVar } =
      element;

    for (const varName of reads || []) {
      ensureEntry(graph, varName);
      const entry = graph.get(varName)!;
      ensureSource(entry, elementType);
      const labels =
        readersByVar &&
        Array.isArray(readersByVar[varName]) &&
        readersByVar[varName].length > 0
          ? readersByVar[varName]
          : [elementName];

      for (const label of labels) {
        if (!entry.sources[elementType].readers.includes(label)) {
          entry.sources[elementType].readers.push(label);
        }
      }
    }

    for (const varName of writes || []) {
      ensureEntry(graph, varName);
      const entry = graph.get(varName)!;
      ensureSource(entry, elementType);
      const labels =
        writersByVar &&
        Array.isArray(writersByVar[varName]) &&
        writersByVar[varName].length > 0
          ? writersByVar[varName]
          : [elementName];

      for (const label of labels) {
        if (!entry.sources[elementType].writers.includes(label)) {
          entry.sources[elementType].writers.push(label);
        }
      }
    }
  }

  const defaults = defaultVariables || {};
  for (const [varName, entry] of graph.entries()) {
    entry.defaultValue =
      defaults[varName] !== undefined ? String(defaults[varName]) : null;

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

export function buildLorebookRegexCorrelation(
  lorebookCBS: ElementCBSData[] | null | undefined,
  regexCBS: ElementCBSData[] | null | undefined,
): LorebookRegexCorrelation {
  const lbReads = new Map<string, string[]>();
  const lbWrites = new Map<string, string[]>();
  const rxReads = new Map<string, string[]>();
  const rxWrites = new Map<string, string[]>();

  for (const element of lorebookCBS || []) {
    for (const varName of element.reads || []) {
      pushToMap(lbReads, varName, element.elementName);
    }
    for (const varName of element.writes || []) {
      pushToMap(lbWrites, varName, element.elementName);
    }
  }

  for (const element of regexCBS || []) {
    for (const varName of element.reads || []) {
      pushToMap(rxReads, varName, element.elementName);
    }
    for (const varName of element.writes || []) {
      pushToMap(rxWrites, varName, element.elementName);
    }
  }

  const lbVars = new Set<string>([...lbReads.keys(), ...lbWrites.keys()]);
  const rxVars = new Set<string>([...rxReads.keys(), ...rxWrites.keys()]);

  const sharedVars = [...lbVars]
    .filter((varName) => rxVars.has(varName))
    .map((varName) => {
      const lbIsReader = lbReads.has(varName);
      const lbIsWriter = lbWrites.has(varName);
      const rxIsReader = rxReads.has(varName);
      const rxIsWriter = rxWrites.has(varName);

      let direction: LorebookRegexSharedVar['direction'];
      if (lbIsWriter && rxIsReader && !rxIsWriter && !lbIsReader) {
        direction = 'lorebook->regex';
      } else if (rxIsWriter && lbIsReader && !lbIsWriter && !rxIsReader) {
        direction = 'regex->lorebook';
      } else {
        direction = 'bidirectional';
      }

      return {
        varName,
        direction,
        lorebookEntries: unique([
          ...(lbReads.get(varName) || []),
          ...(lbWrites.get(varName) || []),
        ]),
        regexScripts: unique([
          ...(rxReads.get(varName) || []),
          ...(rxWrites.get(varName) || []),
        ]),
      };
    })
    .sort((a, b) => sortCorrelationDirection(a.direction, b.direction));

  const lorebookOnlyVars = [...lbVars].filter((varName) => !rxVars.has(varName));
  const regexOnlyVars = [...rxVars].filter((varName) => !lbVars.has(varName));

  return {
    sharedVars,
    lorebookOnlyVars,
    regexOnlyVars,
    summary: {
      totalShared: sharedVars.length,
      totalLBOnly: lorebookOnlyVars.length,
      totalRXOnly: regexOnlyVars.length,
    },
  };
}

export function extractLorebookCBSVariables(
  entries: any[],
): Map<string, { readers: Set<string>; writers: Set<string> }> {
  const folderMap = buildRisuFolderMap(entries as any);
  const vars = new Map<string, { readers: Set<string>; writers: Set<string> }>();

  for (const entry of entries) {
    if (entry.mode === 'folder' || !entry.content) continue;
    const folderName = entry.folder ? resolveRisuFolderName(entry.folder, folderMap, (ref) => ref) : null;
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

export function extractRegexCBSVariables(
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

export function buildLorebookCorrelationFromEntries(params: {
  entries: any[];
  collected: CollectedData;
}): LorebookCorrelation {
  const { entries, collected } = params;
  const cbsVars = extractLorebookCBSVariables(entries);
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
    const folderName = entry.folder ? resolveRisuFolderName(entry.folder, folderMap, (ref) => ref) : null;
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

export function buildRegexCorrelationFromScripts(params: {
  scripts: any[];
  collected: CollectedData;
  totalScripts?: number;
}): RegexCorrelation {
  const { scripts, collected, totalScripts } = params;
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
    totalScripts: typeof totalScripts === 'number' ? totalScripts : scripts.length,
    activeScripts: activeScriptsList.length,
    bridgedVars: correlations.filter((c) => c.direction !== 'isolated'),
    luaOnlyVars: correlations.filter((c) => c.luaOnly),
    regexOnlyVars: correlations.filter((c) => c.regexOnly),
  };
}

function ensureEntry(graph: Map<string, UnifiedVarEntry>, varName: string): void {
  if (graph.has(varName)) return;
  graph.set(varName, {
    varName,
    sources: {},
    defaultValue: null,
    elementCount: 0,
    direction: 'isolated',
    crossElementWriters: [],
    crossElementReaders: [],
  });
}

function ensureSource(entry: UnifiedVarEntry, elementType: string): void {
  if (!entry.sources[elementType]) {
    entry.sources[elementType] = { readers: [], writers: [] };
  }
}

function sortElementTypes(a: string, b: string): number {
  const aIndex = ELEMENT_TYPE_ORDER.indexOf(a as ElementType);
  const bIndex = ELEMENT_TYPE_ORDER.indexOf(b as ElementType);

  if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

function sortCorrelationDirection(
  a: LorebookRegexSharedVar['direction'],
  b: LorebookRegexSharedVar['direction'],
): number {
  const order: Record<LorebookRegexSharedVar['direction'], number> = {
    bidirectional: 0,
    'lorebook->regex': 1,
    'regex->lorebook': 2,
  };
  return order[a] - order[b];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function pushToMap(map: Map<string, string[]>, key: string, value: string): void {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(value);
}
