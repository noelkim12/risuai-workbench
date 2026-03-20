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

/**
 * 로어북 엔트리의 구조적 정보를 나타냅니다.
 */
export interface LorebookStructureEntry {
  /** 엔트리 이름 */
  name: string;
  /** 소속 폴더 이름 (없을 경우 null) */
  folder: string | null;
  /** 활성화 키워드 목록 */
  keywords: string[];
  /** 활성화 여부 */
  enabled: boolean;
  /** 상시 활성화 여부 */
  constant: boolean;
  /** 선택적 활성화 여부 */
  selective: boolean;
  /** CBS 변수 포함 여부 */
  hasCBS: boolean;
}

/**
 * 로어북 구조 분석 결과입니다.
 */
export interface LorebookStructureResult {
  /** 폴더 목록 */
  folders: Array<{ id: string; name: string }>;
  /** 엔트리 목록 */
  entries: LorebookStructureEntry[];
  /** 분석 통계 */
  stats: {
    /** 총 엔트리 수 */
    totalEntries: number;
    /** 총 폴더 수 */
    totalFolders: number;
    /** 활성화 모드별 개수 */
    activationModes: {
      normal: number;
      constant: number;
      selective: number;
    };
    /** 활성화된 엔트리 수 */
    enabledCount: number;
    /** CBS를 사용하는 엔트리 수 */
    withCBS: number;
  };
  /** 키워드 데이터 */
  keywords: {
    /** 모든 고유 키워드 (정렬됨) */
    all: string[];
    /** 키워드 중첩 정보 (키워드: [엔트리 이름 목록]) */
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

/**
 * 로어북 엔트리 배열을 분석하여 폴더 구조, 통계, 키워드 중첩 등을 계산합니다.
 * @param entries - 로어북 엔트리 객체 배열
 * @returns 로어북 구조 분석 결과
 */
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

/**
 * 캐릭터 카드 객체에서 로어북 구조를 분석합니다.
 * @param card - RisuAI 캐릭터 카드 객체
 * @returns 로어북 구조 분석 결과
 */
export function analyzeLorebookStructureFromCard(card: unknown): LorebookStructureResult {
  return analyzeLorebookStructure(getAllLorebookEntries(card));
}

/**
 * 로어북 엔트리들에서 CBS 변수 읽기/쓰기 연산을 수집합니다.
 * @param entries - 로어북 엔트리 객체 배열
 * @param opts - 옵션 (prefix: 이름 앞에 붙일 접두사)
 * @returns CBS 사용 데이터 배열
 */
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

/**
 * 캐릭터 카드 객체(캐릭터 로어북 및 포함된 모듈 로어북)에서 모든 CBS 변수 연산을 수집합니다.
 * @param card - RisuAI 캐릭터 카드 객체
 * @returns 수집된 CBS 사용 데이터 배열
 */
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
