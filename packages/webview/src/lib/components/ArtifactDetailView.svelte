<script lang="ts">
  import type { BrowserArtifactCard, CharacterItem, CharacterSection } from '../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import Breadcrumb from './Breadcrumb.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import CharacterAccordion from './character/CharacterAccordion.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import StatusBadge from './StatusBadge.svelte';

  export let artifact: BrowserArtifactCard;
  export let sections: CharacterSection[];
  export let expandedSectionIds: string[];
  export let status: string;
  export let onBack: () => void;
  export let onToggleSection: (sectionId: string) => void;
  export let onOpenItem: (item: CharacterItem) => void;

  $: detailLabel = artifact.artifactKind === 'module' ? 'Module Detail' : 'Character Detail';
  $: detailMeta =
    artifact.artifactKind === 'module'
      ? `${artifact.namespace ?? artifact.sourceFormat} · ${artifact.sourceFormat}`
      : `${artifact.creator} · ${artifact.sourceFormat} · v${artifact.characterVersion}`;
</script>

<main class="browser-shell detail-shell" aria-label={`Risu ${detailLabel}`}>
  <Breadcrumb artifactName={artifact.name} backLabel="Artifacts" ariaLabel={`${detailLabel} breadcrumb`} {onBack} />

  <header class="browser-header detail-header">
    <div>
      <p class="eyebrow">{detailLabel}</p>
      <h1>{artifact.name}</h1>
      <p class="detail-header__meta">{detailMeta}</p>
    </div>
    <StatusBadge status={artifact.status} />
  </header>

  <p class="bridge-status" id="status-text">{status}</p>

  <section class="detail-summary" aria-label={`${artifact.artifactKind} location summary`}>
    <p><strong>Root</strong> {artifact.rootPathLabel}</p>
    <p><strong>Manifest</strong> {artifact.markerPathLabel}</p>
  </section>

  <CharacterAccordion {sections} {expandedSectionIds} {onToggleSection} {onOpenItem} />
</main>
