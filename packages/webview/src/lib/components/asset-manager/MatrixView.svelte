<!--
  Asset Manager Matrix view: missing 매트릭스 + expected 편집 + 셀 클릭 Grid 점프.
  D5 가 D3 스텁을 본 구현으로 교체함.
  - 2슬롯: 행=s1·열=s2 매트릭스. 3슬롯: s1 선택 후 행=expected s2·열=expected s3.
  - 셀 클릭 시 onJumpToCombo 로 Grid 에 preset query 전달.
  - expected 사이드패널: per-s1 슬롯 override 토글(vocab 전체와 같으면 제거).
  @file packages/webview/src/lib/components/asset-manager/MatrixView.svelte
-->

<script lang="ts">
  import { computeMissingMatrixClient, expectedListForClient } from '../../asset-manager/gridModel';
  import type { AssetCatalogMirror, AssetExpectedMapMirror } from '../../types/assetManager';

  export let catalog: AssetCatalogMirror;
  export let onUpdateExpected: (expected: AssetExpectedMapMirror) => void = () => undefined;
  export let onJumpToCombo: (values: string[]) => void = () => undefined;

  let selectedS1 = '';
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this via bind:value.
  let editingS1 = '';

  $: slotCount = catalog.schema.slots.length;
  $: s1List = catalog.vocab.s1 ?? [];
  $: if (slotCount === 3 && !selectedS1 && s1List.length > 0) selectedS1 = s1List[0];
  $: matrix = computeMissingMatrixClient(catalog, slotCount === 3 ? selectedS1 : undefined);
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
      <p class="matrix-legend">✓ 존재 · ⚠ 중복 · ✗ missing(기대 조합) · · 비대상(expected 밖)</p>
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
  .matrix-s1 { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); color: var(--muted); max-width: 240px; }
  .matrix-scroll {
    overflow: auto;
    min-height: 0;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
  }
  .matrix-table { border-collapse: separate; border-spacing: 0; font-size: var(--text-sm); }
  .matrix-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: var(--space-1) var(--space-2);
    background: var(--section);
    color: var(--muted);
    text-align: left;
    font-weight: 700;
  }
  .matrix-table tbody th { position: sticky; left: 0; z-index: 1; color: var(--text); }
  .matrix-table td { padding: 2px; }
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
  }
  .cell:hover:not(:disabled) { outline: 1px solid var(--focus); }
  .cell--present { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, var(--card-border)); background: color-mix(in srgb, var(--success) 10%, var(--surface)); }
  .cell--duplicate { color: var(--focus); border-color: color-mix(in srgb, var(--focus) 40%, var(--card-border)); background: color-mix(in srgb, var(--focus) 12%, var(--surface)); }
  .cell--missing { color: var(--error); font-weight: 800; border-color: color-mix(in srgb, var(--error) 45%, var(--card-border)); background: color-mix(in srgb, var(--error) 12%, var(--surface)); }
  .cell--excluded { color: var(--muted); opacity: 0.55; }
  .matrix-legend, .matrix-empty { color: var(--muted); font-size: var(--text-sm); margin: 0; }
  .expected-editor {
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
  .expected-editor h2 { margin: 0; font-size: var(--text-lg); font-weight: 700; }
  .expected-editor > label { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); color: var(--muted); }
  .expected-editor fieldset { display: flex; flex-direction: column; gap: var(--space-1); }
  .expected-editor__item { display: flex; align-items: center; gap: var(--space-1); font-size: var(--text-md); }
</style>
