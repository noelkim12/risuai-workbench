<script lang="ts">
  import type { BrowserItem } from '../../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import WorkbenchItemButton from './WorkbenchItemButton.svelte';

  export let items: BrowserItem[];
  export let onOpenItem: (item: BrowserItem) => void;
</script>

<ul class="item-list">
  {#each items as item (item.id)}
    <li>
      <WorkbenchItemButton {item} {onOpenItem} />
    </li>
  {/each}
</ul>
