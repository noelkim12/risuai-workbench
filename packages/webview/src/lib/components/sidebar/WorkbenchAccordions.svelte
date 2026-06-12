<script lang="ts">
  import type { BrowserItem, BrowserSection, BrowserTreeNode } from '../../types';
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
</script>

<section class="accordion" aria-label="Workbench detail sections">
  {#each sections as section (section.id)}
    {@const expanded = expandedSectionIds.includes(section.id)}
    <article class="accordion__section">
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

      {#if expanded}
        <div id={`section-${section.id}`} class="accordion__panel">
          {#if section.items.length === 0}
            <p class="accordion__empty">No related items found.</p>
          {:else if section.kind === 'lua' && section.tree?.length}
            <div class="tree-root-surface" role="tree" aria-label="Lua tree" tabindex="-1">
              <WorkbenchReadOnlyTree
                nodes={section.tree}
                label="Lua tree"
                {expandedTreeNodeIds}
                onToggleTreeNode={toggleTreeNode}
                {onOpenItem}
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
            />
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
