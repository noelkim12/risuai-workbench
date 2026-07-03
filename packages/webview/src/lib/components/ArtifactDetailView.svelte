<script lang="ts">
  // biome-ignore assist/source/organizeImports: Existing Svelte import ordering keeps component usage comments adjacent.
  import type {
    ArtifactBrowserCreateSectionEntryKind,
    ArtifactBrowserCreateSectionKind,
    BrowserArtifactCard,
    CharacterItem,
    CharacterSection,
  } from '../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import Breadcrumb from './Breadcrumb.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import CharacterAccordion from './sidebar/WorkbenchAccordions.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import StatusBadge from './StatusBadge.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import PackArtifactModal from './PackArtifactModal.svelte';

  export let artifact: BrowserArtifactCard;
  export let sections: CharacterSection[];
  export let expandedSectionIds: string[];
  export let status: string;
  export let packState: import('svelte/store').Writable<import('../types').ArtifactBrowserPackCompletedPayload | null>;
  export let onBack: () => void;
  export let onAnalyzeArtifact: (stableId: string) => void;
  export let onPackArtifact: (stableId: string, recovery: boolean) => void;
  export let onToggleSection: (sectionId: string) => void;
  export let onOpenItem: (item: CharacterItem) => void;
  export let onMoveLorebookItem: (
    item: CharacterItem,
    targetFolderPath: string | null,
    placement?: 'inside' | 'before' | 'after',
    targetItemId?: string,
  ) => void;
  export let onMoveLorebookFolder: (folderPath: string, targetFolderPath: string, placement: 'before' | 'after') => void;
  export let onMoveRegexItem: (item: CharacterItem, targetItemId: string, placement: 'before' | 'after') => void;
  export let onCreateSectionEntry: (
    sectionKind: ArtifactBrowserCreateSectionKind,
    entryKind: ArtifactBrowserCreateSectionEntryKind,
    targetFolderPath?: string,
  ) => void;

  $: detailLabel = artifact.artifactKind === 'module' ? 'Module Detail' : 'Character Detail';
  $: detailMeta =
    artifact.artifactKind === 'module'
      ? `${artifact.namespace ?? artifact.sourceFormat} · ${artifact.sourceFormat}`
      : `${artifact.creator} · ${artifact.sourceFormat} · v${artifact.characterVersion}`;

  let isPackModalOpen = false;

  /**
   * openPackModal 함수.
   * Pack dialog를 연다.
   */
  function openPackModal(): void {
    isPackModalOpen = true;
  }

  /**
   * closePackModal 함수.
   * Pack dialog를 닫는다.
   */
  function closePackModal(): void {
    isPackModalOpen = false;
  }
</script>

<main class="browser-shell detail-shell" aria-label={`Risu ${detailLabel}`}>
  <Breadcrumb artifactName={artifact.name} backLabel="Artifacts" ariaLabel={`${detailLabel} breadcrumb`} {onBack} />

  <header class="browser-header detail-header">
    <div class="detail-header__info">
      <p class="eyebrow">{detailLabel}</p>
      <h1>{artifact.name}</h1>
      <p class="detail-header__meta">{detailMeta}</p>
    </div>
    <StatusBadge status={artifact.status} />
  </header>

  <div class="detail-actions">
    <button type="button" class="detail-action" on:click={() => onAnalyzeArtifact(artifact.stableId)}>
      Analyze
    </button>
    <button type="button" class="detail-action detail-action--primary" on:click={openPackModal}>
      Pack
    </button>
  </div>

  <p class="bridge-status" id="status-text">{status}</p>

  <section class="detail-summary" aria-label={`${artifact.artifactKind} location summary`}>
    <p><strong>Root</strong> {artifact.rootPathLabel}</p>
    <p><strong>Manifest</strong> {artifact.markerPathLabel}</p>
  </section>

  <CharacterAccordion
    {sections}
    {expandedSectionIds}
    {onToggleSection}
    {onOpenItem}
    {onMoveLorebookItem}
    {onMoveLorebookFolder}
    {onMoveRegexItem}
    {onCreateSectionEntry}
  />
</main>

{#if isPackModalOpen}
  <PackArtifactModal
    {artifact}
    packState={packState}
    onConfirm={(recovery) => onPackArtifact(artifact.stableId, recovery)}
    onClose={closePackModal}
  />
{/if}

<style>
  .detail-header {
    align-items: flex-start;
  }

  .detail-header__info {
    min-width: 0;
  }

  .detail-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-2);
  }

  .detail-action {
    padding: var(--space-1) var(--space-3);
    min-width: 76px;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    color: var(--secondary-text);
    background: var(--secondary);
    font-size: var(--text-md);
    font-weight: 600;
    text-align: center;
    transition:
      background 120ms ease,
      border-color 120ms ease;
  }

  .detail-action:hover:not(:disabled) {
    background: color-mix(in srgb, var(--secondary) 82%, var(--focus));
    border-color: var(--focus);
    outline: none;
  }

  .detail-action--primary {
    color: var(--accent-text);
    background: var(--accent);
    border-color: transparent;
  }

  .detail-action--primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 86%, var(--focus));
    border-color: transparent;
  }
</style>
