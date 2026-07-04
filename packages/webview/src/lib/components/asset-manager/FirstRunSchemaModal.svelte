<!--
  Asset Manager 첫 실행 슬롯 스키마 설정 모달.
  catalog가 없을 때 노출되며, 2/3 슬롯 선택 · 라벨 · 구분자 편집 →
  live preview → confirm/skip 으로 AssetManagerApp.onUpdateSchema 를 호출함.
  @file packages/webview/src/lib/components/asset-manager/FirstRunSchemaModal.svelte
-->

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
