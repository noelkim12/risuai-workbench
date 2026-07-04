/**
 * Asset Manager 큐레이션 catalog의 타입/기본값/검증.
 * assets/asset-catalog.json이 진실의 원천이며 manifest.json은 빌드 산출물이다.
 * @file packages/core/src/domain/asset/catalog.ts
 */

export const ASSET_CATALOG_FILENAME = 'asset-catalog.json';

export type AssetSlotId = 's1' | 's2' | 's3';

const SLOT_IDS: readonly AssetSlotId[] = ['s1', 's2', 's3'];

export interface AssetSlotDefinition {
  readonly id: AssetSlotId;
  readonly label: string;
}

export interface AssetCatalogSchema {
  readonly slots: AssetSlotDefinition[];
  readonly joinTemplate: string;
}

export type AssetSlotValues = Partial<Record<AssetSlotId, string>>;

/** s1 값별 기대 슬롯 목록. null/생략 = 해당 슬롯 vocab 전체를 기대. */
export type AssetExpectedMap = Record<
  string,
  Partial<Record<Exclude<AssetSlotId, 's1'>, string[] | null>>
>;

export interface AssetCatalogOutputsConfig {
  readonly tagFormat: { readonly prefix: string; readonly suffix: string };
  readonly fallbackTemplate: string;
}

export interface AssetCatalog {
  readonly version: 1;
  readonly schema: AssetCatalogSchema;
  readonly vocab: Partial<Record<AssetSlotId, string[]>>;
  readonly expected: AssetExpectedMap;
  readonly assignments: Record<string, AssetSlotValues>;
  readonly outputs?: AssetCatalogOutputsConfig;
}

export const DEFAULT_ASSET_OUTPUTS: AssetCatalogOutputsConfig = {
  tagFormat: { prefix: '<img src="', suffix: '">' },
  fallbackTemplate: '{s1}_default',
};

export function createDefaultAssetCatalog(): AssetCatalog {
  return {
    version: 1,
    schema: {
      slots: [
        { id: 's1', label: 'character' },
        { id: 's2', label: 'emotion' },
      ],
      joinTemplate: '{s1}_{s2}',
    },
    vocab: { s1: [], s2: [] },
    expected: {},
    assignments: {},
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isSlotId(value: unknown): value is AssetSlotId {
  return typeof value === 'string' && SLOT_IDS.includes(value as AssetSlotId);
}

function parseSchema(raw: unknown): AssetCatalogSchema | null {
  if (!isPlainRecord(raw) || typeof raw.joinTemplate !== 'string' || raw.joinTemplate.length === 0) {
    return null;
  }
  if (!Array.isArray(raw.slots) || raw.slots.length < 1 || raw.slots.length > 3) return null;

  const slots: AssetSlotDefinition[] = [];
  const seen = new Set<AssetSlotId>();
  for (const slot of raw.slots) {
    if (!isPlainRecord(slot) || !isSlotId(slot.id) || typeof slot.label !== 'string') return null;
    if (seen.has(slot.id)) return null;
    seen.add(slot.id);
    slots.push({ id: slot.id, label: slot.label });
  }

  return { slots, joinTemplate: raw.joinTemplate };
}

function parseVocab(raw: unknown): AssetCatalog['vocab'] | null {
  if (!isPlainRecord(raw)) return null;
  const vocab: AssetCatalog['vocab'] = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isSlotId(key) || !isStringArray(value)) return null;
    vocab[key] = value;
  }
  return vocab;
}

function parseExpected(raw: unknown): AssetExpectedMap | null {
  if (!isPlainRecord(raw)) return null;
  const expected: AssetExpectedMap = {};
  for (const [s1Value, slotMap] of Object.entries(raw)) {
    if (!isPlainRecord(slotMap)) return null;
    const parsedSlotMap: AssetExpectedMap[string] = {};
    for (const [slotId, list] of Object.entries(slotMap)) {
      if (slotId !== 's2' && slotId !== 's3') return null;
      if (list !== null && !isStringArray(list)) return null;
      parsedSlotMap[slotId] = list;
    }
    expected[s1Value] = parsedSlotMap;
  }
  return expected;
}

function parseAssignments(raw: unknown): Record<string, AssetSlotValues> | null {
  if (!isPlainRecord(raw)) return null;
  const assignments: Record<string, AssetSlotValues> = {};
  for (const [path, slots] of Object.entries(raw)) {
    if (!isPlainRecord(slots)) return null;
    const values: AssetSlotValues = {};
    for (const [slotId, value] of Object.entries(slots)) {
      if (!isSlotId(slotId) || typeof value !== 'string') return null;
      values[slotId] = value;
    }
    assignments[path] = values;
  }
  return assignments;
}

function parseOutputs(raw: unknown): AssetCatalogOutputsConfig | null | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainRecord(raw) || !isPlainRecord(raw.tagFormat)) return null;
  if (typeof raw.tagFormat.prefix !== 'string' || typeof raw.tagFormat.suffix !== 'string') return null;
  if (typeof raw.fallbackTemplate !== 'string') return null;
  return {
    tagFormat: { prefix: raw.tagFormat.prefix, suffix: raw.tagFormat.suffix },
    fallbackTemplate: raw.fallbackTemplate,
  };
}

export function parseAssetCatalog(raw: unknown): AssetCatalog | null {
  if (!isPlainRecord(raw) || raw.version !== 1) return null;
  const schema = parseSchema(raw.schema);
  const vocab = parseVocab(raw.vocab);
  const expected = parseExpected(raw.expected);
  const assignments = parseAssignments(raw.assignments);
  const outputs = parseOutputs(raw.outputs);
  if (!schema || !vocab || !expected || !assignments || outputs === null) return null;

  const catalog: AssetCatalog = { version: 1, schema, vocab, expected, assignments };
  if (outputs !== undefined) return { ...catalog, outputs };
  return catalog;
}

export function serializeAssetCatalog(catalog: AssetCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
