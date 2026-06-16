<script lang="ts">
  import type { BrowserItem, BrowserTreeNode } from '../../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import WorkbenchItemButton from './WorkbenchItemButton.svelte';

  export let nodes: BrowserTreeNode[];
  export let depth = 0;
  export let label: string;
  export let expandedTreeNodeIds: string[];
  export let onToggleTreeNode: (nodeId: string) => void;
  export let onOpenItem: (item: BrowserItem) => void;
  export let onCreateFile: ((targetFolderPath: string) => void) | undefined = undefined;

  let activeHelpNodeId: string | undefined;

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function createFileInFolder(event: MouseEvent | KeyboardEvent, folderPath: string): void {
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onCreateFile?.(folderPath);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this helper.
  function countTreeItems(currentNodes: BrowserTreeNode[]): number {
    return currentNodes.reduce(
      (count, node) => count + (node.kind === 'item' ? 1 : countTreeItems(node.children ?? [])),
      0,
    );
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function showTreeHelp(event: MouseEvent | FocusEvent, nodeId: string): void {
    event.stopPropagation();
    activeHelpNodeId = nodeId;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function hideTreeHelp(nodeId: string): void {
    if (activeHelpNodeId === nodeId) activeHelpNodeId = undefined;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function toggleTreeHelp(event: MouseEvent, nodeId: string): void {
    event.preventDefault();
    event.stopPropagation();
    activeHelpNodeId = activeHelpNodeId === nodeId ? undefined : nodeId;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function keydownTreeHelp(event: KeyboardEvent, nodeId: string): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    activeHelpNodeId = activeHelpNodeId === nodeId ? undefined : nodeId;
  }
</script>

{#snippet readOnlyTree(currentNodes: BrowserTreeNode[], currentDepth: number)}
  <ul
    class="tree-list"
    class:tree-list--nested={currentDepth > 0}
    aria-label={currentDepth === 0 ? label : undefined}
  >
  {#each currentNodes as node (node.id)}
    <li class="tree-list__item" style={`--tree-depth: ${currentDepth}`}>
      {#if node.kind === 'folder'}
        {@const children = node.children ?? []}
        {@const expanded = expandedTreeNodeIds.includes(node.id)}
        {@const itemCount = countTreeItems(children)}
        <button
          type="button"
          class="tree-folder"
          aria-expanded={expanded}
          title={node.relativePath ?? node.label}
          onclick={() => onToggleTreeNode(node.id)}
        >
          <span class="tree-folder__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          <span class="tree-folder__label">{node.label}</span>
          <span class="tree-folder__count">{itemCount}</span>
          {#if onCreateFile && node.treePath}
            <span
              class="tree-folder__action"
              role="button"
              tabindex="0"
              title={`Create risulua in ${node.label}`}
              aria-label={`Create risulua in ${node.label}`}
              onclick={(event) => createFileInFolder(event, node.treePath ?? '')}
              onkeydown={(event) => createFileInFolder(event, node.treePath ?? '')}
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
                onmouseenter={(event) => showTreeHelp(event, node.id)}
                onfocus={(event) => showTreeHelp(event, node.id)}
                onmouseleave={() => hideTreeHelp(node.id)}
                onblur={() => hideTreeHelp(node.id)}
                onclick={(event) => toggleTreeHelp(event, node.id)}
                onkeydown={(event) => keydownTreeHelp(event, node.id)}
              >ⓘ</span>
              {#if activeHelpNodeId === node.id}
                <span id={`tree-help-${node.id}`} class="tree-help__detail" role="tooltip">
                  {node.detailDescription}
                </span>
              {/if}
            </span>
          {/if}
        </button>
          {#if expanded && children.length > 0}
            {@render readOnlyTree(children, currentDepth + 1)}
          {/if}
      {:else if node.item}
        <div class="tree-item" role="treeitem" aria-selected="false" tabindex="-1">
          <WorkbenchItemButton item={node.item} {onOpenItem} />
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
                    onmouseenter={(event) => showTreeHelp(event, node.id)}
                    onfocus={(event) => showTreeHelp(event, node.id)}
                    onmouseleave={() => hideTreeHelp(node.id)}
                    onblur={() => hideTreeHelp(node.id)}
                    onclick={(event) => toggleTreeHelp(event, node.id)}
                    onkeydown={(event) => keydownTreeHelp(event, node.id)}
                  >ⓘ</span>
                  {#if activeHelpNodeId === node.id}
                    <span id={`tree-help-${node.id}`} class="tree-help__detail" role="tooltip">
                      {node.detailDescription}
                    </span>
                  {/if}
                </span>
              {/if}
            </span>
          {/if}
        </div>
      {/if}
    </li>
    {/each}
  </ul>
{/snippet}

{@render readOnlyTree(nodes, depth)}

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

  .tree-folder > .tree-help .tree-help__detail {
    left: auto;
    right: 0;
  }
</style>
