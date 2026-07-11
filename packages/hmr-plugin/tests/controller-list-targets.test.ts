import { describe, expect, it } from 'vitest';

import { HmrController, type ControllerDeps } from '../src/hmr/controller';
import { createMappingStore } from '../src/hmr/storage';

function createDeps(characters: unknown[]): ControllerDeps {
  return {
    getPlatform: async () => 'tauri',
    fetchJson: async () => {
      throw new Error('fetchJson is not used by listCharacterTargets');
    },
    fetchBinary: async () => new Uint8Array(),
    getCharacters: async () => characters,
    setCharacterToIndex: async () => {},
    getModules: async () => [],
    setModulesLite: async () => {},
    persistDatabase: async () => {},
    probeImage: async () => false,
    saveAsset: async () => 'unused',
    store: createMappingStore({
      getItem: async () => undefined,
      setItem: async () => {},
      removeItem: async () => {},
    }),
    sleep: async () => {},
    onState: () => {},
    onEvent: () => {},
    alertError: async () => {},
  };
}

describe('HmrController listCharacterTargets', () => {
  it('omits soft-deleted characters with trashTime', async () => {
    const controller = new HmrController(createDeps([
      { chaId: 'active-null', type: 'character', name: 'Active Null', trashTime: null },
      { chaId: 'deleted', type: 'character', name: 'Deleted', trashTime: 1_720_000_000 },
      { chaId: 'active-legacy', type: 'character', name: 'Active Legacy' },
      { chaId: 'group', type: 'group', name: 'Group' },
    ]));

    await expect(controller.listCharacterTargets()).resolves.toEqual([
      { index: 0, chaId: 'active-null', name: 'Active Null', image: undefined },
      { index: 2, chaId: 'active-legacy', name: 'Active Legacy', image: undefined },
    ]);
  });
});
