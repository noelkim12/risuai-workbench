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
