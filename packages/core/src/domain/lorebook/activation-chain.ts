import { getAllLorebookEntriesFromCharx } from '../charx/data';
import { getModuleLorebookEntriesFromModule } from '../module';
import { asRecord, type GenericRecord } from '../types';

/** recursive contribution policy of an activated lorebook entry */
export type LorebookRecursionMode = 'inherit' | 'force-recursive' | 'force-unrecursive';

/** static chain edge status */
export type LorebookActivationEdgeStatus = 'possible' | 'partial' | 'blocked';

/** blocking reason for a recursive chain edge */
export type LorebookActivationBlockReason =
  | 'global-recursive-scanning-disabled'
  | 'source-recursion-disabled'
  | 'target-disabled'
  | 'target-no-recursive-search';

/** normalized lorebook activation metadata */
export interface LorebookActivationEntry {
  id: string;
  name: string;
  keywords: string[];
  secondaryKeywords: string[];
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  insertionOrder: number;
  content: string;
  searchContent: string;
  caseSensitive: boolean;
  useRegex: boolean;
  recursionMode: LorebookRecursionMode;
  recursiveSearchEnabled: boolean;
}

/** static lorebook-to-lorebook chain edge */
export interface LorebookActivationEdge {
  sourceId: string;
  targetId: string;
  status: LorebookActivationEdgeStatus;
  matchedKeywords: string[];
  matchedSecondaryKeywords: string[];
  missingSecondaryKeywords: string[];
  blockedBy: LorebookActivationBlockReason[];
}

/** lorebook activation-chain analysis result */
export interface LorebookActivationChainResult {
  entries: LorebookActivationEntry[];
  edges: LorebookActivationEdge[];
  summary: {
    totalEntries: number;
    possibleEdges: number;
    partialEdges: number;
    blockedEdges: number;
    recursiveScanningEnabled: boolean;
  };
}

/** analyzeLorebookActivationChains derives static recursive activation possibilities from raw lorebook entries */
export function analyzeLorebookActivationChains(
  entries: GenericRecord[],
  options?: { recursiveScanning?: boolean },
): LorebookActivationChainResult {
  const recursiveScanningEnabled = options?.recursiveScanning ?? true;
  const normalized = entries
    .filter((entry) => entry.mode !== 'folder')
    .map((entry, index) => normalizeEntry(entry, index));

  const edges: LorebookActivationEdge[] = [];
  for (const source of normalized) {
    if (!source.enabled) continue;
    for (const target of normalized) {
      if (source.id === target.id || target.keywords.length === 0) continue;

      const matchedKeywords = target.keywords.filter((keyword) =>
        matchesActivationKeyword(source.searchContent, keyword, target),
      );
      if (matchedKeywords.length === 0) continue;

      const blockedBy: LorebookActivationBlockReason[] = [];
      if (!recursiveScanningEnabled) blockedBy.push('global-recursive-scanning-disabled');
      if (!target.enabled) blockedBy.push('target-disabled');
      if (recursiveScanningEnabled && source.recursionMode === 'force-unrecursive') {
        blockedBy.push('source-recursion-disabled');
      }
      if (!target.recursiveSearchEnabled) blockedBy.push('target-no-recursive-search');

      const matchedSecondaryKeywords = target.secondaryKeywords.filter((keyword) =>
        matchesActivationKeyword(source.searchContent, keyword, target),
      );
      const missingSecondaryKeywords = target.secondaryKeywords.filter(
        (keyword) => !matchedSecondaryKeywords.includes(keyword),
      );
      const selectiveIncomplete = target.selective && missingSecondaryKeywords.length > 0;

      edges.push({
        sourceId: source.id,
        targetId: target.id,
        status: blockedBy.length > 0 ? 'blocked' : selectiveIncomplete ? 'partial' : 'possible',
        matchedKeywords,
        matchedSecondaryKeywords,
        missingSecondaryKeywords,
        blockedBy,
      });
    }
  }

  return {
    entries: normalized,
    edges,
    summary: {
      totalEntries: normalized.length,
      possibleEdges: edges.filter((edge) => edge.status === 'possible').length,
      partialEdges: edges.filter((edge) => edge.status === 'partial').length,
      blockedEdges: edges.filter((edge) => edge.status === 'blocked').length,
      recursiveScanningEnabled,
    },
  };
}

/** analyzeLorebookActivationChainsFromCharx derives static recursive chain analysis from a charx payload */
export function analyzeLorebookActivationChainsFromCharx(charx: unknown): LorebookActivationChainResult {
  return analyzeLorebookActivationChains(getAllLorebookEntriesFromCharx(charx), {
    recursiveScanning: readRecursiveScanningFlag(charx),
  });
}

/** analyzeLorebookActivationChainsFromModule derives static recursive chain analysis from a raw module payload */
export function analyzeLorebookActivationChainsFromModule(module: unknown): LorebookActivationChainResult {
  return analyzeLorebookActivationChains(getModuleLorebookEntriesFromModule(module), { recursiveScanning: true });
}

function normalizeEntry(entry: GenericRecord, index: number): LorebookActivationEntry {
  const content = typeof entry.content === 'string' ? entry.content : '';
  const directives = parseContentDirectives(content);

  return {
    id: getLorebookEntryName(entry, index),
    name: getLorebookEntryName(entry, index),
    keywords: normalizeStringArray(entry.keys ?? entry.key ?? asRecord(entry.data)?.keys ?? asRecord(entry.data)?.key),
    secondaryKeywords: normalizeStringArray(
      entry.secondkey ??
        entry.secondKey ??
        entry.secondkeys ??
        entry.secondaryKeys ??
        asRecord(entry.data)?.secondkey ??
        asRecord(entry.data)?.secondKey ??
        asRecord(entry.data)?.secondkeys ??
        asRecord(entry.data)?.secondaryKeys,
    ),
    enabled: entry.enabled !== false,
    constant: readBoolean(entry.constant ?? entry.alwaysActive),
    selective: readBoolean(entry.selective),
    insertionOrder: readNumber(entry.insertionOrder ?? entry.insertorder ?? entry.insertOrder, index),
    content,
    searchContent: directives.searchContent,
    caseSensitive: readBoolean(entry.caseSensitive ?? entry.case_sensitive),
    useRegex: readBoolean(entry.useRegex ?? entry.use_regex),
    recursionMode: directives.recursionMode,
    recursiveSearchEnabled: !directives.noRecursiveSearch,
  };
}

function matchesActivationKeyword(
  searchContent: string,
  keyword: string,
  entry: Pick<LorebookActivationEntry, 'caseSensitive' | 'useRegex'>,
): boolean {
  if (!keyword) return false;
  if (entry.useRegex) {
    try {
      return new RegExp(keyword, entry.caseSensitive ? 'u' : 'iu').test(searchContent);
    } catch {
      return false;
    }
  }

  if (entry.caseSensitive) return searchContent.includes(keyword);
  return searchContent.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
}

function parseContentDirectives(content: string): {
  recursionMode: LorebookRecursionMode;
  noRecursiveSearch: boolean;
  searchContent: string;
} {
  let recursionMode: LorebookRecursionMode = 'inherit';
  let noRecursiveSearch = false;
  const searchLines: string[] = [];

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === '@@recursive') {
      recursionMode = 'force-recursive';
      continue;
    }
    if (trimmed === '@@unrecursive') {
      recursionMode = 'force-unrecursive';
      continue;
    }
    if (trimmed === '@@no_recursive_search') {
      noRecursiveSearch = true;
      continue;
    }
    searchLines.push(line);
  }

  return {
    recursionMode,
    noRecursiveSearch,
    searchContent: searchLines.join('\n'),
  };
}

function getLorebookEntryName(entry: GenericRecord, index: number): string {
  if (typeof entry.name === 'string' && entry.name.length > 0) return entry.name;
  if (typeof entry.comment === 'string' && entry.comment.length > 0) return entry.comment;
  if (entry.id != null && String(entry.id).length > 0) return `entry-${String(entry.id)}`;
  return `entry-${index}`;
}

function readRecursiveScanningFlag(charx: unknown): boolean {
  const record = asRecord(charx);
  const data = asRecord(record?.data);
  const characterBook = asRecord(data?.character_book);
  const loreSettings = asRecord(data?.loreSettings);
  const raw = characterBook?.recursive_scanning ?? characterBook?.recursiveScanning ?? loreSettings?.recursiveScanning;
  return typeof raw === 'boolean' ? raw : true;
}

function normalizeStringArray(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => String(item).trim()).filter((item) => item.length > 0);
}

function readBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
