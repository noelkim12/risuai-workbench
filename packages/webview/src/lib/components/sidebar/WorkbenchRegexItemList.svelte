<script lang="ts">
  import type { BrowserItem } from '../../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import WorkbenchItemButton from './WorkbenchItemButton.svelte';

  export let items: BrowserItem[];
  export let onOpenItem: (item: BrowserItem) => void;
  export let onMoveRegexItem: (item: BrowserItem, targetItemId: string, placement: 'before' | 'after') => void;

  let draggedRegexItem: BrowserItem | undefined;
  let activeDropZoneId: string | undefined;
  let activeItemDropPlacement: 'before' | 'after' | undefined;

  function clearDraggedRegexItem(): void {
    draggedRegexItem = undefined;
    activeDropZoneId = undefined;
    activeItemDropPlacement = undefined;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dragRegexItem(event: DragEvent, item: BrowserItem): void {
    if (item.type !== 'risuregex' && item.type !== 'regex') return;
    draggedRegexItem = item;
    event.dataTransfer?.setData('text/plain', item.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function allowRegexDrop(event: DragEvent): void {
    if (!draggedRegexItem) return;
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
  function dragOverRegexItem(event: DragEvent, itemId: string): void {
    allowRegexDrop(event);
    if (!draggedRegexItem || draggedRegexItem.id === itemId) return;
    activeDropZoneId = `regex:${itemId}`;
    activeItemDropPlacement = resolveItemDropPlacement(event);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function dropOnRegexItem(event: DragEvent, targetItem: BrowserItem): void {
    if (!draggedRegexItem || draggedRegexItem.id === targetItem.id) return;
    event.preventDefault();
    event.stopPropagation();
    const placement = activeItemDropPlacement ?? resolveItemDropPlacement(event);
    onMoveRegexItem(draggedRegexItem, targetItem.id, placement);
    clearDraggedRegexItem();
  }
</script>

<ul class="item-list">
  {#each items as item (item.id)}
    <li>
      <div
        class="tree-item"
        class:tree-item--drop-before={activeDropZoneId === `regex:${item.id}` && activeItemDropPlacement === 'before'}
        class:tree-item--drop-after={activeDropZoneId === `regex:${item.id}` && activeItemDropPlacement === 'after'}
        role="treeitem"
        aria-selected="false"
        tabindex="-1"
        draggable={item.type === 'risuregex' || item.type === 'regex'}
        ondragstart={(event) => dragRegexItem(event, item)}
        ondragend={clearDraggedRegexItem}
        ondragover={(event) => dragOverRegexItem(event, item.id)}
        ondragenter={(event) => dragOverRegexItem(event, item.id)}
        ondragleave={() => leaveDropZone(`regex:${item.id}`)}
        ondrop={(event) => dropOnRegexItem(event, item)}
      >
        <WorkbenchItemButton {item} {onOpenItem} />
      </div>
    </li>
  {/each}
</ul>
