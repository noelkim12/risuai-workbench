# Catalog Bootstrap 그룹별 분할 Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catalog Bootstrap에서 전역 조각 수 규칙과 안 맞는 그룹(예: Rivea)을 자동 감지해 모달에 경고하고, 그룹(첫 토큰) 단위로 s1/s2 조각 수 override를 지정할 수 있게 한다.

**Architecture:** core에 `groupOverrides` 분할 적용 + `summarizeAssetCatalogBootstrapGroups` 순수 감지 함수를 추가하고, extension이 preview 응답에 그룹 요약을 동봉하며, 모달은 "그룹별 규칙" 섹션에서 override를 편집해 같은 `split` payload로 preview/apply 한다.

**Tech Stack:** TypeScript, Svelte 5(webview), vitest(core/webview), node:test 기반 boundary 테스트(vscode).

**Spec:** `docs/superpowers/specs/2026-07-05-catalog-bootstrap-group-override-design.md`

## Global Constraints

- 그룹 키는 이름을 실제 사용 구분자(`actualSeparator` 결과)로 분할한 **첫 토큰**, 대소문자 구분.
- 감지 신호 ⓐ `insufficient-tokens`: 유효 조각 수 규칙(override 우선, 없으면 전역) 기준 `토큰 수 < (비마지막 슬롯 count 합) + 1`인 항목이 그룹에 1개 이상.
- 감지 신호 ⓑ `vocab-overlap`: 그룹의 s1 값이 2종 이상 + 어떤 s1 값의 마지막 토큰이 **다른** 그룹들의 마지막 슬롯 값 토큰 집합에 존재.
- 감지는 경고까지만 — 자동 적용 없음. override 값은 항상 사용자가 지정.
- `summarizeAssetCatalogBootstrapGroups`는 slice(0, 80) 이전의 **전체** preview로 계산한다.
- 조각 수 입력은 UI `min=1 max=8`, 메시지 검증은 양의 정수만 허용.
- webview 프로토콜 타입 미러 규칙: `packages/vscode/src/asset-manager/assetManagerTypes.ts`와 `packages/webview/src/lib/types/assetManager.ts`는 항상 함께 수정.
- 커밋 메시지는 기존 컨벤션 `feat(core|vscode|webview) : ...` / `test(...) : ...` 형태.

---

### Task 1: core — `groupOverrides` 분할 적용

**Files:**
- Modify: `packages/core/src/node/asset-catalog-bootstrap.ts`
- Modify: `packages/core/src/node/index.ts` (export 추가)
- Test: `packages/core/tests/asset-catalog-bootstrap-groups.test.ts` (신규)

**Interfaces:**
- Consumes: 기존 `previewAssetCatalogBootstrapEntries(catalog, entries, split?, allNames?)`, `createDefaultAssetCatalog()`(2슬롯 `{s1}_{s2}` 스키마).
- Produces: `AssetCatalogBootstrapGroupOverride { firstToken: string; slotTokenCounts: Partial<Record<AssetSlotId, number>> }`, `AssetCatalogBootstrapSplitOptions.groupOverrides?: readonly AssetCatalogBootstrapGroupOverride[]`. Task 2가 내부 헬퍼 `effectiveSlotTokenCounts`를 재사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/tests/asset-catalog-bootstrap-groups.test.ts` 생성:

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultAssetCatalog } from '../src/domain/asset/catalog';
import {
  bootstrapAssetCatalogFromEntries,
  previewAssetCatalogBootstrapEntries,
  type AssetCatalogBootstrapSplitOptions,
} from '../src/node/asset-catalog-bootstrap';

const ENTRIES = [
  { path: 'additional/Park_Hye-in_acting_coy.png', name: 'Park_Hye-in_acting_coy' },
  { path: 'additional/Park_Hye-in_angry.png', name: 'Park_Hye-in_angry' },
  { path: 'additional/Rivea_acting_coy.png', name: 'Rivea_acting_coy' },
  { path: 'additional/Rivea_angry.png', name: 'Rivea_angry' },
] as const;

describe('bootstrap split with groupOverrides', () => {
  it('applies group token counts for matching first tokens only', () => {
    const split: AssetCatalogBootstrapSplitOptions = {
      separator: '_',
      slotTokenCounts: { s1: 2 },
      groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }],
    };
    const preview = previewAssetCatalogBootstrapEntries(createDefaultAssetCatalog(), ENTRIES, split);
    expect(preview.map((entry) => entry.slots)).toEqual([
      { s1: 'Park_Hye-in', s2: 'acting_coy' },
      { s1: 'Park_Hye-in', s2: 'angry' },
      { s1: 'Rivea', s2: 'acting_coy' },
      { s1: 'Rivea', s2: 'angry' },
    ]);
  });

  it('falls back to global counts when no override matches', () => {
    const split: AssetCatalogBootstrapSplitOptions = {
      separator: '_',
      slotTokenCounts: { s1: 2 },
      groupOverrides: [{ firstToken: 'Nobody', slotTokenCounts: { s1: 1 } }],
    };
    const preview = previewAssetCatalogBootstrapEntries(createDefaultAssetCatalog(), [ENTRIES[0]], split);
    expect(preview[0]?.slots).toEqual({ s1: 'Park_Hye-in', s2: 'acting_coy' });
  });

  it('applies overrides through bootstrapAssetCatalogFromEntries and builds clean vocab', () => {
    const split: AssetCatalogBootstrapSplitOptions = {
      separator: '_',
      slotTokenCounts: { s1: 2 },
      groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }],
    };
    const catalog = bootstrapAssetCatalogFromEntries(createDefaultAssetCatalog(), [...ENTRIES], { mode: 'full', split });
    expect(catalog.vocab.s1).toEqual(['Park_Hye-in', 'Rivea']);
    expect(catalog.vocab.s2).toEqual(['acting_coy', 'angry']);
    expect(catalog.assignments['additional/Rivea_acting_coy.png']).toEqual({ s1: 'Rivea', s2: 'acting_coy' });
  });

  it('works when only an override exists without global counts', () => {
    const split: AssetCatalogBootstrapSplitOptions = {
      separator: '_',
      groupOverrides: [{ firstToken: 'Park', slotTokenCounts: { s1: 2 } }],
    };
    const preview = previewAssetCatalogBootstrapEntries(createDefaultAssetCatalog(), [ENTRIES[0]], split);
    expect(preview[0]?.slots).toEqual({ s1: 'Park_Hye-in', s2: 'acting_coy' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-catalog-bootstrap-groups.test.ts`
Expected: FAIL — `groupOverrides`가 타입에 없어 TS 에러이거나, 첫 테스트에서 Rivea가 `{ s1: 'Rivea_acting', s2: 'coy' }`로 나와 assertion 실패.

- [ ] **Step 3: 구현**

`packages/core/src/node/asset-catalog-bootstrap.ts` 수정.

(1) 타입 추가 — `AssetCatalogBootstrapSplitOptions` 정의를 다음으로 교체:

```ts
export interface AssetCatalogBootstrapGroupOverride {
  readonly firstToken: string;
  readonly slotTokenCounts: Partial<Record<AssetSlotId, number>>;
}

export interface AssetCatalogBootstrapSplitOptions {
  readonly separator?: string;
  readonly slotTokenCounts?: Partial<Record<AssetSlotId, number>>;
  readonly groupOverrides?: readonly AssetCatalogBootstrapGroupOverride[];
}
```

(2) 유효 조각 수 결정 헬퍼 추가 (`configuredSplit` 함수 위):

```ts
function effectiveSlotTokenCounts(
  firstToken: string | undefined,
  split?: AssetCatalogBootstrapSplitOptions,
): Partial<Record<AssetSlotId, number>> | undefined {
  const override =
    firstToken === undefined ? undefined : split?.groupOverrides?.find((entry) => entry.firstToken === firstToken);
  return override?.slotTokenCounts ?? split?.slotTokenCounts;
}
```

(3) `configuredSplit`이 `split` 대신 결정된 counts를 받도록 시그니처 변경:

```ts
function configuredSplit(
  words: readonly string[],
  slotIds: readonly AssetSlotId[],
  counts: Partial<Record<AssetSlotId, number>> | undefined,
): readonly string[] | null {
  if (counts === undefined || Object.keys(counts).length === 0) return null;
  const parts: string[] = [];
  let offset = 0;
  for (let index = 0; index < slotIds.length; index += 1) {
    const slotId = slotIds[index];
    const isLast = index === slotIds.length - 1;
    const size = isLast ? words.length - offset : counts[slotId] ?? 1;
    if (size <= 0 || offset + size > words.length) return null;
    parts.push(words.slice(offset, offset + size).join(' '));
    offset += size;
  }
  return offset === words.length ? parts : null;
}
```

(4) `inferSlotsFromName`의 호출부 한 줄 교체:

```ts
  const configured = configuredSplit(words, slotIds, effectiveSlotTokenCounts(words[0], split));
```

(5) `packages/core/src/node/index.ts`의 asset-catalog-bootstrap import/export 블록 두 곳(값 export와 타입 export)에 `type AssetCatalogBootstrapGroupOverride,` 추가 (기존 `type AssetCatalogBootstrapEntry,` 라인 옆).

- [ ] **Step 4: 테스트 통과 확인 + 기존 회귀 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-catalog-bootstrap-groups.test.ts tests/asset-manifest-merge.test.ts`
Expected: 전부 PASS (기존 `asset-manifest-merge.test.ts`의 configuredSplit 경로 회귀 없음).

- [ ] **Step 5: 커밋**

```bash
git add packages/core/src/node/asset-catalog-bootstrap.ts packages/core/src/node/index.ts packages/core/tests/asset-catalog-bootstrap-groups.test.ts
git commit -m "feat(core) : apply per-group token count overrides in catalog bootstrap split"
```

---

### Task 2: core — `summarizeAssetCatalogBootstrapGroups` 감지 함수

**Files:**
- Modify: `packages/core/src/node/asset-catalog-bootstrap.ts`
- Modify: `packages/core/src/node/index.ts`
- Test: `packages/core/tests/asset-catalog-bootstrap-groups.test.ts` (describe 블록 추가)

**Interfaces:**
- Consumes: Task 1의 `effectiveSlotTokenCounts`, 기존 내부 헬퍼 `splitAssetName`, `actualSeparator`, `primaryJoinSeparator`, `AssetCatalogBootstrapPreviewEntry`.
- Produces (Task 3·5가 사용):

```ts
export type AssetCatalogBootstrapAnomalyReason = 'insufficient-tokens' | 'vocab-overlap';
export interface AssetCatalogBootstrapGroupSummary {
  readonly firstToken: string;
  readonly entryCount: number;
  readonly tokenCountMin: number;
  readonly tokenCountMax: number;
  readonly anomalies: readonly AssetCatalogBootstrapAnomalyReason[];
}
export function summarizeAssetCatalogBootstrapGroups(
  catalog: AssetCatalog,
  preview: readonly AssetCatalogBootstrapPreviewEntry[],
  split?: AssetCatalogBootstrapSplitOptions,
): readonly AssetCatalogBootstrapGroupSummary[];
```

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/tests/asset-catalog-bootstrap-groups.test.ts`에 import와 describe 추가:

```ts
import { summarizeAssetCatalogBootstrapGroups } from '../src/node/asset-catalog-bootstrap';

function summarize(entries: readonly { path: string; name: string }[], split: AssetCatalogBootstrapSplitOptions) {
  const catalog = createDefaultAssetCatalog();
  return summarizeAssetCatalogBootstrapGroups(catalog, previewAssetCatalogBootstrapEntries(catalog, entries, split), split);
}

describe('summarizeAssetCatalogBootstrapGroups', () => {
  const SPLIT: AssetCatalogBootstrapSplitOptions = { separator: '_', slotTokenCounts: { s1: 2 } };

  it('flags insufficient-tokens when a name cannot satisfy the configured counts', () => {
    const groups = summarize(
      [
        { path: 'a/Park_Hye-in_angry.png', name: 'Park_Hye-in_angry' },
        { path: 'a/Rivea_angry.png', name: 'Rivea_angry' },
      ],
      SPLIT,
    );
    const rivea = groups.find((group) => group.firstToken === 'Rivea');
    expect(rivea?.anomalies).toContain('insufficient-tokens');
    expect(groups.find((group) => group.firstToken === 'Park')?.anomalies).toEqual([]);
  });

  it('flags vocab-overlap when fragmented s1 last tokens appear in other groups s2 tokens', () => {
    const groups = summarize(
      [
        { path: 'a/Park_Hye-in_acting_coy.png', name: 'Park_Hye-in_acting_coy' },
        { path: 'a/Park_Hye-in_blushing_shyly.png', name: 'Park_Hye-in_blushing_shyly' },
        { path: 'a/Rivea_acting_coy.png', name: 'Rivea_acting_coy' },
        { path: 'a/Rivea_blushing_shyly.png', name: 'Rivea_blushing_shyly' },
      ],
      SPLIT,
    );
    // Rivea 3조각 이름들: s1=Rivea_acting/Rivea_blushing 으로 파편화, 마지막 토큰 acting/blushing이
    // Park 그룹 s2(acting_coy/blushing_shyly)의 토큰 집합에 존재 → 오분할 의심
    expect(groups.find((group) => group.firstToken === 'Rivea')?.anomalies).toContain('vocab-overlap');
    expect(groups.find((group) => group.firstToken === 'Park')?.anomalies).toEqual([]);
  });

  it('clears anomalies once a correct override is applied', () => {
    const overridden: AssetCatalogBootstrapSplitOptions = {
      ...SPLIT,
      groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }],
    };
    const groups = summarize(
      [
        { path: 'a/Park_Hye-in_acting_coy.png', name: 'Park_Hye-in_acting_coy' },
        { path: 'a/Rivea_acting_coy.png', name: 'Rivea_acting_coy' },
        { path: 'a/Rivea_angry.png', name: 'Rivea_angry' },
      ],
      overridden,
    );
    expect(groups.find((group) => group.firstToken === 'Rivea')?.anomalies).toEqual([]);
  });

  it('reports counts and sorts anomalous groups first, then by entry count desc', () => {
    const groups = summarize(
      [
        { path: 'a/Park_Hye-in_angry.png', name: 'Park_Hye-in_angry' },
        { path: 'a/Park_Hye-in_bored.png', name: 'Park_Hye-in_bored' },
        { path: 'a/Park_Hye-in_acting_coy.png', name: 'Park_Hye-in_acting_coy' },
        { path: 'a/Rivea_angry.png', name: 'Rivea_angry' },
      ],
      SPLIT,
    );
    expect(groups.map((group) => group.firstToken)).toEqual(['Rivea', 'Park']);
    expect(groups[1]).toMatchObject({ entryCount: 3, tokenCountMin: 3, tokenCountMax: 4 });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-catalog-bootstrap-groups.test.ts`
Expected: FAIL — `summarizeAssetCatalogBootstrapGroups` 미정의 (import 에러).

- [ ] **Step 3: 구현**

`packages/core/src/node/asset-catalog-bootstrap.ts` 끝부분에 추가:

```ts
export type AssetCatalogBootstrapAnomalyReason = 'insufficient-tokens' | 'vocab-overlap';

export interface AssetCatalogBootstrapGroupSummary {
  readonly firstToken: string;
  readonly entryCount: number;
  readonly tokenCountMin: number;
  readonly tokenCountMax: number;
  readonly anomalies: readonly AssetCatalogBootstrapAnomalyReason[];
}

interface MutableGroupStats {
  tokenCounts: number[];
  firstSlotValues: Set<string>;
  lastSlotTokens: Set<string>;
  insufficient: boolean;
}

function minimumConfiguredTokens(slotIds: readonly AssetSlotId[], counts: Partial<Record<AssetSlotId, number>>): number {
  let total = 1; // 마지막 슬롯은 최소 1조각
  for (let index = 0; index < slotIds.length - 1; index += 1) total += counts[slotIds[index]] ?? 1;
  return total;
}

export function summarizeAssetCatalogBootstrapGroups(
  catalog: AssetCatalog,
  preview: readonly AssetCatalogBootstrapPreviewEntry[],
  split?: AssetCatalogBootstrapSplitOptions,
): readonly AssetCatalogBootstrapGroupSummary[] {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);
  const firstSlotId = slotIds[0];
  const lastSlotId = slotIds[slotIds.length - 1];
  const separator = actualSeparator(
    split?.separator ?? primaryJoinSeparator(catalog.schema.joinTemplate),
    preview.map((entry) => entry.name),
  );

  const stats = new Map<string, MutableGroupStats>();
  for (const entry of preview) {
    const words = splitAssetName(entry.name, separator);
    const firstToken = words[0];
    if (firstToken === undefined) continue;
    const group = stats.get(firstToken) ?? {
      tokenCounts: [],
      firstSlotValues: new Set<string>(),
      lastSlotTokens: new Set<string>(),
      insufficient: false,
    };
    group.tokenCounts.push(words.length);
    const counts = effectiveSlotTokenCounts(firstToken, split);
    if (counts !== undefined && Object.keys(counts).length > 0 && words.length < minimumConfiguredTokens(slotIds, counts)) {
      group.insufficient = true;
    }
    const firstSlotValue = entry.slots?.[firstSlotId];
    if (firstSlotValue !== undefined) group.firstSlotValues.add(firstSlotValue);
    const lastSlotValue = entry.slots?.[lastSlotId];
    if (lastSlotValue !== undefined) for (const token of splitAssetName(lastSlotValue, separator)) group.lastSlotTokens.add(token);
    stats.set(firstToken, group);
  }

  const summaries = [...stats.entries()].map(([firstToken, group]) => {
    const anomalies: AssetCatalogBootstrapAnomalyReason[] = [];
    if (group.insufficient) anomalies.push('insufficient-tokens');
    if (group.firstSlotValues.size >= 2 && hasForeignLastTokenOverlap(firstToken, group, stats, separator)) {
      anomalies.push('vocab-overlap');
    }
    return {
      firstToken,
      entryCount: group.tokenCounts.length,
      tokenCountMin: Math.min(...group.tokenCounts),
      tokenCountMax: Math.max(...group.tokenCounts),
      anomalies,
    };
  });

  return summaries.sort((left, right) => {
    if ((left.anomalies.length > 0) !== (right.anomalies.length > 0)) return left.anomalies.length > 0 ? -1 : 1;
    if (left.entryCount !== right.entryCount) return right.entryCount - left.entryCount;
    return left.firstToken.localeCompare(right.firstToken);
  });
}

function hasForeignLastTokenOverlap(
  firstToken: string,
  group: MutableGroupStats,
  stats: ReadonlyMap<string, MutableGroupStats>,
  separator: string,
): boolean {
  const foreignTokens = new Set<string>();
  for (const [otherToken, other] of stats) {
    if (otherToken === firstToken) continue;
    for (const token of other.lastSlotTokens) foreignTokens.add(token);
  }
  if (foreignTokens.size === 0) return false;
  for (const value of group.firstSlotValues) {
    const tokens = splitAssetName(value, separator);
    const lastToken = tokens[tokens.length - 1];
    if (tokens.length >= 2 && lastToken !== undefined && foreignTokens.has(lastToken)) return true;
  }
  return false;
}
```

주의: `hasForeignLastTokenOverlap`은 s1 값이 단일 토큰이면(`tokens.length >= 2` 조건) 겹침으로 치지 않는다 — 파편화된 "복합 s1"만 오분할 의심이다.

`packages/core/src/node/index.ts` export 블록에 추가: `summarizeAssetCatalogBootstrapGroups` (값), `type AssetCatalogBootstrapAnomalyReason`, `type AssetCatalogBootstrapGroupSummary` (타입).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-core run test -- tests/asset-catalog-bootstrap-groups.test.ts`
Expected: PASS (Task 1 테스트 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git add packages/core/src/node/asset-catalog-bootstrap.ts packages/core/src/node/index.ts packages/core/tests/asset-catalog-bootstrap-groups.test.ts
git commit -m "feat(core) : detect bootstrap split anomalies per first-token group"
```

---

### Task 3: vscode — 메시지 검증 + preview 응답에 groups 동봉

**Files:**
- Modify: `packages/vscode/src/asset-manager/assetManagerTypes.ts`
- Modify: `packages/vscode/src/asset-manager/assetManagerMessages.ts`
- Modify: `packages/vscode/src/asset-manager/AssetManagerService.ts`
- Modify: `packages/vscode/src/asset-manager/AssetManagerPanel.ts`
- Test: `packages/vscode/tests/e2e/asset-manager-boundary.test.ts`

**Interfaces:**
- Consumes: Task 1·2의 core export (`AssetCatalogBootstrapGroupSummary`, `summarizeAssetCatalogBootstrapGroups`, 확장된 `AssetCatalogBootstrapSplitOptions`).
- Produces: `AssetManagerCatalogBootstrapPreviewPayload`에 `readonly groups: readonly AssetCatalogBootstrapGroupSummary[]` 추가. `AssetManagerService.previewCatalogBootstrap`의 반환이 `{ rows, groups }` 객체로 변경됨 (Task 4의 webview 미러가 의존).

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/vscode/tests/e2e/asset-manager-boundary.test.ts`의 기존 `previewCatalogBootstrap` valid-메시지 assert 아래에 groupOverrides 케이스를 추가하고, reject 테스트와 서비스 테스트를 추가:

(1) `'asset manager accepts valid webview messages'` 테스트 내부, 기존 previewCatalogBootstrap assert 다음에:

```ts
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/previewCatalogBootstrap', {
        stableId: 'abc',
        source: 'filename',
        mode: 'full',
        split: {
          separator: '_',
          slotTokenCounts: { s1: 2 },
          groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }],
        },
      }),
    ),
    true,
  );
```

(2) `'asset manager rejects traversal paths absolute output targets and wrong protocol'` 테스트 내부에 추가:

```ts
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/previewCatalogBootstrap', {
        stableId: 'abc',
        source: 'filename',
        mode: 'full',
        split: { separator: '_', groupOverrides: [{ firstToken: '', slotTokenCounts: { s1: 1 } }] },
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/previewCatalogBootstrap', {
        stableId: 'abc',
        source: 'filename',
        mode: 'full',
        split: { separator: '_', groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 0 } }] },
      }),
    ),
    false,
  );
```

(3) 기존 `'service previews configured catalog bootstrap without saving'` 테스트를 새 반환 형태로 교체:

```ts
test('service previews configured catalog bootstrap without saving', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-preview-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'Ahn_Do-hyun_angry.png'), Buffer.from([1]));
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'Rivea_angry.png'), Buffer.from([2]));

    const service = new serviceModule.AssetManagerService(workDir);
    const { rows, groups } = service.previewCatalogBootstrap({
      source: 'filename',
      mode: 'full',
      split: {
        separator: '_',
        slotTokenCounts: { s1: 2 },
        groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }],
      },
    });

    assert.deepEqual(rows.find((row) => row.name === 'Ahn_Do-hyun_angry')?.slots, { s1: 'Ahn_Do-hyun', s2: 'angry' });
    assert.deepEqual(rows.find((row) => row.name === 'Rivea_angry')?.slots, { s1: 'Rivea', s2: 'angry' });
    assert.deepEqual(
      groups.map((group) => group.firstToken).sort(),
      ['Ahn', 'Rivea'],
    );
    assert.deepEqual(groups.find((group) => group.firstToken === 'Rivea')?.anomalies, []);
    assert.equal(fs.existsSync(path.join(workDir, 'assets', 'asset-catalog.json')), false);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm --workspace risu-workbench-vscode run test:e2e:cbs-client:boundary`
Expected: FAIL — groupOverrides reject 케이스가 `true`로 통과(검증 미구현)하고, 서비스 테스트에서 `{ rows, groups }` 구조 분해 결과 `groups` undefined.

- [ ] **Step 3: 구현**

(1) `assetManagerTypes.ts` — core import에 타입 추가 및 payload 확장:

```ts
import type { AssetCatalogBootstrapGroupSummary, AssetCatalogBootstrapSplitOptions, ImageMeta } from 'risu-workbench-core/node';
```

`AssetManagerCatalogBootstrapPreviewPayload`를 다음으로 교체:

```ts
export interface AssetManagerCatalogBootstrapPreviewPayload extends AssetManagerStableIdPayload {
  readonly rows: readonly AssetManagerCatalogBootstrapPreviewEntry[];
  readonly groups: readonly AssetCatalogBootstrapGroupSummary[];
}
```

(2) `assetManagerMessages.ts` — `isCatalogBootstrapSplitOptions` 위에 추가:

```ts
function isSlotTokenCountsRecord(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    Object.entries(value).every(
      ([key, count]) => ASSET_SLOT_IDS.includes(key) && typeof count === 'number' && Number.isInteger(count) && count > 0,
    )
  );
}

function isCatalogBootstrapGroupOverride(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    typeof value.firstToken === 'string' &&
    value.firstToken.length > 0 &&
    isSlotTokenCountsRecord(value.slotTokenCounts)
  );
}
```

`isCatalogBootstrapSplitOptions`를 다음으로 교체 (기존 counts 인라인 검증을 `isSlotTokenCountsRecord`로 치환 + groupOverrides 추가):

```ts
function isCatalogBootstrapSplitOptions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isPlainRecord(value)) return false;
  return (
    (value.separator === undefined || typeof value.separator === 'string') &&
    (value.slotTokenCounts === undefined || isSlotTokenCountsRecord(value.slotTokenCounts)) &&
    (value.groupOverrides === undefined ||
      (Array.isArray(value.groupOverrides) && value.groupOverrides.every(isCatalogBootstrapGroupOverride)))
  );
}
```

(3) `AssetManagerService.ts` — import에 `summarizeAssetCatalogBootstrapGroups`와 `type AssetCatalogBootstrapGroupSummary` 추가 (기존 `previewAssetCatalogBootstrapEntries` import 옆). `previewCatalogBootstrap`을 교체:

```ts
  previewCatalogBootstrap(options: Pick<AssetManagerBootstrapCatalogPayload, 'source' | 'mode' | 'split'>): {
    readonly rows: readonly AssetManagerCatalogBootstrapPreviewEntry[];
    readonly groups: readonly AssetCatalogBootstrapGroupSummary[];
  } {
    const catalog = this.loadCatalog().catalog;
    const preview = previewAssetCatalogBootstrapEntries(catalog, this.bootstrapEntries(options.source), options.split);
    return {
      rows: preview.slice(0, 80),
      groups: summarizeAssetCatalogBootstrapGroups(catalog, preview, options.split),
    };
  }
```

(4) `AssetManagerPanel.ts` — `previewCatalogBootstrap` 케이스에서 `rows:` 래핑을 spread로 교체:

```ts
        case 'asset-manager/previewCatalogBootstrap':
          this.post(
            createAssetManagerExtensionMessage('asset-manager/catalogBootstrapPreview', {
              stableId,
              ...this.service.previewCatalogBootstrap({
                source: message.payload.source,
                mode: message.payload.mode,
                split: message.payload.split,
              }),
            }),
          );
          return;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-vscode run test:e2e:cbs-client:boundary`
Expected: PASS (빌드 포함 — webview 빌드가 선행되므로 Task 4 이전에는 webview 미러 타입이 아직 없어도 무방; webview는 별도 컴파일 대상).

- [ ] **Step 5: 커밋**

```bash
git add packages/vscode/src/asset-manager/assetManagerTypes.ts packages/vscode/src/asset-manager/assetManagerMessages.ts packages/vscode/src/asset-manager/AssetManagerService.ts packages/vscode/src/asset-manager/AssetManagerPanel.ts packages/vscode/tests/e2e/asset-manager-boundary.test.ts
git commit -m "feat(vscode) : ship bootstrap group summaries and validate groupOverrides payload"
```

---

### Task 4: webview — 타입 미러 + override 순수 헬퍼 모듈

**Files:**
- Modify: `packages/webview/src/lib/types/assetManager.ts`
- Create: `packages/webview/src/lib/asset-manager/bootstrapGroups.ts`
- Test: `packages/webview/tests/lib/asset-manager/bootstrapGroups.test.ts` (신규)

**Interfaces:**
- Consumes: Task 3이 확정한 프로토콜(`groups` payload, `groupOverrides` split 필드).
- Produces (Task 5의 모달이 사용):

```ts
// types/assetManager.ts
export type AssetCatalogBootstrapAnomalyReason = 'insufficient-tokens' | 'vocab-overlap';
export interface AssetCatalogBootstrapGroupSummaryMirror {
  readonly firstToken: string;
  readonly entryCount: number;
  readonly tokenCountMin: number;
  readonly tokenCountMax: number;
  readonly anomalies: readonly AssetCatalogBootstrapAnomalyReason[];
}
export interface AssetCatalogBootstrapGroupOverride {
  readonly firstToken: string;
  readonly slotTokenCounts: Partial<Record<AssetSlotId, number>>;
}
// AssetCatalogBootstrapSplitOptions에 groupOverrides?: readonly AssetCatalogBootstrapGroupOverride[] 추가
// catalogBootstrapPreview payload에 groups: readonly AssetCatalogBootstrapGroupSummaryMirror[] 추가

// bootstrapGroups.ts
export interface GroupTokenCounts { readonly s1: number; readonly s2: number }
export function anomalyLabel(reason: AssetCatalogBootstrapAnomalyReason): string;
export function buildGroupOverrides(
  edited: ReadonlyMap<string, GroupTokenCounts>,
  globalCounts: GroupTokenCounts,
): readonly AssetCatalogBootstrapGroupOverride[];
export function pruneStaleOverrides(
  edited: ReadonlyMap<string, GroupTokenCounts>,
  groups: readonly AssetCatalogBootstrapGroupSummaryMirror[],
): Map<string, GroupTokenCounts>;
```

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/webview/tests/lib/asset-manager/bootstrapGroups.test.ts` 생성:

```ts
import { describe, expect, it } from 'vitest';
import {
  anomalyLabel,
  buildGroupOverrides,
  pruneStaleOverrides,
} from '../../../src/lib/asset-manager/bootstrapGroups';
import type { AssetCatalogBootstrapGroupSummaryMirror } from '../../../src/lib/types/assetManager';

const GROUPS: readonly AssetCatalogBootstrapGroupSummaryMirror[] = [
  { firstToken: 'Rivea', entryCount: 24, tokenCountMin: 2, tokenCountMax: 5, anomalies: ['insufficient-tokens'] },
  { firstToken: 'Park', entryCount: 90, tokenCountMin: 3, tokenCountMax: 6, anomalies: [] },
];

describe('bootstrapGroups helpers', () => {
  it('drops overrides equal to the global counts', () => {
    const edited = new Map([
      ['Rivea', { s1: 1, s2: 1 }],
      ['Park', { s1: 2, s2: 1 }],
    ]);
    expect(buildGroupOverrides(edited, { s1: 2, s2: 1 })).toEqual([
      { firstToken: 'Rivea', slotTokenCounts: { s1: 1, s2: 1 } },
    ]);
  });

  it('returns an empty array when nothing differs from global', () => {
    expect(buildGroupOverrides(new Map([['Park', { s1: 2, s2: 1 }]]), { s1: 2, s2: 1 })).toEqual([]);
  });

  it('prunes overrides whose group disappeared from the latest preview', () => {
    const edited = new Map([
      ['Rivea', { s1: 1, s2: 1 }],
      ['Ghost', { s1: 3, s2: 1 }],
    ]);
    const pruned = pruneStaleOverrides(edited, GROUPS);
    expect([...pruned.keys()]).toEqual(['Rivea']);
  });

  it('maps anomaly reasons to Korean labels', () => {
    expect(anomalyLabel('insufficient-tokens')).toBe('지정한 조각 수를 적용할 수 없는 항목 있음');
    expect(anomalyLabel('vocab-overlap')).toBe('다른 그룹의 뒷슬롯 어휘와 겹침 (오분할 의심)');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm --workspace risu-workbench-webview run test -- tests/lib/asset-manager/bootstrapGroups.test.ts`
Expected: FAIL — 모듈/타입 미존재.

- [ ] **Step 3: 구현**

(1) `packages/webview/src/lib/types/assetManager.ts` — `AssetCatalogBootstrapSplitOptions` 정의를 다음으로 교체:

```ts
export type AssetCatalogBootstrapAnomalyReason = 'insufficient-tokens' | 'vocab-overlap';

export interface AssetCatalogBootstrapGroupSummaryMirror {
  readonly firstToken: string;
  readonly entryCount: number;
  readonly tokenCountMin: number;
  readonly tokenCountMax: number;
  readonly anomalies: readonly AssetCatalogBootstrapAnomalyReason[];
}

export interface AssetCatalogBootstrapGroupOverride {
  readonly firstToken: string;
  readonly slotTokenCounts: Partial<Record<AssetSlotId, number>>;
}

export interface AssetCatalogBootstrapSplitOptions {
  readonly separator?: string;
  readonly slotTokenCounts?: Partial<Record<AssetSlotId, number>>;
  readonly groupOverrides?: readonly AssetCatalogBootstrapGroupOverride[];
}
```

그리고 `AssetManagerExtensionMessage`의 `catalogBootstrapPreview` envelope payload에 `groups` 추가:

```ts
  | AssetManagerEnvelope<
      'asset-manager/catalogBootstrapPreview',
      {
        readonly stableId: string;
        readonly rows: readonly { readonly path: string; readonly name: string; readonly slots: AssetSlotValues | null }[];
        readonly groups: readonly AssetCatalogBootstrapGroupSummaryMirror[];
      }
    >
```

(2) `packages/webview/src/lib/asset-manager/bootstrapGroups.ts` 생성:

```ts
/**
 * Catalog Bootstrap 그룹별 override 편집 헬퍼 (순수 로직).
 * @file packages/webview/src/lib/asset-manager/bootstrapGroups.ts
 */

import type {
  AssetCatalogBootstrapAnomalyReason,
  AssetCatalogBootstrapGroupOverride,
  AssetCatalogBootstrapGroupSummaryMirror,
} from '../types/assetManager';

export interface GroupTokenCounts {
  readonly s1: number;
  readonly s2: number;
}

const ANOMALY_LABELS: Record<AssetCatalogBootstrapAnomalyReason, string> = {
  'insufficient-tokens': '지정한 조각 수를 적용할 수 없는 항목 있음',
  'vocab-overlap': '다른 그룹의 뒷슬롯 어휘와 겹침 (오분할 의심)',
};

export function anomalyLabel(reason: AssetCatalogBootstrapAnomalyReason): string {
  return ANOMALY_LABELS[reason];
}

export function buildGroupOverrides(
  edited: ReadonlyMap<string, GroupTokenCounts>,
  globalCounts: GroupTokenCounts,
): readonly AssetCatalogBootstrapGroupOverride[] {
  return [...edited.entries()]
    .filter(([, counts]) => counts.s1 !== globalCounts.s1 || counts.s2 !== globalCounts.s2)
    .map(([firstToken, counts]) => ({ firstToken, slotTokenCounts: { s1: counts.s1, s2: counts.s2 } }));
}

export function pruneStaleOverrides(
  edited: ReadonlyMap<string, GroupTokenCounts>,
  groups: readonly AssetCatalogBootstrapGroupSummaryMirror[],
): Map<string, GroupTokenCounts> {
  const known = new Set(groups.map((group) => group.firstToken));
  return new Map([...edited.entries()].filter(([firstToken]) => known.has(firstToken)));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm --workspace risu-workbench-webview run test -- tests/lib/asset-manager/bootstrapGroups.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/webview/src/lib/types/assetManager.ts packages/webview/src/lib/asset-manager/bootstrapGroups.ts packages/webview/tests/lib/asset-manager/bootstrapGroups.test.ts
git commit -m "feat(webview) : mirror bootstrap group protocol and add override helpers"
```

---

### Task 5: webview — 모달 그룹별 규칙 UI + App 와이어링

**Files:**
- Modify: `packages/webview/src/AssetManagerApp.svelte`
- Modify: `packages/webview/src/lib/components/asset-manager/CatalogBootstrapModal.svelte`

**Interfaces:**
- Consumes: Task 4의 타입/헬퍼 (`AssetCatalogBootstrapGroupSummaryMirror`, `buildGroupOverrides`, `pruneStaleOverrides`, `anomalyLabel`), Task 3의 `groups` payload.
- Produces: `CatalogBootstrapModal`의 새 prop `groups: readonly AssetCatalogBootstrapGroupSummaryMirror[]`. `onPreview`/`onSelect` 시그니처는 불변 — `split` 안에 `groupOverrides`가 실려 나감.

- [ ] **Step 1: App 와이어링**

`packages/webview/src/AssetManagerApp.svelte`:

(1) 상태 추가 — `bootstrapPreviewRows` 선언 아래:

```ts
  let bootstrapGroups: readonly AssetCatalogBootstrapGroupSummaryMirror[] = [];
```

script 상단 type import에 `AssetCatalogBootstrapGroupSummaryMirror` 추가 (기존 `AssetCatalogBootstrapSplitOptions` import 옆).

(2) 메시지 핸들러 갱신:

```ts
      case 'asset-manager/catalogBootstrapPreview':
        bootstrapPreviewRows = message.payload.rows;
        bootstrapGroups = message.payload.groups;
        return;
```

(3) 마크업의 모달 인스턴스에 prop 전달:

```svelte
    <CatalogBootstrapModal previewRows={bootstrapPreviewRows} groups={bootstrapGroups} onPreview={previewCatalogBootstrap} onSelect={runCatalogBootstrap} onClose={() => (showBootstrapModal = false)} />
```

- [ ] **Step 2: 모달 script 수정**

`CatalogBootstrapModal.svelte`의 `<script>`:

(1) import 교체/추가:

```ts
  import { onMount } from 'svelte';
  import {
    anomalyLabel,
    buildGroupOverrides,
    pruneStaleOverrides,
    type GroupTokenCounts,
  } from '../../asset-manager/bootstrapGroups';
  import type {
    AssetCatalogBootstrapGroupSummaryMirror,
    AssetCatalogBootstrapSplitOptions,
    AssetSlotValues,
  } from '../../types/assetManager';
```

(2) prop 추가 (`export let previewRows` 아래):

```ts
  export let groups: readonly AssetCatalogBootstrapGroupSummaryMirror[] = [];
```

(3) override 상태와 파생값 (`s2TokenCount` 선언 아래):

```ts
  let groupCounts = new Map<string, GroupTokenCounts>();
  let expandedGroups = new Set<string>();
  let prunedForGroups: typeof groups | null = null;

  $: globalCounts = { s1: s1TokenCount, s2: s2TokenCount } as GroupTokenCounts;
  // groups가 갱신될 때 한 번만 prune — groupCounts를 $: 의존성으로 직접 쓰면 자기참조 재실행이 되므로 guard 패턴 사용
  $: if (groups !== prunedForGroups) {
    prunedForGroups = groups;
    groupCounts = pruneStaleOverrides(groupCounts, groups);
  }
  $: overriddenTokens = new Set(buildGroupOverrides(groupCounts, globalCounts).map((entry) => entry.firstToken));
```

(4) `splitOptions()` 교체:

```ts
  function splitOptions(): AssetCatalogBootstrapSplitOptions {
    const groupOverrides = buildGroupOverrides(groupCounts, globalCounts);
    return {
      separator,
      slotTokenCounts: { s1: s1TokenCount, s2: s2TokenCount },
      ...(groupOverrides.length > 0 && { groupOverrides }),
    };
  }
```

(5) 그룹 편집 핸들러 추가:

```ts
  function groupCountsFor(firstToken: string): GroupTokenCounts {
    return groupCounts.get(firstToken) ?? globalCounts;
  }

  function setGroupCount(firstToken: string, slot: 's1' | 's2', value: number): void {
    if (!Number.isInteger(value) || value < 1) return;
    const current = groupCountsFor(firstToken);
    groupCounts = new Map(groupCounts).set(firstToken, { ...current, [slot]: value });
    refreshPreview();
  }

  function toggleGroup(firstToken: string): void {
    const next = new Set(expandedGroups);
    if (next.has(firstToken)) next.delete(firstToken);
    else next.add(firstToken);
    expandedGroups = next;
  }

  function isGroupOpen(group: AssetCatalogBootstrapGroupSummaryMirror): boolean {
    return group.anomalies.length > 0 || expandedGroups.has(group.firstToken) || overriddenTokens.has(group.firstToken);
  }

  function rowFirstToken(name: string): string {
    return splitName(name, separator)[0] ?? '';
  }
```

- [ ] **Step 3: 모달 마크업 — 그룹 섹션 + 미리보기 표시 강화**

(1) `catalog-bootstrap-modal__example` 섹션과 `catalog-bootstrap-modal__preview` 사이에 삽입:

```svelte
    {#if groups.length > 0}
      <section class="catalog-bootstrap-modal__groups" aria-label="Per-group split rules">
        <strong>그룹별 규칙</strong>
        <p>첫 조각(캐릭터명 후보) 기준 그룹입니다. ⚠ 그룹은 전역 규칙과 안 맞을 가능성이 높아 조각 수를 따로 지정할 수 있습니다.</p>
        <ul>
          {#each groups as group (group.firstToken)}
            <li class:is-anomalous={group.anomalies.length > 0}>
              <button type="button" class="catalog-bootstrap-modal__group-row" onclick={() => toggleGroup(group.firstToken)}>
                <span class="catalog-bootstrap-modal__group-name">
                  {#if group.anomalies.length > 0}<span class="catalog-bootstrap-modal__badge" title={group.anomalies.map(anomalyLabel).join(' / ')}>⚠</span>{/if}
                  {group.firstToken}
                  {#if overriddenTokens.has(group.firstToken)}<span class="catalog-bootstrap-modal__badge catalog-bootstrap-modal__badge--override">⚙</span>{/if}
                </span>
                <span class="catalog-bootstrap-modal__group-meta">{group.entryCount}개 · 조각 {group.tokenCountMin}{group.tokenCountMin === group.tokenCountMax ? '' : `~${group.tokenCountMax}`}</span>
              </button>
              {#if group.anomalies.length > 0}
                <p class="catalog-bootstrap-modal__group-reason">{group.anomalies.map(anomalyLabel).join(' · ')}</p>
              {/if}
              {#if isGroupOpen(group)}
                <div class="catalog-bootstrap-modal__group-controls">
                  <label>
                    <span>s1 조각</span>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={groupCountsFor(group.firstToken).s1}
                      onchange={(event) => setGroupCount(group.firstToken, 's1', Number(event.currentTarget.value))}
                    />
                  </label>
                  <label>
                    <span>s2 조각</span>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={groupCountsFor(group.firstToken).s2}
                      onchange={(event) => setGroupCount(group.firstToken, 's2', Number(event.currentTarget.value))}
                    />
                  </label>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
```

(2) 미리보기 테이블 행에 표시 강화 — 기존 `{#each previewRows ...}` 행을 교체:

```svelte
          {#each previewRows as row (row.path)}
            <tr class:is-invalid={row.slots === null}>
              <td>
                {row.name}
                {#if overriddenTokens.has(rowFirstToken(row.name))}<span class="catalog-bootstrap-modal__badge catalog-bootstrap-modal__badge--override">⚙</span>{/if}
              </td>
              <td>{slotsLabel(row.slots)}</td>
            </tr>
          {:else}
            <tr><td colspan="2">미리보기 항목이 없습니다.</td></tr>
          {/each}
```

(3) `<style>`에 추가:

```css
  .catalog-bootstrap-modal__groups {
    display: grid;
    gap: 6px;
    margin-top: var(--space-3);
    padding: var(--space-2);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    max-height: 220px;
    overflow: auto;
  }
  .catalog-bootstrap-modal__groups p { margin: 0; color: var(--secondary-text); font-size: var(--text-sm); }
  .catalog-bootstrap-modal__groups ul { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .catalog-bootstrap-modal__groups li { border-radius: var(--radius-sm); padding: 2px 4px; }
  .catalog-bootstrap-modal__groups li.is-anomalous { background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 12%, transparent); }
  .catalog-bootstrap-modal__group-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    padding: 2px 0;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    font-size: var(--text-sm);
    text-align: left;
  }
  .catalog-bootstrap-modal__group-name { font-weight: 700; }
  .catalog-bootstrap-modal__group-meta { color: var(--secondary-text); }
  .catalog-bootstrap-modal__group-reason { margin: 0; color: var(--vscode-editorWarning-foreground, #cca700); font-size: var(--text-sm); }
  .catalog-bootstrap-modal__group-controls { display: flex; gap: var(--space-2); padding: 4px 0 6px; }
  .catalog-bootstrap-modal__group-controls label { display: flex; align-items: center; gap: 6px; font-size: var(--text-sm); }
  .catalog-bootstrap-modal__group-controls input { width: 64px; }
  .catalog-bootstrap-modal__badge { font-size: var(--text-sm); }
  .catalog-bootstrap-modal__badge--override { opacity: 0.8; }
  .catalog-bootstrap-modal__preview tr.is-invalid td { color: var(--vscode-errorForeground, #f48771); }
```

- [ ] **Step 4: 빌드/테스트로 검증**

Run: `npm --workspace risu-workbench-webview run test && npm run build:webview`
Expected: 테스트 전부 PASS, svelte-check 포함 빌드 성공 (빌드 스크립트가 타입 체크를 안 하면 `npm --workspace risu-workbench-webview run build`의 vite 빌드 성공으로 확인).

- [ ] **Step 5: 수동 검증 (Extension Development Host)**

1. `npm run build:extension-dev` 후 F5로 extension 실행, Asset Manager 열기.
2. Catalog Bootstrap 모달 → 구분자 `_`, s1=2 설정 → "미리보기 갱신".
3. 확인: Rivea 그룹에 ⚠ 배지 + 사유 표시, 기본 펼침; Rivea s1을 1로 변경하면 미리보기의 Rivea 행이 `s1: Rivea`로 바뀌고 ⚙ 표시; "이 분할로 적용" 후 매트릭스 뷰에 `Rivea_acting` 같은 파편 행이 사라짐.

- [ ] **Step 6: 커밋**

```bash
git add packages/webview/src/AssetManagerApp.svelte packages/webview/src/lib/components/asset-manager/CatalogBootstrapModal.svelte
git commit -m "feat(webview) : per-group split override section in catalog bootstrap modal"
```

---

### Task 6: 전체 회귀 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트**

Run: `npm --workspace risu-workbench-core run test && npm --workspace risu-workbench-webview run test && npm --workspace risu-workbench-vscode run test:e2e:cbs-client:boundary`
Expected: 전부 PASS.

- [ ] **Step 2: 잔여 변경 커밋 여부 확인**

Run: `git status --short -- packages/`
Expected: 이 작업으로 인한 미커밋 변경 없음.
