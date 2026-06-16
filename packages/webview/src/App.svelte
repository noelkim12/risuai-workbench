<script lang="ts">
import type { Writable } from 'svelte/store';
// biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
import ArtifactDetailView from './lib/components/ArtifactDetailView.svelte';
// biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
import SidebarView from './lib/components/SidebarView.svelte';
import type {
  ArtifactBrowserCreateSectionEntryKind,
  ArtifactBrowserCreateSectionKind,
  BrowserArtifactCard,
  CharacterItem,
  CharacterSection,
} from './lib/types';

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
export let moveLorebookItem: (
  item: CharacterItem,
  targetFolderPath: string | null,
  placement?: 'inside' | 'before' | 'after',
  targetItemId?: string,
) => void;
export let moveLorebookFolder: (folderPath: string, targetFolderPath: string, placement: 'before' | 'after') => void;
export let moveRegexItem: (item: CharacterItem, targetItemId: string, placement: 'before' | 'after') => void;
export let createSectionEntry: (
  sectionKind: ArtifactBrowserCreateSectionKind,
  entryKind: ArtifactBrowserCreateSectionEntryKind,
  targetFolderPath?: string,
) => void;

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
    onMoveLorebookItem={moveLorebookItem}
    onMoveLorebookFolder={moveLorebookFolder}
    onMoveRegexItem={moveRegexItem}
    onCreateSectionEntry={createSectionEntry}
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
