import type { MergeMode } from './merge'

export interface HmrMapping {
  connectionString: string
  stableId: string
  kind: "character" | "module"
  targetChaId?: string | undefined
  targetModuleId?: string | undefined
  targetLabel: string
  appliedVersion: number
  badgeEnabled: boolean
  mergeMode: MergeMode
  autoApply: boolean
  paused?: boolean
  /** 연결 해제한 매핑. 로드 시 자동 재연결은 건너뛰고 '최근 연결로 재연결'에만 쓴다. */
  disconnected?: boolean
  assetCache: Record<string, string>
  savedAtMs: number
}

export interface MappingStorageDeps {
  getItem(key: string): Promise<unknown>
  setItem(key: string, value: unknown): Promise<void>
}

export interface MappingStore {
  load(): Promise<HmrMapping | null>
  save(mapping: HmrMapping): Promise<void>
}

const STORAGE_KEY = "mapping-v1"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string"
}

function isAssetCache(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((assetPath) => typeof assetPath === "string")
}

function isMapping(value: unknown): value is HmrMapping {
  return (
    isRecord(value) &&
    typeof value["connectionString"] === "string" &&
    typeof value["stableId"] === "string" &&
    (value["kind"] === "character" || value["kind"] === "module") &&
    isOptionalString(value["targetChaId"]) &&
    isOptionalString(value["targetModuleId"]) &&
    typeof value["targetLabel"] === "string" &&
    typeof value["appliedVersion"] === "number" &&
    typeof value["badgeEnabled"] === "boolean" &&
    (value["mergeMode"] === "merge-by-name" || value["mergeMode"] === "replace") &&
    (value["autoApply"] === undefined || typeof value["autoApply"] === "boolean") &&
    (value["paused"] === undefined || typeof value["paused"] === "boolean") &&
    (value["disconnected"] === undefined || typeof value["disconnected"] === "boolean") &&
    isAssetCache(value["assetCache"]) &&
    typeof value["savedAtMs"] === "number"
  )
}

export function createMappingStore(storage: MappingStorageDeps): MappingStore {
  return {
    async load() {
      const raw = await storage.getItem(STORAGE_KEY)
      return isMapping(raw) ? { ...raw, autoApply: raw.autoApply ?? true, paused: raw.paused ?? false } : null
    },
    async save(mapping) {
      await storage.setItem(STORAGE_KEY, mapping)
    },
  }
}
