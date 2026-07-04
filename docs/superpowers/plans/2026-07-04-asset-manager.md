# Asset Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RisuAI 캐릭터/모듈 워크스페이스의 asset을 그리드로 미리보고, 슬롯($1/$2/$3) 기반 name 큐레이션·missing 탐색·파생 출력(프롬프트 블록/화이트리스트 정규식/missing 리포트)을 제공하는 Asset Manager를 구축한다.

**Architecture:** 큐레이션 데이터는 `assets/asset-catalog.json`(진실의 원천)에 저장하고 `assets/manifest.json`은 CLI merge 빌드 산출물로 유지한다. 로직은 `packages/core`(domain/asset, domain/analyze, node)에 두고 CLI와 VS Code extension이 공유한다. UI는 사이드바 아코디언의 진입 버튼 → WebviewPanel(viewName=`asset-manager`)로 열리는 Svelte 앱이며, 3,000+ 파일을 가상 스크롤 그리드로 렌더링한다.

**Tech Stack:** TypeScript, Svelte 5(기존 webview 번들), vitest(core/webview), node:test(vscode boundary), VS Code Webview API. 신규 외부 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-07-04-asset-manager-design.md`

## Global Constraints

- 신규 npm 의존성 추가 금지 (이미지 메타 파싱은 직접 구현, PNG는 기존 `parsePngTextChunks` 재사용).
- 기본 슬롯 스키마는 **2슬롯** `character`/`emotion`, joinTemplate `{s1}_{s2}` (스펙 §3 결정 #3).
- catalog 파일명: `asset-catalog.json`, 위치: `<workspace root>/assets/` (manifest.json 옆).
- assignments key는 `assets/` 기준 POSIX 상대경로. 슬롯당 단일 값. 파일 간 동일 조합 허용(경고만).
- 메시지는 기존 envelope 패턴(`{protocol, version, type, payload}`) + type guard를 양쪽에 작성.
- asset 목록은 사이드바 `detailLoaded`에 포함하지 않는다(§8). Manager 오픈 시 별도 로드.
- 이미지 메타 파싱은 모달 오픈 시 온디맨드(일괄 파싱 금지).
- 파일 리네임 금지 — name 큐레이션은 catalog/manifest에만 반영.
- 코드 주석/JSDoc은 기존 컨벤션(한국어 헤더 주석 + `@file` 태그) 준수.
- Svelte 컴포넌트는 기존 스타일(legacy `export let` props, CSS는 `--vscode-*`/기존 변수) 준수.
- 커밋 메시지는 기존 컨벤션 `type(scope) : subject` 형식.

## 빌드/테스트 명령어 (모든 태스크 공통)

```bash
# core 테스트 (레포 루트에서)
npm --workspace risu-workbench-core run test -- tests/<file>.test.ts
# core 전체 테스트
npm --workspace risu-workbench-core run test
# core 빌드 (vscode가 dist를 소비하므로 vscode 작업 전 필수)
npm run build:core
# webview 테스트
npm --workspace risu-workbench-webview run test -- tests/<path>.test.ts
# webview 빌드 + 타입체크
npm --workspace risu-workbench-webview run build
npm --workspace risu-workbench-webview run check
# vscode 빌드 + boundary 테스트
npm --workspace risu-workbench-vscode run build && npm --workspace risu-workbench-vscode run build:test:e2e
node --test packages/vscode/dist-tests/tests/e2e/asset-manager-boundary.test.js
```

## File Structure (전체 조감도)

```
packages/core/src/
  domain/asset/
    catalog.ts            [A1] catalog 타입/기본값/검증/직렬화 (순수)
    naming.ts             [A2] joinTemplate 파싱/렌더, tokenizer, 부트스트랩 클러스터링 (순수)
    missing.ts            [A3] missing 매트릭스/콤보 계산 (순수)
    derived.ts            [A4] 파생 출력 3종 생성기 (순수)
  domain/analyze/
    lorebook-names.ts     [A5] *.risulorebook name: 후보 추출 (fs)
  node/
    image-meta.ts         [A6] PNG/WebP 파일정보 + AI 생성정보 파싱
    asset-manifest.ts     [B1] manifest 빌드 로직 (CLI에서 추출 + catalog merge)
  cli/assets/workflow.ts  [B1] node/asset-manifest.ts 위임 + --check
  cli/analyze/workflow.ts [B2] lorebook-names 타입 추가
packages/vscode/src/
  asset-manager/
    assetManagerTypes.ts  [C1] 프로토콜 상수/payload/message 타입
    assetManagerMessages.ts [C1] guard/creator
    AssetManagerService.ts  [C2] fs 스캔/카탈로그 IO/메타/출력 — core 함수 조합
    AssetManagerPanel.ts    [C3] WebviewPanel (stableId별 인스턴스)
  artifact-browser/
    artifactBrowserTypes.ts    [C4] 'assets' 섹션 kind + openAssetManager 메시지
    artifactBrowserMessages.ts [C4] guard 추가
    CharacterDetailScanner.ts  [C4] assets 섹션(카운트 전용)
    ModuleDetailScanner.ts     [C4] assets 섹션(카운트 전용)
  views/ArtifactBrowserViewProvider.ts [C4] openAssetManager 핸들러
packages/webview/src/
  lib/types.ts                     [D1] 사이드바 메시지 타입 추가
  lib/vscode.ts                    [D1] openAssetManager creator + [D3] outbound 유니온 확장
  lib/components/sidebar/WorkbenchAccordions.svelte [D1] assets 섹션 버튼
  lib/components/ArtifactDetailView.svelte          [D1] prop 전달
  App.svelte / main.ts             [D1] 핸들러 배선 + [D3] asset-manager 라우트
  lib/types/assetManager.ts        [D2] 프로토콜 미러 타입 + guard/creator
  lib/asset-manager/naming.ts      [D2] name 프리뷰 렌더 (경량 미러)
  lib/asset-manager/gridModel.ts   [D2] 필터/정렬/가상 스크롤 계산 (순수)
  AssetManagerApp.svelte           [D3] 앱 셸(탭/상태/메시징/첫 실행 모달)
  lib/components/asset-manager/
    FirstRunSchemaModal.svelte     [D3] 첫 실행 스키마 설정
    GridView.svelte                [D4] 가상 그리드 + Inspector
    AssetDetailModal.svelte        [D4] 상세 모달(메타데이터)
    MatrixView.svelte              [D5] missing 매트릭스 + expected 편집
    VocabView.svelte               [D5] vocab/스키마/후보 패널
    OutputsView.svelte             [D5] 파생 출력 + Build
packages/core/tests/
  asset-catalog.test.ts [A1] · asset-naming.test.ts [A2] · asset-missing.test.ts [A3]
  asset-derived.test.ts [A4] · lorebook-names.test.ts [A5] · image-meta.test.ts [A6]
  asset-manifest-merge.test.ts [B1] · analyze-lorebook-names-cli.test.ts [B2]
packages/vscode/tests/e2e/asset-manager-boundary.test.ts [C1,C2]
packages/webview/tests/lib/asset-manager/gridModel.test.ts [D2]
packages/webview/tests/lib/asset-manager/naming.test.ts [D2]
```

태스크 순서는 의존성 순: Phase A(core 순수 로직) → B(CLI) → C(extension) → D(webview) → E(최종 검증).

---

### Task A1: catalog 도메인 모듈

**Files:**
- Create: `packages/core/src/domain/asset/catalog.ts`
- Modify: `packages/core/src/domain/index.ts` (export 추가 — 파일 끝에 `export * from './asset/catalog';` 라인. 기존 export 목록 형식을 따를 것)
- Test: `packages/core/tests/asset-catalog.test.ts`

**Interfaces:**
- Consumes: 없음 (leaf 모듈)
- Produces (이후 모든 태스크가 사용):
  - `type AssetSlotId = 's1' | 's2' | 's3'`
  - `interface AssetSlotDefinition { id: AssetSlotId; label: string }`
  - `interface AssetCatalogSchema { slots: AssetSlotDefinition[]; joinTemplate: string }`
  - `type AssetSlotValues = Partial<Record<AssetSlotId, string>>`
  - `interface AssetCatalog { version: 1; schema; vocab; expected; assignments; outputs? }`
  - `createDefaultAssetCatalog(): AssetCatalog` — 2슬롯 기본
  - `parseAssetCatalog(raw: unknown): AssetCatalog | null`
  - `serializeAssetCatalog(catalog: AssetCatalog): string`
  - `ASSET_CATALOG_FILENAME = 'asset-catalog.json'`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/tests/asset-catalog.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  ASSET_CATALOG_FILENAME,
  createDefaultAssetCatalog,
  parseAssetCatalog,
  serializeAssetCatalog,
} from '../src/domain/asset/catalog';

describe('asset catalog', () => {
  it('creates a 2-slot default catalog (character/emotion)', () => {
    const catalog = createDefaultAssetCatalog();
    expect(catalog.version).toBe(1);
    expect(catalog.schema.slots).toEqual([
      { id: 's1', label: 'character' },
      { id: 's2', label: 'emotion' },
    ]);
    expect(catalog.schema.joinTemplate).toBe('{s1}_{s2}');
    expect(catalog.vocab).toEqual({ s1: [], s2: [] });
    expect(catalog.expected).toEqual({});
    expect(catalog.assignments).toEqual({});
  });

  it('round-trips through serialize/parse', () => {
    const catalog = createDefaultAssetCatalog();
    catalog.vocab.s1 = ['Elsie'];
    catalog.assignments['additional/elsie_angry.webp'] = { s1: 'Elsie', s2: 'angry' };
    const parsed = parseAssetCatalog(JSON.parse(serializeAssetCatalog(catalog)));
    expect(parsed).toEqual(catalog);
  });

  it('accepts a valid 3-slot catalog with expected/outputs', () => {
    const parsed = parseAssetCatalog({
      version: 1,
      schema: {
        slots: [
          { id: 's1', label: 'character' },
          { id: 's2', label: 'attire' },
          { id: 's3', label: 'emotion' },
        ],
        joinTemplate: '{s1}_{s2}_{s3}',
      },
      vocab: { s1: ['Elsie'], s2: ['Dress'], s3: ['angry'] },
      expected: { Elsie: { s2: ['Dress'], s3: null } },
      assignments: { 'additional/a.webp': { s1: 'Elsie', s2: 'Dress', s3: 'angry' } },
      outputs: { tagFormat: { prefix: '<img src="', suffix: '">' }, fallbackTemplate: '{s1}_default' },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.schema.slots).toHaveLength(3);
    expect(parsed?.outputs?.fallbackTemplate).toBe('{s1}_default');
  });

  it('rejects malformed catalogs', () => {
    expect(parseAssetCatalog(null)).toBeNull();
    expect(parseAssetCatalog({ version: 2 })).toBeNull();
    expect(parseAssetCatalog({ version: 1, schema: { slots: [], joinTemplate: 'x' } })).toBeNull();
    expect(
      parseAssetCatalog({
        version: 1,
        schema: { slots: [{ id: 's9', label: 'bad' }], joinTemplate: '{s9}' },
        vocab: {},
        expected: {},
        assignments: {},
      }),
    ).toBeNull();
    // slots는 4개 이상 불가
    expect(
      parseAssetCatalog({
        version: 1,
        schema: {
          slots: [
            { id: 's1', label: 'a' },
            { id: 's2', label: 'b' },
            { id: 's3', label: 'c' },
            { id: 's1', label: 'd' },
          ],
          joinTemplate: '{s1}',
        },
        vocab: {},
        expected: {},
        assignments: {},
      }),
    ).toBeNull();
  });

  it('exposes the canonical filename constant', () => {
    expect(ASSET_CATALOG_FILENAME).toBe('asset-catalog.json');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-catalog.test.ts`
Expected: FAIL — `Cannot find module '../src/domain/asset/catalog'`

- [ ] **Step 3: 구현**

`packages/core/src/domain/asset/catalog.ts`:

```typescript
/**
 * Asset Manager 큐레이션 catalog의 타입/기본값/검증.
 * assets/asset-catalog.json이 진실의 원천이며 manifest.json은 빌드 산출물이다.
 * @file packages/core/src/domain/asset/catalog.ts
 */

export const ASSET_CATALOG_FILENAME = 'asset-catalog.json';

export type AssetSlotId = 's1' | 's2' | 's3';

const SLOT_IDS: readonly AssetSlotId[] = ['s1', 's2', 's3'];

export interface AssetSlotDefinition {
  id: AssetSlotId;
  label: string;
}

export interface AssetCatalogSchema {
  slots: AssetSlotDefinition[];
  joinTemplate: string;
}

export type AssetSlotValues = Partial<Record<AssetSlotId, string>>;

/** s1 값별 기대 슬롯 목록. null/생략 = 해당 슬롯 vocab 전체를 기대. */
export type AssetExpectedMap = Record<string, Partial<Record<Exclude<AssetSlotId, 's1'>, string[] | null>>>;

export interface AssetCatalogOutputsConfig {
  tagFormat: { prefix: string; suffix: string };
  fallbackTemplate: string;
}

export interface AssetCatalog {
  version: 1;
  schema: AssetCatalogSchema;
  vocab: Partial<Record<AssetSlotId, string[]>>;
  expected: AssetExpectedMap;
  assignments: Record<string, AssetSlotValues>;
  outputs?: AssetCatalogOutputsConfig;
}

export const DEFAULT_ASSET_OUTPUTS: AssetCatalogOutputsConfig = {
  tagFormat: { prefix: '<img src="', suffix: '">' },
  fallbackTemplate: '{s1}_default',
};

/**
 * createDefaultAssetCatalog 함수.
 * 스펙 결정 #3의 기본 2슬롯(character/emotion, `{s1}_{s2}`) catalog를 생성함.
 */
export function createDefaultAssetCatalog(): AssetCatalog {
  return {
    version: 1,
    schema: {
      slots: [
        { id: 's1', label: 'character' },
        { id: 's2', label: 'emotion' },
      ],
      joinTemplate: '{s1}_{s2}',
    },
    vocab: { s1: [], s2: [] },
    expected: {},
    assignments: {},
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isSlotId(value: unknown): value is AssetSlotId {
  return SLOT_IDS.includes(value as AssetSlotId);
}

function parseSchema(raw: unknown): AssetCatalogSchema | null {
  if (!isPlainRecord(raw) || typeof raw.joinTemplate !== 'string' || !raw.joinTemplate) return null;
  if (!Array.isArray(raw.slots) || raw.slots.length < 1 || raw.slots.length > 3) return null;
  const slots: AssetSlotDefinition[] = [];
  const seen = new Set<string>();
  for (const slot of raw.slots) {
    if (!isPlainRecord(slot) || !isSlotId(slot.id) || typeof slot.label !== 'string') return null;
    if (seen.has(slot.id)) return null;
    seen.add(slot.id);
    slots.push({ id: slot.id, label: slot.label });
  }
  return { slots, joinTemplate: raw.joinTemplate };
}

function parseVocab(raw: unknown): AssetCatalog['vocab'] | null {
  if (!isPlainRecord(raw)) return null;
  const vocab: AssetCatalog['vocab'] = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isSlotId(key) || !isStringArray(value)) return null;
    vocab[key] = value;
  }
  return vocab;
}

function parseExpected(raw: unknown): AssetExpectedMap | null {
  if (!isPlainRecord(raw)) return null;
  const expected: AssetExpectedMap = {};
  for (const [s1Value, slotMap] of Object.entries(raw)) {
    if (!isPlainRecord(slotMap)) return null;
    const parsedSlotMap: AssetExpectedMap[string] = {};
    for (const [slotId, list] of Object.entries(slotMap)) {
      if (slotId !== 's2' && slotId !== 's3') return null;
      if (list !== null && !isStringArray(list)) return null;
      parsedSlotMap[slotId] = list;
    }
    expected[s1Value] = parsedSlotMap;
  }
  return expected;
}

function parseAssignments(raw: unknown): Record<string, AssetSlotValues> | null {
  if (!isPlainRecord(raw)) return null;
  const assignments: Record<string, AssetSlotValues> = {};
  for (const [path, slots] of Object.entries(raw)) {
    if (!isPlainRecord(slots)) return null;
    const values: AssetSlotValues = {};
    for (const [slotId, value] of Object.entries(slots)) {
      if (!isSlotId(slotId) || typeof value !== 'string') return null;
      values[slotId] = value;
    }
    assignments[path] = values;
  }
  return assignments;
}

function parseOutputs(raw: unknown): AssetCatalogOutputsConfig | null | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainRecord(raw) || !isPlainRecord(raw.tagFormat)) return null;
  if (typeof raw.tagFormat.prefix !== 'string' || typeof raw.tagFormat.suffix !== 'string') return null;
  if (typeof raw.fallbackTemplate !== 'string') return null;
  return {
    tagFormat: { prefix: raw.tagFormat.prefix, suffix: raw.tagFormat.suffix },
    fallbackTemplate: raw.fallbackTemplate,
  };
}

/**
 * parseAssetCatalog 함수.
 * unknown JSON을 검증해 AssetCatalog로 파싱함. 형식 위반 시 null.
 */
export function parseAssetCatalog(raw: unknown): AssetCatalog | null {
  if (!isPlainRecord(raw) || raw.version !== 1) return null;
  const schema = parseSchema(raw.schema);
  const vocab = parseVocab(raw.vocab);
  const expected = parseExpected(raw.expected);
  const assignments = parseAssignments(raw.assignments);
  const outputs = parseOutputs(raw.outputs);
  if (!schema || !vocab || !expected || !assignments || outputs === null) return null;
  const catalog: AssetCatalog = { version: 1, schema, vocab, expected, assignments };
  if (outputs) catalog.outputs = outputs;
  return catalog;
}

/**
 * serializeAssetCatalog 함수.
 * catalog를 2-space 들여쓰기 + 개행 종료 JSON 문자열로 직렬화함.
 */
export function serializeAssetCatalog(catalog: AssetCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-catalog.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: domain/index.ts에 export 추가 후 빌드 확인**

`packages/core/src/domain/index.ts` 파일을 열어 기존 export 라인들 사이 알파벳/그룹 순서에 맞춰 추가:

```typescript
export * from './asset/catalog';
```

Run: `npm run build:core`
Expected: 컴파일 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/domain/asset/catalog.ts packages/core/src/domain/index.ts packages/core/tests/asset-catalog.test.ts
git commit -m "feat(asset-catalog) : add asset catalog domain model with 2-slot default"
```

---

### Task A2: naming 모듈 (렌더/tokenizer/부트스트랩)

**Files:**
- Create: `packages/core/src/domain/asset/naming.ts`
- Modify: `packages/core/src/domain/index.ts` (`export * from './asset/naming';` 추가)
- Test: `packages/core/tests/asset-naming.test.ts`

**Interfaces:**
- Consumes: `AssetCatalogSchema`, `AssetSlotValues`, `AssetSlotId`, `AssetCatalog['vocab']` (Task A1)
- Produces:
  - `parseJoinTemplate(template: string): ParsedJoinTemplate | null` — `{ slotOrder: AssetSlotId[]; separators: string[]; prefix: string; suffix: string }`
  - `renderAssetName(schema: AssetCatalogSchema, slots: AssetSlotValues): string | null` — 스키마 슬롯 값이 하나라도 비면 null
  - `normalizeToken(value: string): string` — 소문자화 + `_`/공백 연속 → 단일 공백 (하이픈 보존)
  - `stripExtensionResidue(stem: string): string`
  - `tokenizeAssetFilename(stem: string, schema, vocab): TokenizeResult` — `{ slots: AssetSlotValues; matched: boolean; residue: string }`
  - `bootstrapVocabCandidates(stems: string[]): { prefixes: BootstrapCluster[]; suffixes: BootstrapCluster[] }` — `BootstrapCluster = { value: string; count: number }`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/tests/asset-naming.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { AssetCatalogSchema } from '../src/domain/asset/catalog';
import {
  bootstrapVocabCandidates,
  normalizeToken,
  parseJoinTemplate,
  renderAssetName,
  stripExtensionResidue,
  tokenizeAssetFilename,
} from '../src/domain/asset/naming';

const TWO_SLOT: AssetCatalogSchema = {
  slots: [
    { id: 's1', label: 'character' },
    { id: 's2', label: 'status' },
  ],
  joinTemplate: '{s1} {s2}',
};

const THREE_SLOT: AssetCatalogSchema = {
  slots: [
    { id: 's1', label: 'character' },
    { id: 's2', label: 'attire' },
    { id: 's3', label: 'emotion' },
  ],
  joinTemplate: '{s1}_{s2}_{s3}',
};

describe('parseJoinTemplate / renderAssetName', () => {
  it('parses space-joined 2-slot template', () => {
    expect(parseJoinTemplate('{s1} {s2}')).toEqual({
      slotOrder: ['s1', 's2'],
      separators: [' '],
      prefix: '',
      suffix: '',
    });
  });

  it('parses underscore-joined 3-slot template', () => {
    expect(parseJoinTemplate('{s1}_{s2}_{s3}')).toEqual({
      slotOrder: ['s1', 's2', 's3'],
      separators: ['_', '_'],
      prefix: '',
      suffix: '',
    });
  });

  it('returns null for template without slot placeholders', () => {
    expect(parseJoinTemplate('static')).toBeNull();
  });

  it('renders name with vocab casing preserved', () => {
    expect(renderAssetName(THREE_SLOT, { s1: 'Elsie', s2: 'Dress', s3: 'angry' })).toBe('Elsie_Dress_angry');
    expect(renderAssetName(TWO_SLOT, { s1: 'Min Chae-rin', s2: 'aroused' })).toBe('Min Chae-rin aroused');
  });

  it('returns null when a schema slot value is missing', () => {
    expect(renderAssetName(THREE_SLOT, { s1: 'Elsie', s2: 'Dress' })).toBeNull();
  });
});

describe('normalizeToken / stripExtensionResidue', () => {
  it('normalizes separators but preserves hyphens', () => {
    expect(normalizeToken('Breast_Caress')).toBe('breast caress');
    expect(normalizeToken('Do-hyun')).toBe('do-hyun');
  });

  it('strips repeated trailing extension residue', () => {
    expect(stripExtensionResidue('elsie_dress_angry.webp')).toBe('elsie_dress_angry');
    expect(stripExtensionResidue('foo.webp.webp')).toBe('foo');
    expect(stripExtensionResidue('no_residue')).toBe('no_residue');
  });
});

describe('tokenizeAssetFilename', () => {
  it('matches multi-word character names with hyphen (longest match)', () => {
    const result = tokenizeAssetFilename('Ahn_Do-hyun_acting_coy', TWO_SLOT, {
      s1: ['Ahn Do-hyun', 'Ahn'],
      s2: ['acting coy', 'angry'],
    });
    expect(result.slots).toEqual({ s1: 'Ahn Do-hyun', s2: 'acting coy' });
    expect(result.matched).toBe(true);
    expect(result.residue).toBe('');
  });

  it('tokenizes 3-slot underscore names ignoring extension residue', () => {
    const result = tokenizeAssetFilename('elsie_dress_angry.webp', THREE_SLOT, {
      s1: ['Elsie'],
      s2: ['Dress'],
      s3: ['angry'],
    });
    expect(result.slots).toEqual({ s1: 'Elsie', s2: 'Dress', s3: 'angry' });
    expect(result.matched).toBe(true);
  });

  it('reports residue when a token has no vocab match', () => {
    const result = tokenizeAssetFilename('elsie_dress_unknownmood', THREE_SLOT, {
      s1: ['Elsie'],
      s2: ['Dress'],
      s3: ['angry'],
    });
    expect(result.slots).toEqual({ s1: 'Elsie', s2: 'Dress' });
    expect(result.matched).toBe(false);
    expect(result.residue).toBe('unknownmood');
  });
});

describe('bootstrapVocabCandidates', () => {
  it('clusters common prefixes and suffixes with count >= 2', () => {
    const { prefixes, suffixes } = bootstrapVocabCandidates([
      'elsie_angry',
      'elsie_sad',
      'lily_angry',
      'lily_sad',
      'once_only',
    ]);
    expect(prefixes[0]).toEqual({ value: 'elsie', count: 2 });
    expect(prefixes).toContainEqual({ value: 'lily', count: 2 });
    expect(suffixes).toContainEqual({ value: 'angry', count: 2 });
    expect(suffixes).toContainEqual({ value: 'sad', count: 2 });
    expect(prefixes.find((c) => c.value === 'once')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-naming.test.ts`
Expected: FAIL — `Cannot find module '../src/domain/asset/naming'`

- [ ] **Step 3: 구현**

`packages/core/src/domain/asset/naming.ts`:

```typescript
/**
 * Asset name 조립/분해 로직.
 * joinTemplate 렌더, vocab 최장일치 tokenizer, vocab 부재 시 파일명 클러스터링을 담당함.
 * @file packages/core/src/domain/asset/naming.ts
 */

import type { AssetCatalog, AssetCatalogSchema, AssetSlotId, AssetSlotValues } from './catalog';

export interface ParsedJoinTemplate {
  slotOrder: AssetSlotId[];
  separators: string[];
  prefix: string;
  suffix: string;
}

export interface TokenizeResult {
  slots: AssetSlotValues;
  matched: boolean;
  residue: string;
}

export interface BootstrapCluster {
  value: string;
  count: number;
}

const SLOT_PLACEHOLDER = /\{(s[123])\}/g;
const EXTENSION_RESIDUE = /(\.(png|jpe?g|webp|gif|avif|mp3|ogg|wav|mp4|webm))+$/i;

/**
 * parseJoinTemplate 함수.
 * `{s1}_{s2}` 형태 템플릿을 슬롯 순서/구분자/앞뒤 리터럴로 분해함.
 */
export function parseJoinTemplate(template: string): ParsedJoinTemplate | null {
  const slotOrder: AssetSlotId[] = [];
  const literals: string[] = [];
  let lastIndex = 0;
  for (const match of template.matchAll(SLOT_PLACEHOLDER)) {
    literals.push(template.slice(lastIndex, match.index));
    slotOrder.push(match[1] as AssetSlotId);
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  if (slotOrder.length === 0) return null;
  const suffix = template.slice(lastIndex);
  return {
    slotOrder,
    separators: literals.slice(1),
    prefix: literals[0] ?? '',
    suffix,
  };
}

/**
 * renderAssetName 함수.
 * 스키마의 모든 슬롯 값이 존재할 때만 joinTemplate로 name을 렌더함. 결손 시 null.
 */
export function renderAssetName(schema: AssetCatalogSchema, slots: AssetSlotValues): string | null {
  for (const slot of schema.slots) {
    const value = slots[slot.id];
    if (!value || !value.trim()) return null;
  }
  return schema.joinTemplate.replace(SLOT_PLACEHOLDER, (_match, slotId: AssetSlotId) => slots[slotId] ?? '');
}

/**
 * normalizeToken 함수.
 * 대소문자/`_`·공백 차이를 무시하는 비교 키를 만듦. 하이픈은 이름의 일부로 보존.
 */
export function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, ' ').trim();
}

/**
 * stripExtensionResidue 함수.
 * `elsie_angry.webp` 같은 stem 끝의 확장자 잔재를 반복 제거함.
 */
export function stripExtensionResidue(stem: string): string {
  return stem.replace(EXTENSION_RESIDUE, '');
}

function wordCount(value: string): number {
  return normalizeToken(value).split(' ').length;
}

/**
 * tokenizeAssetFilename 함수.
 * 파일명 stem을 스키마 슬롯 순서대로 vocab 최장일치로 분해함.
 * 단순 split이 아니라 다단어 이름(`Ahn Do-hyun`, `acting coy`)을 지원함.
 */
export function tokenizeAssetFilename(
  stem: string,
  schema: AssetCatalogSchema,
  vocab: AssetCatalog['vocab'],
): TokenizeResult {
  const words = stripExtensionResidue(stem).split(/[\s_]+/).filter(Boolean);
  const slots: AssetSlotValues = {};
  let cursor = 0;

  for (const slot of schema.slots) {
    const entries = [...(vocab[slot.id] ?? [])].sort((left, right) => wordCount(right) - wordCount(left));
    for (const entry of entries) {
      const span = wordCount(entry);
      if (cursor + span > words.length) continue;
      const window = words.slice(cursor, cursor + span).join(' ');
      if (normalizeToken(window) === normalizeToken(entry)) {
        slots[slot.id] = entry;
        cursor += span;
        break;
      }
    }
  }

  return {
    slots,
    matched: schema.slots.every((slot) => slots[slot.id] !== undefined) && cursor === words.length,
    residue: words.slice(cursor).join(' '),
  };
}

/**
 * bootstrapVocabCandidates 함수.
 * vocab이 없을 때 파일명 stem들의 첫 단어(캐릭터 후보)/끝 단어(감정 후보)를
 * 빈도 집계해 등장 2회 이상 후보를 내림차순으로 반환함.
 */
export function bootstrapVocabCandidates(stems: string[]): {
  prefixes: BootstrapCluster[];
  suffixes: BootstrapCluster[];
} {
  const prefixCounts = new Map<string, number>();
  const suffixCounts = new Map<string, number>();
  for (const stem of stems) {
    const words = stripExtensionResidue(stem).split(/[\s_]+/).filter(Boolean);
    if (words.length < 2) continue;
    const first = words[0];
    const last = words[words.length - 1];
    prefixCounts.set(first, (prefixCounts.get(first) ?? 0) + 1);
    suffixCounts.set(last, (suffixCounts.get(last) ?? 0) + 1);
  }
  const toClusters = (counts: Map<string, number>): BootstrapCluster[] =>
    [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([value, count]) => ({ value, count }))
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
  return { prefixes: toClusters(prefixCounts), suffixes: toClusters(suffixCounts) };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-naming.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: export 추가 + 빌드 확인**

`packages/core/src/domain/index.ts`에 `export * from './asset/naming';` 추가.

Run: `npm run build:core`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/domain/asset/naming.ts packages/core/src/domain/index.ts packages/core/tests/asset-naming.test.ts
git commit -m "feat(asset-naming) : add join template renderer, vocab tokenizer, bootstrap clustering"
```

---

### Task A3: missing 계산 모듈

**Files:**
- Create: `packages/core/src/domain/asset/missing.ts`
- Modify: `packages/core/src/domain/index.ts` (`export * from './asset/missing';` 추가)
- Test: `packages/core/tests/asset-missing.test.ts`

**Interfaces:**
- Consumes: `AssetCatalog`, `AssetSlotValues` (A1), `renderAssetName` (A2)
- Produces:
  - `type MissingCellState = 'present' | 'duplicate' | 'missing' | 'excluded'`
  - `interface MissingCell { row: string; col: string; state: MissingCellState; count: number; paths: string[] }`
  - `interface MissingMatrix { rowSlotId: AssetSlotId; colSlotId: AssetSlotId | null; rows: string[]; cols: string[]; cells: MissingCell[][] }`
  - `computeMissingMatrix(catalog: AssetCatalog, options?: { s1?: string }): MissingMatrix | null` — 3슬롯이면 `options.s1` 필수(없으면 null), 2슬롯은 행=s1/열=s2, 1슬롯은 열 `['']`
  - `expectedListFor(catalog, s1Value, slotId): string[]` — expected override 반영(null/생략=vocab 전체)
  - `listMissingCombos(catalog: AssetCatalog): Array<{ slots: Required 조합; name: string | null }>`
  - `findDuplicateNameGroups(catalog): Array<{ name: string; paths: string[] }>`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/tests/asset-missing.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { AssetCatalog } from '../src/domain/asset/catalog';
import {
  computeMissingMatrix,
  expectedListFor,
  findDuplicateNameGroups,
  listMissingCombos,
} from '../src/domain/asset/missing';

function twoSlotCatalog(): AssetCatalog {
  return {
    version: 1,
    schema: {
      slots: [
        { id: 's1', label: 'character' },
        { id: 's2', label: 'emotion' },
      ],
      joinTemplate: '{s1} {s2}',
    },
    vocab: { s1: ['Rin', 'Yua'], s2: ['angry', 'sad', 'smile'] },
    expected: { Yua: { s2: ['angry'] } },
    assignments: {
      'additional/rin_angry.png': { s1: 'Rin', s2: 'angry' },
      'additional/rin_angry_alt.png': { s1: 'Rin', s2: 'angry' },
      'additional/yua_angry.png': { s1: 'Yua', s2: 'angry' },
    },
  };
}

function threeSlotCatalog(): AssetCatalog {
  return {
    version: 1,
    schema: {
      slots: [
        { id: 's1', label: 'character' },
        { id: 's2', label: 'attire' },
        { id: 's3', label: 'emotion' },
      ],
      joinTemplate: '{s1}_{s2}_{s3}',
    },
    vocab: { s1: ['Elsie'], s2: ['Dress', 'Nude'], s3: ['angry', 'sad'] },
    expected: { Elsie: { s2: ['Dress'], s3: null } },
    assignments: {
      'additional/a.webp': { s1: 'Elsie', s2: 'Dress', s3: 'angry' },
    },
  };
}

describe('expectedListFor', () => {
  it('falls back to full vocab when no override', () => {
    expect(expectedListFor(twoSlotCatalog(), 'Rin', 's2')).toEqual(['angry', 'sad', 'smile']);
  });
  it('applies per-s1 override', () => {
    expect(expectedListFor(twoSlotCatalog(), 'Yua', 's2')).toEqual(['angry']);
  });
});

describe('computeMissingMatrix (2-slot)', () => {
  it('builds rows=s1, cols=s2 with duplicate/missing/excluded states', () => {
    const matrix = computeMissingMatrix(twoSlotCatalog());
    expect(matrix).not.toBeNull();
    expect(matrix?.rows).toEqual(['Rin', 'Yua']);
    expect(matrix?.cols).toEqual(['angry', 'sad', 'smile']);
    const rinRow = matrix!.cells[0];
    expect(rinRow[0].state).toBe('duplicate');
    expect(rinRow[0].count).toBe(2);
    expect(rinRow[1].state).toBe('missing');
    const yuaRow = matrix!.cells[1];
    expect(yuaRow[0].state).toBe('present');
    expect(yuaRow[1].state).toBe('excluded'); // expected가 angry뿐이므로 sad는 비대상
  });
});

describe('computeMissingMatrix (3-slot)', () => {
  it('requires s1 and builds rows=s2, cols=s3 within expected sets', () => {
    expect(computeMissingMatrix(threeSlotCatalog())).toBeNull();
    const matrix = computeMissingMatrix(threeSlotCatalog(), { s1: 'Elsie' });
    expect(matrix?.rows).toEqual(['Dress']); // expected.s2 override
    expect(matrix?.cols).toEqual(['angry', 'sad']); // s3 null → vocab 전체
    expect(matrix!.cells[0][0].state).toBe('present');
    expect(matrix!.cells[0][1].state).toBe('missing');
  });
});

describe('listMissingCombos', () => {
  it('lists expected combos without assignments, with rendered names', () => {
    const combos = listMissingCombos(threeSlotCatalog());
    expect(combos).toEqual([{ slots: { s1: 'Elsie', s2: 'Dress', s3: 'sad' }, name: 'Elsie_Dress_sad' }]);
  });
});

describe('findDuplicateNameGroups', () => {
  it('groups assignments resolving to the same rendered name', () => {
    const groups = findDuplicateNameGroups(twoSlotCatalog());
    expect(groups).toEqual([
      { name: 'Rin angry', paths: ['additional/rin_angry.png', 'additional/rin_angry_alt.png'] },
    ]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-missing.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`packages/core/src/domain/asset/missing.ts`:

```typescript
/**
 * Missing asset 계산.
 * per-s1 expected 집합(스펙 §4.1)을 기준으로 매트릭스/누락 콤보/중복 name을 계산함.
 * @file packages/core/src/domain/asset/missing.ts
 */

import type { AssetCatalog, AssetSlotId, AssetSlotValues } from './catalog';
import { renderAssetName } from './naming';

export type MissingCellState = 'present' | 'duplicate' | 'missing' | 'excluded';

export interface MissingCell {
  row: string;
  col: string;
  state: MissingCellState;
  count: number;
  paths: string[];
}

export interface MissingMatrix {
  rowSlotId: AssetSlotId;
  colSlotId: AssetSlotId | null;
  rows: string[];
  cols: string[];
  cells: MissingCell[][];
}

export interface MissingCombo {
  slots: AssetSlotValues;
  name: string | null;
}

export interface DuplicateNameGroup {
  name: string;
  paths: string[];
}

/**
 * expectedListFor 함수.
 * s1 값의 기대 슬롯 목록을 반환함. override가 null/생략이면 vocab 전체.
 */
export function expectedListFor(
  catalog: AssetCatalog,
  s1Value: string,
  slotId: Exclude<AssetSlotId, 's1'>,
): string[] {
  const override = catalog.expected[s1Value]?.[slotId];
  if (override === undefined || override === null) return catalog.vocab[slotId] ?? [];
  return override;
}

function comboKey(values: Array<string | undefined>): string {
  return values.map((value) => value ?? '').join('\u0000');
}

function groupAssignments(catalog: AssetCatalog, slotIds: AssetSlotId[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [path, slots] of Object.entries(catalog.assignments)) {
    const key = comboKey(slotIds.map((slotId) => slots[slotId]));
    const paths = groups.get(key) ?? [];
    paths.push(path);
    groups.set(key, paths);
  }
  for (const paths of groups.values()) paths.sort();
  return groups;
}

function cellState(count: number, excluded: boolean): MissingCellState {
  if (excluded) return 'excluded';
  if (count === 0) return 'missing';
  return count > 1 ? 'duplicate' : 'present';
}

/**
 * computeMissingMatrix 함수.
 * 2슬롯: 행=s1·열=s2. 3슬롯: options.s1 필수, 행=expected s2·열=expected s3.
 * 1슬롯: 행=s1·열=[''] 존재 여부만.
 */
export function computeMissingMatrix(
  catalog: AssetCatalog,
  options: { s1?: string } = {},
): MissingMatrix | null {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);

  if (slotIds.length === 3) {
    const s1Value = options.s1;
    if (!s1Value) return null;
    const rows = expectedListFor(catalog, s1Value, 's2');
    const cols = expectedListFor(catalog, s1Value, 's3');
    const groups = groupAssignments(catalog, ['s1', 's2', 's3']);
    const cells = rows.map((row) =>
      cols.map((col) => {
        const paths = groups.get(comboKey([s1Value, row, col])) ?? [];
        return { row, col, state: cellState(paths.length, false), count: paths.length, paths };
      }),
    );
    return { rowSlotId: 's2', colSlotId: 's3', rows, cols, cells };
  }

  if (slotIds.length === 2) {
    const rows = catalog.vocab.s1 ?? [];
    const cols = catalog.vocab.s2 ?? [];
    const groups = groupAssignments(catalog, ['s1', 's2']);
    const cells = rows.map((row) => {
      const expectedSet = new Set(expectedListFor(catalog, row, 's2'));
      return cols.map((col) => {
        const paths = groups.get(comboKey([row, col])) ?? [];
        const excluded = !expectedSet.has(col) && paths.length === 0;
        return { row, col, state: cellState(paths.length, excluded), count: paths.length, paths };
      });
    });
    return { rowSlotId: 's1', colSlotId: 's2', rows, cols, cells };
  }

  const rows = catalog.vocab.s1 ?? [];
  const groups = groupAssignments(catalog, ['s1']);
  const cells = rows.map((row) => {
    const paths = groups.get(comboKey([row])) ?? [];
    return [{ row, col: '', state: cellState(paths.length, false), count: paths.length, paths }];
  });
  return { rowSlotId: 's1', colSlotId: null, rows, cols: [''], cells };
}

function expectedComboProduct(catalog: AssetCatalog, s1Value: string): AssetSlotValues[] {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);
  if (slotIds.length === 1) return [{ s1: s1Value }];
  const s2List = expectedListFor(catalog, s1Value, 's2');
  if (slotIds.length === 2) return s2List.map((s2) => ({ s1: s1Value, s2 }));
  const s3List = expectedListFor(catalog, s1Value, 's3');
  return s2List.flatMap((s2) => s3List.map((s3) => ({ s1: s1Value, s2, s3 })));
}

/**
 * listMissingCombos 함수.
 * 모든 s1의 expected 조합 중 할당이 없는 조합을 렌더된 name과 함께 나열함.
 */
export function listMissingCombos(catalog: AssetCatalog): MissingCombo[] {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);
  const groups = groupAssignments(catalog, slotIds);
  const missing: MissingCombo[] = [];
  for (const s1Value of catalog.vocab.s1 ?? []) {
    for (const combo of expectedComboProduct(catalog, s1Value)) {
      const key = comboKey(slotIds.map((slotId) => combo[slotId]));
      if ((groups.get(key) ?? []).length === 0) {
        missing.push({ slots: combo, name: renderAssetName(catalog.schema, combo) });
      }
    }
  }
  return missing;
}

/**
 * findDuplicateNameGroups 함수.
 * 렌더된 name이 동일한 파일 그룹(2개 이상)을 name 오름차순으로 반환함.
 */
export function findDuplicateNameGroups(catalog: AssetCatalog): DuplicateNameGroup[] {
  const byName = new Map<string, string[]>();
  for (const [path, slots] of Object.entries(catalog.assignments)) {
    const name = renderAssetName(catalog.schema, slots);
    if (!name) continue;
    const paths = byName.get(name) ?? [];
    paths.push(path);
    byName.set(name, paths);
  }
  return [...byName.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([name, paths]) => ({ name, paths: [...paths].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-missing.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: export 추가 + 빌드**

`packages/core/src/domain/index.ts`에 `export * from './asset/missing';` 추가 후 `npm run build:core` 성공 확인.

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/domain/asset/missing.ts packages/core/src/domain/index.ts packages/core/tests/asset-missing.test.ts
git commit -m "feat(asset-missing) : add expected-set based missing matrix and duplicate detection"
```

---

### Task A4: 파생 출력 생성기

**Files:**
- Create: `packages/core/src/domain/asset/derived.ts`
- Modify: `packages/core/src/domain/index.ts` (`export * from './asset/derived';` 추가)
- Test: `packages/core/tests/asset-derived.test.ts`

**Interfaces:**
- Consumes: `AssetCatalog`, `DEFAULT_ASSET_OUTPUTS` (A1), `parseJoinTemplate`, `renderAssetName` (A2), `expectedListFor`, `listMissingCombos` (A3)
- Produces:
  - `escapeRegexLiteral(value: string): string`
  - `generatePromptBlock(catalog: AssetCatalog): string` — markdown 지시문 블록
  - `generateWhitelistRegex(catalog: AssetCatalog): { inPattern: string; outPattern: string } | null` — s1 vocab이 비었거나 template 파싱 실패 시 null
  - `generateMissingReport(catalog: AssetCatalog, format: 'markdown' | 'json'): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/tests/asset-derived.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { AssetCatalog } from '../src/domain/asset/catalog';
import {
  escapeRegexLiteral,
  generateMissingReport,
  generatePromptBlock,
  generateWhitelistRegex,
} from '../src/domain/asset/derived';

function catalog(): AssetCatalog {
  return {
    version: 1,
    schema: {
      slots: [
        { id: 's1', label: 'character' },
        { id: 's2', label: 'emotion' },
      ],
      joinTemplate: '{s1}_{s2}',
    },
    vocab: { s1: ['Elsie', 'Char(Adult)'], s2: ['angry', 'nervous', 'nervous pouting'] },
    expected: { 'Char(Adult)': { s2: ['angry'] } },
    assignments: { 'additional/elsie_angry.webp': { s1: 'Elsie', s2: 'angry' } },
    outputs: { tagFormat: { prefix: '<img src="', suffix: '">' }, fallbackTemplate: '{s1}_default' },
  };
}

describe('escapeRegexLiteral', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegexLiteral('Char(Adult)')).toBe('Char\\(Adult\\)');
    expect(escapeRegexLiteral('a.b*c')).toBe('a\\.b\\*c');
  });
});

describe('generatePromptBlock', () => {
  it('renders format line, slot lists and per-character expected overrides', () => {
    const block = generatePromptBlock(catalog());
    expect(block).toContain('<img src="{character}_{emotion}">');
    expect(block).toContain('- character: Elsie; Char(Adult)');
    expect(block).toContain('- emotion: angry; nervous; nervous pouting');
    expect(block).toContain('Char(Adult): angry');
  });
});

describe('generateWhitelistRegex', () => {
  it('builds negative-lookahead whitelist with escaping and close boundary', () => {
    const result = generateWhitelistRegex(catalog());
    expect(result).not.toBeNull();
    const { inPattern, outPattern } = result!;
    expect(inPattern).toContain('Char\\(Adult\\)');
    // prefix 공유 감정 경계: suffix 뒤에 닫힘 경계 lookahead가 있어야 nervous pouting을 오차단하지 않음
    expect(inPattern).toContain('(?=">)');
    expect(outPattern).toBe('<img src="$1_default">');
    // 유효 조합은 매치하지 않고, 무효 감정만 매치해야 함
    const regex = new RegExp(inPattern);
    expect(regex.test('<img src="Elsie_invalidmood">')).toBe(true);
    expect(regex.test('<img src="Elsie_angry">')).toBe(false);
    expect(regex.test('<img src="Elsie_nervous">')).toBe(false);
    expect(regex.test('<img src="Elsie_nervous pouting">')).toBe(false);
    expect(regex.test('<img src="Elsie">')).toBe(true); // bare name → fallback 대상
    expect(regex.test('<img src="Unknown_angry">')).toBe(false); // 미등록 캐릭터는 미대상
  });

  it('returns null when s1 vocab is empty', () => {
    const empty = catalog();
    empty.vocab.s1 = [];
    expect(generateWhitelistRegex(empty)).toBeNull();
  });
});

describe('generateMissingReport', () => {
  it('renders markdown grouped by s1', () => {
    const report = generateMissingReport(catalog(), 'markdown');
    expect(report).toContain('## Elsie');
    expect(report).toContain('Elsie_nervous');
    expect(report).not.toContain('Elsie_angry'); // 존재하는 조합은 제외
    expect(report).toContain('## Char(Adult)');
    expect(report).toContain('Char(Adult)_angry');
  });

  it('renders json with combos', () => {
    const parsed = JSON.parse(generateMissingReport(catalog(), 'json')) as {
      missing: Array<{ name: string | null }>;
    };
    expect(parsed.missing.some((combo) => combo.name === 'Elsie_nervous')).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-derived.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`packages/core/src/domain/asset/derived.ts`:

```typescript
/**
 * vocab/할당에서 파생되는 출력 3종 생성기.
 * 프롬프트 Image Command List 블록, Negative Lookahead 화이트리스트 정규식, missing 리포트.
 * 에셋찐빠 가이드의 수작업(특수문자 escape, prefix 경계)을 코드가 책임짐.
 * @file packages/core/src/domain/asset/derived.ts
 */

import { DEFAULT_ASSET_OUTPUTS, type AssetCatalog } from './catalog';
import { parseJoinTemplate } from './naming';
import { expectedListFor, listMissingCombos } from './missing';

/**
 * escapeRegexLiteral 함수.
 * 캐릭터명/감정의 정규식 메타문자를 escape함 (`Char(Adult)` 케이스).
 */
export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function outputsOf(catalog: AssetCatalog) {
  return catalog.outputs ?? DEFAULT_ASSET_OUTPUTS;
}

/**
 * generatePromptBlock 함수.
 * 스키마/vocab/expected에서 프롬프트용 Image Command List markdown 블록을 생성함.
 */
export function generatePromptBlock(catalog: AssetCatalog): string {
  const { tagFormat } = outputsOf(catalog);
  const labelTemplate = catalog.schema.joinTemplate.replace(/\{(s[123])\}/g, (_match, slotId: string) => {
    const slot = catalog.schema.slots.find((entry) => entry.id === slotId);
    return `{${slot?.label ?? slotId}}`;
  });

  const lines: string[] = [
    '## Image Command Instructions',
    '',
    `- Format: ${tagFormat.prefix}${labelTemplate}${tagFormat.suffix}`,
    '',
    '### Command Lists',
    '',
  ];
  for (const slot of catalog.schema.slots) {
    const values = catalog.vocab[slot.id] ?? [];
    lines.push(`- ${slot.label}: ${values.join('; ')}`);
  }

  const overrides = (catalog.vocab.s1 ?? []).filter((s1Value) => catalog.expected[s1Value]);
  if (overrides.length > 0 && catalog.schema.slots.length >= 2) {
    const secondSlot = catalog.schema.slots[1];
    lines.push('', `### Per-${catalog.schema.slots[0].label} ${secondSlot.label}`, '');
    for (const s1Value of overrides) {
      lines.push(`- ${s1Value}: ${expectedListFor(catalog, s1Value, secondSlot.id as 's2' | 's3').join('; ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function collectValidSuffixes(catalog: AssetCatalog): string[] {
  const parsed = parseJoinTemplate(catalog.schema.joinTemplate);
  if (!parsed || parsed.slotOrder.length < 2) return [];
  const suffixes = new Set<string>();
  for (const s1Value of catalog.vocab.s1 ?? []) {
    const s2List = expectedListFor(catalog, s1Value, 's2');
    if (parsed.slotOrder.length === 2) {
      for (const s2 of s2List) suffixes.add(s2);
      continue;
    }
    const s3List = expectedListFor(catalog, s1Value, 's3');
    const innerSeparator = parsed.separators[1] ?? '';
    for (const s2 of s2List) for (const s3 of s3List) suffixes.add(`${s2}${innerSeparator}${s3}`);
  }
  return [...suffixes].sort();
}

/**
 * generateWhitelistRegex 함수.
 * 에셋찐빠 가이드 4번 기법(Negative Lookahead 화이트리스트)의 IN/OUT 패턴을 생성함.
 * bare name과 invalid suffix를 모두 fallback으로 보냄.
 */
export function generateWhitelistRegex(
  catalog: AssetCatalog,
): { inPattern: string; outPattern: string } | null {
  const parsed = parseJoinTemplate(catalog.schema.joinTemplate);
  const s1Vocab = catalog.vocab.s1 ?? [];
  if (!parsed || s1Vocab.length === 0) return null;

  const { tagFormat, fallbackTemplate } = outputsOf(catalog);
  const names = s1Vocab.map(escapeRegexLiteral).join('|');
  const closeEscaped = escapeRegexLiteral(tagFormat.suffix);
  const closeFirstChar = tagFormat.suffix.charAt(0) || '"';
  const bodyCharClass = `[^${escapeRegexLiteral(closeFirstChar)}]`;
  const prefixEscaped = escapeRegexLiteral(tagFormat.prefix);

  let alternatives = `(?=${closeEscaped})`;
  if (parsed.slotOrder.length >= 2) {
    const separator = escapeRegexLiteral(parsed.separators[0] ?? '');
    const suffixes = collectValidSuffixes(catalog).map(escapeRegexLiteral).join('|');
    const suffixGuard = suffixes ? `(?!(?:${suffixes})(?=${closeEscaped}))` : '';
    alternatives = `${separator}${suffixGuard}${bodyCharClass}+|(?=${closeEscaped})`;
  }

  const inPattern = `${prefixEscaped}(${names})(?:${alternatives})${closeEscaped}`;
  const fallback = fallbackTemplate.replace(/\{s1\}/g, '$1');
  const outPattern = `${tagFormat.prefix}${fallback}${tagFormat.suffix}`;
  return { inPattern, outPattern };
}

/**
 * generateMissingReport 함수.
 * expected 조합 중 누락된 asset을 s1별 markdown 또는 json으로 리포트함.
 */
export function generateMissingReport(catalog: AssetCatalog, format: 'markdown' | 'json'): string {
  const missing = listMissingCombos(catalog);
  if (format === 'json') {
    return `${JSON.stringify({ total: missing.length, missing }, null, 2)}\n`;
  }
  const lines: string[] = ['# Missing Assets Report', '', `총 ${missing.length}건`, ''];
  const byS1 = new Map<string, string[]>();
  for (const combo of missing) {
    const s1Value = combo.slots.s1 ?? '(unknown)';
    const names = byS1.get(s1Value) ?? [];
    names.push(combo.name ?? JSON.stringify(combo.slots));
    byS1.set(s1Value, names);
  }
  for (const [s1Value, names] of byS1) {
    lines.push(`## ${s1Value}`, '');
    for (const name of names) lines.push(`- ${name}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-derived.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: export 추가 + 빌드**

`packages/core/src/domain/index.ts`에 `export * from './asset/derived';` 추가 후 `npm run build:core` 성공 확인.

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/domain/asset/derived.ts packages/core/src/domain/index.ts packages/core/tests/asset-derived.test.ts
git commit -m "feat(asset-derived) : generate prompt block, whitelist regex, missing report from catalog"
```

---

### Task A5: lorebook 캐릭터명 후보 추출

**Files:**
- Create: `packages/core/src/domain/analyze/lorebook-names.ts`
- Modify: `packages/core/src/domain/index.ts` (`export * from './analyze/lorebook-names';` 추가)
- Test: `packages/core/tests/lorebook-names.test.ts`

**Interfaces:**
- Consumes: node `fs`/`path`만
- Produces:
  - `interface LorebookNameCandidate { name: string; filePath: string; folderPath: string }` — `filePath`/`folderPath`는 워크스페이스 root 기준 POSIX 상대경로
  - `extractNameFromLorebookText(text: string): string | null` — 첫 frontmatter 블록의 `name:` 값
  - `extractLorebookNameCandidates(rootDir: string): LorebookNameCandidate[]` — `lorebooks/`·`lorebook/` 재귀 스캔, name 중복 제거(첫 출현 유지), 파일경로 정렬

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/tests/lorebook-names.test.ts`:

```typescript
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractLorebookNameCandidates,
  extractNameFromLorebookText,
} from '../src/domain/analyze/lorebook-names';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const LOREBOOK = (name: string) => `---\nname: ${name}\ncomment: ${name}\nmode: normal\n---\n@@@ KEYS\nkey\n@@@ CONTENT\nbody\n`;

describe('extractNameFromLorebookText', () => {
  it('reads name from the first frontmatter block', () => {
    expect(extractNameFromLorebookText(LOREBOOK('아데스·룬·드로크'))).toBe('아데스·룬·드로크');
  });
  it('returns null without frontmatter or name', () => {
    expect(extractNameFromLorebookText('@@@ CONTENT\nbody')).toBeNull();
    expect(extractNameFromLorebookText('---\ncomment: x\n---\nbody')).toBeNull();
  });
  it('ignores name-like lines outside the frontmatter block', () => {
    expect(extractNameFromLorebookText('---\ncomment: x\n---\nname: not-me')).toBeNull();
  });
});

describe('extractLorebookNameCandidates', () => {
  it('walks lorebooks/ recursively, dedupes names, keeps folder grouping info', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-lorebook-names-'));
    tempDirs.push(workDir);
    fs.mkdirSync(path.join(workDir, 'lorebooks', '신격'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'lorebooks', '지역'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'lorebooks', '신격', 'a.risulorebook'), LOREBOOK('Ades'));
    fs.writeFileSync(path.join(workDir, 'lorebooks', '신격', 'dup.risulorebook'), LOREBOOK('Ades'));
    fs.writeFileSync(path.join(workDir, 'lorebooks', '지역', 'town.risulorebook'), LOREBOOK('Town Square'));
    fs.writeFileSync(path.join(workDir, 'lorebooks', 'not-a-lorebook.txt'), 'name: skipme');

    const candidates = extractLorebookNameCandidates(workDir);
    expect(candidates).toEqual([
      { name: 'Ades', filePath: 'lorebooks/신격/a.risulorebook', folderPath: 'lorebooks/신격' },
      { name: 'Town Square', filePath: 'lorebooks/지역/town.risulorebook', folderPath: 'lorebooks/지역' },
    ]);
  });

  it('returns empty list when no lorebook directory exists', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-lorebook-names-'));
    tempDirs.push(workDir);
    expect(extractLorebookNameCandidates(workDir)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/lorebook-names.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`packages/core/src/domain/analyze/lorebook-names.ts`:

```typescript
/**
 * *.risulorebook 정적분석으로 캐릭터명 후보를 추출함.
 * CLI(analyze)와 Asset Manager가 공유하는 공통 분석 도구 (스펙 §5).
 * frontmatter는 비엄격 YAML일 수 있어 라인 기반으로 name:만 읽음.
 * @file packages/core/src/domain/analyze/lorebook-names.ts
 */

import fs from 'node:fs';
import path from 'node:path';

export interface LorebookNameCandidate {
  name: string;
  filePath: string;
  folderPath: string;
}

const LOREBOOK_DIRECTORIES = ['lorebooks', 'lorebook'] as const;

/**
 * extractNameFromLorebookText 함수.
 * 문서 선두 frontmatter 블록(`---` ~ `---`) 안의 `name:` 값을 추출함.
 */
export function extractNameFromLorebookText(text: string): string | null {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '---') return null;
    const match = /^name\s*:\s*(.+)$/.exec(line);
    if (match) {
      const value = match[1].trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

function walkLorebookFiles(dirPath: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) files.push(...walkLorebookFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.risulorebook')) files.push(entryPath);
  }
  return files;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

/**
 * extractLorebookNameCandidates 함수.
 * 워크스페이스 root의 lorebooks/·lorebook/를 재귀 스캔해 name 후보를 반환함.
 * 동일 name은 첫 출현만 유지하고, 결과는 파일경로 오름차순.
 */
export function extractLorebookNameCandidates(rootDir: string): LorebookNameCandidate[] {
  const files: string[] = [];
  for (const dirName of LOREBOOK_DIRECTORIES) {
    const dirPath = path.join(rootDir, dirName);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      files.push(...walkLorebookFiles(dirPath));
    }
  }
  files.sort((left, right) => toPosix(left).localeCompare(toPosix(right)));

  const candidates: LorebookNameCandidate[] = [];
  const seenNames = new Set<string>();
  for (const filePath of files) {
    let text: string;
    try {
      text = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    const name = extractNameFromLorebookText(text);
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);
    const relativePath = toPosix(path.relative(rootDir, filePath));
    candidates.push({
      name,
      filePath: relativePath,
      folderPath: toPosix(path.dirname(relativePath)),
    });
  }
  return candidates;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/lorebook-names.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: export 추가 + 빌드**

`packages/core/src/domain/index.ts`에 `export * from './analyze/lorebook-names';` 추가 후 `npm run build:core` 성공 확인.

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/domain/analyze/lorebook-names.ts packages/core/src/domain/index.ts packages/core/tests/lorebook-names.test.ts
git commit -m "feat(analyze) : extract lorebook name candidates for asset vocab curation"
```

---

### Task A6: 이미지 메타데이터 파서 (파일정보 + AI 생성정보)

**Files:**
- Create: `packages/core/src/node/image-meta.ts`
- Modify: `packages/core/src/node/index.ts` (`export * from './image-meta';` 추가 — 기존 export 형식 확인 후 동일하게)
- Test: `packages/core/tests/image-meta.test.ts`

**Interfaces:**
- Consumes: `parsePngTextChunks`, `PNG_SIGNATURE` (`packages/core/src/node/png.ts`, 기존 코드)
- Produces:
  - `interface ImageFileInfo { width: number | null; height: number | null; format: 'png' | 'webp' | 'jpeg' | 'unknown'; sizeBytes: number }`
  - `interface ImageGenerationInfo { source: 'novelai' | 'stable-diffusion' | 'comfyui' | 'unknown'; fields: Record<string, string> }`
  - `interface ImageMeta { info: ImageFileInfo; generation: ImageGenerationInfo | null }`
  - `readImageMetaFromBuffer(buffer: Buffer, sizeBytes: number): ImageMeta`
  - `readImageMeta(filePath: string): ImageMeta` — fs.readFileSync 후 buffer 버전 위임

파싱 규약 (best-effort, 실패는 조용히 null/unknown):
- PNG: IHDR(오프셋 16/20)에서 width/height. tEXt 청크(`parsePngTextChunks`)에서 `parameters`(SD webui) → source `stable-diffusion`, fields `{ parameters }`; `Comment`가 JSON이면 NovelAI → fields는 JSON 최상위 키를 문자열화; `prompt` 키가 JSON이면 `comfyui`.
- WebP: RIFF 컨테이너 청크 워킹. `VP8X`: width = 24bit LE(오프셋+4)+1, height = 24bit LE(오프셋+7)+1. `VP8 `(lossy): frame tag 뒤 오프셋+6/+8의 14bit. `VP8L`(lossless): 오프셋+1부터 14bit×2. `EXIF` 청크가 있으면 그 안에서 첫 `{"`부터 균형 잡힌 JSON 추출 시도 → 성공하면 NovelAI(webp)로 간주.
- JPEG/기타: format만 판별, dims null, generation null.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/tests/image-meta.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { readImageMetaFromBuffer } from '../src/node/image-meta';

/** 테스트용 최소 PNG 생성: IHDR(width/height) + tEXt 청크들 + IEND */
function buildPng(width: number, height: number, texts: Record<string, string>): Buffer {
  const chunks: Buffer[] = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];
  const pushChunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); // 파서는 CRC를 검증하지 않으므로 0으로 충분
    chunks.push(length, typeBuffer, data, crc);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  pushChunk('IHDR', ihdr);
  for (const [key, value] of Object.entries(texts)) {
    pushChunk('tEXt', Buffer.concat([Buffer.from(key, 'ascii'), Buffer.from([0]), Buffer.from(value, 'latin1')]));
  }
  pushChunk('IEND', Buffer.alloc(0));
  return Buffer.concat(chunks);
}

/** 테스트용 최소 WebP(VP8X + EXIF JSON) 생성 */
function buildWebpVp8x(width: number, height: number, exifJson?: string): Buffer {
  const vp8x = Buffer.alloc(10);
  vp8x.writeUIntLE(width - 1, 4, 3);
  vp8x.writeUIntLE(height - 1, 7, 3);
  const buildChunk = (fourcc: string, data: Buffer) => {
    const header = Buffer.alloc(8);
    header.write(fourcc, 0, 'ascii');
    header.writeUInt32LE(data.length, 4);
    const padded = data.length % 2 === 1 ? Buffer.concat([data, Buffer.from([0])]) : data;
    return Buffer.concat([header, padded]);
  };
  const body: Buffer[] = [buildChunk('VP8X', vp8x)];
  if (exifJson) body.push(buildChunk('EXIF', Buffer.concat([Buffer.from('Exif\0\0II'), Buffer.from(exifJson, 'utf-8')])));
  const payload = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...body]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(payload.length, 4);
  return Buffer.concat([riff, payload]);
}

describe('readImageMetaFromBuffer', () => {
  it('reads PNG dimensions and stable-diffusion parameters', () => {
    const png = buildPng(1024, 1536, { parameters: '1girl, masterpiece\nNegative prompt: lowres\nSeed: 42' });
    const meta = readImageMetaFromBuffer(png, png.length);
    expect(meta.info).toMatchObject({ width: 1024, height: 1536, format: 'png' });
    expect(meta.generation?.source).toBe('stable-diffusion');
    expect(meta.generation?.fields.parameters).toContain('Seed: 42');
  });

  it('parses NovelAI PNG Comment JSON into fields', () => {
    const comment = JSON.stringify({ prompt: '1girl', steps: 28, seed: 1234 });
    const png = buildPng(64, 64, { Comment: comment, Software: 'NovelAI' });
    const meta = readImageMetaFromBuffer(png, png.length);
    expect(meta.generation?.source).toBe('novelai');
    expect(meta.generation?.fields.prompt).toBe('1girl');
    expect(meta.generation?.fields.seed).toBe('1234');
  });

  it('reads WebP VP8X dimensions and embedded EXIF JSON', () => {
    const webp = buildWebpVp8x(1216, 832, JSON.stringify({ prompt: 'catgirl', sampler: 'k_euler' }));
    const meta = readImageMetaFromBuffer(webp, webp.length);
    expect(meta.info).toMatchObject({ width: 1216, height: 832, format: 'webp' });
    expect(meta.generation?.source).toBe('novelai');
    expect(meta.generation?.fields.prompt).toBe('catgirl');
  });

  it('returns null generation for plain images and unknown formats', () => {
    const png = buildPng(8, 8, {});
    expect(readImageMetaFromBuffer(png, png.length).generation).toBeNull();
    const junk = Buffer.from('not an image');
    const meta = readImageMetaFromBuffer(junk, junk.length);
    expect(meta.info.format).toBe('unknown');
    expect(meta.info.width).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/image-meta.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`packages/core/src/node/image-meta.ts`:

```typescript
/**
 * Asset 상세 모달용 이미지 메타데이터 파서.
 * 파일정보(해상도/형식) + AI 생성정보(NAI/SD/ComfyUI)를 외부 의존성 없이 best-effort로 추출함.
 * @file packages/core/src/node/image-meta.ts
 */

import fs from 'node:fs';
import { PNG_SIGNATURE, parsePngTextChunks } from './png';

export interface ImageFileInfo {
  width: number | null;
  height: number | null;
  format: 'png' | 'webp' | 'jpeg' | 'unknown';
  sizeBytes: number;
}

export interface ImageGenerationInfo {
  source: 'novelai' | 'stable-diffusion' | 'comfyui' | 'unknown';
  fields: Record<string, string>;
}

export interface ImageMeta {
  info: ImageFileInfo;
  generation: ImageGenerationInfo | null;
}

function stringifyJsonFields(value: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    fields[key] = typeof entry === 'string' ? entry : JSON.stringify(entry);
  }
  return fields;
}

function tryParseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // best-effort: JSON이 아니면 무시
  }
  return null;
}

function generationFromPngTexts(texts: Record<string, string>): ImageGenerationInfo | null {
  if (typeof texts.parameters === 'string' && texts.parameters.length > 0) {
    return { source: 'stable-diffusion', fields: { parameters: texts.parameters } };
  }
  if (typeof texts.prompt === 'string') {
    const record = tryParseJsonRecord(texts.prompt);
    if (record) return { source: 'comfyui', fields: stringifyJsonFields(record) };
  }
  if (typeof texts.Comment === 'string') {
    const record = tryParseJsonRecord(texts.Comment);
    if (record) return { source: 'novelai', fields: stringifyJsonFields(record) };
  }
  return null;
}

function readPngMeta(buffer: Buffer, sizeBytes: number): ImageMeta {
  const width = buffer.length >= 24 ? buffer.readUInt32BE(16) : null;
  const height = buffer.length >= 24 ? buffer.readUInt32BE(20) : null;
  let generation: ImageGenerationInfo | null = null;
  try {
    generation = generationFromPngTexts(parsePngTextChunks(buffer));
  } catch {
    generation = null;
  }
  return { info: { width, height, format: 'png', sizeBytes }, generation };
}

/** RIFF 청크에서 균형 잡힌 첫 JSON 객체 문자열을 추출함 (NAI webp EXIF 대응). */
function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{"');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function readWebpMeta(buffer: Buffer, sizeBytes: number): ImageMeta {
  let width: number | null = null;
  let height: number | null = null;
  let generation: ImageGenerationInfo | null = null;

  let position = 12;
  while (position + 8 <= buffer.length) {
    const fourcc = buffer.toString('ascii', position, position + 4);
    const chunkSize = buffer.readUInt32LE(position + 4);
    const dataStart = position + 8;
    if (fourcc === 'VP8X' && chunkSize >= 10) {
      width = buffer.readUIntLE(dataStart + 4, 3) + 1;
      height = buffer.readUIntLE(dataStart + 7, 3) + 1;
    } else if (fourcc === 'VP8 ' && chunkSize >= 10 && width === null) {
      width = buffer.readUInt16LE(dataStart + 6) & 0x3fff;
      height = buffer.readUInt16LE(dataStart + 8) & 0x3fff;
    } else if (fourcc === 'VP8L' && chunkSize >= 5 && width === null) {
      const bits = buffer.readUInt32LE(dataStart + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (fourcc === 'EXIF') {
      const text = buffer.toString('utf-8', dataStart, dataStart + chunkSize);
      const json = extractBalancedJson(text);
      const record = json ? tryParseJsonRecord(json) : null;
      if (record) generation = { source: 'novelai', fields: stringifyJsonFields(record) };
    }
    position = dataStart + chunkSize + (chunkSize % 2);
  }

  return { info: { width, height, format: 'webp', sizeBytes }, generation };
}

/**
 * readImageMetaFromBuffer 함수.
 * 버퍼의 시그니처로 형식을 판별해 파일정보 + AI 생성정보를 추출함.
 */
export function readImageMetaFromBuffer(buffer: Buffer, sizeBytes: number): ImageMeta {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return readPngMeta(buffer, sizeBytes);
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return readWebpMeta(buffer, sizeBytes);
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { info: { width: null, height: null, format: 'jpeg', sizeBytes }, generation: null };
  }
  return { info: { width: null, height: null, format: 'unknown', sizeBytes }, generation: null };
}

/**
 * readImageMeta 함수.
 * 파일을 읽어 readImageMetaFromBuffer에 위임함.
 */
export function readImageMeta(filePath: string): ImageMeta {
  const buffer = fs.readFileSync(filePath);
  return readImageMetaFromBuffer(buffer, buffer.length);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/image-meta.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: node/index.ts export 추가 + 빌드**

`packages/core/src/node/index.ts`에 기존 export 형식에 맞춰 `export * from './image-meta';` 추가.

Run: `npm run build:core`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/node/image-meta.ts packages/core/src/node/index.ts packages/core/tests/image-meta.test.ts
git commit -m "feat(image-meta) : parse file info and AI generation metadata from png/webp"
```

---

### Task B1: manifest 빌드를 node로 추출 + catalog merge + `--check`

**Files:**
- Create: `packages/core/src/node/asset-manifest.ts`
- Modify: `packages/core/src/cli/assets/workflow.ts` (로직 위임 + `--check` 플래그)
- Modify: `packages/core/src/node/index.ts` (`export * from './asset-manifest';` 추가)
- Test: `packages/core/tests/asset-manifest-merge.test.ts`
- 기존 테스트 유지: `packages/core/tests/asset-manifest-build.test.ts` 는 수정 없이 계속 통과해야 함

**Interfaces:**
- Consumes: `loadAssetCatalogFromAssetsDir`(신규, 이 태스크에서 정의), `parseAssetCatalog`/`ASSET_CATALOG_FILENAME` (A1), `renderAssetName` (A2), `findDuplicateNameGroups`, `listMissingCombos` (A3), `writeText`/`readJsonIfExists` (`node/fs-helpers`, 기존)
- Produces (C2의 AssetManagerService와 CLI가 소비):
  - `interface CharacterAssetManifestEntry` — 기존 cli/assets/workflow.ts의 것을 그대로 이동 (index/original_uri/extracted_path/status/type/name/ext/subdir/size_bytes)
  - `interface AssetManifestBuildSummary { manifestPath: string; total: number; named: number; unassigned: number; duplicates: DuplicateNameGroup[]; orphanPaths: string[] }`
  - `collectCharacterAssetEntries(assetsDir: string, catalog: AssetCatalog | null): CharacterAssetManifestEntry[]` — catalog 할당이 완전하면 `name`을 렌더 결과로 교체
  - `buildCharacterAssetManifest(options: { rootDir: string }): AssetManifestBuildSummary` — catalog 자동 로드 + manifest 기록
  - `loadAssetCatalogFromAssetsDir(assetsDir: string): AssetCatalog | null`
  - `computeAssetBuildWarnings(catalog: AssetCatalog, scannedPaths: string[]): { duplicates; orphanPaths; unassigned: number }`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/tests/asset-manifest-merge.test.ts`:

```typescript
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCharacterAssetManifest } from '../src/node/asset-manifest';
import { runAssetsWorkflow } from '../src/cli/assets/workflow';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function setupWorkspace(): string {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-asset-merge-'));
  tempDirs.push(workDir);
  fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
  fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));
  fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_smile.png'), Buffer.from([2]));
  return workDir;
}

function writeCatalog(workDir: string): void {
  fs.writeFileSync(
    path.join(workDir, 'assets', 'asset-catalog.json'),
    JSON.stringify({
      version: 1,
      schema: {
        slots: [
          { id: 's1', label: 'character' },
          { id: 's2', label: 'emotion' },
        ],
        joinTemplate: '{s1} {s2}',
      },
      vocab: { s1: ['Rin'], s2: ['angry', 'smile'] },
      expected: {},
      assignments: {
        'additional/rin_angry.png': { s1: 'Rin', s2: 'angry' },
        'additional/gone.png': { s1: 'Rin', s2: 'smile' },
      },
    }),
  );
}

describe('buildCharacterAssetManifest with catalog merge', () => {
  it('renders assigned names, falls back to stem, reports warnings', () => {
    const workDir = setupWorkspace();
    writeCatalog(workDir);

    const summary = buildCharacterAssetManifest({ rootDir: workDir });
    expect(summary.total).toBe(2);
    expect(summary.named).toBe(1);
    expect(summary.unassigned).toBe(1);
    expect(summary.orphanPaths).toEqual(['additional/gone.png']);

    const manifest = JSON.parse(fs.readFileSync(summary.manifestPath, 'utf-8')) as {
      assets: Array<{ extracted_path: string; name: string }>;
    };
    const byPath = new Map(manifest.assets.map((asset) => [asset.extracted_path, asset.name]));
    expect(byPath.get('additional/rin_angry.png')).toBe('Rin angry'); // catalog merge
    expect(byPath.get('additional/rin_smile.png')).toBe('rin_smile'); // fallback stem
  });

  it('preserves curated names across rebuilds (rebuild safety)', () => {
    const workDir = setupWorkspace();
    writeCatalog(workDir);
    buildCharacterAssetManifest({ rootDir: workDir });
    // 재빌드 — catalog가 그대로면 name도 그대로여야 함
    const summary = buildCharacterAssetManifest({ rootDir: workDir });
    const manifest = JSON.parse(fs.readFileSync(summary.manifestPath, 'utf-8')) as {
      assets: Array<{ extracted_path: string; name: string }>;
    };
    expect(manifest.assets.find((a) => a.extracted_path === 'additional/rin_angry.png')?.name).toBe('Rin angry');
  });

  it('builds without catalog exactly like before (backward compat)', () => {
    const workDir = setupWorkspace();
    const summary = buildCharacterAssetManifest({ rootDir: workDir });
    expect(summary.named).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(summary.manifestPath, 'utf-8')) as {
      assets: Array<{ name: string }>;
    };
    expect(manifest.assets.map((a) => a.name).sort()).toEqual(['rin_angry', 'rin_smile']);
  });
});

describe('assets CLI --check', () => {
  it('reports without writing manifest', () => {
    const workDir = setupWorkspace();
    writeCatalog(workDir);
    const exitCode = runAssetsWorkflow(['--in', workDir, '--check']);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(workDir, 'assets', 'manifest.json'))).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-manifest-merge.test.ts`
Expected: FAIL — `Cannot find module '../src/node/asset-manifest'`

- [ ] **Step 3: node/asset-manifest.ts 구현**

기존 `cli/assets/workflow.ts`의 manifest 타입/스캔 로직을 이동하고 catalog merge를 추가:

```typescript
/**
 * Character asset manifest 빌더.
 * 디스크 스캔 + asset-catalog.json merge로 manifest.json을 생성함 (스펙 §4.2).
 * CLI(assets)와 VS Code Asset Manager가 공유함.
 * @file packages/core/src/node/asset-manifest.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ASSET_CATALOG_FILENAME,
  parseAssetCatalog,
  type AssetCatalog,
} from '../domain/asset/catalog';
import { renderAssetName } from '../domain/asset/naming';
import { findDuplicateNameGroups, type DuplicateNameGroup } from '../domain/asset/missing';
import { readJsonIfExists, writeText } from './fs-helpers';

export const CHARACTER_ASSET_DIRS = ['additional', 'emotions', 'icons', 'other'] as const;

export type CharacterAssetSubdir = (typeof CHARACTER_ASSET_DIRS)[number];

export interface CharacterAssetManifestEntry {
  readonly index: number;
  readonly original_uri: null;
  readonly extracted_path: string;
  readonly status: 'extracted';
  readonly type: 'icon' | 'emotion' | 'x-risu-asset' | 'asset';
  readonly name: string;
  readonly ext: string;
  readonly subdir: CharacterAssetSubdir;
  readonly size_bytes: number;
}

export interface CharacterAssetManifest {
  readonly version: 1;
  readonly source_format: 'workspace';
  readonly total: number;
  readonly extracted: number;
  readonly skipped: 0;
  readonly assets: readonly CharacterAssetManifestEntry[];
}

export interface AssetManifestBuildSummary {
  readonly manifestPath: string;
  readonly manifest: CharacterAssetManifest;
  readonly total: number;
  readonly named: number;
  readonly unassigned: number;
  readonly duplicates: DuplicateNameGroup[];
  readonly orphanPaths: string[];
}

/**
 * loadAssetCatalogFromAssetsDir 함수.
 * assets/asset-catalog.json을 읽어 검증 파싱함. 없거나 손상이면 null.
 */
export function loadAssetCatalogFromAssetsDir(assetsDir: string): AssetCatalog | null {
  const raw = readJsonIfExists(path.join(assetsDir, ASSET_CATALOG_FILENAME));
  return raw === null ? null : parseAssetCatalog(raw);
}

function listFiles(dirPath: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'manifest.json' || entry.name === ASSET_CATALOG_FILENAME) continue;
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files.sort((left, right) => toPosix(left).localeCompare(toPosix(right)));
}

function assetTypeFromSubdir(subdir: CharacterAssetSubdir): CharacterAssetManifestEntry['type'] {
  switch (subdir) {
    case 'icons':
      return 'icon';
    case 'emotions':
      return 'emotion';
    case 'additional':
      return 'x-risu-asset';
    case 'other':
      return 'asset';
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

/**
 * collectCharacterAssetEntries 함수.
 * canonical asset 디렉토리를 스캔하고, catalog 할당이 완전한 파일은
 * joinTemplate 렌더 결과를 name으로 사용함 (미할당은 파일명 stem 유지).
 */
export function collectCharacterAssetEntries(
  assetsDir: string,
  catalog: AssetCatalog | null,
): CharacterAssetManifestEntry[] {
  const entries: CharacterAssetManifestEntry[] = [];
  for (const subdir of CHARACTER_ASSET_DIRS) {
    const dirPath = path.join(assetsDir, subdir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;
    for (const filePath of listFiles(dirPath)) {
      const relativePath = toPosix(path.relative(assetsDir, filePath));
      const parsed = path.parse(filePath);
      const assignment = catalog?.assignments[relativePath];
      const curatedName = assignment && catalog ? renderAssetName(catalog.schema, assignment) : null;
      entries.push({
        index: entries.length,
        original_uri: null,
        extracted_path: relativePath,
        status: 'extracted',
        type: assetTypeFromSubdir(subdir),
        name: curatedName ?? parsed.name,
        ext: parsed.ext.replace(/^\./, '') || 'bin',
        subdir,
        size_bytes: fs.statSync(filePath).size,
      });
    }
  }
  return entries;
}

/**
 * computeAssetBuildWarnings 함수.
 * 중복 name 그룹, orphan 할당(스캔에 없는 경로), 미할당 수를 계산함.
 */
export function computeAssetBuildWarnings(
  catalog: AssetCatalog | null,
  scannedPaths: string[],
): { duplicates: DuplicateNameGroup[]; orphanPaths: string[]; named: number } {
  if (!catalog) return { duplicates: [], orphanPaths: [], named: 0 };
  const scanned = new Set(scannedPaths);
  const orphanPaths = Object.keys(catalog.assignments)
    .filter((assignedPath) => !scanned.has(assignedPath))
    .sort();
  let named = 0;
  for (const [assignedPath, slots] of Object.entries(catalog.assignments)) {
    if (scanned.has(assignedPath) && renderAssetName(catalog.schema, slots)) named += 1;
  }
  return { duplicates: findDuplicateNameGroups(catalog), orphanPaths, named };
}

/**
 * buildCharacterAssetManifest 함수.
 * catalog를 자동 로드해 merge 빌드하고 manifest.json을 기록함.
 */
export function buildCharacterAssetManifest(options: { rootDir: string }): AssetManifestBuildSummary {
  const assetsDir = path.join(options.rootDir, 'assets');
  const catalog = loadAssetCatalogFromAssetsDir(assetsDir);
  const entries = collectCharacterAssetEntries(assetsDir, catalog);
  const manifest: CharacterAssetManifest = {
    version: 1,
    source_format: 'workspace',
    total: entries.length,
    extracted: entries.length,
    skipped: 0,
    assets: entries,
  };
  const manifestPath = path.join(assetsDir, 'manifest.json');
  writeText(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const warnings = computeAssetBuildWarnings(catalog, entries.map((entry) => entry.extracted_path));
  return {
    manifestPath,
    manifest,
    total: entries.length,
    named: warnings.named,
    unassigned: entries.length - warnings.named,
    duplicates: warnings.duplicates,
    orphanPaths: warnings.orphanPaths,
  };
}
```

- [ ] **Step 4: cli/assets/workflow.ts를 위임 구조로 수정**

파일 전체를 다음으로 교체 (기존 CLI 동작·help 텍스트는 유지하고 `--check` 추가):

```typescript
import path from 'node:path';
import {
  buildCharacterAssetManifest,
  loadAssetCatalogFromAssetsDir,
} from '@/node/asset-manifest';
import { listMissingCombos } from '@/domain/asset/missing';
import { argValue, getErrorMessage } from '../shared';

interface AssetWorkflowOptions {
  readonly inDir: string;
  readonly checkOnly: boolean;
}

export { buildCharacterAssetManifest } from '@/node/asset-manifest';
export type { AssetManifestBuildSummary as CharacterAssetManifestBuildResult } from '@/node/asset-manifest';

export function runAssetsWorkflow(argv: readonly string[]): number {
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    return 0;
  }

  const options = parseAssetWorkflowOptions(argv);
  try {
    if (options.checkOnly) {
      return runCheck(options.inDir);
    }
    const result = buildCharacterAssetManifest({ rootDir: options.inDir });
    console.log('\nRisuAI Asset Manifest Builder\n');
    console.log(`- workspace : ${options.inDir}`);
    console.log('\nBuild complete:');
    console.log(
      `- ${path.relative(process.cwd(), result.manifestPath)} (${result.total} assets, curated ${result.named})`,
    );
    printWarnings(result.duplicates.map((group) => group.name), result.orphanPaths);
    console.log('');
    return 0;
  } catch (error) {
    console.error(`\nERROR: ${getErrorMessage(error)}\n`);
    return 1;
  }
}

function runCheck(inDir: string): number {
  const assetsDir = path.join(inDir, 'assets');
  const catalog = loadAssetCatalogFromAssetsDir(assetsDir);
  console.log('\nRisuAI Asset Catalog Check\n');
  if (!catalog) {
    console.log('- asset-catalog.json 없음 (검사할 큐레이션 데이터가 없습니다)');
    console.log('');
    return 0;
  }
  const summaryProbe = buildProbe(inDir);
  printWarnings(summaryProbe.duplicateNames, summaryProbe.orphanPaths);
  const missing = listMissingCombos(catalog);
  console.log(`- missing combos : ${missing.length}`);
  for (const combo of missing.slice(0, 50)) console.log(`    ${combo.name ?? JSON.stringify(combo.slots)}`);
  if (missing.length > 50) console.log(`    ... ${missing.length - 50} more`);
  console.log('');
  return 0;
}

function buildProbe(inDir: string): { duplicateNames: string[]; orphanPaths: string[] } {
  // manifest를 쓰지 않고 경고만 계산하기 위해 collect + warnings를 직접 조합
  const {
    collectCharacterAssetEntries,
    computeAssetBuildWarnings,
    loadAssetCatalogFromAssetsDir: load,
  } = require('@/node/asset-manifest') as typeof import('@/node/asset-manifest');
  const assetsDir = path.join(inDir, 'assets');
  const catalog = load(assetsDir);
  const entries = collectCharacterAssetEntries(assetsDir, catalog);
  const warnings = computeAssetBuildWarnings(catalog, entries.map((entry) => entry.extracted_path));
  return { duplicateNames: warnings.duplicates.map((group) => group.name), orphanPaths: warnings.orphanPaths };
}

function printWarnings(duplicateNames: string[], orphanPaths: string[]): void {
  if (duplicateNames.length > 0) {
    console.log(`- WARN duplicate names (${duplicateNames.length}): ${duplicateNames.slice(0, 10).join(', ')}`);
  }
  if (orphanPaths.length > 0) {
    console.log(`- WARN orphan assignments (${orphanPaths.length}): ${orphanPaths.slice(0, 10).join(', ')}`);
  }
}

function printHelp(): void {
  console.log(`
RisuAI Asset Manifest Builder

Usage:
  risu-core assets [options]

Options:
  --in <dir>   Character workspace root (default: .)
  --check      manifest를 쓰지 않고 missing/중복/orphan 리포트만 출력
  -h, --help   Show help

Input:
  assets/additional/ -> type x-risu-asset
  assets/emotions/   -> type emotion
  assets/icons/      -> type icon
  assets/other/      -> type asset
  assets/asset-catalog.json 이 있으면 할당된 파일의 name을 joinTemplate로 렌더
`);
}

function parseAssetWorkflowOptions(argv: readonly string[]): AssetWorkflowOptions {
  return {
    inDir: path.resolve(argValue(argv, '--in') || '.'),
    checkOnly: argv.includes('--check'),
  };
}
```

주의: `@/` path alias가 core에서 동작하는지 기존 `cli/assets/workflow.ts`의 `import { writeText } from '@/node/fs-helpers';`로 이미 검증되어 있다. `buildProbe`의 `require` 사용이 lint에 걸리면 파일 상단 정적 import로 바꾼다 (동일 모듈이므로 정적 import 권장):

```typescript
import {
  buildCharacterAssetManifest,
  collectCharacterAssetEntries,
  computeAssetBuildWarnings,
  loadAssetCatalogFromAssetsDir,
} from '@/node/asset-manifest';
```

정적 import로 바꾸면 `buildProbe` 내부의 `require` 라인 3줄을 삭제하고 곧바로 함수 호출로 대체한다.

- [ ] **Step 5: node/index.ts export 추가**

`packages/core/src/node/index.ts`에 `export * from './asset-manifest';` 추가.

- [ ] **Step 6: 신규 + 기존 테스트 통과 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-manifest-merge.test.ts tests/asset-manifest-build.test.ts`
Expected: PASS — 신규 4 tests + 기존 1 test 모두 통과 (기존 테스트가 하위호환의 증거)

Run: `npm run build:core`
Expected: 성공

- [ ] **Step 7: 커밋**

```bash
git add packages/core/src/node/asset-manifest.ts packages/core/src/node/index.ts packages/core/src/cli/assets/workflow.ts packages/core/tests/asset-manifest-merge.test.ts
git commit -m "feat(assets-cli) : merge asset-catalog names into manifest build, add --check"
```

---

### Task B2: analyze CLI에 lorebook-names 타입 추가

**Files:**
- Modify: `packages/core/src/cli/analyze/workflow.ts`
- Modify: `packages/core/src/cli/CLI.md` (assets `--check` + analyze `lorebook-names` 사용법 문단 추가)
- Test: `packages/core/tests/analyze-lorebook-names-cli.test.ts`

**Interfaces:**
- Consumes: `extractLorebookNameCandidates` (A5)
- Produces: CLI 사용법 `risu-core analyze --type lorebook-names <workspaceDir> [--json]`
  - 기본 출력: 폴더별 그룹 사람이 읽는 목록
  - `--json`: `{ candidates: LorebookNameCandidate[] }` JSON

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/tests/analyze-lorebook-names-cli.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAnalyzeWorkflow } from '../src/cli/analyze/workflow';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('analyze --type lorebook-names', () => {
  it('prints JSON candidates with --json', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-names-'));
    tempDirs.push(workDir);
    fs.mkdirSync(path.join(workDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'lorebooks', 'rin.risulorebook'),
      '---\nname: Rin\n---\n@@@ CONTENT\nbody\n',
    );

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line?: unknown) => {
      logs.push(String(line ?? ''));
    });

    const exitCode = await runAnalyzeWorkflow(['--type', 'lorebook-names', workDir, '--json']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(logs.join('\n')) as { candidates: Array<{ name: string }> };
    expect(parsed.candidates).toEqual([
      { name: 'Rin', filePath: 'lorebooks/rin.risulorebook', folderPath: 'lorebooks' },
    ]);
  });

  it('fails with exit 1 when target directory is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await runAnalyzeWorkflow(['--type', 'lorebook-names', '/nonexistent-risu-dir']);
    expect(exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/analyze-lorebook-names-cli.test.ts`
Expected: FAIL — unknown type 에러로 exit 1 또는 후보 미출력

- [ ] **Step 3: workflow.ts 수정**

`packages/core/src/cli/analyze/workflow.ts`에서:

1. `KNOWN_TYPES` 배열에 `'lorebook-names'` 추가:

```typescript
const KNOWN_TYPES = ['lua', 'charx', 'module', 'preset', 'compose', 'lorebook-names'] as const;
```

2. 파일 상단 import 추가:

```typescript
import { extractLorebookNameCandidates } from '../../domain/analyze/lorebook-names';
```

3. 타입 분기 지점(기존 `--type` dispatch — `runAnalyzeWorkflow` 내부에서 type별 워크플로우를 호출하는 switch/if 체인)에 `lorebook-names` 분기 추가. 기존 분기 코드 형태를 그대로 따르며, 핸들러는 다음 함수로:

```typescript
/** lorebook-names 타입: *.risulorebook name: 후보를 폴더 그룹으로 출력함. */
function runLorebookNamesAnalyze(argv: readonly string[]): number {
  const target = argv.find((token) => !token.startsWith('-'));
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    console.error('\nERROR: lorebook-names 분석 대상 디렉토리를 찾을 수 없습니다.\n');
    return 1;
  }
  const candidates = extractLorebookNameCandidates(path.resolve(target));
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ candidates }, null, 2));
    return 0;
  }
  console.log(`\nLorebook name candidates (${candidates.length})\n`);
  let currentFolder: string | null = null;
  for (const candidate of candidates) {
    if (candidate.folderPath !== currentFolder) {
      currentFolder = candidate.folderPath;
      console.log(`  [${currentFolder}]`);
    }
    console.log(`    - ${candidate.name}`);
  }
  console.log('');
  return 0;
}
```

4. `HELP_TEXT`의 Types 목록에 한 줄 추가:

```
    lorebook-names  *.risulorebook name: 캐릭터명 후보 추출 (--json 지원)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/analyze-lorebook-names-cli.test.ts`
Expected: PASS (2 tests)

전체 회귀: `npm --workspace risu-workbench-core run test`
Expected: 전체 PASS

- [ ] **Step 5: CLI.md 문서화**

`packages/core/src/cli/CLI.md`의 assets/analyze 섹션에 추가 (기존 문서 형식에 맞춰):

```markdown
### assets --check

`risu-core assets --in <dir> --check`
manifest를 쓰지 않고 asset-catalog.json 기준 missing 조합 / 중복 name / orphan 할당만 리포트한다.

### analyze --type lorebook-names

`risu-core analyze --type lorebook-names <workspaceDir> [--json]`
lorebooks/의 *.risulorebook frontmatter `name:`을 정적분석해 캐릭터명 후보를 폴더 그룹으로 출력한다.
Asset Manager의 vocab 후보 패널과 같은 core 함수(`extractLorebookNameCandidates`)를 사용한다.
```

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/cli/analyze/workflow.ts packages/core/src/cli/CLI.md packages/core/tests/analyze-lorebook-names-cli.test.ts
git commit -m "feat(analyze-cli) : add lorebook-names type for character vocab candidates"
```

---

### Task C1: asset-manager 프로토콜 타입 + 메시지 guard (vscode)

**Files:**
- Create: `packages/vscode/src/asset-manager/assetManagerTypes.ts`
- Create: `packages/vscode/src/asset-manager/assetManagerMessages.ts`
- Test: `packages/vscode/tests/e2e/asset-manager-boundary.test.ts` (이 태스크에서 guard 부분, C2에서 service 부분 추가)

**Interfaces:**
- Consumes: `isPlainRecord`, `isProtocolEnvelope` (`packages/vscode/src/shared/protocolEnvelope.ts`, 기존), `AssetCatalog`/`AssetSlotValues`/`LorebookNameCandidate`/`ImageMeta` 등 core 타입 (`risu-workbench-core`)
- Produces (C2/C3/D2가 사용):
  - `ASSET_MANAGER_PROTOCOL = 'risu-workbench.asset-manager'`, `ASSET_MANAGER_PROTOCOL_VERSION = 1`, `ASSET_MANAGER_VIEW_NAME = 'asset-manager'`
  - `type AssetOutputKind = 'promptBlock' | 'whitelistRegex' | 'missingReport'`
  - `interface AssetManagerAssetEntry { path; subdir; ext; sizeBytes; mtimeMs; fileStem; assignment: AssetSlotValues | null; generatedName: string | null; flags: { unassigned: boolean; duplicate: boolean } }`
  - webview→ext 메시지 타입: `ready`(payload `{}`), `refreshAssets`, `updateAssignments`, `updateVocab`, `updateSchema`, `updateExpected`, `analyzeLorebookNames`, `bootstrapFromFilenames`, `readImageMeta`, `generateOutputs`, `saveOutput`, `buildManifest` — ready 외 전부 `stableId` 포함
  - ext→webview 메시지 타입: `assetsLoaded`, `catalogSaved`, `lorebookNamesResult`, `tokenizeResult`, `imageMetaResult`, `outputsResult`, `outputSaved`, `manifestBuilt`, `error`
  - `isAssetManagerWebviewMessage(message): message is AssetManagerWebviewMessage` + 타입별 guard
  - `createAssetManagerExtensionMessage(type, payload)` creator

- [ ] **Step 1: 타입 파일 작성**

`packages/vscode/src/asset-manager/assetManagerTypes.ts`:

```typescript
/**
 * Asset Manager webview 프로토콜 계약.
 * 스펙 §6.2. webview 측 미러: packages/webview/src/lib/types/assetManager.ts
 * @file packages/vscode/src/asset-manager/assetManagerTypes.ts
 */

import type {
  AssetCatalog,
  AssetCatalogOutputsConfig,
  AssetCatalogSchema,
  AssetExpectedMap,
  AssetSlotValues,
  DuplicateNameGroup,
  LorebookNameCandidate,
  MissingCombo,
} from 'risu-workbench-core';
import type { ImageMeta } from 'risu-workbench-core/node';

export const ASSET_MANAGER_PROTOCOL = 'risu-workbench.asset-manager';
export const ASSET_MANAGER_PROTOCOL_VERSION = 1;
export const ASSET_MANAGER_VIEW_NAME = 'asset-manager';

export interface AssetManagerEnvelope<TType extends string, TPayload> {
  protocol: typeof ASSET_MANAGER_PROTOCOL;
  version: typeof ASSET_MANAGER_PROTOCOL_VERSION;
  type: TType;
  payload: TPayload;
}

export type AssetOutputKind = 'promptBlock' | 'whitelistRegex' | 'missingReport';

export interface AssetManagerAssetEntry {
  path: string;
  subdir: string;
  ext: string;
  sizeBytes: number;
  mtimeMs: number;
  fileStem: string;
  assignment: AssetSlotValues | null;
  generatedName: string | null;
  flags: { unassigned: boolean; duplicate: boolean };
}

export interface AssetManagerAssignmentChange {
  path: string;
  /** null = 할당 제거 */
  slots: AssetSlotValues | null;
}

export interface AssetManagerTokenizeProposal {
  path: string;
  slots: AssetSlotValues;
  matched: boolean;
  residue: string;
}

// ---- webview → extension payloads ----
export type AssetManagerReadyPayload = Record<string, never>;
export interface AssetManagerStableIdPayload {
  stableId: string;
}
export interface AssetManagerUpdateAssignmentsPayload extends AssetManagerStableIdPayload {
  changes: AssetManagerAssignmentChange[];
}
export interface AssetManagerUpdateVocabPayload extends AssetManagerStableIdPayload {
  vocab: AssetCatalog['vocab'];
}
export interface AssetManagerUpdateSchemaPayload extends AssetManagerStableIdPayload {
  schema: AssetCatalogSchema;
  outputs?: AssetCatalogOutputsConfig;
}
export interface AssetManagerUpdateExpectedPayload extends AssetManagerStableIdPayload {
  expected: AssetExpectedMap;
}
export interface AssetManagerReadImageMetaPayload extends AssetManagerStableIdPayload {
  path: string;
}
export interface AssetManagerGenerateOutputsPayload extends AssetManagerStableIdPayload {
  kinds: AssetOutputKind[];
}
export interface AssetManagerSaveOutputPayload extends AssetManagerStableIdPayload {
  kind: AssetOutputKind;
  targetPath: string;
  content: string;
}

export type AssetManagerReadyMessage = AssetManagerEnvelope<'asset-manager/ready', AssetManagerReadyPayload>;
export type AssetManagerRefreshAssetsMessage = AssetManagerEnvelope<'asset-manager/refreshAssets', AssetManagerStableIdPayload>;
export type AssetManagerUpdateAssignmentsMessage = AssetManagerEnvelope<'asset-manager/updateAssignments', AssetManagerUpdateAssignmentsPayload>;
export type AssetManagerUpdateVocabMessage = AssetManagerEnvelope<'asset-manager/updateVocab', AssetManagerUpdateVocabPayload>;
export type AssetManagerUpdateSchemaMessage = AssetManagerEnvelope<'asset-manager/updateSchema', AssetManagerUpdateSchemaPayload>;
export type AssetManagerUpdateExpectedMessage = AssetManagerEnvelope<'asset-manager/updateExpected', AssetManagerUpdateExpectedPayload>;
export type AssetManagerAnalyzeLorebookNamesMessage = AssetManagerEnvelope<'asset-manager/analyzeLorebookNames', AssetManagerStableIdPayload>;
export type AssetManagerBootstrapMessage = AssetManagerEnvelope<'asset-manager/bootstrapFromFilenames', AssetManagerStableIdPayload>;
export type AssetManagerReadImageMetaMessage = AssetManagerEnvelope<'asset-manager/readImageMeta', AssetManagerReadImageMetaPayload>;
export type AssetManagerGenerateOutputsMessage = AssetManagerEnvelope<'asset-manager/generateOutputs', AssetManagerGenerateOutputsPayload>;
export type AssetManagerSaveOutputMessage = AssetManagerEnvelope<'asset-manager/saveOutput', AssetManagerSaveOutputPayload>;
export type AssetManagerBuildManifestMessage = AssetManagerEnvelope<'asset-manager/buildManifest', AssetManagerStableIdPayload>;

export type AssetManagerWebviewMessage =
  | AssetManagerReadyMessage
  | AssetManagerRefreshAssetsMessage
  | AssetManagerUpdateAssignmentsMessage
  | AssetManagerUpdateVocabMessage
  | AssetManagerUpdateSchemaMessage
  | AssetManagerUpdateExpectedMessage
  | AssetManagerAnalyzeLorebookNamesMessage
  | AssetManagerBootstrapMessage
  | AssetManagerReadImageMetaMessage
  | AssetManagerGenerateOutputsMessage
  | AssetManagerSaveOutputMessage
  | AssetManagerBuildManifestMessage;

// ---- extension → webview payloads ----
export interface AssetManagerScanSnapshot {
  entries: AssetManagerAssetEntry[];
  catalog: AssetCatalog;
  catalogExists: boolean;
  orphanPaths: string[];
  duplicateNames: string[];
}
export interface AssetManagerAssetsLoadedPayload extends AssetManagerScanSnapshot {
  stableId: string;
  artifactName: string;
  assetsRootWebviewUri: string;
}
export interface AssetManagerCatalogSavedPayload extends AssetManagerScanSnapshot {
  stableId: string;
}
export interface AssetManagerLorebookNamesResultPayload extends AssetManagerStableIdPayload {
  candidates: LorebookNameCandidate[];
}
export interface AssetManagerTokenizeResultPayload extends AssetManagerStableIdPayload {
  proposals: AssetManagerTokenizeProposal[];
  prefixes: Array<{ value: string; count: number }>;
  suffixes: Array<{ value: string; count: number }>;
}
export interface AssetManagerImageMetaResultPayload extends AssetManagerStableIdPayload {
  path: string;
  meta: ImageMeta;
}
export interface AssetManagerOutputsResultPayload extends AssetManagerStableIdPayload {
  promptBlock?: string;
  whitelistRegex?: { inPattern: string; outPattern: string } | null;
  missingReport?: string;
  missingCombos?: MissingCombo[];
}
export interface AssetManagerOutputSavedPayload extends AssetManagerStableIdPayload {
  kind: AssetOutputKind;
  savedPath: string;
}
export interface AssetManagerManifestBuiltPayload extends AssetManagerStableIdPayload {
  total: number;
  named: number;
  unassigned: number;
  duplicates: DuplicateNameGroup[];
  orphanPaths: string[];
}
export interface AssetManagerErrorPayload {
  stableId: string;
  context: string;
  message: string;
}

export type AssetManagerAssetsLoadedMessage = AssetManagerEnvelope<'asset-manager/assetsLoaded', AssetManagerAssetsLoadedPayload>;
export type AssetManagerCatalogSavedMessage = AssetManagerEnvelope<'asset-manager/catalogSaved', AssetManagerCatalogSavedPayload>;
export type AssetManagerLorebookNamesResultMessage = AssetManagerEnvelope<'asset-manager/lorebookNamesResult', AssetManagerLorebookNamesResultPayload>;
export type AssetManagerTokenizeResultMessage = AssetManagerEnvelope<'asset-manager/tokenizeResult', AssetManagerTokenizeResultPayload>;
export type AssetManagerImageMetaResultMessage = AssetManagerEnvelope<'asset-manager/imageMetaResult', AssetManagerImageMetaResultPayload>;
export type AssetManagerOutputsResultMessage = AssetManagerEnvelope<'asset-manager/outputsResult', AssetManagerOutputsResultPayload>;
export type AssetManagerOutputSavedMessage = AssetManagerEnvelope<'asset-manager/outputSaved', AssetManagerOutputSavedPayload>;
export type AssetManagerManifestBuiltMessage = AssetManagerEnvelope<'asset-manager/manifestBuilt', AssetManagerManifestBuiltPayload>;
export type AssetManagerErrorMessage = AssetManagerEnvelope<'asset-manager/error', AssetManagerErrorPayload>;

export type AssetManagerExtensionMessage =
  | AssetManagerAssetsLoadedMessage
  | AssetManagerCatalogSavedMessage
  | AssetManagerLorebookNamesResultMessage
  | AssetManagerTokenizeResultMessage
  | AssetManagerImageMetaResultMessage
  | AssetManagerOutputsResultMessage
  | AssetManagerOutputSavedMessage
  | AssetManagerManifestBuiltMessage
  | AssetManagerErrorMessage;
```

주의: `MissingCombo`, `DuplicateNameGroup`이 core에서 export되는지 확인 (A3에서 export함). `ImageMeta`는 `risu-workbench-core/node` 서브패스에서 import — vscode의 기존 코드가 이 서브패스를 쓰는지 grep으로 확인하고(`grep -rn "risu-workbench-core/node" packages/vscode/src`), 안 쓰면 tsconfig paths 문제 여부를 빌드로 검증한다. 실패하면 `ImageMeta` 구조를 이 파일에 로컬 미러로 선언한다(동일 shape).

- [ ] **Step 2: guard/creator 파일 작성**

`packages/vscode/src/asset-manager/assetManagerMessages.ts`:

```typescript
/**
 * Asset Manager 메시지 guard/creator.
 * @file packages/vscode/src/asset-manager/assetManagerMessages.ts
 */

import { isPlainRecord, isProtocolEnvelope } from '../shared/protocolEnvelope';
import {
  ASSET_MANAGER_PROTOCOL,
  ASSET_MANAGER_PROTOCOL_VERSION,
  type AssetManagerExtensionMessage,
  type AssetManagerWebviewMessage,
} from './assetManagerTypes';

type PayloadValidator = (payload: unknown) => boolean;

const hasStableId: PayloadValidator = (payload) =>
  isPlainRecord(payload) && typeof payload.stableId === 'string' && payload.stableId.length > 0;

const isSlotValuesRecord = (value: unknown): boolean =>
  isPlainRecord(value) &&
  Object.entries(value).every(
    ([key, entry]) => ['s1', 's2', 's3'].includes(key) && typeof entry === 'string',
  );

const WEBVIEW_MESSAGE_VALIDATORS: Record<AssetManagerWebviewMessage['type'], PayloadValidator> = {
  'asset-manager/ready': (payload) => isPlainRecord(payload),
  'asset-manager/refreshAssets': hasStableId,
  'asset-manager/updateAssignments': (payload) =>
    hasStableId(payload) &&
    Array.isArray((payload as { changes?: unknown }).changes) &&
    (payload as { changes: unknown[] }).changes.every(
      (change) =>
        isPlainRecord(change) &&
        typeof change.path === 'string' &&
        change.path.length > 0 &&
        !change.path.split('/').some((segment) => !segment || segment === '.' || segment === '..') &&
        (change.slots === null || isSlotValuesRecord(change.slots)),
    ),
  'asset-manager/updateVocab': (payload) => hasStableId(payload) && isPlainRecord((payload as { vocab?: unknown }).vocab),
  'asset-manager/updateSchema': (payload) => hasStableId(payload) && isPlainRecord((payload as { schema?: unknown }).schema),
  'asset-manager/updateExpected': (payload) =>
    hasStableId(payload) && isPlainRecord((payload as { expected?: unknown }).expected),
  'asset-manager/analyzeLorebookNames': hasStableId,
  'asset-manager/bootstrapFromFilenames': hasStableId,
  'asset-manager/readImageMeta': (payload) =>
    hasStableId(payload) &&
    typeof (payload as { path?: unknown }).path === 'string' &&
    !(payload as { path: string }).path.split('/').some((segment) => !segment || segment === '.' || segment === '..'),
  'asset-manager/generateOutputs': (payload) =>
    hasStableId(payload) &&
    Array.isArray((payload as { kinds?: unknown }).kinds) &&
    (payload as { kinds: unknown[] }).kinds.every((kind) =>
      ['promptBlock', 'whitelistRegex', 'missingReport'].includes(kind as string),
    ),
  'asset-manager/saveOutput': (payload) =>
    hasStableId(payload) &&
    typeof (payload as { targetPath?: unknown }).targetPath === 'string' &&
    typeof (payload as { content?: unknown }).content === 'string' &&
    ['promptBlock', 'whitelistRegex', 'missingReport'].includes((payload as { kind?: unknown }).kind as string) &&
    !(payload as { targetPath: string }).targetPath.startsWith('/') &&
    !(payload as { targetPath: string }).targetPath
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..'),
  'asset-manager/buildManifest': hasStableId,
};

/**
 * isAssetManagerWebviewMessage 함수.
 * envelope + type별 payload를 검증함.
 */
export function isAssetManagerWebviewMessage(message: unknown): message is AssetManagerWebviewMessage {
  for (const [type, validate] of Object.entries(WEBVIEW_MESSAGE_VALIDATORS)) {
    if (
      isProtocolEnvelope(message, ASSET_MANAGER_PROTOCOL, ASSET_MANAGER_PROTOCOL_VERSION, type) &&
      validate(message.payload)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * createAssetManagerExtensionMessage 함수.
 * ext→webview 응답 메시지 envelope을 생성함.
 */
export function createAssetManagerExtensionMessage<TType extends AssetManagerExtensionMessage['type']>(
  type: TType,
  payload: Extract<AssetManagerExtensionMessage, { type: TType }>['payload'],
): Extract<AssetManagerExtensionMessage, { type: TType }> {
  return {
    protocol: ASSET_MANAGER_PROTOCOL,
    version: ASSET_MANAGER_PROTOCOL_VERSION,
    type,
    payload,
  } as Extract<AssetManagerExtensionMessage, { type: TType }>;
}
```

주의: `isProtocolEnvelope`의 시그니처를 `packages/vscode/src/shared/protocolEnvelope.ts`에서 확인하고 protocol 인자 타입이 리터럴 union으로 제한되어 있으면(기존 두 프로토콜만 허용) 해당 파일의 타입을 `string`으로 일반화하거나 오버로드를 추가한다 — 동작 변경 없는 타입 완화만 허용.

- [ ] **Step 3: boundary 테스트 작성 (guard 파트)**

`packages/vscode/tests/e2e/asset-manager-boundary.test.ts` — 기존 `main-editor-boundary.test.ts`의 dist require 패턴을 따른다:

```typescript
/**
 * Asset Manager 프로토콜/서비스 boundary 테스트.
 * @file packages/vscode/tests/e2e/asset-manager-boundary.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');

const messages = localRequire(
  path.join(vscodeDistRoot, 'asset-manager/assetManagerMessages.js'),
) as typeof import('../../src/asset-manager/assetManagerMessages');
const types = localRequire(
  path.join(vscodeDistRoot, 'asset-manager/assetManagerTypes.js'),
) as typeof import('../../src/asset-manager/assetManagerTypes');

function envelope(type: string, payload: unknown) {
  return { protocol: types.ASSET_MANAGER_PROTOCOL, version: types.ASSET_MANAGER_PROTOCOL_VERSION, type, payload };
}

test('accepts valid webview messages', () => {
  assert.equal(messages.isAssetManagerWebviewMessage(envelope('asset-manager/ready', {})), true);
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/updateAssignments', {
        stableId: 'abc',
        changes: [{ path: 'additional/a.webp', slots: { s1: 'Rin', s2: 'angry' } }],
      }),
    ),
    true,
  );
});

test('rejects traversal paths and wrong protocol', () => {
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/readImageMeta', { stableId: 'abc', path: '../escape.png' }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage({
      protocol: 'other',
      version: 1,
      type: 'asset-manager/ready',
      payload: {},
    }),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/saveOutput', {
        stableId: 'abc',
        kind: 'promptBlock',
        targetPath: '/etc/passwd',
        content: 'x',
      }),
    ),
    false,
  );
});
```

- [ ] **Step 4: 빌드 + 테스트 실행**

```bash
npm run build:core
npm --workspace risu-workbench-vscode run build:extension
npm --workspace risu-workbench-vscode run build:test:e2e
node --test packages/vscode/dist-tests/tests/e2e/asset-manager-boundary.test.js
```

Expected: 2 tests PASS. (`build:extension`은 webview 빌드 없이 tsc만 수행 — 타입/컴파일 검증에 충분)

- [ ] **Step 5: 커밋**

```bash
git add packages/vscode/src/asset-manager/assetManagerTypes.ts packages/vscode/src/asset-manager/assetManagerMessages.ts packages/vscode/tests/e2e/asset-manager-boundary.test.ts packages/vscode/src/shared/protocolEnvelope.ts
git commit -m "feat(asset-manager) : add webview protocol types and message guards"
```

---

### Task C2: AssetManagerService (vscode-free 서비스 레이어)

**Files:**
- Create: `packages/vscode/src/asset-manager/AssetManagerService.ts`
- Modify: `packages/vscode/tests/e2e/asset-manager-boundary.test.ts` (service 테스트 추가)

**Interfaces:**
- Consumes: core — `loadAssetCatalogFromAssetsDir`, `collectCharacterAssetEntries`, `buildCharacterAssetManifest` (B1, `risu-workbench-core/node`), `createDefaultAssetCatalog`, `serializeAssetCatalog`, `ASSET_CATALOG_FILENAME` (A1), `renderAssetName`, `tokenizeAssetFilename`, `bootstrapVocabCandidates`, `stripExtensionResidue` (A2), `findDuplicateNameGroups`, `listMissingCombos` (A3), `generatePromptBlock`, `generateWhitelistRegex`, `generateMissingReport` (A4), `extractLorebookNameCandidates` (A5), `readImageMeta` (A6)
- Produces (C3 Panel이 사용):
  - `class AssetManagerService { constructor(rootFsPath: string) }`
  - `scan(): AssetManagerScanSnapshot`
  - `applyAssignmentChanges(changes): AssetManagerScanSnapshot`
  - `updateVocab(vocab)` / `updateSchema(schema, outputs?)` / `updateExpected(expected)`: 각각 `AssetManagerScanSnapshot` 반환
  - `readMeta(relPath: string): ImageMeta` — traversal 방어 포함
  - `lorebookNames(): LorebookNameCandidate[]`
  - `tokenizeUnassigned(): { proposals; prefixes; suffixes }`
  - `generateOutputs(kinds): AssetManagerOutputsResultPayload용 부분 객체`
  - `saveOutput(targetPath, content): string` — 워크스페이스 상대경로 검증 후 절대경로 반환
  - `buildManifest(): AssetManifestBuildSummary`

**중요 설계 제약:** 이 파일은 `vscode` 모듈을 import하지 않는다 (node + core만). Panel(C3)이 URI/webview 변환을 담당한다. 그래야 `node --test` boundary 테스트가 가능하다.

- [ ] **Step 1: 구현**

`packages/vscode/src/asset-manager/AssetManagerService.ts`:

```typescript
/**
 * Asset Manager 서비스 레이어.
 * fs 스캔/카탈로그 IO/메타 파싱/파생 출력 — 전부 core 함수 조합이며 vscode API 비의존.
 * @file packages/vscode/src/asset-manager/AssetManagerService.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ASSET_CATALOG_FILENAME,
  bootstrapVocabCandidates,
  createDefaultAssetCatalog,
  extractLorebookNameCandidates,
  findDuplicateNameGroups,
  generateMissingReport,
  generatePromptBlock,
  generateWhitelistRegex,
  listMissingCombos,
  renderAssetName,
  serializeAssetCatalog,
  stripExtensionResidue,
  tokenizeAssetFilename,
  type AssetCatalog,
  type AssetCatalogOutputsConfig,
  type AssetCatalogSchema,
  type AssetExpectedMap,
  type LorebookNameCandidate,
  type MissingCombo,
} from 'risu-workbench-core';
import {
  buildCharacterAssetManifest,
  collectCharacterAssetEntries,
  loadAssetCatalogFromAssetsDir,
  readImageMeta,
  type AssetManifestBuildSummary,
  type ImageMeta,
} from 'risu-workbench-core/node';
import type {
  AssetManagerAssetEntry,
  AssetManagerAssignmentChange,
  AssetManagerScanSnapshot,
  AssetManagerTokenizeProposal,
  AssetOutputKind,
} from './assetManagerTypes';

function assertSafeRelativePath(relPath: string): void {
  if (
    !relPath ||
    relPath.startsWith('/') ||
    relPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`허용되지 않는 경로입니다: ${relPath}`);
  }
}

export interface AssetOutputsBundle {
  promptBlock?: string;
  whitelistRegex?: { inPattern: string; outPattern: string } | null;
  missingReport?: string;
  missingCombos?: MissingCombo[];
}

export class AssetManagerService {
  private readonly assetsDir: string;

  constructor(private readonly rootFsPath: string) {
    this.assetsDir = path.join(rootFsPath, 'assets');
  }

  private loadCatalog(): { catalog: AssetCatalog; exists: boolean } {
    const catalog = loadAssetCatalogFromAssetsDir(this.assetsDir);
    if (catalog) return { catalog, exists: true };
    const catalogPath = path.join(this.assetsDir, ASSET_CATALOG_FILENAME);
    if (fs.existsSync(catalogPath)) {
      // 파손된 catalog는 조용히 덮어쓰지 않고 백업 후 새로 시작 (스펙 §9)
      fs.renameSync(catalogPath, `${catalogPath}.bak-${Date.now()}`);
    }
    return { catalog: createDefaultAssetCatalog(), exists: false };
  }

  private saveCatalog(catalog: AssetCatalog): void {
    fs.mkdirSync(this.assetsDir, { recursive: true });
    fs.writeFileSync(path.join(this.assetsDir, ASSET_CATALOG_FILENAME), serializeAssetCatalog(catalog), 'utf-8');
  }

  /** 디스크 스캔 + catalog 결합 snapshot 생성. */
  scan(): AssetManagerScanSnapshot {
    const { catalog, exists } = this.loadCatalog();
    const rawEntries = collectCharacterAssetEntries(this.assetsDir, null);
    const duplicateGroups = findDuplicateNameGroups(catalog);
    const duplicatePaths = new Set(duplicateGroups.flatMap((group) => group.paths));
    const scannedPaths = new Set(rawEntries.map((entry) => entry.extracted_path));

    const entries: AssetManagerAssetEntry[] = rawEntries.map((entry) => {
      const assignment = catalog.assignments[entry.extracted_path] ?? null;
      const generatedName = assignment ? renderAssetName(catalog.schema, assignment) : null;
      const absolutePath = path.join(this.assetsDir, ...entry.extracted_path.split('/'));
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(absolutePath).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      return {
        path: entry.extracted_path,
        subdir: entry.subdir,
        ext: entry.ext,
        sizeBytes: entry.size_bytes,
        mtimeMs,
        fileStem: stripExtensionResidue(entry.name),
        assignment,
        generatedName,
        flags: {
          unassigned: generatedName === null,
          duplicate: duplicatePaths.has(entry.extracted_path),
        },
      };
    });

    return {
      entries,
      catalog,
      catalogExists: exists,
      orphanPaths: Object.keys(catalog.assignments)
        .filter((assignedPath) => !scannedPaths.has(assignedPath))
        .sort(),
      duplicateNames: duplicateGroups.map((group) => group.name),
    };
  }

  private mutateCatalog(mutate: (catalog: AssetCatalog) => void): AssetManagerScanSnapshot {
    const { catalog } = this.loadCatalog();
    mutate(catalog);
    this.saveCatalog(catalog);
    return this.scan();
  }

  applyAssignmentChanges(changes: AssetManagerAssignmentChange[]): AssetManagerScanSnapshot {
    for (const change of changes) assertSafeRelativePath(change.path);
    return this.mutateCatalog((catalog) => {
      for (const change of changes) {
        if (change.slots === null) delete catalog.assignments[change.path];
        else catalog.assignments[change.path] = change.slots;
      }
    });
  }

  updateVocab(vocab: AssetCatalog['vocab']): AssetManagerScanSnapshot {
    return this.mutateCatalog((catalog) => {
      catalog.vocab = vocab;
    });
  }

  updateSchema(schema: AssetCatalogSchema, outputs?: AssetCatalogOutputsConfig): AssetManagerScanSnapshot {
    return this.mutateCatalog((catalog) => {
      catalog.schema = schema;
      if (outputs) catalog.outputs = outputs;
      for (const slot of schema.slots) {
        if (!catalog.vocab[slot.id]) catalog.vocab[slot.id] = [];
      }
    });
  }

  updateExpected(expected: AssetExpectedMap): AssetManagerScanSnapshot {
    return this.mutateCatalog((catalog) => {
      catalog.expected = expected;
    });
  }

  readMeta(relPath: string): ImageMeta {
    assertSafeRelativePath(relPath);
    return readImageMeta(path.join(this.assetsDir, ...relPath.split('/')));
  }

  lorebookNames(): LorebookNameCandidate[] {
    return extractLorebookNameCandidates(this.rootFsPath);
  }

  tokenizeUnassigned(): {
    proposals: AssetManagerTokenizeProposal[];
    prefixes: Array<{ value: string; count: number }>;
    suffixes: Array<{ value: string; count: number }>;
  } {
    const snapshot = this.scan();
    const proposals: AssetManagerTokenizeProposal[] = [];
    for (const entry of snapshot.entries) {
      if (!entry.flags.unassigned) continue;
      const result = tokenizeAssetFilename(entry.fileStem, snapshot.catalog.schema, snapshot.catalog.vocab);
      proposals.push({ path: entry.path, slots: result.slots, matched: result.matched, residue: result.residue });
    }
    const clusters = bootstrapVocabCandidates(snapshot.entries.map((entry) => entry.fileStem));
    return { proposals, prefixes: clusters.prefixes, suffixes: clusters.suffixes };
  }

  generateOutputs(kinds: AssetOutputKind[]): AssetOutputsBundle {
    const { catalog } = this.loadCatalog();
    const result: AssetOutputsBundle = {};
    if (kinds.includes('promptBlock')) result.promptBlock = generatePromptBlock(catalog);
    if (kinds.includes('whitelistRegex')) result.whitelistRegex = generateWhitelistRegex(catalog);
    if (kinds.includes('missingReport')) {
      result.missingReport = generateMissingReport(catalog, 'markdown');
      result.missingCombos = listMissingCombos(catalog);
    }
    return result;
  }

  saveOutput(targetPath: string, content: string): string {
    assertSafeRelativePath(targetPath);
    const absolutePath = path.join(this.rootFsPath, ...targetPath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf-8');
    return absolutePath;
  }

  buildManifest(): AssetManifestBuildSummary {
    return buildCharacterAssetManifest({ rootDir: this.rootFsPath });
  }
}
```

- [ ] **Step 2: boundary 테스트에 service 케이스 추가**

`packages/vscode/tests/e2e/asset-manager-boundary.test.ts` 하단에 추가:

```typescript
const serviceModule = localRequire(
  path.join(vscodeDistRoot, 'asset-manager/AssetManagerService.js'),
) as typeof import('../../src/asset-manager/AssetManagerService');

test('service scans assets, applies assignments, persists catalog', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-service-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));

    const service = new serviceModule.AssetManagerService(workDir);
    const first = service.scan();
    assert.equal(first.catalogExists, false);
    assert.equal(first.entries.length, 1);
    assert.equal(first.entries[0].flags.unassigned, true);

    const updated = service.applyAssignmentChanges([
      { path: 'additional/rin_angry.png', slots: { s1: 'Rin', s2: 'angry' } },
    ]);
    assert.equal(updated.entries[0].generatedName, 'Rin_angry'); // 기본 스키마 {s1}_{s2}
    assert.equal(fs.existsSync(path.join(workDir, 'assets', 'asset-catalog.json')), true);

    // 재스캔에도 유지 (파일 기반 진실의 원천)
    const again = new serviceModule.AssetManagerService(workDir).scan();
    assert.equal(again.catalogExists, true);
    assert.equal(again.entries[0].generatedName, 'Rin_angry');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service rejects traversal paths', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-service-'));
  try {
    const service = new serviceModule.AssetManagerService(workDir);
    assert.throws(() => service.readMeta('../outside.png'));
    assert.throws(() => service.saveOutput('../escape.md', 'x'));
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: 빌드 + 테스트**

```bash
npm --workspace risu-workbench-vscode run build:extension
npm --workspace risu-workbench-vscode run build:test:e2e
node --test packages/vscode/dist-tests/tests/e2e/asset-manager-boundary.test.js
```

Expected: 4 tests PASS

- [ ] **Step 4: 커밋**

```bash
git add packages/vscode/src/asset-manager/AssetManagerService.ts packages/vscode/tests/e2e/asset-manager-boundary.test.ts
git commit -m "feat(asset-manager) : add vscode-free service layer over core asset functions"
```

---

### Task C3: AssetManagerPanel (WebviewPanel)

**Files:**
- Create: `packages/vscode/src/asset-manager/AssetManagerPanel.ts`

**Interfaces:**
- Consumes: `AssetManagerService` (C2), `isAssetManagerWebviewMessage`/`createAssetManagerExtensionMessage` (C1), `createWebviewNonce`(기존 `shared/webviewNonce`), `createWebviewDevServerHtml`/`getConfiguredWebviewDevServerUrl`/`getWebviewDevServerPortMapping`(기존 `views/webviewDevServer`)
- Produces (C4가 호출):
  - `AssetManagerPanel.createOrShow(context: vscode.ExtensionContext, target: { stableId: string; name: string; rootUri: string }): void` — stableId별 인스턴스 맵, 이미 열려 있으면 reveal

**핵심 요구 (스펙 §6.1, §8):**
- `retainContextWhenHidden: true`
- `localResourceRoots`: dist/webview + **workspace 폴더 전체** (이미지 직접 렌더용)
- prod HTML: `MainEditorProvider.getHtml`과 같은 방식으로 `<html>`에 `data-risuai-workbench-view="asset-manager"` 주입 + `<meta name="risuai-workbench-view" content="asset-manager" />` + CSP(`img-src ${webview.cspSource} data:` 포함) — `ArtifactBrowserViewProvider.getHtml`(`packages/vscode/src/views/ArtifactBrowserViewProvider.ts:742-779`)의 asset rewrite + nonce 로직을 복사하고 meta 주입만 추가
- dev HTML: `createWebviewDevServerHtml(devServerUrl, { title, viewName: 'asset-manager', webview })`
- ready 수신 → `assetsLoaded` 전송(핸드셰이크). webview는 ready를 500ms 간격 재전송하므로 첫 응답 후 재전송은 무해(멱등)

- [ ] **Step 1: 구현**

`packages/vscode/src/asset-manager/AssetManagerPanel.ts`:

```typescript
/**
 * Asset Manager WebviewPanel.
 * stableId별 단일 인스턴스로 메인 영역에 열리며, 메시지를 AssetManagerService에 위임함.
 * @file packages/vscode/src/asset-manager/AssetManagerPanel.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { createWebviewNonce } from '../shared/webviewNonce';
import {
  createWebviewDevServerHtml,
  getConfiguredWebviewDevServerUrl,
  getWebviewDevServerPortMapping,
} from '../views/webviewDevServer';
import { AssetManagerService } from './AssetManagerService';
import { createAssetManagerExtensionMessage, isAssetManagerWebviewMessage } from './assetManagerMessages';
import {
  ASSET_MANAGER_VIEW_NAME,
  type AssetManagerExtensionMessage,
  type AssetManagerWebviewMessage,
} from './assetManagerTypes';

export interface AssetManagerTarget {
  stableId: string;
  name: string;
  rootUri: string;
}

export class AssetManagerPanel {
  private static readonly panels = new Map<string, AssetManagerPanel>();

  static createOrShow(context: vscode.ExtensionContext, target: AssetManagerTarget): void {
    const existing = AssetManagerPanel.panels.get(target.stableId);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'risuaiWorkbench.assetManager',
      `Assets: ${target.name}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        portMapping: getWebviewDevServerPortMapping(),
      },
    );
    AssetManagerPanel.panels.set(target.stableId, new AssetManagerPanel(panel, context, target));
  }

  private readonly service: AssetManagerService;
  private readonly rootUri: vscode.Uri;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly target: AssetManagerTarget,
  ) {
    this.rootUri = vscode.Uri.parse(target.rootUri);
    this.service = new AssetManagerService(this.rootUri.fsPath);

    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
        ...(vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? []),
      ],
      portMapping: getWebviewDevServerPortMapping(),
    };
    this.panel.webview.html = this.getHtml(context.extensionUri, this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (!isAssetManagerWebviewMessage(message)) return;
        this.handleMessage(message);
      },
      null,
      context.subscriptions,
    );

    this.panel.onDidDispose(
      () => {
        AssetManagerPanel.panels.delete(this.target.stableId);
      },
      null,
      context.subscriptions,
    );
  }

  private post(message: AssetManagerExtensionMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private postError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.post(
      createAssetManagerExtensionMessage('asset-manager/error', {
        stableId: this.target.stableId,
        context,
        message,
      }),
    );
  }

  private assetsRootWebviewUri(): string {
    return this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.rootUri, 'assets')).toString();
  }

  private sendSnapshot(type: 'asset-manager/assetsLoaded' | 'asset-manager/catalogSaved'): void {
    const snapshot = this.service.scan();
    if (type === 'asset-manager/assetsLoaded') {
      this.post(
        createAssetManagerExtensionMessage('asset-manager/assetsLoaded', {
          ...snapshot,
          stableId: this.target.stableId,
          artifactName: this.target.name,
          assetsRootWebviewUri: this.assetsRootWebviewUri(),
        }),
      );
      return;
    }
    this.post(
      createAssetManagerExtensionMessage('asset-manager/catalogSaved', {
        ...snapshot,
        stableId: this.target.stableId,
      }),
    );
  }

  private handleMessage(message: AssetManagerWebviewMessage): void {
    const stableId = this.target.stableId;
    try {
      switch (message.type) {
        case 'asset-manager/ready':
        case 'asset-manager/refreshAssets':
          this.sendSnapshot('asset-manager/assetsLoaded');
          return;
        case 'asset-manager/updateAssignments':
          this.service.applyAssignmentChanges(message.payload.changes);
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/updateVocab':
          this.service.updateVocab(message.payload.vocab);
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/updateSchema':
          this.service.updateSchema(message.payload.schema, message.payload.outputs);
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/updateExpected':
          this.service.updateExpected(message.payload.expected);
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/analyzeLorebookNames':
          this.post(
            createAssetManagerExtensionMessage('asset-manager/lorebookNamesResult', {
              stableId,
              candidates: this.service.lorebookNames(),
            }),
          );
          return;
        case 'asset-manager/bootstrapFromFilenames':
          this.post(
            createAssetManagerExtensionMessage('asset-manager/tokenizeResult', {
              stableId,
              ...this.service.tokenizeUnassigned(),
            }),
          );
          return;
        case 'asset-manager/readImageMeta':
          this.post(
            createAssetManagerExtensionMessage('asset-manager/imageMetaResult', {
              stableId,
              path: message.payload.path,
              meta: this.service.readMeta(message.payload.path),
            }),
          );
          return;
        case 'asset-manager/generateOutputs':
          this.post(
            createAssetManagerExtensionMessage('asset-manager/outputsResult', {
              stableId,
              ...this.service.generateOutputs(message.payload.kinds),
            }),
          );
          return;
        case 'asset-manager/saveOutput': {
          const savedPath = this.service.saveOutput(message.payload.targetPath, message.payload.content);
          this.post(
            createAssetManagerExtensionMessage('asset-manager/outputSaved', {
              stableId,
              kind: message.payload.kind,
              savedPath,
            }),
          );
          return;
        }
        case 'asset-manager/buildManifest': {
          const summary = this.service.buildManifest();
          this.post(
            createAssetManagerExtensionMessage('asset-manager/manifestBuilt', {
              stableId,
              total: summary.total,
              named: summary.named,
              unassigned: summary.unassigned,
              duplicates: summary.duplicates,
              orphanPaths: summary.orphanPaths,
            }),
          );
          return;
        }
      }
    } catch (error) {
      this.postError(message.type, error);
    }
  }

  private getHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const devServerUrl = getConfiguredWebviewDevServerUrl();
    if (devServerUrl) {
      return createWebviewDevServerHtml(devServerUrl, {
        title: 'Risu Asset Manager',
        viewName: ASSET_MANAGER_VIEW_NAME,
        webview,
      });
    }

    const webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
    const htmlPath = path.join(webviewRoot.fsPath, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      return `<!doctype html><html lang="en"><body><p>Webview bundle is missing. Run the vscode package build.</p></body></html>`;
    }

    const nonce = createWebviewNonce();
    const html = fs.readFileSync(htmlPath, 'utf8');
    const assetHtml = html.replace(/(src|href)="(\.\/assets\/[^"]+)"/g, (_match, attr, assetPath) => {
      const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, assetPath.replace('./', '')));
      return `${attr}="${assetUri.toString()}"`;
    });
    const withNonce = assetHtml.replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`);
    const withView = withNonce
      .replace(/<html([^>]*)>/, (fullMatch, attrs: string) =>
        attrs.includes('data-risuai-workbench-view=')
          ? fullMatch
          : `<html${attrs} data-risuai-workbench-view="${ASSET_MANAGER_VIEW_NAME}">`,
      )
      .replace(
        '</head>',
        `    <meta name="risuai-workbench-view" content="${ASSET_MANAGER_VIEW_NAME}" />\n  </head>`,
      );

    return withView.replace(
      '</head>',
      `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />\n  </head>`,
    );
  }
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `npm --workspace risu-workbench-vscode run build:extension`
Expected: 성공 (Panel은 vscode API 의존이라 boundary 테스트 없음 — E1의 수동 스모크로 검증)

- [ ] **Step 3: 커밋**

```bash
git add packages/vscode/src/asset-manager/AssetManagerPanel.ts
git commit -m "feat(asset-manager) : add webview panel with per-stableId instances and view-name injection"
```

---

### Task C4: 사이드바 → Manager 진입 배선 (vscode side)

**Files:**
- Modify: `packages/vscode/src/artifact-browser/artifactBrowserTypes.ts`
- Modify: `packages/vscode/src/artifact-browser/artifactBrowserMessages.ts`
- Modify: `packages/vscode/src/artifact-browser/CharacterDetailScanner.ts`
- Modify: `packages/vscode/src/artifact-browser/ModuleDetailScanner.ts`
- Modify: `packages/vscode/src/views/ArtifactBrowserViewProvider.ts`

**Interfaces:**
- Consumes: `AssetManagerPanel.createOrShow` (C3)
- Produces (D1 webview가 보낼 메시지의 수신부):
  - `artifact-browser/openAssetManager` 메시지 (payload `{ stableId: string }`)
  - `BrowserSectionKind`에 `'assets'` 추가 — accordion 섹션 kind

- [ ] **Step 1: artifactBrowserTypes.ts 수정**

1. `CharacterSectionKind` 유니온에 `'assets'` 추가:

```typescript
export type CharacterSectionKind = 'manifest' | 'character' | 'lorebooks' | 'regexRules' | 'html' | 'lua' | 'assets' | 'diagnostics';
```

2. 메시지 타입 추가 (기존 `ArtifactBrowserSelectPayload` 근처):

```typescript
export interface ArtifactBrowserOpenAssetManagerPayload {
  stableId: string;
}

export type ArtifactBrowserOpenAssetManagerMessage = MessageEnvelope<
  'artifact-browser/openAssetManager',
  ArtifactBrowserOpenAssetManagerPayload
>;
```

3. 파일 안의 `ArtifactBrowserWebviewMessage` 유니온(웹뷰→ext 메시지 유니온)에 `ArtifactBrowserOpenAssetManagerMessage` 추가.

- [ ] **Step 2: artifactBrowserMessages.ts에 guard 추가**

`ArtifactBrowserInboundMessage` 유니온에 `ArtifactBrowserOpenAssetManagerMessage` 추가하고, 기존 select guard와 동일 패턴으로:

```typescript
const isArtifactBrowserOpenAssetManagerMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserOpenAssetManagerMessage>(
    'artifact-browser/openAssetManager',
    isArtifactBrowserSelectPayload as ArtifactBrowserPayloadGuard<ArtifactBrowserOpenAssetManagerPayload>,
  );

export function isArtifactBrowserOpenAssetManagerMessage(
  message: unknown,
): message is ArtifactBrowserOpenAssetManagerMessage {
  return isArtifactBrowserOpenAssetManagerMessageEnvelope(message);
}
```

(payload shape가 select와 동일한 `{ stableId }`이므로 재사용. import 목록에 신규 타입 추가.)

- [ ] **Step 3: 스캐너에 assets 섹션 추가 (카운트 전용)**

`CharacterDetailScanner.ts`:

1. `SECTION_ORDER`에 `'assets'`를 `'variables'` 다음, `'diagnostics'` 앞에 추가.
2. `SCAN_DIRECTORIES`에 `'assets'` 추가.
3. `createCharacterSectionDrafts()`에 `assets: createSection('assets', 'Assets', 'assets'),` 추가.
4. `classifyFile`에 `if (isUnderDirectory(lowerPath, 'assets')) return 'assets';` 추가 (다른 분기보다 아래 아무 곳).
5. `scan()`을 카운트 전용으로 후처리 (스펙 §8 — detailLoaded에 3,000개 item을 싣지 않음):

```typescript
  async scan(card: CharacterBrowserCard): Promise<CharacterSection[]> {
    const sections = (await scanner.scan(card)) as CharacterSection[];
    return sections.map((section) =>
      section.kind === 'assets' ? { ...section, count: section.count ?? section.items.length, items: [] } : section,
    );
  }
```

(주의: `BrowserSection.count`가 GenericDetailScanner에서 어떻게 세팅되는지 `shared/detailScanner.ts`에서 확인 — items 길이로 세팅된다면 위처럼 items 비우기 전에 보존. `manifest.json`/`asset-catalog.json`은 assets 디렉토리 스캔에 포함되어 카운트에 +2 될 수 있으므로, 필요하면 classifyFile에서 `assets/manifest.json`·`assets/asset-catalog.json`을 undefined로 제외한다:)

```typescript
  if (lowerPath === 'assets/manifest.json' || lowerPath === 'assets/asset-catalog.json') return undefined;
```

`ModuleDetailScanner.ts`도 동일 패턴 적용 (SECTION_ORDER/SCAN_DIRECTORIES/드래프트/classifyFile/scan 후처리 — 파일 구조가 CharacterDetailScanner와 동일한 GenericDetailScanner 래퍼이므로 같은 5개 지점을 수정).

- [ ] **Step 4: ViewProvider 핸들러 추가**

`ArtifactBrowserViewProvider.ts`:

1. import 추가:

```typescript
import { AssetManagerPanel } from '../asset-manager/AssetManagerPanel';
import { isArtifactBrowserOpenAssetManagerMessage } from '../artifact-browser/artifactBrowserMessages';
```

(기존 import 블록 형식에 맞춰 — artifactBrowserMessages는 이미 import 중이므로 해당 구문에 guard만 추가.)

2. `onDidReceiveMessage` 체인의 `isArtifactBrowserSelectMessage` 분기 앞에 추가:

```typescript
        if (isArtifactBrowserOpenAssetManagerMessage(message)) {
          const card = this.currentCards.find((entry) => entry.stableId === message.payload.stableId);
          if (card) {
            AssetManagerPanel.createOrShow(this.context, {
              stableId: card.stableId,
              name: card.name,
              rootUri: card.rootUri,
            });
          }
          return;
        }
```

(주의: `this.currentCards`와 `this.context`는 기존 packArtifact 핸들러가 쓰는 필드 — 이름이 다르면 그 파일의 실제 필드명을 따른다.)

- [ ] **Step 5: 빌드 + 기존 boundary 테스트 회귀**

```bash
npm --workspace risu-workbench-vscode run build:extension
npm --workspace risu-workbench-vscode run build:test:e2e
node --test packages/vscode/dist-tests/tests/e2e/*.test.js
```

Expected: 전체 PASS (기존 boundary 테스트 포함)

- [ ] **Step 6: 커밋**

```bash
git add packages/vscode/src/artifact-browser/ packages/vscode/src/views/ArtifactBrowserViewProvider.ts
git commit -m "feat(artifact-browser) : add assets section and openAssetManager bridge to panel"
```

---

### Task D1: 사이드바 → Manager 진입 배선 (webview side)

**Files:**
- Modify: `packages/webview/src/lib/types.ts`
- Modify: `packages/webview/src/lib/vscode.ts`
- Modify: `packages/webview/src/lib/components/sidebar/WorkbenchAccordions.svelte`
- Modify: `packages/webview/src/lib/components/ArtifactDetailView.svelte`
- Modify: `packages/webview/src/App.svelte`
- Modify: `packages/webview/src/main.ts`
- Test: `packages/webview/tests/lib/components/assetsSectionSource.test.ts`

**Interfaces:**
- Consumes: C4가 수신하는 `artifact-browser/openAssetManager` 메시지 계약
- Produces: 아코디언 `assets` 섹션 = 카운트 + "Open Asset Manager" 버튼만 (스펙 결정 #1)

- [ ] **Step 1: 실패하는 소스 테스트 작성**

`packages/webview/tests/lib/components/assetsSectionSource.test.ts` (기존 `WorkbenchAccordionsSource.test.ts`와 같은 소스 검증 방식):

```typescript
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const componentPath = path.resolve(
  __dirname,
  '../../../src/lib/components/sidebar/WorkbenchAccordions.svelte',
);

describe('WorkbenchAccordions assets section', () => {
  it('renders an entry button instead of item list for assets sections', () => {
    const source = fs.readFileSync(componentPath, 'utf-8');
    expect(source).toContain("section.kind === 'assets'");
    expect(source).toContain('Open Asset Manager');
    expect(source).toContain('onOpenAssetManager');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm --workspace risu-workbench-webview run test -- tests/lib/components/assetsSectionSource.test.ts`
Expected: FAIL — 소스에 해당 문자열 없음

- [ ] **Step 3: webview types.ts 수정**

`packages/webview/src/lib/types.ts`에서 (vscode 측 C4와 동일 계약의 웹뷰 미러):

1. `CharacterSectionKind` 유니온에 `'assets'` 추가 (C4 Step 1과 동일 형태).
2. artifact browser 메시지 타입들 근처에 추가:

```typescript
export interface ArtifactBrowserOpenAssetManagerPayload {
  stableId: string;
}

export type ArtifactBrowserOpenAssetManagerMessage = MessageEnvelope<
  'artifact-browser/openAssetManager',
  ArtifactBrowserOpenAssetManagerPayload
>;
```

3. `ArtifactBrowserWebviewMessage` 유니온에 `ArtifactBrowserOpenAssetManagerMessage` 추가.

- [ ] **Step 4: vscode.ts에 creator 추가**

`packages/webview/src/lib/vscode.ts` — 기존 `createArtifactBrowserSelectMessage` 아래에:

```typescript
/**
 * createArtifactBrowserOpenAssetManagerMessage 함수.
 * Assets 아코디언의 진입 버튼이 Asset Manager 패널 오픈을 요청하는 메시지를 생성함.
 *
 * @param stableId - 대상 artifact stable id
 * @returns Artifact Browser openAssetManager message
 */
export function createArtifactBrowserOpenAssetManagerMessage(
  stableId: string,
): ArtifactBrowserOpenAssetManagerMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/openAssetManager', {
    stableId,
  });
}
```

import 목록에 `ArtifactBrowserOpenAssetManagerMessage` 타입 추가.

- [ ] **Step 5: WorkbenchAccordions.svelte 수정**

1. props에 추가:

```typescript
  export let onOpenAssetManager: () => void;
```

2. 패널 렌더 분기 — `{:else if section.items.length === 0}` **앞에** 추가:

```svelte
          {:else if section.kind === 'assets'}
            <div class="assets-entry">
              <p class="assets-entry__summary">{section.count} asset files</p>
              <button type="button" class="assets-entry__open" onclick={() => onOpenAssetManager()}>
                Open Asset Manager ↗
              </button>
            </div>
```

3. 파일 하단에 스타일 블록 추가 (기존에 `<style>`이 없으므로 신규):

```svelte
<style>
  .assets-entry {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
  }

  .assets-entry__summary {
    margin: 0;
    color: var(--secondary-text);
    font-size: var(--text-sm);
  }

  .assets-entry__open {
    align-self: flex-start;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }
</style>
```

- [ ] **Step 6: ArtifactDetailView / App.svelte / main.ts 배선**

`ArtifactDetailView.svelte`:

```typescript
  export let onOpenAssetManager: (stableId: string) => void;
```

`<CharacterAccordion ... />`에 `onOpenAssetManager={() => onOpenAssetManager(artifact.stableId)}` 추가.

`App.svelte`:

```typescript
// From main.ts: openAssetManager() -> ArtifactDetailView.onOpenAssetManager.
export let openAssetManager: (stableId: string) => void;
```

`<ArtifactDetailView ... />`에 `onOpenAssetManager={openAssetManager}` 추가.

`main.ts`:

1. `expandedSectionIds` 초기값 배열에 `'assets'` 추가 (`'variables'` 다음).
2. 핸들러 함수 추가 (기존 `selectCard` 등과 같은 구역):

```typescript
/**
 * openAssetManager 함수.
 * Assets 아코디언 진입 버튼 → extension host에 Asset Manager 패널 오픈을 요청함.
 */
function openAssetManager(stableId: string): void {
  vscode?.postMessage(createArtifactBrowserOpenAssetManagerMessage(stableId));
}
```

3. `mount(App, { props: { ... } })`에 `openAssetManager,` 추가.
4. import에 `createArtifactBrowserOpenAssetManagerMessage` 추가.

- [ ] **Step 7: 테스트 + 빌드 확인**

```bash
npm --workspace risu-workbench-webview run test -- tests/lib/components/assetsSectionSource.test.ts
npm --workspace risu-workbench-webview run check
npm --workspace risu-workbench-webview run build
```

Expected: 테스트 PASS, svelte-check/빌드 성공

- [ ] **Step 8: 커밋**

```bash
git add packages/webview/src/lib/types.ts packages/webview/src/lib/vscode.ts packages/webview/src/lib/components/sidebar/WorkbenchAccordions.svelte packages/webview/src/lib/components/ArtifactDetailView.svelte packages/webview/src/App.svelte packages/webview/src/main.ts packages/webview/tests/lib/components/assetsSectionSource.test.ts
git commit -m "feat(sidebar) : add assets accordion entry button opening asset manager"
```

---

### Task D2: webview 프로토콜 미러 + 순수 로직 모듈

**Files:**
- Create: `packages/webview/src/lib/types/assetManager.ts`
- Create: `packages/webview/src/lib/asset-manager/naming.ts`
- Create: `packages/webview/src/lib/asset-manager/gridModel.ts`
- Test: `packages/webview/tests/lib/asset-manager/naming.test.ts`
- Test: `packages/webview/tests/lib/asset-manager/gridModel.test.ts`

**Interfaces:**
- Consumes: C1의 프로토콜 계약 (구조 미러 — webview는 core/vscode 패키지를 import하지 않는 기존 관례)
- Produces (D3~D5가 사용):
  - `types/assetManager.ts`: `ASSET_MANAGER_PROTOCOL`/`_VERSION`, `AssetCatalogMirror`(= core AssetCatalog 구조 미러), `AssetManagerAssetEntry`, payload 타입들, `createAssetManagerWebviewMessage(type, payload)`, `isAssetManagerExtensionMessage(message)`
  - `naming.ts`: `renderNamePreview(schema, slots): string | null`, `labelTemplate(schema): string`
  - `gridModel.ts`:
    - `filterAssetEntries(entries, filter: { subdir: string | 'all'; query: string; onlyUnassigned: boolean; onlyDuplicate: boolean }): AssetManagerAssetEntry[]`
    - `sortAssetEntries(entries, sortKey: 'name' | 'size' | 'mtime'): AssetManagerAssetEntry[]`
    - `computeVirtualWindow(options: { scrollTop; viewportHeight; tileSize; gap; columns; totalItems; overscanRows }): { startIndex; endIndex; topPadding; bottomPadding; totalHeight }`
    - `applyTileSelection(orderedPaths: string[], selected: Set<string>, anchorPath: string | null, targetPath: string, mode: 'single' | 'toggle' | 'range'): { selected: Set<string>; anchorPath: string }`
    - `expectedListForClient(catalog, s1Value, slotId): string[]`
    - `computeMissingMatrixClient(catalog, s1?: string)` — core `computeMissingMatrix`와 동일 결과 구조(`rows/cols/cells{state,count,paths}`)

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/webview/tests/lib/asset-manager/naming.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { labelTemplate, renderNamePreview } from '../../../src/lib/asset-manager/naming';

const SCHEMA = {
  slots: [
    { id: 's1' as const, label: 'character' },
    { id: 's2' as const, label: 'emotion' },
  ],
  joinTemplate: '{s1}_{s2}',
};

describe('asset-manager naming mirror', () => {
  it('renders preview names and null on missing slot', () => {
    expect(renderNamePreview(SCHEMA, { s1: 'Rin', s2: 'angry' })).toBe('Rin_angry');
    expect(renderNamePreview(SCHEMA, { s1: 'Rin' })).toBeNull();
  });
  it('renders label template for prompt/format display', () => {
    expect(labelTemplate(SCHEMA)).toBe('{character}_{emotion}');
  });
});
```

`packages/webview/tests/lib/asset-manager/gridModel.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { AssetManagerAssetEntry } from '../../../src/lib/types/assetManager';
import {
  applyTileSelection,
  computeMissingMatrixClient,
  computeVirtualWindow,
  filterAssetEntries,
  sortAssetEntries,
} from '../../../src/lib/asset-manager/gridModel';

function entry(partial: Partial<AssetManagerAssetEntry> & { path: string }): AssetManagerAssetEntry {
  return {
    subdir: 'additional',
    ext: 'webp',
    sizeBytes: 100,
    mtimeMs: 0,
    fileStem: partial.path.split('/').pop() ?? '',
    assignment: null,
    generatedName: null,
    flags: { unassigned: true, duplicate: false },
    ...partial,
  };
}

describe('filter/sort', () => {
  const entries = [
    entry({ path: 'additional/b_sad.webp', generatedName: 'B sad', flags: { unassigned: false, duplicate: false } }),
    entry({ path: 'additional/a_angry.webp', sizeBytes: 300 }),
    entry({ path: 'icons/main.png', subdir: 'icons' }),
  ];

  it('filters by subdir, query and flags', () => {
    expect(filterAssetEntries(entries, { subdir: 'additional', query: '', onlyUnassigned: false, onlyDuplicate: false })).toHaveLength(2);
    expect(filterAssetEntries(entries, { subdir: 'all', query: 'sad', onlyUnassigned: false, onlyDuplicate: false })).toHaveLength(1);
    expect(filterAssetEntries(entries, { subdir: 'all', query: '', onlyUnassigned: true, onlyDuplicate: false })).toHaveLength(2);
  });

  it('sorts by size descending on size key', () => {
    const sorted = sortAssetEntries(entries, 'size');
    expect(sorted[0].sizeBytes).toBe(300);
  });
});

describe('computeVirtualWindow', () => {
  it('windows rows with overscan and padding', () => {
    const window = computeVirtualWindow({
      scrollTop: 1000,
      viewportHeight: 600,
      tileSize: 180,
      gap: 8,
      columns: 5,
      totalItems: 3000,
      overscanRows: 2,
    });
    const rowHeight = 188;
    expect(window.startIndex).toBe((Math.floor(1000 / rowHeight) - 2) * 5);
    expect(window.endIndex).toBeGreaterThan(window.startIndex);
    expect(window.topPadding + window.bottomPadding + Math.ceil((window.endIndex - window.startIndex) / 5) * rowHeight).toBe(window.totalHeight);
  });

  it('clamps at boundaries', () => {
    const window = computeVirtualWindow({
      scrollTop: 0,
      viewportHeight: 600,
      tileSize: 180,
      gap: 8,
      columns: 4,
      totalItems: 10,
      overscanRows: 3,
    });
    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(10);
  });
});

describe('applyTileSelection', () => {
  const paths = ['a', 'b', 'c', 'd'];
  it('supports single/toggle/range', () => {
    let state = applyTileSelection(paths, new Set(), null, 'b', 'single');
    expect([...state.selected]).toEqual(['b']);
    state = applyTileSelection(paths, state.selected, state.anchorPath, 'd', 'range');
    expect([...state.selected].sort()).toEqual(['b', 'c', 'd']);
    state = applyTileSelection(paths, state.selected, state.anchorPath, 'c', 'toggle');
    expect(state.selected.has('c')).toBe(false);
  });
});

describe('computeMissingMatrixClient', () => {
  it('mirrors core 2-slot semantics (duplicate/missing/excluded)', () => {
    const catalog = {
      version: 1 as const,
      schema: {
        slots: [
          { id: 's1' as const, label: 'character' },
          { id: 's2' as const, label: 'emotion' },
        ],
        joinTemplate: '{s1} {s2}',
      },
      vocab: { s1: ['Rin', 'Yua'], s2: ['angry', 'sad'] },
      expected: { Yua: { s2: ['angry'] } },
      assignments: {
        'additional/rin_angry.png': { s1: 'Rin', s2: 'angry' },
        'additional/rin_angry2.png': { s1: 'Rin', s2: 'angry' },
      },
    };
    const matrix = computeMissingMatrixClient(catalog);
    expect(matrix?.cells[0][0].state).toBe('duplicate');
    expect(matrix?.cells[0][1].state).toBe('missing');
    expect(matrix?.cells[1][1].state).toBe('excluded');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm --workspace risu-workbench-webview run test -- tests/lib/asset-manager/`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: types/assetManager.ts 작성**

`packages/webview/src/lib/types/assetManager.ts` — C1 계약의 구조 미러 (core import 없이):

```typescript
/**
 * Asset Manager webview측 프로토콜 미러.
 * vscode측 원본: packages/vscode/src/asset-manager/assetManagerTypes.ts — 두 파일은 항상 함께 수정한다.
 * @file packages/webview/src/lib/types/assetManager.ts
 */

export const ASSET_MANAGER_PROTOCOL = 'risu-workbench.asset-manager';
export const ASSET_MANAGER_PROTOCOL_VERSION = 1;

export type AssetSlotId = 's1' | 's2' | 's3';
export type AssetSlotValues = Partial<Record<AssetSlotId, string>>;

export interface AssetSlotDefinition {
  id: AssetSlotId;
  label: string;
}

export interface AssetCatalogSchemaMirror {
  slots: AssetSlotDefinition[];
  joinTemplate: string;
}

export type AssetExpectedMapMirror = Record<string, Partial<Record<'s2' | 's3', string[] | null>>>;

export interface AssetCatalogOutputsMirror {
  tagFormat: { prefix: string; suffix: string };
  fallbackTemplate: string;
}

export interface AssetCatalogMirror {
  version: 1;
  schema: AssetCatalogSchemaMirror;
  vocab: Partial<Record<AssetSlotId, string[]>>;
  expected: AssetExpectedMapMirror;
  assignments: Record<string, AssetSlotValues>;
  outputs?: AssetCatalogOutputsMirror;
}

export interface AssetManagerAssetEntry {
  path: string;
  subdir: string;
  ext: string;
  sizeBytes: number;
  mtimeMs: number;
  fileStem: string;
  assignment: AssetSlotValues | null;
  generatedName: string | null;
  flags: { unassigned: boolean; duplicate: boolean };
}

export type AssetOutputKind = 'promptBlock' | 'whitelistRegex' | 'missingReport';

export interface AssetManagerAssignmentChange {
  path: string;
  slots: AssetSlotValues | null;
}

export interface AssetManagerTokenizeProposal {
  path: string;
  slots: AssetSlotValues;
  matched: boolean;
  residue: string;
}

export interface LorebookNameCandidateMirror {
  name: string;
  filePath: string;
  folderPath: string;
}

export interface ImageMetaMirror {
  info: { width: number | null; height: number | null; format: string; sizeBytes: number };
  generation: { source: string; fields: Record<string, string> } | null;
}

export interface AssetManagerScanSnapshot {
  entries: AssetManagerAssetEntry[];
  catalog: AssetCatalogMirror;
  catalogExists: boolean;
  orphanPaths: string[];
  duplicateNames: string[];
}

export interface AssetManagerEnvelope<TType extends string, TPayload> {
  protocol: typeof ASSET_MANAGER_PROTOCOL;
  version: typeof ASSET_MANAGER_PROTOCOL_VERSION;
  type: TType;
  payload: TPayload;
}

// webview → extension
export type AssetManagerWebviewMessage =
  | AssetManagerEnvelope<'asset-manager/ready', Record<string, never>>
  | AssetManagerEnvelope<'asset-manager/refreshAssets', { stableId: string }>
  | AssetManagerEnvelope<'asset-manager/updateAssignments', { stableId: string; changes: AssetManagerAssignmentChange[] }>
  | AssetManagerEnvelope<'asset-manager/updateVocab', { stableId: string; vocab: AssetCatalogMirror['vocab'] }>
  | AssetManagerEnvelope<
      'asset-manager/updateSchema',
      { stableId: string; schema: AssetCatalogSchemaMirror; outputs?: AssetCatalogOutputsMirror }
    >
  | AssetManagerEnvelope<'asset-manager/updateExpected', { stableId: string; expected: AssetExpectedMapMirror }>
  | AssetManagerEnvelope<'asset-manager/analyzeLorebookNames', { stableId: string }>
  | AssetManagerEnvelope<'asset-manager/bootstrapFromFilenames', { stableId: string }>
  | AssetManagerEnvelope<'asset-manager/readImageMeta', { stableId: string; path: string }>
  | AssetManagerEnvelope<'asset-manager/generateOutputs', { stableId: string; kinds: AssetOutputKind[] }>
  | AssetManagerEnvelope<
      'asset-manager/saveOutput',
      { stableId: string; kind: AssetOutputKind; targetPath: string; content: string }
    >
  | AssetManagerEnvelope<'asset-manager/buildManifest', { stableId: string }>;

// extension → webview
export interface AssetManagerAssetsLoadedPayload extends AssetManagerScanSnapshot {
  stableId: string;
  artifactName: string;
  assetsRootWebviewUri: string;
}
export interface AssetManagerCatalogSavedPayload extends AssetManagerScanSnapshot {
  stableId: string;
}

export type AssetManagerExtensionMessage =
  | AssetManagerEnvelope<'asset-manager/assetsLoaded', AssetManagerAssetsLoadedPayload>
  | AssetManagerEnvelope<'asset-manager/catalogSaved', AssetManagerCatalogSavedPayload>
  | AssetManagerEnvelope<
      'asset-manager/lorebookNamesResult',
      { stableId: string; candidates: LorebookNameCandidateMirror[] }
    >
  | AssetManagerEnvelope<
      'asset-manager/tokenizeResult',
      {
        stableId: string;
        proposals: AssetManagerTokenizeProposal[];
        prefixes: Array<{ value: string; count: number }>;
        suffixes: Array<{ value: string; count: number }>;
      }
    >
  | AssetManagerEnvelope<'asset-manager/imageMetaResult', { stableId: string; path: string; meta: ImageMetaMirror }>
  | AssetManagerEnvelope<
      'asset-manager/outputsResult',
      {
        stableId: string;
        promptBlock?: string;
        whitelistRegex?: { inPattern: string; outPattern: string } | null;
        missingReport?: string;
        missingCombos?: Array<{ slots: AssetSlotValues; name: string | null }>;
      }
    >
  | AssetManagerEnvelope<
      'asset-manager/outputSaved',
      { stableId: string; kind: AssetOutputKind; savedPath: string }
    >
  | AssetManagerEnvelope<
      'asset-manager/manifestBuilt',
      {
        stableId: string;
        total: number;
        named: number;
        unassigned: number;
        duplicates: Array<{ name: string; paths: string[] }>;
        orphanPaths: string[];
      }
    >
  | AssetManagerEnvelope<'asset-manager/error', { stableId: string; context: string; message: string }>;

const EXTENSION_MESSAGE_TYPES = new Set<AssetManagerExtensionMessage['type']>([
  'asset-manager/assetsLoaded',
  'asset-manager/catalogSaved',
  'asset-manager/lorebookNamesResult',
  'asset-manager/tokenizeResult',
  'asset-manager/imageMetaResult',
  'asset-manager/outputsResult',
  'asset-manager/outputSaved',
  'asset-manager/manifestBuilt',
  'asset-manager/error',
]);

/**
 * createAssetManagerWebviewMessage 함수.
 * webview→extension envelope을 생성함.
 */
export function createAssetManagerWebviewMessage<TType extends AssetManagerWebviewMessage['type']>(
  type: TType,
  payload: Extract<AssetManagerWebviewMessage, { type: TType }>['payload'],
): Extract<AssetManagerWebviewMessage, { type: TType }> {
  return {
    protocol: ASSET_MANAGER_PROTOCOL,
    version: ASSET_MANAGER_PROTOCOL_VERSION,
    type,
    payload,
  } as Extract<AssetManagerWebviewMessage, { type: TType }>;
}

/**
 * isAssetManagerExtensionMessage 함수.
 * extension→webview 메시지 envelope을 판별함 (payload 상세 검증은 컴포넌트 계층에서 신뢰).
 */
export function isAssetManagerExtensionMessage(message: unknown): message is AssetManagerExtensionMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as { protocol?: unknown; version?: unknown; type?: unknown; payload?: unknown };
  return (
    candidate.protocol === ASSET_MANAGER_PROTOCOL &&
    candidate.version === ASSET_MANAGER_PROTOCOL_VERSION &&
    typeof candidate.type === 'string' &&
    EXTENSION_MESSAGE_TYPES.has(candidate.type as AssetManagerExtensionMessage['type']) &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null
  );
}
```

- [ ] **Step 4: naming.ts / gridModel.ts 작성**

`packages/webview/src/lib/asset-manager/naming.ts`:

```typescript
/**
 * name 프리뷰 렌더 (core naming.ts의 경량 미러 — 스키마 편집 라이브 프리뷰 전용).
 * @file packages/webview/src/lib/asset-manager/naming.ts
 */

import type { AssetCatalogSchemaMirror, AssetSlotId, AssetSlotValues } from '../types/assetManager';

const SLOT_PLACEHOLDER = /\{(s[123])\}/g;

export function renderNamePreview(schema: AssetCatalogSchemaMirror, slots: AssetSlotValues): string | null {
  for (const slot of schema.slots) {
    const value = slots[slot.id];
    if (!value || !value.trim()) return null;
  }
  return schema.joinTemplate.replace(SLOT_PLACEHOLDER, (_match, slotId: AssetSlotId) => slots[slotId] ?? '');
}

export function labelTemplate(schema: AssetCatalogSchemaMirror): string {
  return schema.joinTemplate.replace(SLOT_PLACEHOLDER, (_match, slotId: AssetSlotId) => {
    const slot = schema.slots.find((entry) => entry.id === slotId);
    return `{${slot?.label ?? slotId}}`;
  });
}
```

`packages/webview/src/lib/asset-manager/gridModel.ts`:

```typescript
/**
 * Asset Manager 그리드/매트릭스 순수 로직.
 * 필터·정렬·가상 스크롤 창 계산·선택 모델과 missing 매트릭스 클라이언트 미러.
 * @file packages/webview/src/lib/asset-manager/gridModel.ts
 */

import type { AssetCatalogMirror, AssetManagerAssetEntry, AssetSlotId } from '../types/assetManager';

export interface AssetGridFilter {
  subdir: string | 'all';
  query: string;
  onlyUnassigned: boolean;
  onlyDuplicate: boolean;
}

export function filterAssetEntries(
  entries: AssetManagerAssetEntry[],
  filter: AssetGridFilter,
): AssetManagerAssetEntry[] {
  const query = filter.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.subdir !== 'all' && entry.subdir !== filter.subdir) return false;
    if (filter.onlyUnassigned && !entry.flags.unassigned) return false;
    if (filter.onlyDuplicate && !entry.flags.duplicate) return false;
    if (!query) return true;
    const haystack = [
      entry.path,
      entry.fileStem,
      entry.generatedName ?? '',
      ...Object.values(entry.assignment ?? {}),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function sortAssetEntries(
  entries: AssetManagerAssetEntry[],
  sortKey: 'name' | 'size' | 'mtime',
): AssetManagerAssetEntry[] {
  const sorted = [...entries];
  if (sortKey === 'size') sorted.sort((left, right) => right.sizeBytes - left.sizeBytes);
  else if (sortKey === 'mtime') sorted.sort((left, right) => right.mtimeMs - left.mtimeMs);
  else sorted.sort((left, right) => (left.generatedName ?? left.fileStem).localeCompare(right.generatedName ?? right.fileStem));
  return sorted;
}

export interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  topPadding: number;
  bottomPadding: number;
  totalHeight: number;
}

export function computeVirtualWindow(options: {
  scrollTop: number;
  viewportHeight: number;
  tileSize: number;
  gap: number;
  columns: number;
  totalItems: number;
  overscanRows: number;
}): VirtualWindow {
  const columns = Math.max(1, options.columns);
  const rowHeight = options.tileSize + options.gap;
  const totalRows = Math.ceil(options.totalItems / columns);
  const totalHeight = totalRows * rowHeight;
  const firstVisibleRow = Math.floor(options.scrollTop / rowHeight);
  const visibleRows = Math.ceil(options.viewportHeight / rowHeight) + 1;
  const startRow = Math.max(0, firstVisibleRow - options.overscanRows);
  const endRow = Math.min(totalRows, firstVisibleRow + visibleRows + options.overscanRows);
  return {
    startIndex: startRow * columns,
    endIndex: Math.min(options.totalItems, endRow * columns),
    topPadding: startRow * rowHeight,
    bottomPadding: (totalRows - endRow) * rowHeight,
    totalHeight,
  };
}

export function applyTileSelection(
  orderedPaths: string[],
  selected: Set<string>,
  anchorPath: string | null,
  targetPath: string,
  mode: 'single' | 'toggle' | 'range',
): { selected: Set<string>; anchorPath: string } {
  if (mode === 'toggle') {
    const next = new Set(selected);
    if (next.has(targetPath)) next.delete(targetPath);
    else next.add(targetPath);
    return { selected: next, anchorPath: targetPath };
  }
  if (mode === 'range' && anchorPath) {
    const anchorIndex = orderedPaths.indexOf(anchorPath);
    const targetIndex = orderedPaths.indexOf(targetPath);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const [from, to] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      const next = new Set(selected);
      for (let index = from; index <= to; index += 1) next.add(orderedPaths[index]);
      return { selected: next, anchorPath };
    }
  }
  return { selected: new Set([targetPath]), anchorPath: targetPath };
}

// ---- missing 매트릭스 클라이언트 미러 (core domain/asset/missing.ts와 동일 의미) ----

export type MissingCellState = 'present' | 'duplicate' | 'missing' | 'excluded';

export interface MissingCellClient {
  row: string;
  col: string;
  state: MissingCellState;
  count: number;
  paths: string[];
}

export interface MissingMatrixClient {
  rows: string[];
  cols: string[];
  cells: MissingCellClient[][];
}

export function expectedListForClient(
  catalog: AssetCatalogMirror,
  s1Value: string,
  slotId: 's2' | 's3',
): string[] {
  const override = catalog.expected[s1Value]?.[slotId];
  if (override === undefined || override === null) return catalog.vocab[slotId] ?? [];
  return override;
}

function comboKey(values: Array<string | undefined>): string {
  return values.map((value) => value ?? '').join('\u0000');
}

function groupAssignments(catalog: AssetCatalogMirror, slotIds: AssetSlotId[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [path, slots] of Object.entries(catalog.assignments)) {
    const key = comboKey(slotIds.map((slotId) => slots[slotId]));
    const paths = groups.get(key) ?? [];
    paths.push(path);
    groups.set(key, paths);
  }
  return groups;
}

function cellState(count: number, excluded: boolean): MissingCellState {
  if (excluded) return 'excluded';
  if (count === 0) return 'missing';
  return count > 1 ? 'duplicate' : 'present';
}

export function computeMissingMatrixClient(
  catalog: AssetCatalogMirror,
  s1?: string,
): MissingMatrixClient | null {
  const slotCount = catalog.schema.slots.length;

  if (slotCount === 3) {
    if (!s1) return null;
    const rows = expectedListForClient(catalog, s1, 's2');
    const cols = expectedListForClient(catalog, s1, 's3');
    const groups = groupAssignments(catalog, ['s1', 's2', 's3']);
    return {
      rows,
      cols,
      cells: rows.map((row) =>
        cols.map((col) => {
          const paths = groups.get(comboKey([s1, row, col])) ?? [];
          return { row, col, state: cellState(paths.length, false), count: paths.length, paths };
        }),
      ),
    };
  }

  if (slotCount === 2) {
    const rows = catalog.vocab.s1 ?? [];
    const cols = catalog.vocab.s2 ?? [];
    const groups = groupAssignments(catalog, ['s1', 's2']);
    return {
      rows,
      cols,
      cells: rows.map((row) => {
        const expectedSet = new Set(expectedListForClient(catalog, row, 's2'));
        return cols.map((col) => {
          const paths = groups.get(comboKey([row, col])) ?? [];
          const excluded = !expectedSet.has(col) && paths.length === 0;
          return { row, col, state: cellState(paths.length, excluded), count: paths.length, paths };
        });
      }),
    };
  }

  const rows = catalog.vocab.s1 ?? [];
  const groups = groupAssignments(catalog, ['s1']);
  return {
    rows,
    cols: [''],
    cells: rows.map((row) => {
      const paths = groups.get(comboKey([row])) ?? [];
      return [{ row, col: '', state: cellState(paths.length, false), count: paths.length, paths }];
    }),
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-webview run test -- tests/lib/asset-manager/`
Expected: PASS (naming 2 + gridModel 6 tests)

주의: `computeMissingMatrixClient`의 `comboKey`는 `\u0000` 구분자를 쓰는데 core는 `' '`를 쓴다 — 결과 의미는 동일하나 core 쪽도 `'\u0000'`으로 통일하는 편이 안전(값에 공백이 들어가는 `acting coy` 케이스에서 core의 `' '` join이 충돌 가능). **core A3 구현의 `comboKey`도 `'\u0000'` join으로 작성**한다 (A3 코드의 `join(' ')`을 `join('\u0000')`로 — A3 태스크 실행 시 이 노트를 반영).

- [ ] **Step 6: 커밋**

```bash
git add packages/webview/src/lib/types/assetManager.ts packages/webview/src/lib/asset-manager/ packages/webview/tests/lib/asset-manager/
git commit -m "feat(asset-manager-webview) : add protocol mirror, naming preview, grid/matrix pure logic"
```

---

### Task D3: AssetManagerApp 셸 + 라우트 + 첫 실행 스키마 모달

**Files:**
- Create: `packages/webview/src/AssetManagerApp.svelte`
- Create: `packages/webview/src/lib/components/asset-manager/FirstRunSchemaModal.svelte`
- Modify: `packages/webview/src/main.ts` (asset-manager 라우트 분기)

**Interfaces:**
- Consumes: D2 전부 (`types/assetManager`, `naming`, `gridModel`), `getVsCodeApi` (기존 `lib/vscode.ts`)
- Produces (D4/D5 뷰가 받는 props 계약):
  - `AssetManagerApp`이 각 뷰에 내려주는 props: `entries`, `catalog`, `assetsRootUri`, `orphanPaths`, `duplicateNames`, `tokenizeState`, `lorebookCandidates`, `outputsState`, `buildSummary`, `metaByPath`
  - 콜백 props: `onUpdateAssignments(changes)`, `onUpdateVocab(vocab)`, `onUpdateSchema(schema, outputs?)`, `onUpdateExpected(expected)`, `onAnalyzeLorebook()`, `onBootstrap()`, `onReadMeta(path)`, `onGenerateOutputs(kinds)`, `onSaveOutput(kind, targetPath, content)`, `onBuildManifest()`, `onRefresh()`
  - `assetImageSrc(assetsRootUri, path): string` — 세그먼트별 encodeURIComponent 조립 (App 내 헬퍼로 두고 뷰에 prop 전달)
- 라우트: `main.ts`에서 `webviewName === 'asset-manager'`이면 (editorMode 분기보다 **먼저**) `mount(AssetManagerApp, { target: app })`

- [ ] **Step 1: FirstRunSchemaModal.svelte 작성**

`packages/webview/src/lib/components/asset-manager/FirstRunSchemaModal.svelte`:

```svelte
<script lang="ts">
  import type { AssetCatalogSchemaMirror, AssetSlotDefinition } from '../../types/assetManager';
  import { renderNamePreview } from '../../asset-manager/naming';

  export let suggestThreeSlots: boolean;
  export let onConfirm: (schema: AssetCatalogSchemaMirror) => void;
  export let onSkip: () => void;

  let slotCount: 2 | 3 = 2;
  let labels = ['character', 'emotion', 'attire'];
  let separator = '_';

  $: slots = buildSlots(slotCount, labels);
  $: joinTemplate = slots.map((slot) => `{${slot.id}}`).join(separator);
  $: sample = renderNamePreview(
    { slots, joinTemplate },
    { s1: 'Elsie', s2: slotCount === 2 ? 'angry' : 'Dress', s3: 'angry' },
  );

  function buildSlots(count: 2 | 3, currentLabels: string[]): AssetSlotDefinition[] {
    const ids = ['s1', 's2', 's3'] as const;
    return ids.slice(0, count).map((id, index) => ({ id, label: currentLabels[index] || id }));
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function confirm(): void {
    onConfirm({ slots, joinTemplate });
  }
</script>

<section class="modal-backdrop" aria-label="Asset schema setup backdrop">
  <div class="schema-modal" role="dialog" aria-modal="true" aria-label="Asset slot schema setup">
    <h2>슬롯 스키마 설정</h2>
    <p class="schema-modal__hint">
      asset name을 구성할 슬롯을 정합니다. 나중에 Vocab 탭에서 언제든 바꿀 수 있습니다.
      {#if suggestThreeSlots}<strong>파일명 패턴상 3슬롯으로 보입니다.</strong>{/if}
    </p>

    <fieldset class="schema-modal__row">
      <label><input type="radio" bind:group={slotCount} value={2} /> 2슬롯 (기본)</label>
      <label><input type="radio" bind:group={slotCount} value={3} /> 3슬롯</label>
    </fieldset>

    {#each slots as slot, index (slot.id)}
      <label class="schema-modal__row">
        <span>{slot.id} 라벨</span>
        <input type="text" bind:value={labels[index]} />
      </label>
    {/each}

    <label class="schema-modal__row">
      <span>구분자</span>
      <input type="text" bind:value={separator} maxlength="3" />
    </label>

    <p class="schema-modal__preview">미리보기: <code>{sample ?? '—'}</code></p>

    <footer class="schema-modal__actions">
      <button type="button" class="button-secondary" onclick={onSkip}>기본값으로 건너뛰기</button>
      <button type="button" onclick={confirm}>이 스키마로 시작</button>
    </footer>
  </div>
</section>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.45);
    z-index: 30;
  }
  .schema-modal {
    width: min(420px, 90vw);
    padding: var(--space-4);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md, 8px);
    background: var(--vscode-editor-background, #1e1e1e);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .schema-modal__row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .schema-modal__hint { color: var(--secondary-text); margin: 0; }
  .schema-modal__preview code { font-weight: 700; }
  .schema-modal__actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
</style>
```

- [ ] **Step 2: AssetManagerApp.svelte 작성**

`packages/webview/src/AssetManagerApp.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { getVsCodeApi } from './lib/vscode';
  import {
    createAssetManagerWebviewMessage,
    isAssetManagerExtensionMessage,
    type AssetCatalogMirror,
    type AssetCatalogOutputsMirror,
    type AssetCatalogSchemaMirror,
    type AssetExpectedMapMirror,
    type AssetManagerAssetEntry,
    type AssetManagerAssignmentChange,
    type AssetManagerTokenizeProposal,
    type AssetManagerWebviewMessage,
    type AssetOutputKind,
    type ImageMetaMirror,
    type LorebookNameCandidateMirror,
  } from './lib/types/assetManager';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import FirstRunSchemaModal from './lib/components/asset-manager/FirstRunSchemaModal.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import GridView from './lib/components/asset-manager/GridView.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import MatrixView from './lib/components/asset-manager/MatrixView.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import VocabView from './lib/components/asset-manager/VocabView.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import OutputsView from './lib/components/asset-manager/OutputsView.svelte';

  const vscode = getVsCodeApi();

  type Tab = 'grid' | 'matrix' | 'vocab' | 'outputs';

  let tab: Tab = 'grid';
  let stableId = '';
  let artifactName = '';
  let assetsRootUri = '';
  let entries: AssetManagerAssetEntry[] = [];
  let catalog: AssetCatalogMirror | null = null;
  let catalogExists = true;
  let orphanPaths: string[] = [];
  let duplicateNames: string[] = [];
  let status = 'Connecting to extension host…';
  let errorText = '';
  let initialized = false;
  let schemaModalDismissed = false;
  let lorebookCandidates: LorebookNameCandidateMirror[] = [];
  let tokenizeProposals: AssetManagerTokenizeProposal[] = [];
  let tokenizePrefixes: Array<{ value: string; count: number }> = [];
  let tokenizeSuffixes: Array<{ value: string; count: number }> = [];
  let outputsState: {
    promptBlock?: string;
    whitelistRegex?: { inPattern: string; outPattern: string } | null;
    missingReport?: string;
  } = {};
  let buildSummary: { total: number; named: number; unassigned: number; duplicates: number; orphans: number } | null =
    null;
  let metaByPath: Record<string, ImageMetaMirror> = {};
  let readyRetryTimer: ReturnType<typeof setInterval> | undefined;

  $: suggestThreeSlots = entriesLookThreeSlot(entries);
  $: showSchemaModal = initialized && !catalogExists && !schemaModalDismissed;

  function entriesLookThreeSlot(current: AssetManagerAssetEntry[]): boolean {
    const sample = current.slice(0, 200);
    if (sample.length === 0) return false;
    const threeish = sample.filter((entry) => entry.fileStem.split(/[\s_]+/).length >= 3).length;
    return threeish / sample.length > 0.7;
  }

  function post(message: AssetManagerWebviewMessage): void {
    vscode?.postMessage(message);
  }

  function applySnapshot(payload: {
    entries: AssetManagerAssetEntry[];
    catalog: AssetCatalogMirror;
    catalogExists: boolean;
    orphanPaths: string[];
    duplicateNames: string[];
  }): void {
    entries = payload.entries;
    catalog = payload.catalog;
    catalogExists = payload.catalogExists;
    orphanPaths = payload.orphanPaths;
    duplicateNames = payload.duplicateNames;
    status = `${entries.length} assets · 미할당 ${entries.filter((entry) => entry.flags.unassigned).length} · orphan ${orphanPaths.length}`;
  }

  function handleMessage(event: MessageEvent): void {
    const message: unknown = event.data;
    if (!isAssetManagerExtensionMessage(message)) return;
    errorText = '';
    switch (message.type) {
      case 'asset-manager/assetsLoaded': {
        initialized = true;
        stableId = message.payload.stableId;
        artifactName = message.payload.artifactName;
        assetsRootUri = message.payload.assetsRootWebviewUri;
        applySnapshot(message.payload);
        return;
      }
      case 'asset-manager/catalogSaved':
        applySnapshot(message.payload);
        return;
      case 'asset-manager/lorebookNamesResult':
        lorebookCandidates = message.payload.candidates;
        return;
      case 'asset-manager/tokenizeResult':
        tokenizeProposals = message.payload.proposals;
        tokenizePrefixes = message.payload.prefixes;
        tokenizeSuffixes = message.payload.suffixes;
        return;
      case 'asset-manager/imageMetaResult':
        metaByPath = { ...metaByPath, [message.payload.path]: message.payload.meta };
        return;
      case 'asset-manager/outputsResult':
        outputsState = {
          promptBlock: message.payload.promptBlock ?? outputsState.promptBlock,
          whitelistRegex:
            message.payload.whitelistRegex !== undefined ? message.payload.whitelistRegex : outputsState.whitelistRegex,
          missingReport: message.payload.missingReport ?? outputsState.missingReport,
        };
        return;
      case 'asset-manager/outputSaved':
        status = `저장됨: ${message.payload.savedPath}`;
        return;
      case 'asset-manager/manifestBuilt':
        buildSummary = {
          total: message.payload.total,
          named: message.payload.named,
          unassigned: message.payload.unassigned,
          duplicates: message.payload.duplicates.length,
          orphans: message.payload.orphanPaths.length,
        };
        status = `manifest 빌드 완료 · ${message.payload.total} entries (curated ${message.payload.named})`;
        return;
      case 'asset-manager/error':
        errorText = `${message.payload.context}: ${message.payload.message}`;
        return;
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    post(createAssetManagerWebviewMessage('asset-manager/ready', {}));
    readyRetryTimer = setInterval(() => {
      if (initialized) {
        clearInterval(readyRetryTimer);
        return;
      }
      post(createAssetManagerWebviewMessage('asset-manager/ready', {}));
    }, 500);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (readyRetryTimer) clearInterval(readyRetryTimer);
    };
  });

  // ---- 뷰 콜백 (모든 postMessage는 여기 한 곳에서) ----
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes these callbacks.
  const onRefresh = () => post(createAssetManagerWebviewMessage('asset-manager/refreshAssets', { stableId }));
  const onUpdateAssignments = (changes: AssetManagerAssignmentChange[]) =>
    post(createAssetManagerWebviewMessage('asset-manager/updateAssignments', { stableId, changes }));
  const onUpdateVocab = (vocab: AssetCatalogMirror['vocab']) =>
    post(createAssetManagerWebviewMessage('asset-manager/updateVocab', { stableId, vocab }));
  const onUpdateSchema = (schema: AssetCatalogSchemaMirror, outputs?: AssetCatalogOutputsMirror) =>
    post(createAssetManagerWebviewMessage('asset-manager/updateSchema', { stableId, schema, ...(outputs && { outputs }) }));
  const onUpdateExpected = (expected: AssetExpectedMapMirror) =>
    post(createAssetManagerWebviewMessage('asset-manager/updateExpected', { stableId, expected }));
  const onAnalyzeLorebook = () =>
    post(createAssetManagerWebviewMessage('asset-manager/analyzeLorebookNames', { stableId }));
  const onBootstrap = () =>
    post(createAssetManagerWebviewMessage('asset-manager/bootstrapFromFilenames', { stableId }));
  const onReadMeta = (path: string) =>
    post(createAssetManagerWebviewMessage('asset-manager/readImageMeta', { stableId, path }));
  const onGenerateOutputs = (kinds: AssetOutputKind[]) =>
    post(createAssetManagerWebviewMessage('asset-manager/generateOutputs', { stableId, kinds }));
  const onSaveOutput = (kind: AssetOutputKind, targetPath: string, content: string) =>
    post(createAssetManagerWebviewMessage('asset-manager/saveOutput', { stableId, kind, targetPath, content }));
  const onBuildManifest = () => post(createAssetManagerWebviewMessage('asset-manager/buildManifest', { stableId }));

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this helper.
  function assetImageSrc(path: string): string {
    return `${assetsRootUri}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  function confirmSchema(schema: AssetCatalogSchemaMirror): void {
    schemaModalDismissed = true;
    onUpdateSchema(schema);
  }
</script>

<main class="asset-manager" aria-label="Risu Asset Manager">
  <header class="asset-manager__header">
    <div>
      <p class="eyebrow">Asset Manager</p>
      <h1>{artifactName || '…'}</h1>
    </div>
    <nav class="asset-manager__tabs" aria-label="Asset manager views">
      {#each [['grid', 'Grid'], ['matrix', 'Matrix'], ['vocab', 'Vocab'], ['outputs', 'Outputs']] as [id, label] (id)}
        <button type="button" class:active={tab === id} onclick={() => (tab = id as Tab)}>{label}</button>
      {/each}
    </nav>
    <div class="asset-manager__actions">
      <button type="button" class="button-secondary" onclick={onRefresh} title="재스캔">⟳</button>
      <button type="button" onclick={onBuildManifest} title="catalog merge로 manifest.json 빌드">Build ▶</button>
    </div>
  </header>

  <p class="asset-manager__status">{status}</p>
  {#if errorText}<p class="asset-manager__error" role="alert">{errorText}</p>{/if}

  {#if catalog}
    {#if tab === 'grid'}
      <GridView
        {entries}
        {catalog}
        {orphanPaths}
        {tokenizeProposals}
        {metaByPath}
        {assetImageSrc}
        {onUpdateAssignments}
        {onBootstrap}
        {onReadMeta}
      />
    {:else if tab === 'matrix'}
      <MatrixView {catalog} {onUpdateExpected} />
    {:else if tab === 'vocab'}
      <VocabView
        {catalog}
        {lorebookCandidates}
        {tokenizePrefixes}
        {tokenizeSuffixes}
        {onUpdateVocab}
        {onUpdateSchema}
        {onAnalyzeLorebook}
        {onBootstrap}
      />
    {:else}
      <OutputsView {catalog} {outputsState} {buildSummary} {onGenerateOutputs} {onSaveOutput} {onBuildManifest} />
    {/if}
  {:else}
    <p class="asset-manager__loading">Loading assets…</p>
  {/if}

  {#if showSchemaModal}
    <FirstRunSchemaModal
      {suggestThreeSlots}
      onConfirm={confirmSchema}
      onSkip={() => (schemaModalDismissed = true)}
    />
  {/if}
</main>

<style>
  .asset-manager {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: var(--space-3);
    gap: var(--space-2);
    box-sizing: border-box;
  }
  .asset-manager__header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .asset-manager__header h1 { margin: 0; font-size: 1.1rem; }
  .asset-manager__tabs { display: flex; gap: 4px; margin-left: auto; }
  .asset-manager__tabs button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--secondary);
    color: var(--secondary-text);
  }
  .asset-manager__tabs button.active { background: var(--accent); color: var(--accent-text); border-color: transparent; }
  .asset-manager__actions { display: flex; gap: var(--space-1); }
  .asset-manager__status { margin: 0; color: var(--secondary-text); font-size: var(--text-sm); }
  .asset-manager__error { margin: 0; color: var(--vscode-errorForeground, #f66); }
  .asset-manager__loading { color: var(--secondary-text); }
</style>
```

주의: 이 시점에는 GridView/MatrixView/VocabView/OutputsView가 아직 없어 빌드가 실패한다. **D3 완료 조건은 D4·D5의 빈 스텁 4개를 함께 만드는 것**: 각 파일을 아래 형태의 최소 스텁으로 생성해두고 D4/D5에서 본 구현으로 교체한다.

```svelte
<script lang="ts">
  // D4/D5에서 본 구현으로 교체되는 스텁
  export let catalog: unknown = undefined;
</script>

<p>Not implemented yet.</p>
```

(각 스텁은 App이 넘기는 props를 전부 선언하지 않아도 Svelte에서 경고만 발생 — `svelte-check`가 unknown prop 에러를 내면 App에서 넘기는 props를 같은 이름의 `export let`으로 선언해 스텁을 컴파일 가능 상태로 유지한다.)

- [ ] **Step 3: main.ts 라우트 + vscode.ts 유니온 추가**

`packages/webview/src/lib/vscode.ts` — `WebviewOutboundMessage` 유니온에 asset manager 메시지 추가 (App의 `postMessage` 타입이 통과하도록):

```typescript
import type { AssetManagerWebviewMessage } from './types/assetManager';

type WebviewOutboundMessage =
  | ArtifactBrowserWebviewMessage
  | MarkerEditorWebviewMessage
  | MainEditorWebviewMessage
  | AssetManagerWebviewMessage;
```

`packages/webview/src/main.ts`:

1. import 추가: `import AssetManagerApp from './AssetManagerApp.svelte';`
2. mount 분기 수정 — 기존 `if (isEditorMode && webviewName === 'main-editor')` **앞에**:

```typescript
if (webviewName === 'asset-manager') {
  mount(AssetManagerApp, {
    target: app,
  });
} else if (isEditorMode && webviewName === 'main-editor') {
```

(이하 기존 체인 유지 — `else if (isEditorMode)` → MarkerEditor, `else` → App.)

- [ ] **Step 4: 빌드 + 타입체크**

```bash
npm --workspace risu-workbench-webview run check
npm --workspace risu-workbench-webview run build
```

Expected: 성공 (스텁 포함)

- [ ] **Step 5: 커밋**

```bash
git add packages/webview/src/AssetManagerApp.svelte packages/webview/src/lib/components/asset-manager/ packages/webview/src/main.ts
git commit -m "feat(asset-manager-webview) : add app shell, first-run schema modal, view route"
```

---

### Task D4: GridView (가상 그리드 + Inspector) + AssetDetailModal

**Files:**
- Modify(스텁 교체): `packages/webview/src/lib/components/asset-manager/GridView.svelte`
- Create: `packages/webview/src/lib/components/asset-manager/AssetDetailModal.svelte`

**Interfaces:**
- Consumes: D2 `gridModel`/`naming`, D3 App이 내려주는 props
- Produces: 스펙 §7.1 — 가상 스크롤 그리드, 필터/정렬/타일 크기, ctrl/shift 다중 선택, Inspector 일괄 부여("(유지)" 시맨틱), tokenize 제안 적용, orphan 정리, 더블클릭 상세 모달(메타 온디맨드 + ←/→ 탐색 + 인라인 슬롯 편집)

**동작 규약 (구현 지침):**
- 가상화: 고정 타일 크기(픽셀 슬라이더 96~256, 기본 160), 컨테이너 `clientWidth`로 열 수 계산, `computeVirtualWindow`로 창 계산, 위/아래 spacer div. `<img loading="lazy" decoding="async">`.
- "(유지)" 시맨틱: Inspector의 각 슬롯 select에 `KEEP` 센티널 옵션. 적용 시 KEEP 슬롯은 기존 할당 값을 유지하고, 값이 선택된 슬롯만 덮어씀. 슬롯 값 전체가 비면 할당 제거(null)가 아니라 부분 할당으로 저장.
- tokenize 적용: `tokenizeProposals`에서 선택 경로들의 matched 제안만 적용. 제안이 없으면 먼저 `onBootstrap()` 요청을 유도(버튼이 두 상태를 가짐).
- orphan 정리: `onUpdateAssignments(orphanPaths.map((path) => ({ path, slots: null })))`.

- [ ] **Step 1: GridView.svelte 구현 (스텁 교체)**

```svelte
<script lang="ts">
  import {
    applyTileSelection,
    computeVirtualWindow,
    filterAssetEntries,
    sortAssetEntries,
  } from '../../asset-manager/gridModel';
  import type {
    AssetCatalogMirror,
    AssetManagerAssetEntry,
    AssetManagerAssignmentChange,
    AssetManagerTokenizeProposal,
    AssetSlotValues,
    ImageMetaMirror,
  } from '../../types/assetManager';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import AssetDetailModal from './AssetDetailModal.svelte';

  export let entries: AssetManagerAssetEntry[];
  export let catalog: AssetCatalogMirror;
  export let orphanPaths: string[];
  export let tokenizeProposals: AssetManagerTokenizeProposal[];
  export let metaByPath: Record<string, ImageMetaMirror>;
  export let assetImageSrc: (path: string) => string;
  export let onUpdateAssignments: (changes: AssetManagerAssignmentChange[]) => void;
  export let onBootstrap: () => void;
  export let onReadMeta: (path: string) => void;

  const KEEP = '__keep__';
  const GAP = 8;

  let subdir: string = 'additional';
  let query = '';
  let onlyUnassigned = false;
  let onlyDuplicate = false;
  let sortKey: 'name' | 'size' | 'mtime' = 'name';
  let tileSize = 160;
  let scrollTop = 0;
  let viewportHeight = 0;
  let viewportWidth = 0;
  let selected = new Set<string>();
  let anchorPath: string | null = null;
  let modalIndex: number | null = null;
  let inspectorValues: Record<string, string> = {};

  $: visibleEntries = sortAssetEntries(
    filterAssetEntries(entries, { subdir, query, onlyUnassigned, onlyDuplicate }),
    sortKey,
  );
  $: orderedPaths = visibleEntries.map((entry) => entry.path);
  $: columns = Math.max(1, Math.floor((viewportWidth + GAP) / (tileSize + GAP)));
  $: window_ = computeVirtualWindow({
    scrollTop,
    viewportHeight,
    tileSize: tileSize + 44, // 타일 하단 라벨 영역 포함
    gap: GAP,
    columns,
    totalItems: visibleEntries.length,
    overscanRows: 2,
  });
  $: windowEntries = visibleEntries.slice(window_.startIndex, window_.endIndex);
  $: selectedEntries = visibleEntries.filter((entry) => selected.has(entry.path));
  $: proposalByPath = new Map(tokenizeProposals.map((proposal) => [proposal.path, proposal]));
  $: modalEntry = modalIndex === null ? null : visibleEntries[modalIndex] ?? null;

  function selectionMode(event: MouseEvent): 'single' | 'toggle' | 'range' {
    if (event.shiftKey) return 'range';
    if (event.ctrlKey || event.metaKey) return 'toggle';
    return 'single';
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clickTile(event: MouseEvent, path: string): void {
    const next = applyTileSelection(orderedPaths, selected, anchorPath, path, selectionMode(event));
    selected = next.selected;
    anchorPath = next.anchorPath;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function openModal(index: number): void {
    modalIndex = index;
    const entry = visibleEntries[index];
    if (entry && !metaByPath[entry.path]) onReadMeta(entry.path);
  }

  function moveModal(delta: number): void {
    if (modalIndex === null) return;
    const nextIndex = Math.min(visibleEntries.length - 1, Math.max(0, modalIndex + delta));
    modalIndex = nextIndex;
    const entry = visibleEntries[nextIndex];
    if (entry && !metaByPath[entry.path]) onReadMeta(entry.path);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function applyInspector(): void {
    const changes: AssetManagerAssignmentChange[] = selectedEntries.map((entry) => {
      const slots: AssetSlotValues = { ...(entry.assignment ?? {}) };
      for (const slot of catalog.schema.slots) {
        const chosen = inspectorValues[slot.id];
        if (chosen && chosen !== KEEP) slots[slot.id] = chosen;
      }
      return { path: entry.path, slots };
    });
    if (changes.length > 0) onUpdateAssignments(changes);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clearAssignments(): void {
    if (selectedEntries.length === 0) return;
    onUpdateAssignments(selectedEntries.map((entry) => ({ path: entry.path, slots: null })));
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function applyTokenizeToSelection(): void {
    if (tokenizeProposals.length === 0) {
      onBootstrap();
      return;
    }
    const targets = selectedEntries.length > 0 ? selectedEntries : visibleEntries;
    const changes: AssetManagerAssignmentChange[] = [];
    for (const entry of targets) {
      const proposal = proposalByPath.get(entry.path);
      if (proposal?.matched) changes.push({ path: entry.path, slots: proposal.slots });
    }
    if (changes.length > 0) onUpdateAssignments(changes);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function cleanOrphans(): void {
    if (orphanPaths.length === 0) return;
    onUpdateAssignments(orphanPaths.map((path) => ({ path, slots: null })));
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this handler.
  function onScroll(event: Event): void {
    scrollTop = (event.currentTarget as HTMLElement).scrollTop;
  }
</script>

<div class="grid-layout">
  <section class="grid-main" aria-label="Asset grid">
    <div class="grid-toolbar" role="toolbar" aria-label="Grid filters">
      <select bind:value={subdir} aria-label="Subdirectory filter">
        {#each ['additional', 'emotions', 'icons', 'other', 'all'] as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
      <input type="search" placeholder="검색 (이름/슬롯 값)" bind:value={query} />
      <label><input type="checkbox" bind:checked={onlyUnassigned} /> 미할당</label>
      <label><input type="checkbox" bind:checked={onlyDuplicate} /> 중복</label>
      <select bind:value={sortKey} aria-label="Sort key">
        <option value="name">이름순</option>
        <option value="size">크기순</option>
        <option value="mtime">수정순</option>
      </select>
      <input type="range" min="96" max="256" step="16" bind:value={tileSize} aria-label="Tile size" />
      <button type="button" class="button-secondary" onclick={applyTokenizeToSelection}>
        {tokenizeProposals.length === 0 ? 'tokenize 분석' : 'tokenize 제안 적용'}
      </button>
      {#if orphanPaths.length > 0}
        <button type="button" class="button-secondary" onclick={cleanOrphans}>orphan {orphanPaths.length} 정리</button>
      {/if}
      <span class="grid-toolbar__count">{visibleEntries.length} / {entries.length}</span>
    </div>

    <div
      class="grid-viewport"
      onscroll={onScroll}
      bind:clientHeight={viewportHeight}
      bind:clientWidth={viewportWidth}
    >
      <div style={`height:${window_.topPadding}px`}></div>
      <div class="grid-tiles" style={`grid-template-columns:repeat(${columns}, ${tileSize}px); gap:${GAP}px;`}>
        {#each windowEntries as entry, offset (entry.path)}
          {@const index = window_.startIndex + offset}
          <button
            type="button"
            class="tile"
            class:tile--selected={selected.has(entry.path)}
            onclick={(event) => clickTile(event, entry.path)}
            ondblclick={() => openModal(index)}
            title={entry.path}
          >
            <img
              src={assetImageSrc(entry.path)}
              alt={entry.generatedName ?? entry.fileStem}
              width={tileSize}
              height={tileSize}
              loading="lazy"
              decoding="async"
            />
            <span class="tile__name">{entry.generatedName ?? entry.fileStem}</span>
            <span class="tile__badges">
              {#if entry.flags.unassigned}<span class="badge badge--warn">미할당</span>{/if}
              {#if entry.flags.duplicate}<span class="badge badge--dup">중복</span>{/if}
            </span>
          </button>
        {/each}
      </div>
      <div style={`height:${window_.bottomPadding}px`}></div>
    </div>
  </section>

  <aside class="inspector" aria-label="Assignment inspector">
    <h2>선택: {selectedEntries.length}</h2>
    {#each catalog.schema.slots as slot (slot.id)}
      <label class="inspector__field">
        <span>{slot.label}</span>
        <select bind:value={inspectorValues[slot.id]}>
          <option value={KEEP}>(유지)</option>
          {#each catalog.vocab[slot.id] ?? [] as value (value)}
            <option {value}>{value}</option>
          {/each}
        </select>
      </label>
    {/each}
    <div class="inspector__actions">
      <button type="button" onclick={applyInspector} disabled={selectedEntries.length === 0}>선택에 적용</button>
      <button type="button" class="button-secondary" onclick={clearAssignments} disabled={selectedEntries.length === 0}>
        할당 해제
      </button>
    </div>
    {#if selectedEntries.length === 1}
      {@const single = selectedEntries[0]}
      <dl class="inspector__meta">
        <dt>path</dt><dd>{single.path}</dd>
        <dt>name</dt><dd>{single.generatedName ?? '(미할당)'}</dd>
        <dt>size</dt><dd>{(single.sizeBytes / 1024).toFixed(1)} KB</dd>
      </dl>
    {/if}
  </aside>
</div>

{#if modalEntry}
  <AssetDetailModal
    entry={modalEntry}
    imgSrc={assetImageSrc(modalEntry.path)}
    meta={metaByPath[modalEntry.path] ?? null}
    {catalog}
    onClose={() => (modalIndex = null)}
    onPrev={() => moveModal(-1)}
    onNext={() => moveModal(1)}
    onApplySlots={(path, slots) => onUpdateAssignments([{ path, slots }])}
  />
{/if}

<style>
  .grid-layout { display: flex; gap: var(--space-3); flex: 1; min-height: 0; }
  .grid-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .grid-toolbar { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; padding-bottom: var(--space-2); }
  .grid-toolbar__count { margin-left: auto; color: var(--secondary-text); font-size: var(--text-sm); }
  .grid-viewport { flex: 1; overflow-y: auto; min-height: 0; }
  .grid-tiles { display: grid; }
  .tile {
    display: flex; flex-direction: column; gap: 2px; padding: 0; border: 2px solid transparent;
    border-radius: var(--radius-sm); background: none; cursor: pointer; text-align: left;
  }
  .tile--selected { border-color: var(--focus, #3794ff); }
  .tile img { object-fit: cover; border-radius: var(--radius-sm); background: var(--secondary); }
  .tile__name {
    font-size: 11px; color: var(--secondary-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tile__badges { display: flex; gap: 4px; min-height: 14px; }
  .badge { font-size: 10px; padding: 0 4px; border-radius: 3px; }
  .badge--warn { background: var(--vscode-editorWarning-foreground, #cca700); color: #000; }
  .badge--dup { background: var(--vscode-editorInfo-foreground, #3794ff); color: #000; }
  .inspector { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .inspector h2 { margin: 0; font-size: 0.95rem; }
  .inspector__field { display: flex; flex-direction: column; gap: 2px; font-size: var(--text-sm); }
  .inspector__actions { display: flex; flex-direction: column; gap: var(--space-1); }
  .inspector__meta { font-size: 11px; color: var(--secondary-text); overflow-wrap: anywhere; }
  .inspector__meta dt { font-weight: 700; }
</style>
```

- [ ] **Step 2: AssetDetailModal.svelte 구현**

```svelte
<script lang="ts">
  import type {
    AssetCatalogMirror,
    AssetManagerAssetEntry,
    AssetSlotValues,
    ImageMetaMirror,
  } from '../../types/assetManager';

  export let entry: AssetManagerAssetEntry;
  export let imgSrc: string;
  export let meta: ImageMetaMirror | null;
  export let catalog: AssetCatalogMirror;
  export let onClose: () => void;
  export let onPrev: () => void;
  export let onNext: () => void;
  export let onApplySlots: (path: string, slots: AssetSlotValues) => void;

  let draft: AssetSlotValues = {};
  $: draft = { ...(entry.assignment ?? {}) };

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function apply(): void {
    onApplySlots(entry.path, draft);
  }

  // biome-ignore lint/correctness/noUnusedVariables: svelte:window consumes this handler.
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowLeft') onPrev();
    else if (event.key === 'ArrowRight') onNext();
  }
</script>

<svelte:window on:keydown={onKeydown} />

<section class="modal-backdrop" aria-label="Asset detail backdrop">
  <button type="button" class="modal-scrim" aria-label="Close asset detail" onclick={onClose}></button>
  <div class="detail-modal" role="dialog" aria-modal="true" aria-label="Asset detail">
    <header class="detail-modal__header">
      <h2>{entry.generatedName ?? entry.fileStem}</h2>
      <div>
        <button type="button" class="button-secondary" onclick={onPrev} aria-label="Previous asset">←</button>
        <button type="button" class="button-secondary" onclick={onNext} aria-label="Next asset">→</button>
        <button type="button" class="button-secondary" onclick={onClose} aria-label="Close">×</button>
      </div>
    </header>

    <div class="detail-modal__body">
      <img src={imgSrc} alt={entry.fileStem} decoding="async" />
      <div class="detail-modal__side">
        <dl class="detail-modal__info">
          <dt>path</dt><dd>{entry.path}</dd>
          <dt>format</dt><dd>{meta?.info.format ?? entry.ext}</dd>
          <dt>size</dt><dd>{(entry.sizeBytes / 1024).toFixed(1)} KB</dd>
          {#if meta?.info.width}
            <dt>dimensions</dt><dd>{meta.info.width}×{meta.info.height}</dd>
          {/if}
        </dl>

        <h3>Slots</h3>
        {#each catalog.schema.slots as slot (slot.id)}
          <label class="detail-modal__slot">
            <span>{slot.label}</span>
            <select bind:value={draft[slot.id]}>
              <option value={undefined}>—</option>
              {#each catalog.vocab[slot.id] ?? [] as value (value)}
                <option {value}>{value}</option>
              {/each}
            </select>
          </label>
        {/each}
        <button type="button" onclick={apply}>슬롯 저장</button>

        <h3>Generation</h3>
        {#if meta === null}
          <p class="detail-modal__hint">메타데이터 로딩 중…</p>
        {:else if meta.generation === null}
          <p class="detail-modal__hint">AI 생성정보 없음</p>
        {:else}
          <p class="detail-modal__source">{meta.generation.source}</p>
          <dl class="detail-modal__gen">
            {#each Object.entries(meta.generation.fields) as [key, value] (key)}
              <dt>{key}</dt><dd>{value}</dd>
            {/each}
          </dl>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .modal-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; }
  .modal-scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55); border: 0; }
  .detail-modal {
    position: relative; width: min(920px, 94vw); max-height: 90vh; overflow: hidden;
    display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3);
    border: 1px solid var(--card-border); border-radius: var(--radius-md, 8px);
    background: var(--vscode-editor-background, #1e1e1e);
  }
  .detail-modal__header { display: flex; justify-content: space-between; align-items: center; }
  .detail-modal__header h2 { margin: 0; font-size: 1rem; overflow-wrap: anywhere; }
  .detail-modal__body { display: flex; gap: var(--space-3); min-height: 0; }
  .detail-modal__body img {
    flex: 1; min-width: 0; max-height: 72vh; object-fit: contain; background: var(--secondary);
    border-radius: var(--radius-sm);
  }
  .detail-modal__side { width: 280px; flex-shrink: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-1); }
  .detail-modal__side h3 { margin: var(--space-2) 0 0; font-size: 0.85rem; }
  .detail-modal__info, .detail-modal__gen { font-size: 11px; overflow-wrap: anywhere; margin: 0; }
  .detail-modal__info dt, .detail-modal__gen dt { font-weight: 700; margin-top: 4px; }
  .detail-modal__slot { display: flex; flex-direction: column; font-size: var(--text-sm); gap: 2px; }
  .detail-modal__hint { color: var(--secondary-text); font-size: var(--text-sm); margin: 0; }
  .detail-modal__source { font-weight: 700; margin: 0; }
</style>
```

- [ ] **Step 3: 빌드 + 타입체크 + 기존 테스트 회귀**

```bash
npm --workspace risu-workbench-webview run check
npm --workspace risu-workbench-webview run build
npm --workspace risu-workbench-webview run test
```

Expected: 전부 성공. `check`에서 `bind:value={inspectorValues[slot.id]}`/`bind:value={draft[slot.id]}` 같은 인덱스 바인딩이 에러가 되면, 해당 select를 `value={...}` + `onchange` 핸들러 조합으로 바꾼다:

```svelte
<select
  value={draft[slot.id] ?? ''}
  onchange={(event) => (draft = { ...draft, [slot.id]: (event.currentTarget as HTMLSelectElement).value || undefined })}
>
```

- [ ] **Step 4: 커밋**

```bash
git add packages/webview/src/lib/components/asset-manager/GridView.svelte packages/webview/src/lib/components/asset-manager/AssetDetailModal.svelte
git commit -m "feat(asset-manager-webview) : virtualized grid with inspector and detail modal"
```

---

### Task D5: MatrixView + VocabView + OutputsView (+ Grid 점프 배선)

**Files:**
- Modify(스텁 교체): `packages/webview/src/lib/components/asset-manager/MatrixView.svelte`
- Modify(스텁 교체): `packages/webview/src/lib/components/asset-manager/VocabView.svelte`
- Modify(스텁 교체): `packages/webview/src/lib/components/asset-manager/OutputsView.svelte`
- Modify: `packages/webview/src/AssetManagerApp.svelte` (매트릭스 셀 → Grid 점프 배선)
- Modify: `packages/webview/src/lib/components/asset-manager/GridView.svelte` (`presetQuery` prop 추가)

**Interfaces:**
- Consumes: D2 `computeMissingMatrixClient`/`expectedListForClient`/`labelTemplate`, D3 콜백 계약
- Produces: 스펙 §7.2(매트릭스 + expected 편집 + 셀 클릭 → Grid 필터 점프), §7.3(vocab CRUD/정렬 + 스키마 편집 + 후보 패널 2종), §7.4(파생 출력 미리보기/복사/저장 + Build 요약)

- [ ] **Step 1: Grid 점프 배선 (App + GridView 수정)**

`AssetManagerApp.svelte`:

1. 상태 추가: `let gridPresetQuery: string | null = null;`
2. 콜백 추가:

```typescript
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this callback.
  function jumpToCombo(values: string[]): void {
    gridPresetQuery = values.filter(Boolean).join(' ');
    tab = 'grid';
  }
```

3. `<GridView ...>`에 `presetQuery={gridPresetQuery}` 추가, `<MatrixView ...>`에 `onJumpToCombo={jumpToCombo}` 추가.

`GridView.svelte`:

```typescript
  export let presetQuery: string | null = null;

  let lastPreset: string | null = null;
  $: if (presetQuery !== null && presetQuery !== lastPreset) {
    lastPreset = presetQuery;
    query = presetQuery;
    subdir = 'all';
  }
```

- [ ] **Step 2: MatrixView.svelte 구현 (스텁 교체)**

```svelte
<script lang="ts">
  import { computeMissingMatrixClient, expectedListForClient } from '../../asset-manager/gridModel';
  import type { AssetCatalogMirror, AssetExpectedMapMirror } from '../../types/assetManager';

  export let catalog: AssetCatalogMirror;
  export let onUpdateExpected: (expected: AssetExpectedMapMirror) => void;
  export let onJumpToCombo: (values: string[]) => void;

  let selectedS1 = '';
  let editingS1 = '';

  $: slotCount = catalog.schema.slots.length;
  $: s1List = catalog.vocab.s1 ?? [];
  $: if (slotCount === 3 && !selectedS1 && s1List.length > 0) selectedS1 = s1List[0];
  $: matrix = computeMissingMatrixClient(catalog, slotCount === 3 ? selectedS1 : undefined);
  $: editableSlots = (slotCount === 3 ? ['s2', 's3'] : ['s2']) as Array<'s2' | 's3'>;

  const STATE_LABEL: Record<string, string> = {
    present: '✓',
    duplicate: '⚠',
    missing: '✗',
    excluded: '·',
  };

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clickCell(row: string, col: string): void {
    onJumpToCombo(slotCount === 3 ? [selectedS1, row, col] : [row, col]);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function toggleExpected(s1Value: string, slotId: 's2' | 's3', value: string): void {
    const current = new Set(expectedListForClient(catalog, s1Value, slotId));
    if (current.has(value)) current.delete(value);
    else current.add(value);
    const fullVocab = catalog.vocab[slotId] ?? [];
    const nextList = fullVocab.filter((entry) => current.has(entry));
    const nextExpected: AssetExpectedMapMirror = { ...catalog.expected };
    const slotMap = { ...(nextExpected[s1Value] ?? {}) };
    // vocab 전체와 동일해지면 override 제거(null 의미론 유지)
    if (nextList.length === fullVocab.length) delete slotMap[slotId];
    else slotMap[slotId] = nextList;
    if (Object.keys(slotMap).length === 0) delete nextExpected[s1Value];
    else nextExpected[s1Value] = slotMap;
    onUpdateExpected(nextExpected);
  }
</script>

<div class="matrix-layout">
  <section class="matrix-main" aria-label="Missing asset matrix">
    {#if slotCount === 3}
      <label class="matrix-s1">
        <span>{catalog.schema.slots[0].label}</span>
        <select bind:value={selectedS1}>
          {#each s1List as value (value)}<option {value}>{value}</option>{/each}
        </select>
      </label>
    {/if}

    {#if matrix && matrix.rows.length > 0}
      <div class="matrix-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th></th>
              {#each matrix.cols as col (col)}<th>{col || '—'}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each matrix.rows as row, rowIndex (row)}
              <tr>
                <th>{row}</th>
                {#each matrix.cells[rowIndex] as cell (cell.col)}
                  <td>
                    <button
                      type="button"
                      class={`cell cell--${cell.state}`}
                      title={`${cell.row} / ${cell.col || '-'} · ${cell.count} file(s)`}
                      onclick={() => clickCell(cell.row, cell.col)}
                    >
                      {STATE_LABEL[cell.state]}{cell.count > 1 ? cell.count : ''}
                    </button>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="matrix-legend">✓ 존재 · ⚠ 중복 · ✗ missing(기대 조합) · — · 비대상(expected 밖)</p>
    {:else}
      <p class="matrix-empty">vocab의 {catalog.schema.slots[0].label} 목록이 비어 있습니다. Vocab 탭에서 먼저 등록하세요.</p>
    {/if}
  </section>

  <aside class="expected-editor" aria-label="Expected set editor">
    <h2>Expected 편집</h2>
    <label>
      <span>{catalog.schema.slots[0].label}</span>
      <select bind:value={editingS1}>
        <option value="">선택…</option>
        {#each s1List as value (value)}<option {value}>{value}</option>{/each}
      </select>
    </label>
    {#if editingS1}
      {#each editableSlots as slotId (slotId)}
        {@const slotDef = catalog.schema.slots.find((slot) => slot.id === slotId)}
        {@const expectedSet = new Set(expectedListForClient(catalog, editingS1, slotId))}
        <fieldset>
          <legend>{slotDef?.label ?? slotId}</legend>
          {#each catalog.vocab[slotId] ?? [] as value (value)}
            <label class="expected-editor__item">
              <input
                type="checkbox"
                checked={expectedSet.has(value)}
                onchange={() => toggleExpected(editingS1, slotId, value)}
              />
              {value}
            </label>
          {/each}
        </fieldset>
      {/each}
    {/if}
  </aside>
</div>

<style>
  .matrix-layout { display: flex; gap: var(--space-3); flex: 1; min-height: 0; }
  .matrix-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .matrix-scroll { overflow: auto; min-height: 0; }
  .matrix-table { border-collapse: collapse; font-size: var(--text-sm); }
  .matrix-table th { position: sticky; top: 0; background: var(--vscode-editor-background, #1e1e1e); padding: 4px 6px; text-align: left; }
  .matrix-table tbody th { position: sticky; left: 0; }
  .matrix-table td { padding: 1px; }
  .cell { width: 34px; height: 26px; border: 1px solid var(--card-border); border-radius: 3px; background: none; cursor: pointer; }
  .cell--present { color: var(--vscode-testing-iconPassed, #73c991); }
  .cell--duplicate { color: var(--vscode-editorInfo-foreground, #3794ff); }
  .cell--missing { color: var(--vscode-errorForeground, #f66); font-weight: 700; }
  .cell--excluded { color: var(--secondary-text); opacity: 0.5; }
  .matrix-legend, .matrix-empty { color: var(--secondary-text); font-size: var(--text-sm); margin: 0; }
  .expected-editor { width: 240px; flex-shrink: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-2); }
  .expected-editor h2 { margin: 0; font-size: 0.95rem; }
  .expected-editor fieldset { border: 1px solid var(--card-border); border-radius: var(--radius-sm); }
  .expected-editor__item { display: block; font-size: var(--text-sm); }
</style>
```

- [ ] **Step 3: VocabView.svelte 구현 (스텁 교체)**

```svelte
<script lang="ts">
  import { labelTemplate, renderNamePreview } from '../../asset-manager/naming';
  import type {
    AssetCatalogMirror,
    AssetCatalogSchemaMirror,
    AssetSlotId,
    LorebookNameCandidateMirror,
  } from '../../types/assetManager';

  export let catalog: AssetCatalogMirror;
  export let lorebookCandidates: LorebookNameCandidateMirror[];
  export let tokenizePrefixes: Array<{ value: string; count: number }>;
  export let tokenizeSuffixes: Array<{ value: string; count: number }>;
  export let onUpdateVocab: (vocab: AssetCatalogMirror['vocab']) => void;
  export let onUpdateSchema: (schema: AssetCatalogSchemaMirror) => void;
  export let onAnalyzeLorebook: () => void;
  export let onBootstrap: () => void;

  let newValues: Record<string, string> = {};
  let schemaLabels: string[] = [];
  let schemaSlotCount: 1 | 2 | 3 = 2;
  let schemaSeparator = '_';
  let schemaInitialized = false;

  $: if (!schemaInitialized && catalog) {
    schemaSlotCount = catalog.schema.slots.length as 1 | 2 | 3;
    schemaLabels = catalog.schema.slots.map((slot) => slot.label);
    const parsedSeparator = /\}(.*?)\{/.exec(catalog.schema.joinTemplate);
    schemaSeparator = parsedSeparator ? parsedSeparator[1] : '_';
    schemaInitialized = true;
  }

  $: draftSchema = buildSchema(schemaSlotCount, schemaLabels, schemaSeparator);
  $: schemaSample = renderNamePreview(draftSchema, { s1: 'Elsie', s2: 'angry', s3: 'Dress' });

  function buildSchema(count: 1 | 2 | 3, labels: string[], separator: string): AssetCatalogSchemaMirror {
    const ids: AssetSlotId[] = ['s1', 's2', 's3'];
    const slots = ids.slice(0, count).map((id, index) => ({ id, label: labels[index] || id }));
    return { slots, joinTemplate: slots.map((slot) => `{${slot.id}}`).join(separator) };
  }

  function mutateVocab(slotId: AssetSlotId, mutate: (list: string[]) => string[]): void {
    const current = catalog.vocab[slotId] ?? [];
    onUpdateVocab({ ...catalog.vocab, [slotId]: mutate(current) });
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls these actions.
  function addValue(slotId: AssetSlotId): void {
    const value = (newValues[slotId] ?? '').trim();
    if (!value) return;
    newValues = { ...newValues, [slotId]: '' };
    mutateVocab(slotId, (list) => (list.includes(value) ? list : [...list, value]));
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls these actions.
  function removeValue(slotId: AssetSlotId, value: string): void {
    mutateVocab(slotId, (list) => list.filter((entry) => entry !== value));
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls these actions.
  function moveValue(slotId: AssetSlotId, value: string, delta: number): void {
    mutateVocab(slotId, (list) => {
      const index = list.indexOf(value);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return list;
      const next = [...list];
      next.splice(index, 1);
      next.splice(target, 0, value);
      return next;
    });
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls these actions.
  function adopt(slotId: AssetSlotId, value: string): void {
    mutateVocab(slotId, (list) => (list.includes(value) ? list : [...list, value]));
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls these actions.
  function applySchema(): void {
    onUpdateSchema(draftSchema);
  }

  $: lastSlotId = (catalog.schema.slots[catalog.schema.slots.length - 1]?.id ?? 's2') as AssetSlotId;
  $: candidateFolders = [...new Set(lorebookCandidates.map((candidate) => candidate.folderPath))];
</script>

<div class="vocab-layout">
  <section class="vocab-slots" aria-label="Slot vocabularies">
    {#each catalog.schema.slots as slot (slot.id)}
      <div class="vocab-column">
        <h2>{slot.label} <span class="vocab-count">{(catalog.vocab[slot.id] ?? []).length}</span></h2>
        <div class="vocab-add">
          <input
            type="text"
            placeholder="값 추가"
            bind:value={newValues[slot.id]}
            onkeydown={(event) => event.key === 'Enter' && addValue(slot.id)}
          />
          <button type="button" onclick={() => addValue(slot.id)}>+</button>
        </div>
        <ul class="vocab-list">
          {#each catalog.vocab[slot.id] ?? [] as value (value)}
            <li>
              <span class="vocab-value">{value}</span>
              <span class="vocab-item-actions">
                <button type="button" onclick={() => moveValue(slot.id, value, -1)} aria-label="Move up">↑</button>
                <button type="button" onclick={() => moveValue(slot.id, value, 1)} aria-label="Move down">↓</button>
                <button type="button" onclick={() => removeValue(slot.id, value)} aria-label="Remove">×</button>
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </section>

  <aside class="vocab-side" aria-label="Schema and candidates">
    <section class="schema-editor">
      <h2>스키마</h2>
      <label>슬롯 수
        <select bind:value={schemaSlotCount}>
          <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
        </select>
      </label>
      {#each draftSchema.slots as slot, index (slot.id)}
        <label>{slot.id} 라벨 <input type="text" bind:value={schemaLabels[index]} /></label>
      {/each}
      <label>구분자 <input type="text" bind:value={schemaSeparator} maxlength="3" /></label>
      <p class="schema-sample">미리보기: <code>{schemaSample ?? '—'}</code></p>
      <button type="button" onclick={applySchema}>스키마 저장</button>
    </section>

    <section class="candidates">
      <h2>lorebook 후보</h2>
      <button type="button" class="button-secondary" onclick={onAnalyzeLorebook}>lorebook 분석</button>
      {#each candidateFolders as folder (folder)}
        <details>
          <summary>{folder}</summary>
          {#each lorebookCandidates.filter((candidate) => candidate.folderPath === folder) as candidate (candidate.filePath)}
            <div class="candidate-row">
              <span>{candidate.name}</span>
              <button type="button" onclick={() => adopt('s1', candidate.name)}>→ s1</button>
            </div>
          {/each}
        </details>
      {/each}
    </section>

    <section class="candidates">
      <h2>파일명 부트스트랩</h2>
      <button type="button" class="button-secondary" onclick={onBootstrap}>파일명 분석</button>
      {#if tokenizePrefixes.length > 0}
        <h3>prefix → {catalog.schema.slots[0].label}</h3>
        {#each tokenizePrefixes.slice(0, 30) as cluster (cluster.value)}
          <div class="candidate-row">
            <span>{cluster.value} <em>×{cluster.count}</em></span>
            <button type="button" onclick={() => adopt('s1', cluster.value)}>채택</button>
          </div>
        {/each}
        <h3>suffix → {catalog.schema.slots[catalog.schema.slots.length - 1].label}</h3>
        {#each tokenizeSuffixes.slice(0, 30) as cluster (cluster.value)}
          <div class="candidate-row">
            <span>{cluster.value} <em>×{cluster.count}</em></span>
            <button type="button" onclick={() => adopt(lastSlotId, cluster.value)}>채택</button>
          </div>
        {/each}
      {/if}
    </section>
  </aside>
</div>

<style>
  .vocab-layout { display: flex; gap: var(--space-3); flex: 1; min-height: 0; }
  .vocab-slots { flex: 1; display: flex; gap: var(--space-3); min-width: 0; }
  .vocab-column { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  .vocab-column h2 { margin: 0; font-size: 0.95rem; }
  .vocab-count { color: var(--secondary-text); font-weight: 400; }
  .vocab-add { display: flex; gap: 4px; }
  .vocab-add input { flex: 1; min-width: 0; }
  .vocab-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
  .vocab-list li { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; font-size: var(--text-sm); }
  .vocab-value { overflow-wrap: anywhere; }
  .vocab-item-actions button { padding: 0 4px; }
  .vocab-side { width: 280px; flex-shrink: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-3); }
  .schema-editor, .candidates { display: flex; flex-direction: column; gap: var(--space-1); }
  .schema-editor h2, .candidates h2 { margin: 0; font-size: 0.95rem; }
  .candidates h3 { margin: var(--space-1) 0 0; font-size: 0.8rem; color: var(--secondary-text); }
  .candidate-row { display: flex; justify-content: space-between; align-items: center; font-size: var(--text-sm); gap: 4px; }
  .candidate-row em { color: var(--secondary-text); font-style: normal; }
  .schema-sample code { font-weight: 700; }
</style>
```

- [ ] **Step 4: OutputsView.svelte 구현 (스텁 교체)**

```svelte
<script lang="ts">
  import type { AssetCatalogMirror, AssetOutputKind } from '../../types/assetManager';

  export let catalog: AssetCatalogMirror;
  export let outputsState: {
    promptBlock?: string;
    whitelistRegex?: { inPattern: string; outPattern: string } | null;
    missingReport?: string;
  };
  export let buildSummary: {
    total: number; named: number; unassigned: number; duplicates: number; orphans: number;
  } | null;
  export let onGenerateOutputs: (kinds: AssetOutputKind[]) => void;
  export let onSaveOutput: (kind: AssetOutputKind, targetPath: string, content: string) => void;
  export let onBuildManifest: () => void;

  let promptPath = 'docs/asset-prompt-block.md';
  let regexPath = 'regex/90_asset_whitelist.risuregex';
  let reportPath = 'docs/asset-missing-report.md';

  $: whitelistDocument = outputsState.whitelistRegex
    ? [
        '---',
        'name: asset-whitelist',
        'type: editoutput',
        '---',
        '@@@ IN',
        outputsState.whitelistRegex.inPattern,
        '@@@ OUT',
        outputsState.whitelistRegex.outPattern,
        '',
      ].join('\n')
    : '';

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function copyText(text: string): void {
    void navigator.clipboard?.writeText(text);
  }
</script>

<div class="outputs-layout">
  <section class="output-card">
    <header>
      <h2>프롬프트 블록</h2>
      <div>
        <button type="button" class="button-secondary" onclick={() => onGenerateOutputs(['promptBlock'])}>생성</button>
        <button type="button" class="button-secondary" disabled={!outputsState.promptBlock} onclick={() => copyText(outputsState.promptBlock ?? '')}>복사</button>
      </div>
    </header>
    <textarea readonly rows="10" value={outputsState.promptBlock ?? ''}></textarea>
    <div class="output-save">
      <input type="text" bind:value={promptPath} />
      <button type="button" disabled={!outputsState.promptBlock} onclick={() => onSaveOutput('promptBlock', promptPath, outputsState.promptBlock ?? '')}>저장</button>
    </div>
  </section>

  <section class="output-card">
    <header>
      <h2>화이트리스트 정규식</h2>
      <div>
        <button type="button" class="button-secondary" onclick={() => onGenerateOutputs(['whitelistRegex'])}>생성</button>
        <button type="button" class="button-secondary" disabled={!whitelistDocument} onclick={() => copyText(whitelistDocument)}>복사</button>
      </div>
    </header>
    {#if outputsState.whitelistRegex === null}
      <p class="output-hint">s1 vocab이 비어 있어 생성할 수 없습니다.</p>
    {/if}
    <textarea readonly rows="10" value={whitelistDocument}></textarea>
    <div class="output-save">
      <input type="text" bind:value={regexPath} />
      <button type="button" disabled={!whitelistDocument} onclick={() => onSaveOutput('whitelistRegex', regexPath, whitelistDocument)}>저장</button>
    </div>
  </section>

  <section class="output-card">
    <header>
      <h2>Missing 리포트</h2>
      <div>
        <button type="button" class="button-secondary" onclick={() => onGenerateOutputs(['missingReport'])}>생성</button>
        <button type="button" class="button-secondary" disabled={!outputsState.missingReport} onclick={() => copyText(outputsState.missingReport ?? '')}>복사</button>
      </div>
    </header>
    <textarea readonly rows="10" value={outputsState.missingReport ?? ''}></textarea>
    <div class="output-save">
      <input type="text" bind:value={reportPath} />
      <button type="button" disabled={!outputsState.missingReport} onclick={() => onSaveOutput('missingReport', reportPath, outputsState.missingReport ?? '')}>저장</button>
    </div>
  </section>

  <section class="output-card output-card--build">
    <header>
      <h2>Manifest 빌드</h2>
      <button type="button" onclick={onBuildManifest}>Build ▶</button>
    </header>
    {#if buildSummary}
      <ul class="build-summary">
        <li>총 {buildSummary.total} entries</li>
        <li>curated name {buildSummary.named}</li>
        <li>미할당 {buildSummary.unassigned}</li>
        <li>중복 name {buildSummary.duplicates}</li>
        <li>orphan {buildSummary.orphans}</li>
      </ul>
    {:else}
      <p class="output-hint">아직 빌드하지 않았습니다. catalog 큐레이션이 manifest name에 반영됩니다.</p>
    {/if}
  </section>
</div>

<style>
  .outputs-layout {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: var(--space-3); overflow-y: auto; flex: 1; min-height: 0; align-content: start;
  }
  .output-card { display: flex; flex-direction: column; gap: var(--space-1); border: 1px solid var(--card-border); border-radius: var(--radius-sm); padding: var(--space-2); }
  .output-card header { display: flex; justify-content: space-between; align-items: center; }
  .output-card h2 { margin: 0; font-size: 0.95rem; }
  .output-card textarea { width: 100%; box-sizing: border-box; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; resize: vertical; }
  .output-save { display: flex; gap: 4px; }
  .output-save input { flex: 1; min-width: 0; }
  .output-hint { color: var(--secondary-text); font-size: var(--text-sm); margin: 0; }
  .build-summary { margin: 0; padding-left: 1.2em; font-size: var(--text-sm); }
</style>
```

주의: `.risuregex` 직렬화 형식은 위 frontmatter(`---`/`name:`/`type:`) + `@@@ IN`/`@@@ OUT` 조합을 기본으로 하되, 저장 후 workbench의 regex 에디터로 열어 파싱되는지 확인한다(E1 스모크 항목). 파싱 실패 시 playground의 기존 `regex/*.risuregex` 파일 하나를 열어 실제 형식(키 이름, type 값 목록)에 맞춰 `whitelistDocument` 조립부만 수정한다.

- [ ] **Step 5: 빌드 + 전체 webview 테스트**

```bash
npm --workspace risu-workbench-webview run check
npm --workspace risu-workbench-webview run build
npm --workspace risu-workbench-webview run test
```

Expected: 전부 성공. `bind:value={newValues[slot.id]}` 같은 인덱스 바인딩이 `check`에서 에러가 되면 D4 Step 3과 동일하게 `value={...}` + `onchange` 조합으로 바꾼다.

- [ ] **Step 6: 커밋**

```bash
git add packages/webview/src/lib/components/asset-manager/ packages/webview/src/AssetManagerApp.svelte
git commit -m "feat(asset-manager-webview) : matrix, vocab, outputs views with grid jump"
```

---

### Task E1: 전체 검증 + 수동 스모크 + 문서 마감

**Files:**
- Modify(필요 시): 스모크에서 발견된 결함 수정
- Modify: `docs/superpowers/specs/2026-07-04-asset-manager-design.md` (아래 "구현 편차" 절 추가)

**Interfaces:** 없음 (검증 태스크)

- [ ] **Step 1: 전체 빌드/테스트 일괄 실행**

```bash
npm run build:core
npm --workspace risu-workbench-core run test
npm --workspace risu-workbench-webview run check && npm --workspace risu-workbench-webview run build && npm --workspace risu-workbench-webview run test
npm --workspace risu-workbench-vscode run build:extension && npm --workspace risu-workbench-vscode run build:test:e2e
node --test packages/vscode/dist-tests/tests/e2e/*.test.js
```

Expected: 전부 PASS. 실패 시 해당 태스크로 돌아가 수정 후 재실행.

- [ ] **Step 2: CLI 스모크 (실데이터)**

```bash
node packages/core/bin/risu-core.js assets --in "/home/noel/projects/workspace/risuai-workbench-workspace/playground/260507/target/character_Alternate_Hunters_V2" --check
node packages/core/bin/risu-core.js analyze --type lorebook-names "/home/noel/projects/workspace/risuai-workbench-workspace/playground/260507/target/character_Alternate_Hunters_V2" | head -40
```

Expected: --check는 catalog 부재 안내(아직 큐레이션 전), lorebook-names는 폴더별 후보 목록 출력. 에러/스택트레이스 없음.

- [ ] **Step 3: 확장 수동 스모크 (F5)**

`npm run build:extension-dev` 후 VS Code에서 확장 개발 호스트 실행, playground `260507/target` 폴더를 워크스페이스로 열고 체크리스트:

1. 사이드바에서 character 카드 선택 → Assets 아코디언에 카운트 + "Open Asset Manager" 버튼 표시 (파일 목록 없음).
2. 버튼 클릭 → 메인 영역에 Asset Manager 탭 오픈. 같은 카드에서 재클릭 → 새 탭이 아니라 기존 탭 reveal.
3. 첫 실행 스키마 모달 표시(catalog 부재 시) → "3슬롯으로 보임" 힌트 여부 확인(Merry Sisters는 3슬롯 파일명) → 확정 시 `assets/asset-catalog.json` 생성 확인.
4. Grid: 2,000+ 파일에서 스크롤이 매끄러운지(가상화 동작 — DOM 노드 수가 화면 분량인지 개발자도구로 확인), 타일 크기 슬라이더, 필터/검색/정렬 동작.
5. ctrl/shift 다중 선택 → Inspector에서 슬롯 부여 → 타일 name/배지 갱신 + catalog 파일 반영 확인.
6. 더블클릭 → 모달: 이미지·해상도·용량 + (AI 생성 이미지면) generation 필드 표시, ←/→ 탐색, Escape 닫기.
7. Vocab: lorebook 분석 → 폴더 그룹 후보 → s1 채택. 파일명 분석 → prefix/suffix 후보 채택. tokenize 제안 적용 → 할당 일괄 생성.
8. Matrix: 셀 상태 표시, 셀 클릭 → Grid 점프 + 필터 적용, expected 체크박스 편집 → missing 재계산.
9. Outputs: 3종 생성/복사/저장(기본 경로), 저장된 `.risuregex`를 workbench regex 에디터로 열어 파싱 확인. Build ▶ → 요약 표시 + `manifest.json`에 curated name 반영 확인.
10. `risu-core assets --in <dir>` 재실행 → 큐레이션 name이 보존되는지 확인 (재빌드 안전성 — 스펙 핵심 요구).

- [ ] **Step 4: 스펙에 구현 편차 기록**

`docs/superpowers/specs/2026-07-04-asset-manager-design.md` 말미에 추가:

```markdown
## 12. 구현 편차 (v1)

- §7.1 "확장자 잔재 제거" 독립 액션: 별도 일괄 strip 대신 tokenize 제안 적용으로 대체.
  자동 strip은 기존 배포 팩(name에 `.webp` 잔재를 포함한 채 프롬프트/정규식이 참조)과의
  호환성을 깨뜨릴 수 있어 의도적으로 제외. fileStem 표시는 잔재를 제거해 보여줌.
- §7.1 orphan: 그리드 필터 칩이 아니라 툴바 카운트 + 일괄 정리 버튼으로 구현
  (orphan은 파일이 없는 할당이라 그리드 타일로 표현 불가).
- §8 catalog 저장 debounce: 모든 편집이 명시적 버튼 단위 배치라 debounce 불필요로 판명.
```

- [ ] **Step 5: 최종 커밋**

```bash
git add -A docs/superpowers/specs/2026-07-04-asset-manager-design.md
git commit -m "docs(asset-manager) : record v1 implementation deviations after smoke verification"
```

---

## Execution Handoff

Plan complete. 실행 순서는 A1→A2→A3→A4→A5→A6→B1→B2→C1→C2→C3→C4→D1→D2→D3→D4→D5→E1 (Phase 내 의존성 순).







