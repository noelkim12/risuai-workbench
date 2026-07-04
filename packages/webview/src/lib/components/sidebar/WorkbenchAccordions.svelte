<script lang="ts">
  import type {
    ArtifactBrowserCreateSectionEntryKind,
    ArtifactBrowserCreateSectionKind,
    BrowserItem,
    BrowserSection,
    BrowserTreeNode,
  } from '../../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import WorkbenchCharacterTree from './WorkbenchCharacterTree.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import WorkbenchFlatItemList from './WorkbenchFlatItemList.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import WorkbenchLorebookTree from './WorkbenchLorebookTree.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import WorkbenchReadOnlyTree from './WorkbenchReadOnlyTree.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import WorkbenchRegexItemList from './WorkbenchRegexItemList.svelte';

  export let sections: BrowserSection[];
  export let expandedSectionIds: string[];
  export let onToggleSection: (sectionId: string) => void;
  export let onOpenItem: (item: BrowserItem) => void;
  export let onOpenAssetManager: () => void;
  export let onMoveLorebookItem: (
    item: BrowserItem,
    targetFolderPath: string | null,
    placement?: 'inside' | 'before' | 'after',
    targetItemId?: string,
  ) => void;
  export let onMoveLorebookFolder: (
    folderPath: string,
    targetFolderPath: string,
    placement: 'before' | 'after',
  ) => void;
  export let onMoveRegexItem: (
    item: BrowserItem,
    targetItemId: string,
    placement: 'before' | 'after',
  ) => void;
  export let onMoveGreetingItem: (
    item: BrowserItem,
    targetItemId: string,
    placement: 'before' | 'after',
  ) => void;
  export let onCreateSectionEntry: (
    sectionKind: ArtifactBrowserCreateSectionKind,
    entryKind: ArtifactBrowserCreateSectionEntryKind,
    targetFolderPath?: string,
  ) => void;

  interface CreateAction {
    sectionKind: ArtifactBrowserCreateSectionKind;
    entryKind: ArtifactBrowserCreateSectionEntryKind;
    ariaLabel: string;
  }

  let expandedTreeNodeIds: string[] = [];
  let treeFolderFingerprint = '';

  $: syncTreeExpansion(sections);

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function toggleTreeNode(nodeId: string): void {
    expandedTreeNodeIds = expandedTreeNodeIds.includes(nodeId)
      ? expandedTreeNodeIds.filter((id) => id !== nodeId)
      : [...expandedTreeNodeIds, nodeId];
  }

  function syncTreeExpansion(currentSections: BrowserSection[]): void {
    const folderIds = currentSections.flatMap((section) => collectTreeFolderIds(section.tree ?? []));
    const nextFingerprint = folderIds.join('\n');
    if (nextFingerprint === treeFolderFingerprint) return;

    const knownCurrent = expandedTreeNodeIds.filter((id) => folderIds.includes(id));
    expandedTreeNodeIds = knownCurrent.length > 0 ? knownCurrent : folderIds;
    treeFolderFingerprint = nextFingerprint;
  }

  function collectTreeFolderIds(nodes: BrowserTreeNode[]): string[] {
    return nodes.flatMap((node) =>
      node.kind === 'folder' ? [node.id, ...collectTreeFolderIds(node.children ?? [])] : [],
    );
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this helper.
  function getCreateActions(section: BrowserSection): CreateAction[] {
    if (section.kind === 'lorebooks') {
      return [
        createAction(section.kind, 'folder', 'Create lorebook folder'),
        createAction(section.kind, 'file', 'Create risulorebook file'),
      ];
    }

    if (section.kind === 'regexRules') {
      return [createAction(section.kind, 'file', 'Create risuregex file')];
    }

    if (section.kind === 'lua') {
      return [
        createAction(section.kind, 'folder', 'Create Lua folder'),
        createAction(section.kind, 'file', 'Create risulua file'),
      ];
    }

    return [];
  }

  function createAction(
    sectionKind: ArtifactBrowserCreateSectionKind,
    entryKind: ArtifactBrowserCreateSectionEntryKind,
    ariaLabel: string,
  ): CreateAction {
    return {
      sectionKind,
      entryKind,
      ariaLabel,
    };
  }
</script>

<section class="accordion" aria-label="Workbench detail sections">
  {#each sections as section (section.id)}
    {@const expanded = expandedSectionIds.includes(section.id)}
    {@const createActions = getCreateActions(section)}
    <article class="accordion__section">
      <div class="accordion__header-row" class:accordion__header-row--expanded={expanded}>
        <button
          type="button"
          class="accordion__header"
          aria-expanded={expanded}
          aria-controls={`section-${section.id}`}
          onclick={() => onToggleSection(section.id)}
        >
          <span>{section.label}</span>
          <span class="accordion__count">{section.count}</span>
        </button>

        {#if expanded && createActions.length > 0}
          <div class="accordion__actions" role="toolbar" aria-label={`${section.label} actions`}>
            {#each createActions as action}
              <button
                type="button"
                class={`accordion__action-button accordion__action-button--${action.entryKind}`}
                title={action.ariaLabel}
                aria-label={action.ariaLabel}
                onclick={() => onCreateSectionEntry(action.sectionKind, action.entryKind)}
              >
                {#if action.entryKind === 'folder'}
                  <svg class="accordion__action-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M1.75 4.75h4.5l1.25 1.5h6.75v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" />
                    <path d="M1.75 4.75v-1a1 1 0 0 1 1-1h3l1.25 1.5" />
                    <path class="accordion__action-plus" d="M8 8.15v3.7M6.15 10h3.7" />
                  </svg>
                {:else}
                  <svg class="accordion__action-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M4.25 1.75h5.5l3 3v9.5h-8.5z" />
                    <path d="M9.75 1.75v3h3" />
                    <path class="accordion__action-plus" d="M8.5 7.35v4.3M6.35 9.5h4.3" />
                  </svg>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if expanded}
        <div id={`section-${section.id}`} class="accordion__panel">
          {#if section.kind === 'lua' && section.tree?.length}
            <div class="tree-root-surface" role="tree" aria-label="Lua tree" tabindex="-1">
              <WorkbenchReadOnlyTree
                nodes={section.tree}
                label="Lua tree"
                {expandedTreeNodeIds}
                onToggleTreeNode={toggleTreeNode}
                {onOpenItem}
                onCreateFile={(targetFolderPath) => onCreateSectionEntry('lua', 'file', targetFolderPath)}
              />
            </div>
          {:else if section.kind === 'lorebooks' && section.tree?.length}
            <WorkbenchLorebookTree
              nodes={section.tree}
              {expandedTreeNodeIds}
              onToggleTreeNode={toggleTreeNode}
              {onOpenItem}
              {onMoveLorebookItem}
              {onMoveLorebookFolder}
              onCreateLorebookFile={(targetFolderPath) => onCreateSectionEntry('lorebooks', 'file', targetFolderPath)}
            />
          {:else if section.kind === 'character' && section.tree?.length}
            <div class="tree-root-surface" role="tree" aria-label="Character tree" tabindex="-1">
              <WorkbenchCharacterTree
                nodes={section.tree}
                {expandedTreeNodeIds}
                onToggleTreeNode={toggleTreeNode}
                {onOpenItem}
                onCreateGreeting={(targetFolderPath) => onCreateSectionEntry('character', 'file', targetFolderPath)}
                {onMoveGreetingItem}
              />
            </div>
          {:else if section.kind === 'assets'}
            <div class="assets-entry">
              <p class="assets-entry__summary">{section.count} asset files</p>
              <button type="button" class="assets-entry__open" onclick={() => onOpenAssetManager()}>
                Open Asset Manager ↗
              </button>
            </div>
          {:else if section.items.length === 0}
            <p class="accordion__empty">No related items found.</p>
          {:else if section.kind === 'regexRules'}
            <WorkbenchRegexItemList items={section.items} {onOpenItem} {onMoveRegexItem} />
          {:else}
            <WorkbenchFlatItemList items={section.items} {onOpenItem} />
          {/if}
        </div>
      {/if}
    </article>
  {/each}
</section>

<style>
  .assets-entry {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
  }

  .assets-entry__summary {
    margin: 0;
    color: var(--secondary-text);
    font-size: var(--text-sm);
  }

  .assets-entry__open {
    align-self: flex-start;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }
</style>
