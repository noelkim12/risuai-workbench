<!--
  Asset Manager Vocab view: 슬롯별 vocab CRUD/정렬 + 스키마 편집/미리보기 + 후보 패널 2종.
  D5 가 D3 스텁을 본 구현으로 교체함.
  - 슬롯 컬럼: 값 추가/삭제/순서 이동(append/remove/splice, 중복 방지).
  - 스키마 에디터: 슬롯 수/라벨/구분자 편집 → joinTemplate 미리보기 후 저장.
  - lorebook 후보: onAnalyzeLorebook 결과를 폴더 그룹으로 표시, s1 채택.
  - 파일명 부트스트랩: onBootstrap 결과 prefix→s1·suffix→마지막 슬롯 채택.
  @file packages/webview/src/lib/components/asset-manager/VocabView.svelte
-->

<script lang="ts">
  import { labelTemplate, renderNamePreview } from '../../asset-manager/naming';
  import type {
    AssetCatalogMirror,
    AssetCatalogOutputsMirror,
    AssetCatalogSchemaMirror,
    AssetSlotId,
    LorebookNameCandidateMirror,
  } from '../../types/assetManager';

  export let catalog: AssetCatalogMirror;
  export let lorebookCandidates: readonly LorebookNameCandidateMirror[] = [];
  export let tokenizePrefixes: readonly { readonly value: string; readonly count: number }[] = [];
  export let tokenizeSuffixes: readonly { readonly value: string; readonly count: number }[] = [];
  export let onUpdateVocab: (vocab: AssetCatalogMirror['vocab']) => void = () => undefined;
  export let onUpdateSchema: (schema: AssetCatalogSchemaMirror, outputs?: AssetCatalogOutputsMirror) => void =
    () => undefined;
  export let onAnalyzeLorebook: () => void = () => undefined;
  export let onBootstrap: () => void = () => undefined;

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
    const current = [...(catalog.vocab[slotId] ?? [])];
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

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls these action.
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
            value={newValues[slot.id] ?? ''}
            oninput={(event) => (newValues = { ...newValues, [slot.id]: (event.currentTarget as HTMLInputElement).value })}
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
      <p class="schema-template">템플릿: <code>{labelTemplate(draftSchema)}</code></p>
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
  .schema-editor label { display: flex; flex-direction: column; gap: 2px; font-size: var(--text-sm); }
  .candidates h3 { margin: var(--space-1) 0 0; font-size: 0.8rem; color: var(--secondary-text); }
  .candidate-row { display: flex; justify-content: space-between; align-items: center; font-size: var(--text-sm); gap: 4px; }
  .candidate-row em { color: var(--secondary-text); font-style: normal; }
  .schema-sample code, .schema-template code { font-weight: 700; }
  .schema-template { color: var(--secondary-text); font-size: var(--text-sm); margin: 0; }
</style>
