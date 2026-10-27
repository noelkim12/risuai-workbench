<script lang="ts">
  import { onMount } from 'svelte';

  export let x: number;
  export let y: number;
  export let disabled = false;
  export let onDelete: () => void;
  export let onClose: () => void;

  let menu: HTMLDivElement;
  let deleteButton: HTMLButtonElement;

  onMount(() => {
    menu.showPopover();
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - rect.width))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - rect.height))}px`;
    deleteButton.focus();
  });
</script>

<div bind:this={menu} class="asset-context-menu" popover="auto" role="menu" aria-label="Asset actions"
  ontoggle={(event) => { if (event.newState === 'closed') onClose(); }}>
  <button bind:this={deleteButton} type="button" class="button-secondary" role="menuitem"
    {disabled} onclick={onDelete}>삭제</button>
</div>

<style>
  .asset-context-menu {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: var(--space-1);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
    color: var(--text);
  }
  button {
    width: 100%;
    text-align: left;
  }
</style>
