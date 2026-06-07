<script lang="ts">
  import type { BrowserItem, BrowserSection, BrowserTreeNode } from '../../types';

  export let sections: BrowserSection[];
  export let expandedSectionIds: string[];
  export let onToggleSection: (sectionId: string) => void;
  export let onOpenItem: (item: BrowserItem) => void;

  let expandedTreeNodeIds: string[] = [];
  let treeFolderFingerprint = '';

  $: syncTreeExpansion(sections);

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

  function countTreeItems(nodes: BrowserTreeNode[]): number {
    return nodes.reduce(
      (count, node) => count + (node.kind === 'item' ? 1 : countTreeItems(node.children ?? [])),
      0,
    );
  }
</script>

{#snippet itemButton(item: BrowserItem)}
  <button
    type="button"
    class="item-button"
    class:item-button--static={!item.fileUri}
    disabled={!item.fileUri}
    title={item.relativePath ?? item.label}
    onclick={() => onOpenItem(item)}
  >
    <span class={`item-button__type item-button__type--${item.type}`}>{item.type}</span>
    <span class="item-button__copy">
      <span class="item-button__label">{item.label}</span>
      {#if item.relativePath}
        <span class="item-button__path">{item.relativePath}</span>
      {/if}
      {#if item.description}
        <span class="item-button__description">{item.description}</span>
      {/if}
    </span>
  </button>
{/snippet}

{#snippet flatItemList(items: BrowserItem[])}
  <ul class="item-list">
    {#each items as item (item.id)}
      <li>
        {@render itemButton(item)}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet lorebookTree(nodes: BrowserTreeNode[], depth: number)}
  <ul class="tree-list" class:tree-list--nested={depth > 0}>
    {#each nodes as node (node.id)}
      <li class="tree-list__item" style={`--tree-depth: ${depth}`}>
        {#if node.kind === 'folder'}
          {@const children = node.children ?? []}
          {@const expanded = expandedTreeNodeIds.includes(node.id)}
          {@const itemCount = countTreeItems(children)}
          <button
            type="button"
            class="tree-folder"
            aria-expanded={expanded}
            title={node.relativePath ?? node.label}
            onclick={() => toggleTreeNode(node.id)}
          >
            <span class="tree-folder__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
            <span class="tree-folder__label">{node.label}</span>
            <span class="tree-folder__count">{itemCount}</span>
          </button>
          {#if expanded && children.length > 0}
            {@render lorebookTree(children, depth + 1)}
          {/if}
        {:else if node.item}
          <div class="tree-item">
            {@render itemButton(node.item)}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<section class="accordion" aria-label="Workbench detail sections">
  {#each sections as section (section.id)}
    {@const expanded = expandedSectionIds.includes(section.id)}
    <article class="accordion__section" class:accordion__section--direct={section.kind === 'lua'}>
      {#if section.kind === 'lua'}
        <div class="accordion__direct-heading" aria-label={`${section.label} section`}>
          <span>{section.label}</span>
          <span class="accordion__count">{section.count}</span>
        </div>
        <div id={`section-${section.id}`} class="accordion__panel">
          {#if section.items.length === 0}
            <p class="accordion__empty">No related items found.</p>
          {:else}
            {@render flatItemList(section.items)}
          {/if}
        </div>
      {:else}
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
            {:else if section.kind === 'lorebooks' && section.tree?.length}
              {@render lorebookTree(section.tree, 0)}
            {:else}
              {@render flatItemList(section.items)}
            {/if}
          </div>
        {/if}
      {/if}
    </article>
  {/each}
</section>
