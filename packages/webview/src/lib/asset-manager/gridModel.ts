/**
 * Asset Manager 그리드/매트릭스 순수 로직.
 * 필터·정렬·가상 스크롤 창 계산·선택 모델과 missing 매트릭스 클라이언트 미러.
 * @file packages/webview/src/lib/asset-manager/gridModel.ts
 */

import type { AssetCatalogMirror, AssetManagerAssetEntry, AssetSlotId } from '../types/assetManager';

export interface AssetGridFilter {
  readonly subdir: string | 'all';
  readonly query: string;
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

export function filterAssetEntries(
  entries: readonly AssetManagerAssetEntry[],
  filter: AssetGridFilter,
): AssetManagerAssetEntry[] {
  const query = filter.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.subdir !== 'all' && entry.subdir !== filter.subdir) return false;
    if (filter.onlyUnassigned && !entry.flags.unassigned) return false;
    if (filter.onlyDuplicate && !entry.flags.duplicate) return false;
    if (!query) return true;

    return searchableEntryText(entry).includes(query);
  });
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

export function computeMissingMatrixClient(catalog: AssetCatalogMirror, s1?: string): MissingMatrixClient | null {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);

  if (slotIds.length === 3) {
    if (s1 === undefined) return null;
    return computeThreeSlotMatrix(catalog, s1);
  }

  if (slotIds.length === 2) return computeTwoSlotMatrix(catalog);
  return computeOneSlotMatrix(catalog);
}

function searchableEntryText(entry: AssetManagerAssetEntry): string {
  return [entry.path, entry.fileStem, entry.generatedName ?? '', ...Object.values(entry.assignment ?? {})]
    .join(' ')
    .toLowerCase();
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

function computeThreeSlotMatrix(catalog: AssetCatalogMirror, s1: string): MissingMatrixClient {
  const rows = expectedListForClient(catalog, s1, 's2');
  const cols = expectedListForClient(catalog, s1, 's3');
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

function computeTwoSlotMatrix(catalog: AssetCatalogMirror): MissingMatrixClient {
  const rows = [...(catalog.vocab.s1 ?? [])];
  const cols = [...(catalog.vocab.s2 ?? [])];
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
