/**
 * Missing asset 계산.
 * per-s1 expected 집합(스펙 §4.1)을 기준으로 매트릭스/누락 콤보/중복 name을 계산함.
 * @file packages/core/src/domain/asset/missing.ts
 */

import type { AssetCatalog, AssetSlotId, AssetSlotValues } from './catalog';
import { renderAssetName } from './naming';

export type MissingCellState = 'present' | 'duplicate' | 'missing' | 'excluded';

export interface MissingCell {
  readonly row: string;
  readonly col: string;
  readonly state: MissingCellState;
  readonly count: number;
  readonly paths: readonly string[];
}

export interface MissingMatrix {
  readonly rowSlotId: AssetSlotId;
  readonly colSlotId: AssetSlotId | null;
  readonly rows: readonly string[];
  readonly cols: readonly string[];
  readonly cells: readonly (readonly MissingCell[])[];
}

export interface MissingCombo {
  readonly slots: AssetSlotValues;
  readonly name: string | null;
}

export interface DuplicateNameGroup {
  readonly name: string;
  readonly paths: readonly string[];
}

interface MissingMatrixOptions {
  readonly s1?: string;
}

export function expectedListFor(
  catalog: AssetCatalog,
  s1Value: string,
  slotId: Exclude<AssetSlotId, 's1'>,
): string[] {
  const override = catalog.expected[s1Value]?.[slotId];
  if (override === undefined || override === null) return catalog.vocab[slotId] ?? [];
  return override;
}

function comboKey(values: readonly (string | undefined)[]): string {
  return values.map((value) => value ?? '').join('\u0000');
}

function groupAssignments(catalog: AssetCatalog, slotIds: readonly AssetSlotId[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const [path, slots] of Object.entries(catalog.assignments)) {
    const key = comboKey(slotIds.map((slotId) => slots[slotId]));
    const paths = groups.get(key) ?? [];
    paths.push(path);
    groups.set(key, paths);
  }

  for (const paths of groups.values()) {
    paths.sort();
  }

  return groups;
}

function cellState(count: number, excluded: boolean): MissingCellState {
  if (excluded) return 'excluded';
  if (count === 0) return 'missing';
  return count > 1 ? 'duplicate' : 'present';
}

export function computeMissingMatrix(
  catalog: AssetCatalog,
  options: MissingMatrixOptions = {},
): MissingMatrix | null {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);

  if (slotIds.length === 3) {
    const s1Value = options.s1;
    if (s1Value === undefined) return null;

    const rows = expectedListFor(catalog, s1Value, 's2');
    const cols = expectedListFor(catalog, s1Value, 's3');
    const groups = groupAssignments(catalog, ['s1', 's2', 's3']);
    const cells = rows.map((row) => cols.map((col) => {
      const paths = groups.get(comboKey([s1Value, row, col])) ?? [];
      return { row, col, state: cellState(paths.length, false), count: paths.length, paths };
    }));

    return { rowSlotId: 's2', colSlotId: 's3', rows, cols, cells };
  }

  if (slotIds.length === 2) {
    const rows = catalog.vocab.s1 ?? [];
    const cols = catalog.vocab.s2 ?? [];
    const groups = groupAssignments(catalog, ['s1', 's2']);
    const cells = rows.map((row) => {
      const expectedSet = new Set(expectedListFor(catalog, row, 's2'));
      return cols.map((col) => {
        const paths = groups.get(comboKey([row, col])) ?? [];
        const excluded = !expectedSet.has(col) && paths.length === 0;
        return { row, col, state: cellState(paths.length, excluded), count: paths.length, paths };
      });
    });

    return { rowSlotId: 's1', colSlotId: 's2', rows, cols, cells };
  }

  const rows = catalog.vocab.s1 ?? [];
  const groups = groupAssignments(catalog, ['s1']);
  const cells = rows.map((row) => {
    const paths = groups.get(comboKey([row])) ?? [];
    return [{ row, col: '', state: cellState(paths.length, false), count: paths.length, paths }];
  });

  return { rowSlotId: 's1', colSlotId: null, rows, cols: [''], cells };
}

function expectedComboProduct(catalog: AssetCatalog, s1Value: string): AssetSlotValues[] {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);
  if (slotIds.length === 1) return [{ s1: s1Value }];

  const s2List = expectedListFor(catalog, s1Value, 's2');
  if (slotIds.length === 2) return s2List.map((s2) => ({ s1: s1Value, s2 }));

  const s3List = expectedListFor(catalog, s1Value, 's3');
  return s2List.flatMap((s2) => s3List.map((s3) => ({ s1: s1Value, s2, s3 })));
}

export function listMissingCombos(catalog: AssetCatalog): MissingCombo[] {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);
  const groups = groupAssignments(catalog, slotIds);
  const missing: MissingCombo[] = [];

  for (const s1Value of catalog.vocab.s1 ?? []) {
    for (const combo of expectedComboProduct(catalog, s1Value)) {
      const key = comboKey(slotIds.map((slotId) => combo[slotId]));
      if ((groups.get(key) ?? []).length === 0) {
        missing.push({ slots: combo, name: renderAssetName(catalog.schema, combo) });
      }
    }
  }

  return missing;
}

export function findDuplicateNameGroups(catalog: AssetCatalog): DuplicateNameGroup[] {
  const byName = new Map<string, string[]>();

  for (const [path, slots] of Object.entries(catalog.assignments)) {
    const name = renderAssetName(catalog.schema, slots);
    if (name !== null) {
      const paths = byName.get(name) ?? [];
      paths.push(path);
      byName.set(name, paths);
    }
  }

  return [...byName.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([name, paths]) => ({ name, paths: [...paths].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
