import { describe, expect, it } from "vitest"

import { createMappingStore, type HmrMapping, type MappingStorageDeps } from "../src/hmr/storage"

function makeFakeStorage(): MappingStorageDeps {
  const backing = new Map<string, unknown>()

  return {
    getItem: async (key: string) => backing.get(key),
    setItem: async (key: string, value: unknown) => {
      backing.set(key, value)
    },
    removeItem: async (key: string) => {
      backing.delete(key)
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
  assetCache: {},
  savedAtMs: 2,
}

describe("createMappingStore", () => {
  it("round-trips a character mapping and clears it", async () => {
    const store = createMappingStore(makeFakeStorage())

    expect(await store.load()).toBeNull()
    await store.save(CHARACTER_MAPPING)

    expect(await store.load()).toEqual(CHARACTER_MAPPING)

    await store.clear()

    expect(await store.load()).toBeNull()
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
