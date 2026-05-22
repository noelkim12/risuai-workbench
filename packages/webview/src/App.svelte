<script lang="ts">
import type { Writable } from 'svelte/store';
// biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
import ArtifactDetailView from './lib/components/ArtifactDetailView.svelte';
// biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
import SidebarView from './lib/components/SidebarView.svelte';
import type { BrowserArtifactCard, CharacterItem, CharacterSection } from './lib/types';

export let cards: Writable<BrowserArtifactCard[]>;
export let selectedStableId: Writable<string | undefined>;
export let detailSections: Writable<CharacterSection[]>;
export let expandedSectionIds: Writable<string[]>;
export let viewMode: Writable<'artifacts' | 'artifactDetail'>;
export let status: Writable<string>;
export let refreshCards: () => void;
export let selectCard: (stableId: string) => void;
export let returnToCards: () => void;
export let toggleSection: (sectionId: string) => void;
export let openItem: (item: CharacterItem) => void;

$: selectedArtifact = $cards.find((card) => card.stableId === $selectedStableId);
</script>

{#if $viewMode === 'artifactDetail' && selectedArtifact}
  <ArtifactDetailView
    artifact={selectedArtifact}
    sections={$detailSections}
    expandedSectionIds={$expandedSectionIds}
    status={$status}
    onBack={returnToCards}
    onToggleSection={toggleSection}
    onOpenItem={openItem}
  />
{:else}
  <SidebarView
    cards={$cards}
    selectedStableId={$selectedStableId}
    status={$status}
    onRefresh={refreshCards}
    onSelect={selectCard}
  />
{/if}
