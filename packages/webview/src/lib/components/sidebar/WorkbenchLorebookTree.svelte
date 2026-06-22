<script lang="ts">
  import type { BrowserItem, BrowserTreeNode } from '../../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import WorkbenchItemButton from './WorkbenchItemButton.svelte';

  export let nodes: BrowserTreeNode[];
  export let expandedTreeNodeIds: string[];
  export let onToggleTreeNode: (nodeId: string) => void;
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
  export let onCreateLorebookFile: (targetFolderPath: string) => void;

  let draggedLorebookItem: BrowserItem | undefined;
  let draggedLorebookFolderPath: string | undefined;
  let activeDropZoneId: string | undefined;
  let activeItemDropPlacement: 'before' | 'after' | undefined;
  let activeFolderDropPlacement: 'before' | 'after' | undefined;

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this helper.
  function countTreeItems(currentNodes: BrowserTreeNode[]): number {
    return currentNodes.reduce(
      (count, node) => count + (node.kind === 'item' ? 1 : countTreeItems(node.children ?? [])),
      0,
    );
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function createLorebookFileInFolder(event: MouseEvent | KeyboardEvent, folderPath: string): void {
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onCreateLorebookFile(folderPath);
  }

  function clearDraggedLorebookItem(): void {
    draggedLorebookItem = undefined;
    draggedLorebookFolderPath = undefined;
    activeDropZoneId = undefined;
    activeItemDropPlacement = undefined;
    activeFolderDropPlacement = undefined;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dragLorebookItem(event: DragEvent, item: BrowserItem): void {
    if (item.type !== 'risulorebook') return;
    draggedLorebookItem = item;
    event.dataTransfer?.setData('text/plain', item.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function allowLorebookDrop(event: DragEvent): void {
    if (!draggedLorebookItem && !draggedLorebookFolderPath) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function leaveDropZone(dropZoneId: string): void {
    if (activeDropZoneId !== dropZoneId) return;
    activeDropZoneId = undefined;
    activeItemDropPlacement = undefined;
    activeFolderDropPlacement = undefined;
  }

  function resolveItemDropPlacement(event: DragEvent): 'before' | 'after' {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return 'after';
    const rect = target.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  function dropLorebookItem(
    event: DragEvent,
    targetFolderPath: string | null,
    placement: 'inside' | 'before' | 'after' = 'inside',
    targetItemId?: string,
  ): void {
    if (!draggedLorebookItem) return;
    event.preventDefault();
    event.stopPropagation();
    if (targetItemId && draggedLorebookItem.id === targetItemId) {
      clearDraggedLorebookItem();
      return;
    }
    onMoveLorebookItem(draggedLorebookItem, targetFolderPath, placement, targetItemId);
    clearDraggedLorebookItem();
  }

  function enterDropZone(event: DragEvent, dropZoneId: string): void {
    allowLorebookDrop(event);
    if (draggedLorebookItem) activeDropZoneId = dropZoneId;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dragOverLorebookItem(event: DragEvent, itemId: string): void {
    allowLorebookDrop(event);
    if (!draggedLorebookItem || draggedLorebookItem.id === itemId) return;
    activeDropZoneId = `item:${itemId}`;
    activeItemDropPlacement = resolveItemDropPlacement(event);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dropOnLorebookItem(event: DragEvent, targetItem: BrowserItem, targetFolderPath: string | null): void {
    const placement = activeItemDropPlacement ?? resolveItemDropPlacement(event);
    dropLorebookItem(event, targetFolderPath, placement, targetItem.id);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dragLorebookFolder(event: DragEvent, folderPath: string | undefined): void {
    if (!folderPath) return;
    draggedLorebookFolderPath = folderPath;
    event.dataTransfer?.setData('text/plain', folderPath);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dragOverLorebookFolder(event: DragEvent, targetFolderPath: string | undefined): void {
    allowLorebookDrop(event);
    if (!targetFolderPath) return;

    if (draggedLorebookFolderPath) {
      if (draggedLorebookFolderPath === targetFolderPath) return;
      activeDropZoneId = `folder:${targetFolderPath}`;
      activeFolderDropPlacement = resolveItemDropPlacement(event);
      return;
    }

    if (draggedLorebookItem) {
      activeDropZoneId = `folder:${targetFolderPath}`;
    }
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dropOnLorebookFolder(event: DragEvent, targetFolderPath: string | undefined): void {
    if (!targetFolderPath) return;
    if (draggedLorebookFolderPath) {
      event.preventDefault();
      event.stopPropagation();
      const placement = activeFolderDropPlacement ?? resolveItemDropPlacement(event);
      onMoveLorebookFolder(draggedLorebookFolderPath, targetFolderPath, placement);
      clearDraggedLorebookItem();
      return;
    }

    dropLorebookItem(event, targetFolderPath);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dragOverLorebookRoot(event: DragEvent): void {
    if (!draggedLorebookItem) return;
    enterDropZone(event, 'root');
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dropOnLorebookRoot(event: DragEvent): void {
    if (!draggedLorebookItem) return;
    dropLorebookItem(event, null);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this helper.
  function getLorebookParentPath(node: BrowserTreeNode): string | null {
    const lorebookPath = node.lorebookPath;
    if (!lorebookPath || !lorebookPath.includes('/')) return null;
    return lorebookPath.split('/').slice(0, -1).join('/');
  }
</script>

{#snippet lorebookTree(currentNodes: BrowserTreeNode[], depth: number)}
  <ul class="tree-list" class:tree-list--nested={depth > 0}>
    {#each currentNodes as node (node.id)}
      <li class="tree-list__item" style={`--tree-depth: ${depth}`}>
        {#if node.kind === 'folder'}
          {@const children = node.children ?? []}
          {@const expanded = expandedTreeNodeIds.includes(node.id)}
          {@const itemCount = countTreeItems(children)}
          <button
            type="button"
            class="tree-folder"
            class:tree-folder--drop-active={activeDropZoneId === `folder:${node.lorebookPath ?? ''}`}
            class:tree-folder--drop-before={activeDropZoneId === `folder:${node.lorebookPath ?? ''}` && activeFolderDropPlacement === 'before'}
            class:tree-folder--drop-after={activeDropZoneId === `folder:${node.lorebookPath ?? ''}` && activeFolderDropPlacement === 'after'}
            aria-expanded={expanded}
            title={node.relativePath ?? node.label}
            draggable={Boolean(node.lorebookPath)}
            ondragstart={(event) => dragLorebookFolder(event, node.lorebookPath)}
            ondragend={clearDraggedLorebookItem}
            ondragover={(event) => dragOverLorebookFolder(event, node.lorebookPath)}
            ondragenter={(event) => dragOverLorebookFolder(event, node.lorebookPath)}
            ondragleave={() => leaveDropZone(`folder:${node.lorebookPath ?? ''}`)}
            ondrop={(event) => dropOnLorebookFolder(event, node.lorebookPath)}
            onclick={() => onToggleTreeNode(node.id)}
          >
            <span class="tree-folder__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
            <span class="tree-folder__label">{node.label}</span>
            <span class="tree-folder__count">{itemCount}</span>
            {#if node.lorebookPath}
              <span
                class="tree-folder__action"
                role="button"
                tabindex="0"
                title={`Create risulorebook in ${node.label}`}
                aria-label={`Create risulorebook in ${node.label}`}
                onclick={(event) => createLorebookFileInFolder(event, node.lorebookPath ?? '')}
                onkeydown={(event) => createLorebookFileInFolder(event, node.lorebookPath ?? '')}
              >
                <svg class="accordion__action-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path d="M4.25 1.75h5.5l3 3v9.5h-8.5z" />
                  <path d="M9.75 1.75v3h3" />
                  <path class="accordion__action-plus" d="M8.5 7.35v4.3M6.35 9.5h4.3" />
                </svg>
              </span>
            {/if}
          </button>
          {#if expanded && children.length > 0}
            {@render lorebookTree(children, depth + 1)}
          {/if}
        {:else if node.item}
          {@const item = node.item}
          {@const parentPath = getLorebookParentPath(node)}
          <div
            class="tree-item"
            class:tree-item--drop-before={activeDropZoneId === `item:${item.id}` && activeItemDropPlacement === 'before'}
            class:tree-item--drop-after={activeDropZoneId === `item:${item.id}` && activeItemDropPlacement === 'after'}
            role="treeitem"
            aria-selected="false"
            tabindex="-1"
            draggable={item.type === 'risulorebook'}
            ondragstart={(event) => dragLorebookItem(event, item)}
            ondragend={clearDraggedLorebookItem}
            ondragover={(event) => dragOverLorebookItem(event, item.id)}
            ondragenter={(event) => dragOverLorebookItem(event, item.id)}
            ondragleave={() => leaveDropZone(`item:${item.id}`)}
            ondrop={(event) => dropOnLorebookItem(event, item, parentPath)}
          >
            <WorkbenchItemButton {item} {onOpenItem} />
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div
  class="tree-root-surface tree-root-surface--compact-folders"
  role="tree"
  aria-label="Lorebook tree"
  tabindex="-1"
  class:tree-root-surface--drop-active={activeDropZoneId === 'root'}
  ondragover={dragOverLorebookRoot}
  ondragenter={dragOverLorebookRoot}
  ondragleave={() => leaveDropZone('root')}
  ondrop={dropOnLorebookRoot}
>
  {@render lorebookTree(nodes, 0)}
</div>
