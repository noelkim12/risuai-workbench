<script lang="ts">
  import type { ArtifactBrowserCreateArtifactKind, ArtifactBrowserCreateArtifactPayload, BrowserArtifactCard } from '../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import ArtifactCard from './ArtifactCard.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import CreateArtifactWizard from './CreateArtifactWizard.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import EmptyState from './EmptyState.svelte';

  export let cards: BrowserArtifactCard[];
  export let selectedStableId: string | undefined;
  export let status: string;
  export let importing: boolean;
  export let onRefresh: () => void;
  export let onCreateArtifact: (payload: ArtifactBrowserCreateArtifactPayload) => void;
  export let onImportArtifact: (file: File) => void;
  export let onSelect: (stableId: string) => void;

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup reads and writes this modal state.
  let isCreateModalOpen = false;
  let createKind: ArtifactBrowserCreateArtifactKind = 'charx';
  let importInput: HTMLInputElement;

  $: selectedCard = cards.find((card) => card.stableId === selectedStableId);

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function openCreateModal(kind: ArtifactBrowserCreateArtifactKind = 'charx'): void {
    createKind = kind;
    isCreateModalOpen = true;
  }

  function closeCreateModal(): void {
    isCreateModalOpen = false;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function openImportPicker(): void {
    importInput.click();
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function importSelectedFile(): void {
    const selectedFile = importInput.files?.[0];
    if (!selectedFile) return;

    onImportArtifact(selectedFile);
    importInput.value = '';
  }
</script>

<main class="browser-shell" aria-label="Risuai Workbench Sidebar">
  <header class="browser-header">
    <div>
      <p class="eyebrow">Risuai Workbench</p>
    </div>
    <span class="count-pill">{cards.length}</span>
  </header>

  <section class="toolbar" aria-label="Sidebar actions">
    <button type="button" class="toolbar-button toolbar-button--create" on:click={() => openCreateModal()}>
      <svg class="toolbar-button__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <span>Create</span>
    </button>
    <button type="button" class="toolbar-button toolbar-button--import button-secondary" on:click={openImportPicker} disabled={importing}>
      <svg class="toolbar-button__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2.75v7m0 0 3-3m-3 3-3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M3 10.75v1.5A1.75 1.75 0 0 0 4.75 14h6.5A1.75 1.75 0 0 0 13 12.25v-1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <span>{importing ? 'Importing…' : 'Import'}</span>
    </button>
    <input
      bind:this={importInput}
      class="visually-hidden"
      type="file"
      accept=".charx,.png,.risum,.risup,.risupreset,.preset,.json"
      on:change={importSelectedFile}
    />
    <button type="button" class="toolbar-button toolbar-button--refresh" aria-label="Refresh artifacts" title="Refresh" on:click={onRefresh}>
      <svg class="toolbar-button__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        <path d="M13.5 1.75v3h-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </section>

  <p class="bridge-status" id="status-text">{status}</p>

  {#if importing}
    <div class="import-progress" role="progressbar" aria-label="Import in progress">
      <div class="import-progress__bar"></div>
    </div>
  {/if}

  {#if cards.length === 0}
    <EmptyState {onRefresh} />
  {:else}
    <section class="card-list" aria-label="Discovered workbench items">
      {#each cards as card (card.stableId)}
        <ArtifactCard card={card} selected={card.stableId === selectedStableId} {onSelect} />
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

  <CreateArtifactWizard
    open={isCreateModalOpen}
    initialKind={createKind}
    onCreate={onCreateArtifact}
    onClose={closeCreateModal}
  />
</main>

<style>
  .toolbar-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1, 4px);
    min-width: 0;
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border-radius: var(--radius-md, 10px);
    font-weight: 600;
    letter-spacing: 0.02em;
    overflow: hidden;
    transition:
      transform 140ms ease,
      box-shadow 140ms ease,
      filter 140ms ease;
  }

  .toolbar-button__icon {
    width: 15px;
    height: 15px;
    flex: none;
    transition: transform 180ms ease;
  }

  .toolbar-button--create {
    border: 1px solid color-mix(in srgb, var(--accent-text, #fff) 18%, transparent);
    background: linear-gradient(
      140deg,
      color-mix(in srgb, var(--accent) 100%, transparent) 0%,
      color-mix(in srgb, var(--accent) 78%, var(--focus)) 100%
    );
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 32%, transparent);
  }

  .toolbar-button--import {
    border: 1px solid color-mix(in srgb, var(--focus) 32%, var(--card-border));
    background: color-mix(in srgb, var(--secondary) 88%, var(--focus));
  }

  .toolbar-button--refresh {
    padding: var(--space-2, 8px);
    color: var(--muted);
    border: 1px solid color-mix(in srgb, var(--focus) 24%, var(--card-border));
    background: color-mix(in srgb, var(--card) 82%, var(--focus));
  }

  /* Soft sheen sweeping across on hover. */
  .toolbar-button::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      110deg,
      transparent 30%,
      color-mix(in srgb, var(--accent-text, #fff) 14%, transparent) 50%,
      transparent 70%
    );
    transform: translateX(-120%);
    pointer-events: none;
  }

  .toolbar-button:hover:not(:disabled) {
    outline: none;
    transform: translateY(-1px);
    filter: brightness(1.06);
  }

  .toolbar-button--create:hover:not(:disabled) {
    box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 44%, transparent);
  }

  .toolbar-button--import:hover:not(:disabled) {
    box-shadow: 0 4px 12px color-mix(in srgb, var(--focus) 24%, transparent);
  }

  .toolbar-button:hover:not(:disabled)::after {
    transition: transform 480ms ease;
    transform: translateX(120%);
  }

  .toolbar-button:hover:not(:disabled) .toolbar-button__icon {
    transform: scale(1.15) rotate(90deg);
  }

  .toolbar-button--import:hover:not(:disabled) .toolbar-button__icon {
    transform: scale(1.15) translateY(1px) rotate(0deg);
  }

  .toolbar-button--refresh:hover:not(:disabled) {
    color: var(--text);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--focus) 20%, transparent);
  }

  .toolbar-button--refresh:hover:not(:disabled) .toolbar-button__icon {
    transition: transform 420ms ease;
    transform: rotate(360deg);
  }

  .toolbar-button:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: none;
  }

  .toolbar-button:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .toolbar-button,
    .toolbar-button__icon,
    .toolbar-button::after {
      transition: none;
    }

    .toolbar-button:hover:not(:disabled) {
      transform: none;
    }

    .toolbar-button:hover:not(:disabled) .toolbar-button__icon {
      transform: none;
    }
  }

  .import-progress {
    height: 4px;
    margin-bottom: var(--space-2);
    border-radius: 2px;
    background: var(--vscode-progressBar-background, rgba(255, 255, 255, 0.15));
    overflow: hidden;
  }

  .import-progress__bar {
    height: 100%;
    width: 40%;
    background: var(--vscode-progressBar-foreground, #0a84ff);
    animation: import-indeterminate 1.1s ease-in-out infinite;
  }

  @keyframes import-indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(300%); }
  }
</style>
