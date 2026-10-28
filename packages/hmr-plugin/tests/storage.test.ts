import { describe, expect, it } from "vitest"

import { createMappingStore, type HmrMapping, type MappingStorageDeps } from "../src/hmr/storage"

function makeFakeStorage(): MappingStorageDeps {
  const backing = new Map<string, unknown>()

  return {
    getItem: async (key: string) => backing.get(key),
    setItem: async (key: string, value: unknown) => {
      backing.set(key, value)
    },
  }
}

const CHARACTER_MAPPING: HmrMapping = {
  connectionString: "risu-hmr://127.0.0.1:41520#k=tok",
  stableId: "sid",
  kind: "character",
  targetChaId: "cha-1",
  targetModuleId: undefined,
  targetLabel: "Aria",
  appliedVersion: 3,
  badgeEnabled: true,
  mergeMode: "merge-by-name",
  autoApply: true,
  paused: false,
  assetCache: { aaa: "assets/aaa.png" },
  savedAtMs: 1,
}

const MODULE_MAPPING: HmrMapping = {
  connectionString: "risu-hmr://127.0.0.1:41521#k=tok2",
  stableId: "module-sid",
  kind: "module",
  targetChaId: undefined,
  targetModuleId: "module-1",
  targetLabel: "Weather Module",
  appliedVersion: 4,
  badgeEnabled: false,
  mergeMode: "replace",
  autoApply: false,
  paused: true,
  assetCache: {},
  savedAtMs: 2,
}

describe("createMappingStore", () => {
  it("requires legacy mappings to be confirmed and defaults only missing autoApply", async () => {
    const storage = makeFakeStorage()
    const store = createMappingStore(storage)
    await storage.setItem("mapping-v1", { ...CHARACTER_MAPPING, mergeMode: undefined })
    expect(await store.load()).toBeNull()
    await storage.setItem("mapping-v1", { ...CHARACTER_MAPPING, autoApply: undefined })
    expect((await store.load())?.autoApply).toBe(true)
    await storage.setItem("mapping-v1", { ...CHARACTER_MAPPING, paused: undefined })
    expect((await store.load())?.paused).toBe(false)
    await storage.setItem("mapping-v1", { ...CHARACTER_MAPPING, paused: "yes" })
    expect(await store.load()).toBeNull()
    await storage.setItem("mapping-v1", { ...CHARACTER_MAPPING, autoApply: "yes" })
    expect(await store.load()).toBeNull()
  })
  it("round-trips a character mapping", async () => {
    const store = createMappingStore(makeFakeStorage())

    expect(await store.load()).toBeNull()
    await store.save(CHARACTER_MAPPING)

    expect(await store.load()).toEqual(CHARACTER_MAPPING)
  })

  it("round-trips a module mapping with explicit undefined optional target ids", async () => {
    const store = createMappingStore(makeFakeStorage())

    await store.save(MODULE_MAPPING)

    expect(await store.load()).toEqual(MODULE_MAPPING)
  })

  it("rejects corrupt stored values as null", async () => {
    const storage = makeFakeStorage()
    await storage.setItem("mapping-v1", { garbage: true })
    const store = createMappingStore(storage)

    expect(await store.load()).toBeNull()
  })
})
