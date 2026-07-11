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
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import HmrStatusStrip from './HmrStatusStrip.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import AnalysisProfileCard from './analysis-showcase/AnalysisProfileCard.svelte';

  export let artifact: BrowserArtifactCard;
  export let sections: CharacterSection[];
  export let expandedSectionIds: string[];
  export let status: string;
  export let packState: import('svelte/store').Writable<import('../types').ArtifactBrowserPackCompletedPayload | null>;
  export let hmrState: import('svelte/store').Writable<import('../types').ArtifactBrowserHmrStatusPayload | null>;
  export let onHmrStartBroadcast: (stableId: string) => void;
  export let onHmrStopBroadcast: () => void;
  export let onBack: () => void;
  export let onAnalyzeArtifact: (stableId: string) => void;
  export let onOpenAnalysisReport: (stableId: string) => void;
  export let onPackArtifact: (stableId: string, recovery: boolean) => void;
  export let onOpenMarkerEditor: (stableId: string) => void;
  export let onOpenPluginViewer: (stableId: string) => void;
  export let onToggleSection: (sectionId: string) => void;
  export let onOpenItem: (item: CharacterItem) => void;
  export let onOpenAssetManager: (stableId: string) => void;
  export let onMoveLorebookItem: (
    item: CharacterItem,
    targetFolderPath: string | null,
    placement?: 'inside' | 'before' | 'after',
    targetItemId?: string,
  ) => void;
  export let onMoveLorebookFolder: (folderPath: string, targetFolderPath: string, placement: 'before' | 'after') => void;
  export let onMoveRegexItem: (item: CharacterItem, targetItemId: string, placement: 'before' | 'after') => void;
  export let onMoveGreetingItem: (item: CharacterItem, targetItemId: string, placement: 'before' | 'after') => void;
  export let onCreateSectionEntry: (
    sectionKind: ArtifactBrowserCreateSectionKind,
    entryKind: ArtifactBrowserCreateSectionEntryKind,
    targetFolderPath?: string,
  ) => void;

  $: detailLabel =
    artifact.artifactKind === 'module'
      ? 'Module Detail'
      : artifact.artifactKind === 'plugin'
        ? 'Plugin Detail'
        : 'Character Detail';
  $: detailMeta =
    artifact.artifactKind === 'module'
      ? `${artifact.namespace ?? artifact.sourceFormat} · ${artifact.sourceFormat}`
      : artifact.artifactKind === 'character'
        ? `${artifact.creator} · ${artifact.sourceFormat} · v${artifact.characterVersion}`
        : artifact.artifactKind === 'plugin'
          ? artifact.framework
          : '';

  $: isBroadcasting = $hmrState?.running === true;
  $: isBroadcastingHere = isBroadcasting && $hmrState?.stableId === artifact.stableId;
  $: broadcastTitle = isBroadcastingHere
    ? 'This artifact is already broadcasting.'
    : isBroadcasting
      ? `Already broadcasting: ${$hmrState?.artifactName}. Stop it first, or use "Broadcast this instead" below.`
      : 'Broadcast this artifact to RisuAI';

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this modal state.
  let isPackModalOpen = false;

  /**
   * openPackModal 함수.
   * Pack dialog를 연다.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this event handler.
  function openPackModal(): void {
    isPackModalOpen = true;
  }

  /**
   * closePackModal 함수.
   * Pack dialog를 닫는다.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this event handler.
  function closePackModal(): void {
    isPackModalOpen = false;
  }
</script>

<main class="browser-shell detail-shell" aria-label={`Risu ${detailLabel}`}>
  <div class="detail-sticky-header">
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
      {#if artifact.artifactKind === 'plugin'}
        <button type="button" class="detail-action" on:click={() => onOpenMarkerEditor(artifact.stableId)}>
          Marker Editor
        </button>
        <button type="button" class="detail-action detail-action--primary" on:click={() => onOpenPluginViewer(artifact.stableId)}>
          Plugin Viewer
        </button>
      {:else}
        <button
          type="button"
          class="detail-action"
          disabled={isBroadcasting}
          title={broadcastTitle}
          on:click={() => onHmrStartBroadcast(artifact.stableId)}
        >
          {isBroadcastingHere ? 'Broadcasting' : 'Broadcast'}
        </button>
        <button type="button" class="detail-action detail-action--primary" on:click={openPackModal}>
          Pack
        </button>
      {/if}
    </div>

    {#if artifact.artifactKind !== 'plugin'}
      <HmrStatusStrip
        hmrStatus={$hmrState}
        currentStableId={artifact.stableId}
        onStop={onHmrStopBroadcast}
        onBroadcastHere={() => onHmrStartBroadcast(artifact.stableId)}
      />
    {/if}
  </div>

  <p class="bridge-status" id="status-text">{status}</p>

  <section class="detail-summary" aria-label={`${artifact.artifactKind} location summary`}>
    <p><strong>Root</strong> {artifact.rootPathLabel}</p>
    <p><strong>Manifest</strong> {artifact.markerPathLabel}</p>
  </section>

  {#if artifact.artifactKind !== 'plugin'}
    <AnalysisProfileCard
      profile={artifact.analysisProfile}
      stableId={artifact.stableId}
      onAnalyze={onAnalyzeArtifact}
      onOpenReport={onOpenAnalysisReport}
    />
  {/if}

  {#if artifact.artifactKind !== 'plugin'}
    <CharacterAccordion
      {sections}
      {expandedSectionIds}
      {onToggleSection}
      {onOpenItem}
      onOpenAssetManager={() => onOpenAssetManager(artifact.stableId)}
      {onMoveLorebookItem}
      {onMoveLorebookFolder}
      {onMoveRegexItem}
      {onMoveGreetingItem}
      {onCreateSectionEntry}
    />
  {/if}
</main>

{#if isPackModalOpen && artifact.artifactKind !== 'plugin'}
  <PackArtifactModal
    {artifact}
    packState={packState}
    onConfirm={(recovery) => onPackArtifact(artifact.stableId, recovery)}
    onClose={closePackModal}
  />
{/if}

<style>
  .detail-sticky-header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: calc(var(--space-3) * -1) calc(var(--space-3) * -1) var(--space-3);
    padding: var(--space-3) var(--space-3);
    background: var(--surface);
    border-bottom: 1px solid var(--card-border);
    box-shadow: 0 6px 12px -8px var(--vscode-widget-shadow);
  }

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

  .detail-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
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
