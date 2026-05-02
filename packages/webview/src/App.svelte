<script lang="ts">
import type { Writable } from 'svelte/store';
// biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
import CharacterDetailView from './lib/components/CharacterDetailView.svelte';
// biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
import SidebarView from './lib/components/SidebarView.svelte';
import type { CharacterBrowserCard, CharacterItem, CharacterSection } from './lib/types';

export let cards: Writable<CharacterBrowserCard[]>;
export let selectedStableId: Writable<string | undefined>;
export let detailSections: Writable<CharacterSection[]>;
export let expandedSectionIds: Writable<string[]>;
export let viewMode: Writable<'characters' | 'characterDetail'>;
export let status: Writable<string>;
export let refreshCards: () => void;
export let selectCard: (stableId: string) => void;
export let returnToCards: () => void;
export let toggleSection: (sectionId: string) => void;
export let openItem: (item: CharacterItem) => void;

$: selectedCharacter = $cards.find((card) => card.stableId === $selectedStableId);
</script>

{#if $viewMode === 'characterDetail' && selectedCharacter}
  <CharacterDetailView
    character={selectedCharacter}
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
