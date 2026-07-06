<script lang="ts">
  import type { BrowserItem, BrowserTreeNode } from '../../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import WorkbenchItemButton from './WorkbenchItemButton.svelte';

  export let nodes: BrowserTreeNode[];
  export let expandedTreeNodeIds: string[];
  export let onToggleTreeNode: (nodeId: string) => void;
  export let onOpenItem: (item: BrowserItem) => void;
  export let onCreateGreeting: (targetFolderPath: string) => void;
  export let onMoveGreetingItem: (item: BrowserItem, targetItemId: string, placement: 'before' | 'after') => void;

  let draggedGreetingItem: BrowserItem | undefined;
  let activeDropZoneId: string | undefined;
  let activeItemDropPlacement: 'before' | 'after' | undefined;

  let activeHelpNodeId: string | undefined;
  let activeHelpTooltip:
    | {
        nodeId: string;
        description: string;
        top: number;
        left: number;
        maxInlineSize: number;
        placement: 'above' | 'below';
      }
    | undefined;

  function openTreeHelp(target: EventTarget | null, nodeId: string, description: string): void {
    if (!(target instanceof HTMLElement)) return;

    const rect = target.getBoundingClientRect();
    const gap = 6;
    const edgePadding = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxInlineSize = Math.max(160, viewportWidth - edgePadding * 2);
    const preferredWidth = Math.min(288, maxInlineSize);
    const left = Math.min(
      Math.max(edgePadding, rect.left),
      Math.max(edgePadding, viewportWidth - preferredWidth - edgePadding),
    );
    const hasMoreSpaceAbove = rect.top > viewportHeight - rect.bottom;
    const placement = rect.bottom + 120 > viewportHeight && hasMoreSpaceAbove ? 'above' : 'below';

    activeHelpNodeId = nodeId;
    activeHelpTooltip = {
      nodeId,
      description,
      left,
      maxInlineSize,
      placement,
      top: placement === 'above' ? rect.top - gap : rect.bottom + gap,
    };
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function showTreeHelp(event: MouseEvent | FocusEvent, nodeId: string, description: string): void {
    event.stopPropagation();
    openTreeHelp(event.currentTarget, nodeId, description);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function hideTreeHelp(nodeId: string): void {
    if (activeHelpNodeId === nodeId) {
      activeHelpNodeId = undefined;
      activeHelpTooltip = undefined;
    }
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function toggleTreeHelp(event: MouseEvent, nodeId: string, description: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (activeHelpNodeId === nodeId) {
      activeHelpNodeId = undefined;
      activeHelpTooltip = undefined;
      return;
    }
    openTreeHelp(event.currentTarget, nodeId, description);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function keydownTreeHelp(event: KeyboardEvent, nodeId: string, description: string): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    if (activeHelpNodeId === nodeId) {
      activeHelpNodeId = undefined;
      activeHelpTooltip = undefined;
      return;
    }
    openTreeHelp(event.currentTarget, nodeId, description);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this helper.
  function countTreeItems(currentNodes: BrowserTreeNode[]): number {
    return currentNodes.reduce(
      (count, node) => count + (node.kind === 'item' ? 1 : countTreeItems(node.children ?? [])),
      0,
    );
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function createGreetingInFolder(event: MouseEvent | KeyboardEvent, folderPath: string): void {
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onCreateGreeting(folderPath);
  }

  function clearDraggedGreetingItem(): void {
    draggedGreetingItem = undefined;
    activeDropZoneId = undefined;
    activeItemDropPlacement = undefined;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dragGreetingItem(event: DragEvent, item: BrowserItem): void {
    draggedGreetingItem = item;
    event.dataTransfer?.setData('text/plain', item.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function allowGreetingDrop(event: DragEvent): void {
    if (!draggedGreetingItem) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function leaveDropZone(dropZoneId: string): void {
    if (activeDropZoneId !== dropZoneId) return;
    activeDropZoneId = undefined;
    activeItemDropPlacement = undefined;
  }

  function resolveItemDropPlacement(event: DragEvent): 'before' | 'after' {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return 'after';
    const rect = target.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dragOverGreetingItem(event: DragEvent, itemId: string): void {
    allowGreetingDrop(event);
    if (!draggedGreetingItem || draggedGreetingItem.id === itemId) return;
    activeDropZoneId = `greeting:${itemId}`;
    activeItemDropPlacement = resolveItemDropPlacement(event);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dropOnGreetingItem(event: DragEvent, targetItem: BrowserItem): void {
    if (!draggedGreetingItem || draggedGreetingItem.id === targetItem.id) return;
    event.preventDefault();
    event.stopPropagation();
    const placement = activeItemDropPlacement ?? resolveItemDropPlacement(event);
    onMoveGreetingItem(draggedGreetingItem, targetItem.id, placement);
    clearDraggedGreetingItem();
  }
</script>

<ul class="tree-list" aria-label="Character tree">
  {#each nodes as node (node.id)}
    <li class="tree-list__item" style="--tree-depth: 0">
      {#if node.kind === 'item' && node.item}
        {@const fieldItem = node.item}
        <div class="tree-item" role="treeitem" aria-selected="false" tabindex="-1">
          <WorkbenchItemButton item={fieldItem} {onOpenItem} />
          {#if node.description || node.detailDescription}
            <span class="tree-item__meta">
              {#if node.description}<span class="tree-item__caption">{node.description}</span>{/if}
              {#if node.detailDescription}
                <span class="tree-help">
                  <span
                    class="tree-help__icon"
                    role="button"
                    tabindex="0"
                    aria-label={`${node.label} 설명 보기`}
                    aria-describedby={`tree-help-${node.id}`}
                    onmouseenter={(event) => showTreeHelp(event, node.id, node.detailDescription ?? '')}
                    onfocus={(event) => showTreeHelp(event, node.id, node.detailDescription ?? '')}
                    onmouseleave={() => hideTreeHelp(node.id)}
                    onblur={() => hideTreeHelp(node.id)}
                    onclick={(event) => toggleTreeHelp(event, node.id, node.detailDescription ?? '')}
                    onkeydown={(event) => keydownTreeHelp(event, node.id, node.detailDescription ?? '')}
                  >ⓘ</span>
                </span>
              {/if}
            </span>
          {/if}
        </div>
      {:else if node.kind === 'folder'}
        {@const children = node.children ?? []}
        {@const expanded = expandedTreeNodeIds.includes(node.id)}
        {@const itemCount = countTreeItems(children)}
        <button
          type="button"
          class="tree-folder"
          aria-expanded={expanded}
          aria-label={node.relativePath ? `${node.label} (${node.relativePath})` : node.label}
          onclick={() => onToggleTreeNode(node.id)}
        >
          <span class="tree-folder__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          <span class="tree-folder__label">{node.label}</span>
          <span class="tree-folder__count">{itemCount}</span>
          {#if node.treePath}
            <span
              class="tree-folder__action"
              role="button"
              tabindex="0"
              title={`Add greeting in ${node.label}`}
              aria-label={`Add greeting in ${node.label}`}
              onclick={(event) => createGreetingInFolder(event, node.treePath ?? '')}
              onkeydown={(event) => createGreetingInFolder(event, node.treePath ?? '')}
            >
              <svg class="accordion__action-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M4.25 1.75h5.5l3 3v9.5h-8.5z" />
                <path d="M9.75 1.75v3h3" />
                <path class="accordion__action-plus" d="M8.5 7.35v4.3M6.35 9.5h4.3" />
              </svg>
            </span>
          {/if}
          {#if node.description}
            <span class="tree-folder__caption">{node.description}</span>
          {/if}
          {#if node.detailDescription}
            <span class="tree-help">
              <span
                class="tree-help__icon"
                role="button"
                tabindex="0"
                aria-label={`${node.label} 설명 보기`}
                aria-describedby={`tree-help-${node.id}`}
                onmouseenter={(event) => showTreeHelp(event, node.id, node.detailDescription ?? '')}
                onfocus={(event) => showTreeHelp(event, node.id, node.detailDescription ?? '')}
                onmouseleave={() => hideTreeHelp(node.id)}
                onblur={() => hideTreeHelp(node.id)}
                onclick={(event) => toggleTreeHelp(event, node.id, node.detailDescription ?? '')}
                onkeydown={(event) => keydownTreeHelp(event, node.id, node.detailDescription ?? '')}
              >ⓘ</span>
            </span>
          {/if}
        </button>
        {#if expanded && children.length > 0}
          <ul class="tree-list tree-list--nested">
            {#each children as child (child.id)}
              {#if child.item}
                {@const greetingItem = child.item}
                <li class="tree-list__item" style="--tree-depth: 1">
                  <div
                    class="tree-item"
                    class:tree-item--drop-before={activeDropZoneId === `greeting:${greetingItem.id}` && activeItemDropPlacement === 'before'}
                    class:tree-item--drop-after={activeDropZoneId === `greeting:${greetingItem.id}` && activeItemDropPlacement === 'after'}
                    role="treeitem"
                    aria-selected="false"
                    tabindex="-1"
                    draggable={true}
                    ondragstart={(event) => dragGreetingItem(event, greetingItem)}
                    ondragend={clearDraggedGreetingItem}
                    ondragover={(event) => dragOverGreetingItem(event, greetingItem.id)}
                    ondragenter={(event) => dragOverGreetingItem(event, greetingItem.id)}
                    ondragleave={() => leaveDropZone(`greeting:${greetingItem.id}`)}
                    ondrop={(event) => dropOnGreetingItem(event, greetingItem)}
                  >
                    <WorkbenchItemButton item={greetingItem} {onOpenItem} />
                  </div>
                </li>
              {/if}
            {/each}
          </ul>
        {/if}
      {/if}
    </li>
  {/each}
</ul>

{#if activeHelpTooltip}
  <span
    id={`tree-help-${activeHelpTooltip.nodeId}`}
    class="tree-help__detail tree-help__detail--floating"
    class:tree-help__detail--above={activeHelpTooltip.placement === 'above'}
    role="tooltip"
    style={`--tree-help-top: ${activeHelpTooltip.top}px; --tree-help-left: ${activeHelpTooltip.left}px; --tree-help-max-inline-size: ${activeHelpTooltip.maxInlineSize}px;`}
  >
    {activeHelpTooltip.description}
  </span>
{/if}

<style>
  .tree-folder__caption,
  .tree-item__caption {
    color: var(--vscode-descriptionForeground);
    font-size: 0.82em;
    margin-left: 0.5rem;
  }

  .tree-folder__caption {
    margin-left: 0;
  }

  .tree-help {
    display: inline-flex;
    margin-left: 0.35rem;
    position: relative;
  }

  .tree-folder > .tree-help {
    margin-left: 0;
  }

  .tree-help__icon {
    color: var(--vscode-descriptionForeground);
    cursor: help;
    font-size: 0.85em;
  }

  .tree-help__detail {
    background: var(--vscode-editorHoverWidget-background);
    border: 1px solid var(--vscode-editorHoverWidget-border);
    border-radius: 4px;
    color: var(--vscode-editorHoverWidget-foreground);
    left: 0;
    inline-size: min(18rem, calc(100vw - 2rem));
    line-height: 1.35;
    max-width: 18rem;
    min-width: 12rem;
    overflow-wrap: break-word;
    padding: 0.4rem 0.5rem;
    position: absolute;
    text-align: left;
    top: 1.25rem;
    white-space: normal;
    word-break: keep-all;
    z-index: 20;
  }

  .tree-help__detail--floating {
    left: var(--tree-help-left);
    max-height: calc(100vh - 1rem);
    max-inline-size: var(--tree-help-max-inline-size);
    overflow-y: auto;
    position: fixed;
    top: var(--tree-help-top);
    z-index: 1000;
  }

  .tree-help__detail--above {
    transform: translateY(-100%);
  }
</style>
