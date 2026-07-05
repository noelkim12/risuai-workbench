<!--
  Asset Manager Matrix view: missing 매트릭스 + expected 편집 + 셀 클릭 콤보 열기.
  D5 가 D3 스텁을 본 구현으로 교체함.
  - 2슬롯: 행=s1·열=s2 매트릭스. 3슬롯 전체: 요약 히트맵 / 교차 비교(행=s2×s3·열=s1) / s1×s2(s3 무시) 3모드, s1 선택=상세.
  - 기본(요약/교차)은 s1·s2·s3 완전 조합만 축에 넣지만, "s1×s2" 모드는 s3 를 무시해 s1·s2 만 있는 캐릭터도 따로 본다.
  - "조합 없는 캐릭터" 토글(2·3슬롯 s1 전체): s2 조합·override 없는 s1-only 값을 축에서 숨김(기본)/표시.
  - 셀 클릭 시 onOpenCombo 로 조합 에셋 모달을 연다.
  - 축 제외 사이드패널: S1/S2/S3 값을 임시로 매트릭스 축에서 숨김(새로고침 시 초기화).
  @file packages/webview/src/lib/components/asset-manager/MatrixView.svelte
-->

<script lang="ts">
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

  $: slotCount = catalog.schema.slots.length;
  $: s1List = catalog.vocab.s1 ?? [];
  // 3슬롯 + s1 전체 → 요약 히트맵 모드 (행=s1 × 열=s2 완성도 집계)
  $: summaryMode = slotCount === 3 && !selectedS1;
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

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this constant.
  const STATE_LABEL: Record<string, string> = {
    present: '✓',
    duplicate: '⚠',
    missing: '✗',
    excluded: '·',
  };

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clickCell(row: string, col: string): void {
    // s1×s2 모드: row=s1, col=s2, s3 미지정. (일반 3슬롯 상세는 row=s2, col=s3 + 고정 selectedS1)
    if (summaryMode && viewMode === 's1s2') onOpenCombo([row, col, undefined]);
    else if (slotCount === 3) onOpenCombo([selectedS1, row, col]);
    else if (slotCount === 2) onOpenCombo([row, col]);
    else onOpenCombo([row]);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clickSummaryCell(cell: SummaryCellClient): void {
    onOpenCombo([cell.row, cell.col, undefined]);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clickCrossCell(cell: CrossCellClient): void {
    onOpenCombo([cell.s1, cell.s2, cell.s3]);
  }

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

</script>

<div class="matrix-layout">
  <section class="matrix-main" aria-label="Missing asset matrix">
    {#if slotCount >= 2}
      <div class="matrix-pins">
        <label class="matrix-s1">
          <span>{catalog.schema.slots[0].label}</span>
          <select bind:value={selectedS1}>
            <option value="">전체</option>
            {#each s1List as value (value)}<option {value}>{value}</option>{/each}
          </select>
        </label>
        {#if slotCount === 3 && !selectedS1}
          <div class="mode-group" role="group" aria-label="비교 보기 모드">
            <button type="button" class="mode-toggle" class:is-on={viewMode === 'summary'} onclick={() => (viewMode = 'summary')}>
              요약
            </button>
            <button type="button" class="mode-toggle" class:is-on={viewMode === 'cross'} onclick={() => (viewMode = 'cross')}>
              교차 비교
            </button>
            <button
              type="button"
              class="mode-toggle"
              class:is-on={viewMode === 's1s2'}
              title="s3 를 무시하고 s1×s2 조합만 비교 (s1·s2 만 있는 캐릭터도 함께 확인)"
              onclick={() => (viewMode = 's1s2')}
            >
              s1×s2
            </button>
          </div>
        {/if}
        {#if slotCount >= 2 && !selectedS1}
          <button
            type="button"
            class="mode-toggle"
            title="s2 조합도 override 도 없는 s1-only 캐릭터를 비교 축에서 숨기거나 표시"
            onclick={() => (hideBareS1 = !hideBareS1)}
          >
            {hideBareS1 ? '조합 없는 캐릭터 표시' : '조합 없는 캐릭터 숨김'}
          </button>
        {/if}
        {#if slotCount === 3 && selectedS1}
          <label class="matrix-s1">
            <span>{catalog.schema.slots[1].label}</span>
            <select bind:value={selectedS2}>
              <option value="">전체</option>
              {#each s2Options as value (value)}<option {value}>{value}</option>{/each}
            </select>
          </label>
        {/if}
      </div>
    {/if}

    {#if summaryMode && viewMode === 'cross'}
      {#if cross && cross.rows.length > 0 && cross.cols.length > 0}
        <div class="matrix-scroll">
          <table class="matrix-table">
            <thead>
              <tr>
                <th></th>
                {#each cross.cols as col (col)}
                  <th>
                    <button type="button" class="row-drill" title={`${col} 상세 매트릭스 보기`} onclick={() => drillToRow(col)}>
                      {col}
                    </button>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each cross.rows as row, rowIndex (`${row.s2}\u0000${row.s3}`)}
                <tr>
                  <th>{row.s2} / {row.s3}</th>
                  {#each cross.cells[rowIndex] as cell (cell.s1)}
                    <td>
                      <button
                        type="button"
                        class={`cell cell--${cell.state}`}
                        title={`${cell.s1} · ${cell.s2} / ${cell.s3} · ${cell.count} file(s)`}
                        onclick={() => clickCrossCell(cell)}
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
        <p class="matrix-legend">✓ 존재 · ⚠ 중복 · ✗ missing(기대 조합) · · 비대상(expected 밖) · 열 이름 클릭 = 상세 매트릭스</p>
      {:else}
        <p class="matrix-empty">표시할 조합이 없습니다. Vocab/Expected 를 먼저 구성하세요.</p>
      {/if}
    {:else if summaryMode && viewMode === 'summary'}
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
      <p class="matrix-legend">
        {#if summaryMode && viewMode === 's1s2'}s3 무시 · s1×s2 존재만 비교 · {/if}✓ 존재 · ⚠ 중복 · ✗ missing(기대 조합) · · 비대상(expected 밖)
      </p>
    {:else}
      <p class="matrix-empty">vocab의 {catalog.schema.slots[0].label} 목록이 비어 있습니다. Vocab 탭에서 먼저 등록하세요.</p>
    {/if}
  </section>

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
</div>

<style>
  .matrix-layout { display: flex; gap: var(--space-3); flex: 1; min-height: 0; }
  .matrix-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .matrix-pins { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .matrix-s1 { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); color: var(--muted); max-width: 240px; }
  .matrix-scroll {
    overflow: auto;
    min-height: 0;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
  }
  .matrix-table { border-collapse: separate; border-spacing: 0; font-size: var(--text-sm); }
  /* 열 헤더: 세로 스크롤 시 위쪽에만 고정 */
  .matrix-table thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: var(--space-1) var(--space-2);
    /* --section 은 반투명(sideBarSectionHeader) → 불투명 --card 위에 올려 스크롤 시 비침 방지 */
    background-color: var(--card);
    background-image: linear-gradient(var(--section), var(--section));
    color: var(--muted);
    text-align: center;
    font-weight: 700;
    white-space: nowrap;
    box-shadow: inset 0 -1px 0 var(--card-border);
  }
  /* 행 헤더: 가로 스크롤 시 왼쪽에만 고정(top:auto 로 해당 행과 함께 스크롤 → 겹침 방지) */
  .matrix-table tbody th {
    position: sticky;
    left: 0;
    top: auto;
    z-index: 1;
    padding: var(--space-1) var(--space-2);
    background-color: var(--card);
    background-image: linear-gradient(var(--section), var(--section));
    color: var(--text);
    text-align: left;
    font-weight: 700;
    white-space: nowrap;
    box-shadow: inset -1px 0 0 var(--card-border);
  }
  /* 좌상단 코너: 양축 고정 + 최상단 */
  .matrix-table thead th:first-child {
    left: 0;
    z-index: 3;
    box-shadow: inset -1px -1px 0 var(--card-border);
  }
  .matrix-table td { padding: 2px; text-align: center; }
  .cell {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--muted);
    font-weight: 600;
    cursor: pointer;
    transition: outline-color 0.12s ease, transform 0.08s ease;
  }
  .cell:hover:not(:disabled) { outline: 2px solid var(--focus); outline-offset: -1px; }
  .cell:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .cell:active:not(:disabled) { transform: scale(0.94); }
  .cell--present { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, var(--card-border)); background: color-mix(in srgb, var(--success) 10%, var(--surface)); }
  .cell--duplicate { color: var(--focus); border-color: color-mix(in srgb, var(--focus) 40%, var(--card-border)); background: color-mix(in srgb, var(--focus) 12%, var(--surface)); }
  .cell--missing { color: var(--error); font-weight: 800; border-color: color-mix(in srgb, var(--error) 45%, var(--card-border)); background: color-mix(in srgb, var(--error) 12%, var(--surface)); }
  .cell--excluded { color: var(--muted); opacity: 0.55; }
  .cell--summary { width: auto; min-width: 44px; padding: 0 var(--space-1); font-size: var(--text-sm); }
  .summary--complete { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, var(--card-border)); background: color-mix(in srgb, var(--success) 10%, var(--surface)); }
  .summary--partial { color: var(--focus); border-color: color-mix(in srgb, var(--focus) 40%, var(--card-border)); background: color-mix(in srgb, var(--focus) 12%, var(--surface)); }
  .summary--empty { color: var(--error); font-weight: 800; border-color: color-mix(in srgb, var(--error) 45%, var(--card-border)); background: color-mix(in srgb, var(--error) 12%, var(--surface)); }
  .summary--excluded { color: var(--muted); opacity: 0.55; }
  .row-drill { padding: 0; border: 0; background: none; color: var(--text); font-weight: 700; cursor: pointer; text-decoration: underline dotted; }
  .row-drill:hover { color: var(--focus); }
  .mode-toggle {
    align-self: flex-end;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .mode-toggle:hover { outline: 2px solid var(--focus); outline-offset: -1px; }
  .mode-group { display: inline-flex; align-self: flex-end; gap: 4px; }
  .mode-toggle.is-on {
    border-color: color-mix(in srgb, var(--focus) 55%, var(--card-border));
    background: color-mix(in srgb, var(--focus) 16%, var(--surface));
    color: var(--focus);
  }
  .matrix-legend, .matrix-empty { color: var(--muted); font-size: var(--text-sm); margin: 0; }
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
</style>
