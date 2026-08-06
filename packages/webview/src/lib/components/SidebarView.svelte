<script lang="ts">
  import type { BrowserArtifactCard } from '../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import ArtifactCard from './ArtifactCard.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import EmptyState from './EmptyState.svelte';

  export let cards: BrowserArtifactCard[];
  export let selectedStableId: string | undefined;
  export let status: string;
  export let importing: boolean;
  export let onRefresh: () => void;
  export let onOpenCreateWizard: () => void;
  export let onImportArtifact: (file: File) => void;
  export let onSelect: (stableId: string) => void;

  let importInput: HTMLInputElement;

  $: selectedCard = cards.find((card) => card.stableId === selectedStableId);

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
    <div class="browser-header__brand">
      <span class="browser-header__mark" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none">
          <path
            d="M2.5 5.25 8 2.25l5.5 3v5.5l-5.5 3-5.5-3v-5.5Z"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linejoin="round"
          />
          <path d="M2.5 5.25 8 8.25l5.5-3M8 8.25v5.5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
        </svg>
      </span>
      <div class="browser-header__titles">
        <h1 class="browser-header__title">Risuai Workbench</h1>
        <p class="browser-header__subtitle">Artifact Browser</p>
      </div>
    </div>
    <span class="count-pill browser-header__count" title="{cards.length} artifacts">{cards.length}</span>
  </header>

  <section class="toolbar" aria-label="Sidebar actions">
    <button type="button" class="toolbar-button toolbar-button--create" on:click={onOpenCreateWizard}>
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
      accept=".charx,.png,.jpg,.jpeg,.risum,.risup,.risupreset,.preset,.json"
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
</main>

<style>
  .browser-header {
    position: relative;
    padding: var(--space-3) var(--space-3);
    border: 1px solid color-mix(in srgb, var(--focus) 36%, var(--card-border));
    background:
      radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 55%),
      linear-gradient(
        160deg,
        color-mix(in srgb, var(--card) 92%, var(--focus)) 0%,
        var(--section, var(--card)) 70%
      );
    overflow: hidden;
  }

  /* Accent hairline across the top edge. */
  .browser-header::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 2px;
    background: linear-gradient(
      90deg,
      var(--accent) 0%,
      color-mix(in srgb, var(--accent) 45%, var(--focus)) 45%,
      transparent 100%
    );
    pointer-events: none;
  }

  .browser-header__brand {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    min-width: 0;
  }

  .browser-header__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: var(--radius-md, 10px);
    color: var(--accent-text, #fff);
    border: 1px solid color-mix(in srgb, var(--accent-text, #fff) 18%, transparent);
    background: linear-gradient(
      140deg,
      var(--accent) 0%,
      color-mix(in srgb, var(--accent) 72%, var(--focus)) 100%
    );
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 36%, transparent);
  }

  .browser-header__mark svg {
    width: 16px;
    height: 16px;
  }

  .browser-header__titles {
    min-width: 0;
  }

  .browser-header__title {
    font-size: var(--text-lg, 13px);
    font-weight: 700;
    letter-spacing: 0.01em;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .browser-header__subtitle {
    margin-top: 1px;
    color: var(--muted);
    font-size: var(--text-xs, 10px);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .browser-header__count {
    flex: none;
    font-size: var(--text-sm, 11px);
    border: 1px solid color-mix(in srgb, var(--focus) 40%, var(--card-border));
    color: var(--text);
    background: color-mix(in srgb, var(--card) 70%, var(--focus));
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent-text, #fff) 8%, transparent);
  }

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
