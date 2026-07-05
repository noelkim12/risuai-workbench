# Regex Preview `{{raw}}` Asset Resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render real character assets in the Regex Inspector preview by resolving `{{raw::name}}` / `{{path::name}}` CBS in the worker output into `data:` image URIs.

**Architecture:** After the regex worker produces output, the webview extracts asset names from `{{raw|path::…}}`, asks the extension host to resolve them against the owning character's `assets/asset-catalog.json` (character root = grandparent of the `.risuregex` doc), and the extension returns base64 `data:` URIs. Name matching mirrors RisuAI's runtime (lowercase-exact → trimmed-exact → Levenshtein ≤ 4). The substituted output feeds the existing sandboxed iframe, whose CSP already permits `data:` images.

**Tech Stack:** TypeScript, Svelte (webview), VS Code extension host, Vitest (core unit tests), pnpm monorepo (`packages/core`, `packages/vscode`, `packages/webview`).

## Global Constraints

- Pure string logic (matching/extraction/substitution) lives in `packages/core` and must be **browser-safe** (no Node, no DOM) — exported from `packages/core/src/cbs-browser.ts`.
- Node/filesystem resolution lives in `packages/core/src/node/` — exported from `packages/core/src/node/index.ts`.
- Fuzzy match threshold constant `ASSET_NAME_MAX_DIFFERENCE = 4` (mirrors RisuAI `DBState.db.assetMaxDifference` default).
- Resolve caps: **24 images** and **8 MiB (8 * 1024 * 1024 bytes)** total per response; exceeding either sets `truncated: true` and leaves remaining names unresolved (`src: null`).
- Supported tags v1: `raw` and its alias `path` only.
- Supported image mimes: `webp→image/webp`, `png→image/png`, `jpg|jpeg→image/jpeg`, `gif→image/gif`; any other ext → `src: null`.
- No change to the iframe CSP or `localResourceRoots`.
- Message-passing follows the existing `requestId`-correlated pattern; new inbound message must be registered in the extension guard system or `isMainEditorWebviewMessage` will reject it.
- Core changes must be built (`npm --prefix packages/core run build`) before the webview/extension can typecheck against new exports.

---

### Task 1: Core pure asset-resolver (matching / extraction / substitution)

**Files:**
- Create: `packages/core/src/simulator/regex/asset-resolver.ts`
- Modify: `packages/core/src/cbs-browser.ts` (add re-exports)
- Test: `packages/core/tests/regex-asset-resolver.test.ts`

**Interfaces:**
- Produces:
  - `ASSET_NAME_MAX_DIFFERENCE: number` (= 4)
  - `trimmer(value: string): string`
  - `getDistance(a: string, b: string): number`
  - `extractAssetCbsNames(output: string): string[]`
  - `resolveAssetName(name: string, candidates: readonly string[], maxDiff?: number): { matchedName: string } | null` (type `ResolvedAssetMatch`)
  - `substituteAssetCbs(output: string, resolved: Record<string, string | null>): string`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/regex-asset-resolver.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ASSET_NAME_MAX_DIFFERENCE,
  extractAssetCbsNames,
  getDistance,
  resolveAssetName,
  substituteAssetCbs,
  trimmer,
} from '../src/simulator/regex/asset-resolver';

describe('trimmer', () => {
  it('strips media extension and separators', () => {
    expect(trimmer('anelia_default.webp')).toBe('aneliadefault');
    expect(trimmer('anelia default')).toBe('aneliadefault');
    expect(trimmer('anelia-default')).toBe('aneliadefault');
  });
});

describe('getDistance', () => {
  it('computes Levenshtein distance', () => {
    expect(getDistance('abc', 'abc')).toBe(0);
    expect(getDistance('abc', 'abd')).toBe(1);
    expect(getDistance('', 'abc')).toBe(3);
  });
});

describe('extractAssetCbsNames', () => {
  it('returns unique raw/path names in order', () => {
    const html = '<img src="{{raw::a}}"><img src="{{path::b}}"><img src="{{raw::a}}">';
    expect(extractAssetCbsNames(html)).toEqual(['a', 'b']);
  });

  it('returns empty array when no asset CBS present', () => {
    expect(extractAssetCbsNames('plain text {{user}}')).toEqual([]);
  });
});

describe('resolveAssetName', () => {
  it('matches exact (case-insensitive)', () => {
    expect(resolveAssetName('Anelia_Default', ['anelia_default'])).toEqual({ matchedName: 'anelia_default' });
  });

  it('matches underscore vs space via trimmed-exact', () => {
    expect(resolveAssetName('anelia_default', ['anelia default'])).toEqual({ matchedName: 'anelia default' });
  });

  it('matches within fuzzy threshold', () => {
    expect(resolveAssetName('anelia_defaultt', ['anelia_default'])).toEqual({ matchedName: 'anelia_default' });
  });

  it('returns null beyond fuzzy threshold', () => {
    expect(resolveAssetName('completely_different_xyz', ['anelia_default'])).toBeNull();
  });

  it('returns null for empty candidates', () => {
    expect(resolveAssetName('x', [])).toBeNull();
  });
});

describe('substituteAssetCbs', () => {
  it('replaces resolved names with their src', () => {
    expect(substituteAssetCbs('<img src="{{raw::a}}">', { a: 'data:image/png;base64,AAA' }))
      .toBe('<img src="data:image/png;base64,AAA">');
  });

  it('replaces confirmed miss (null) with empty string', () => {
    expect(substituteAssetCbs('<img src="{{raw::a}}">', { a: null })).toBe('<img src="">');
  });

  it('leaves pending names (absent from map) literal', () => {
    expect(substituteAssetCbs('<img src="{{raw::a}}">', {})).toBe('<img src="{{raw::a}}">');
  });
});

describe('constants', () => {
  it('mirrors RisuAI assetMaxDifference default', () => {
    expect(ASSET_NAME_MAX_DIFFERENCE).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/regex-asset-resolver.test.ts`
Expected: FAIL — cannot resolve module `../src/simulator/regex/asset-resolver`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/simulator/regex/asset-resolver.ts`:

```ts
/**
 * {{raw}}/{{path}} 에셋 CBS 이름 추출·매칭·치환 (순수, 브라우저 안전).
 * RisuAI parser.svelte.ts의 trimmer/getDistance/getClosestMatch 의미를 미러링한다.
 * @file packages/core/src/simulator/regex/asset-resolver.ts
 */

/** RisuAI DBState.db.assetMaxDifference 기본값. */
export const ASSET_NAME_MAX_DIFFERENCE = 4;

/** raw/path 태그 소스. 함수마다 새 RegExp를 만들어 lastIndex 공유 버그를 피한다. */
const ASSET_TAG_SOURCE = '\\{\\{(?:raw|path)::(.+?)\\}\\}';

function assetTagPattern(): RegExp {
  return new RegExp(ASSET_TAG_SOURCE, 'gms');
}

const MEDIA_EXTENSIONS = [
  'webp', 'png', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'avi', 'm4p', 'm4v', 'mp3', 'wav', 'ogg',
];

/** 확장자 제거 후 구분자(_ 공백 - .) 제거. RisuAI trimmer 이식. */
export function trimmer(value: string): string {
  let out = value;
  for (const ext of MEDIA_EXTENSIONS) {
    if (out.endsWith(`.${ext}`)) {
      out = out.substring(0, out.length - ext.length - 1);
      break;
    }
  }
  return out.trim().replace(/[_ \-.]/g, '');
}

/** Levenshtein 거리. RisuAI getDistance 이식(1D Int16Array). */
export function getDistance(a: string, b: string): number {
  const h = a.length + 1;
  const w = b.length + 1;
  const d = new Int16Array(h * w);
  for (let i = 0; i < h; i++) d[i * w] = i;
  for (let j = 0; j < w; j++) d[j] = j;
  for (let i = 1; i < h; i++) {
    for (let j = 1; j < w; j++) {
      d[i * w + j] = Math.min(
        d[(i - 1) * w + (j - 1)] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1),
        d[(i - 1) * w + j] + 1,
        d[i * w + (j - 1)] + 1,
      );
    }
  }
  return d[h * w - 1];
}

/** worker 출력에서 {{raw|path::name}}의 name들을 등장 순으로 중복 제거해 반환. */
export function extractAssetCbsNames(output: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of output.matchAll(assetTagPattern())) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export interface ResolvedAssetMatch {
  readonly matchedName: string;
}

/** 소문자 정확일치 → trim 정확일치 → 최근접(trim Levenshtein) ≤ maxDiff. */
export function resolveAssetName(
  name: string,
  candidates: readonly string[],
  maxDiff: number = ASSET_NAME_MAX_DIFFERENCE,
): ResolvedAssetMatch | null {
  const lower = name.toLocaleLowerCase();

  for (const candidate of candidates) {
    if (candidate.toLocaleLowerCase() === lower) return { matchedName: candidate };
  }

  const trimmedTarget = trimmer(lower);
  for (const candidate of candidates) {
    if (trimmer(candidate.toLocaleLowerCase()) === trimmedTarget) return { matchedName: candidate };
  }

  let closest: string | null = null;
  let closestDist = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dist = getDistance(trimmedTarget, trimmer(candidate.toLocaleLowerCase()));
    if (dist < closestDist) {
      closestDist = dist;
      closest = candidate;
    }
  }
  if (closest === null || closestDist > maxDiff) return null;
  return { matchedName: closest };
}

/**
 * 출력 내 {{raw|path::name}}를 치환한다.
 * - name이 맵에 있고 값이 string → 그 src
 * - name이 맵에 있고 값이 null(확정 miss) → 빈 문자열
 * - name이 맵에 없음(아직 대기중) → 원문 유지
 */
export function substituteAssetCbs(output: string, resolved: Record<string, string | null>): string {
  return output.replace(assetTagPattern(), (whole, name: string) => {
    if (!(name in resolved)) return whole;
    return resolved[name] ?? '';
  });
}
```

- [ ] **Step 4: Add browser-safe re-exports**

In `packages/core/src/cbs-browser.ts`, append after the existing export blocks:

```ts
export {
  ASSET_NAME_MAX_DIFFERENCE,
  trimmer,
  getDistance,
  extractAssetCbsNames,
  resolveAssetName,
  substituteAssetCbs,
  type ResolvedAssetMatch,
} from './simulator/regex/asset-resolver';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && npx vitest run tests/regex-asset-resolver.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/simulator/regex/asset-resolver.ts packages/core/src/cbs-browser.ts packages/core/tests/regex-asset-resolver.test.ts
git commit -m "feat(core): pure {{raw}} asset name matcher + substituter"
```

---

### Task 2: Core Node resolver (candidate map + data: URI)

**Files:**
- Create: `packages/core/src/node/regex-asset-resolver.ts`
- Modify: `packages/core/src/node/index.ts` (add re-exports)
- Test: `packages/core/tests/regex-asset-resolver-node.test.ts`

**Interfaces:**
- Consumes (from Task 1): `resolveAssetName` from `../simulator/regex/asset-resolver`.
- Consumes (existing core): `loadAssetCatalogFromAssetsDir`, `collectCharacterAssetEntries` from `./asset-manifest`; `renderAssetName`, `stripExtensionResidue` from `../domain/asset/naming`.
- Produces:
  - `resolveRegexAssets(options: ResolveRegexAssetsOptions): ResolveRegexAssetsResult`
  - `ResolveRegexAssetsOptions { rootDir: string; names: readonly string[]; maxImages?: number; maxTotalBytes?: number }`
  - `ResolvedRegexAsset { name: string; src: string | null; matchedName?: string }`
  - `ResolveRegexAssetsResult { resolved: ResolvedRegexAsset[]; truncated: boolean }`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/regex-asset-resolver-node.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG_1X1_TRANSPARENT } from '../src/node/png';
import { resolveRegexAssets } from '../src/node/regex-asset-resolver';

let rootDir: string;

beforeAll(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-asset-'));
  const additional = path.join(rootDir, 'assets', 'additional');
  fs.mkdirSync(additional, { recursive: true });
  fs.writeFileSync(path.join(additional, 'anelia_default.png'), PNG_1X1_TRANSPARENT);
  const catalog = {
    version: 1,
    schema: {
      slots: [
        { id: 's1', label: 'character' },
        { id: 's2', label: 'emotion' },
      ],
      joinTemplate: '{s1}_{s2}',
    },
    vocab: { s1: ['anelia'], s2: ['default'] },
    expected: {},
    assignments: { 'additional/anelia_default.png': { s1: 'anelia', s2: 'default' } },
  };
  fs.writeFileSync(path.join(rootDir, 'assets', 'asset-catalog.json'), JSON.stringify(catalog));
});

afterAll(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

describe('resolveRegexAssets', () => {
  it('resolves a catalog join-name to a png data URI', () => {
    const result = resolveRegexAssets({ rootDir, names: ['anelia_default'] });
    expect(result.truncated).toBe(false);
    expect(result.resolved[0].matchedName).toBe('anelia_default');
    expect(result.resolved[0].src?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('returns null src for an unknown name', () => {
    const result = resolveRegexAssets({ rootDir, names: ['zzz_nonexistent_zzz'] });
    expect(result.resolved[0].src).toBeNull();
  });

  it('sets truncated when the image cap is exceeded', () => {
    const result = resolveRegexAssets({ rootDir, names: ['anelia_default'], maxImages: 0 });
    expect(result.truncated).toBe(true);
    expect(result.resolved[0].src).toBeNull();
  });

  it('returns null src without throwing when assets dir is missing', () => {
    const result = resolveRegexAssets({ rootDir: path.join(rootDir, 'nope'), names: ['anelia_default'] });
    expect(result.resolved[0].src).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/regex-asset-resolver-node.test.ts`
Expected: FAIL — cannot resolve module `../src/node/regex-asset-resolver`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/node/regex-asset-resolver.ts`:

```ts
/**
 * 캐릭터 assets/에서 {{raw}} 에셋 이름을 파일 data: URI로 해석 (Node 전용).
 * asset-catalog.json(진실원천)의 generatedName + 파일 stem을 후보로 만들고
 * simulator/regex/asset-resolver의 매칭을 사용한다.
 * @file packages/core/src/node/regex-asset-resolver.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderAssetName, stripExtensionResidue } from '../domain/asset/naming';
import { resolveAssetName } from '../simulator/regex/asset-resolver';
import { collectCharacterAssetEntries, loadAssetCatalogFromAssetsDir } from './asset-manifest';

export interface ResolveRegexAssetsOptions {
  readonly rootDir: string;
  readonly names: readonly string[];
  readonly maxImages?: number;
  readonly maxTotalBytes?: number;
}

export interface ResolvedRegexAsset {
  readonly name: string;
  readonly src: string | null;
  readonly matchedName?: string;
}

export interface ResolveRegexAssetsResult {
  readonly resolved: ResolvedRegexAsset[];
  readonly truncated: boolean;
}

const DEFAULT_MAX_IMAGES = 24;
const DEFAULT_MAX_TOTAL_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
};

export function resolveRegexAssets(options: ResolveRegexAssetsOptions): ResolveRegexAssetsResult {
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const assetsDir = path.join(options.rootDir, 'assets');

  const nameToPath = buildCandidateMap(assetsDir);
  const candidateNames = [...nameToPath.keys()];

  const resolved: ResolvedRegexAsset[] = [];
  let truncated = false;
  let imageCount = 0;
  let totalBytes = 0;

  for (const name of options.names) {
    const match = candidateNames.length === 0 ? null : resolveAssetName(name, candidateNames);
    if (match === null) {
      resolved.push({ name, src: null });
      continue;
    }

    const relPath = nameToPath.get(match.matchedName);
    const ext = relPath === undefined ? '' : (relPath.split('.').pop()?.toLowerCase() ?? '');
    const mime = MIME_BY_EXT[ext];
    if (relPath === undefined || mime === undefined) {
      resolved.push({ name, src: null, matchedName: match.matchedName });
      continue;
    }

    if (imageCount >= maxImages) {
      truncated = true;
      resolved.push({ name, src: null, matchedName: match.matchedName });
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(path.join(assetsDir, ...relPath.split('/')));
    } catch {
      resolved.push({ name, src: null, matchedName: match.matchedName });
      continue;
    }

    if (totalBytes + bytes.byteLength > maxTotalBytes) {
      truncated = true;
      resolved.push({ name, src: null, matchedName: match.matchedName });
      continue;
    }

    imageCount += 1;
    totalBytes += bytes.byteLength;
    resolved.push({
      name,
      src: `data:${mime};base64,${bytes.toString('base64')}`,
      matchedName: match.matchedName,
    });
  }

  return { resolved, truncated };
}

function buildCandidateMap(assetsDir: string): Map<string, string> {
  const nameToPath = new Map<string, string>();
  if (!fs.existsSync(assetsDir)) return nameToPath;

  let catalog: ReturnType<typeof loadAssetCatalogFromAssetsDir>;
  try {
    catalog = loadAssetCatalogFromAssetsDir(assetsDir);
  } catch {
    catalog = null;
  }

  let entries;
  try {
    entries = collectCharacterAssetEntries(assetsDir, catalog);
  } catch {
    return nameToPath;
  }

  for (const entry of entries) {
    const relPath = entry.extracted_path;

    if (catalog !== null) {
      const assignment = catalog.assignments[relPath];
      if (assignment !== undefined) {
        const generatedName = renderAssetName(catalog.schema, assignment);
        if (generatedName !== null && !nameToPath.has(generatedName)) {
          nameToPath.set(generatedName, relPath);
        }
      }
    }

    const fileStem = stripExtensionResidue(path.parse(relPath).name);
    if (fileStem.length > 0 && !nameToPath.has(fileStem)) {
      nameToPath.set(fileStem, relPath);
    }
  }

  return nameToPath;
}
```

- [ ] **Step 4: Add Node re-exports**

In `packages/core/src/node/index.ts`, add an import block near the other asset imports (after the `./asset-manifest` import block) and a matching export. Add this import block:

```ts
import {
  resolveRegexAssets,
  type ResolveRegexAssetsOptions,
  type ResolveRegexAssetsResult,
  type ResolvedRegexAsset,
} from './regex-asset-resolver';
```

Then add these names to the existing `export { ... }` block (the one that already lists `collectCharacterAssetEntries`, `loadAssetCatalogFromAssetsDir`):

```ts
  resolveRegexAssets,
  type ResolveRegexAssetsOptions,
  type ResolveRegexAssetsResult,
  type ResolvedRegexAsset,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && npx vitest run tests/regex-asset-resolver-node.test.ts`
Expected: PASS (4 cases green).

- [ ] **Step 6: Build core so downstream packages see new exports**

Run: `npm --prefix packages/core run build`
Expected: builds without TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/node/regex-asset-resolver.ts packages/core/src/node/index.ts packages/core/tests/regex-asset-resolver-node.test.ts
git commit -m "feat(core): node resolver mapping {{raw}} names to data URIs"
```

---

### Task 3: Message contracts (payloads, envelopes, factory, guards)

**Files:**
- Modify: `packages/webview/src/lib/types/mainEditor.ts` (payload interfaces)
- Modify: `packages/webview/src/lib/types.ts` (envelope types + unions + payload imports)
- Modify: `packages/webview/src/lib/vscode/mainEditorMessages.ts` (request factory)
- Modify: `packages/vscode/src/editors/mainEditor/mainEditorTypes.ts` (mirror payloads + inbound union + guard registry + validator)

**Interfaces:**
- Produces (webview `types/mainEditor.ts` and vscode `mainEditorTypes.ts`, identical shapes):
  - `MainEditorResolveRegexAssetsRequestPayload { requestId: string; documentUri: string; names: string[] }`
  - `MainEditorResolvedAssetEntry { name: string; src: string | null; matchedName?: string }`
  - `MainEditorResolveRegexAssetsResultPayload { requestId: string; documentUri: string; resolved: MainEditorResolvedAssetEntry[]; truncated: boolean }`
- Produces (webview `types.ts`): `MainEditorResolveRegexAssetsRequestMessage`, `MainEditorResolveRegexAssetsResultMessage`
- Produces (webview `mainEditorMessages.ts`): `createMainEditorResolveRegexAssetsRequestMessage(payload): MainEditorResolveRegexAssetsRequestMessage`

- [ ] **Step 1: Add payload interfaces to the webview types**

In `packages/webview/src/lib/types/mainEditor.ts`, after the `MainEditorFormatPreviewResultPayload` interface (ends around line 464), add:

```ts
export interface MainEditorResolveRegexAssetsRequestPayload {
  requestId: string;
  documentUri: string;
  names: string[];
}

export interface MainEditorResolvedAssetEntry {
  name: string;
  src: string | null;
  matchedName?: string;
}

export interface MainEditorResolveRegexAssetsResultPayload {
  requestId: string;
  documentUri: string;
  resolved: MainEditorResolvedAssetEntry[];
  truncated: boolean;
}
```

- [ ] **Step 2: Add envelope types + union members + imports (webview types.ts)**

In `packages/webview/src/lib/types.ts`:

(a) Add the two payload names to the existing type-import from `./types/mainEditor` (the block that already imports `MainEditorFormatPreviewResultPayload` near line 15):

```ts
  MainEditorResolveRegexAssetsRequestPayload,
  MainEditorResolveRegexAssetsResultPayload,
```

(b) After the `MainEditorFormatPreviewResultMessage` type (around line 612-615), add:

```ts
export type MainEditorResolveRegexAssetsRequestMessage = MessageEnvelope<
  'main-editor/resolveRegexAssetsRequest',
  MainEditorResolveRegexAssetsRequestPayload
>;

export type MainEditorResolveRegexAssetsResultMessage = MessageEnvelope<
  'main-editor/resolveRegexAssetsResult',
  MainEditorResolveRegexAssetsResultPayload
>;
```

(c) Add `| MainEditorResolveRegexAssetsRequestMessage` to the webview→extension union — the union that ends with `| MainEditorVariableCandidatesRequestMessage;` (contains `MainEditorFormatPreviewRequestMessage`, around line 664).

(d) Add `| MainEditorResolveRegexAssetsResultMessage` to the extension→webview union — the union `MainEditorExtensionMessage` that ends with `| MainEditorVariableCandidatesResultMessage;` (contains `MainEditorFormatPreviewResultMessage`, around line 686).

- [ ] **Step 3: Add the webview request factory**

In `packages/webview/src/lib/vscode/mainEditorMessages.ts`:

(a) Add to the existing type-import from `../types` (or wherever `MainEditorFormatPreviewRequestMessage` and payloads are imported): `MainEditorResolveRegexAssetsRequestMessage` and `MainEditorResolveRegexAssetsRequestPayload`.

(b) After `createMainEditorFormatPreviewRequestMessage` (around line 265-269), add:

```ts
/**
 * @returns resolveRegexAssetsRequest message envelope
 */
export function createMainEditorResolveRegexAssetsRequestMessage(
  payload: MainEditorResolveRegexAssetsRequestPayload,
): MainEditorResolveRegexAssetsRequestMessage {
  return createMainEditorMessage('main-editor/resolveRegexAssetsRequest', payload);
}
```

- [ ] **Step 4: Mirror payloads + register guard on the extension side**

In `packages/vscode/src/editors/mainEditor/mainEditorTypes.ts`:

(a) After `MainEditorFormatPreviewResultPayload` (interface at line 559), add the same three interfaces as Step 1:

```ts
export interface MainEditorResolveRegexAssetsRequestPayload {
  requestId: string;
  documentUri: string;
  names: string[];
}

export interface MainEditorResolvedAssetEntry {
  name: string;
  src: string | null;
  matchedName?: string;
}

export interface MainEditorResolveRegexAssetsResultPayload {
  requestId: string;
  documentUri: string;
  resolved: MainEditorResolvedAssetEntry[];
  truncated: boolean;
}
```

(b) Add an inbound union member to `MainEditorWebviewMessage` (starts line 622). Alongside the existing `{ type: 'main-editor/formatPreviewRequest'; payload: MainEditorFormatPreviewRequestPayload; }` member (lines 720-721), add:

```ts
  | {
      type: 'main-editor/resolveRegexAssetsRequest';
      payload: MainEditorResolveRegexAssetsRequestPayload;
    }
```

(c) Add the payload validator (place it next to `isMainEditorFormatPreviewRequestPayload`, around line 1163):

```ts
function isMainEditorResolveRegexAssetsRequestPayload(
  value: unknown,
): value is MainEditorResolveRegexAssetsRequestPayload {
  return (
    isPlainRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.documentUri === 'string' &&
    Array.isArray(value.names) &&
    value.names.every((entry) => typeof entry === 'string')
  );
}
```

(d) Register it in `MAIN_EDITOR_WEBVIEW_MESSAGE_GUARDS` (object starting line 787), mirroring the `'main-editor/formatPreviewRequest'` entry (lines 855-858):

```ts
  'main-editor/resolveRegexAssetsRequest': createMainEditorMessageGuard(
    'main-editor/resolveRegexAssetsRequest',
    isMainEditorResolveRegexAssetsRequestPayload,
  ),
```

- [ ] **Step 5: Typecheck both packages**

Run: `npm --prefix packages/vscode run build:extension`
Expected: TypeScript compiles. If it complains that `main-editor/resolveRegexAssetsResult` is not yet in the extension outbound union, that is expected — it is added in Task 4. To verify Task 3 in isolation instead, run `npx tsc --noEmit -p packages/webview/tsconfig.json` for the webview side and confirm no errors from the changed files.

> Note: Task 3 and Task 4 together form the compilable unit on the extension side. If building task-by-task, proceed to Task 4 before expecting a clean `packages/vscode` build.

- [ ] **Step 6: Commit**

```bash
git add packages/webview/src/lib/types/mainEditor.ts packages/webview/src/lib/types.ts packages/webview/src/lib/vscode/mainEditorMessages.ts packages/vscode/src/editors/mainEditor/mainEditorTypes.ts
git commit -m "feat(main-editor): message contracts for regex asset resolution"
```

---

### Task 4: Extension host resolve handler

**Files:**
- Modify: `packages/vscode/src/editors/mainEditor/MainEditorProvider.ts`

**Interfaces:**
- Consumes (Task 2): `resolveRegexAssets` from `risu-workbench-core/node`.
- Consumes (Task 3): `MainEditorResolveRegexAssetsRequestPayload`, `MainEditorResolveRegexAssetsResultPayload` from `./mainEditorTypes`.
- Produces: extension→webview message `main-editor/resolveRegexAssetsResult`.

- [ ] **Step 1: Import the resolver and payload types**

In `packages/vscode/src/editors/mainEditor/MainEditorProvider.ts`:

(a) Add `resolveRegexAssets` to the import from `risu-workbench-core/node`. If no such import exists yet, add one near the top imports:

```ts
import { resolveRegexAssets } from 'risu-workbench-core/node';
```

(b) Add to the existing import from `./mainEditorTypes` (the block importing `type MainEditorFormatPreviewResultPayload`, around lines 23-54):

```ts
  type MainEditorResolveRegexAssetsRequestPayload,
  type MainEditorResolveRegexAssetsResultPayload,
```

- [ ] **Step 2: Add the outbound union member**

In the `MainEditorExtensionMessage` union (starts line 89), alongside the `{ type: 'main-editor/formatPreviewResult'; payload: MainEditorFormatPreviewResultPayload; }` member, add:

```ts
  | {
      type: 'main-editor/resolveRegexAssetsResult';
      payload: MainEditorResolveRegexAssetsResultPayload;
    }
```

- [ ] **Step 3: Handle the inbound request**

In `handleMessage(...)`, after the `main-editor/formatPreviewRequest` block (ends around line 482), add:

```ts
    if (message.type === 'main-editor/resolveRegexAssetsRequest') {
      this.postMessage(
        webviewPanel,
        createResolveRegexAssetsResultMessage(resolveRegexAssetsForDocument(document, message.payload)),
      );
      return;
    }
```

- [ ] **Step 4: Add the helper functions**

Near `createFormatPreviewResultMessage` (module-level function around line 987), add:

```ts
function resolveRegexAssetsForDocument(
  document: vscode.TextDocument,
  payload: MainEditorResolveRegexAssetsRequestPayload,
): MainEditorResolveRegexAssetsResultPayload {
  try {
    const rootDir = path.dirname(path.dirname(document.uri.fsPath));
    const { resolved, truncated } = resolveRegexAssets({ rootDir, names: payload.names });
    return { requestId: payload.requestId, documentUri: payload.documentUri, resolved, truncated };
  } catch {
    return {
      requestId: payload.requestId,
      documentUri: payload.documentUri,
      resolved: payload.names.map((name) => ({ name, src: null })),
      truncated: false,
    };
  }
}

function createResolveRegexAssetsResultMessage(
  payload: MainEditorResolveRegexAssetsResultPayload,
): MainEditorExtensionMessageOf<'main-editor/resolveRegexAssetsResult'> {
  return createMainEditorExtensionMessage('main-editor/resolveRegexAssetsResult', payload);
}
```

> `path` is already imported (`import path from 'node:path'`, line 7). `MainEditorExtensionMessageOf` and `createMainEditorExtensionMessage` are defined in this file (lines 243, 259).

- [ ] **Step 5: Build the extension**

Run: `npm --prefix packages/vscode run build:extension`
Expected: TypeScript compiles with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/vscode/src/editors/mainEditor/MainEditorProvider.ts
git commit -m "feat(main-editor): resolve {{raw}} regex assets on the extension host"
```

---

### Task 5: Webview MainEditor wiring (request + result state)

**Files:**
- Modify: `packages/webview/src/lib/components/editor/main/MainEditor.svelte`

**Interfaces:**
- Consumes (Task 3): `createMainEditorResolveRegexAssetsRequestMessage`; inbound `main-editor/resolveRegexAssetsResult`.
- Produces (to Task 6 via props): `resolvedRegexAssets: Record<string, string | null>`, `regexAssetsTruncated: boolean`, `requestRegexAssets: (names: string[]) => void`.

- [ ] **Step 1: Import the request factory**

In the import from `../../../vscode/mainEditorMessages` that includes `createMainEditorFormatPreviewRequestMessage` (line 56 area), add:

```ts
    createMainEditorResolveRegexAssetsRequestMessage,
```

- [ ] **Step 2: Add component state**

Near the `formatPreviewResult` / `formatPreviewRequestId` declarations (lines 112-113), add:

```ts
  let resolvedRegexAssets: Record<string, string | null> = {};
  let regexAssetsTruncated = false;
  let regexAssetResolveRequestId: string | undefined;
```

- [ ] **Step 3: Add the request function**

Near `scheduleFormatPreview` (around line 604), add:

```ts
  function requestRegexAssets(names: string[]): void {
    if (!initialized || names.length === 0) return;
    const requestId = createRequestId('regex-assets');
    regexAssetResolveRequestId = requestId;
    getTypedVsCodeApi()?.postMessage(
      createMainEditorResolveRegexAssetsRequestMessage({ requestId, documentUri, names }),
    );
  }
```

- [ ] **Step 4: Handle the result message**

In the message dispatch (the `if (message.type === ...)` chain), after the `main-editor/formatPreviewResult` block (ends around line 310), add:

```ts
    if (message.type === 'main-editor/resolveRegexAssetsResult') {
      if (
        message.payload.requestId === regexAssetResolveRequestId &&
        message.payload.documentUri === documentUri
      ) {
        const merged: Record<string, string | null> = { ...resolvedRegexAssets };
        for (const entry of message.payload.resolved) merged[entry.name] = entry.src;
        resolvedRegexAssets = merged;
        regexAssetsTruncated = message.payload.truncated;
      }
      return;
    }
```

- [ ] **Step 5: Reset asset state on document switch/change**

At the two sites where `formatPreviewResult = null;` is set (init handler ~line 204 and documentChanged handler ~line 235), add immediately after each:

```ts
      resolvedRegexAssets = {};
      regexAssetsTruncated = false;
      regexAssetResolveRequestId = undefined;
```

- [ ] **Step 6: Pass props to the panel**

Update the `<RegexPreviewPanel ... />` usage (around line 1500):

```svelte
              <RegexPreviewPanel
                preview={formatPreviewResult}
                pending={previewPending}
                sampleInput={regexSampleInput}
                resolvedAssets={resolvedRegexAssets}
                assetsTruncated={regexAssetsTruncated}
                onRequestAssets={requestRegexAssets}
              />
```

- [ ] **Step 7: Typecheck**

Run: `npx svelte-check --workspace packages/webview 2>/dev/null || npm --prefix packages/webview run build`
Expected: no type errors introduced by MainEditor.svelte. (RegexPreviewPanel will report unknown props until Task 6 — acceptable if building task-by-task; proceed to Task 6.)

- [ ] **Step 8: Commit**

```bash
git add packages/webview/src/lib/components/editor/main/MainEditor.svelte
git commit -m "feat(main-editor): wire regex asset resolve request/result in webview"
```

---

### Task 6: RegexPreviewPanel substitution + render

**Files:**
- Modify: `packages/webview/src/lib/components/editor/regex/RegexPreviewPanel.svelte`

**Interfaces:**
- Consumes (Task 1, browser barrel): `extractAssetCbsNames`, `substituteAssetCbs` from `risu-workbench-core/cbs-browser`.
- Consumes (Task 5, props): `resolvedAssets`, `assetsTruncated`, `onRequestAssets`.

- [ ] **Step 1: Import the pure helpers**

In the `<script lang="ts">` block, add:

```ts
  import { extractAssetCbsNames, substituteAssetCbs } from 'risu-workbench-core/cbs-browser';
```

- [ ] **Step 2: Add the new props**

After the existing `export let sampleInput: string;` (line 12), add:

```ts
  export let resolvedAssets: Record<string, string | null> = {};
  export let assetsTruncated = false;
  export let onRequestAssets: ((names: string[]) => void) | undefined = undefined;
```

- [ ] **Step 3: Extract names and request missing ones**

After the reactive block for `renderedOutputSrcdoc` (line 33), add:

```ts
  $: outputAssetNames =
    workerResult && (workerResult.status === 'ok' || workerResult.status === 'partial')
      ? extractAssetCbsNames(workerResult.output)
      : [];
  $: requestMissingAssets(outputAssetNames);

  function requestMissingAssets(names: string[]): void {
    if (!onRequestAssets || names.length === 0) return;
    const missing = names.filter((name) => !(name in resolvedAssets));
    if (missing.length > 0) onRequestAssets(missing);
  }
```

- [ ] **Step 4: Substitute resolved assets into the srcdoc**

Change the reactive assignment (line 33) to include `resolvedAssets`:

```ts
  $: renderedOutputSrcdoc = createRenderedOutputSrcdoc(workerResult, preview, resolvedAssets);
```

Update `createRenderedOutputSrcdoc` (lines 82-88) to:

```ts
  function createRenderedOutputSrcdoc(
    result: RegexWorkerResult | null,
    previewResult: MainEditorFormatPreviewResultPayload | null,
    resolved: Record<string, string | null>,
  ): string {
    if (!result || (result.status !== 'ok' && result.status !== 'partial')) return '';
    const substituted = substituteAssetCbs(result.output, resolved);
    return createSandboxedHtmlSrcdoc(`${previewResult?.htmlContext?.sourceHtml ?? ''}${substituted}`, HTML_PREVIEW_CSP);
  }
```

- [ ] **Step 5: Show a truncation note**

In the Output card, inside `.rpi__output-wrap`, immediately before the closing `</div>` (after the `{#if ...}` block that renders the iframe, around line 158), add:

```svelte
        {#if assetsTruncated}
          <p class="rpi__card-muted">Some assets were not rendered (preview asset limit reached).</p>
        {/if}
```

- [ ] **Step 6: Build the webview**

Run: `npm --prefix packages/webview run build`
Expected: builds with no type errors.

- [ ] **Step 7: Build the extension bundle (webview → extension copy)**

Run: `npm --prefix packages/vscode run build`
Expected: builds and copies the webview bundle.

- [ ] **Step 8: Manual verification**

1. Launch the extension: `npm --prefix packages/vscode run dev` (opens a VS Code dev host).
2. Open the playground character folder:
   `/home/noel/projects/workspace/risuai-workbench-workspace/playground/260507/target/character_조기퇴장_악녀에_빙의해버렸다`
3. Open `regex/90_asset_whitelist.risuregex` in the main editor.
4. Ensure the regex sample input contains a matching `<img src="anelia_default">` (or similar `character_emotion` from the catalog vocab).
5. Confirm the Regex Inspector → Output panel renders the emotion image (not a broken image / literal `{{raw::…}}`).
6. Confirm the Matches panel still lists matches and no new diagnostics errors appear.

Expected: the resolved image displays inside the iframe.

- [ ] **Step 9: Commit**

```bash
git add packages/webview/src/lib/components/editor/regex/RegexPreviewPanel.svelte
git commit -m "feat(regex-preview): render {{raw}} assets as images in the preview"
```

---

## Self-Review

**Spec coverage:**
- §5.1 core pure module → Task 1. ✅
- §5.2 extension resolver (candidate map via `scan`-equivalent, data URI, cap) → Task 2 (implemented via `collectCharacterAssetEntries` + `renderAssetName`, the same primitives `AssetManagerService.scan()` uses) + Task 4 (root resolution + handler). ✅
- §5.3 webview panel (extract, request, substitute, truncation note, stale guard) → Task 5 (state/guard/reset) + Task 6 (extract/substitute/note). ✅
- §5.4 message types (mirrored payloads, envelopes, factory, guards) → Task 3. ✅
- §6 constraints (cap 24/8 MiB, mime map, misses, staleness, no CSP change) → Task 2 (cap/mime/miss), Task 5 (staleness via requestId+documentUri guard and reset), Task 6 (data: into existing CSP). ✅
- §7 testing (core unit + node fixture + manual) → Task 1, Task 2, Task 6 Step 8. ✅

**Placeholder scan:** No TBD/TODO; every code step contains full code. ✅

**Type consistency:** `ResolvedRegexAsset` (core node) maps to `MainEditorResolvedAssetEntry` (message layer) — both `{ name, src, matchedName? }`; the handler in Task 4 spreads `resolveRegexAssets(...)` output (`resolved`, `truncated`) directly into `MainEditorResolveRegexAssetsResultPayload`, whose `resolved: MainEditorResolvedAssetEntry[]` is structurally identical to `ResolvedRegexAsset[]`. `resolveAssetName` signature and `{ matchedName }` return match across Tasks 1/2. Factory `createMainEditorResolveRegexAssetsRequestMessage` name is consistent across Tasks 3/5. Props `resolvedAssets` / `assetsTruncated` / `onRequestAssets` consistent across Tasks 5/6. ✅
