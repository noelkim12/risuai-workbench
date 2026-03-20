import { extractCBSVarOps } from '../card/cbs';
import { asRecord, type GenericRecord } from '../types';
import {
  getCharacterBookEntries,
  getModuleLorebookEntries,
  getAllLorebookEntries,
} from '../card/data';
import {
  buildFolderMap,
  resolveFolderName,
  type RisuCharbookEntry,
} from './folders';

export interface LorebookStructureEntry {
  name: string;
  folder: string | null;
  keywords: string[];
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  hasCBS: boolean;
}

export interface LorebookStructureResult {
  folders: Array<{ id: string; name: string }>;
  entries: LorebookStructureEntry[];
  stats: {
    totalEntries: number;
    totalFolders: number;
    activationModes: {
      normal: number;
      constant: number;
      selective: number;
    };
    enabledCount: number;
    withCBS: number;
  };
  keywords: {
    all: string[];
    overlaps: Record<string, string[]>;
  };
}

const EMPTY_RESULT: LorebookStructureResult = {
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

export function analyzeLorebookStructure(entries: GenericRecord[]): LorebookStructureResult {
  if (entries.length === 0) return EMPTY_RESULT;

  const folderMap = buildFolderMap(entries as unknown as RisuCharbookEntry[]);
  const folders = Object.entries(folderMap).map(([id, name]) => ({ id, name }));
  const regularEntries = entries.filter((entry) => entry.mode !== 'folder');

  const stats = {
    totalEntries: 0,
    totalFolders: folders.length,
    activationModes: { normal: 0, constant: 0, selective: 0 },
    enabledCount: 0,
    withCBS: 0,
  };

  const keywordMap = new Map<string, string[]>();

  const structured = regularEntries.map((entry, index) => {
    stats.totalEntries += 1;

    if (entry.constant) stats.activationModes.constant += 1;
    else if (entry.selective) stats.activationModes.selective += 1;
    else stats.activationModes.normal += 1;

    if (entry.enabled !== false) stats.enabledCount += 1;

    const content = typeof entry.content === 'string' ? entry.content : '';
    const { reads, writes } = extractCBSVarOps(content);
    const hasCBS = reads.size > 0 || writes.size > 0;
    if (hasCBS) stats.withCBS += 1;

    const entryName = getLorebookEntryName(entry, index);
    const keywords = normalizeKeywords(entry);
    for (const keyword of keywords) {
      if (!keywordMap.has(keyword)) keywordMap.set(keyword, []);
      keywordMap.get(keyword)!.push(entryName);
    }

    const folderRef =
      typeof entry.folder === 'string' ? entry.folder : undefined;
    const folder = resolveFolderName(folderRef, folderMap);

    return {
      name: entryName,
      folder: folder || null,
      keywords,
      enabled: entry.enabled !== false,
      constant: Boolean(entry.constant),
      selective: Boolean(entry.selective),
      hasCBS,
    };
  });

  const overlaps: Record<string, string[]> = {};
  for (const [keyword, entryNames] of keywordMap.entries()) {
    if (entryNames.length > 1) {
      overlaps[keyword] = [...new Set(entryNames)];
    }
  }

  return {
    folders,
    entries: structured,
    stats,
    keywords: {
      all: [...keywordMap.keys()].sort(),
      overlaps,
    },
  };
}

export function analyzeLorebookStructureFromCard(card: unknown): LorebookStructureResult {
  return analyzeLorebookStructure(getAllLorebookEntries(card));
}

export function collectLorebookCBS(
  entries: GenericRecord[],
  opts?: { prefix?: string },
): Array<{
  elementType: 'lorebook';
  elementName: string;
  reads: Set<string>;
  writes: Set<string>;
}> {
  const results: Array<{
    elementType: 'lorebook';
    elementName: string;
    reads: Set<string>;
    writes: Set<string>;
  }> = [];

  if (entries.length === 0) return results;

  const folderMap = buildFolderMap(entries as unknown as RisuCharbookEntry[]);

  entries.forEach((entry, index) => {
    if (entry.mode === 'folder') return;

    const content = typeof entry.content === 'string' ? entry.content : '';
    const { reads, writes } = extractCBSVarOps(content);
    if (reads.size === 0 && writes.size === 0) return;

    const folderRef =
      typeof entry.folder === 'string' ? entry.folder : undefined;
    const folderName = resolveFolderName(folderRef, folderMap);
    const name = getLorebookEntryName(entry, index);
    const scoped = folderName ? `${folderName}/${name}` : name;

    results.push({
      elementType: 'lorebook',
      elementName: opts?.prefix ? `${opts.prefix}/${scoped}` : scoped,
      reads,
      writes,
    });
  });

  return results;
}

export function collectLorebookCBSFromCard(card: unknown): Array<{
  elementType: 'lorebook';
  elementName: string;
  reads: Set<string>;
  writes: Set<string>;
}> {
  return [
    ...collectLorebookCBS(getCharacterBookEntries(card)),
    ...collectLorebookCBS(getModuleLorebookEntries(card), { prefix: '[module]' }),
  ];
}

function getLorebookEntryName(entry: GenericRecord, index: number): string {
  if (typeof entry.name === 'string' && entry.name) return entry.name;
  if (typeof entry.comment === 'string' && entry.comment) return entry.comment;
  if (entry.id != null && String(entry.id)) return `entry-${String(entry.id)}`;
  return `entry-${index}`;
}

function normalizeKeywords(entry: GenericRecord): string[] {
  const directKeys =
    entry.keys !== undefined ? entry.keys : asRecord(entry.data)?.keys;
  const directKey = entry.key !== undefined ? entry.key : asRecord(entry.data)?.key;
  const raw = directKeys ?? directKey;

  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}
