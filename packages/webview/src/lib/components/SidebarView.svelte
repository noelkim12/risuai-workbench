<script lang="ts">
  import type { ArtifactBrowserCreateArtifactKind, ArtifactBrowserCreateArtifactPayload, BrowserArtifactCard } from '../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import ArtifactCard from './ArtifactCard.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import EmptyState from './EmptyState.svelte';

  export let cards: BrowserArtifactCard[];
  export let selectedStableId: string | undefined;
  export let status: string;
  export let onRefresh: () => void;
  export let onCreateArtifact: (payload: ArtifactBrowserCreateArtifactPayload) => void;
  export let onImportArtifact: (file: File) => void;
  export let onSelect: (stableId: string) => void;

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup reads and writes this modal state.
  let isCreateModalOpen = false;
  let createKind: ArtifactBrowserCreateArtifactKind = 'charx';
  let name = '';
  let creator = '';
  let tags = '';
  let utilityBot = false;
  let lowLevelAccess = false;
  let description = '';
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

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this form handler.
  function submitCreate(): void {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (createKind === 'charx') {
      onCreateArtifact({
        kind: 'charx',
        name: trimmedName,
        creator: creator.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        utilityBot,
        lowLevelAccess,
      });
    } else {
      onCreateArtifact({
        kind: 'module',
        name: trimmedName,
        description: description.trim(),
        lowLevelAccess,
      });
    }

    closeCreateModal();
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
    <button type="button" on:click={() => openCreateModal()}>Create</button>
    <button type="button" class="button-secondary" on:click={openImportPicker}>Import</button>
    <input
      bind:this={importInput}
      class="visually-hidden"
      type="file"
      accept=".charx,.png,.risum,.risup,.risupreset,.preset,.json"
      on:change={importSelectedFile}
    />
    <button type="button" class="button-icon" aria-label="Refresh artifacts" title="Refresh" on:click={onRefresh}>
      ↻
    </button>
  </section>

  <p class="bridge-status" id="status-text">{status}</p>

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

  {#if isCreateModalOpen}
    <section class="modal-backdrop" aria-label="Create dialog backdrop">
      <button type="button" class="modal-scrim" aria-label="Close create dialog" on:click={closeCreateModal}></button>
      <div class="create-modal" aria-label="Create workbench artifact" role="dialog" aria-modal="true">
        <form class="create-modal__form" on:submit|preventDefault={submitCreate}>
          <header class="create-modal__header">
            <div>
              <p class="eyebrow">Create root marker</p>
              <h2>New workbench item</h2>
            </div>
            <button type="button" class="button-icon button-icon--quiet" aria-label="Close create dialog" on:click={closeCreateModal}>×</button>
          </header>

          <fieldset class="create-type-switch" aria-label="Artifact type">
            <label class:active={createKind === 'charx'}>
              <input type="radio" bind:group={createKind} value="charx" />
              CharX
            </label>
            <label class:active={createKind === 'module'}>
              <input type="radio" bind:group={createKind} value="module" />
              Module
            </label>
          </fieldset>

          <label class="field-stack">
            <span>Name</span>
            <input type="text" bind:value={name} required autocomplete="off" placeholder={createKind === 'charx' ? 'Character name' : 'Module name'} />
          </label>

          {#if createKind === 'charx'}
            <label class="field-stack">
              <span>Creator</span>
              <input type="text" bind:value={creator} autocomplete="off" placeholder="Creator" />
            </label>
            <label class="field-stack">
              <span>Tags</span>
              <input type="text" bind:value={tags} autocomplete="off" placeholder="tag-a, tag-b" />
            </label>
            <div class="checkbox-grid">
              <label><input type="checkbox" bind:checked={utilityBot} /> Utility bot</label>
              <label><input type="checkbox" bind:checked={lowLevelAccess} /> Low level access</label>
            </div>
          {:else}
            <label class="field-stack">
              <span>Description</span>
              <textarea bind:value={description} rows="3" placeholder="Short module description"></textarea>
            </label>
            <label class="checkbox-line"><input type="checkbox" bind:checked={lowLevelAccess} /> Low level access</label>
          {/if}

          <footer class="create-modal__actions">
            <button type="button" class="button-secondary" on:click={closeCreateModal}>Cancel</button>
            <button type="submit" disabled={!name.trim()}>Create</button>
          </footer>
        </form>
      </div>
    </section>
  {/if}
</main>
