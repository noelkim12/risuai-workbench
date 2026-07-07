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
  /** @deprecated No longer consumed by generateWhitelistRegex. Kept for backward compat with existing asset-catalog.json. */
  readonly fallbackTemplate: string;
  readonly outputTemplate: string;
}

export interface AssetCatalogBootstrapGroupOverrideConfig {
  readonly firstToken: string;
  readonly slotTokenCounts: Partial<Record<AssetSlotId, number>>;
}

/** Catalog bootstrap 생성 규칙의 persist 형태. CatalogBootstrapModal 재진입 시 seed 소스다. */
export interface AssetCatalogBootstrapConfig {
  readonly separator: string;
  readonly slotTokenCounts: Partial<Record<AssetSlotId, number>>;
  readonly groupOverrides?: readonly AssetCatalogBootstrapGroupOverrideConfig[];
}

export interface AssetCatalog {
  readonly version: 1;
  readonly schema: AssetCatalogSchema;
  readonly vocab: Partial<Record<AssetSlotId, string[]>>;
  readonly expected: AssetExpectedMap;
  readonly assignments: Record<string, AssetSlotValues>;
  readonly outputs?: AssetCatalogOutputsConfig;
  readonly bootstrap?: AssetCatalogBootstrapConfig;
}

export const DEFAULT_ASSET_OUTPUTS: AssetCatalogOutputsConfig = {
  tagFormat: { prefix: '<img src="', suffix: '">' },
  fallbackTemplate: '{s1}_default',
  outputTemplate: '<img src="{{raw::{name}}}" alt="{name}">',
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
  if (raw.outputTemplate !== undefined && typeof raw.outputTemplate !== 'string') return null;
  return {
    tagFormat: { prefix: raw.tagFormat.prefix, suffix: raw.tagFormat.suffix },
    fallbackTemplate: raw.fallbackTemplate,
    outputTemplate:
      typeof raw.outputTemplate === 'string' ? raw.outputTemplate : DEFAULT_ASSET_OUTPUTS.outputTemplate,
  };
}

function parseSlotTokenCounts(raw: unknown): Partial<Record<AssetSlotId, number>> | null {
  if (!isPlainRecord(raw)) return null;
  const counts: Partial<Record<AssetSlotId, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isSlotId(key) || typeof value !== 'number' || !Number.isInteger(value) || value < 1) return null;
    counts[key] = value;
  }
  return counts;
}

function parseBootstrap(raw: unknown): AssetCatalogBootstrapConfig | null | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainRecord(raw) || typeof raw.separator !== 'string') return null;
  const slotTokenCounts = parseSlotTokenCounts(raw.slotTokenCounts);
  if (slotTokenCounts === null) return null;
  if (raw.groupOverrides === undefined) return { separator: raw.separator, slotTokenCounts };
  if (!Array.isArray(raw.groupOverrides)) return null;
  const groupOverrides: AssetCatalogBootstrapGroupOverrideConfig[] = [];
  for (const entry of raw.groupOverrides) {
    if (!isPlainRecord(entry) || typeof entry.firstToken !== 'string' || entry.firstToken.length === 0) return null;
    const counts = parseSlotTokenCounts(entry.slotTokenCounts);
    if (counts === null) return null;
    groupOverrides.push({ firstToken: entry.firstToken, slotTokenCounts: counts });
  }
  return { separator: raw.separator, slotTokenCounts, groupOverrides };
}

export function parseAssetCatalog(raw: unknown): AssetCatalog | null {
  if (!isPlainRecord(raw) || raw.version !== 1) return null;
  const schema = parseSchema(raw.schema);
  const vocab = parseVocab(raw.vocab);
  const expected = parseExpected(raw.expected);
  const assignments = parseAssignments(raw.assignments);
  const outputs = parseOutputs(raw.outputs);
  const bootstrap = parseBootstrap(raw.bootstrap);
  if (!schema || !vocab || !expected || !assignments || outputs === null || bootstrap === null) return null;

  let catalog: AssetCatalog = { version: 1, schema, vocab, expected, assignments };
  if (outputs !== undefined) catalog = { ...catalog, outputs };
  if (bootstrap !== undefined) catalog = { ...catalog, bootstrap };
  return catalog;
}

export function serializeAssetCatalog(catalog: AssetCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
