# Matrix 요약 히트맵 + 콤보 에셋 모달 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3슬롯 Matrix에서 s1 미선택("전체") 시 행=s1×열=s2 완성도 요약 히트맵을 제공하고, 요약/상세 매트릭스 셀 클릭 시 해당 조합 에셋을 썸네일 모달로 보여준다.

**Architecture:** 집계 로직은 `gridModel.ts` 순수 함수(`computeSummaryMatrixClient`, `filterEntriesByCombo`)로 추가해 vitest로 검증. MatrixView는 요약 모드 분기 + `onOpenCombo` 콜백만 emit하는 얇은 뷰로 유지. 콤보 모달 상태·필터링·AssetDetailModal 연계는 AssetManagerApp이 소유.

**Tech Stack:** Svelte 5 (runes 아님 — `export let` + `$:` 반응문 스타일), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-05-matrix-summary-heatmap-design.md`

## Global Constraints

- npm workspaces 사용. 테스트: `npm run --workspace risu-workbench-webview test`, 타입체크: `npm run --workspace risu-workbench-webview check`
- Svelte 컴포넌트 렌더링 테스트 인프라 없음 — 로직은 gridModel 순수 함수에 두고 테스트, 컴포넌트는 svelte-check로 검증
- 기존 코드 스타일 준수: 한국어 파일 헤더 주석, `// biome-ignore lint/correctness/noUnusedVariables:` 주석 패턴(마크업에서만 쓰는 심볼), CSS 변수 팔레트(`--success`, `--error`, `--focus`, `--muted`)
- 기존 상세 매트릭스(행=s2×열=s3) 동작·Expected 편집 패널은 유지. 2슬롯 스키마 매트릭스 계산 변경 없음
- 커밋 메시지 형식: `feat(webview) : ...` (기존 히스토리 스타일)

---

### Task 1: gridModel — computeSummaryMatrixClient

**Files:**
- Modify: `packages/webview/src/lib/asset-manager/gridModel.ts` (타입은 `MissingMatrixClient` 근처 48–62행 부근, 함수는 `computeMissingMatrixClient` 아래)
- Test: `packages/webview/tests/lib/asset-manager/gridModel.test.ts`

**Interfaces:**
- Consumes: 기존 `expectedListForClient(catalog, s1Value, slotId)`, 내부 헬퍼 `groupAssignments(catalog, slotIds)`, `comboKey(values)`
- Produces: `computeSummaryMatrixClient(catalog: AssetCatalogMirror): SummaryMatrixClient | null` — 3슬롯이 아니면 `null`. 타입 `SummaryMatrixClient`, `SummaryCellClient`, `SummaryCellState` export (Task 4가 import)

- [ ] **Step 1: 실패하는 테스트 작성**

`gridModel.test.ts`의 `describe('computeMissingMatrixClient', ...)` 블록 뒤에 추가:

```ts
describe('computeSummaryMatrixClient', () => {
  const threeSlotCatalog = {
    version: 1 as const,
    schema: {
      slots: [
        { id: 's1' as const, label: 'character' },
        { id: 's2' as const, label: 'outfit' },
        { id: 's3' as const, label: 'emotion' },
      ],
      joinTemplate: '{s1} {s2} {s3}',
    },
    vocab: { s1: ['Rin', 'Yua'], s2: ['casual', 'uniform'], s3: ['angry', 'sad'] },
    expected: {},
    assignments: {
      'a/rin_casual_angry.png': { s1: 'Rin', s2: 'casual', s3: 'angry' },
      'a/rin_casual_angry2.png': { s1: 'Rin', s2: 'casual', s3: 'angry' },
      'a/rin_casual_sad.png': { s1: 'Rin', s2: 'casual', s3: 'sad' },
      'a/rin_uniform_angry.png': { s1: 'Rin', s2: 'uniform', s3: 'angry' },
    },
  };

  it('aggregates complete/partial/empty states with counts', () => {
    const summary = computeSummaryMatrixClient(threeSlotCatalog);
    expect(summary?.rows).toEqual(['Rin', 'Yua']);
    expect(summary?.cols).toEqual(['casual', 'uniform']);
    // Rin/casual: angry(중복)+sad 존재 → complete, 중복 1건
    expect(summary?.cells[0]?.[0]).toMatchObject({
      state: 'complete',
      presentCount: 2,
      expectedCount: 2,
      duplicateCount: 1,
      missingValues: [],
    });
    // Rin/uniform: angry 만 → partial, sad 빠짐
    expect(summary?.cells[0]?.[1]).toMatchObject({
      state: 'partial',
      presentCount: 1,
      expectedCount: 2,
      missingValues: ['sad'],
    });
    // Yua/casual: 파일 없음 → empty
    expect(summary?.cells[1]?.[0]).toMatchObject({ state: 'empty', presentCount: 0, expectedCount: 2 });
  });

  it('applies per-s1 expected overrides for both s2 (excluded) and s3 (denominator)', () => {
    const withOverride = {
      ...threeSlotCatalog,
      expected: { Yua: { s2: ['casual'], s3: ['angry'] } },
    };
    const summary = computeSummaryMatrixClient(withOverride);
    // Yua/uniform: expected s2 밖 + 파일 없음 → excluded
    expect(summary?.cells[1]?.[1]?.state).toBe('excluded');
    // Yua/casual: expected s3 가 ['angry'] 뿐 → 분모 1
    expect(summary?.cells[1]?.[0]).toMatchObject({ state: 'empty', expectedCount: 1 });
  });

  it('shows aggregation instead of excluded when files exist outside expected s2', () => {
    const withOverride = {
      ...threeSlotCatalog,
      expected: { Rin: { s2: ['casual'] } },
    };
    const summary = computeSummaryMatrixClient(withOverride);
    // Rin/uniform 은 expected 밖이지만 실제 파일 존재 → partial 로 집계 표시
    expect(summary?.cells[0]?.[1]?.state).toBe('partial');
  });

  it('marks cells excluded when the expected s3 list is empty', () => {
    const noS3 = { ...threeSlotCatalog, expected: { Rin: { s3: [] } } };
    const summary = computeSummaryMatrixClient(noS3);
    expect(summary?.cells[0]?.[0]?.state).toBe('excluded');
  });

  it('returns null for non-3-slot schemas', () => {
    const twoSlot = {
      version: 1 as const,
      schema: {
        slots: [
          { id: 's1' as const, label: 'character' },
          { id: 's2' as const, label: 'emotion' },
        ],
        joinTemplate: '{s1} {s2}',
      },
      vocab: { s1: ['Rin'], s2: ['angry'] },
      expected: {},
      assignments: {},
    };
    expect(computeSummaryMatrixClient(twoSlot)).toBeNull();
  });
});
```

import 목록에 `computeSummaryMatrixClient` 추가.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run --workspace risu-workbench-webview test`
Expected: FAIL — `computeSummaryMatrixClient` is not exported

- [ ] **Step 3: 구현**

`gridModel.ts`의 `MissingMatrixClient` 인터페이스(62행) 아래에 타입 추가:

```ts
export type SummaryCellState = 'complete' | 'partial' | 'empty' | 'excluded';

export interface SummaryCellClient {
  readonly row: string;
  readonly col: string;
  readonly state: SummaryCellState;
  readonly presentCount: number;
  readonly expectedCount: number;
  readonly duplicateCount: number;
  readonly missingValues: readonly string[];
}

export interface SummaryMatrixClient {
  readonly rows: readonly string[];
  readonly cols: readonly string[];
  readonly cells: readonly (readonly SummaryCellClient[])[];
}
```

`computeMissingMatrixClient` 함수 아래에 추가:

```ts
/**
 * 3슬롯 전용 s1×s2 완성도 요약 매트릭스.
 * 셀 = 해당 (s1, s2) 에서 expected s3 조합 중 존재/누락 집계.
 * 파일 전체를 groupAssignments 로 1회 순회하므로 파일 수천 개 규모에서도 저비용.
 */
export function computeSummaryMatrixClient(catalog: AssetCatalogMirror): SummaryMatrixClient | null {
  if (catalog.schema.slots.length !== 3) return null;
  const rows = [...(catalog.vocab.s1 ?? [])];
  const cols = [...(catalog.vocab.s2 ?? [])];
  const groups = groupAssignments(catalog, ['s1', 's2', 's3']);
  return {
    rows,
    cols,
    cells: rows.map((row) => {
      const expectedS2 = new Set(expectedListForClient(catalog, row, 's2'));
      const expectedS3 = expectedListForClient(catalog, row, 's3');
      return cols.map((col) => summarizeSummaryCell(groups, row, col, expectedS2.has(col), expectedS3));
    }),
  };
}

function summarizeSummaryCell(
  groups: ReadonlyMap<string, readonly string[]>,
  s1: string,
  s2: string,
  s2Expected: boolean,
  expectedS3: readonly string[],
): SummaryCellClient {
  let presentCount = 0;
  let duplicateCount = 0;
  const missingValues: string[] = [];
  for (const s3 of expectedS3) {
    const count = groups.get(comboKey([s1, s2, s3]))?.length ?? 0;
    if (count === 0) {
      missingValues.push(s3);
    } else {
      presentCount += 1;
      if (count > 1) duplicateCount += 1;
    }
  }
  const state = summaryCellState(s2Expected, presentCount, expectedS3.length);
  return { row: s1, col: s2, state, presentCount, expectedCount: expectedS3.length, duplicateCount, missingValues };
}

function summaryCellState(s2Expected: boolean, presentCount: number, expectedCount: number): SummaryCellState {
  // expected 밖 s2 라도 실제 파일이 있으면 집계 표시(2슬롯 excluded 의미론과 동일)
  if (presentCount === 0 && (!s2Expected || expectedCount === 0)) return 'excluded';
  if (presentCount === 0) return 'empty';
  return presentCount === expectedCount ? 'complete' : 'partial';
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run --workspace risu-workbench-webview test`
Expected: PASS (전체 스위트 그린)

- [ ] **Step 5: 커밋**

```bash
git add packages/webview/src/lib/asset-manager/gridModel.ts packages/webview/tests/lib/asset-manager/gridModel.test.ts
git commit -m "feat(webview) : add s1xs2 summary matrix aggregation for 3-slot catalogs"
```

---

### Task 2: gridModel — filterEntriesByCombo

**Files:**
- Modify: `packages/webview/src/lib/asset-manager/gridModel.ts` (`filterAssetEntries` 아래)
- Test: `packages/webview/tests/lib/asset-manager/gridModel.test.ts`

**Interfaces:**
- Consumes: 기존 `ASSET_SLOT_IDS` (gridModel이 이미 import), `AssetManagerAssetEntry`
- Produces: `filterEntriesByCombo(entries: readonly AssetManagerAssetEntry[], combo: readonly (string | undefined)[]): AssetManagerAssetEntry[]` — combo는 슬롯 순서(`s1, s2, s3`) 배열, `undefined` = 와일드카드. Task 5(App)가 import.

- [ ] **Step 1: 실패하는 테스트 작성**

`gridModel.test.ts`에 추가 (기존 `entry()` 헬퍼 재사용):

```ts
describe('filterEntriesByCombo', () => {
  const entries = [
    entry({ path: 'a/rin_casual_angry.png', assignment: { s1: 'Rin', s2: 'casual', s3: 'angry' } }),
    entry({ path: 'a/rin_casual_sad.png', assignment: { s1: 'Rin', s2: 'casual', s3: 'sad' } }),
    entry({ path: 'a/rin_uniform_angry.png', assignment: { s1: 'Rin', s2: 'uniform', s3: 'angry' } }),
    entry({ path: 'a/yua_casual_angry.png', assignment: { s1: 'Yua', s2: 'casual', s3: 'angry' } }),
    entry({ path: 'a/unassigned.png', assignment: null }),
  ];

  it('matches a full combo exactly', () => {
    const matched = filterEntriesByCombo(entries, ['Rin', 'casual', 'angry']);
    expect(matched.map((item) => item.path)).toEqual(['a/rin_casual_angry.png']);
  });

  it('treats undefined slots as wildcards (partial combo)', () => {
    const matched = filterEntriesByCombo(entries, ['Rin', 'casual', undefined]);
    expect(matched.map((item) => item.path)).toEqual(['a/rin_casual_angry.png', 'a/rin_casual_sad.png']);
  });

  it('excludes unassigned entries when any slot is constrained', () => {
    expect(filterEntriesByCombo(entries, ['Rin', undefined, undefined])).toHaveLength(3);
    expect(filterEntriesByCombo(entries, [undefined, 'casual', undefined])).toHaveLength(3);
  });
});
```

import 목록에 `filterEntriesByCombo` 추가.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run --workspace risu-workbench-webview test`
Expected: FAIL — `filterEntriesByCombo` is not exported

- [ ] **Step 3: 구현**

`gridModel.ts`의 `filterAssetEntries` 아래에 추가:

```ts
/**
 * 슬롯 순서(combo[i] ↔ ASSET_SLOT_IDS[i]) 조합으로 entries 필터링.
 * undefined 슬롯은 와일드카드. Matrix 셀 클릭 → 콤보 모달의 매칭 목록용.
 */
export function filterEntriesByCombo(
  entries: readonly AssetManagerAssetEntry[],
  combo: readonly (string | undefined)[],
): AssetManagerAssetEntry[] {
  return entries.filter((entry) =>
    combo.every((value, index) => {
      if (value === undefined) return true;
      const slotId = ASSET_SLOT_IDS[index];
      return slotId !== undefined && entry.assignment?.[slotId] === value;
    }),
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run --workspace risu-workbench-webview test`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/webview/src/lib/asset-manager/gridModel.ts packages/webview/tests/lib/asset-manager/gridModel.test.ts
git commit -m "feat(webview) : add combo wildcard entry filter for matrix cell drilldown"
```

---

### Task 3: ComboAssetsModal 컴포넌트

**Files:**
- Create: `packages/webview/src/lib/components/asset-manager/ComboAssetsModal.svelte`

**Interfaces:**
- Consumes: `AssetManagerAssetEntry` 타입만. 데이터는 전부 props로 주입 (필터링·상태는 App 책임).
- Produces: props 계약 — `entries`, `comboLabel: string`, `assetImageSrc: (path: string) => string`, `onClose()`, `onOpenDetail(path: string)`, `onJumpToGrid()`. Task 5가 이 시그니처로 렌더.

- [ ] **Step 1: 컴포넌트 작성**

파일 전체:

```svelte
<!--
  Matrix 셀 클릭 시 해당 조합에 매칭되는 에셋을 보여주는 썸네일 모달.
  보기 + 상세 진입 전용: 썸네일 클릭 → AssetDetailModal(App 소유), 편집은 Grid 탭 책임.
  매칭 목록/라벨/이미지 소스는 전부 props — 모달 상태는 AssetManagerApp 이 소유한다.
  @file packages/webview/src/lib/components/asset-manager/ComboAssetsModal.svelte
-->

<script lang="ts">
  import type { AssetManagerAssetEntry } from '../../types/assetManager';

  export let entries: readonly AssetManagerAssetEntry[] = [];
  export let comboLabel = '';
  export let assetImageSrc: (path: string) => string = () => '';
  export let onClose: () => void = () => undefined;
  export let onOpenDetail: (path: string) => void = () => undefined;
  export let onJumpToGrid: () => void = () => undefined;

  // biome-ignore lint/correctness/noUnusedVariables: svelte:window consumes this handler.
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section class="modal-backdrop" aria-label="Combo assets backdrop">
  <button type="button" class="modal-scrim" aria-label="Close combo assets" onclick={onClose}></button>
  <div class="combo-modal" role="dialog" aria-modal="true" aria-label="Combo assets">
    <header class="combo-modal__header">
      <h2>{comboLabel} <span class="combo-modal__count">{entries.length}개</span></h2>
      <div>
        <button type="button" class="button-secondary" onclick={onJumpToGrid}>Grid 탭에서 열기</button>
        <button type="button" class="button-secondary" onclick={onClose} aria-label="Close">×</button>
      </div>
    </header>

    {#if entries.length === 0}
      <p class="combo-modal__empty">이 조합에 해당하는 에셋이 없습니다. Grid 탭에서 할당하세요.</p>
    {:else}
      <div class="combo-modal__grid">
        {#each entries as entry (entry.path)}
          <button type="button" class="combo-modal__tile" onclick={() => onOpenDetail(entry.path)}>
            <img src={assetImageSrc(entry.path)} alt={entry.fileStem} loading="lazy" decoding="async" />
            <span>{entry.generatedName ?? entry.fileStem}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
  }
  .modal-scrim {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    border: 0;
  }
  .combo-modal {
    position: relative;
    width: min(760px, 92vw);
    max-height: 84vh;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-lg);
    background: var(--card);
    box-shadow: var(--card-shadow);
    color: var(--text);
  }
  .combo-modal__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }
  .combo-modal__header h2 { margin: 0; min-width: 0; font-size: var(--text-lg); overflow-wrap: anywhere; }
  .combo-modal__header > div { display: flex; gap: var(--space-1); flex: 0 0 auto; }
  .combo-modal__count { color: var(--muted); font-size: var(--text-sm); font-weight: 400; }
  .combo-modal__empty { margin: 0; color: var(--muted); font-size: var(--text-sm); }
  .combo-modal__grid {
    overflow-y: auto;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-2);
  }
  .combo-modal__tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-1);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    color: var(--text);
    font-size: var(--text-sm);
  }
  .combo-modal__tile:hover { outline: 1px solid var(--focus); }
  .combo-modal__tile img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: var(--radius-sm);
    background: var(--secondary);
  }
  .combo-modal__tile span { overflow-wrap: anywhere; text-align: left; }
</style>
```

- [ ] **Step 2: svelte-check 통과 확인**

Run: `npm run --workspace risu-workbench-webview check`
Expected: 새 에러 0건 (미사용 컴포넌트 경고가 나오면 무시 — Task 5에서 사용)

- [ ] **Step 3: 커밋**

```bash
git add packages/webview/src/lib/components/asset-manager/ComboAssetsModal.svelte
git commit -m "feat(webview) : add combo assets thumbnail modal component"
```

---

### Task 4: MatrixView — 요약 히트맵 + onOpenCombo

**Files:**
- Modify: `packages/webview/src/lib/components/asset-manager/MatrixView.svelte`

**Interfaces:**
- Consumes: Task 1의 `computeSummaryMatrixClient`, `SummaryCellClient`
- Produces: prop 변경 — `onJumpToCombo` 제거, `onOpenCombo: (values: (string | undefined)[]) => void` 추가. Task 5가 이 prop을 연결. (이 시점에 App은 아직 구 prop을 넘기므로 svelte-check에서 App 쪽 에러 1건 발생 — Task 5에서 해소. 커밋은 Task 5와 묶지 않고 그대로 진행하되 에러 내용을 커밋 메시지에 남기지 말 것; 전체 그린은 Task 5 종료 기준.)

- [ ] **Step 1: script 블록 수정**

변경 요점: `onJumpToCombo` → `onOpenCombo`, s1 강제 pin 제거, 요약 모드 reactive 추가, 셀 클릭 콜백 분리.

```svelte
<script lang="ts">
  import {
    chainedValuesForClient,
    computeMissingMatrixClient,
    computeSummaryMatrixClient,
    expectedListForClient,
    type SummaryCellClient,
  } from '../../asset-manager/gridModel';
  import type { AssetCatalogMirror, AssetExpectedMapMirror } from '../../types/assetManager';

  export let catalog: AssetCatalogMirror;
  export let onUpdateExpected: (expected: AssetExpectedMapMirror) => void = () => undefined;
  export let onOpenCombo: (values: (string | undefined)[]) => void = () => undefined;

  let selectedS1 = ''; // '' = 전체 (2슬롯·3슬롯 공통)
  let selectedS2 = ''; // '' = 전체
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this via bind:value.
  let editingS1 = '';

  $: slotCount = catalog.schema.slots.length;
  $: s1List = catalog.vocab.s1 ?? [];
  // 3슬롯 + s1 전체 → 요약 히트맵 모드 (행=s1 × 열=s2 완성도 집계)
  $: summaryMode = slotCount === 3 && !selectedS1;
  $: summary = summaryMode ? computeSummaryMatrixClient(catalog) : null;
  // s2 조건 후보: 선택된 s1 을 통해 chaining 된 s2 (override 있으면 큐레이션, 없으면 실제 할당값)
  $: s2Options = slotCount === 3 && selectedS1 ? chainedValuesForClient(catalog, selectedS1, 's2') : [];
  // s1 이 바뀌어 현재 s2 선택이 후보 밖이면 전체로 리셋
  $: if (selectedS2 && !s2Options.includes(selectedS2)) selectedS2 = '';
  $: matrix = summaryMode ? null : computeMissingMatrixClient(catalog, selectedS1 || undefined, selectedS2 || undefined);
  $: editableSlots = (slotCount === 3 ? ['s2', 's3'] : ['s2']) as Array<'s2' | 's3'>;

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this constant.
  const STATE_LABEL: Record<string, string> = {
    present: '✓',
    duplicate: '⚠',
    missing: '✗',
    excluded: '·',
  };

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clickCell(row: string, col: string): void {
    if (slotCount === 3) onOpenCombo([selectedS1, row, col]);
    else if (slotCount === 2) onOpenCombo([row, col]);
    else onOpenCombo([row]);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clickSummaryCell(cell: SummaryCellClient): void {
    onOpenCombo([cell.row, cell.col, undefined]);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function drillToRow(row: string): void {
    selectedS1 = row;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this helper.
  function summaryCellTitle(cell: SummaryCellClient): string {
    const base = `${cell.row} / ${cell.col} · ${cell.presentCount}/${cell.expectedCount}`;
    if (cell.missingValues.length === 0) return base;
    const preview = cell.missingValues.slice(0, 8).join(', ');
    const rest = cell.missingValues.length - 8;
    return `${base} · 빠짐: ${preview}${rest > 0 ? ` 외 ${rest}개` : ''}`;
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
```

(`toggleExpected`는 기존 그대로 — 재게재. 파일 헤더 주석의 "3슬롯: s1 선택 후" 문구는 "3슬롯: 전체=요약 히트맵, s1 선택=상세" 로 갱신.)

- [ ] **Step 2: 마크업 수정**

pin 영역: 3슬롯 s1 select에도 `전체` 옵션 추가 —

```svelte
<label class="matrix-s1">
  <span>{catalog.schema.slots[0].label}</span>
  <select bind:value={selectedS1}>
    <option value="">전체</option>
    {#each s1List as value (value)}<option {value}>{value}</option>{/each}
  </select>
</label>
```

(기존 `{#if slotCount === 2}<option value="">전체</option>{/if}` 분기 제거. s2 select는 기존대로 `slotCount === 3` && `selectedS1`이 있을 때만 의미 있으므로 `{#if slotCount === 3 && selectedS1}` 로 조건 강화.)

매트릭스 본문: 기존 `{#if matrix && matrix.rows.length > 0}` 블록 앞에 요약 분기 추가 —

```svelte
{#if summaryMode}
  {#if summary && summary.rows.length > 0}
    <div class="matrix-scroll">
      <table class="matrix-table">
        <thead>
          <tr>
            <th></th>
            {#each summary.cols as col (col)}<th>{col}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each summary.rows as row, rowIndex (row)}
            <tr>
              <th>
                <button type="button" class="row-drill" title={`${row} 상세 매트릭스 보기`} onclick={() => drillToRow(row)}>
                  {row}
                </button>
              </th>
              {#each summary.cells[rowIndex] as cell (cell.col)}
                <td>
                  <button
                    type="button"
                    class={`cell cell--summary summary--${cell.state}`}
                    title={summaryCellTitle(cell)}
                    onclick={() => clickSummaryCell(cell)}
                  >
                    {#if cell.state === 'excluded'}·{:else}{cell.presentCount}/{cell.expectedCount}{#if cell.duplicateCount > 0}⚠{/if}{/if}
                  </button>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="matrix-legend">n/m = 존재/기대(s3 조합) · ⚠ 중복 포함 · · 비대상 · 행 이름 클릭 = 상세 매트릭스</p>
  {:else}
    <p class="matrix-empty">vocab의 {catalog.schema.slots[0].label} 목록이 비어 있습니다. Vocab 탭에서 먼저 등록하세요.</p>
  {/if}
{:else if matrix && matrix.rows.length > 0}
  <!-- 현재 파일 89–118행의 기존 상세 매트릭스 블록(.matrix-scroll table + .matrix-legend)을 수정 없이 이 분기 안으로 이동 -->
{:else}
  <!-- 현재 파일 120행의 기존 .matrix-empty 문단을 수정 없이 이 분기 안으로 이동 -->
{/if}
```

(기존 최상위 `{#if matrix && matrix.rows.length > 0}` / `{:else}` / `{/if}` 골격은 위 3분기 구조로 대체된다. 상세 매트릭스 내부 마크업과 legend 텍스트는 변경하지 않는다.)

- [ ] **Step 3: 스타일 추가**

기존 `.cell--excluded` 규칙 아래에 추가:

```css
.cell--summary { width: auto; min-width: 44px; padding: 0 var(--space-1); font-size: var(--text-sm); }
.summary--complete { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, var(--card-border)); background: color-mix(in srgb, var(--success) 10%, var(--surface)); }
.summary--partial { color: var(--focus); border-color: color-mix(in srgb, var(--focus) 40%, var(--card-border)); background: color-mix(in srgb, var(--focus) 12%, var(--surface)); }
.summary--empty { color: var(--error); font-weight: 800; border-color: color-mix(in srgb, var(--error) 45%, var(--card-border)); background: color-mix(in srgb, var(--error) 12%, var(--surface)); }
.summary--excluded { color: var(--muted); opacity: 0.55; }
.row-drill { padding: 0; border: 0; background: none; color: var(--text); font-weight: 700; cursor: pointer; text-decoration: underline dotted; }
.row-drill:hover { color: var(--focus); }
```

- [ ] **Step 4: svelte-check 실행**

Run: `npm run --workspace risu-workbench-webview check`
Expected: MatrixView.svelte 자체 에러 0건. `AssetManagerApp.svelte`에서 `onJumpToCombo` prop 불일치 에러 1건은 예상됨 (Task 5에서 해소)

- [ ] **Step 5: 커밋**

```bash
git add packages/webview/src/lib/components/asset-manager/MatrixView.svelte
git commit -m "feat(webview) : add s1xs2 summary heatmap mode and onOpenCombo to matrix view"
```

---

### Task 5: AssetManagerApp — 콤보 모달 배선 + 최종 검증

**Files:**
- Modify: `packages/webview/src/AssetManagerApp.svelte`

**Interfaces:**
- Consumes: Task 2 `filterEntriesByCombo`, Task 3 `ComboAssetsModal` props 계약, Task 4 `onOpenCombo`, 기존 `AssetDetailModal` props(`entry`, `imgSrc`, `meta`, `catalog`, `onClose`, `onPrev`, `onNext`, `onApplySlots`), 기존 `jumpToCombo(values: string[])`, `onUpdateAssignments`, `onReadMeta`, `metaByPath`, `assetImageSrc`
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: script 수정**

import 추가:

```ts
import { filterEntriesByCombo } from './lib/asset-manager/gridModel';
// biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
import AssetDetailModal from './lib/components/asset-manager/AssetDetailModal.svelte';
// biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
import ComboAssetsModal from './lib/components/asset-manager/ComboAssetsModal.svelte';
```

상태 및 reactive (기존 `gridPresetQuery` 선언 근처):

```ts
// Matrix 셀 클릭 → 콤보 에셋 모달 (undefined = 와일드카드 슬롯)
let comboValues: readonly (string | undefined)[] | null = null;
let comboDetailIndex: number | null = null;
$: comboEntries = comboValues ? filterEntriesByCombo(entries, comboValues) : [];
$: comboLabel = comboValues ? comboValues.map((value) => value ?? '*').join(' / ') : '';
$: comboDetailEntry = comboDetailIndex === null ? null : (comboEntries[comboDetailIndex] ?? null);
```

핸들러 (`jumpToCombo` 아래):

```ts
// biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this callback.
function openCombo(values: (string | undefined)[]): void {
  comboValues = values;
  comboDetailIndex = null;
}

function closeCombo(): void {
  comboValues = null;
  comboDetailIndex = null;
}

function comboJumpToGrid(): void {
  if (!comboValues) return;
  jumpToCombo(comboValues.filter((value): value is string => value !== undefined));
  closeCombo();
}

function openComboDetail(path: string): void {
  const index = comboEntries.findIndex((item) => item.path === path);
  if (index < 0) return;
  comboDetailIndex = index;
  if (!metaByPath[path]) onReadMeta(path);
}

function moveComboDetail(delta: number): void {
  if (comboDetailIndex === null || comboEntries.length === 0) return;
  // 콤보 부분집합 내에서 순환 탐색
  const next = (comboDetailIndex + delta + comboEntries.length) % comboEntries.length;
  comboDetailIndex = next;
  const item = comboEntries[next];
  if (item && !metaByPath[item.path]) onReadMeta(item.path);
}
```

- [ ] **Step 2: 마크업 수정**

MatrixView prop 교체 (244행):

```svelte
<MatrixView {catalog} {onUpdateExpected} onOpenCombo={openCombo} />
```

모달 렌더 — `CatalogBootstrapModal` 블록 뒤에 추가. 상세 진입 중에는 콤보 모달을 숨겨 Escape 키 충돌(두 모달 동시 close)을 방지:

```svelte
{#if comboValues && !comboDetailEntry}
  <ComboAssetsModal
    entries={comboEntries}
    {comboLabel}
    {assetImageSrc}
    onClose={closeCombo}
    onOpenDetail={openComboDetail}
    onJumpToGrid={comboJumpToGrid}
  />
{/if}

{#if comboDetailEntry && catalog}
  <AssetDetailModal
    entry={comboDetailEntry}
    imgSrc={assetImageSrc(comboDetailEntry.path)}
    meta={metaByPath[comboDetailEntry.path] ?? null}
    {catalog}
    onClose={() => (comboDetailIndex = null)}
    onPrev={() => moveComboDetail(-1)}
    onNext={() => moveComboDetail(1)}
    onApplySlots={(path, slots) => onUpdateAssignments([{ path, slots }])}
  />
{/if}
```

주의: `AssetDetailModal`의 Escape는 `onClose`(상세만 닫힘)를 호출 → 콤보 모달로 복귀. 할당 저장(`onApplySlots`) 후 스냅샷 갱신으로 `entries`가 바뀌면 `comboEntries`가 재계산되어 편집된 에셋이 콤보에서 빠질 수 있음 — `comboDetailEntry`가 index 기반 `?? null` 가드라 크래시 없이 콤보 모달로 복귀함(허용 동작).

- [ ] **Step 3: 전체 검증**

Run: `npm run --workspace risu-workbench-webview test && npm run --workspace risu-workbench-webview check && npm run build:webview`
Expected: 테스트 전체 PASS, svelte-check 에러 0건, 빌드 성공

- [ ] **Step 4: 커밋**

```bash
git add packages/webview/src/AssetManagerApp.svelte
git commit -m "feat(webview) : wire combo assets modal and detail navigation from matrix cells"
```

---

## 스펙 커버리지 체크

- 요약 히트맵(스펙 §1, §2) → Task 1 + Task 4
- 콤보 에셋 모달, 보기+상세 진입, Grid 점프 유지(스펙 §3) → Task 2 + Task 3 + Task 5
- 스케일 가드(스펙 §4) → Task 1 (1회 순회 집계), 가상화는 범위 제외
- 테스트(스펙 §5) → Task 1 Step 1, Task 2 Step 1
- 범위 제외(YAGNI): 모달 내 할당 편집 없음(AssetDetailModal 기존 슬롯 편집은 기존 기능이므로 유지), 히트맵 가상화 없음, 2슬롯 매트릭스 계산 변경 없음
