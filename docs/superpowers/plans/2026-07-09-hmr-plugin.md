# HMR RisuAI 수신 플러그인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스톡 RisuAI v3 플러그인(단일 .js 번들)을 만들어 워크벤치 HMR 서버에 롱폴링으로 연결하고, 수신한 정의를 매핑된 character/module에 merge 반영한다.

**Architecture:** `risuai.*` 호출을 얇은 어댑터(`risuApi.ts`)로 격리하고, 프로토콜 파서·merge·에셋 확보·백오프·상태 머신은 전부 순수 모듈로 만들어 vitest로 테스트한다. UI는 iframe 내 fullscreen 위저드(`ui/wizard.ts`)와 mainDom 전역 배지(`ui/badge.ts`). 신규 워크스페이스 패키지 `packages/hmr-plugin`으로 두되 core를 import하지 않는다(샌드박스 단일 번들 — wire 타입은 의도적 복제, 원본은 core의 `src/domain/hmr/protocol.ts`). 스펙: `docs/superpowers/specs/2026-07-09-risuai-hmr-sync-design.md`.

**Tech Stack:** TypeScript strict, Vite lib mode(단일 ES 번들 + 메타데이터 배너), vitest, RisuAI Plugin API v3 (vendored `risuai.d.ts`).

## Global Constraints

- 플러그인 헤더(배너) 필수 2줄: `//@name …`, `//@api 3.0` (파싱: `risuai-pork/src/ts/plugins/plugins.svelte.ts:160-322`; `//@version`은 파일 첫 512바이트 내).
- 모든 `risuai.*` 호출은 async (postMessage RPC). API 전역 객체는 `risuai` (vendored d.ts가 `declare const risuai` 제공). 최상위 await 사용 가능 (async IIFE 래핑 — `factory.ts:602-604`).
- 네트워크는 `risuai.nativeFetch(url, { method: 'GET', networkRoute: 'local_network', requestTimeoutMs: 40000 })`만 사용 — **method 기본값이 POST이므로 GET 명시 필수**, 롱폴 25s보다 긴 타임아웃 명시. iframe 내 `fetch()`는 CSP로 차단됨.
- `getRuntimeInfo().platform === 'web'`이면 연결 거부 + "데스크톱 앱(Tauri) 또는 셀프호스트에서만 사용 가능" 안내.
- 연결 문자열 파싱: `risu-hmr://127.0.0.1:<port>#k=<token>` (core `buildHmrConnectionString`과 정확히 대칭).
- 에셋 플레이스홀더 `hmr-asset://<sha256hex>`; RisuAI 에셋 경로는 `assets/<sha256>.<ext>` (`globalApi.svelte.ts:232` saveAsset). probe는 `readImage('<hash>.<ext>')` → 실패 시 `'<hash>.png'` 폴백; Tauri는 throw·web/node는 null 반환(`globalApi.svelte.ts:209`) → try/catch + null 체크.
- merge 시 `chats`/`chatPage`/`chaId` 절대 보존 (수신 정의에 있어도 무시 — 이중 방어).
- 캐릭터 대상은 chaId로 식별, **매 적용마다 index 재해석 + chaId 재확인** 후 `setCharacterToIndex`. 모듈은 id 불변 치환 + `enabledModules` 불가침, `setDatabaseLite`로 반영.
- 안전 정지: 재연결 후 `/health`의 `project.stableId`가 매핑과 다르면 자동 추종 금지 → 정지 + `alertError`.
- `alert`/`alertConfirm`/`alertError`/`setChatPanel`은 비문서화 — **존재 검사 후 사용**, 없으면 생략/자체 UI.
- 테스트: repo 루트에서 `npm run test --workspace risu-workbench-hmr-plugin -- tests/<file>.test.ts`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: 패키지 스캐폴드 + 단일 번들 빌드

**Files:**
- Create: `packages/hmr-plugin/package.json`, `packages/hmr-plugin/tsconfig.json`, `packages/hmr-plugin/vite.config.ts`, `packages/hmr-plugin/vitest.config.ts`, `packages/hmr-plugin/src/main.ts`(임시), `packages/hmr-plugin/src/types/risuai.d.ts`(vendored)

**Interfaces:**
- Produces: `npm run build --workspace risu-workbench-hmr-plugin` → `packages/hmr-plugin/dist/risu-workbench-hmr.js` (배너 포함 단일 ES 번들)

- [ ] **Step 1: 의존성 버전 확인** (워크스페이스 hoisting 일관성)

Run: `grep '"vite"' packages/webview/package.json && grep '"vitest"' packages/core/package.json && grep '"typescript"' packages/core/package.json`
Expected: 각 버전 specifier 출력 — Step 2의 package.json에 그 값을 그대로 사용 (아래 예시 값과 다르면 출력값 우선).

- [ ] **Step 2: 설정 파일 작성**

```json
// packages/hmr-plugin/package.json  (버전 specifier는 Step 1 출력으로 교체)
{
  "name": "risu-workbench-hmr-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "vite": "^7.0.0",
    "vitest": "^4.0.0"
  }
}
```

```json
// packages/hmr-plugin/tsconfig.json  (create-risu-plugin vanilla 템플릿 기준)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src", "src/types/**/*.d.ts", "tests"]
}
```

```ts
// packages/hmr-plugin/vite.config.ts
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  name: string;
  version: string;
};

// RisuAI 플러그인 메타데이터 배너 (plugins.svelte.ts:160-322 파서 대상).
// //@version은 파일 첫 512바이트 내에 있어야 한다.
const banner = [
  `//@name ${pkg.name}`,
  '//@display-name Risu Workbench HMR',
  '//@api 3.0',
  `//@version ${pkg.version}`,
  '',
].join('\n');

export default defineConfig({
  build: {
    target: 'es2022',
    minify: 'esbuild',
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.ts',
      formats: ['es'],
      fileName: () => 'risu-workbench-hmr.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  plugins: [
    {
      name: 'risu-plugin-banner',
      enforce: 'post',
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk' && chunk.isEntry) {
            chunk.code = banner + chunk.code;
          }
        }
      },
    },
  ],
});
```

```ts
// packages/hmr-plugin/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

```ts
// packages/hmr-plugin/src/main.ts  (임시 — Task 8에서 교체)
console.log('risu-workbench-hmr: bootstrap placeholder');
```

- [ ] **Step 3: risuai.d.ts vendor** (원본 = risuai-pork; 템플릿 복사본은 drift 있음)

Run:
```bash
mkdir -p packages/hmr-plugin/src/types
cp ../risuai-pork/src/ts/plugins/apiV3/risuai.d.ts packages/hmr-plugin/src/types/risuai.d.ts
```
(repo 루트 `risuai-workbench/`에서 실행 — risuai-pork는 형제 디렉터리)

- [ ] **Step 4: 설치 + 빌드 확인**

Run: `npm install` (repo 루트 — 워크스페이스 등록) 후 `npm run build --workspace risu-workbench-hmr-plugin`
Expected: 성공

Run: `head -5 packages/hmr-plugin/dist/risu-workbench-hmr.js`
Expected:
```
//@name risu-workbench-hmr-plugin
//@display-name Risu Workbench HMR
//@api 3.0
//@version 0.1.0
```

- [ ] **Step 5: Commit**

```bash
git add packages/hmr-plugin package-lock.json
git commit -m "feat(hmr-plugin): 패키지 스캐폴드 + 배너 포함 단일 번들 빌드

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: protocol.ts — wire 타입 복제 + 연결 문자열 파서

**Files:**
- Create: `packages/hmr-plugin/src/protocol.ts`
- Test: `packages/hmr-plugin/tests/protocol.test.ts`

**Interfaces:**
- Produces: `HMR_PROTOCOL_VERSION`, `HMR_ASSET_PLACEHOLDER_PREFIX`, `HmrAssetEntry`/`HmrHealthResponse`/`HmrWatchResponse`/`HmrPayloadResponse`(core `src/domain/hmr/protocol.ts`와 동일 정의 — 의도적 복제), `HmrConnection { baseUrl: string; token: string; raw: string }`, `parseConnectionString(raw: string): HmrConnection | null`, `buildRequestUrl(connection: HmrConnection, path: string, params?: Record<string, string>): string`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// packages/hmr-plugin/tests/protocol.test.ts
import { describe, expect, it } from 'vitest';
import { buildRequestUrl, parseConnectionString } from '../src/protocol';

describe('parseConnectionString', () => {
  it('parses a valid connection string', () => {
    expect(parseConnectionString('risu-hmr://127.0.0.1:41520#k=8f3a92aa')).toEqual({
      baseUrl: 'http://127.0.0.1:41520',
      token: '8f3a92aa',
      raw: 'risu-hmr://127.0.0.1:41520#k=8f3a92aa',
    });
  });

  it('trims whitespace and accepts localhost', () => {
    expect(parseConnectionString('  risu-hmr://localhost:41529#k=abc  ')?.baseUrl).toBe('http://127.0.0.1:41529');
  });

  it('rejects malformed input', () => {
    expect(parseConnectionString('http://127.0.0.1:41520')).toBeNull();
    expect(parseConnectionString('risu-hmr://10.0.0.5:41520#k=abc')).toBeNull();
    expect(parseConnectionString('risu-hmr://127.0.0.1:41520')).toBeNull();
  });
});

describe('buildRequestUrl', () => {
  it('appends path params and token', () => {
    const connection = parseConnectionString('risu-hmr://127.0.0.1:41520#k=tok')!;
    expect(buildRequestUrl(connection, '/watch', { since: '3' })).toBe(
      'http://127.0.0.1:41520/watch?since=3&k=tok',
    );
    expect(buildRequestUrl(connection, '/health')).toBe('http://127.0.0.1:41520/health?k=tok');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test --workspace risu-workbench-hmr-plugin -- tests/protocol.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// packages/hmr-plugin/src/protocol.ts
/**
 * HMR wire 프로토콜 — risu-workbench-core src/domain/hmr/protocol.ts의 의도적 복제.
 * (플러그인은 샌드박스 단일 번들이라 core를 import하지 않는다. 변경 시 양쪽 동기화 +
 * HMR_PROTOCOL_VERSION 증가.)
 */

export const HMR_PROTOCOL_VERSION = 1;

export const HMR_ASSET_PLACEHOLDER_PREFIX = 'hmr-asset://';

export interface HmrAssetEntry {
  hash: string;
  ext: string;
  role: string;
  size: number;
}

export interface HmrHealthResponse {
  app: 'risu-workbench-hmr';
  protocolVersion: number;
  project: { name: string; kind: 'character' | 'module'; stableId: string };
  version: number;
}

export interface HmrWatchResponse {
  version: number;
  definitionChanged: boolean;
  changedAssets: string[];
}

export interface HmrPayloadResponse {
  kind: 'character' | 'module';
  data: Record<string, unknown>;
  assets: HmrAssetEntry[];
}

export interface HmrConnection {
  baseUrl: string;
  token: string;
  raw: string;
}

const CONNECTION_PATTERN = /^risu-hmr:\/\/(127\.0\.0\.1|localhost):(\d{2,5})#k=([0-9A-Za-z_-]+)$/;

export function parseConnectionString(raw: string): HmrConnection | null {
  const trimmed = raw.trim();
  const match = CONNECTION_PATTERN.exec(trimmed);
  if (!match) return null;
  return { baseUrl: `http://127.0.0.1:${match[2]}`, token: match[3], raw: trimmed };
}

export function buildRequestUrl(
  connection: HmrConnection,
  path: string,
  params?: Record<string, string>,
): string {
  const search = new URLSearchParams({ ...(params ?? {}), k: connection.token });
  return `${connection.baseUrl}${path}?${search.toString()}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test --workspace risu-workbench-hmr-plugin -- tests/protocol.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/hmr-plugin/src/protocol.ts packages/hmr-plugin/tests/protocol.test.ts
git commit -m "feat(hmr-plugin): wire 프로토콜 복제 + 연결 문자열 파서

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: merge.ts + backoff.ts — 순수 merge/식별/백오프 로직

**Files:**
- Create: `packages/hmr-plugin/src/merge.ts`, `packages/hmr-plugin/src/backoff.ts`
- Test: `packages/hmr-plugin/tests/merge.test.ts`, `packages/hmr-plugin/tests/backoff.test.ts`

**Interfaces:**
- Produces:
  - `PRESERVED_CHARACTER_KEYS: readonly ['chats', 'chatPage', 'chaId']`
  - `mergeCharacterDefinition(existing: Record<string, unknown>, definition: Record<string, unknown>): Record<string, unknown>`
  - `applyAssetPlaceholders<T>(value: T, resolve: (hash: string) => string): T` — 깊은 순회, 미해결 해시는 throw
  - `findCharacterIndexByChaId(characters: readonly unknown[], chaId: string): number` (-1 = 없음; groupChat 제외)
  - `replaceModuleById(modules: readonly unknown[], moduleId: string, incoming: Record<string, unknown>): unknown[] | null` (null = 대상 없음; incoming의 id는 moduleId로 강제)
  - `nextBackoffDelayMs(attempt: number): number` — 2000·4000·8000·…·30000 상한

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// packages/hmr-plugin/tests/merge.test.ts
import { describe, expect, it } from 'vitest';
import {
  applyAssetPlaceholders,
  findCharacterIndexByChaId,
  mergeCharacterDefinition,
  replaceModuleById,
} from '../src/merge';

describe('mergeCharacterDefinition', () => {
  it('overwrites definition keys and preserves user state', () => {
    const existing = {
      name: 'Old',
      desc: 'old-desc',
      chats: [{ message: ['hi'] }],
      chatPage: 3,
      chaId: 'stable-id',
      viewScreen: 'emotion',
    };
    const merged = mergeCharacterDefinition(existing, {
      name: 'New',
      desc: 'new-desc',
      // 서버가 실수로 보내도 보존 필드는 무시된다 (이중 방어)
      chats: [],
      chatPage: 0,
      chaId: 'evil-overwrite',
    });
    expect(merged).toMatchObject({
      name: 'New',
      desc: 'new-desc',
      chats: [{ message: ['hi'] }],
      chatPage: 3,
      chaId: 'stable-id',
      viewScreen: 'emotion',
    });
  });
});

describe('applyAssetPlaceholders', () => {
  it('replaces placeholders deeply in strings, arrays, objects', () => {
    const resolve = (hash: string) => `assets/${hash}.png`;
    const input = {
      image: 'hmr-asset://aaa',
      emotionImages: [['joy', 'hmr-asset://bbb']],
      nested: { keep: 'plain-string' },
    };
    expect(applyAssetPlaceholders(input, resolve)).toEqual({
      image: 'assets/aaa.png',
      emotionImages: [['joy', 'assets/bbb.png']],
      nested: { keep: 'plain-string' },
    });
  });

  it('throws on unresolved hash', () => {
    expect(() =>
      applyAssetPlaceholders({ image: 'hmr-asset://missing' }, () => {
        throw new Error('unresolved asset: missing');
      }),
    ).toThrow(/missing/);
  });
});

describe('findCharacterIndexByChaId', () => {
  it('finds by chaId, skipping group chats', () => {
    const characters = [
      { chaId: 'g1', type: 'group' },
      { chaId: 'c1', type: 'character' },
      null,
    ];
    expect(findCharacterIndexByChaId(characters, 'c1')).toBe(1);
    expect(findCharacterIndexByChaId(characters, 'g1')).toBe(-1);
    expect(findCharacterIndexByChaId(characters, 'zzz')).toBe(-1);
  });
});

describe('replaceModuleById', () => {
  it('replaces the matching module, forcing id, preserving order', () => {
    const modules = [
      { id: 'm1', name: 'A' },
      { id: 'm2', name: 'B' },
    ];
    const result = replaceModuleById(modules, 'm2', { id: 'ignored', name: 'B2', lorebook: [] });
    expect(result).toEqual([
      { id: 'm1', name: 'A' },
      { id: 'm2', name: 'B2', lorebook: [] },
    ]);
    expect(replaceModuleById(modules, 'nope', { name: 'X' })).toBeNull();
  });
});
```

```ts
// packages/hmr-plugin/tests/backoff.test.ts
import { describe, expect, it } from 'vitest';
import { nextBackoffDelayMs } from '../src/backoff';

describe('nextBackoffDelayMs', () => {
  it('doubles from 2s and caps at 30s', () => {
    expect(nextBackoffDelayMs(0)).toBe(2000);
    expect(nextBackoffDelayMs(1)).toBe(4000);
    expect(nextBackoffDelayMs(2)).toBe(8000);
    expect(nextBackoffDelayMs(3)).toBe(16000);
    expect(nextBackoffDelayMs(4)).toBe(30000);
    expect(nextBackoffDelayMs(10)).toBe(30000);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test --workspace risu-workbench-hmr-plugin -- tests/merge.test.ts tests/backoff.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// packages/hmr-plugin/src/backoff.ts
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 30_000;

/** 재연결 지수 백오프: 2s → 4s → 8s → … → 30s 상한. */
export function nextBackoffDelayMs(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}
```

```ts
// packages/hmr-plugin/src/merge.ts
import { HMR_ASSET_PLACEHOLDER_PREFIX } from './protocol';

/**
 * merge 정책의 클라이언트측 보증.
 * 서버 페이로드에 존재하는 키만 덮어쓰되, 아래 사용자 상태 키는
 * 페이로드에 있어도 절대 덮어쓰지 않는다 (spec: Merge 정책).
 */
export const PRESERVED_CHARACTER_KEYS = ['chats', 'chatPage', 'chaId'] as const;

export function mergeCharacterDefinition(
  existing: Record<string, unknown>,
  definition: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(definition)) {
    if ((PRESERVED_CHARACTER_KEYS as readonly string[]).includes(key)) continue;
    merged[key] = value;
  }
  return merged;
}

/**
 * applyAssetPlaceholders 함수.
 * 값을 깊게 순회하며 'hmr-asset://<hash>' 문자열을 resolve(hash) 결과로 치환한다.
 */
export function applyAssetPlaceholders<T>(value: T, resolve: (hash: string) => string): T {
  if (typeof value === 'string') {
    if (value.startsWith(HMR_ASSET_PLACEHOLDER_PREFIX)) {
      return resolve(value.slice(HMR_ASSET_PLACEHOLDER_PREFIX.length)) as unknown as T;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyAssetPlaceholders(item, resolve)) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = applyAssetPlaceholders(item, resolve);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * findCharacterIndexByChaId 함수.
 * characters 배열에서 chaId로 index를 재해석한다. groupChat(type:'group')은 제외.
 * RisuAI에는 by-chaId 접근자가 없어 매 적용마다 이 재해석이 필요하다.
 */
export function findCharacterIndexByChaId(characters: readonly unknown[], chaId: string): number {
  return characters.findIndex((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return false;
    const record = candidate as Record<string, unknown>;
    return record.chaId === chaId && record.type !== 'group';
  });
}

/**
 * replaceModuleById 함수.
 * 매핑된 id의 모듈을 통째로 치환한다 (id는 불변 강제, 순서 보존).
 * enabledModules는 건드리지 않는다 — 호출자가 modules 배열만 쓴다.
 */
export function replaceModuleById(
  modules: readonly unknown[],
  moduleId: string,
  incoming: Record<string, unknown>,
): unknown[] | null {
  const index = modules.findIndex(
    (candidate) =>
      typeof candidate === 'object' && candidate !== null && (candidate as Record<string, unknown>).id === moduleId,
  );
  if (index < 0) return null;
  const next = [...modules];
  next[index] = { ...incoming, id: moduleId };
  return next;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test --workspace risu-workbench-hmr-plugin -- tests/merge.test.ts tests/backoff.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/hmr-plugin/src/merge.ts packages/hmr-plugin/src/backoff.ts packages/hmr-plugin/tests/merge.test.ts packages/hmr-plugin/tests/backoff.test.ts
git commit -m "feat(hmr-plugin): merge/식별/플레이스홀더/백오프 순수 로직

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: assets.ts — probe 기반 에셋 확보 파이프라인

**Files:**
- Create: `packages/hmr-plugin/src/assets.ts`
- Test: `packages/hmr-plugin/tests/assets.test.ts`

**Interfaces:**
- Consumes: `HmrAssetEntry` (Task 2)
- Produces:

```ts
export interface AssetDeps {
  cacheGet(hash: string): string | undefined;
  cacheSet(hash: string, path: string): void;
  probeImage(fileName: string): Promise<boolean>; // readImage 성공 여부 (어댑터가 try/catch+null 처리)
  downloadAsset(hash: string): Promise<Uint8Array>;
  saveAsset(bytes: Uint8Array): Promise<string>;  // 'assets/<hash>.<ext>' 반환
}
export interface EnsureAssetsProgress { phase: 'probe' | 'download'; done: number; total: number; }
export function ensureAssets(
  entries: readonly HmrAssetEntry[],
  deps: AssetDeps,
  onProgress?: (progress: EnsureAssetsProgress) => void,
): Promise<Map<string, string>>  // hash → risu 에셋 경로
```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// packages/hmr-plugin/tests/assets.test.ts
import { describe, expect, it } from 'vitest';
import { ensureAssets, type AssetDeps } from '../src/assets';
import type { HmrAssetEntry } from '../src/protocol';

function entry(hash: string, ext = 'png'): HmrAssetEntry {
  return { hash, ext, role: `asset:${hash}`, size: 3 };
}

function makeDeps(overrides: Partial<AssetDeps> = {}): AssetDeps & { calls: string[] } {
  const calls: string[] = [];
  const cache = new Map<string, string>();
  return {
    calls,
    cacheGet: (hash) => cache.get(hash),
    cacheSet: (hash, path) => void cache.set(hash, path),
    probeImage: async (fileName) => {
      calls.push(`probe:${fileName}`);
      return false;
    },
    downloadAsset: async (hash) => {
      calls.push(`download:${hash}`);
      return new Uint8Array([1, 2, 3]);
    },
    saveAsset: async () => {
      calls.push('save');
      return 'assets/saved.png';
    },
    ...overrides,
  };
}

describe('ensureAssets', () => {
  it('uses cache first — no probe, no download', async () => {
    const deps = makeDeps();
    deps.cacheSet('aaa', 'assets/aaa.png');
    const result = await ensureAssets([entry('aaa')], deps);
    expect(result.get('aaa')).toBe('assets/aaa.png');
    expect(deps.calls).toEqual([]);
  });

  it('adopts existing asset on probe hit (ext then png fallback)', async () => {
    const deps = makeDeps({
      probeImage: async (fileName) => fileName === 'bbb.png',
    });
    const result = await ensureAssets([entry('bbb', 'webp')], deps);
    // 'bbb.webp' probe 실패 → 'bbb.png' 폴백 적중 → 채택
    expect(result.get('bbb')).toBe('assets/bbb.png');
    expect(deps.calls.filter((call) => call.startsWith('download'))).toEqual([]);
  });

  it('downloads and saves on probe miss, then caches', async () => {
    const deps = makeDeps();
    const result = await ensureAssets([entry('ccc')], deps);
    expect(result.get('ccc')).toBe('assets/saved.png');
    expect(deps.calls).toContain('download:ccc');
    expect(deps.cacheGet('ccc')).toBe('assets/saved.png');
  });

  it('reports two-phase progress', async () => {
    const deps = makeDeps();
    const progress: string[] = [];
    await ensureAssets([entry('a'), entry('b')], deps, (p) => progress.push(`${p.phase}:${p.done}/${p.total}`));
    expect(progress).toContain('probe:2/2');
    expect(progress).toContain('download:2/2');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test --workspace risu-workbench-hmr-plugin -- tests/assets.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// packages/hmr-plugin/src/assets.ts
import type { HmrAssetEntry } from './protocol';

export interface AssetDeps {
  cacheGet(hash: string): string | undefined;
  cacheSet(hash: string, path: string): void;
  probeImage(fileName: string): Promise<boolean>;
  downloadAsset(hash: string): Promise<Uint8Array>;
  saveAsset(bytes: Uint8Array): Promise<string>;
}

export interface EnsureAssetsProgress {
  phase: 'probe' | 'download';
  done: number;
  total: number;
}

/**
 * ensureAssets 함수.
 * 매니페스트의 모든 에셋을 "캐시 → probe 채택 → 다운로드+saveAsset" 순으로 확보한다.
 * RisuAI 저장소가 콘텐츠 주소 방식(assets/<sha256>.<ext>)이므로 probe는 경로 예측만으로 가능.
 * 진행률은 probe 단계(로컬, 빠름)와 download 단계(miss만)로 나눠 보고한다.
 */
export async function ensureAssets(
  entries: readonly HmrAssetEntry[],
  deps: AssetDeps,
  onProgress?: (progress: EnsureAssetsProgress) => void,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const misses: HmrAssetEntry[] = [];

  let probed = 0;
  for (const entry of entries) {
    if (resolved.has(entry.hash)) {
      probed += 1;
      continue;
    }
    const cached = deps.cacheGet(entry.hash);
    if (cached) {
      resolved.set(entry.hash, cached);
    } else {
      const candidates = entry.ext === 'png' ? [`${entry.hash}.png`] : [`${entry.hash}.${entry.ext}`, `${entry.hash}.png`];
      let adoptedPath: string | undefined;
      for (const candidate of candidates) {
        if (await deps.probeImage(candidate)) {
          adoptedPath = `assets/${candidate}`;
          break;
        }
      }
      if (adoptedPath) {
        resolved.set(entry.hash, adoptedPath);
        deps.cacheSet(entry.hash, adoptedPath);
      } else {
        misses.push(entry);
      }
    }
    probed += 1;
    onProgress?.({ phase: 'probe', done: probed, total: entries.length });
  }
  if (entries.length === 0) onProgress?.({ phase: 'probe', done: 0, total: 0 });

  let downloaded = 0;
  for (const entry of misses) {
    const bytes = await deps.downloadAsset(entry.hash);
    const savedPath = await deps.saveAsset(bytes);
    resolved.set(entry.hash, savedPath);
    deps.cacheSet(entry.hash, savedPath);
    downloaded += 1;
    onProgress?.({ phase: 'download', done: downloaded, total: misses.length });
  }

  return resolved;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test --workspace risu-workbench-hmr-plugin -- tests/assets.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/hmr-plugin/src/assets.ts packages/hmr-plugin/tests/assets.test.ts
git commit -m "feat(hmr-plugin): probe 기반 에셋 확보 파이프라인

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: storage.ts — 매핑 영속화

**Files:**
- Create: `packages/hmr-plugin/src/storage.ts`
- Test: `packages/hmr-plugin/tests/storage.test.ts`

**Interfaces:**
- Produces:

```ts
export interface HmrMapping {
  connectionString: string;
  stableId: string;
  kind: 'character' | 'module';
  targetChaId?: string;
  targetModuleId?: string;
  targetLabel: string;
  appliedVersion: number;
  badgeEnabled: boolean;
  assetCache: Record<string, string>; // hash → risu 에셋 경로
  savedAtMs: number;
}
export interface KeyValueStorage {
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: unknown): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface MappingStore {
  load(): Promise<HmrMapping | null>;
  save(mapping: HmrMapping): Promise<void>;
  clear(): Promise<void>;
}
export function createMappingStore(storage: KeyValueStorage): MappingStore
```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// packages/hmr-plugin/tests/storage.test.ts
import { describe, expect, it } from 'vitest';
import { createMappingStore, type HmrMapping } from '../src/storage';

function makeFakeStorage() {
  const backing = new Map<string, unknown>();
  return {
    getItem: async (key: string) => backing.get(key),
    setItem: async (key: string, value: unknown) => void backing.set(key, value),
    removeItem: async (key: string) => void backing.delete(key),
  };
}

const MAPPING: HmrMapping = {
  connectionString: 'risu-hmr://127.0.0.1:41520#k=tok',
  stableId: 'sid',
  kind: 'character',
  targetChaId: 'cha-1',
  targetLabel: 'Aria',
  appliedVersion: 3,
  badgeEnabled: true,
  assetCache: { aaa: 'assets/aaa.png' },
  savedAtMs: 1,
};

describe('createMappingStore', () => {
  it('round-trips a mapping and clears it', async () => {
    const store = createMappingStore(makeFakeStorage());
    expect(await store.load()).toBeNull();
    await store.save(MAPPING);
    expect(await store.load()).toEqual(MAPPING);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('rejects corrupt stored values as null', async () => {
    const storage = makeFakeStorage();
    await storage.setItem('hmr-mapping-v1', { garbage: true });
    const store = createMappingStore(storage);
    expect(await store.load()).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test --workspace risu-workbench-hmr-plugin -- tests/storage.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// packages/hmr-plugin/src/storage.ts
export interface HmrMapping {
  connectionString: string;
  stableId: string;
  kind: 'character' | 'module';
  targetChaId?: string;
  targetModuleId?: string;
  targetLabel: string;
  appliedVersion: number;
  badgeEnabled: boolean;
  assetCache: Record<string, string>;
  savedAtMs: number;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: unknown): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface MappingStore {
  load(): Promise<HmrMapping | null>;
  save(mapping: HmrMapping): Promise<void>;
  clear(): Promise<void>;
}

const STORAGE_KEY = 'hmr-mapping-v1';

function isMapping(value: unknown): value is HmrMapping {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.connectionString === 'string' &&
    typeof record.stableId === 'string' &&
    (record.kind === 'character' || record.kind === 'module') &&
    typeof record.targetLabel === 'string' &&
    typeof record.appliedVersion === 'number' &&
    typeof record.badgeEnabled === 'boolean' &&
    typeof record.assetCache === 'object' &&
    record.assetCache !== null
  );
}

/**
 * createMappingStore 함수.
 * pluginStorage(save 파일에 동기화됨) 위에 매핑 스키마 v1을 얹는다.
 */
export function createMappingStore(storage: KeyValueStorage): MappingStore {
  return {
    async load() {
      const raw = await storage.getItem(STORAGE_KEY);
      return isMapping(raw) ? raw : null;
    },
    async save(mapping) {
      await storage.setItem(STORAGE_KEY, mapping);
    },
    async clear() {
      await storage.removeItem(STORAGE_KEY);
    },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test --workspace risu-workbench-hmr-plugin -- tests/storage.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/hmr-plugin/src/storage.ts packages/hmr-plugin/tests/storage.test.ts
git commit -m "feat(hmr-plugin): 매핑 영속화 스토어

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: controller.ts — 연결·적용·재연결 상태 머신

**Files:**
- Create: `packages/hmr-plugin/src/controller.ts`
- Test: `packages/hmr-plugin/tests/controller.test.ts`

**Interfaces:**
- Consumes: Task 2-5 전부
- Produces:

```ts
export type HmrPhase =
  | 'idle' | 'connecting' | 'selecting' | 'confirming'
  | 'initialSync' | 'active' | 'paused' | 'reconnecting' | 'stoppedError';

export interface HmrPublicState {
  phase: HmrPhase;
  project?: HmrHealthResponse['project'];
  targetLabel?: string;
  appliedVersion: number;
  updateCount: number;
  badgeEnabled: boolean;
  lastError?: string;
  syncProgress?: EnsureAssetsProgress;
}

export interface ControllerDeps {
  getPlatform(): Promise<'web' | 'tauri' | 'node'>;
  fetchJson(url: string): Promise<unknown>;          // nativeFetch GET → res.json()
  fetchBinary(url: string): Promise<Uint8Array>;     // nativeFetch GET → arrayBuffer
  getCharacters(): Promise<unknown[]>;               // getDatabase(['characters'])
  setCharacterToIndex(index: number, character: unknown): Promise<void>;
  getModules(): Promise<unknown[]>;                  // getDatabase(['modules'])
  setModulesLite(modules: unknown[]): Promise<void>; // setDatabaseLite({ modules })
  persistDatabase(): Promise<void>;                  // idle 확정 저장
  probeImage(fileName: string): Promise<boolean>;
  saveAsset(bytes: Uint8Array): Promise<string>;
  store: MappingStore;
  sleep(ms: number): Promise<void>;
  onState(state: HmrPublicState): void;
  alertError(message: string): Promise<void>;
  idlePersistDelayMs?: number;                       // 기본 3000
}

export class HmrController {
  constructor(deps: ControllerDeps);
  getState(): HmrPublicState;
  connect(raw: string): Promise<HmrHealthResponse>;              // parse+platform check+health (+protocolVersion 검증)
  listCharacterTargets(): Promise<Array<{ index: number; chaId: string; name: string; image?: string }>>;
  listModuleTargets(): Promise<Array<{ id: string; name: string; description?: string }>>;
  confirmAndStart(target: { chaId?: string; moduleId?: string; label: string; badgeEnabled: boolean }): Promise<void>;
  tryAutoReconnect(): Promise<boolean>;              // 저장된 매핑으로 무확인 재개 (stableId 동일 시)
  pause(): void;
  resume(): void;
  disconnect(): Promise<void>;                       // 매핑 clear + idle
}
```

- [ ] **Step 1: 실패하는 테스트 작성** (fake deps로 결정적 시나리오)

```ts
// packages/hmr-plugin/tests/controller.test.ts
import { describe, expect, it } from 'vitest';
import { HmrController, type ControllerDeps, type HmrPublicState } from '../src/controller';
import { createMappingStore } from '../src/storage';

const CONN = 'risu-hmr://127.0.0.1:41520#k=tok';

interface Fake {
  deps: ControllerDeps;
  states: HmrPublicState[];
  characters: unknown[];
  written: Array<{ index: number; character: Record<string, unknown> }>;
  alerts: string[];
  setHealth(health: unknown): void;
  pushWatch(response: unknown): void;
  setPayload(payload: unknown): void;
  releaseAll(): void;
}

function makeFake(): Fake {
  const states: HmrPublicState[] = [];
  const written: Array<{ index: number; character: Record<string, unknown> }> = [];
  const alerts: string[] = [];
  const characters: unknown[] = [
    { chaId: 'cha-1', type: 'character', name: 'Old', desc: 'old', chats: [{ m: 1 }], chatPage: 2 },
  ];
  let health: unknown = {
    app: 'risu-workbench-hmr',
    protocolVersion: 1,
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
      if (url.includes('/health')) return health;
      if (url.includes('/payload')) return payload;
      if (url.includes('/watch')) {
        while (watchQueue.length === 0) {
          if (stopped) return { version: 0, definitionChanged: false, changedAssets: [] };
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        const next = watchQueue.shift();
        if (next instanceof Error) throw next;
        return next;
      }
      throw new Error(`unexpected url: ${url}`);
    },
    fetchBinary: async () => new Uint8Array(),
    getCharacters: async () => characters,
    setCharacterToIndex: async (index, character) => {
      written.push({ index, character: character as Record<string, unknown> });
      characters[index] = character;
    },
    getModules: async () => [],
    setModulesLite: async () => {},
    persistDatabase: async () => {},
    probeImage: async () => false,
    saveAsset: async () => 'assets/x.png',
    store,
    sleep: async () => {},
    onState: (state) => states.push(state),
    alertError: async (message) => void alerts.push(message),
    idlePersistDelayMs: 1,
  };

  return {
    deps,
    states,
    characters,
    written,
    alerts,
    setHealth: (value) => void (health = value),
    pushWatch: (response) => void watchQueue.push(response),
    setPayload: (value) => void (payload = value),
    releaseAll: () => void (stopped = true),
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

describe('HmrController', () => {
  it('rejects web platform at connect', async () => {
    const fake = makeFake();
    fake.deps.getPlatform = async () => 'web';
    const controller = new HmrController(fake.deps);
    await expect(controller.connect(CONN)).rejects.toThrow(/데스크톱|web/i);
  });

  it('rejects protocolVersion mismatch', async () => {
    const fake = makeFake();
    fake.setHealth({ app: 'risu-workbench-hmr', protocolVersion: 99, project: { name: 'A', kind: 'character', stableId: 's' }, version: 1 });
    const controller = new HmrController(fake.deps);
    await expect(controller.connect(CONN)).rejects.toThrow(/protocol/i);
  });

  it('applies an update: merge preserves chats/chaId, count increments', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: 'Old', badgeEnabled: false });
    // 초기 동기화 1회 적용 후 watch 루프 진입 — 갱신 1건 밀어넣기
    fake.setPayload({ kind: 'character', data: { name: 'Newer', desc: 'v2', chats: [], chaId: 'evil' }, assets: [] });
    fake.pushWatch({ version: 2, definitionChanged: true, changedAssets: [] });
    await waitFor(() => fake.written.length >= 2);
    const last = fake.written.at(-1)!;
    expect(last.character.name).toBe('Newer');
    expect(last.character.chats).toEqual([{ m: 1 }]);
    expect(last.character.chaId).toBe('cha-1');
    expect(controller.getState().updateCount).toBeGreaterThanOrEqual(1);
    await controller.disconnect();
    fake.releaseAll();
  });

  it('safe-stops when broadcast stableId changes after reconnect', async () => {
    const fake = makeFake();
    const controller = new HmrController(fake.deps);
    await controller.connect(CONN);
    await controller.confirmAndStart({ chaId: 'cha-1', label: 'Old', badgeEnabled: false });
    // watch가 에러 → 재연결 경로 → health의 stableId가 바뀌어 있음
    fake.setHealth({ app: 'risu-workbench-hmr', protocolVersion: 1, project: { name: 'Bob', kind: 'character', stableId: 'sid-OTHER' }, version: 1 });
    fake.pushWatch(new Error('conn refused'));
    await waitFor(() => controller.getState().phase === 'stoppedError');
    expect(fake.alerts.length).toBeGreaterThan(0);
    fake.releaseAll();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test --workspace risu-workbench-hmr-plugin -- tests/controller.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// packages/hmr-plugin/src/controller.ts
import { ensureAssets, type EnsureAssetsProgress } from './assets';
import { nextBackoffDelayMs } from './backoff';
import {
  HMR_PROTOCOL_VERSION,
  buildRequestUrl,
  parseConnectionString,
  type HmrConnection,
  type HmrHealthResponse,
  type HmrPayloadResponse,
  type HmrWatchResponse,
} from './protocol';
import {
  applyAssetPlaceholders,
  findCharacterIndexByChaId,
  mergeCharacterDefinition,
  replaceModuleById,
} from './merge';
import type { HmrMapping, MappingStore } from './storage';

export type HmrPhase =
  | 'idle'
  | 'connecting'
  | 'selecting'
  | 'confirming'
  | 'initialSync'
  | 'active'
  | 'paused'
  | 'reconnecting'
  | 'stoppedError';

export interface HmrPublicState {
  phase: HmrPhase;
  project?: HmrHealthResponse['project'];
  targetLabel?: string;
  appliedVersion: number;
  updateCount: number;
  badgeEnabled: boolean;
  lastError?: string;
  syncProgress?: EnsureAssetsProgress;
}

export interface ControllerDeps {
  getPlatform(): Promise<'web' | 'tauri' | 'node'>;
  fetchJson(url: string): Promise<unknown>;
  fetchBinary(url: string): Promise<Uint8Array>;
  getCharacters(): Promise<unknown[]>;
  setCharacterToIndex(index: number, character: unknown): Promise<void>;
  getModules(): Promise<unknown[]>;
  setModulesLite(modules: unknown[]): Promise<void>;
  persistDatabase(): Promise<void>;
  probeImage(fileName: string): Promise<boolean>;
  saveAsset(bytes: Uint8Array): Promise<string>;
  store: MappingStore;
  sleep(ms: number): Promise<void>;
  onState(state: HmrPublicState): void;
  alertError(message: string): Promise<void>;
  idlePersistDelayMs?: number;
}

export class HmrController {
  private phase: HmrPhase = 'idle';
  private connection: HmrConnection | undefined;
  private project: HmrHealthResponse['project'] | undefined;
  private mapping: HmrMapping | undefined;
  private appliedVersion = 0;
  private updateCount = 0;
  private connectVersion = 0;
  private lastError: string | undefined;
  private syncProgress: EnsureAssetsProgress | undefined;
  private loopGeneration = 0;
  private idlePersistTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: ControllerDeps) {}

  getState(): HmrPublicState {
    return {
      phase: this.phase,
      project: this.project,
      targetLabel: this.mapping?.targetLabel,
      appliedVersion: this.appliedVersion,
      updateCount: this.updateCount,
      badgeEnabled: this.mapping?.badgeEnabled ?? false,
      lastError: this.lastError,
      syncProgress: this.syncProgress,
    };
  }

  private setPhase(phase: HmrPhase, lastError?: string): void {
    this.phase = phase;
    this.lastError = lastError;
    this.deps.onState(this.getState());
  }

  /** 연결 문자열 검증 + 플랫폼 검사 + /health 핸드셰이크. */
  async connect(raw: string): Promise<HmrHealthResponse> {
    const connection = parseConnectionString(raw);
    if (!connection) throw new Error('연결 문자열 형식이 올바르지 않습니다 (risu-hmr://127.0.0.1:PORT#k=TOKEN).');
    if ((await this.deps.getPlatform()) === 'web') {
      throw new Error('web 빌드에서는 로컬 네트워크가 차단됩니다 — 데스크톱 앱(Tauri) 또는 셀프호스트에서 사용하세요.');
    }
    this.setPhase('connecting');
    const health = (await this.deps.fetchJson(buildRequestUrl(connection, '/health'))) as HmrHealthResponse;
    if (health?.app !== 'risu-workbench-hmr') throw new Error('워크벤치 HMR 서버가 아닙니다.');
    if (health.protocolVersion !== HMR_PROTOCOL_VERSION) {
      throw new Error(`protocolVersion 불일치 (서버 ${health.protocolVersion} ≠ 플러그인 ${HMR_PROTOCOL_VERSION}) — 워크벤치/플러그인을 업데이트하세요.`);
    }
    this.connection = connection;
    this.project = health.project;
    this.connectVersion = health.version;
    this.setPhase('selecting');
    return health;
  }

  async listCharacterTargets(): Promise<Array<{ index: number; chaId: string; name: string; image?: string }>> {
    const characters = await this.deps.getCharacters();
    return characters.flatMap((candidate, index) => {
      if (typeof candidate !== 'object' || candidate === null) return [];
      const record = candidate as Record<string, unknown>;
      if (record.type === 'group' || typeof record.chaId !== 'string') return [];
      return [{
        index,
        chaId: record.chaId,
        name: typeof record.name === 'string' ? record.name : '(unnamed)',
        image: typeof record.image === 'string' ? record.image : undefined,
      }];
    });
  }

  async listModuleTargets(): Promise<Array<{ id: string; name: string; description?: string }>> {
    const modules = await this.deps.getModules();
    return modules.flatMap((candidate) => {
      if (typeof candidate !== 'object' || candidate === null) return [];
      const record = candidate as Record<string, unknown>;
      if (typeof record.id !== 'string') return [];
      return [{
        id: record.id,
        name: typeof record.name === 'string' ? record.name : '(unnamed)',
        description: typeof record.description === 'string' ? record.description : undefined,
      }];
    });
  }

  async confirmAndStart(target: { chaId?: string; moduleId?: string; label: string; badgeEnabled: boolean }): Promise<void> {
    if (!this.connection || !this.project) throw new Error('connect가 선행되어야 합니다.');
    this.mapping = {
      connectionString: this.connection.raw,
      stableId: this.project.stableId,
      kind: this.project.kind,
      targetChaId: target.chaId,
      targetModuleId: target.moduleId,
      targetLabel: target.label,
      appliedVersion: 0,
      badgeEnabled: target.badgeEnabled,
      assetCache: {},
      savedAtMs: Date.now(),
    };
    this.appliedVersion = 0;
    this.updateCount = 0;
    this.setPhase('initialSync');
    await this.applyLatest(this.connectVersion); // 초기 전체 동기화 (updateCount에 미산입)
    await this.persistMapping();
    this.startLoop();
  }

  /** 저장된 매핑으로 자동 재연결. stableId 동일할 때만 재개 (스펙: 재연결 정책). */
  async tryAutoReconnect(): Promise<boolean> {
    const mapping = await this.deps.store.load();
    if (!mapping) return false;
    if ((await this.deps.getPlatform()) === 'web') return false;
    const connection = parseConnectionString(mapping.connectionString);
    if (!connection) return false;
    try {
      const health = (await this.deps.fetchJson(buildRequestUrl(connection, '/health'))) as HmrHealthResponse;
      if (health?.app !== 'risu-workbench-hmr' || health.protocolVersion !== HMR_PROTOCOL_VERSION) return false;
      if (health.project.stableId !== mapping.stableId) return false;
      this.connection = connection;
      this.project = health.project;
      this.connectVersion = health.version;
      this.mapping = mapping;
      this.appliedVersion = mapping.appliedVersion;
      this.setPhase('active');
      if (health.version > this.appliedVersion) await this.applyLatest(health.version);
      this.startLoop();
      return true;
    } catch {
      return false;
    }
  }

  pause(): void {
    if (this.phase !== 'active' && this.phase !== 'reconnecting') return;
    this.loopGeneration += 1; // 진행 중 루프 무효화
    this.setPhase('paused');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.setPhase('active');
    void this.refreshOnce();
    this.startLoop();
  }

  /** 일시정지 해제 직후 최신 버전을 1회 당겨온다 (놓친 갱신 즉시 반영). */
  private async refreshOnce(): Promise<void> {
    if (!this.connection) return;
    try {
      const health = (await this.deps.fetchJson(buildRequestUrl(this.connection, '/health'))) as HmrHealthResponse;
      if (typeof health?.version === 'number' && health.version > this.appliedVersion) {
        await this.applyLatest(health.version);
        this.deps.onState(this.getState());
      }
    } catch {
      // 루프의 재연결 경로가 처리
    }
  }

  async disconnect(): Promise<void> {
    this.loopGeneration += 1;
    if (this.idlePersistTimer) clearTimeout(this.idlePersistTimer);
    await this.deps.store.clear();
    this.mapping = undefined;
    this.connection = undefined;
    this.project = undefined;
    this.setPhase('idle');
  }

  private startLoop(): void {
    this.loopGeneration += 1;
    const generation = this.loopGeneration;
    void this.runLoop(generation);
  }

  private async runLoop(generation: number): Promise<void> {
    let backoffAttempt = 0;
    while (generation === this.loopGeneration && this.connection && this.mapping) {
      try {
        const watch = (await this.deps.fetchJson(
          buildRequestUrl(this.connection, '/watch', { since: String(this.appliedVersion) }),
        )) as HmrWatchResponse;
        if (generation !== this.loopGeneration) return;
        backoffAttempt = 0;
        if (this.phase === 'reconnecting') this.setPhase('active');
        if (watch.version > this.appliedVersion && watch.definitionChanged) {
          await this.applyLatest(watch.version);
          this.updateCount += 1;
          this.scheduleIdlePersist();
          this.deps.onState(this.getState());
        }
      } catch (error) {
        if (generation !== this.loopGeneration) return;
        this.setPhase('reconnecting', error instanceof Error ? error.message : String(error));
        await this.deps.sleep(nextBackoffDelayMs(backoffAttempt));
        backoffAttempt += 1;
        if (generation !== this.loopGeneration) return;
        const recovered = await this.recheckHealth();
        if (recovered === 'stableIdChanged') {
          this.loopGeneration += 1;
          this.setPhase('stoppedError', '방송 대상이 바뀌었습니다 — 위저드에서 다시 확인하세요.');
          await this.deps.alertError('Workbench HMR: 방송 대상이 바뀌어 수신을 안전 정지했습니다.');
          return;
        }
      }
    }
  }

  private async recheckHealth(): Promise<'ok' | 'down' | 'stableIdChanged'> {
    if (!this.connection || !this.mapping) return 'down';
    try {
      const health = (await this.deps.fetchJson(buildRequestUrl(this.connection, '/health'))) as HmrHealthResponse;
      if (health?.project?.stableId && health.project.stableId !== this.mapping.stableId) return 'stableIdChanged';
      return 'ok';
    } catch {
      return 'down';
    }
  }

  /**
   * /payload를 받아 에셋 확보 → 플레이스홀더 치환 → merge 적용까지 수행한다.
   * @param version - 이 페이로드가 대응하는 서버 버전 (watch/health 응답에서 전달).
   *   적용 후 /health를 재조회해 확정하면 그 사이 서버가 리빌드됐을 때 중간 버전을
   *   건너뛰는 race가 생기므로 반드시 호출자가 알고 있는 버전을 쓴다.
   */
  private async applyLatest(version: number): Promise<void> {
    if (!this.connection || !this.mapping) return;
    const payload = (await this.deps.fetchJson(buildRequestUrl(this.connection, '/payload'))) as HmrPayloadResponse;
    const connection = this.connection;
    const mapping = this.mapping;

    const resolved = await ensureAssets(
      payload.assets,
      {
        cacheGet: (hash) => mapping.assetCache[hash],
        cacheSet: (hash, path) => void (mapping.assetCache[hash] = path),
        probeImage: this.deps.probeImage,
        downloadAsset: (hash) => this.deps.fetchBinary(buildRequestUrl(connection, `/asset/${hash}`)),
        saveAsset: this.deps.saveAsset,
      },
      (progress) => {
        this.syncProgress = progress;
        this.deps.onState(this.getState());
      },
    );

    const materialized = applyAssetPlaceholders(payload.data, (hash) => {
      const resolvedPath = resolved.get(hash);
      if (!resolvedPath) throw new Error(`unresolved asset: ${hash}`);
      return resolvedPath;
    });

    if (payload.kind === 'character') {
      if (!mapping.targetChaId) throw new Error('character 매핑에 chaId가 없습니다.');
      const characters = await this.deps.getCharacters();
      const index = findCharacterIndexByChaId(characters, mapping.targetChaId);
      if (index < 0) {
        this.loopGeneration += 1;
        this.setPhase('stoppedError', '대상 캐릭터가 삭제되었습니다 — 위저드에서 다시 선택하세요.');
        await this.deps.alertError('Workbench HMR: 대상 캐릭터가 삭제되어 수신을 정지했습니다.');
        throw new Error('target character deleted');
      }
      const existing = characters[index] as Record<string, unknown>;
      await this.deps.setCharacterToIndex(index, mergeCharacterDefinition(existing, materialized));
    } else {
      if (!mapping.targetModuleId) throw new Error('module 매핑에 moduleId가 없습니다.');
      const modules = await this.deps.getModules();
      const next = replaceModuleById(modules, mapping.targetModuleId, materialized);
      if (!next) {
        this.loopGeneration += 1;
        this.setPhase('stoppedError', '대상 모듈이 삭제되었습니다 — 위저드에서 다시 선택하세요.');
        await this.deps.alertError('Workbench HMR: 대상 모듈이 삭제되어 수신을 정지했습니다.');
        throw new Error('target module deleted');
      }
      await this.deps.setModulesLite(next);
    }

    this.appliedVersion = version;
    this.syncProgress = undefined;
    mapping.appliedVersion = this.appliedVersion;
    await this.persistMapping();
    if (this.phase === 'initialSync' || this.phase === 'connecting') this.setPhase('active');
    else this.deps.onState(this.getState());
  }

  private scheduleIdlePersist(): void {
    if (this.idlePersistTimer) clearTimeout(this.idlePersistTimer);
    this.idlePersistTimer = setTimeout(() => {
      void this.deps.persistDatabase().catch(() => {});
    }, this.deps.idlePersistDelayMs ?? 3_000);
  }

  private async persistMapping(): Promise<void> {
    if (this.mapping) await this.deps.store.save(this.mapping);
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test --workspace risu-workbench-hmr-plugin -- tests/controller.test.ts`
Expected: PASS (4 tests). 타이밍 flake 발생 시 `waitFor` timeout을 늘리기 전에 loopGeneration 가드 누락을 먼저 의심한다.

- [ ] **Step 5: Commit**

```bash
git add packages/hmr-plugin/src/controller.ts packages/hmr-plugin/tests/controller.test.ts
git commit -m "feat(hmr-plugin): HMR 컨트롤러 상태 머신 (연결/적용/재연결/안전정지)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: risuApi.ts 어댑터 + ui/badge.ts + ui/wizard.ts

UI 모듈은 샌드박스 iframe 특성상 자동 테스트 대상에서 제외한다 (로직은 전부 Task 2-6의 순수 모듈에 있음). 수동 검증은 Task 8.

**Files:**
- Create: `packages/hmr-plugin/src/risuApi.ts`, `packages/hmr-plugin/src/ui/badge.ts`, `packages/hmr-plugin/src/ui/wizard.ts`

**Interfaces:**
- Consumes: 전역 `risuai` (vendored d.ts), Task 6 `ControllerDeps`/`HmrController`
- Produces:
  - `createRisuControllerDeps(ui: { onState(state: HmrPublicState): void }): ControllerDeps`
  - `createBadge(): Promise<{ update(state: HmrPublicState): void; destroy(): void } | null>` (mainDom 권한 거부 시 null)
  - `mountWizard(controller: HmrController, host: HTMLElement): { render(state: HmrPublicState): void }`

- [ ] **Step 1: risuApi.ts 구현**

```ts
// packages/hmr-plugin/src/risuApi.ts
/**
 * risuai.* 경계 어댑터. 이 파일 밖에서는 전역 risuai를 참조하지 않는다.
 * 모든 호출은 async RPC이며, nativeFetch는 method 기본값이 POST라 GET을 명시한다.
 */
import type { ControllerDeps, HmrPublicState } from './controller';
import { createMappingStore } from './storage';

declare const risuai: {
  nativeFetch(url: string, options: Record<string, unknown>): Promise<Response>;
  getDatabase(includeOnly: string[]): Promise<Record<string, unknown> | null>;
  setDatabase(db: Record<string, unknown>): Promise<void>;
  setDatabaseLite(db: Record<string, unknown>): Promise<void>;
  getCharacterFromIndex(index: number): Promise<unknown>;
  setCharacterToIndex(index: number, character: unknown): Promise<void>;
  readImage(path: string): Promise<unknown>;
  saveAsset(data: Uint8Array): Promise<string>;
  getRuntimeInfo(): Promise<{ apiVersion: string; platform: 'web' | 'tauri' | 'node'; saveMethod: string }>;
  registerButton(arg: Record<string, unknown>, callback: () => void | Promise<void>): Promise<{ id: string }>;
  showContainer(type?: 'fullscreen'): Promise<void>;
  hideContainer(): Promise<void>;
  getRootDocument(): Promise<unknown>;
  onUnload(callback: () => void): Promise<void>;
  alertError?(message: string): Promise<void>;
  _getPluginStorage(key: string): Promise<unknown>;
  _setPluginStorage(key: string, value: unknown): Promise<void>;
  _removePluginStorage(key: string): Promise<void>;
};

const FETCH_OPTIONS = {
  method: 'GET',
  networkRoute: 'local_network',
  requestTimeoutMs: 40_000,
} as const;

async function fetchOk(url: string): Promise<Response> {
  const response = await risuai.nativeFetch(url, { ...FETCH_OPTIONS });
  if (!response.ok) throw new Error(`HMR 서버 응답 ${response.status}`);
  return response;
}

export function createRisuControllerDeps(ui: { onState(state: HmrPublicState): void }): ControllerDeps {
  return {
    getPlatform: async () => (await risuai.getRuntimeInfo()).platform,
    fetchJson: async (url) => (await fetchOk(url)).json(),
    fetchBinary: async (url) => new Uint8Array(await (await fetchOk(url)).arrayBuffer()),
    getCharacters: async () => {
      const db = await risuai.getDatabase(['characters']);
      return Array.isArray(db?.characters) ? (db.characters as unknown[]) : [];
    },
    setCharacterToIndex: (index, character) => risuai.setCharacterToIndex(index, character),
    getModules: async () => {
      const db = await risuai.getDatabase(['modules']);
      return Array.isArray(db?.modules) ? (db.modules as unknown[]) : [];
    },
    setModulesLite: (modules) => risuai.setDatabaseLite({ modules }),
    persistDatabase: async () => {
      // idle 확정 저장: 현재 스냅샷을 그대로 write-back해 full save를 트리거
      const db = await risuai.getDatabase(['characters', 'modules']);
      if (db) await risuai.setDatabase(db);
    },
    probeImage: async (fileName) => {
      try {
        const bytes = await risuai.readImage(fileName);
        return bytes !== null && bytes !== undefined;
      } catch {
        return false;
      }
    },
    saveAsset: (bytes) => risuai.saveAsset(bytes),
    store: createMappingStore({
      getItem: (key) => risuai._getPluginStorage(key),
      setItem: (key, value) => risuai._setPluginStorage(key, value),
      removeItem: (key) => risuai._removePluginStorage(key),
    }),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onState: ui.onState,
    alertError: async (message) => {
      if (typeof risuai.alertError === 'function') await risuai.alertError(message);
      else console.error(message);
    },
  };
}

export const risuUi = {
  registerButton: (arg: Record<string, unknown>, callback: () => void | Promise<void>) =>
    risuai.registerButton(arg, callback),
  showContainer: () => risuai.showContainer('fullscreen'),
  hideContainer: () => risuai.hideContainer(),
  getRootDocument: () => risuai.getRootDocument(),
  onUnload: (callback: () => void) => risuai.onUnload(callback),
  readImageBytes: async (path: string): Promise<Uint8Array | null> => {
    try {
      const bytes = await risuai.readImage(path);
      return bytes ? new Uint8Array(bytes as ArrayBufferLike & ArrayLike<number>) : null;
    } catch {
      return null;
    }
  },
};
```

주의: pluginStorage 접근자 이름은 vendored `risuai.d.ts`의 `pluginStorage` 별칭(문서화된 `risuai.pluginStorage.getItem` 형태)이 있으면 그것을 우선 사용한다 — `_getPluginStorage` 계열은 내부 별칭(`v3.svelte.ts:1192-1198`)이므로 d.ts에 `pluginStorage`가 노출돼 있으면 `risuai.pluginStorage.getItem(key)` 형태로 교체.

- [ ] **Step 2: ui/badge.ts 구현** (mainDom 전역 배지 — 표시 전용)

```ts
// packages/hmr-plugin/src/ui/badge.ts
import type { HmrPublicState } from '../controller';
import { risuUi } from '../risuApi';

interface SafeElementLike {
  setTextContent(value: string): void;
  setStyle(property: string, value: string): void;
  appendChild(child: SafeElementLike): void;
  remove(): void;
}

interface SafeDocumentLike extends SafeElementLike {
  createElement(tagName: string): SafeElementLike;
}

const TONE_BACKGROUND: Record<'ok' | 'warn' | 'error', string> = {
  ok: 'rgba(16, 130, 90, 0.92)',
  warn: 'rgba(160, 120, 20, 0.92)',
  error: 'rgba(160, 40, 40, 0.92)',
};

function formatBadgeText(state: HmrPublicState): { text: string; tone: 'ok' | 'warn' | 'error' } {
  if (state.phase === 'active') {
    return { text: `⚡ HMR: ${state.targetLabel ?? ''} · ${state.updateCount}회`, tone: 'ok' };
  }
  if (state.phase === 'reconnecting') {
    return { text: `⏳ HMR: ${state.targetLabel ?? ''} · 재연결 중…`, tone: 'warn' };
  }
  return { text: `⚠ HMR: ${state.lastError ?? '확인 필요'}`, tone: 'error' };
}

/**
 * createBadge 함수.
 * getRootDocument(mainDom 권한)로 host DOM 우하단에 상주 배지를 붙인다.
 * 권한 거부(null 반환) 시 null — 배지 없이도 기능 저하 없음 (크리티컬은 alertError가 커버).
 */
export async function createBadge(): Promise<{ update(state: HmrPublicState): void; destroy(): void } | null> {
  const rootDocument = (await risuUi.getRootDocument()) as SafeDocumentLike | null;
  if (!rootDocument) return null;
  const badge = rootDocument.createElement('div');
  badge.setStyle('position', 'fixed');
  badge.setStyle('right', '12px');
  badge.setStyle('bottom', '12px');
  badge.setStyle('zIndex', '999');
  badge.setStyle('padding', '4px 10px');
  badge.setStyle('borderRadius', '999px');
  badge.setStyle('fontSize', '12px');
  badge.setStyle('color', '#fff');
  badge.setStyle('pointerEvents', 'none');
  badge.setStyle('display', 'none');
  rootDocument.appendChild(badge);
  return {
    update(state: HmrPublicState) {
      if (state.phase === 'idle' || state.phase === 'selecting' || state.phase === 'connecting') {
        badge.setStyle('display', 'none');
        return;
      }
      const { text, tone } = formatBadgeText(state);
      badge.setStyle('display', 'block');
      badge.setStyle('background', TONE_BACKGROUND[tone]);
      badge.setTextContent(text);
    },
    destroy() {
      badge.remove();
    },
  };
}
```

- [ ] **Step 3: ui/wizard.ts 구현** (iframe 내 4화면 — 스펙의 위저드 ASCII 목업 대응)

```ts
// packages/hmr-plugin/src/ui/wizard.ts
/**
 * fullscreen iframe 안에 렌더되는 연결 위저드.
 * 화면: 1 연결(문자열 입력/재연결) → 2 대상 선택(전체 목록+썸네일) → 3 확인 → 4 대시보드.
 * DOM API는 iframe 내부 표준 DOM (CSP: img-src * data: blob: 허용 — factory.ts:296).
 */
import type { HmrController, HmrPublicState } from '../controller';
import { risuUi } from '../risuApi';

interface WizardHandle {
  render(state: HmrPublicState): void;
  showRecent(label: string | null): void;
}

export function mountWizard(controller: HmrController, host: HTMLElement): WizardHandle {
  host.innerHTML = '';
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;inset:0;background:rgba(18,18,22,0.96);color:#eee;font:13px/1.5 sans-serif;' +
    'display:flex;align-items:center;justify-content:center;';
  const panel = document.createElement('div');
  panel.style.cssText =
    'width:min(560px,92vw);max-height:86vh;overflow:auto;background:#1e1e26;border:1px solid #444;' +
    'border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:12px;';
  root.appendChild(panel);
  host.appendChild(root);

  const objectUrls: string[] = [];
  let recentLabel: string | null = null;
  let selection: { chaId?: string; moduleId?: string; label: string } | null = null;
  let badgeEnabled = true;

  function clearObjectUrls(): void {
    for (const url of objectUrls.splice(0)) URL.revokeObjectURL(url);
  }

  function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.style.cssText = `padding:6px 14px;border-radius:6px;border:1px solid #555;cursor:pointer;background:${
      primary ? '#3b6ef5' : '#2a2a33'
    };color:#fff;`;
    el.addEventListener('click', onClick);
    return el;
  }

  function header(text: string): HTMLElement {
    const el = document.createElement('h2');
    el.textContent = text;
    el.style.cssText = 'margin:0;font-size:15px;';
    return el;
  }

  function note(text: string): HTMLElement {
    const el = document.createElement('p');
    el.textContent = text;
    el.style.cssText = 'margin:0;color:#9aa;';
    return el;
  }

  function closeButtonRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    row.appendChild(button('닫기', () => void risuUi.hideContainer()));
    return row;
  }

  function renderError(error: unknown): void {
    const el = document.createElement('p');
    el.textContent = error instanceof Error ? error.message : String(error);
    el.style.cssText = 'margin:0;color:#f77;';
    panel.appendChild(el);
  }

  function renderConnect(): void {
    clearObjectUrls();
    panel.innerHTML = '';
    panel.appendChild(header('Workbench HMR — 연결'));
    panel.appendChild(note('워크벤치 상태 스트립의 [Copy connection string]으로 복사한 문자열을 붙여넣으세요.'));
    const input = document.createElement('input');
    input.placeholder = 'risu-hmr://127.0.0.1:41520#k=…';
    input.style.cssText = 'padding:8px;border-radius:6px;border:1px solid #555;background:#14141a;color:#eee;';
    panel.appendChild(input);
    panel.appendChild(
      button('연결', () => {
        void controller
          .connect(input.value)
          .then((health) => renderSelect(health.project.kind, health.project.name))
          .catch((error) => renderError(error));
      }, true),
    );
    if (recentLabel) {
      panel.appendChild(note(`최근: ${recentLabel}`));
      panel.appendChild(
        button('재연결', () => {
          void controller.tryAutoReconnect().then((ok) => {
            if (ok) renderDashboard(controller.getState());
            else renderError(new Error('자동 재연결 실패 — 연결 문자열을 다시 붙여넣으세요.'));
          });
        }),
      );
    }
    panel.appendChild(closeButtonRow());
  }

  async function renderSelect(kind: 'character' | 'module', projectName: string): Promise<void> {
    clearObjectUrls();
    panel.innerHTML = '';
    panel.appendChild(header(`수신할 ${kind === 'character' ? '캐릭터' : '모듈'} 선택`));
    panel.appendChild(note(`워크벤치: "${projectName}" (${kind}) — RisuAI가 DB 권한을 물으면 허용해주세요.`));

    const filter = document.createElement('input');
    filter.placeholder = '필터…';
    filter.style.cssText = 'padding:6px;border-radius:6px;border:1px solid #555;background:#14141a;color:#eee;';
    panel.appendChild(filter);

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:46vh;overflow:auto;';
    panel.appendChild(list);

    const targets =
      kind === 'character' ? await controller.listCharacterTargets() : await controller.listModuleTargets();

    if (targets.length === 0) {
      panel.appendChild(
        note('일치하는 대상이 없어요. 처음이라면: ① 워크벤치에서 [Pack] ② RisuAI로 import ③ 아래 새로고침'),
      );
      panel.appendChild(button('목록 새로고침 ⟳', () => void renderSelect(kind, projectName)));
    }

    const lazyLoader = new IntersectionObserver((observed) => {
      for (const intersection of observed) {
        if (!intersection.isIntersecting) continue;
        const img = intersection.target as HTMLImageElement;
        const assetPath = img.dataset.assetPath;
        lazyLoader.unobserve(img);
        if (!assetPath) continue;
        if (/^https?:/.test(assetPath)) {
          img.src = assetPath;
          continue;
        }
        void risuUi.readImageBytes(assetPath).then((bytes) => {
          if (!bytes) return;
          const url = URL.createObjectURL(new Blob([bytes]));
          objectUrls.push(url);
          img.src = url;
        });
      }
    });

    const renderRows = (query: string) => {
      list.innerHTML = '';
      for (const target of targets) {
        const label = 'name' in target ? target.name : '';
        if (query && !label.toLowerCase().includes(query.toLowerCase())) continue;
        const row = document.createElement('button');
        row.type = 'button';
        row.style.cssText =
          'display:flex;align-items:center;gap:10px;padding:6px;border:1px solid #333;border-radius:6px;' +
          'background:#22222b;color:#eee;cursor:pointer;text-align:left;';
        const img = document.createElement('img');
        img.style.cssText = 'width:36px;height:36px;border-radius:6px;object-fit:cover;background:#333;flex:none;';
        img.alt = '';
        if (kind === 'character' && 'image' in target && target.image) {
          img.dataset.assetPath = target.image;
          lazyLoader.observe(img);
        }
        row.appendChild(img);
        const text = document.createElement('span');
        text.textContent = label;
        row.appendChild(text);
        row.addEventListener('click', () => {
          selection =
            kind === 'character'
              ? { chaId: (target as { chaId: string }).chaId, label }
              : { moduleId: (target as { id: string }).id, label };
          renderConfirm(projectName, kind);
        });
        list.appendChild(row);
      }
    };
    filter.addEventListener('input', () => renderRows(filter.value));
    renderRows('');
    panel.appendChild(closeButtonRow());
  }

  function renderConfirm(projectName: string, kind: 'character' | 'module'): void {
    if (!selection) return;
    panel.innerHTML = '';
    panel.appendChild(header('연결 확인'));
    panel.appendChild(note(`워크벤치: "${projectName}" (${kind})`));
    panel.appendChild(note(`RisuAI 대상: "${selection.label}"`));
    if (projectName !== selection.label) {
      const warn = note('⚠ 이름이 다릅니다 — 대상을 다시 확인하세요.');
      warn.style.color = '#fc6';
      panel.appendChild(warn);
    }
    panel.appendChild(note('RisuAI에서 한 정의 수정은 다음 저장 때 덮어써집니다. 채팅 기록은 안전합니다.'));
    const badgeRow = document.createElement('label');
    badgeRow.style.cssText = 'display:flex;gap:6px;align-items:center;';
    const badgeCheckbox = document.createElement('input');
    badgeCheckbox.type = 'checkbox';
    badgeCheckbox.checked = badgeEnabled;
    badgeCheckbox.addEventListener('change', () => void (badgeEnabled = badgeCheckbox.checked));
    badgeRow.appendChild(badgeCheckbox);
    badgeRow.appendChild(document.createTextNode('전역 상태 배지 (권장 — RisuAI가 화면 접근 권한을 물어요)'));
    panel.appendChild(badgeRow);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    actions.appendChild(button('뒤로', () => void renderSelect(kind, projectName)));
    actions.appendChild(
      button('수신 시작', () => {
        void controller
          .confirmAndStart({ ...selection!, badgeEnabled })
          .then(() => renderDashboard(controller.getState()))
          .catch((error) => renderError(error));
      }, true),
    );
    panel.appendChild(actions);
  }

  function renderDashboard(state: HmrPublicState): void {
    clearObjectUrls();
    panel.innerHTML = '';
    panel.appendChild(header('수신 상태'));
    const phaseLabel: Record<string, string> = {
      initialSync: '초기 동기화 중…',
      active: '● 수신 중',
      paused: '⏸ 일시정지',
      reconnecting: '⏳ 재연결 중…',
      stoppedError: `⚠ 정지: ${state.lastError ?? ''}`,
    };
    panel.appendChild(note(`${phaseLabel[state.phase] ?? state.phase} — ${state.targetLabel ?? ''}`));
    panel.appendChild(note(`버전 v${state.appliedVersion} · 갱신 ${state.updateCount}회`));
    if (state.syncProgress) {
      panel.appendChild(
        note(
          `${state.syncProgress.phase === 'probe' ? '기존 에셋 확인' : '누락 에셋 수신'} ${state.syncProgress.done}/${state.syncProgress.total}`,
        ),
      );
    }
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;';
    if (state.phase === 'paused') actions.appendChild(button('재개', () => controller.resume()));
    else actions.appendChild(button('일시정지', () => controller.pause()));
    actions.appendChild(
      button('연결 해제', () => {
        void controller.disconnect().then(() => renderConnect());
      }),
    );
    actions.appendChild(button('닫기', () => void risuUi.hideContainer()));
    panel.appendChild(actions);
  }

  renderConnect();

  return {
    render(state: HmrPublicState) {
      // 위저드가 대시보드/에러 상태를 표시 중일 때만 라이브 갱신
      if (['initialSync', 'active', 'paused', 'reconnecting', 'stoppedError'].includes(state.phase)) {
        renderDashboard(state);
      }
    },
    showRecent(label: string | null) {
      recentLabel = label;
    },
  };
}
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck --workspace risu-workbench-hmr-plugin`
Expected: 통과

- [ ] **Step 5: Commit**

```bash
git add packages/hmr-plugin/src/risuApi.ts packages/hmr-plugin/src/ui
git commit -m "feat(hmr-plugin): risuai 어댑터 + 전역 배지 + 연결 위저드 UI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: main.ts 배선 + 빌드 + 수동 E2E

**Files:**
- Modify: `packages/hmr-plugin/src/main.ts` (임시 내용 교체)

**Interfaces:**
- Consumes: Task 6 `HmrController`, Task 7 어댑터/UI 전부

- [ ] **Step 1: main.ts 구현**

```ts
// packages/hmr-plugin/src/main.ts
/**
 * Workbench HMR 수신 플러그인 엔트리.
 * hamburger 버튼 → fullscreen 위저드. 로드 시 저장된 매핑으로 자동 재연결 시도.
 */
import { HmrController, type HmrPublicState } from './controller';
import { createRisuControllerDeps, risuUi } from './risuApi';
import { createBadge } from './ui/badge';
import { mountWizard } from './ui/wizard';

let badge: Awaited<ReturnType<typeof createBadge>> = null;
let badgeRequested = false;
let wizard: ReturnType<typeof mountWizard> | undefined;

function handleState(state: HmrPublicState): void {
  // 배지는 첫 active 전환 시 lazy 생성 — mainDom 권한 프롬프트가
  // 확인 화면([수신 시작]) 직후에 뜨는 UX가 되고, 거부해도 기능 저하 없음.
  if (state.phase === 'active' && state.badgeEnabled && !badge && !badgeRequested) {
    badgeRequested = true;
    void createBadge().then((created) => {
      badge = created;
      badge?.update(controller.getState());
    });
  }
  badge?.update(state);
  wizard?.render(state);
}

const controller = new HmrController(createRisuControllerDeps({ onState: handleState }));

wizard = mountWizard(controller, document.body);

await risuUi.registerButton(
  { name: 'Workbench HMR', icon: '⚡', iconType: 'html', location: 'hamburger', id: 'risu-workbench-hmr-open' },
  async () => {
    await risuUi.showContainer();
  },
);

// 저장된 매핑이 있으면 무확인 자동 재연결 (동일 stableId 한정 — 컨트롤러가 검증).
// 성공 시 배지는 handleState의 active 전환 경로에서 lazy 생성된다.
await controller.tryAutoReconnect();

await risuUi.onUnload(() => {
  void controller.disconnect();
  badge?.destroy();
});
```

- [ ] **Step 2: 빌드 + 전체 테스트**

Run: `npm run build --workspace risu-workbench-hmr-plugin && npm run test --workspace risu-workbench-hmr-plugin`
Expected: 빌드 성공 + 전체 테스트 PASS

- [ ] **Step 3: 수동 E2E** (스펙 "테스트 전략"의 체크리스트)

준비: RisuAI 데스크톱(또는 risuai-pork `npm run dev`) 실행, Settings → Plugins → `<>` → "Import plugin with hot reload" → `packages/hmr-plugin/dist/risu-workbench-hmr.js` 선택. 워크벤치는 Extension Development Host에서 아티팩트 방송 시작.

1. **pack→import→연결→probe 전적중**: 워크벤치에서 Pack → RisuAI에 import → HMR 연결(같은 캐릭터 선택) → 대시보드의 "기존 에셋 확인 n/n ✓" 후 "누락 에셋 수신 0/0" 확인 (전송 0)
2. **저장→반영**: 워크벤치에서 desc 수정·저장 → 1초 내 RisuAI 캐릭터 설명 변경 + 배지 카운트 증가 확인. 채팅 기록 보존 확인
3. **서버 중단→백오프→복귀**: VS Code 창 닫기 → 배지 ⏳ 전환 → 재기동+같은 아티팩트 방송 → 자동 재개 확인
4. **방송 전환 안전 정지**: 워크벤치에서 다른 아티팩트로 방송 전환 → 플러그인이 alertError + ⚠ 정지 확인 (자동 추종 없음)
5. **영속성**: 갱신 몇 회 후 RisuAI 재시작 → 반영 내용 유지 확인 (idle persistDatabase 경로 검증). 유지 안 되면 `persistDatabase`를 적용 직후 호출로 앞당기는 조정 검토
6. **권한 거부 경로**: mainDom 권한 거부 → 배지 없이 정상 동작 + 크리티컬 시 alertError 확인
7. **권한 프롬프트 가림**: 화면 2 진입 시 db 권한 프롬프트가 fullscreen iframe(z-index 1000)에 가려지는지 확인 — 가려지면 `renderSelect` 진입 직전 `hideContainer()` → 목록 로드 완료 후 `showContainer()` 재호출 우회를 적용 (스펙 리스크 항목)

- [ ] **Step 4: Commit**

```bash
git add packages/hmr-plugin/src/main.ts
git commit -m "feat(hmr-plugin): 엔트리 배선 + 자동 재연결 + E2E 검증

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
