import { sanitizeFilename } from '../../utils/filenames';

/** RisuAI 캐릭터 북(로어북) 엔트리의 최소 구조 인터페이스 */
export interface RisuCharbookEntry {
  /** 엔트리 모드 (entry, folder 등) */
  mode: string;
  /** 엔트리 키 목록 (폴더의 경우 [0]번 인덱스가 식별자가 됨) */
  keys?: string[];
  /** 엔트리 이름 */
  name?: string;
  /** 엔트리 설명/주석 */
  comment?: string;
}

/** 폴더 맵 생성 옵션 */
export interface FolderMapOptions {
  /** 폴더 이름을 변환하는 함수 (예: sanitize) */
  nameTransform?: (name: string) => string;
  /** 이름이 없을 때 사용할 기본값 */
  fallbackName?: string;
}

/**
 * 로어북 엔트리 목록에서 폴더 키(keys[0])와 폴더 이름의 매핑을 생성
 *
 * @param entries - 로어북 엔트리 배열
 * @param opts - 변환 옵션
 * @returns {폴더키: 폴더이름} 매핑 객체
 */
export function buildFolderMap(
  entries: RisuCharbookEntry[],
  opts?: FolderMapOptions,
): Record<string, string> {
  const options = opts || {};
  const nameTransform =
    typeof options.nameTransform === 'function' ? options.nameTransform : (value: string) => value;
  const fallbackName = typeof options.fallbackName === 'string' ? options.fallbackName : 'unnamed';
  const map: Record<string, string> = {};

  for (const entry of entries) {
    if (entry.mode === 'folder' && entry.keys && entry.keys.length > 0) {
      const folderKey = entry.keys[0];
      map[folderKey] = nameTransform(entry.name || entry.comment || fallbackName);
    }
  }

  return map;
}

/**
 * 폴더 참조 식별자(folderRef)를 폴더 맵을 통해 실제 폴더 이름으로 해석
 *
 * @param folderRef - 엔트리의 folder 필드 값
 * @param folderMap - buildFolderMap으로 생성된 매핑 객체
 * @param fallbackTransform - 맵에 없을 때 적용할 폴더 이름 변환기
 * @returns 해석된 폴더 이름 (참조가 없으면 null)
 */
export function resolveFolderName(
  folderRef: string | null | undefined,
  folderMap: Record<string, string>,
  fallbackTransform?: (ref: string) => string,
): string | null {
  if (!folderRef) return null;
  if (Object.prototype.hasOwnProperty.call(folderMap, folderRef)) {
    return folderMap[folderRef];
  }
  if (typeof fallbackTransform === 'function') {
    return fallbackTransform(folderRef);
  }
  return folderRef;
}

/** Windows/POSIX 혼용 환경에서 경로 구분자를 항상 `/`로 통일한다. */
export function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

/**
 * lorebook 엔트리에서 폴더 식별 키를 추출한다.
 *
 * RisuAI의 lorebook 폴더 시스템은 `mode: 'folder'` 엔트리의 `keys[0]`를
 * 다른 엔트리의 `folder` 필드에서 참조하는 방식으로 부모-자식 관계를 표현한다.
 * 이 함수는 해당 키를 추출하되, 유효하지 않으면 null을 반환한다.
 */
export function getLorebookFolderKey(entry: any): string | null {
  if (!entry || !Array.isArray(entry.keys) || entry.keys.length === 0) return null;
  const key = entry.keys[0];
  return typeof key === 'string' && key.length > 0 ? key : null;
}

/**
 * lorebook 폴더용 디렉토리명 할당기를 생성한다.
 *
 * 동일 부모 아래에서 이름이 충돌할 경우 `_1`, `_2` 등의 접미사를 자동으로 붙여
 * 유일성을 보장한다. 클로저 내부에 상태를 유지하므로 하나의 추출 세션에서
 * 하나의 인스턴스만 사용해야 한다.
 */
export function createLorebookDirAllocator(): (parentRelDir: string, rawName: string) => string {
  const usedNamesByParent = new Map<string, Set<string>>();

  return (parentRelDir: string, rawName: string) => {
    const parentKey = toPosix(parentRelDir || '');
    const used = usedNamesByParent.get(parentKey) || new Set<string>();

    const base = sanitizeFilename(rawName, 'unnamed_folder');
    let candidate = base;
    let serial = 1;
    while (used.has(candidate)) {
      candidate = `${base}_${serial}`;
      serial += 1;
    }

    used.add(candidate);
    usedNamesByParent.set(parentKey, used);

    return parentKey ? `${parentKey}/${candidate}` : candidate;
  };
}

/**
 * lorebook 엔트리 배열에서 폴더 계층 구조를 해석하여 각 폴더 키에 대응하는
 * 상대 디렉토리 경로를 반환한다.
 *
 * 내부적으로 재귀적 부모 탐색을 수행하며, 순환 참조가 감지되면 fallback 이름을 사용한다.
 * 결과 Map의 키는 폴더의 `keys[0]`, 값은 `lorebooks/` 기준 상대 경로이다.
 */
export function buildLorebookFolderDirMap(
  entries: any[],
  allocateDir: (parentRelDir: string, rawName: string) => string,
): Map<string, string> {
  const folderEntriesByKey = new Map<string, any>();
  const resolvedDirs = new Map<string, string>();
  const resolving = new Set<string>();

  for (const entry of entries) {
    if (entry?.mode !== 'folder') continue;
    const key = getLorebookFolderKey(entry);
    if (!key) continue;
    folderEntriesByKey.set(key, entry);
  }

  /** 폴더 키를 통해 상대 디렉토리 경로를 재귀적으로 해석 */
  const resolveDirByKey = (folderKey: string | null): string => {
    if (!folderKey) return '';
    if (resolvedDirs.has(folderKey)) return resolvedDirs.get(folderKey)!;
    if (resolving.has(folderKey)) return sanitizeFilename(folderKey, 'unnamed_folder');

    const entry = folderEntriesByKey.get(folderKey);
    if (!entry) return sanitizeFilename(folderKey, 'unnamed_folder');

    resolving.add(folderKey);
    const parentRelDir = entry.folder ? resolveDirByKey(entry.folder) : '';
    const relDir = allocateDir(parentRelDir, entry.name || entry.comment || folderKey);
    resolvedDirs.set(folderKey, relDir);
    resolving.delete(folderKey);
    return relDir;
  };

  for (const folderKey of folderEntriesByKey.keys()) {
    resolveDirByKey(folderKey);
  }

  return resolvedDirs;
}

/** 추출될 로어북 아이템(폴더 또는 개별 엔트리)의 상세 정보 */
export type LorebookExtractionEntry =
  | {
      /** 아이템 타입 */
      type: 'folder';
      /** 출처 (캐릭터 카드 또는 모듈) */
      source: 'character' | 'module';
      /** 아이템이 위치할 상대 디렉토리 경로 */
      relDir: string;
      /** 원본 데이터 */
      data: any;
    }
  | {
      /** 아이템 타입 */
      type: 'entry';
      /** 출처 */
      source: 'character' | 'module';
      /** 아이템 파일의 상대 경로 */
      relPath: string;
      /** 원본 데이터 */
      data: any;
    };

/** 로어북 추출 계획 전체를 담는 인터페이스 */
export interface LorebookExtractionPlan {
  /** 계획된 아이템 목록 */
  items: LorebookExtractionEntry[];
}

/**
 * lorebook 추출에서 실제 파일 I/O 없이 "무엇을 어디에 쓸지"만 계산한다.
 *
 * 폴더 계층을 해석해 상대 경로를 계획하고, 같은 세션 내 경로 충돌은 메모리 Set으로
 * 추적해 `_1`, `_2` 접미사를 붙여 유일성을 보장한다.
 */
export function planLorebookExtraction(
  entries: any[],
  source: 'character' | 'module',
  allocateDir: (parentRelDir: string, rawName: string) => string,
  usedRelPaths?: Set<string>,
): LorebookExtractionPlan {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { items: [] };
  }

  const fallbackFolderMap = buildFolderMap(entries, {
    nameTransform: sanitizeFilename,
    fallbackName: 'unnamed_folder',
  });
  const folderDirMap = buildLorebookFolderDirMap(entries, allocateDir);
  const used = usedRelPaths || new Set<string>();
  const items: LorebookExtractionEntry[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const name = sanitizeFilename(entry.name || entry.comment || `entry_${i}`);

    if (entry.mode === 'folder') { 
      const folderKey = getLorebookFolderKey(entry);
      const relDir =
        folderKey && folderDirMap.has(folderKey)
          ? folderDirMap.get(folderKey)!
          : allocateDir('', entry.name || entry.comment || `folder_${i}`);

      items.push({
        type: 'folder',
        source,
        relDir,
        data: entry,
      });
      continue;
    }
 
    const relDir = entry.folder
      ? folderDirMap.get(entry.folder) ||
        resolveFolderName(entry.folder, fallbackFolderMap, (ref) => sanitizeFilename(ref)) ||
        ''
      : '';

    let fileName = `${name}.json`;
    let relPath = relDir ? `${relDir}/${fileName}` : fileName;
    let serial = 1;
    while (used.has(relPath)) {
      fileName = `${name}_${serial}.json`;
      relPath = relDir ? `${relDir}/${fileName}` : fileName;
      serial += 1;
    }
    used.add(relPath);

    items.push({
      type: 'entry',
      source,
      relPath: toPosix(relPath),
      data: entry,
    });
  }

  return { items };
}
