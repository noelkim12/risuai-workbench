<!--
  Workspace symbol search surface for the Main Editor.
  @file packages/webview/src/lib/components/editor/lsp/WorkspaceSymbolSearch.svelte
-->

<script lang="ts">
  import type { MainEditorWorkspaceSymbolPayload } from '../../../types/mainEditor';

  interface Props {
    symbols: MainEditorWorkspaceSymbolPayload[];
    query: string;
    pending: boolean;
    onQueryChange: (query: string) => void;
    onReveal: (symbol: MainEditorWorkspaceSymbolPayload) => void;
  }

  let { symbols, query, pending, onQueryChange, onReveal }: Props = $props();
</script>

<section class="workspace-symbol-search" aria-label="Workspace symbol search">
  <label>
    Workspace symbols
    <input
      value={query}
      placeholder="Search variables, functions, entries"
      oninput={(event) => onQueryChange(event.currentTarget.value)}
    />
  </label>
  {#if pending}
    <p class="workspace-symbol-search__status">Searching...</p>
  {/if}
  <ul>
    {#each symbols as symbol}
      <li>
        <button type="button" onclick={() => onReveal(symbol)}>
          <span>{symbol.name}</span>
          <small>{symbol.containerName ?? symbol.location.uri}</small>
        </button>
      </li>
    {/each}
  </ul>
</section>
