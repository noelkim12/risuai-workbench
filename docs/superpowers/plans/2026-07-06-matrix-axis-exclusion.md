# Matrix Axis-Exclusion Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MatrixView's per-s1 "Expected 편집" checkbox sidebar with an ephemeral "축 제외" panel that hides selected S1/S2/S3 values from the matrix axes across all view modes.

**Architecture:** Thread an `excluded` set-triple through the existing `MatrixViewOptions` (same pattern as `hideBareS1`) so gridModel's axis builders drop excluded values wherever a slot appears as a row/column axis. The exclusion state lives as three component-local `Set`s (resets on reload). The right sidebar is rewritten from an expected-editor into an exclusion panel.

**Tech Stack:** Svelte (webview), TypeScript, Vitest.

## Global Constraints

- Exclusion is **ephemeral view state** (component-local `Set`s), NOT persisted to `catalog`. No new message types.
- Svelte reactivity: never mutate a `Set` in place for reactive state — always reassign a new `Set`.
- Excluded values are removed **only where the slot is a visible row/column axis**; for the summary view (where s3 is folded into the `n/m` count) excluded s3 is also removed from each cell's expected s3 list so `expectedCount` and `missingValues` stay consistent.
- Empty/undefined `excluded` must reproduce current behavior exactly (no regressions).
- Verify commands (run from `packages/webview/`): `npx vitest run tests/lib/asset-manager/gridModel.test.ts` and `npm run check` (svelte-check).

---

## File Structure

- `packages/core`/mirror types: **no change** — `MatrixViewOptions` lives in `packages/webview/src/lib/asset-manager/gridModel.ts`.
- `packages/webview/src/lib/asset-manager/gridModel.ts` — add `excluded` to `MatrixViewOptions`; apply it in `filterAxisS1`, `filterAxisS2`, `computeTwoSlotMatrix`, `computeThreeSlotMatrix`, `computeSummaryMatrixClient`, `computeCrossMatrixClient`, `computeS1S2MatrixClient`, `computeMissingMatrixClient`.
- `packages/webview/tests/lib/asset-manager/gridModel.test.ts` — add an `axis exclusion` describe block.
- `packages/webview/src/lib/components/asset-manager/MatrixView.svelte` — add exclusion state + handlers; thread `excluded` into the four compute calls; replace the `<aside>` expected-editor with the exclusion panel; remove `onUpdateExpected` prop, `editingS1`, `editableSlots`, `toggleExpected`, and the `expectedListForClient`/`AssetExpectedMapMirror` usages that only served the editor.
- `packages/webview/src/AssetManagerApp.svelte` — remove the `onUpdateExpected` const (lines ~191-192), its `{onUpdateExpected}` binding on `<MatrixView>` (line ~293), and the now-unused `AssetExpectedMapMirror` type import (line ~12).

---

## Task 1: gridModel — `excluded` axis filtering

**Files:**
- Modify: `packages/webview/src/lib/asset-manager/gridModel.ts`
- Test: `packages/webview/tests/lib/asset-manager/gridModel.test.ts`

**Interfaces:**
- Consumes: existing `AssetCatalogMirror`, `MatrixViewOptions`.
- Produces: extended `MatrixViewOptions.excluded?: { s1?; s2?; s3?: ReadonlySet<string> }`, honored by `computeMissingMatrixClient`, `computeSummaryMatrixClient`, `computeCrossMatrixClient`, `computeS1S2MatrixClient`.

- [ ] **Step 1: Write the failing tests**

Append this describe block to `packages/webview/tests/lib/asset-manager/gridModel.test.ts` (after the `computeCrossMatrixClient` block, before the final closing of the file):

```ts
describe('axis exclusion (MatrixViewOptions.excluded)', () => {
  const twoSlot = {
    version: 1 as const,
    schema: {
      slots: [
        { id: 's1' as const, label: 'character' },
        { id: 's2' as const, label: 'emotion' },
      ],
      joinTemplate: '{s1} {s2}',
    },
    vocab: { s1: ['Rin', 'Yua'], s2: ['angry', 'sad'] },
    expected: {},
    assignments: { 'a/rin_angry.png': { s1: 'Rin', s2: 'angry' } },
  };

  const threeSlot = {
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
      'a/rin_casual_sad.png': { s1: 'Rin', s2: 'casual', s3: 'sad' },
      'a/rin_uniform_angry.png': { s1: 'Rin', s2: 'uniform', s3: 'angry' },
    },
  };

  it('2-slot: drops excluded s1 rows and s2 cols', () => {
    expect(
      computeMissingMatrixClient(twoSlot, undefined, undefined, { excluded: { s1: new Set(['Yua']) } })?.rows,
    ).toEqual(['Rin']);
    expect(
      computeMissingMatrixClient(twoSlot, undefined, undefined, { excluded: { s2: new Set(['sad']) } })?.cols,
    ).toEqual(['angry']);
  });

  it('3-slot detail (pinned s1): drops excluded s2 rows and s3 cols', () => {
    expect(
      computeMissingMatrixClient(threeSlot, 'Rin', undefined, { excluded: { s2: new Set(['uniform']) } })?.rows,
    ).toEqual(['casual']);
    expect(
      computeMissingMatrixClient(threeSlot, 'Rin', undefined, { excluded: { s3: new Set(['sad']) } })?.cols,
    ).toEqual(['angry']);
  });

  it('summary: drops excluded s1 rows / s2 cols and removes excluded s3 from cell counts', () => {
    expect(computeSummaryMatrixClient(threeSlot, { excluded: { s1: new Set(['Yua']) } })?.rows).toEqual(['Rin']);
    expect(computeSummaryMatrixClient(threeSlot, { excluded: { s2: new Set(['uniform']) } })?.cols).toEqual(['casual']);
    // Rin/uniform normally has sad missing (expectedCount 2, missingValues ['sad']).
    // Excluding s3 'sad' → only angry expected, angry present → complete, expectedCount 1, no missing.
    const cell = computeSummaryMatrixClient(threeSlot, { excluded: { s3: new Set(['sad']) } })?.cells[0]?.[1];
    expect(cell).toMatchObject({ state: 'complete', expectedCount: 1, missingValues: [] });
  });

  it('cross: drops excluded s1 cols and any row whose s2 or s3 is excluded', () => {
    expect(computeCrossMatrixClient(threeSlot, { excluded: { s1: new Set(['Yua']) } })?.cols).toEqual(['Rin']);
    expect(computeCrossMatrixClient(threeSlot, { excluded: { s2: new Set(['casual']) } })?.rows).toEqual([
      { s2: 'uniform', s3: 'angry' },
    ]);
    expect(computeCrossMatrixClient(threeSlot, { excluded: { s3: new Set(['sad']) } })?.rows).toEqual([
      { s2: 'casual', s3: 'angry' },
      { s2: 'uniform', s3: 'angry' },
    ]);
  });

  it('empty/undefined excluded reproduces baseline', () => {
    expect(computeSummaryMatrixClient(threeSlot, { excluded: {} })?.rows).toEqual(['Rin', 'Yua']);
    expect(computeMissingMatrixClient(twoSlot)?.rows).toEqual(['Rin', 'Yua']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/webview && npx vitest run tests/lib/asset-manager/gridModel.test.ts -t "axis exclusion"`
Expected: FAIL — exclusion is ignored, so `Yua`/`sad`/`uniform` still appear (e.g. `rows` equals `['Rin','Yua']` not `['Rin']`).

- [ ] **Step 3: Extend `MatrixViewOptions`**

In `packages/webview/src/lib/asset-manager/gridModel.ts`, replace the `MatrixViewOptions` interface (currently ~lines 254-262) with:

```ts
export interface MatrixViewOptions {
  /** true 면 s2 조합 파일도 없고 명시적 expected override 도 없는 "s1-only" 값을 축에서 제외. */
  readonly hideBareS1?: boolean;
  /**
   * true 면 hideBareS1 이 켜져 있어도 "부분 조합"(s1·s2 만 있고 s3 없는) 캐릭터를 축에 포함한다.
   * 3슬롯에서 s3 축까지 완성돼야 비교 대상이 되는 기본 규칙을 s2 까지로 완화한다(2슬롯은 무영향).
   */
  readonly includePartialCombos?: boolean;
  /** 각 슬롯 축에서 제외(숨김)할 값. 해당 슬롯이 행/열 축으로 등장하는 곳에서 제거된다. */
  readonly excluded?: {
    readonly s1?: ReadonlySet<string>;
    readonly s2?: ReadonlySet<string>;
    readonly s3?: ReadonlySet<string>;
  };
}
```

- [ ] **Step 4: Apply exclusion in `filterAxisS1` and `filterAxisS2`**

Replace `filterAxisS1` (currently ~lines 283-287) with:

```ts
/** hideBareS1 옵션이 켜져 있으면 조합/override 없는 s1 을 걸러낸다(includePartialCombos 로 완화 가능). excluded.s1 은 항상 제외. */
function filterAxisS1(catalog: AssetCatalogMirror, s1Values: readonly string[], options?: MatrixViewOptions): string[] {
  const excluded = options?.excluded?.s1;
  const values = excluded ? s1Values.filter((s1) => !excluded.has(s1)) : [...s1Values];
  if (!options?.hideBareS1) return values;
  const keep = s1WithCombosOrOverride(catalog, options);
  return values.filter((s1) => keep.has(s1));
}
```

Replace `filterAxisS2` (currently ~lines 308-312) with:

```ts
/** hideBareS1 시 s2 축을 "실제 완전 조합/override 에 쓰인 값" 으로 제한한다. excluded.s2 은 hideBareS1 과 무관하게 항상 제외. */
function filterAxisS2(catalog: AssetCatalogMirror, s2Values: readonly string[], options?: MatrixViewOptions): string[] {
  const excluded = options?.excluded?.s2;
  const values = excluded ? s2Values.filter((s2) => !excluded.has(s2)) : [...s2Values];
  if (!options?.hideBareS1) return values;
  const keep = s2InFullCombosOrOverride(catalog);
  return values.filter((s2) => keep.has(s2));
}
```

- [ ] **Step 5: Filter excluded s3 in the summary cells**

In `computeSummaryMatrixClient` (currently ~lines 314-329), change the `expectedS3` line inside the `cells` map so it drops excluded s3. Replace:

```ts
      const expectedS3 = expectedListForClient(catalog, row, 's3');
```

with:

```ts
      const s3Excluded = options?.excluded?.s3;
      const expectedS3 = expectedListForClient(catalog, row, 's3').filter((s3) => !s3Excluded?.has(s3));
```

(The `rows`/`cols` in this function already go through `filterAxisS1`/`filterAxisS2`, so s1/s2 exclusion is handled by Step 4.)

- [ ] **Step 6: Filter excluded rows in `computeCrossMatrixClient`**

In `computeCrossMatrixClient` (currently ~lines 350-384), the `cols` already use `filterAxisS1(catalog, ..., options)` (s1 handled by Step 4). Filter the rows by excluded s2/s3. Replace:

```ts
  const rows = orderCrossRows(comboSet, catalog.vocab.s2 ?? [], catalog.vocab.s3 ?? []);
```

with:

```ts
  const excludedS2 = options?.excluded?.s2;
  const excludedS3 = options?.excluded?.s3;
  const rows = orderCrossRows(comboSet, catalog.vocab.s2 ?? [], catalog.vocab.s3 ?? []).filter(
    (row) => !excludedS2?.has(row.s2) && !excludedS3?.has(row.s3),
  );
```

- [ ] **Step 7: Thread `options` into the 2-slot and 3-slot detail matrices**

In `computeMissingMatrixClient` (currently ~lines 231-246), pass `options` to the 3-slot detail builder. Replace:

```ts
  if (slotIds.length === 3) {
    if (s1 === undefined) return null;
    return computeThreeSlotMatrix(catalog, s1, s2);
  }
```

with:

```ts
  if (slotIds.length === 3) {
    if (s1 === undefined) return null;
    return computeThreeSlotMatrix(catalog, s1, s2, options);
  }
```

Replace `computeThreeSlotMatrix` (currently ~lines 559-576) with:

```ts
function computeThreeSlotMatrix(catalog: AssetCatalogMirror, s1: string, s2?: string, options?: MatrixViewOptions): MissingMatrixClient {
  const excludedS2 = options?.excluded?.s2;
  const excludedS3 = options?.excluded?.s3;
  // s2 조건이 걸리면 해당 outfit 한 행으로 축소(후보 검증은 호출측 드롭다운이 담당)
  const rows = (s2 ? [s2] : expectedListForClient(catalog, s1, 's2')).filter((row) => !excludedS2?.has(row));
  const cols = expectedListForClient(catalog, s1, 's3').filter((col) => !excludedS3?.has(col));
  const groups = groupAssignments(catalog, ['s1', 's2', 's3']);
  return {
    rowSlotId: 's2',
    colSlotId: 's3',
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
```

In `computeTwoSlotMatrix` (currently ~lines 578-598), apply excluded s2 to `cols` (rows already use `filterAxisS1`). Replace:

```ts
  const cols = [...(catalog.vocab.s2 ?? [])];
```

with:

```ts
  const excludedS2 = options?.excluded?.s2;
  const cols = (catalog.vocab.s2 ?? []).filter((col) => !excludedS2?.has(col));
```

- [ ] **Step 8: Forward `excluded` from `computeS1S2MatrixClient`**

In `computeS1S2MatrixClient` (currently ~lines 336-339), forward the excluded sets into the delegated 2-slot call. Replace:

```ts
  return computeTwoSlotMatrix(catalog, undefined, { hideBareS1: options?.hideBareS1, includePartialCombos: true });
```

with:

```ts
  return computeTwoSlotMatrix(catalog, undefined, {
    hideBareS1: options?.hideBareS1,
    includePartialCombos: true,
    excluded: options?.excluded,
  });
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd packages/webview && npx vitest run tests/lib/asset-manager/gridModel.test.ts`
Expected: PASS — the new `axis exclusion` block passes and all pre-existing gridModel tests still pass (regression check).

- [ ] **Step 10: Commit**

```bash
git add packages/webview/src/lib/asset-manager/gridModel.ts packages/webview/tests/lib/asset-manager/gridModel.test.ts
git commit -m "feat(asset): add excluded-axis option to matrix grid model"
```

---

## Task 2: MatrixView — replace Expected editor with 축 제외 panel

**Files:**
- Modify: `packages/webview/src/lib/components/asset-manager/MatrixView.svelte`
- Modify: `packages/webview/src/AssetManagerApp.svelte`

**Interfaces:**
- Consumes: `MatrixViewOptions.excluded` from Task 1.
- Produces: `MatrixView` no longer exports an `onUpdateExpected` prop.

- [ ] **Step 1: Update the `<script>` imports and props**

In `packages/webview/src/lib/components/asset-manager/MatrixView.svelte`, replace the import block (currently ~lines 13-23) with — note `expectedListForClient` is dropped and `AssetExpectedMapMirror` is no longer imported:

```svelte
  import {
    chainedValuesForClient,
    computeCrossMatrixClient,
    computeMissingMatrixClient,
    computeS1S2MatrixClient,
    computeSummaryMatrixClient,
    type CrossCellClient,
    type SummaryCellClient,
  } from '../../asset-manager/gridModel';
  import type { AssetCatalogMirror } from '../../types/assetManager';
```

Replace the props/state block (currently ~lines 25-35) with:

```svelte
  export let catalog: AssetCatalogMirror;
  export let onOpenCombo: (values: (string | undefined)[]) => void = () => undefined;

  let selectedS1 = ''; // '' = 전체 (2슬롯·3슬롯 공통)
  let selectedS2 = ''; // '' = 전체
  // 3슬롯 + s1 전체 보기 모드: 요약 히트맵 / 교차 비교(s2×s3) / s1×s2(s3 무시)
  let viewMode: 'summary' | 'cross' | 's1s2' = 'summary';
  let hideBareS1 = true; // s2 조합·override 없는 "s1-only" 캐릭터를 비교 축에서 숨김(기본 숨김)
  // 축 제외(임시 뷰 상태): 새로고침 시 초기화. in-place 변이 금지 — 항상 재할당.
  let excludedS1 = new Set<string>();
  let excludedS2 = new Set<string>();
  let excludedS3 = new Set<string>();
  $: excluded = { s1: excludedS1, s2: excludedS2, s3: excludedS3 };
```

- [ ] **Step 2: Thread `excluded` into the four compute calls**

Replace the reactive compute statements (currently ~lines 41-50) with:

```svelte
  $: summary = summaryMode && viewMode === 'summary' ? computeSummaryMatrixClient(catalog, { hideBareS1, excluded }) : null;
  $: cross = summaryMode && viewMode === 'cross' ? computeCrossMatrixClient(catalog, { hideBareS1, excluded }) : null;
  // s2 조건 후보: 선택된 s1 을 통해 chaining 된 s2 (override 있으면 큐레이션, 없으면 실제 할당값)
  $: s2Options = slotCount === 3 && selectedS1 ? chainedValuesForClient(catalog, selectedS1, 's2') : [];
  // s1 이 바뀌어 현재 s2 선택이 후보 밖이면 전체로 리셋
  $: if (selectedS2 && !s2Options.includes(selectedS2)) selectedS2 = '';
  // s1×s2 모드는 s3 를 무시한 s1×s2 존재 매트릭스(요약/교차와 달리 MissingMatrix 형태로 렌더).
  $: matrix = summaryMode
    ? (viewMode === 's1s2' ? computeS1S2MatrixClient(catalog, { hideBareS1, excluded }) : null)
    : computeMissingMatrixClient(catalog, selectedS1 || undefined, selectedS2 || undefined, { hideBareS1, excluded });
```

- [ ] **Step 3: Remove the expected-editor logic, add exclusion handlers**

Delete the `editableSlots` reactive (currently ~line 51) and the `toggleExpected` function (currently ~lines 94-109). Add these handlers immediately after the `clickCrossCell` function (~line 78):

```svelte
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function toggleExcluded(slotId: 's1' | 's2' | 's3', value: string): void {
    const current = slotId === 's1' ? excludedS1 : slotId === 's2' ? excludedS2 : excludedS3;
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    if (slotId === 's1') excludedS1 = next;
    else if (slotId === 's2') excludedS2 = next;
    else excludedS3 = next;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clearExcluded(slotId: 's1' | 's2' | 's3'): void {
    if (slotId === 's1') excludedS1 = new Set();
    else if (slotId === 's2') excludedS2 = new Set();
    else excludedS3 = new Set();
  }
```

Note: `editingS1` (currently ~line 35, already removed in Step 1's block replacement) and its `bind:value` are gone; `summaryCellTitle`, `drillToRow`, `clickCell`, `clickSummaryCell`, `clickCrossCell`, and `STATE_LABEL` stay unchanged.

- [ ] **Step 4: Replace the `<aside>` markup**

Replace the entire `<aside class="expected-editor" ...>...</aside>` block (currently ~lines 282-310) with:

```svelte
  <aside class="axis-exclude" aria-label="축 제외">
    <h2>축 제외</h2>
    <p class="axis-exclude__hint">체크한 값을 매트릭스 축에서 숨깁니다.</p>
    {#each catalog.schema.slots as slot (slot.id)}
      {@const excludedSet = slot.id === 's1' ? excludedS1 : slot.id === 's2' ? excludedS2 : excludedS3}
      <fieldset>
        <legend>
          <span>{slot.label}</span>
          {#if excludedSet.size > 0}
            <button type="button" class="axis-exclude__reset" onclick={() => clearExcluded(slot.id)}>모두 포함</button>
          {/if}
        </legend>
        {#each catalog.vocab[slot.id] ?? [] as value (value)}
          <label class="axis-exclude__item" class:is-excluded={excludedSet.has(value)}>
            <input type="checkbox" checked={excludedSet.has(value)} onchange={() => toggleExcluded(slot.id, value)} />
            {value}
          </label>
        {/each}
      </fieldset>
    {/each}
  </aside>
```

- [ ] **Step 5: Rename the sidebar styles**

In the `<style>` block, replace the `.expected-editor*` rules (currently ~lines 410-425) with:

```svelte
  .axis-exclude {
    width: 240px;
    flex-shrink: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
  }
  .axis-exclude h2 { margin: 0; font-size: var(--text-lg); font-weight: 700; }
  .axis-exclude__hint { margin: 0; font-size: var(--text-sm); color: var(--muted); }
  .axis-exclude fieldset { display: flex; flex-direction: column; gap: var(--space-1); }
  .axis-exclude legend { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); width: 100%; font-weight: 700; font-size: var(--text-sm); }
  .axis-exclude__reset { padding: 0 var(--space-1); border: 1px solid var(--card-border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font-size: var(--text-sm); cursor: pointer; }
  .axis-exclude__reset:hover { outline: 2px solid var(--focus); outline-offset: -1px; }
  .axis-exclude__item { display: flex; align-items: center; gap: var(--space-1); font-size: var(--text-md); }
  .axis-exclude__item.is-excluded { color: var(--muted); text-decoration: line-through; opacity: 0.7; }
```

- [ ] **Step 6: Remove `onUpdateExpected` from `AssetManagerApp.svelte`**

In `packages/webview/src/AssetManagerApp.svelte`:
1. Delete the `onUpdateExpected` const (currently ~lines 191-192):

```svelte
  const onUpdateExpected = (expected: AssetExpectedMapMirror) =>
    post(createAssetManagerWebviewMessage('asset-manager/updateExpected', { stableId, expected }));
```

2. Remove the `{onUpdateExpected}` binding from the `<MatrixView>` tag (currently ~line 293) so it reads:

```svelte
      <MatrixView {catalog} onOpenCombo={openCombo} />
```

3. Remove the now-unused `type AssetExpectedMapMirror,` line from the import block (currently ~line 12).

- [ ] **Step 7: Typecheck**

Run: `cd packages/webview && npm run check`
Expected: PASS — no unused-variable / missing-prop / type errors. (If svelte-check flags `slot.id` narrowing on `toggleExcluded`, confirm `AssetSlotId` is `'s1' | 's2' | 's3'` — it is, so the union matches.)

- [ ] **Step 8: Manual smoke test**

Launch the webview (per the project's run skill / `/run`). In an asset catalog with a 3-slot schema:
- Confirm the right sidebar shows "축 제외" with S1/S2/S3 fieldsets.
- Check a value under S2 → its column/row disappears from the matrix; the label shows struck-through.
- Click "모두 포함" under S2 → the value returns.
- Reload → exclusions reset (ephemeral).

- [ ] **Step 9: Commit**

```bash
git add packages/webview/src/lib/components/asset-manager/MatrixView.svelte packages/webview/src/AssetManagerApp.svelte
git commit -m "feat(asset): replace matrix expected editor with axis-exclusion panel"
```

---

## Self-Review Notes

- **Spec coverage:** ephemeral state (T2.S1), full sidebar replacement (T2.S4-6), S1·S2·S3 coverage across all view modes (T1.S4-8), summary s3 folded into counts (T1.S5), remove `onUpdateExpected` (T2.S6). All spec sections mapped.
- **Type consistency:** `excluded` shape (`{ s1?; s2?; s3?: ReadonlySet<string> }`) is identical in the interface (T1.S3), all gridModel readers (T1.S4-8), and the component's `$: excluded` object (T2.S1). `toggleExcluded`/`clearExcluded` take `'s1' | 's2' | 's3'` matching `AssetSlotId`.
- **No placeholders:** every code step contains full code; every run step names the exact command and expected result.
