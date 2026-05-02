<script lang="ts">
  import CharacterAccordion from './character/CharacterAccordion.svelte';
  import Breadcrumb from './Breadcrumb.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import type { CharacterBrowserCard, CharacterItem, CharacterSection } from '../types';

  export let character: CharacterBrowserCard;
  export let sections: CharacterSection[];
  export let expandedSectionIds: string[];
  export let status: string;
  export let onBack: () => void;
  export let onToggleSection: (sectionId: string) => void;
  export let onOpenItem: (item: CharacterItem) => void;
</script>

<main class="browser-shell detail-shell" aria-label="Risu Character Detail">
  <Breadcrumb characterName={character.name} {onBack} />

  <header class="browser-header detail-header">
    <div>
      <p class="eyebrow">Character Detail</p>
      <h1>{character.name}</h1>
      <p class="detail-header__meta">{character.creator} · {character.sourceFormat} · v{character.characterVersion}</p>
    </div>
    <StatusBadge status={character.status} />
  </header>

  <p class="bridge-status" id="status-text">{status}</p>

  <section class="detail-summary" aria-label="Character location summary">
    <p><strong>Root</strong> {character.rootPathLabel}</p>
    <p><strong>Manifest</strong> {character.markerPathLabel}</p>
  </section>

  <CharacterAccordion {sections} {expandedSectionIds} {onToggleSection} {onOpenItem} />
</main>
