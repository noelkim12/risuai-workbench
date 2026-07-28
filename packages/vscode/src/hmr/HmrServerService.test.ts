import { afterEach, describe, expect, it } from 'vitest';
import type { HmrBuildResult } from '@risuai-workbench/core/node';
import { HmrServerService } from './HmrServerService';

function stubBuild(overrides: Partial<HmrBuildResult> = {}): HmrBuildResult {
  return {
    kind: 'character',
    data: { name: 'Aria', desc: 'v1' },
    assets: [{ hash: 'h1', ext: 'png', role: 'icon:main', size: 3 }],
    assetSources: new Map([['h1', { kind: 'buffer', buffer: Buffer.from('abc') }]]),
    ...overrides,
  };
}

const services: HmrServerService[] = [];

function makeService(build: () => HmrBuildResult): HmrServerService {
  const service = new HmrServerService({ build, longPollTimeoutMs: 100 });
  services.push(service);
  return service;
}

const TARGET = {
  stableId: 'sid-1',
  name: 'Aria',
  kind: 'character' as const,
  rootFsPath: '/tmp/unused',
};

function parseConnection(connectionString: string | undefined): { base: string; key: string } {
  const match = /^risu-hmr:\/\/127\.0\.0\.1:(\d+)#k=([0-9a-f]{32})$/.exec(connectionString ?? '');
  expect(match).not.toBeNull();
  return { base: `http://127.0.0.1:${match?.[1]}`, key: `k=${match?.[2]}` };
}

afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
});

describe('HmrServerService', () => {
  it('starts, serves /health with token, and rejects without token', async () => {
    const service = makeService(() => stubBuild());
    await service.startBroadcast(TARGET);
    const status = service.getStatus();
    expect(status.running).toBe(true);
    expect(status.connectionString).toMatch(/^risu-hmr:\/\/127\.0\.0\.1:\d+#k=[0-9a-f]{32}$/);
    const { base, key } = parseConnection(status.connectionString);

    const unauthorized = await fetch(`${base}/health`);
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('access-control-allow-origin')).toBe('*');
    expect(unauthorized.headers.get('access-control-allow-headers')).toBe('*');

    const malformed = await fetch(`${base}/health?k=${encodeURIComponent('é'.repeat(32))}`);
    expect(malformed.status).toBe(401);

    const options = await fetch(`${base}/health`, { method: 'OPTIONS' });
    expect(options.status).toBe(204);
    expect(options.headers.get('access-control-allow-origin')).toBe('*');
    expect(options.headers.get('access-control-allow-headers')).toBe('*');

    const health = await fetch(`${base}/health?${key}`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      app: 'risu-workbench-hmr',
      protocolVersion: 2,
      project: { name: 'Aria', kind: 'character', stableId: 'sid-1' },
      version: 1,
    });
  });

  it('serves /payload and /asset/<hash>', async () => {
    const service = makeService(() => stubBuild());
    await service.startBroadcast(TARGET);
    const { base, key } = parseConnection(service.getStatus().connectionString);

    const payload = await (await fetch(`${base}/payload?${key}`)).json();
    expect(payload).toMatchObject({ kind: 'character', data: { name: 'Aria' } });
    expect(payload.assets).toEqual([{ hash: 'h1', ext: 'png', role: 'icon:main', size: 3 }]);

    const asset = await fetch(`${base}/asset/h1?${key}`);
    expect(asset.status).toBe(200);
    expect(Buffer.from(await asset.arrayBuffer()).toString()).toBe('abc');

    const missing = await fetch(`${base}/asset/nope?${key}`);
    expect(missing.status).toBe(404);
  });

  it('long-polls /watch: immediate when behind, timeout no-change, wakes on rebuild', async () => {
    let desc = 'v1';
    const service = makeService(() => stubBuild({ data: { name: 'Aria', desc } }));
    await service.startBroadcast(TARGET);
    const { base, key } = parseConnection(service.getStatus().connectionString);

    const behind = await (await fetch(`${base}/watch?since=0&${key}`)).json();
    expect(behind).toMatchObject({ version: 1, definitionChanged: true });

    const idle = await (await fetch(`${base}/watch?since=1&${key}`)).json();
    expect(idle).toEqual({ version: 1, definitionChanged: false, changedAssets: [], stableId: 'sid-1' });

    const waiting = fetch(`${base}/watch?since=1&${key}`).then((res) => res.json());
    desc = 'v2';
    setTimeout(() => service.rebuild(), 20);
    const woken = await waiting;
    expect(woken).toMatchObject({ version: 2, definitionChanged: true });
    expect(service.getStatus().updateCount).toBe(1);
  });

  it('stamps watch responses with the broadcast stableId, including after a target switch', async () => {
    const service = makeService(() => stubBuild());
    await service.startBroadcast(TARGET);
    const { base, key } = parseConnection(service.getStatus().connectionString);

    const behind = await (await fetch(`${base}/watch?since=0&${key}`)).json();
    expect(behind).toMatchObject({ stableId: 'sid-1', definitionChanged: true });

    const idle = await (await fetch(`${base}/watch?since=1&${key}`)).json();
    expect(idle).toMatchObject({ stableId: 'sid-1', definitionChanged: false });

    const waiting = fetch(`${base}/watch?since=1&${key}`).then((res) => res.json());
    setTimeout(() => void service.startBroadcast({ ...TARGET, stableId: 'sid-2', name: 'Bob' }), 20);
    const woken = await waiting;
    expect(woken).toMatchObject({ stableId: 'sid-2', definitionChanged: true });
  });

  it('keeps last good version when build throws', async () => {
    let shouldThrow = false;
    const service = makeService(() => {
      if (shouldThrow) throw new Error('boom');
      return stubBuild();
    });
    await service.startBroadcast(TARGET);

    shouldThrow = true;
    service.rebuild();

    const status = service.getStatus();
    expect(status.version).toBe(1);
    expect(status.lastError).toContain('boom');
  });
});
