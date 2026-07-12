import { describe, expect, it, vi } from 'vitest';

import { HmrController, HmrTargetMissingError, type ControllerDeps, type HmrEvent, type HmrPublicState } from '../src/hmr/controller';
import { createMappingStore } from '../src/hmr/storage';

const CONN = 'risu-hmr://127.0.0.1:41520#k=tok';

interface Fake {
  readonly deps: ControllerDeps;
  readonly states: HmrPublicState[];
  readonly events: HmrEvent[];
  readonly characters: unknown[];
  readonly modules: unknown[];
  readonly written: Array<{ readonly index: number; readonly character: Record<string, unknown> }>;
  readonly moduleWrites: unknown[][];
  readonly alerts: string[];
  readonly requestedUrls: string[];
  setHealth(health: unknown): void;
  pushWatch(response: unknown): void;
  setPayload(payload: unknown): void;
  releaseAll(): void;
}

function makeFake(): Fake {
  const states: HmrPublicState[] = [];
  const events: HmrEvent[] = [];
  const written: Array<{ readonly index: number; readonly character: Record<string, unknown> }> = [];
  const moduleWrites: unknown[][] = [];
  const alerts: string[] = [];
  const requestedUrls: string[] = [];
  const characters: unknown[] = [
    { chaId: 'cha-1', type: 'character', name: 'Old', desc: 'old', chats: [{ m: 1 }], chatPage: 2 },
  ];
  const modules: unknown[] = [
    { id: 'mod-1', name: 'Old module', enabledModules: ['keep'] },
  ];
  let health: unknown = {
    app: 'risu-workbench-hmr',
    protocolVersion: 2,
    project: { name: 'Aria', kind: 'character', stableId: 'sid-1' },
    version: 1,
  };
  let payload: unknown = { kind: 'character', data: { name: 'New', desc: 'new' }, assets: [] };
  const watchQueue: unknown[] = [];
  let stopped = false;

  const storageBacking = new Map<string, unknown>();
  const store = createMappingStore({
    getItem: async (key) => storageBacking.get(key),
    setItem: async (key, value) => void storageBacking.set(key, value),
    removeItem: async (key) => void storageBacking.delete(key),
  });

  const deps: ControllerDeps = {
    getPlatform: async () => 'tauri',
    fetchJson: async (url: string) => {
      requestedUrls.push(url);
      if (url.includes('/health')) return health;
      if (url.includes('/payload')) return payload;
      if (url.includes('/watch')) {
        while (watchQueue.length === 0) {
          if (stopped) return { version: 0, definitionChanged: false, changedAssets: [], stableId: 'sid-1' };
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        const next = watchQueue.shift();
        if (next instanceof Error) throw next;
        return next;
      }
      throw new Error(`unexpected url: ${url}`);
    },
    fetchBinary: async (url: string) => {
      requestedUrls.push(url);
      return new Uint8Array([1, 2, 3]);
    },
    getCharacters: async () => characters,
    setCharacterToIndex: async (index, character) => {
      const record = toRecord(character);
      written.push({ index, character: record });
      characters[index] = record;
    },
    getModules: async () => modules,
    setModulesLite: async (nextModules) => {
      moduleWrites.push(nextModules);
      modules.splice(0, modules.length, ...nextModules);
    },
    persistDatabase: async () => {},
    probeImage: async () => false,
    saveAsset: async () => 'assets/x.png',
    store,
    sleep: async () => {},
    onState: (state) => states.push(state),
    onEvent: (event) => events.push(event),
    alertError: async (message) => void alerts.push(message),
    idlePersistDelayMs: 1,
  };

  return {
    deps,
    states,
    events,
    characters,
    modules,
    written,
    moduleWrites,
    alerts,
    requestedUrls,
    setHealth: (value) => {
      health = value;
    },
    pushWatch: (response) => void watchQueue.push(response),
    setPayload: (value) => {
      payload = value;
    },
    releaseAll: () => {
      stopped = true;
    },
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('expected record');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

function countRequests(urls: readonly string[], path: string): number {
  return urls.filter((url) => url.includes(path)).length;
}

describe('HmrController', () => {
  it('connects on web platform when the local server is reachable', async () => {
    const fake = makeFake();
    fake.deps.getPlatform = async () => 'web';
    const controller = new HmrController(fake.deps);

    const health = await controller.connect(CONN);
    expect(health.project.stableId).toBe('sid-1');
    expect(controller.getState().phase).toBe('selecting');
  });

  it('explains the Plain Fetch requirement when web connect fails', async () => {
    const fake = makeFake();
    fake.deps.getPlatform = async () => 'web';
    fake.deps.fetchJson = async () => {
      throw new Error('Failed to fetch');
    };
    const controller = new HmrController(fake.deps);

    await expect(controller.connect(CONN)).rejects.toThrow(/Plain Fetch/);
  });

  it('rejects protocolVersion mismatch', async () => {
    const fake = makeFake();
    fake.setHealth({ app: 'risu-workbench-hmr', protocolVersion: 99, project: { name: 'A', kind: 'character', stableId: 's' }, version: 1 });
    const controller = new HmrController(fake.deps);

    await expect(controller.connect(CONN)).rejects.toThrow(/protocol/i);
  });

  it('buildConfirmDiff compares payload against the selected character', async () => {
    const fake = makeFake();
    fake.setPayload({ kind: 'character', data: { name: 'New', desc: 'new', chats: [], chaId: 'evil' }, assets: [] });
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);

    const diff = await controller.buildConfirmDiff({ chaId: 'cha-1' });

    expect(diff.status).toBe('different');
    const byKey = new Map(diff.fields.map((field) => [field.key, field]));
    expect(byKey.get('name')?.kind).toBe('modified');
    expect(byKey.get('desc')?.kind).toBe('modified');
    expect(byKey.has('chats')).toBe(false);
    expect(byKey.has('chaId')).toBe(false);
    expect(fake.written).toHaveLength(0);
  });

  it('buildConfirmDiff compares payload against the selected module', async () => {
    const fake = makeFake();
    fake.setHealth({ app: 'risu-workbench-hmr', protocolVersion: 2, project: { name: 'Module', kind: 'module', stableId: 'sid-1' }, version: 1 });
    fake.setPayload({ kind: 'module', data: { id: 'ignored', name: 'New module' }, assets: [] });
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);

    const diff = await controller.buildConfirmDiff({ moduleId: 'mod-1' });

    expect(diff.fields.find((field) => field.key === 'name')?.kind).toBe('modified');
    expect(fake.moduleWrites).toHaveLength(0);
  });

  it('buildConfirmDiff throws HmrTargetMissingError when the target is gone', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);

    await expect(controller.buildConfirmDiff({ chaId: 'no-such' })).rejects.toBeInstanceOf(HmrTargetMissingError);
  });

  it('buildConfirmDiff requires connect first', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await expect(controller.buildConfirmDiff({ chaId: 'cha-1' })).rejects.toThrow(/connect/);
  });

  it('applies a character update while preserving chats and chaId', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: 'Old', badgeEnabled: false });

    fake.setPayload({ kind: 'character', data: { name: 'Newer', desc: 'v2', chats: [], chaId: 'evil' }, assets: [] });
    fake.pushWatch({ version: 2, definitionChanged: true, changedAssets: [], stableId: 'sid-1' });
    await waitFor(() => fake.written.length >= 2);

    const last = fake.written.at(-1);
    expect(last?.character['name']).toBe('Newer');
    expect(last?.character['chats']).toEqual([{ m: 1 }]);
    expect(last?.character['chaId']).toBe('cha-1');
    expect(controller.getState().updateCount).toBe(1);
    await controller.disconnect();
    fake.releaseAll();
  });

  it('ignores changedAssets-only watch responses without applying payloads', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: 'Old', badgeEnabled: false });
    await waitFor(() => countRequests(fake.requestedUrls, '/watch') >= 1);
    const initialPayloadRequests = countRequests(fake.requestedUrls, '/payload');
    const initialWrites = fake.written.length;

    fake.pushWatch({ version: 2, definitionChanged: false, changedAssets: ['hash-a'], stableId: 'sid-1' });
    await waitFor(() => countRequests(fake.requestedUrls, '/watch') >= 2);

    expect(countRequests(fake.requestedUrls, '/payload')).toBe(initialPayloadRequests);
    expect(fake.written).toHaveLength(initialWrites);
    expect(controller.getState().updateCount).toBe(0);
    await controller.disconnect();
    fake.releaseAll();
  });

  it('applies module updates with setModulesLite and does not copy enabledModules', async () => {
    const fake = makeFake();
    fake.setHealth({ app: 'risu-workbench-hmr', protocolVersion: 2, project: { name: 'Module', kind: 'module', stableId: 'sid-1' }, version: 1 });
    fake.setPayload({ kind: 'module', data: { id: 'ignored', name: 'New module', enabledModules: ['drop'] }, assets: [] });
    const controller = new HmrController(fake.deps);

    await controller.connect(CONN);
    await controller.confirmAndStart({ moduleId: 'mod-1', label: 'Old module', badgeEnabled: true });

    expect(fake.moduleWrites).toHaveLength(1);
    expect(fake.modules).toEqual([{ id: 'mod-1', name: 'New module', enabledModules: ['drop'] }]);
    expect(controller.getState().updateCount).toBe(0);
    await controller.disconnect();
    fake.releaseAll();
  });

  it('downloads assets through /asset and materializes placeholders', async () => {
    const fake = makeFake();
    fake.setPayload({
      kind: 'character',
      data: { image: 'hmr-asset://hash-a' },
      assets: [{ hash: 'hash-a', ext: 'png', role: 'icon', size: 3 }],
    });
    const controller = new HmrController(fake.deps);

    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: 'Old', badgeEnabled: false });

    expect(fake.written.at(-1)?.character['image']).toBe('assets/x.png');
    expect(fake.requestedUrls.some((url) => url.includes('/asset/hash-a?k=tok'))).toBe(true);
    await controller.disconnect();
    fake.releaseAll();
  });

  it('stopLoops halts polling but keeps the saved mapping', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: 'Old', badgeEnabled: false });

    controller.stopLoops();

    expect(await controller.getSavedTargetLabel()).toBe('Old');
    fake.releaseAll();
  });

  it('auto-reconnects only when saved stableId matches health', async () => {
    const fake = makeFake();
    const first = new HmrController(fake.deps);
    await first.connect(CONN);
    await first.confirmAndStart({ chaId: 'cha-1', label: 'Old', badgeEnabled: true });
    first.stopLoops();

    const second = new HmrController(fake.deps);
    await expect(second.tryAutoReconnect()).resolves.toBe(true);
    expect(second.getState().phase).toBe('active');
    expect(second.getState().targetLabel).toBe('Old');

    second.stopLoops();
    fake.setHealth({ app: 'risu-workbench-hmr', protocolVersion: 2, project: { name: 'Other', kind: 'character', stableId: 'other' }, version: 1 });
    const third = new HmrController(fake.deps);
    await expect(third.tryAutoReconnect()).resolves.toBe(false);
    fake.releaseAll();
  });

  it('safe-stops without applying when a watch response reports a different stableId', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: 'Old', badgeEnabled: false });
    const initialWrites = fake.written.length;

    fake.setPayload({ kind: 'character', data: { name: 'Bob definition', desc: 'not for Aria' }, assets: [] });
    fake.pushWatch({ version: 2, definitionChanged: true, changedAssets: [], stableId: 'sid-OTHER' });
    await waitFor(() => controller.getState().phase === 'stoppedError');

    expect(fake.written).toHaveLength(initialWrites);
    expect(fake.characters[0]).toMatchObject({ name: 'New' });
    expect(fake.alerts.length).toBeGreaterThan(0);
    fake.releaseAll();
  });

  it('safe-stops on stableId mismatch even when the reported version is not newer', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: 'Old', badgeEnabled: false });
    const initialWrites = fake.written.length;

    fake.pushWatch({ version: 1, definitionChanged: false, changedAssets: [], stableId: 'sid-OTHER' });
    await waitFor(() => controller.getState().phase === 'stoppedError');

    expect(fake.written).toHaveLength(initialWrites);
    fake.releaseAll();
  });

  it('safe-stops when broadcast stableId changes after reconnect', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: 'Old', badgeEnabled: false });

    fake.setHealth({ app: 'risu-workbench-hmr', protocolVersion: 2, project: { name: 'Bob', kind: 'character', stableId: 'sid-OTHER' }, version: 1 });
    fake.pushWatch(new Error('conn refused'));
    await waitFor(() => controller.getState().phase === 'stoppedError');

    expect(fake.alerts.length).toBeGreaterThan(0);
    fake.releaseAll();
  });

  it('emits initialSynced once after confirmAndStart applies the payload', async () => {
    const fake = makeFake();
    fake.setPayload({
      kind: 'character',
      data: { name: 'New', desc: 'new' },
      assets: [
        { hash: 'h1', ext: 'png', role: 'icon', size: 10 },
        { hash: 'h2', ext: 'png', role: 'emotion', size: 10 },
      ],
    });
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);

    await controller.confirmAndStart({ chaId: 'cha-1', label: '미카', badgeEnabled: true });
    controller.stopLoops();

    expect(fake.events).toEqual([{ kind: 'initialSynced', version: 1, assetCount: 2 }]);
  });

  it('emits applied with fromVersion when a watch response changes the definition', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: '미카', badgeEnabled: true });

    fake.pushWatch({ version: 2, definitionChanged: true, changedAssets: ['a', 'b'], stableId: 'sid-1' });
    await vi.waitFor(() => expect(fake.events).toHaveLength(2));
    controller.stopLoops();
    fake.releaseAll();

    expect(fake.events[1]).toEqual({ kind: 'applied', fromVersion: 1, version: 2, assetCount: 2 });
  });

  it('does not emit when a watch response reports no definition change', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: '미카', badgeEnabled: true });
    const afterInitial = fake.events.length;

    fake.pushWatch({ version: 2, definitionChanged: false, changedAssets: ['a'], stableId: 'sid-1' });
    fake.pushWatch({ version: 3, definitionChanged: true, changedAssets: [], stableId: 'sid-1' });
    await vi.waitFor(() => expect(fake.events.length).toBeGreaterThan(afterInitial));
    controller.stopLoops();
    fake.releaseAll();

    expect(fake.events.slice(afterInitial)).toEqual([
      { kind: 'applied', fromVersion: 1, version: 3, assetCount: 0 },
    ]);
  });

  it('does not emit applied when the apply fails because the target was deleted', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: '미카', badgeEnabled: true });
    const afterInitial = fake.events.length;

    fake.characters.length = 0;
    fake.pushWatch({ version: 2, definitionChanged: true, changedAssets: [], stableId: 'sid-1' });
    await vi.waitFor(() => expect(fake.alerts.length).toBeGreaterThan(0));
    controller.stopLoops();
    fake.releaseAll();

    expect(fake.events).toHaveLength(afterInitial);
  });

  it('emits applied when tryAutoReconnect catches up to a newer version', async () => {
    const fake = makeFake();
    const first = new HmrController(fake.deps);
    await first.connect(CONN);
    await first.confirmAndStart({ chaId: 'cha-1', label: '미카', badgeEnabled: true });
    first.stopLoops();
    fake.events.length = 0;

    fake.setHealth({
      app: 'risu-workbench-hmr',
      protocolVersion: 2,
      project: { name: 'Aria', kind: 'character', stableId: 'sid-1' },
      version: 5,
    });
    const revived = new HmrController(fake.deps);
    const reconnected = await revived.tryAutoReconnect();
    revived.stopLoops();
    fake.releaseAll();

    expect(reconnected).toBe(true);
    expect(fake.events).toEqual([{ kind: 'applied', fromVersion: 1, version: 5, assetCount: 0 }]);
  });

  it('emits applied when resume catches up through refreshOnce', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: '미카', badgeEnabled: true });
    controller.pause();
    fake.events.length = 0;

    fake.setHealth({
      app: 'risu-workbench-hmr',
      protocolVersion: 2,
      project: { name: 'Aria', kind: 'character', stableId: 'sid-1' },
      version: 7,
    });
    controller.resume();
    await vi.waitFor(() => expect(fake.events).toHaveLength(1));
    controller.stopLoops();
    fake.releaseAll();

    expect(fake.events[0]).toEqual({ kind: 'applied', fromVersion: 1, version: 7, assetCount: 0 });
  });
});
