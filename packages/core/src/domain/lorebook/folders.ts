import { sanitizeFilename } from '../../utils/filenames';

/** RisuAI 캐릭터 북(로어북) 엔트리의 최소 구조 인터페이스
 *
 * 주의: 로어북은 출처에 따라 두 가지 스키마가 공존한다.
 * - Character book (V3 spec): `keys: [string, ...]` (배열) + `name`
 * - RisuAI module lorebook (`_moduleLorebook`): `key: string` (단수) + `comment`
 *
 * 따라서 폴더 식별자나 이름을 얻는 유틸은 반드시 두 스키마를 모두 처리해야 한다.
 */
export interface RisuCharbookEntry {
  /** 엔트리 모드 (entry, folder 등) */
  mode: string;
  /** 엔트리 키 목록 (character_book 스키마: 폴더의 경우 [0]번 인덱스가 식별자) */
  keys?: string[];
  /** 엔트리 키 (_moduleLorebook 스키마: 단일 문자열) */
  key?: string;
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
    if (entry.mode !== 'folder') continue;
    const folderKey = getLorebookFolderKey(entry);
    if (!folderKey) continue;
    map[folderKey] = nameTransform(entry.name || entry.comment || fallbackName);
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
 * RisuAI의 lorebook 폴더 시스템은 `mode: 'folder'` 엔트리의 식별자를
 * 다른 엔트리의 `folder` 필드에서 참조하는 방식으로 부모-자식 관계를 표현한다.
 *
 * 스키마가 두 가지 공존한다:
 * - character_book (V3 spec): `keys: [string, ...]` (배열, 첫 원소가 식별자)
 * - `_moduleLorebook` (RisuAI internal): `key: string` (단수)
 *
 * 둘 다 지원하되, 유효한 문자열 키가 없으면 null을 반환한다.
 */
export function getLorebookFolderKey(entry: any): string | null {
  if (!entry) return null;
  if (Array.isArray(entry.keys) && entry.keys.length > 0) {
    const key = entry.keys[0];
    if (typeof key === 'string' && key.length > 0) return key;
  }
  if (typeof entry.key === 'string' && entry.key.length > 0) {
    return entry.key;
  }
  return null;
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
 * 결과 Map의 키는 폴더의 식별자(getLorebookFolderKey), 값은 `lorebooks/` 기준 상대 경로이다.
 *
 * `sharedResolvedDirs`가 제공되면 이 맵에 해석 결과를 누적·공유한다.
 * 서로 다른 lorebook 소스(character_book / _moduleLorebook 등)를 순차 처리하면서
 * 동일한 folder key를 만나면 같은 디렉토리로 수렴시키기 위해 사용한다.
 */
export function buildLorebookFolderDirMap(
  entries: any[],
  allocateDir: (parentRelDir: string, rawName: string) => string,
  sharedResolvedDirs?: Map<string, string>,
): Map<string, string> {
  const folderEntriesByKey = new Map<string, any>();
  const resolvedDirs = sharedResolvedDirs ?? new Map<string, string>();
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

/**
 * lorebook 엔트리 배열에서 폴더 키별 전체 표시 경로를 계산한다.
 *
 * 추출 경로와 달리 UI 표시용이므로 sanitize는 하지 않지만, 같은 부모 아래에서
 * 이름이 충돌하면 `_1`, `_2` 접미사로 안정적인 구분자를 붙인다.
 */
export function buildLorebookFolderPathMap(entries: any[]): Map<string, string> {
  const folderEntriesByKey = new Map<string, any>();
  const resolvedPaths = new Map<string, string>();
  const resolving = new Set<string>();
  const usedNamesByParent = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (entry?.mode !== 'folder') continue;
    const key = getLorebookFolderKey(entry);
    if (!key) continue;
    folderEntriesByKey.set(key, entry);
  }

  const allocatePath = (parentPath: string, rawName: string): string => {
    const parentKey = toPosix(parentPath || '');
    const used = usedNamesByParent.get(parentKey) || new Set<string>();
    const base = String(rawName || '').trim() || 'unnamed folder';
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

  const resolvePathByKey = (folderKey: string | null): string => {
    if (!folderKey) return '';
    if (resolvedPaths.has(folderKey)) return resolvedPaths.get(folderKey)!;
    if (resolving.has(folderKey)) return folderKey;

    const entry = folderEntriesByKey.get(folderKey);
    if (!entry) return folderKey;

    resolving.add(folderKey);
    const parentPath = entry.folder ? resolvePathByKey(entry.folder) : '';
    const path = allocatePath(parentPath, entry.name || entry.comment || folderKey);
    resolvedPaths.set(folderKey, path);
    resolving.delete(folderKey);
    return path;
  };

  for (const folderKey of folderEntriesByKey.keys()) {
    resolvePathByKey(folderKey);
  }

  return resolvedPaths;
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

function normalizeLorebookKeys(entry: any): string[] {
  if (Array.isArray(entry?.keys)) {
    return entry.keys
      .map((value: unknown) => String(value ?? '').trim())
      .filter(Boolean);
  }

  const combined = [entry?.key, entry?.secondkey]
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return combined;
}

function getLorebookCaseSensitive(entry: any): boolean {
  if (typeof entry?.case_sensitive === 'boolean') return entry.case_sensitive;
  if (typeof entry?.extensions?.risu_case_sensitive === 'boolean') return entry.extensions.risu_case_sensitive;
  if (typeof entry?.extentions?.risu_case_sensitive === 'boolean') return entry.extentions.risu_case_sensitive;
  return false;
}

function getLorebookUseRegex(entry: any): boolean {
  if (typeof entry?.use_regex === 'boolean') return entry.use_regex;
  if (typeof entry?.useRegex === 'boolean') return entry.useRegex;
  return false;
}

function getLorebookInsertionOrder(entry: any): number {
  if (typeof entry?.insertion_order === 'number') return entry.insertion_order;
  if (typeof entry?.insertorder === 'number') return entry.insertorder;
  return 0;
}

function getLorebookConstant(entry: any): boolean {
  if (typeof entry?.constant === 'boolean') return entry.constant;
  if (typeof entry?.alwaysActive === 'boolean') return entry.alwaysActive;
  return false;
}

function getLorebookSemanticFingerprint(entry: any): string {
  if (entry?.mode === 'folder') {
    return JSON.stringify({
      type: 'folder',
      folderKey: getLorebookFolderKey(entry) ?? '',
      label: String(entry?.name ?? entry?.comment ?? '').trim(),
    });
  }

  return JSON.stringify({
    type: 'entry',
    mode: String(entry?.mode ?? ''),
    folder: String(entry?.folder ?? ''),
    label: String(entry?.name ?? entry?.comment ?? '').trim(),
    keys: normalizeLorebookKeys(entry),
    content: String(entry?.content ?? ''),
    insertionOrder: getLorebookInsertionOrder(entry),
    constant: getLorebookConstant(entry),
    selective: Boolean(entry?.selective),
    caseSensitive: getLorebookCaseSensitive(entry),
    useRegex: getLorebookUseRegex(entry),
  });
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
  sharedFolderDirMap?: Map<string, string>,
  usedSemanticFingerprints?: Set<string>,
): LorebookExtractionPlan {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { items: [] };
  }

  const fallbackFolderMap = buildFolderMap(entries, {
    nameTransform: sanitizeFilename,
    fallbackName: 'unnamed_folder',
  });
  // sharedFolderDirMap가 주어지면 이전 호출에서 해석된 folder key → relDir 매핑을
  // 재사용한다. 서로 다른 lorebook 소스(character_book과 _moduleLorebook 등)가
  // 같은 folder key UUID를 공유하면 같은 디렉토리로 귀결되어 중복을 방지한다.
  const folderDirMap = buildLorebookFolderDirMap(entries, allocateDir, sharedFolderDirMap);
  const used = usedRelPaths || new Set<string>();
  const usedFingerprints = usedSemanticFingerprints || new Set<string>();
  const items: LorebookExtractionEntry[] = [];
  // 이미 동일 folder key로 entry dedupe — 여러 소스가 같은 폴더를 중복 선언해도
  // 실제 디렉토리는 한 번만 기록한다.
  const emittedFolderKeys = new Set<string>();
  if (sharedFolderDirMap) {
    // 이전 호출에서 이미 folder 아이템이 emit된 키들을 스킵하기 위한 외부 표식은
    // 호출자 책임. 여기서는 이 호출 내의 dedupe만 수행한다.
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const name = sanitizeFilename(entry.name || entry.comment || `entry_${i}`);

    if (entry.mode === 'folder') {
      const folderFingerprint = getLorebookSemanticFingerprint(entry);
      if (usedFingerprints.has(folderFingerprint)) continue;

      const folderKey = getLorebookFolderKey(entry);
      const relDir =
        folderKey && folderDirMap.has(folderKey)
          ? folderDirMap.get(folderKey)!
          : allocateDir('', entry.name || entry.comment || `folder_${i}`);

      // 같은 folder key가 여러 소스에 등장할 수 있으므로 dedupe.
      if (folderKey && emittedFolderKeys.has(folderKey)) continue;
      if (folderKey) emittedFolderKeys.add(folderKey);
      usedFingerprints.add(folderFingerprint);

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

    const entryFingerprint = getLorebookSemanticFingerprint(entry);
    if (usedFingerprints.has(entryFingerprint)) continue;

    let fileName = `${name}.json`;
    let relPath = relDir ? `${relDir}/${fileName}` : fileName;
    let serial = 1;
    while (used.has(relPath)) {
      fileName = `${name}_${serial}.json`;
      relPath = relDir ? `${relDir}/${fileName}` : fileName;
      serial += 1;
    }
    used.add(relPath);
    usedFingerprints.add(entryFingerprint);

    items.push({
      type: 'entry',
      source,
      relPath: toPosix(relPath),
      data: entry,
    });
  }

  return { items };
}
