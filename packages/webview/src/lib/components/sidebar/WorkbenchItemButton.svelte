<script lang="ts">
  import type { BrowserItem } from '../../types';

  export let item: BrowserItem;
  export let onOpenItem: (item: BrowserItem) => void;

  $: typeLabel = item.type === 'risulorebook' ? 'lorebook' : item.type === 'risuregex' ? 'regex' : item.type === 'risulua' ? 'lua' : item.type;
</script>

<button
  type="button"
  class="item-button"
  class:item-button--static={!item.fileUri}
  disabled={!item.fileUri}
  title={item.relativePath ?? item.label}
  onclick={() => onOpenItem(item)}
>
  <span class={`item-button__type item-button__type--${item.type}`}>{typeLabel}</span>
  <span class="item-button__copy">
    <span class="item-button__label">{item.label}</span>
    {#if item.description}
      <span class="item-button__description">{item.description}</span>
    {/if}
  </span>
</button>
