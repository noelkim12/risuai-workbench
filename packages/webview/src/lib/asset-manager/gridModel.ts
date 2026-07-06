/**
 * Asset Manager 그리드/매트릭스 순수 로직.
 * 필터·정렬·가상 스크롤 창 계산·선택 모델과 missing 매트릭스 클라이언트 미러.
 * @file packages/webview/src/lib/asset-manager/gridModel.ts
 */

import type {
  AssetCatalogMirror,
  AssetManagerAssetEntry,
  AssetSlotDefinition,
  AssetSlotId,
  AssetSlotValues,
} from '../types/assetManager';

const ASSET_SLOT_IDS = ['s1', 's2', 's3'] as const;

export interface AssetGridFilter {
  readonly subdir: string | 'all';
  readonly query: string;
  readonly slotFilters: AssetSlotValues;
  readonly onlyUnassigned: boolean;
  readonly onlyDuplicate: boolean;
}

export type AssetGridSortKey = 'name' | 'size' | 'mtime';

export interface VirtualWindowOptions {
  readonly scrollTop: number;
  readonly viewportHeight: number;
  readonly tileSize: number;
  readonly gap: number;
  readonly columns: number;
  readonly totalItems: number;
  readonly overscanRows: number;
}

export interface VirtualWindow {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly topPadding: number;
  readonly bottomPadding: number;
  readonly totalHeight: number;
}

export type TileSelectionMode = 'single' | 'toggle' | 'range';
export type MissingCellState = 'present' | 'duplicate' | 'missing' | 'excluded';

export interface MissingCellClient {
  readonly row: string;
  readonly col: string;
  readonly state: MissingCellState;
  readonly count: number;
  readonly paths: readonly string[];
}

export interface MissingMatrixClient {
  readonly rowSlotId: AssetSlotId;
  readonly colSlotId: AssetSlotId | null;
  readonly rows: readonly string[];
  readonly cols: readonly string[];
  readonly cells: readonly (readonly MissingCellClient[])[];
}

export type SummaryCellState = 'complete' | 'partial' | 'empty' | 'excluded';

export interface SummaryCellClient {
  readonly row: string;
  readonly col: string;
  readonly state: SummaryCellState;
  readonly presentCount: number;
  readonly expectedCount: number;
  readonly duplicateCount: number;
  readonly missingValues: readonly string[];
}

export interface SummaryMatrixClient {
  readonly rows: readonly string[];
  readonly cols: readonly string[];
  readonly cells: readonly (readonly SummaryCellClient[])[];
}

export interface CrossRowClient {
  readonly s2: string;
  readonly s3: string;
}

export interface CrossCellClient {
  readonly s1: string;
  readonly s2: string;
  readonly s3: string;
  readonly state: MissingCellState;
  readonly count: number;
  readonly paths: readonly string[];
}

export interface CrossMatrixClient {
  readonly rows: readonly CrossRowClient[];
  readonly cols: readonly string[]; // vocab.s1 순서
  readonly cells: readonly (readonly CrossCellClient[])[];
}

export function filterAssetEntries(
  entries: readonly AssetManagerAssetEntry[],
  filter: AssetGridFilter,
): AssetManagerAssetEntry[] {
  const query = filter.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.subdir !== 'all' && entry.subdir !== filter.subdir) return false;
    if (filter.onlyUnassigned && !entry.flags.unassigned) return false;
    if (filter.onlyDuplicate && !entry.flags.duplicate) return false;
    if (!matchesSlotFilters(entry, filter.slotFilters)) return false;
    if (!query) return true;

    return searchableEntryText(entry).includes(query);
  });
}

/**
 * 슬롯 순서(combo[i] ↔ ASSET_SLOT_IDS[i]) 조합으로 entries 필터링.
 * undefined 슬롯은 와일드카드. Matrix 셀 클릭 → 콤보 모달의 매칭 목록용.
 */
export function filterEntriesByCombo(
  entries: readonly AssetManagerAssetEntry[],
  combo: readonly (string | undefined)[],
): AssetManagerAssetEntry[] {
  return entries.filter((entry) =>
    combo.every((value, index) => {
      if (value === undefined) return true;
      const slotId = ASSET_SLOT_IDS[index];
      return slotId !== undefined && entry.assignment?.[slotId] === value;
    }),
  );
}

export function assignmentProgressLabel(
  assignment: AssetSlotValues | null,
  slots: readonly AssetSlotDefinition[],
): string | null {
  if (!assignment) return '미할당';

  const assignedCount = slots.filter((slot) => assignment[slot.id] !== undefined).length;
  if (assignedCount === 0) return '미할당';
  if (assignedCount === slots.length) return null;

  const prefixCount = countAssignedPrefix(assignment, slots);
  if (prefixCount === 0) return '부분 할당';

  const lastAssignedSlot = slots[prefixCount - 1];
  return lastAssignedSlot ? `${lastAssignedSlot.id}까지` : '부분 할당';
}

export function sortAssetEntries(entries: readonly AssetManagerAssetEntry[], sortKey: AssetGridSortKey): AssetManagerAssetEntry[] {
  return [...entries].sort((left, right) => compareEntries(left, right, sortKey));
}

export function computeVirtualWindow(options: VirtualWindowOptions): VirtualWindow {
  const columns = Math.max(1, options.columns);
  const rowHeight = Math.max(1, options.tileSize + options.gap);
  const totalItems = Math.max(0, options.totalItems);
  const totalRows = Math.ceil(totalItems / columns);
  const totalHeight = totalRows * rowHeight;
  const firstVisibleRow = Math.max(0, Math.floor(Math.max(0, options.scrollTop) / rowHeight));
  const visibleRows = Math.ceil(Math.max(0, options.viewportHeight) / rowHeight) + 1;
  const overscanRows = Math.max(0, options.overscanRows);
  const startRow = Math.min(totalRows, Math.max(0, firstVisibleRow - overscanRows));
  const endRow = Math.min(totalRows, firstVisibleRow + visibleRows + overscanRows);

  return {
    startIndex: startRow * columns,
    endIndex: Math.min(totalItems, endRow * columns),
    topPadding: startRow * rowHeight,
    bottomPadding: (totalRows - endRow) * rowHeight,
    totalHeight,
  };
}

export function applyTileSelection(
  orderedPaths: readonly string[],
  selected: ReadonlySet<string>,
  anchorPath: string | null,
  targetPath: string,
  mode: TileSelectionMode,
): { readonly selected: Set<string>; readonly anchorPath: string } {
  switch (mode) {
    case 'toggle':
      return toggleSelection(selected, targetPath);
    case 'range':
      return rangeSelection(orderedPaths, selected, anchorPath, targetPath);
    case 'single':
      return { selected: new Set([targetPath]), anchorPath: targetPath };
    default:
      return assertNever(mode);
  }
}

export function expectedListForClient(
  catalog: AssetCatalogMirror,
  s1Value: string,
  slotId: Exclude<AssetSlotId, 's1'>,
): string[] {
  const override = catalog.expected[s1Value]?.[slotId];
  if (override === undefined || override === null) return [...(catalog.vocab[slotId] ?? [])];
  return [...override];
}

/**
 * s1 을 통해 chaining 된 slot vocab.
 * expected override 가 있으면 그 큐레이션 목록을, 없으면 해당 s1 에 실제 할당된 값만
 * (vocab 순서 유지, vocab 밖 값은 뒤에 append) 반환한다. matrix pin 드롭다운 후보용.
 */
export function chainedValuesForClient(
  catalog: AssetCatalogMirror,
  s1Value: string,
  slotId: Exclude<AssetSlotId, 's1'>,
): string[] {
  const override = catalog.expected[s1Value]?.[slotId];
  if (override !== undefined && override !== null) return [...override];

  const assigned = new Set<string>();
  for (const slots of Object.values(catalog.assignments)) {
    if (slots.s1 !== s1Value) continue;
    const value = slots[slotId];
    if (value !== undefined) assigned.add(value);
  }
  const vocab = catalog.vocab[slotId] ?? [];
  const ordered = vocab.filter((value) => assigned.has(value));
  const extras = [...assigned].filter((value) => !vocab.includes(value)).sort();
  return [...ordered, ...extras];
}

export function computeMissingMatrixClient(
  catalog: AssetCatalogMirror,
  s1?: string,
  s2?: string,
  options?: MatrixViewOptions,
): MissingMatrixClient | null {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);

  if (slotIds.length === 3) {
    if (s1 === undefined) return null;
    return computeThreeSlotMatrix(catalog, s1, s2, options);
  }

  if (slotIds.length === 2) return computeTwoSlotMatrix(catalog, s1, options);
  return computeOneSlotMatrix(catalog);
}

/**
 * 3슬롯 전용 s1×s2 완성도 요약 매트릭스.
 * 셀 = 해당 (s1, s2) 에서 expected s3 조합 중 존재/누락 집계.
 * 파일 전체를 groupAssignments 로 1회 순회하므로 파일 수천 개 규모에서도 저비용.
 */
/** 요약/교차 비교 뷰 공통 옵션. */
export interface MatrixViewOptions {
  /** true 면 s2 조합 파일도 없고 명시적 expected override 도 없는 "s1-only" 값을 축에서 제외. */
  readonly hideBareS1?: boolean;
  /**
   * true 면 hideBareS1 이 켜져 있어도 "부분 조합"(s1·s2 만 있고 s3 없는) 캐릭터를 축에 포함한다.
   * 3슬롯에서 s3 축까지 완성돼야 비교 대상이 되는 기본 규칙을 s2 까지로 완화한다(2슬롯은 무영향).
   */
  readonly includePartialCombos?: boolean;
  /** 각 슬롯 축에서 제외(숨김)할 값. 해당 슬롯이 행/열 축으로 등장하는 곳에서 제거된다. */
  readonly excluded?: {
    readonly s1?: ReadonlySet<string>;
    readonly s2?: ReadonlySet<string>;
    readonly s3?: ReadonlySet<string>;
  };
}

/**
 * "완전한 조합" 파일(s1 이후 모든 슬롯이 채워진 assignment) 또는 명시적 expected override 가 있는 s1 집합.
 * 여기에 없는 s1 은 "조합이 불완전한(포트레이트/부분태그) 캐릭터" 로 간주해 조합 비교 축에서 뺄 수 있다.
 * 슬롯 수에 따라 요구 조건이 달라진다: 2슬롯이면 s2 만, 3슬롯이면 s2·s3 가 모두 있어야 비교 축에 남는다.
 * (3슬롯인데 s1·s2 만 있는 캐릭터는 s3 축 비교가 불가능하므로 제외한다.)
 */
function s1WithCombosOrOverride(catalog: AssetCatalogMirror, options?: MatrixViewOptions): Set<string> {
  const nonFirstSlotIds = catalog.schema.slots.slice(1).map((slot) => slot.id);
  // includePartialCombos 면 첫 비-첫 슬롯(s2)까지만 요구 → 3슬롯이라도 s1·s2 만 있으면 축에 포함.
  const requiredSlotIds = options?.includePartialCombos ? nonFirstSlotIds.slice(0, 1) : nonFirstSlotIds;
  const set = new Set<string>();
  for (const slots of Object.values(catalog.assignments)) {
    if (slots.s1 !== undefined && requiredSlotIds.every((slotId) => slots[slotId] !== undefined)) set.add(slots.s1);
  }
  for (const s1 of Object.keys(catalog.expected)) set.add(s1);
  return set;
}

/** hideBareS1 옵션이 켜져 있으면 조합/override 없는 s1 을 걸러낸다(includePartialCombos 로 완화 가능). excluded.s1 은 항상 제외. */
function filterAxisS1(catalog: AssetCatalogMirror, s1Values: readonly string[], options?: MatrixViewOptions): string[] {
  const excluded = options?.excluded?.s1;
  const values = excluded ? s1Values.filter((s1) => !excluded.has(s1)) : [...s1Values];
  if (!options?.hideBareS1) return values;
  const keep = s1WithCombosOrOverride(catalog, options);
  return values.filter((s1) => keep.has(s1));
}

/**
 * 실제 "완전 조합"(첫 슬롯 이후 모든 슬롯이 채워진 assignment) 에 등장하는 s2 값 ∪ expected override 의 s2.
 * 3슬롯에서 s1·s2 만 있는(s3 없는) 파일에서만 쓰인 s2 는 여기 안 들어온다 → 요약 축 노이즈 제거.
 */
function s2InFullCombosOrOverride(catalog: AssetCatalogMirror): Set<string> {
  const nonFirstSlotIds = catalog.schema.slots.slice(1).map((slot) => slot.id);
  const set = new Set<string>();
  for (const slots of Object.values(catalog.assignments)) {
    if (slots.s1 !== undefined && slots.s2 !== undefined && nonFirstSlotIds.every((slotId) => slots[slotId] !== undefined)) {
      set.add(slots.s2);
    }
  }
  for (const slotMap of Object.values(catalog.expected)) {
    for (const value of slotMap.s2 ?? []) set.add(value);
  }
  return set;
}

/** hideBareS1 시 s2 축을 "실제 완전 조합/override 에 쓰인 값" 으로 제한한다. excluded.s2 은 hideBareS1 과 무관하게 항상 제외. */
function filterAxisS2(catalog: AssetCatalogMirror, s2Values: readonly string[], options?: MatrixViewOptions): string[] {
  const excluded = options?.excluded?.s2;
  const values = excluded ? s2Values.filter((s2) => !excluded.has(s2)) : [...s2Values];
  if (!options?.hideBareS1) return values;
  const keep = s2InFullCombosOrOverride(catalog);
  return values.filter((s2) => keep.has(s2));
}

export function computeSummaryMatrixClient(catalog: AssetCatalogMirror, options?: MatrixViewOptions): SummaryMatrixClient | null {
  if (catalog.schema.slots.length !== 3) return null;
  const rows = filterAxisS1(catalog, catalog.vocab.s1 ?? [], options);
  // 열(s2)도 실제 완전 조합에 등장하는 값만 — vocab 전체를 깔면 s1·s2 만 있던 s2 가 빈 열로 새어나온다.
  const cols = filterAxisS2(catalog, catalog.vocab.s2 ?? [], options);
  const s3Excluded = options?.excluded?.s3;
  const { detailedGroups, comboGroups } = groupSummaryAssignments(catalog, s3Excluded);
  return {
    rows,
    cols,
    cells: rows.map((row) => {
      const expectedS2 = new Set(expectedListForClient(catalog, row, 's2'));
      const expectedS3 = expectedListForClient(catalog, row, 's3').filter((s3) => !s3Excluded?.has(s3));
      return cols.map((col) => summarizeSummaryCell(detailedGroups, comboGroups, row, col, expectedS2.has(col), expectedS3));
    }),
  };
}

/**
 * 3슬롯 스키마를 s3 무시하고 s1×s2 존재 여부만 비교하는 매트릭스(2슬롯 로직 재사용).
 * 셀 = 해당 (s1, s2) 로 태그된 파일이 하나라도 있으면 present(그 s3 조합은 신경쓰지 않음).
 * s3 를 의도적으로 무시하므로 축 필터는 "s2 만 있으면 유지"(includePartialCombos)로 완화한다.
 */
export function computeS1S2MatrixClient(catalog: AssetCatalogMirror, options?: MatrixViewOptions): MissingMatrixClient | null {
  if (catalog.schema.slots.length !== 3) return null;
  return computeTwoSlotMatrix(catalog, undefined, {
    hideBareS1: options?.hideBareS1,
    includePartialCombos: true,
    excluded: options?.excluded,
  });
}

/**
 * 3슬롯 전용 교차 비교 매트릭스. 행=(s2,s3) 조합 × 열=s1.
 * 행 범위 = 명시적 expected override 로 기대된 조합 ∪ 실제 파일이 있는 조합.
 *   override 없는 s1 은 행을 만들지 않는다 — vocab 전체를 깔면 |s2|×|s3| 카테시안
 *   폭발로 뷰가 프리징되고 "실제 존재/누락" 비교 신호가 빈 격자에 묻히기 때문.
 * (셀의 missing/excluded 판정은 여전히 expectedListForClient 의 vocab 폴백을 쓴다:
 *  override 없는 s1 은 "그 조합을 기대하지만 빠진" missing 으로 표시되어야 비교가 된다.)
 * vocab 순서(s2 외부 × s3 내부) 우선, vocab 밖 조합은 사전순 append.
 */
export function computeCrossMatrixClient(catalog: AssetCatalogMirror, options?: MatrixViewOptions): CrossMatrixClient | null {
  if (catalog.schema.slots.length !== 3) return null;
  const cols = filterAxisS1(catalog, catalog.vocab.s1 ?? [], options);
  const expectedS2 = new Map(cols.map((s1) => [s1, new Set(expectedListForClient(catalog, s1, 's2'))]));
  const expectedS3 = new Map(cols.map((s1) => [s1, new Set(expectedListForClient(catalog, s1, 's3'))]));

  const comboSet = new Set<string>();
  // 행 후보는 명시적 override 만 — catalog.expected 를 직접 읽어 vocab 폴백을 피한다.
  for (const s1 of cols) {
    const overrideS2 = catalog.expected[s1]?.s2;
    const overrideS3 = catalog.expected[s1]?.s3;
    if (overrideS2 == null || overrideS3 == null) continue;
    for (const s2 of overrideS2) {
      for (const s3 of overrideS3) comboSet.add(comboKey([s2, s3]));
    }
  }
  for (const slots of Object.values(catalog.assignments)) {
    if (slots.s2 !== undefined && slots.s3 !== undefined) comboSet.add(comboKey([slots.s2, slots.s3]));
  }

  const excludedS2 = options?.excluded?.s2;
  const excludedS3 = options?.excluded?.s3;
  const rows = orderCrossRows(comboSet, catalog.vocab.s2 ?? [], catalog.vocab.s3 ?? []).filter(
    (row) => !excludedS2?.has(row.s2) && !excludedS3?.has(row.s3),
  );
  const groups = groupAssignments(catalog, ['s1', 's2', 's3']);
  return {
    rows,
    cols,
    cells: rows.map(({ s2, s3 }) =>
      cols.map((s1) => {
        const paths = groups.get(comboKey([s1, s2, s3])) ?? [];
        const expected = (expectedS2.get(s1)?.has(s2) ?? false) && (expectedS3.get(s1)?.has(s3) ?? false);
        const excluded = paths.length === 0 && !expected;
        return { s1, s2, s3, state: cellState(paths.length, excluded), count: paths.length, paths };
      }),
    ),
  };
}

/** vocab 순서(s2 외부 × s3 내부) 우선 정렬, vocab 밖 조합은 (s2, s3) 사전순 append. */
function orderCrossRows(comboSet: ReadonlySet<string>, vocabS2: readonly string[], vocabS3: readonly string[]): CrossRowClient[] {
  const ordered: CrossRowClient[] = [];
  const consumed = new Set<string>();
  for (const s2 of vocabS2) {
    for (const s3 of vocabS3) {
      const key = comboKey([s2, s3]);
      if (!comboSet.has(key)) continue;
      ordered.push({ s2, s3 });
      consumed.add(key);
    }
  }
  const extras = [...comboSet]
    .filter((key) => !consumed.has(key))
    .map((key) => {
      const [s2 = '', s3 = ''] = key.split('\u0000');
      return { s2, s3 };
    })
    .sort((left, right) => left.s2.localeCompare(right.s2) || left.s3.localeCompare(right.s3));
  return [...ordered, ...extras];
}

function groupSummaryAssignments(catalog: AssetCatalogMirror, s3Excluded?: ReadonlySet<string>): {
  readonly detailedGroups: ReadonlyMap<string, readonly string[]>;
  readonly comboGroups: ReadonlyMap<string, readonly string[]>;
} {
  const detailedGroups = new Map<string, string[]>();
  const comboGroups = new Map<string, string[]>();
  for (const [path, slots] of Object.entries(catalog.assignments)) {
    const detailedKey = comboKey(['s1', 's2', 's3'].map((slotId) => slots[slotId as AssetSlotId]));
    const detailedPaths = detailedGroups.get(detailedKey) ?? [];
    detailedPaths.push(path);
    detailedGroups.set(detailedKey, detailedPaths);
    // actualCount(comboGroups) 는 "안 보는 s3" 파일을 세지 않는다 → 요약 셀 상태가 excluded s3 에 새지 않음.
    if (s3Excluded?.has(slots.s3 ?? '')) continue;
    const comboKeyValue = comboKey(['s1', 's2'].map((slotId) => slots[slotId as AssetSlotId]));
    const comboPaths = comboGroups.get(comboKeyValue) ?? [];
    comboPaths.push(path);
    comboGroups.set(comboKeyValue, comboPaths);
  }
  for (const paths of detailedGroups.values()) paths.sort();
  for (const paths of comboGroups.values()) paths.sort();
  return { detailedGroups, comboGroups };
}

function summarizeSummaryCell(
  detailedGroups: ReadonlyMap<string, readonly string[]>,
  comboGroups: ReadonlyMap<string, readonly string[]>,
  s1: string,
  s2: string,
  s2Expected: boolean,
  expectedS3: readonly string[],
): SummaryCellClient {
  let presentCount = 0;
  let duplicateCount = 0;
  const missingValues: string[] = [];
  for (const s3 of expectedS3) {
    const count = detailedGroups.get(comboKey([s1, s2, s3]))?.length ?? 0;
    if (count === 0) {
      missingValues.push(s3);
    } else {
      presentCount += 1;
      if (count > 1) duplicateCount += 1;
    }
  }
  const actualCount = comboGroups.get(comboKey([s1, s2]))?.length ?? 0;
  const state = summaryCellState(s2Expected, presentCount, expectedS3.length, actualCount);
  return { row: s1, col: s2, state, presentCount, expectedCount: expectedS3.length, duplicateCount, missingValues };
}

function summaryCellState(
  s2Expected: boolean,
  presentCount: number,
  expectedCount: number,
  actualCount: number,
): SummaryCellState {
  // expected 밖 s2 라도 실제 파일이 있으면 집계 표시(2슬롯 excluded 의미론과 동일)
  if (expectedCount === 0) return 'excluded';
  if (presentCount === 0 && !s2Expected && actualCount === 0) return 'excluded';
  if (presentCount === 0) return 'empty';
  return presentCount === expectedCount ? 'complete' : 'partial';
}

function searchableEntryText(entry: AssetManagerAssetEntry): string {
  return [entry.path, entry.fileStem, entry.generatedName ?? '', ...Object.values(entry.assignment ?? {})]
    .join(' ')
    .toLowerCase();
}

function matchesSlotFilters(entry: AssetManagerAssetEntry, slotFilters: AssetSlotValues): boolean {
  for (const slotId of ASSET_SLOT_IDS) {
    const value = slotFilters[slotId];
    if (value === undefined || value === '') continue;
    if (entry.assignment?.[slotId] !== value) return false;
  }
  return true;
}

function countAssignedPrefix(assignment: AssetSlotValues, slots: readonly AssetSlotDefinition[]): number {
  let count = 0;
  for (const slot of slots) {
    if (assignment[slot.id] === undefined) return count;
    count += 1;
  }
  return count;
}

function compareEntries(left: AssetManagerAssetEntry, right: AssetManagerAssetEntry, sortKey: AssetGridSortKey): number {
  switch (sortKey) {
    case 'size':
      return right.sizeBytes - left.sizeBytes || compareByName(left, right);
    case 'mtime':
      return right.mtimeMs - left.mtimeMs || compareByName(left, right);
    case 'name':
      return compareByName(left, right);
    default:
      return assertNever(sortKey);
  }
}

function compareByName(left: AssetManagerAssetEntry, right: AssetManagerAssetEntry): number {
  const leftName = left.generatedName ?? left.fileStem;
  const rightName = right.generatedName ?? right.fileStem;
  return leftName.localeCompare(rightName) || left.path.localeCompare(right.path);
}

function toggleSelection(selected: ReadonlySet<string>, targetPath: string): { readonly selected: Set<string>; readonly anchorPath: string } {
  const next = new Set(selected);
  if (next.has(targetPath)) next.delete(targetPath);
  else next.add(targetPath);
  return { selected: next, anchorPath: targetPath };
}

function rangeSelection(
  orderedPaths: readonly string[],
  selected: ReadonlySet<string>,
  anchorPath: string | null,
  targetPath: string,
): { readonly selected: Set<string>; readonly anchorPath: string } {
  if (anchorPath === null) return { selected: new Set([targetPath]), anchorPath: targetPath };

  const anchorIndex = orderedPaths.indexOf(anchorPath);
  const targetIndex = orderedPaths.indexOf(targetPath);
  if (anchorIndex < 0 || targetIndex < 0) return { selected: new Set([targetPath]), anchorPath: targetPath };

  const from = Math.min(anchorIndex, targetIndex);
  const to = Math.max(anchorIndex, targetIndex);
  const next = new Set(selected);
  for (const path of orderedPaths.slice(from, to + 1)) next.add(path);
  return { selected: next, anchorPath };
}

function comboKey(values: readonly (string | undefined)[]): string {
  return values.map((value) => value ?? '').join('\u0000');
}

function groupAssignments(catalog: AssetCatalogMirror, slotIds: readonly AssetSlotId[]): Map<string, readonly string[]> {
  const groups = new Map<string, string[]>();
  for (const [path, slots] of Object.entries(catalog.assignments)) {
    const key = comboKey(slotIds.map((slotId) => slots[slotId]));
    const paths = groups.get(key) ?? [];
    paths.push(path);
    groups.set(key, paths);
  }

  for (const paths of groups.values()) paths.sort();
  return groups;
}

function cellState(count: number, excluded: boolean): MissingCellState {
  if (excluded) return 'excluded';
  if (count === 0) return 'missing';
  return count > 1 ? 'duplicate' : 'present';
}

function computeThreeSlotMatrix(catalog: AssetCatalogMirror, s1: string, s2?: string, options?: MatrixViewOptions): MissingMatrixClient {
  const excludedS2 = options?.excluded?.s2;
  const excludedS3 = options?.excluded?.s3;
  // s2 조건이 걸리면 해당 outfit 한 행으로 축소(후보 검증은 호출측 드롭다운이 담당)
  const rows = (s2 ? [s2] : expectedListForClient(catalog, s1, 's2')).filter((row) => !excludedS2?.has(row));
  const cols = expectedListForClient(catalog, s1, 's3').filter((col) => !excludedS3?.has(col));
  const groups = groupAssignments(catalog, ['s1', 's2', 's3']);
  return {
    rowSlotId: 's2',
    colSlotId: 's3',
    rows,
    cols,
    cells: rows.map((row) =>
      cols.map((col) => {
        const paths = groups.get(comboKey([s1, row, col])) ?? [];
        return { row, col, state: cellState(paths.length, false), count: paths.length, paths };
      }),
    ),
  };
}

function computeTwoSlotMatrix(catalog: AssetCatalogMirror, s1?: string, options?: MatrixViewOptions): MissingMatrixClient {
  const allRows = catalog.vocab.s1 ?? [];
  // s1 pin 이 걸리면 해당 캐릭터 한 행으로 축소, 아니면 전체(옵션에 따라 s1-only 제외).
  const rows = s1 ? allRows.filter((row) => row === s1) : filterAxisS1(catalog, allRows, options);
  const excludedS2 = options?.excluded?.s2;
  const cols = (catalog.vocab.s2 ?? []).filter((col) => !excludedS2?.has(col));
  const groups = groupAssignments(catalog, ['s1', 's2']);
  return {
    rowSlotId: 's1',
    colSlotId: 's2',
    rows,
    cols,
    cells: rows.map((row) => {
      const expectedSet = new Set(expectedListForClient(catalog, row, 's2'));
      return cols.map((col) => {
        const paths = groups.get(comboKey([row, col])) ?? [];
        const excluded = !expectedSet.has(col) && paths.length === 0;
        return { row, col, state: cellState(paths.length, excluded), count: paths.length, paths };
      });
    }),
  };
}

function computeOneSlotMatrix(catalog: AssetCatalogMirror): MissingMatrixClient {
  const rows = [...(catalog.vocab.s1 ?? [])];
  const groups = groupAssignments(catalog, ['s1']);
  return {
    rowSlotId: 's1',
    colSlotId: null,
    rows,
    cols: [''],
    cells: rows.map((row) => {
      const paths = groups.get(comboKey([row])) ?? [];
      return [{ row, col: '', state: cellState(paths.length, false), count: paths.length, paths }];
    }),
  };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected variant: ${String(value)}`);
}
