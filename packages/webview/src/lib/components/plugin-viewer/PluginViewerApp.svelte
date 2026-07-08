<!--
  Plugin Viewer root shell component.
  @file packages/webview/src/lib/components/plugin-viewer/PluginViewerApp.svelte
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { getVsCodeApi } from '../../vscode';

  interface Scripts {
    build: boolean;
    dev: boolean;
  }
  interface TreeNode {
    name: string;
    relativePath: string;
    kind: 'file' | 'directory';
    children?: TreeNode[];
  }
  interface LoadedPayload {
    stableId: string;
    name: string;
    description: string;
    iconUri: string | null;
    version: string | null;
    scripts: Scripts;
    packageJsonError: string | null;
    tree: TreeNode[];
  }

  type PluginViewerOutboundMessage = {
    protocol: typeof PROTOCOL;
    version: typeof VERSION;
    type: string;
    payload: unknown;
  };

  type PluginViewerVsCodeApi = {
    postMessage(message: PluginViewerOutboundMessage): void;
  };

  const PROTOCOL = 'risu-workbench.plugin-viewer';
  const VERSION = 1;

  let loaded: LoadedPayload | null = null;

  /**
   * getTypedVsCodeApi 함수.
   * Plugin viewer outbound message 전송용 VS Code API wrapper를 반환함.
   *
   * @returns VS Code webview API 또는 브라우저 preview의 undefined
   */
  function getTypedVsCodeApi(): PluginViewerVsCodeApi | undefined {
    return getVsCodeApi() as unknown as PluginViewerVsCodeApi | undefined;
  }

  function post(type: string, payload: unknown = {}): void {
    getTypedVsCodeApi()?.postMessage({ protocol: PROTOCOL, version: VERSION, type, payload });
  }

  function isLoadedMessage(message: unknown): message is { payload: LoadedPayload } {
    if (typeof message !== 'object' || message === null) return false;
    const record = message as Record<string, unknown>;
    return record.protocol === PROTOCOL && record.version === VERSION && record.type === 'plugin-viewer/loaded';
  }

  function handleMessage(event: MessageEvent<unknown>): void {
    if (isLoadedMessage(event.data)) {
      loaded = event.data.payload;
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    post('plugin-viewer/ready');
    return () => window.removeEventListener('message', handleMessage);
  });
</script>

<main class="plugin-viewer">
  {#if loaded}
    <header class="plugin-viewer__header">
      {#if loaded.iconUri}
        <img class="plugin-viewer__icon" src={loaded.iconUri} alt="" />
      {/if}
      <div class="plugin-viewer__heading">
        <h1>{loaded.name}</h1>
        {#if loaded.version}<span class="plugin-viewer__version">v{loaded.version}</span>{/if}
        <p class="plugin-viewer__description">{loaded.description}</p>
      </div>
    </header>
    <div class="plugin-viewer__actions">
      <button
        type="button"
        class="plugin-viewer__run"
        disabled={!loaded.scripts.build}
        on:click={() => post('plugin-viewer/runScript', { script: 'build' })}
      >
        Build
      </button>
      <button
        type="button"
        class="plugin-viewer__run"
        disabled={!loaded.scripts.dev}
        on:click={() => post('plugin-viewer/runScript', { script: 'dev' })}
      >
        Dev
      </button>
    </div>
    {#if loaded.packageJsonError}
      <p class="plugin-viewer__error">{loaded.packageJsonError} — Build/Dev disabled.</p>
    {/if}
    <button type="button" class="plugin-viewer__refresh" on:click={() => post('plugin-viewer/refresh')}>
      Refresh
    </button>
    <section class="plugin-viewer__files" aria-label="Plugin files">
      {@render treeNodes(loaded.tree)}
    </section>
  {:else}
    <p>Loading plugin…</p>
  {/if}
</main>

{#snippet treeNodes(nodes: TreeNode[])}
  <ul class="plugin-viewer__tree">
    {#each nodes as node (node.relativePath)}
      <li>
        {#if node.kind === 'directory'}
          <span class="plugin-viewer__dir">📁 {node.name}</span>
          {#if node.children}{@render treeNodes(node.children)}{/if}
        {:else}
          <button
            type="button"
            class="plugin-viewer__file"
            on:click={() => post('plugin-viewer/openFile', { relativePath: node.relativePath })}
          >
            📄 {node.name}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  .plugin-viewer {
    padding: var(--space-3, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }
  .plugin-viewer__header {
    display: flex;
    gap: var(--space-3, 12px);
    align-items: center;
  }
  .plugin-viewer__icon {
    width: 48px;
    height: 48px;
    object-fit: contain;
    border-radius: var(--radius-sm, 6px);
  }
</style>
