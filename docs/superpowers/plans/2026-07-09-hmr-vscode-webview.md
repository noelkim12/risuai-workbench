# HMR VS Code & Webview (서버 · 방송 UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** extension host에 HMR HTTP 서버 싱글턴을 만들고, webview ArtifactDetailView에 [Broadcast] 버튼 + 상태 스트립을 붙인다.

**Architecture:** `node:http` 서버가 `risu-workbench-core/node`의 `buildHmrCharacterPayload`/`buildHmrModulePayload`를 in-process로 호출해 방송한다 (CLI subprocess 아님). 파일 감시는 기존 `createDebouncedTrigger`/`wireWatcherToTrigger` 재사용. webview ⇄ extension은 기존 typed message envelope 컨벤션에 3개 메시지를 추가한다. 스펙: `docs/superpowers/specs/2026-07-09-risuai-hmr-sync-design.md`.

**Tech Stack:** TypeScript strict, vscode API, node:http/node:crypto, Svelte 4 (webview), vitest.

## Global Constraints

- **선행 조건: HMR Core 계획(`2026-07-09-hmr-core.md`) 완료 + `npm run build --workspace risu-workbench-core` 실행됨** (extension은 core dist를 소비).
- 서버는 `127.0.0.1`에만 바인드. 포트 `41520–41529` 순차 시도 → 전부 실패 시 OS 임의 포트(0).
- 전 엔드포인트 토큰 필수: 쿼리 `?k=<token>`, 불일치·부재 시 **401**. 토큰 비교는 `crypto.timingSafeEqual`.
- 연결 문자열 = `buildHmrConnectionString(port, token)` → `risu-hmr://127.0.0.1:<port>#k=<token>`.
- 엔드포인트: `GET /health`, `GET /watch?since=N`(롱폴, 기본 25000ms), `GET /payload`, `GET /asset/<hash>`. 응답 타입은 core의 `HmrHealthResponse`/`HmrWatchResponse`/`HmrPayloadResponse`.
- 모든 응답에 CORS 헤더 `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`; `OPTIONS`는 204.
- 빌드 실패 시 **마지막 정상 버전 유지** (version 증가 없음, `lastError`만 갱신).
- 동시 방송 1개. 다른 아티팩트로 전환 시 `vscode.window.showWarningMessage({ modal: true })` confirm.
- 메시지 타입은 vscode/webview 양쪽에 **중복 정의** (기존 컨벤션 — core 경유 공유 아님).
- UI 문구는 기존 webview처럼 영어 (Analyze/Pack 옆이므로 "Broadcast").
- 테스트: vscode 패키지는 `packages/vscode`에서 `npx vitest run <file>` (vitest는 repo 루트 hoisted), webview는 `npm run test --workspace risu-workbench-webview -- <file>` (repo 루트에서).
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

**공유 상태 payload (이 계획의 중심 타입 — vscode/webview 동일 정의):**

```ts
export interface ArtifactBrowserHmrStatusPayload {
  running: boolean;
  stableId?: string;
  artifactName?: string;
  artifactKind?: 'character' | 'module';
  connectionString?: string;
  version?: number;
  updateCount: number;
  lastPollAtMs?: number;
  lastError?: string;
}
```

---

### Task 1: vscode 측 메시지 계약 (hmrStartBroadcast / hmrStopBroadcast / hmrStatus)

**Files:**
- Modify: `packages/vscode/src/artifact-browser/artifactBrowserTypes.ts` (기존 `ArtifactBrowserPackArtifactPayload`(:293)·`ArtifactBrowserPackCompletedPayload`(:314) 인접에 타입 추가, 메시지 타입은 기존 `MessageEnvelope` 사용, `:556`/`:581` 인접에 메시지 별칭 추가)
- Modify: `packages/vscode/src/artifact-browser/artifactBrowserMessages.ts` (pack 가드 3단 구조(:228 payload guard → :306 envelope guard → :416 export guard)와 `createArtifactBrowserExtensionMessage`(:545) 패턴을 미러링)
- Test: `packages/vscode/src/artifact-browser/artifactBrowserHmrMessages.test.ts`

**Interfaces:**
- Consumes: 기존 `MessageEnvelope<TType, TPayload>`(`artifactBrowserTypes.ts:26`), `ArtifactBrowserPayloadGuard<T>`, envelope guard 헬퍼(파일 내 pack 사례와 동일), `createArtifactBrowserExtensionMessage`
- Produces:
  - 타입: `ArtifactBrowserHmrStartBroadcastPayload { stableId: string }`, `ArtifactBrowserHmrStopBroadcastPayload = Record<string, never>`, `ArtifactBrowserHmrStatusPayload`(위 Global Constraints 정의), 메시지 별칭 `ArtifactBrowserHmrStartBroadcastMessage`/`ArtifactBrowserHmrStopBroadcastMessage`(type: `'artifact-browser/hmrStartBroadcast'`/`'artifact-browser/hmrStopBroadcast'`, webview→ext 요청 union에 추가), `ArtifactBrowserHmrStatusMessage`(type: `'artifact-browser/hmrStatus'`, `ArtifactBrowserExtensionResponse` union(:532)에 추가)
  - 가드: `isArtifactBrowserHmrStartBroadcastMessage(message: unknown)`, `isArtifactBrowserHmrStopBroadcastMessage(message: unknown)`
  - 팩토리: `createArtifactBrowserHmrStatusMessage(payload: ArtifactBrowserHmrStatusPayload): ArtifactBrowserHmrStatusMessage`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// packages/vscode/src/artifact-browser/artifactBrowserHmrMessages.test.ts
import { describe, expect, it } from 'vitest';
import {
  createArtifactBrowserHmrStatusMessage,
  isArtifactBrowserHmrStartBroadcastMessage,
  isArtifactBrowserHmrStopBroadcastMessage,
} from './artifactBrowserMessages';

describe('hmr message contract', () => {
  it('accepts a well-formed hmrStartBroadcast message', () => {
    const message = {
      protocol: 'risu-workbench.artifact-browser',
      version: 1,
      type: 'artifact-browser/hmrStartBroadcast',
      payload: { stableId: 'abc' },
    };
    expect(isArtifactBrowserHmrStartBroadcastMessage(message)).toBe(true);
    expect(isArtifactBrowserHmrStartBroadcastMessage({ ...message, payload: { stableId: '' } })).toBe(false);
    expect(isArtifactBrowserHmrStartBroadcastMessage({ ...message, type: 'artifact-browser/other' })).toBe(false);
  });

  it('accepts hmrStopBroadcast with empty payload', () => {
    const message = {
      protocol: 'risu-workbench.artifact-browser',
      version: 1,
      type: 'artifact-browser/hmrStopBroadcast',
      payload: {},
    };
    expect(isArtifactBrowserHmrStopBroadcastMessage(message)).toBe(true);
  });

  it('creates hmrStatus envelope', () => {
    const message = createArtifactBrowserHmrStatusMessage({ running: false, updateCount: 0 });
    expect(message.type).toBe('artifact-browser/hmrStatus');
    expect(message.payload).toEqual({ running: false, updateCount: 0 });
    expect(message.protocol).toBe('risu-workbench.artifact-browser');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run (packages/vscode에서): `npx vitest run src/artifact-browser/artifactBrowserHmrMessages.test.ts`
Expected: FAIL — export 없음

- [ ] **Step 3: 타입·가드·팩토리 구현**

`artifactBrowserTypes.ts` — pack payload 인접에 추가:

```ts
export interface ArtifactBrowserHmrStartBroadcastPayload {
  stableId: string;
}

export type ArtifactBrowserHmrStopBroadcastPayload = Record<string, never>;

export interface ArtifactBrowserHmrStatusPayload {
  running: boolean;
  stableId?: string;
  artifactName?: string;
  artifactKind?: 'character' | 'module';
  connectionString?: string;
  version?: number;
  updateCount: number;
  lastPollAtMs?: number;
  lastError?: string;
}

export type ArtifactBrowserHmrStartBroadcastMessage = MessageEnvelope<
  'artifact-browser/hmrStartBroadcast',
  ArtifactBrowserHmrStartBroadcastPayload
>;

export type ArtifactBrowserHmrStopBroadcastMessage = MessageEnvelope<
  'artifact-browser/hmrStopBroadcast',
  ArtifactBrowserHmrStopBroadcastPayload
>;

export type ArtifactBrowserHmrStatusMessage = MessageEnvelope<
  'artifact-browser/hmrStatus',
  ArtifactBrowserHmrStatusPayload
>;
```

그리고 같은 파일의 webview→ext 요청 union(`ArtifactBrowserPackArtifactMessage`가 속한 union)에 `ArtifactBrowserHmrStartBroadcastMessage | ArtifactBrowserHmrStopBroadcastMessage`를, ext→webview 응답 union(`ArtifactBrowserPackCompletedMessage`가 속한 union)에 `ArtifactBrowserHmrStatusMessage`를 추가한다.

`artifactBrowserMessages.ts` — pack 가드 3단 구조를 그대로 미러링 (envelope 검사 헬퍼는 파일 내 `isArtifactBrowserPackArtifactMessageEnvelope`(:306)가 쓰는 것과 동일한 것을 사용):

```ts
const isArtifactBrowserHmrStartBroadcastPayload: ArtifactBrowserPayloadGuard<
  ArtifactBrowserHmrStartBroadcastPayload
> = (payload): payload is ArtifactBrowserHmrStartBroadcastPayload =>
  isPlainRecord(payload) && typeof payload.stableId === 'string' && payload.stableId.length > 0;

const isArtifactBrowserHmrStopBroadcastPayload: ArtifactBrowserPayloadGuard<
  ArtifactBrowserHmrStopBroadcastPayload
> = (payload): payload is ArtifactBrowserHmrStopBroadcastPayload => isPlainRecord(payload);
```

이어서 pack과 동일한 방식의 envelope guard 2개, export guard 2개(`isArtifactBrowserHmrStartBroadcastMessage`, `isArtifactBrowserHmrStopBroadcastMessage`), 그리고 팩토리:

```ts
export function createArtifactBrowserHmrStatusMessage(
  payload: ArtifactBrowserHmrStatusPayload,
): ArtifactBrowserHmrStatusMessage {
  return createArtifactBrowserExtensionMessage('artifact-browser/hmrStatus', payload);
}
```

`ArtifactBrowserExtensionResponse` union(:532)에 `ArtifactBrowserHmrStatusMessage` 추가 (없으면 `createArtifactBrowserExtensionMessage`의 TType 제약이 컴파일 에러를 냄 — 이 에러가 union 추가 누락의 신호).

- [ ] **Step 4: 통과 확인**

Run (packages/vscode에서): `npx vitest run src/artifact-browser/artifactBrowserHmrMessages.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/vscode/src/artifact-browser/artifactBrowserTypes.ts packages/vscode/src/artifact-browser/artifactBrowserMessages.ts packages/vscode/src/artifact-browser/artifactBrowserHmrMessages.test.ts
git commit -m "feat(vscode): HMR 방송 메시지 계약 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: HmrServerService (node:http 싱글턴)

**Files:**
- Create: `packages/vscode/src/hmr/HmrServerService.ts`
- Test: `packages/vscode/src/hmr/HmrServerService.test.ts`

**Interfaces:**
- Consumes: `buildHmrConnectionString`, `HMR_PORT_RANGE`, `HMR_PROTOCOL_VERSION`, wire 타입 (`risu-workbench-core`); `AssetHashCache`, `buildHmrCharacterPayload`, `buildHmrModulePayload`, `HmrBuildResult` (`risu-workbench-core/node`)
- Produces:
  - `interface HmrBroadcastTarget { stableId: string; name: string; kind: 'character' | 'module'; rootFsPath: string }`
  - `class HmrServerService { startBroadcast(target: HmrBroadcastTarget): Promise<void>; rebuild(): void; stop(): Promise<void>; getStatus(): ArtifactBrowserHmrStatusPayload; onStatus(listener): () => void }` (상태 payload 형태는 Task 1과 동일 — 이 파일에서는 구조적 동형 타입 `HmrServerStatus`로 정의해 vscode API 의존 없이 테스트 가능하게 유지)
  - `getHmrServerService(): HmrServerService`, `disposeHmrServer(): Promise<void>` (모듈 레벨 싱글턴 — `cbsLanguageClient.ts:39`의 start/stop 패턴)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// packages/vscode/src/hmr/HmrServerService.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { HmrServerService } from './HmrServerService';
import type { HmrBuildResult } from 'risu-workbench-core/node';

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

const TARGET = { stableId: 'sid-1', name: 'Aria', kind: 'character' as const, rootFsPath: '/tmp/unused' };

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

    const match = /^risu-hmr:\/\/127\.0\.0\.1:(\d+)#k=([0-9a-f]+)$/.exec(status.connectionString ?? '');
    const base = `http://127.0.0.1:${match?.[1]}`;
    const token = match?.[2];

    const unauthorized = await fetch(`${base}/health`);
    expect(unauthorized.status).toBe(401);

    const health = await fetch(`${base}/health?k=${token}`);
    expect(health.status).toBe(200);
    const body = await health.json();
    expect(body).toMatchObject({
      app: 'risu-workbench-hmr',
      protocolVersion: 1,
      project: { name: 'Aria', kind: 'character', stableId: 'sid-1' },
      version: 1,
    });
  });

  it('serves /payload and /asset/<hash>', async () => {
    const service = makeService(() => stubBuild());
    await service.startBroadcast(TARGET);
    const { connectionString } = service.getStatus();
    const match = /:(\d+)#k=([0-9a-f]+)$/.exec(connectionString ?? '');
    const base = `http://127.0.0.1:${match?.[1]}`;
    const k = `k=${match?.[2]}`;

    const payload = await (await fetch(`${base}/payload?${k}`)).json();
    expect(payload).toMatchObject({ kind: 'character', data: { name: 'Aria' } });
    expect(payload.assets).toEqual([{ hash: 'h1', ext: 'png', role: 'icon:main', size: 3 }]);

    const asset = await fetch(`${base}/asset/h1?${k}`);
    expect(asset.status).toBe(200);
    expect(Buffer.from(await asset.arrayBuffer()).toString()).toBe('abc');

    const missing = await fetch(`${base}/asset/nope?${k}`);
    expect(missing.status).toBe(404);
  });

  it('long-polls /watch: immediate when behind, timeout no-change, wakes on rebuild', async () => {
    let desc = 'v1';
    const service = makeService(() => stubBuild({ data: { name: 'Aria', desc } }));
    await service.startBroadcast(TARGET);
    const { connectionString } = service.getStatus();
    const match = /:(\d+)#k=([0-9a-f]+)$/.exec(connectionString ?? '');
    const base = `http://127.0.0.1:${match?.[1]}`;
    const k = `k=${match?.[2]}`;

    // since=0 < version=1 → 즉시 응답
    const behind = await (await fetch(`${base}/watch?since=0&${k}`)).json();
    expect(behind).toMatchObject({ version: 1, definitionChanged: true });

    // since=1 = version → 100ms 타임아웃 후 no-change
    const idle = await (await fetch(`${base}/watch?since=1&${k}`)).json();
    expect(idle).toEqual({ version: 1, definitionChanged: false, changedAssets: [] });

    // 대기 중 rebuild → 깨어남
    const waiting = fetch(`${base}/watch?since=1&${k}`).then((res) => res.json());
    desc = 'v2';
    setTimeout(() => service.rebuild(), 20);
    const woken = await waiting;
    expect(woken).toMatchObject({ version: 2, definitionChanged: true });
    expect(service.getStatus().updateCount).toBe(1);
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
```

- [ ] **Step 2: 실패 확인**

Run (packages/vscode에서): `npx vitest run src/hmr/HmrServerService.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// packages/vscode/src/hmr/HmrServerService.ts
/**
 * HMR 방송 서버 싱글턴.
 * extension host에서 node:http로 127.0.0.1에 바인드해 현재 방송 대상 아티팩트의
 * risu-native 페이로드를 롱폴링으로 서빙한다. vscode API에 의존하지 않아 vitest로 직접 테스트한다.
 * 수명 관리 패턴은 lsp/cbsLanguageClient.ts(모듈 레벨 싱글턴 + start/stop)를 따른다.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  HMR_PORT_RANGE,
  HMR_PROTOCOL_VERSION,
  buildHmrConnectionString,
  type HmrHealthResponse,
  type HmrPayloadResponse,
  type HmrWatchResponse,
} from 'risu-workbench-core';
import {
  AssetHashCache,
  buildHmrCharacterPayload,
  buildHmrModulePayload,
  type HmrBuildResult,
} from 'risu-workbench-core/node';

export interface HmrBroadcastTarget {
  stableId: string;
  name: string;
  kind: 'character' | 'module';
  rootFsPath: string;
}

export interface HmrServerStatus {
  running: boolean;
  stableId?: string;
  artifactName?: string;
  artifactKind?: 'character' | 'module';
  connectionString?: string;
  version?: number;
  updateCount: number;
  lastPollAtMs?: number;
  lastError?: string;
}

interface HmrServerOptions {
  build?: (kind: 'character' | 'module', rootFsPath: string, cache: AssetHashCache) => HmrBuildResult;
  longPollTimeoutMs?: number;
}

interface Waiter {
  res: ServerResponse;
  timer: NodeJS.Timeout;
}

const DEFAULT_LONG_POLL_TIMEOUT_MS = 25_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
} as const;

function defaultBuild(
  kind: 'character' | 'module',
  rootFsPath: string,
  cache: AssetHashCache,
): HmrBuildResult {
  return kind === 'character' ? buildHmrCharacterPayload(rootFsPath, cache) : buildHmrModulePayload(rootFsPath);
}

export class HmrServerService {
  private server: Server | undefined;
  private port = 0;
  private token = '';
  private target: HmrBroadcastTarget | undefined;
  private current: HmrBuildResult | undefined;
  private version = 0;
  private updateCount = 0;
  private lastChangedAssets: string[] = [];
  private lastPollAtMs: number | undefined;
  private lastError: string | undefined;
  private cache = new AssetHashCache();
  private waiters: Waiter[] = [];
  private readonly listeners = new Set<(status: HmrServerStatus) => void>();

  constructor(private readonly options: HmrServerOptions = {}) {}

  onStatus(listener: (status: HmrServerStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): HmrServerStatus {
    if (!this.target || !this.server) return { running: false, updateCount: 0 };
    return {
      running: true,
      stableId: this.target.stableId,
      artifactName: this.target.name,
      artifactKind: this.target.kind,
      connectionString: buildHmrConnectionString(this.port, this.token),
      version: this.version,
      updateCount: this.updateCount,
      lastPollAtMs: this.lastPollAtMs,
      lastError: this.lastError,
    };
  }

  async startBroadcast(target: HmrBroadcastTarget): Promise<void> {
    await this.ensureServer();
    this.target = target;
    this.cache = new AssetHashCache();
    this.current = undefined;
    this.version = 0;
    this.updateCount = 0;
    this.lastChangedAssets = [];
    this.lastError = undefined;
    this.rebuild();
  }

  /**
   * rebuild 함수.
   * 방송 대상을 다시 빌드한다. 실패하면 마지막 정상 버전을 유지하고 lastError만 갱신한다.
   */
  rebuild(): void {
    if (!this.target) return;
    try {
      const previous = this.current;
      const next = (this.options.build ?? defaultBuild)(this.target.kind, this.target.rootFsPath, this.cache);
      const previousHashes = new Set((previous?.assets ?? []).map((entry) => entry.hash));
      this.lastChangedAssets = next.assets.map((entry) => entry.hash).filter((hash) => !previousHashes.has(hash));
      this.current = next;
      this.version += 1;
      if (this.version > 1) this.updateCount += 1;
      this.lastError = undefined;
      this.flushWaiters();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
    this.emit();
  }

  async stop(): Promise<void> {
    this.target = undefined;
    this.current = undefined;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      this.respondJson(waiter.res, 200, { version: this.version, definitionChanged: false, changedAssets: [] });
    }
    const server = this.server;
    this.server = undefined;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    this.emit();
  }

  private emit(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) listener(status);
  }

  private async ensureServer(): Promise<void> {
    if (this.server) return;
    this.token = randomBytes(16).toString('hex');
    const candidates: number[] = [];
    for (let port = HMR_PORT_RANGE.start; port <= HMR_PORT_RANGE.end; port += 1) candidates.push(port);
    candidates.push(0);
    for (const candidate of candidates) {
      try {
        this.port = await this.listenOnce(candidate);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EADDRINUSE' && code !== 'EACCES') throw error;
      }
    }
    throw new Error('HMR 서버 포트 확보 실패');
  }

  private listenOnce(port: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handle(req.method ?? 'GET', req.url ?? '/', res);
      });
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        this.server = server;
        resolve((server.address() as AddressInfo).port);
      });
    });
  }

  private async handle(method: string, rawUrl: string, res: ServerResponse): Promise<void> {
    if (method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS).end();
      return;
    }
    const url = new URL(rawUrl, 'http://127.0.0.1');
    if (!this.isAuthorized(url.searchParams.get('k'))) {
      this.respondJson(res, 401, { error: 'unauthorized' });
      return;
    }
    if (!this.target || !this.current) {
      this.respondJson(res, 503, { error: 'no-broadcast' });
      return;
    }

    if (url.pathname === '/health') {
      const body: HmrHealthResponse = {
        app: 'risu-workbench-hmr',
        protocolVersion: HMR_PROTOCOL_VERSION,
        project: { name: this.target.name, kind: this.target.kind, stableId: this.target.stableId },
        version: this.version,
      };
      this.respondJson(res, 200, body);
      return;
    }

    if (url.pathname === '/watch') {
      this.lastPollAtMs = Date.now();
      this.emit();
      const since = Number(url.searchParams.get('since')) || 0;
      if (since < this.version) {
        this.respondJson(res, 200, this.buildWatchResponse(since));
        return;
      }
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.res !== res);
        this.respondJson(res, 200, { version: this.version, definitionChanged: false, changedAssets: [] });
      }, this.options.longPollTimeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS);
      this.waiters.push({ res, timer });
      return;
    }

    if (url.pathname === '/payload') {
      const body: HmrPayloadResponse = {
        kind: this.current.kind,
        data: this.current.data,
        assets: this.current.assets,
      };
      this.respondJson(res, 200, body);
      return;
    }

    const assetMatch = /^\/asset\/([0-9a-f]{64}|[0-9a-zA-Z]+)$/.exec(url.pathname);
    if (assetMatch) {
      const source = this.current.assetSources.get(assetMatch[1]);
      if (!source) {
        this.respondJson(res, 404, { error: 'asset-not-found' });
        return;
      }
      try {
        const bytes = source.kind === 'buffer' ? source.buffer : await fs.promises.readFile(source.path);
        res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/octet-stream' }).end(bytes);
      } catch {
        this.respondJson(res, 404, { error: 'asset-read-failed' });
      }
      return;
    }

    this.respondJson(res, 404, { error: 'not-found' });
  }

  private buildWatchResponse(since: number): HmrWatchResponse {
    const changedAssets =
      since === this.version - 1
        ? this.lastChangedAssets
        : (this.current?.assets ?? []).map((entry) => entry.hash);
    return { version: this.version, definitionChanged: true, changedAssets };
  }

  private flushWaiters(): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      this.respondJson(waiter.res, 200, this.buildWatchResponse(this.version - 1));
    }
  }

  private isAuthorized(candidate: string | null): boolean {
    if (!candidate || candidate.length !== this.token.length) return false;
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(this.token));
  }

  private respondJson(res: ServerResponse, statusCode: number, body: unknown): void {
    if (res.writableEnded) return;
    res.writeHead(statusCode, { ...CORS_HEADERS, 'content-type': 'application/json' }).end(JSON.stringify(body));
  }
}

let hmrServerService: HmrServerService | undefined;

/**
 * getHmrServerService 함수.
 * extension 전역 HMR 서버 싱글턴을 반환한다 (lazy 생성).
 */
export function getHmrServerService(): HmrServerService {
  hmrServerService ??= new HmrServerService();
  return hmrServerService;
}

/**
 * disposeHmrServer 함수.
 * deactivate 시 서버를 정리한다.
 */
export async function disposeHmrServer(): Promise<void> {
  if (!hmrServerService) return;
  await hmrServerService.stop();
  hmrServerService = undefined;
}
```

- [ ] **Step 4: 통과 확인**

Run (packages/vscode에서): `npx vitest run src/hmr/HmrServerService.test.ts`
Expected: PASS (4 tests). `risu-workbench-core` 모듈 해석 실패 시 → repo 루트에서 `npm run build --workspace risu-workbench-core` 후 재시도.

- [ ] **Step 5: Commit**

```bash
git add packages/vscode/src/hmr/HmrServerService.ts packages/vscode/src/hmr/HmrServerService.test.ts
git commit -m "feat(vscode): HMR 방송 서버 싱글턴 (node:http + 롱폴링)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Provider·extension 배선 (방송 시작/중지 + watcher + 상태 push)

**Files:**
- Modify: `packages/vscode/src/views/ArtifactBrowserViewProvider.ts`
- Modify: `packages/vscode/src/extension.ts` (deactivate)

**Interfaces:**
- Consumes: Task 1 가드/팩토리, Task 2 `getHmrServerService`/`disposeHmrServer`, 기존 `createDebouncedTrigger`(`artifact-browser/artifactBrowserWatch.ts:59`)/`wireWatcherToTrigger`(`:90`)
- Produces: webview로 `artifact-browser/hmrStatus` 이벤트 push (ready 시 초기 1회 + 상태 변화마다)

- [ ] **Step 1: provider에 HMR 배선 추가**

`ArtifactBrowserViewProvider.ts` 수정 사항:

① import 추가 (기존 artifactBrowserMessages/Watch import 그룹에):

```ts
import {
  createArtifactBrowserHmrStatusMessage,
  isArtifactBrowserHmrStartBroadcastMessage,
  isArtifactBrowserHmrStopBroadcastMessage,
} from '../artifact-browser/artifactBrowserMessages';
import { getHmrServerService } from '../hmr/HmrServerService';
```

② 클래스 필드 추가 (`detailWatcher` 필드들(:131-135) 옆):

```ts
  private hmrWatcher: vscode.FileSystemWatcher | undefined;
  private hmrWatcherSubscriptions: vscode.Disposable[] = [];
  private hmrTrigger: { trigger: () => void; dispose: () => void } | undefined;
```

파일 상단 상수 그룹에 `const HMR_REBUILD_DEBOUNCE_MS = 500;` 추가.

③ `onDidReceiveMessage` 가드 체인(:251-374)의 pack 처리 블록 아래에 추가:

```ts
        if (isArtifactBrowserHmrStartBroadcastMessage(message)) {
          void this.startHmrBroadcast(message.payload.stableId);
          return;
        }
        if (isArtifactBrowserHmrStopBroadcastMessage(message)) {
          void this.stopHmrBroadcast();
          return;
        }
```

④ ready 메시지 처리부(`isArtifactBrowserReadyMessage` 분기, `sendDiscoveredCards` 호출 직후)에 초기 상태 push 추가:

```ts
          this.postMessage(createArtifactBrowserHmrStatusMessage(getHmrServerService().getStatus()));
```

⑤ `resolveWebviewView` 안(onDidReceiveMessage 등록 인접)에서 상태 구독 등록:

```ts
    const unsubscribeHmrStatus = getHmrServerService().onStatus((status) => {
      this.postMessage(createArtifactBrowserHmrStatusMessage(status));
    });
    this.context.subscriptions.push({ dispose: unsubscribeHmrStatus });
```

⑥ 클래스 메서드 추가 (`packArtifact` 인접):

```ts
  /**
   * startHmrBroadcast 함수.
   * 대상 아티팩트를 HMR 방송 대상으로 지정한다. 이미 다른 아티팩트를 방송 중이면
   * 모달 confirm 후 전환한다 (동시 방송 1개 정책).
   */
  private async startHmrBroadcast(stableId: string): Promise<void> {
    const card = this.currentCards.find((candidate) => candidate.stableId === stableId);
    if (!card) {
      void vscode.window.showErrorMessage('HMR: selected artifact not found.');
      return;
    }
    if (card.artifactKind !== 'character' && card.artifactKind !== 'module') {
      void vscode.window.showErrorMessage('HMR: plugin artifacts are not broadcastable.');
      return;
    }
    const service = getHmrServerService();
    const status = service.getStatus();
    if (status.running && status.stableId && status.stableId !== stableId) {
      const choice = await vscode.window.showWarningMessage(
        `Currently broadcasting '${status.artifactName}'. Switch to '${card.name}'?`,
        { modal: true },
        'Switch',
      );
      if (choice !== 'Switch') return;
    }
    const rootFsPath = vscode.Uri.parse(card.rootUri).fsPath;
    try {
      await service.startBroadcast({ stableId, name: card.name, kind: card.artifactKind, rootFsPath });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`HMR broadcast failed: ${messageText}`);
      return;
    }
    this.watchHmrRoot(card.rootUri);
  }

  /**
   * stopHmrBroadcast 함수.
   * 방송과 서버를 중지하고 watcher를 정리한다.
   */
  private async stopHmrBroadcast(): Promise<void> {
    this.clearHmrWatcher();
    await getHmrServerService().stop();
  }

  /**
   * watchHmrRoot 함수.
   * 방송 대상 루트 하위 변경을 감시해 debounce 후 rebuild한다.
   * watchSelectedArtifactContents(:169)와 동일한 패턴.
   */
  private watchHmrRoot(rootUri: string): void {
    this.clearHmrWatcher();
    const pattern = new vscode.RelativePattern(vscode.Uri.parse(rootUri), '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const trigger = createDebouncedTrigger(() => getHmrServerService().rebuild(), HMR_REBUILD_DEBOUNCE_MS);
    this.hmrWatcher = watcher;
    this.hmrTrigger = trigger;
    this.hmrWatcherSubscriptions = wireWatcherToTrigger(watcher, () => trigger.trigger()) as vscode.Disposable[];
  }

  /**
   * clearHmrWatcher 함수.
   */
  private clearHmrWatcher(): void {
    this.hmrTrigger?.dispose();
    this.hmrTrigger = undefined;
    for (const subscription of this.hmrWatcherSubscriptions.splice(0)) subscription.dispose();
    this.hmrWatcher?.dispose();
    this.hmrWatcher = undefined;
  }
```

주의: `createDebouncedTrigger`/`wireWatcherToTrigger`는 이 파일이 이미 import하고 있다 (`registerMarkerWatcher`(:150)에서 사용) — 중복 import 금지, 기존 import에 포함돼 있는지 확인만.

- [ ] **Step 2: extension.ts deactivate에 서버 정리 추가**

`packages/vscode/src/extension.ts` import에 `import { disposeHmrServer } from './hmr/HmrServerService';` 추가, 기존 `deactivate()`(:75-78, `stopCbsLanguageClient` await하는 함수) 본문에 한 줄 추가:

```ts
  await disposeHmrServer();
```

- [ ] **Step 3: 컴파일 확인**

Run (repo 루트): `npm run build --workspace risu-workbench-vscode`
Expected: 성공 (타입 에러 없음). Task 1의 union 추가 누락 시 여기서 컴파일 에러로 드러남.

- [ ] **Step 4: Commit**

```bash
git add packages/vscode/src/views/ArtifactBrowserViewProvider.ts packages/vscode/src/extension.ts
git commit -m "feat(vscode): HMR 방송 provider 배선 (start/stop/watcher/상태 push)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: webview 측 메시지 계약 + hmrState 스토어

**Files:**
- Modify: `packages/webview/src/lib/types.ts` (payload/메시지 타입 — Task 1과 동일 정의 복제; `ArtifactBrowserExtensionMessage` union(:645)과 extension 메시지 type 목록 배열에 `'artifact-browser/hmrStatus'` 추가; webview outbound union에 start/stop 메시지 추가)
- Modify: `packages/webview/src/lib/vscode.ts` (팩토리 2개 — `createArtifactBrowserPackArtifactMessage`(:139) 인접)
- Modify: `packages/webview/src/main.ts` (payload guard + guard registry 항목 + handleMessage 분기 + `hmrState` writable + 핸들러 + App prop)
- Test: `packages/webview/tests/lib/hmrMessages.test.ts`

**Interfaces:**
- Consumes: `createArtifactBrowserWebviewMessage`(`vscode.ts:79`), `createArtifactBrowserExtensionMessageGuard`(main.ts guard registry가 쓰는 기존 헬퍼), `isPlainRecord`
- Produces:
  - `createArtifactBrowserHmrStartBroadcastMessage(payload: { stableId: string })`, `createArtifactBrowserHmrStopBroadcastMessage()`
  - `const hmrState = writable<ArtifactBrowserHmrStatusPayload | null>(null)` (main.ts 모듈 레벨, `packState`(:54) 옆)
  - App에 prop으로 전달: `hmrState`, `onHmrStartBroadcast(stableId: string)`, `onHmrStopBroadcast()`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// packages/webview/tests/lib/hmrMessages.test.ts
import { describe, expect, it } from 'vitest';
import {
  createArtifactBrowserHmrStartBroadcastMessage,
  createArtifactBrowserHmrStopBroadcastMessage,
} from '../../src/lib/vscode';

describe('hmr outbound messages', () => {
  it('creates hmrStartBroadcast envelope', () => {
    const message = createArtifactBrowserHmrStartBroadcastMessage({ stableId: 'sid' });
    expect(message.type).toBe('artifact-browser/hmrStartBroadcast');
    expect(message.payload).toEqual({ stableId: 'sid' });
    expect(message.protocol).toBe('risu-workbench.artifact-browser');
  });

  it('creates hmrStopBroadcast envelope with empty payload', () => {
    const message = createArtifactBrowserHmrStopBroadcastMessage();
    expect(message.type).toBe('artifact-browser/hmrStopBroadcast');
    expect(message.payload).toEqual({});
  });
});
```

- [ ] **Step 2: 실패 확인**

Run (repo 루트): `npm run test --workspace risu-workbench-webview -- tests/lib/hmrMessages.test.ts`
Expected: FAIL — export 없음

- [ ] **Step 3: 구현**

`types.ts` — Task 1의 payload/메시지 타입 3종을 동일하게 정의 (파일 내 pack 타입들 인접, `MessageEnvelope`(:117) 사용). 그리고:
- webview→ext outbound union (pack 메시지가 속한 union)에 start/stop 메시지 추가
- `ArtifactBrowserExtensionMessage` union(:645) 및 그 type 문자열 목록 배열(`ARTIFACT_BROWSER_EXTENSION_MESSAGE_TYPES` — packCompleted가 들어있는 배열)에 hmrStatus 추가

`vscode.ts` — 팩토리 추가:

```ts
export function createArtifactBrowserHmrStartBroadcastMessage(
  payload: ArtifactBrowserHmrStartBroadcastPayload,
): ArtifactBrowserHmrStartBroadcastMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/hmrStartBroadcast', payload);
}

export function createArtifactBrowserHmrStopBroadcastMessage(): ArtifactBrowserHmrStopBroadcastMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/hmrStopBroadcast', {});
}
```

`main.ts` —

① `packState`(:54) 옆에 스토어:

```ts
const hmrState = writable<ArtifactBrowserHmrStatusPayload | null>(null);
```

② payload guard (`isArtifactBrowserPackCompletedPayload` 함수 옆):

```ts
function isArtifactBrowserHmrStatusPayload(payload: unknown): payload is ArtifactBrowserHmrStatusPayload {
  return isPlainRecord(payload) && typeof payload.running === 'boolean' && typeof payload.updateCount === 'number';
}
```

③ guard registry(`satisfies Record<ArtifactBrowserExtensionMessageType, ...>` 객체)에 항목 추가:

```ts
  'artifact-browser/hmrStatus': createArtifactBrowserExtensionMessageGuard(
    'artifact-browser/hmrStatus',
    isArtifactBrowserHmrStatusPayload,
  ),
```

④ `handleMessage`(:181-222)의 packCompleted 분기 옆에:

```ts
  if (message.type === 'artifact-browser/hmrStatus') {
    hmrState.set(message.payload);
    return;
  }
```

⑤ 핸들러 함수 (`packArtifact` 핸들러(:296 부근) 옆):

```ts
function hmrStartBroadcast(stableId: string): void {
  getVsCodeApi()?.postMessage(createArtifactBrowserHmrStartBroadcastMessage({ stableId }));
}

function hmrStopBroadcast(): void {
  getVsCodeApi()?.postMessage(createArtifactBrowserHmrStopBroadcastMessage());
}
```

(메시지 전송 방식은 파일 내 기존 핸들러들의 실제 호출 형태를 따른다 — `getVsCodeApi()` 대신 지역 `vscode` 변수를 쓰고 있으면 그것을 사용.)

⑥ App mount props(:121-150)에 `hmrState`, `onHmrStartBroadcast: hmrStartBroadcast`, `onHmrStopBroadcast: hmrStopBroadcast` 추가.

- [ ] **Step 4: 통과 확인**

Run: `npm run test --workspace risu-workbench-webview -- tests/lib/hmrMessages.test.ts`
Expected: PASS (2 tests)

Run: `npm run test --workspace risu-workbench-webview`
Expected: 전체 PASS (회귀 없음)

- [ ] **Step 5: Commit**

```bash
git add packages/webview/src/lib/types.ts packages/webview/src/lib/vscode.ts packages/webview/src/main.ts packages/webview/tests/lib/hmrMessages.test.ts
git commit -m "feat(webview): HMR 메시지 계약 + hmrState 스토어

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Broadcast 버튼 + HmrStatusStrip 컴포넌트

**Files:**
- Create: `packages/webview/src/lib/components/HmrStatusStrip.svelte`
- Modify: `packages/webview/src/lib/components/ArtifactDetailView.svelte`
- Modify: `packages/webview/src/lib/components/App.svelte` (`ArtifactDetailView` 렌더부 :72-92에 prop 3개 전달)
- Test: `packages/webview/tests/lib/components/HmrStatusStrip.test.ts`, `packages/webview/tests/lib/components/ArtifactDetailView.hmr.test.ts`

**Interfaces:**
- Consumes: Task 4의 `hmrState` store prop + 핸들러 prop, 기존 CSS 토큰(`--space-*`, `--accent`, `--card-border`, `--warning`, `--error`, `styles.css:1-49`)
- Produces: `HmrStatusStrip.svelte` props — `hmrStatus: ArtifactBrowserHmrStatusPayload | null`, `currentStableId: string`, `onStop: () => void`, `onBroadcastHere: () => void`

- [ ] **Step 1: 실패하는 테스트 작성** (webview 컴포넌트 테스트 컨벤션 = `?raw` 소스 단언 — `tests/lib/components/ArtifactDetailView.plugin.test.ts` 참조)

```ts
// packages/webview/tests/lib/components/HmrStatusStrip.test.ts
import { describe, expect, it } from 'vitest';
import StripSource from '../../../src/lib/components/HmrStatusStrip.svelte?raw';

describe('HmrStatusStrip', () => {
  it('branches on broadcasting-here vs elsewhere vs idle', () => {
    expect(StripSource).toMatch(/hmrStatus\?\.running/);
    expect(StripSource).toMatch(/currentStableId/);
  });

  it('exposes copy and stop affordances', () => {
    expect(StripSource).toMatch(/navigator\.clipboard/);
    expect(StripSource).toMatch(/onStop/);
    expect(StripSource).toMatch(/connectionString/);
  });

  it('derives receiver freshness from lastPollAtMs', () => {
    expect(StripSource).toMatch(/lastPollAtMs/);
    expect(StripSource).toMatch(/35_?000|35000/);
  });
});
```

```ts
// packages/webview/tests/lib/components/ArtifactDetailView.hmr.test.ts
import { describe, expect, it } from 'vitest';
import DetailViewSource from '../../../src/lib/components/ArtifactDetailView.svelte?raw';

describe('ArtifactDetailView hmr affordances', () => {
  it('renders Broadcast action for non-plugin artifacts and mounts the strip', () => {
    expect(DetailViewSource).toMatch(/onHmrStartBroadcast/);
    expect(DetailViewSource).toMatch(/HmrStatusStrip/);
    expect(DetailViewSource).toMatch(/Broadcast/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test --workspace risu-workbench-webview -- tests/lib/components/HmrStatusStrip.test.ts tests/lib/components/ArtifactDetailView.hmr.test.ts`
Expected: FAIL — 파일 없음 / 패턴 불일치

- [ ] **Step 3: HmrStatusStrip.svelte 구현**

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ArtifactBrowserHmrStatusPayload } from '../types';

  export let hmrStatus: ArtifactBrowserHmrStatusPayload | null;
  export let currentStableId: string;
  export let onStop: () => void;
  export let onBroadcastHere: () => void;

  const RECEIVER_FRESH_WINDOW_MS = 35_000;

  let nowMs = Date.now();
  const ticker = setInterval(() => {
    nowMs = Date.now();
  }, 5_000);
  onDestroy(() => clearInterval(ticker));

  $: isRunning = hmrStatus?.running === true;
  $: isHere = isRunning && hmrStatus?.stableId === currentStableId;
  $: receiverConnected =
    typeof hmrStatus?.lastPollAtMs === 'number' && nowMs - hmrStatus.lastPollAtMs < RECEIVER_FRESH_WINDOW_MS;
  $: pollAgeSeconds =
    typeof hmrStatus?.lastPollAtMs === 'number' ? Math.max(0, Math.round((nowMs - hmrStatus.lastPollAtMs) / 1000)) : null;

  let copied = false;
  function copyConnectionString(): void {
    const connectionString = hmrStatus?.connectionString;
    if (!connectionString) return;
    void navigator.clipboard?.writeText(connectionString);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 1_500);
  }
</script>

{#if isHere && hmrStatus}
  <div class="hmr-strip" class:hmr-strip--error={Boolean(hmrStatus.lastError)}>
    <div class="hmr-strip__row">
      <span class="hmr-strip__dot" aria-hidden="true"></span>
      <span class="hmr-strip__label">
        Broadcasting: {hmrStatus.artifactName} ({hmrStatus.artifactKind}) · {hmrStatus.updateCount} updates
      </span>
    </div>
    <div class="hmr-strip__row">
      <span class="hmr-strip__receiver">
        {#if receiverConnected}
          Receiver: connected{pollAgeSeconds === null ? '' : ` (${pollAgeSeconds}s ago)`}
        {:else}
          Receiver: waiting for RisuAI…
        {/if}
      </span>
      <span class="hmr-strip__actions">
        <button type="button" class="hmr-strip__button" on:click={copyConnectionString}>
          {copied ? 'Copied!' : 'Copy connection string'}
        </button>
        <button type="button" class="hmr-strip__button hmr-strip__button--stop" on:click={onStop}>Stop</button>
      </span>
    </div>
    {#if hmrStatus.lastError}
      <p class="hmr-strip__error">Build error — last good version kept: {hmrStatus.lastError}</p>
    {/if}
  </div>
{:else if isRunning && hmrStatus}
  <div class="hmr-strip hmr-strip--hint">
    <span>Broadcasting another artifact: {hmrStatus.artifactName}</span>
    <button type="button" class="hmr-strip__button" on:click={onBroadcastHere}>Broadcast this instead</button>
  </div>
{/if}

<style>
  .hmr-strip {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .hmr-strip--hint {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    color: var(--muted);
  }

  .hmr-strip--error {
    border-color: var(--error);
  }

  .hmr-strip__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }

  .hmr-strip__dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    flex: none;
  }

  .hmr-strip__label {
    font-weight: 600;
  }

  .hmr-strip__receiver {
    color: var(--muted);
  }

  .hmr-strip__actions {
    display: flex;
    gap: var(--space-2);
  }

  .hmr-strip__button {
    padding: 2px var(--space-2);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--secondary);
    color: var(--secondary-text);
  }

  .hmr-strip__button--stop {
    color: var(--error);
  }

  .hmr-strip__error {
    margin: 0;
    color: var(--error);
  }
</style>
```

- [ ] **Step 4: ArtifactDetailView.svelte 배선**

① script에 import·prop 추가:

```ts
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import HmrStatusStrip from './HmrStatusStrip.svelte';

  export let hmrState: import('svelte/store').Writable<import('../types').ArtifactBrowserHmrStatusPayload | null>;
  export let onHmrStartBroadcast: (stableId: string) => void;
  export let onHmrStopBroadcast: () => void;
```

② detail-actions의 non-plugin 분기(:105-112, Analyze/Pack 버튼)에 Broadcast 버튼 추가:

```svelte
        <button type="button" class="detail-action" on:click={() => onHmrStartBroadcast(artifact.stableId)}>
          Broadcast
        </button>
```

③ `.detail-actions` div 닫힌 직후(sticky header 내부, :113 `</div>` 다음)에 스트립 mount:

```svelte
    {#if artifact.artifactKind !== 'plugin'}
      <HmrStatusStrip
        hmrStatus={$hmrState}
        currentStableId={artifact.stableId}
        onStop={onHmrStopBroadcast}
        onBroadcastHere={() => onHmrStartBroadcast(artifact.stableId)}
      />
    {/if}
```

④ `App.svelte`의 ArtifactDetailView 렌더부(:72-92)에 `{hmrState}`, `{onHmrStartBroadcast}`, `{onHmrStopBroadcast}` 전달 + App 자신의 prop 선언(`export let`) 추가 — `packState` 전달 방식과 동일.

- [ ] **Step 5: 통과 + 전체 회귀 확인**

Run: `npm run test --workspace risu-workbench-webview`
Expected: 전체 PASS

- [ ] **Step 6: Commit**

```bash
git add packages/webview/src/lib/components/HmrStatusStrip.svelte packages/webview/src/lib/components/ArtifactDetailView.svelte packages/webview/src/lib/components/App.svelte packages/webview/tests/lib/components/HmrStatusStrip.test.ts packages/webview/tests/lib/components/ArtifactDetailView.hmr.test.ts
git commit -m "feat(webview): Broadcast 버튼 + HMR 상태 스트립

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 통합 빌드 + 수동 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 빌드**

Run (repo 루트): `npm run build:extension-dev`
Expected: core → cbs-lsp → webview → vscode 순 빌드 성공

- [ ] **Step 2: 수동 검증 (Extension Development Host)**

VS Code에서 F5 (Run Extension) 후:

1. character 아티팩트 detail 열기 → [Broadcast] 클릭 → 상태 스트립 표시, 연결 문자열이 `risu-hmr://127.0.0.1:4152x#k=…` 형식인지 확인
2. [Copy connection string] → 클립보드 내용 확인
3. 터미널에서 `curl 'http://127.0.0.1:<port>/health?k=<token>'` → 200 + project 정보 / `curl 'http://127.0.0.1:<port>/health'` → 401
4. 아티팩트 파일 하나 저장 → `curl '/watch?since=1&k=…'`가 version 2와 changedAssets를 반환하는지, 스트립 updateCount 증가 확인
5. 다른 아티팩트 detail에서 [Broadcast] → 전환 confirm 모달 확인; 방송 중이 아닌 아티팩트 화면에 hint 줄 확인
6. [Stop] → 스트립 소멸, curl 연결 거부 확인
7. VS Code 창 재로드(Developer: Reload Window) → 서버 정리(포트 해제) 확인

- [ ] **Step 3: Commit** (수정 사항 발생 시에만)

```bash
git add -A packages/vscode packages/webview
git commit -m "fix(hmr): 통합 검증 후속 수정

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
