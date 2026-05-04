<script lang="ts">
  import type { BrowserArtifactCard } from '../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import CharacterCard from './CharacterCard.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import EmptyState from './EmptyState.svelte';

  export let cards: BrowserArtifactCard[];
  export let selectedStableId: string | undefined;
  export let status: string;
  export let onRefresh: () => void;
  export let onSelect: (stableId: string) => void;

  $: selectedCard = cards.find((card) => card.stableId === selectedStableId);
</script>

<main class="browser-shell" aria-label="Risu Workbench Sidebar">
  <header class="browser-header">
    <div>
      <p class="eyebrow">Risu Workbench</p>
    </div>
    <span class="count-pill">{cards.length}</span>
  </header>

  <section class="toolbar" aria-label="Sidebar actions">
    <button type="button" on:click={onRefresh}>Refresh</button>
    <button type="button" class="button-secondary" disabled title="Workbench item creation is outside Phase 3">
      Create
    </button>
  </section>

  <p class="bridge-status" id="status-text">{status}</p>

  {#if cards.length === 0}
    <EmptyState {onRefresh} />
  {:else}
    <section class="card-list" aria-label="Discovered workbench items">
      {#each cards as card (card.stableId)}
        <CharacterCard card={card} selected={card.stableId === selectedStableId} {onSelect} />
      {/each}
    </section>
  {/if}

  {#if selectedCard}
    <section class="selection-preview" aria-label="Selected workbench item">
      <p class="eyebrow">Selected for Phase 4</p>
      <h2>{selectedCard.name}</h2>
      <p>{selectedCard.rootPathLabel}</p>
    </section>
  {/if}
</main>
