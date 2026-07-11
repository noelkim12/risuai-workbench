<script lang="ts">
import type { Writable } from 'svelte/store';
// biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
import ArtifactDetailView from './lib/components/ArtifactDetailView.svelte';
// biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
import SidebarView from './lib/components/SidebarView.svelte';
import type {
  ArtifactBrowserCreateSectionEntryKind,
  ArtifactBrowserCreateSectionKind,
  ArtifactBrowserHmrStatusPayload,
  ArtifactBrowserPackCompletedPayload,
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
export let importing: Writable<boolean>;

// Listener props are injected from packages/webview/src/main.ts in mount(App, { props }).
// App.svelte does not own these actions; it only routes them to the active child view.
// From main.ts: refreshCards() -> SidebarView.onRefresh.
export let refreshCards: () => void;
// From main.ts: openCreateWizard() -> SidebarView.onOpenCreateWizard.
export let openCreateWizard: () => void;
// From main.ts: importArtifact() -> SidebarView.onImportArtifact.
export let importArtifact: (file: File) => void;
// From main.ts: selectCard() -> SidebarView.onSelect.
export let selectCard: (stableId: string) => void;
// From main.ts: returnToCards() -> ArtifactDetailView.onBack.
export let returnToCards: () => void;
// From main.ts: toggleSection() -> ArtifactDetailView.onToggleSection.
export let toggleSection: (sectionId: string) => void;
// From main.ts: openItem() -> ArtifactDetailView.onOpenItem.
export let openItem: (item: CharacterItem) => void;
// From main.ts: openAssetManager() -> ArtifactDetailView.onOpenAssetManager.
export let openAssetManager: (stableId: string) => void;
// From main.ts: moveLorebookItem() -> ArtifactDetailView.onMoveLorebookItem.
export let moveLorebookItem: (
  item: CharacterItem,
  targetFolderPath: string | null,
  placement?: 'inside' | 'before' | 'after',
  targetItemId?: string,
) => void;
// From main.ts: moveLorebookFolder() -> ArtifactDetailView.onMoveLorebookFolder.
export let moveLorebookFolder: (folderPath: string, targetFolderPath: string, placement: 'before' | 'after') => void;
// From main.ts: moveRegexItem() -> ArtifactDetailView.onMoveRegexItem.
export let moveRegexItem: (item: CharacterItem, targetItemId: string, placement: 'before' | 'after') => void;
// From main.ts: moveGreetingItem() -> ArtifactDetailView.onMoveGreetingItem.
export let moveGreetingItem: (item: CharacterItem, targetItemId: string, placement: 'before' | 'after') => void;
// From main.ts: createSectionEntry() -> ArtifactDetailView.onCreateSectionEntry.
export let createSectionEntry: (
  sectionKind: ArtifactBrowserCreateSectionKind,
  entryKind: ArtifactBrowserCreateSectionEntryKind,
  targetFolderPath?: string,
) => void;
export let packArtifact: (stableId: string, recovery: boolean) => void;
export let analyzeArtifact: (stableId: string) => void;
export let openAnalysisReport: (stableId: string) => void;
// From main.ts: openMarkerEditor() -> ArtifactDetailView.onOpenMarkerEditor.
export let openMarkerEditor: (stableId: string) => void;
// From main.ts: openPluginViewer() -> ArtifactDetailView.onOpenPluginViewer.
export let openPluginViewer: (stableId: string) => void;
export let packState: Writable<ArtifactBrowserPackCompletedPayload | null>;
export let hmrState: Writable<ArtifactBrowserHmrStatusPayload | null>;
export let onHmrStartBroadcast: (stableId: string) => void;
export let onHmrStopBroadcast: () => void;

$: selectedArtifact = $cards.find((card) => card.stableId === $selectedStableId);
</script>

{#if $viewMode === 'artifactDetail' && selectedArtifact}
  <ArtifactDetailView
    artifact={selectedArtifact}
    sections={$detailSections}
    expandedSectionIds={$expandedSectionIds}
    status={$status}
    packState={packState}
    {hmrState}
    {onHmrStartBroadcast}
    {onHmrStopBroadcast}
    onBack={returnToCards}
    onAnalyzeArtifact={analyzeArtifact}
    onOpenAnalysisReport={openAnalysisReport}
    onPackArtifact={packArtifact}
    onOpenMarkerEditor={openMarkerEditor}
    onOpenPluginViewer={openPluginViewer}
    onToggleSection={toggleSection}
    onOpenItem={openItem}
    onOpenAssetManager={openAssetManager}
    onMoveLorebookItem={moveLorebookItem}
    onMoveLorebookFolder={moveLorebookFolder}
    onMoveRegexItem={moveRegexItem}
    onMoveGreetingItem={moveGreetingItem}
    onCreateSectionEntry={createSectionEntry}
  />
{:else}
  <SidebarView
    cards={$cards}
    selectedStableId={$selectedStableId}
    status={$status}
    importing={$importing}
    onRefresh={refreshCards}
    onOpenCreateWizard={openCreateWizard}
    onImportArtifact={importArtifact}
    onSelect={selectCard}
  />
{/if}
