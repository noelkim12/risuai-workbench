import { extractCBSVarOps } from '../cbs/cbs';
import { asRecord, type GenericRecord } from '../types';
import {
  getLorebookEntriesFromCharx,
  getModuleLorebookEntries,
  getAllLorebookEntriesFromCharx,
} from '../charx/data';
import {
  buildFolderMap,
  buildLorebookFolderPathMap,
  getLorebookFolderKey,
  resolveFolderName,
  type RisuCharbookEntry,
} from './folders';

/**
 * 로어북 엔트리의 활성화 방식을 4가지로 분류합니다.
 *
 * - `constant`: 항상 활성 (키워드 무관)
 * - `keyword`: primary keys 하나 이상 — 일반 키워드 매칭
 * - `keywordMulti`: `selective`이면서 secondary keys 존재 — primary AND secondary 매칭
 * - `referenceOnly`: primary keys 없음 && constant 아님 — Lua/직접 참조로만 활성
 */
export type LorebookActivationMode = 'constant' | 'keyword' | 'keywordMulti' | 'referenceOnly';

/**
 * 로어북 엔트리의 구조적 정보를 나타냅니다.
 */
export interface LorebookStructureEntry {
  /** 전체 폴더 경로를 포함한 고유 식별자 */
  id: string;
  /** 엔트리 이름 */
  name: string;
  /** 소속 폴더 키 (없을 경우 null) */
  folderId: string | null;
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
  /** 4-way 활성화 분류 */
  activationMode: LorebookActivationMode;
  /** CBS 변수 포함 여부 */
  hasCBS: boolean;
}

/**
 * 로어북 구조 분석 결과입니다.
 */
export interface LorebookStructureResult {
  /** 폴더 목록 */
  folders: Array<{ id: string; name: string; path: string; parentId: string | null }>;
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
      /** 항상 활성 (constant) */
      constant: number;
      /** primary 키워드 OR 매칭 */
      keyword: number;
      /** primary + secondary 키워드 AND 매칭 (selective) */
      keywordMulti: number;
      /** 키워드 없음 — Lua/직접 참조로만 활성 */
      referenceOnly: number;
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
    activationModes: { constant: 0, keyword: 0, keywordMulti: 0, referenceOnly: 0 },
    enabledCount: 0,
    withCBS: 0,
  },
  keywords: { all: [], overlaps: {} },
};

/** lorebook structure 트리용 folder node입니다. */
export interface LorebookStructureFolderNode {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  children: LorebookStructureFolderNode[];
  entries: LorebookStructureEntry[];
}

/**
 * 로어북 엔트리 배열을 분석하여 폴더 구조, 통계, 키워드 중첩 등을 계산합니다.
 * @param entries - 로어북 엔트리 객체 배열
 * @returns 로어북 구조 분석 결과
 */
export function analyzeLorebookStructure(entries: GenericRecord[]): LorebookStructureResult {
  if (entries.length === 0) return EMPTY_RESULT;

  const folderMap = buildFolderMap(entries as unknown as RisuCharbookEntry[]);
  const folderPathMap = buildLorebookFolderPathMap(entries as unknown as RisuCharbookEntry[]);
  const folders = entries
    .filter((entry) => entry.mode === 'folder')
    .flatMap((entry) => {
      const folderId = getLorebookFolderKey(entry);
      if (!folderId) return [];
      const path = folderPathMap.get(folderId) || resolveFolderName(folderId, folderMap) || folderId;
      return [{
        id: folderId,
        name: path.split('/').pop() || path,
        path,
        parentId: typeof entry.folder === 'string' ? entry.folder : null,
      }];
    });
  const regularEntries = entries.filter((entry) => entry.mode !== 'folder');

  const stats = {
    totalEntries: 0,
    totalFolders: folders.length,
    activationModes: { constant: 0, keyword: 0, keywordMulti: 0, referenceOnly: 0 },
    enabledCount: 0,
    withCBS: 0,
  };

  const keywordMap = new Map<string, string[]>();

  const structured = regularEntries.map((entry, index) => {
    stats.totalEntries += 1;

    const activationMode = classifyLorebookActivation(entry);
    stats.activationModes[activationMode] += 1;

    if (entry.enabled !== false) stats.enabledCount += 1;

    const content = typeof entry.content === 'string' ? entry.content : '';
    const { reads, writes } = extractCBSVarOps(content);
    const hasCBS = reads.size > 0 || writes.size > 0;
    if (hasCBS) stats.withCBS += 1;

    const entryName = getLorebookEntryName(entry, index);
    const folderRef = typeof entry.folder === 'string' ? entry.folder : undefined;
    const folder = folderRef ? folderPathMap.get(folderRef) || resolveFolderName(folderRef, folderMap) : null;
    const entryId = folder ? `${folder}/${entryName}` : entryName;
    const keywords = normalizeKeywords(entry);
    for (const keyword of keywords) {
      if (!keywordMap.has(keyword)) keywordMap.set(keyword, []);
      keywordMap.get(keyword)!.push(entryId);
    }

    return {
      id: entryId,
      name: entryName,
      folderId: folderRef || null,
      folder: folder || null,
      keywords,
      enabled: entry.enabled !== false,
      constant: Boolean(entry.constant),
      selective: Boolean(entry.selective),
      activationMode,
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
 * @param charx - RisuAI 캐릭터 카드 객체
 * @returns 로어북 구조 분석 결과
 */
export function analyzeLorebookStructureFromCharx(charx: unknown): LorebookStructureResult {
  return analyzeLorebookStructure(getAllLorebookEntriesFromCharx(charx));
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
  const folderPathMap = buildLorebookFolderPathMap(entries as unknown as RisuCharbookEntry[]);

  entries.forEach((entry, index) => {
    if (entry.mode === 'folder') return;

    const content = typeof entry.content === 'string' ? entry.content : '';
    const { reads, writes } = extractCBSVarOps(content);
    if (reads.size === 0 && writes.size === 0) return;

    const folderRef = typeof entry.folder === 'string' ? entry.folder : undefined;
    const folderName = folderRef ? folderPathMap.get(folderRef) || resolveFolderName(folderRef, folderMap) : null;
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

/** 분석 결과의 flat folders/entries를 트리 구조로 재구성한다. */
export function buildLorebookStructureTree(
  structure: LorebookStructureResult,
): { roots: LorebookStructureFolderNode[]; rootEntries: LorebookStructureEntry[] } {
  const nodes = new Map<string, LorebookStructureFolderNode>();
  for (const folder of structure.folders) {
    nodes.set(folder.id, { ...folder, children: [], entries: [] });
  }

  for (const entry of structure.entries) {
    if (!entry.folderId) continue;
    const parent = nodes.get(entry.folderId);
    if (parent) parent.entries.push(entry);
  }

  const roots: LorebookStructureFolderNode[] = [];
  for (const folder of nodes.values()) {
    if (folder.parentId && nodes.has(folder.parentId)) {
      nodes.get(folder.parentId)!.children.push(folder);
    } else {
      roots.push(folder);
    }
  }

  const sortFolders = (items: LorebookStructureFolderNode[]): void => {
    items.sort((a, b) => a.path.localeCompare(b.path));
    for (const item of items) {
      item.entries.sort((a, b) => a.id.localeCompare(b.id));
      sortFolders(item.children);
    }
  };
  sortFolders(roots);

  return {
    roots,
    rootEntries: structure.entries.filter((entry) => !entry.folderId).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * 캐릭터 카드 객체(캐릭터 로어북 및 포함된 모듈 로어북)에서 모든 CBS 변수 연산을 수집합니다.
 * @param charx - RisuAI 캐릭터 카드 객체
 * @returns 수집된 CBS 사용 데이터 배열
 */
export function collectLorebookCBSFromCharx(charx: unknown): Array<{
  elementType: 'lorebook';
  elementName: string;
  reads: Set<string>;
  writes: Set<string>;
}> {
  return [
    ...collectLorebookCBS(getLorebookEntriesFromCharx(charx)),
    ...collectLorebookCBS(getModuleLorebookEntries(charx), { prefix: '[module]' }),
  ];
}

/**
 * 로어북 엔트리의 표시 이름을 결정합니다.
 *
 * `name → comment → entry-{id} → entry-{index}` 순서로 폴백하여
 * 사람이 읽을 수 있는 엔트리 식별자를 반환합니다.
 *
 * @param entry - 로어북 엔트리 객체
 * @param index - 엔트리의 배열 인덱스 (폴백 이름 생성에 사용)
 * @returns 결정된 엔트리 표시 이름
 */
function getLorebookEntryName(entry: GenericRecord, index: number): string {
  if (typeof entry.name === 'string' && entry.name) return entry.name;
  if (typeof entry.comment === 'string' && entry.comment) return entry.comment;
  if (entry.id != null && String(entry.id)) return `entry-${String(entry.id)}`;
  return `entry-${index}`;
}

/**
 * 로어북 엔트리에서 활성화 키워드 목록을 정규화하여 반환합니다.
 *
 * `keys`/`key` 필드를 우선 탐색하고, 없으면 `data.keys`/`data.key`를 참조합니다.
 * 단일 값과 배열 모두 처리하며, 각 값은 공백 제거 후 빈 문자열을 걸러냅니다.
 *
 * @param entry - 로어북 엔트리 객체
 * @returns 공백이 제거된 비어 있지 않은 키워드 문자열 배열
 */
function normalizeKeywords(entry: GenericRecord): string[] {
  const directKeys = entry.keys !== undefined ? entry.keys : asRecord(entry.data)?.keys;
  const directKey = entry.key !== undefined ? entry.key : asRecord(entry.data)?.key;
  const raw = directKeys ?? directKey;

  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.map((value) => String(value).trim()).filter((value) => value.length > 0);
}

/**
 * 로어북 엔트리에서 보조 키워드(secondary keys) 목록을 정규화하여 반환합니다.
 *
 * RisuAI/ST 포맷의 다양한 필드 별칭(`secondkey`, `secondKey`, `secondkeys`,
 * `secondaryKeys`)을 모두 탐색하며, 없으면 `data.*` 경로도 확인합니다.
 */
function normalizeSecondaryKeys(entry: GenericRecord): string[] {
  const data = asRecord(entry.data);
  const raw =
    entry.secondkey ??
    entry.secondKey ??
    entry.secondkeys ??
    entry.secondaryKeys ??
    data?.secondkey ??
    data?.secondKey ??
    data?.secondkeys ??
    data?.secondaryKeys;

  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.map((value) => String(value).trim()).filter((value) => value.length > 0);
}

/**
 * 로어북 엔트리의 활성화 방식을 4가지로 분류합니다.
 * (정의는 상단 `LorebookActivationMode` 참조)
 */
export function classifyLorebookActivation(entry: GenericRecord): LorebookActivationMode {
  if (entry.constant) return 'constant';
  const primaryKeys = normalizeKeywords(entry);
  if (primaryKeys.length === 0) return 'referenceOnly';
  if (entry.selective && normalizeSecondaryKeys(entry).length > 0) return 'keywordMulti';
  return 'keyword';
}
