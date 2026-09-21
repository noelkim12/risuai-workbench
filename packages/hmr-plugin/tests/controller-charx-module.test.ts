import { describe, expect, it } from 'vitest';

import { HmrController, type ControllerDeps } from '../src/hmr/controller';
import { HMR_PROTOCOL_VERSION } from '../src/hmr/protocol';

const CONNECTION = 'risu-hmr://127.0.0.1:41520#k=tok';

function makeFixture(payloadData: Record<string, unknown>): {
  readonly controller: HmrController;
  readonly modules: unknown[];
  readonly moduleWrites: unknown[][];
} {
  const modules: unknown[] = [{ id: 'mod-1', name: 'Old module', enabledModules: ['keep'] }];
  const moduleWrites: unknown[][] = [];
  const deps: ControllerDeps = {
    getPlatform: async () => 'tauri',
    fetchJson: async (url) => {
      if (url.includes('/health')) {
        return {
          app: 'risu-workbench-hmr',
          protocolVersion: HMR_PROTOCOL_VERSION,
          project: { name: 'Aria', kind: 'character', stableId: 'sid-1' },
          version: 1,
        };
      }
      if (url.includes('/payload')) return { kind: 'character', data: payloadData, assets: [] };
      if (url.includes('/watch')) return new Promise<never>(() => {});
      throw new Error(`unexpected url: ${url}`);
    },
    fetchBinary: async () => new Uint8Array(),
    getCharacters: async () => [],
    setCharacterToIndex: async () => {
      throw new Error('character write is not expected');
    },
    getModules: async () => modules,
    setModulesLite: async (nextModules) => {
      moduleWrites.push(nextModules);
      modules.splice(0, modules.length, ...nextModules);
    },
    persistDatabase: async () => {},
    probeImage: async () => false,
    saveAsset: async () => 'unused',
    store: {
      load: async () => null,
      save: async () => {},
      clear: async () => {},
    },
    sleep: async () => {},
    onState: () => {},
    onEvent: () => {},
    alertError: async () => {},
  };
  return { controller: new HmrController(deps), modules, moduleWrites };
}

describe('charx-backed module target', () => {
  it('builds the confirmation diff from the converted module definition', async () => {
    const fixture = makeFixture({
      name: 'Aria module',
      creatorNotes: 'Module description',
      desc: 'Character description',
    });
    await fixture.controller.connect(CONNECTION);

    const diff = await fixture.controller.buildConfirmDiff({ moduleId: 'mod-1' });

    expect(diff.fields.find((field) => field.key === 'description')?.kind).toBe('added');
    expect(diff.fields.find((field) => field.key === 'lorebook')?.kind).toBe('added');
    expect(fixture.moduleWrites).toHaveLength(0);
  });

  it('applies the converted character payload to the selected module', async () => {
    const fixture = makeFixture({
      name: 'Aria module',
      creatorNotes: 'Module description',
      globalLore: [{ content: 'Base lore' }],
      desc: 'Character description',
      image: 'assets/icon.png',
    });
    await fixture.controller.connect(CONNECTION);

    await fixture.controller.confirmAndStart({ moduleId: 'mod-1', label: 'Old module', badgeEnabled: true });
    fixture.controller.stopLoops();

    expect(fixture.modules).toEqual([
      expect.objectContaining({
        id: 'mod-1',
        name: 'Aria module',
        description: 'Module description',
        icon: 'assets/icon.png',
        lorebook: [
          { content: 'Base lore' },
          expect.objectContaining({ content: expect.stringContaining('@@indicator character_desc') }),
        ],
      }),
    ]);
  });
});
