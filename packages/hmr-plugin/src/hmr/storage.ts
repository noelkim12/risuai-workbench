export interface HmrMapping {
  connectionString: string
  stableId: string
  kind: "character" | "module"
  targetChaId?: string | undefined
  targetModuleId?: string | undefined
  targetLabel: string
  appliedVersion: number
  badgeEnabled: boolean
  assetCache: Record<string, string>
  savedAtMs: number
}

export interface MappingStorageDeps {
  getItem(key: string): Promise<unknown>
  setItem(key: string, value: unknown): Promise<void>
  removeItem(key: string): Promise<void>
}

export interface MappingStore {
  load(): Promise<HmrMapping | null>
  save(mapping: HmrMapping): Promise<void>
  clear(): Promise<void>
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
    isAssetCache(value["assetCache"]) &&
    typeof value["savedAtMs"] === "number"
  )
}

export function createMappingStore(storage: MappingStorageDeps): MappingStore {
  return {
    async load() {
      const raw = await storage.getItem(STORAGE_KEY)
      return isMapping(raw) ? raw : null
    },
    async save(mapping) {
      await storage.setItem(STORAGE_KEY, mapping)
    },
    async clear() {
      await storage.removeItem(STORAGE_KEY)
    },
  }
}
