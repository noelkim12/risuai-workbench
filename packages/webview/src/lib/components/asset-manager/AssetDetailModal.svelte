<!--
  Asset Manager 상세 모달.
  이미지 미리보기, 메타데이터/생성정보 표시, 인라인 슬롯 편집.
  Escape 닫기, ←/→ 탐색, prev/next 버튼.
  - meta 가 null 이면 로딩 중(GridView 가 onReadMeta 로 온디맨드 로드).
  - draft 슬롯 편집은 value+onchange 패턴으로 indexed bind 이슈를 회피.
  @file packages/webview/src/lib/components/asset-manager/AssetDetailModal.svelte
-->

<script lang="ts">
  import type {
    AssetCatalogMirror,
    AssetManagerAssetEntry,
    AssetSlotId,
    AssetSlotValues,
    ImageMetaMirror,
  } from '../../types/assetManager';

  export let entry: AssetManagerAssetEntry;
  export let imgSrc: string;
  export let meta: ImageMetaMirror | null;
  export let catalog: AssetCatalogMirror;
  export let onClose: () => void = () => undefined;
  export let onPrev: () => void = () => undefined;
  export let onNext: () => void = () => undefined;
  export let onApplySlots: (path: string, slots: AssetSlotValues) => void = () => undefined;

  let draft: AssetSlotValues = {};
  // entry 가 바뀌면(탐색) 해당 entry 의 기존 할당으로 draft 초기화.
  $: draft = { ...(entry.assignment ?? {}) };

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function apply(): void {
    onApplySlots(entry.path, { ...draft });
  }

  // biome-ignore lint/correctness/noUnusedVariables: svelte:window consumes this handler.
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowLeft') onPrev();
    else if (event.key === 'ArrowRight') onNext();
  }

  // value+onchange: 빈 값 선택 시 키를 삭제해 미할당 상태로.
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this handler.
  function onSlotChange(slotId: AssetSlotId, event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const next = { ...draft };
    if (value === '') delete next[slotId];
    else next[slotId] = value;
    draft = next;
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section class="modal-backdrop" aria-label="Asset detail backdrop">
  <button
    type="button"
    class="modal-scrim"
    aria-label="Close asset detail"
    onclick={onClose}></button>
  <div class="detail-modal" role="dialog" aria-modal="true" aria-label="Asset detail">
    <header class="detail-modal__header">
      <h2>{entry.generatedName ?? entry.fileStem}</h2>
      <div>
        <button type="button" class="button-secondary" onclick={onPrev} aria-label="Previous asset"
          >←</button
        >
        <button type="button" class="button-secondary" onclick={onNext} aria-label="Next asset"
          >→</button
        >
        <button type="button" class="button-secondary" onclick={onClose} aria-label="Close"
          >×</button
        >
      </div>
    </header>

    <div class="detail-modal__body">
      <img src={imgSrc} alt={entry.fileStem} decoding="async" />
      <div class="detail-modal__side">
        <dl class="detail-modal__info">
          <dt>path</dt><dd>{entry.path}</dd>
          <dt>format</dt><dd>{meta?.info.format ?? entry.ext}</dd>
          <dt>size</dt><dd>{(entry.sizeBytes / 1024).toFixed(1)} KB</dd>
          {#if meta?.info.width}<dt>dimensions</dt><dd>{meta.info.width}×{meta.info.height}</dd>{/if}
        </dl>

        <h3>Slots</h3>
        {#each catalog.schema.slots as slot (slot.id)}
          <label class="detail-modal__slot">
            <span>{slot.label}</span>
            <select
              value={draft[slot.id] ?? ''}
              onchange={(event) => onSlotChange(slot.id, event)}
            >
              <option value="">—</option>
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
  .detail-modal {
    position: relative;
    width: min(1200px, 96vw);
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-lg);
    background: var(--card);
    box-shadow: var(--card-shadow);
    color: var(--text);
  }
  .detail-modal__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }
  .detail-modal__header > div { display: flex; gap: var(--space-1); flex: 0 0 auto; }
  .detail-modal__header h2 {
    margin: 0;
    min-width: 0;
    font-size: var(--text-xl);
    overflow-wrap: anywhere;
  }
  .detail-modal__header button {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: var(--text-lg);
  }
  .detail-modal__body {
    display: flex;
    gap: var(--space-3);
    min-height: 0;
  }
  .detail-modal__body img {
    flex: 1;
    min-width: 0;
    max-height: 72vh;
    object-fit: contain;
    background: var(--secondary);
    border-radius: var(--radius-sm);
  }
  .detail-modal__side {
    width: 360px;
    flex-shrink: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .detail-modal__side h3 {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  /* 짧은 메타(path/format/size…) → 컴팩트 2열 */
  .detail-modal__info {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 2px var(--space-2);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
    margin: 0;
  }
  .detail-modal__info dt {
    font-weight: 700;
    color: var(--muted);
  }
  .detail-modal__info dd {
    margin: 0;
    color: var(--text);
  }
  /* 생성정보(프롬프트 등 긴 값) → 라벨 위, 값은 전체 폭 박스로 row-by-row */
  .detail-modal__gen {
    display: block;
    font-size: var(--text-sm);
    margin: 0;
  }
  .detail-modal__gen dt {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .detail-modal__gen dt:first-of-type {
    margin-top: 0;
  }
  .detail-modal__gen dd {
    margin: 0;
    padding: var(--space-2);
    color: var(--text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--surface);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    max-height: 220px;
    overflow-y: auto;
  }
  .detail-modal__slot {
    display: flex;
    flex-direction: column;
    font-size: var(--text-sm);
    gap: var(--space-1);
  }
  .detail-modal__slot > span { color: var(--muted); font-weight: 700; }
  .detail-modal__hint {
    color: var(--secondary-text);
    font-size: var(--text-sm);
    margin: 0;
  }
  .detail-modal__source {
    font-weight: 700;
    margin: 0;
  }
</style>
