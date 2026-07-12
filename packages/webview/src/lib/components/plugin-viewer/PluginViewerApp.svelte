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

  /** relativePath 집합. 접힌(collapsed) 디렉터리를 추적함 — 비어있으면 전부 펼침. */
  let collapsed = new Set<string>();

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

  /** toggleDir 함수. 디렉터리 접힘 상태를 뒤집고 재할당으로 반응성을 트리거함. */
  function toggleDir(relativePath: string): void {
    if (collapsed.has(relativePath)) collapsed.delete(relativePath);
    else collapsed.add(relativePath);
    collapsed = collapsed;
  }

  /** initialsOf 함수. 아이콘이 없을 때 쓰는 플러그인 이름 이니셜(최대 2글자)을 만듦. */
  function initialsOf(name: string): string {
    const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** extOf 함수. 파일명 확장자를 소문자로 반환함(없으면 빈 문자열). */
  function extOf(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  }

  /** countFiles 함수. 트리 하위의 파일 노드 수를 재귀적으로 셈. */
  function countFiles(nodes: TreeNode[]): number {
    return nodes.reduce(
      (total, node) =>
        total + (node.kind === 'file' ? 1 : countFiles(node.children ?? [])),
      0,
    );
  }

  // 상태 파생값 — 매니페스트 헤더의 액센트 바 색과 라벨을 결정함.
  $: statusKind = !loaded
    ? 'idle'
    : loaded.packageJsonError
      ? 'invalid'
      : loaded.scripts.build || loaded.scripts.dev
        ? 'ready'
        : 'static';
  $: statusLabel =
    statusKind === 'invalid'
      ? 'Manifest error'
      : statusKind === 'ready'
        ? 'Runnable'
        : statusKind === 'static'
          ? 'No scripts'
          : 'Loading';
  $: fileCount = loaded ? countFiles(loaded.tree) : 0;

  onMount(() => {
    window.addEventListener('message', handleMessage);
    post('plugin-viewer/ready');
    return () => window.removeEventListener('message', handleMessage);
  });
</script>

<main class="pv">
  {#if loaded}
    <header class="pv-manifest" data-status={statusKind}>
      <div class="pv-manifest__icon" class:pv-manifest__icon--fallback={!loaded.iconUri}>
        {#if loaded.iconUri}
          <img src={loaded.iconUri} alt="" />
        {:else}
          <span aria-hidden="true">{initialsOf(loaded.name)}</span>
        {/if}
      </div>

      <div class="pv-manifest__body">
        <p class="pv-eyebrow">RisuAI Plugin</p>
        <div class="pv-title-row">
          <h1 class="pv-title" title={loaded.name}>{loaded.name}</h1>
          {#if loaded.version}<span class="pv-version">v{loaded.version}</span>{/if}
        </div>
        {#if loaded.description}
          <p class="pv-desc">{loaded.description}</p>
        {/if}
        <div class="pv-scripts">
          <span class="pv-status pv-status--{statusKind}">{statusLabel}</span>
          <span class="pv-chip" data-on={loaded.scripts.build}>build</span>
          <span class="pv-chip" data-on={loaded.scripts.dev}>dev</span>
        </div>
      </div>

      <button
        type="button"
        class="pv-icon-btn"
        title="Refresh plugin"
        aria-label="Refresh plugin"
        on:click={() => post('plugin-viewer/refresh')}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M13 3.5v3h-3" />
          <path d="M12.6 6.4A5 5 0 1 0 13.4 10" />
        </svg>
      </button>
    </header>

    {#if loaded.packageJsonError}
      <p class="pv-alert" role="alert">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" class="pv-alert__glyph">
          <path d="M8 2.2 14.5 13.5h-13z" />
          <path d="M8 6.4v3.1M8 11.4v.05" />
        </svg>
        <span>{loaded.packageJsonError} — Build / Dev disabled.</span>
      </p>
    {/if}

    <div class="pv-actions">
      <button
        type="button"
        class="pv-run pv-run--build"
        disabled={!loaded.scripts.build}
        on:click={() => post('plugin-viewer/runScript', { script: 'build' })}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 3.2 12.5 8l-8 4.8z" /></svg>
        Build
      </button>
      <button
        type="button"
        class="pv-run pv-run--dev button-secondary"
        disabled={!loaded.scripts.dev}
        on:click={() => post('plugin-viewer/runScript', { script: 'dev' })}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M9 1.5 3 9h4l-1 5.5L13 7H9z" /></svg>
        Dev
      </button>
    </div>

    <section class="pv-files" aria-label="Plugin files">
      <div class="pv-files__head">
        <p class="pv-eyebrow">Files</p>
        <span class="pv-count">{fileCount}</span>
      </div>
      {#if loaded.tree.length > 0}
        {@render treeNodes(loaded.tree, 0)}
      {:else}
        <p class="pv-empty">No files in this plugin.</p>
      {/if}
    </section>
  {:else}
    <div class="pv-loading">
      <span class="pv-spinner" aria-hidden="true"></span>
      <span>Loading plugin…</span>
    </div>
  {/if}
</main>

{#snippet treeNodes(nodes: TreeNode[], depth: number)}
  <ul class="pv-tree" class:pv-tree--nested={depth > 0}>
    {#each nodes as node (node.relativePath)}
      <li class="pv-tree__row" style={`--depth: ${depth}`}>
        {#if node.kind === 'directory'}
          {@const isCollapsed = collapsed.has(node.relativePath)}
          <button
            type="button"
            class="pv-dir"
            aria-expanded={!isCollapsed}
            on:click={() => toggleDir(node.relativePath)}
          >
            <span class="pv-dir__chevron" class:pv-dir__chevron--open={!isCollapsed} aria-hidden="true">
              <svg viewBox="0 0 16 16" focusable="false"><path d="M6 4l4 4-4 4" /></svg>
            </span>
            <svg class="pv-dir__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M1.75 4.25h4l1.5 1.5h6.75v6.75a.75.75 0 0 1-.75.75H1.75z" />
            </svg>
            <span class="pv-dir__name">{node.name}</span>
          </button>
          {#if !isCollapsed && node.children}{@render treeNodes(node.children, depth + 1)}{/if}
        {:else}
          {@const ext = extOf(node.name)}
          <button
            type="button"
            class="pv-file"
            on:click={() => post('plugin-viewer/openFile', { relativePath: node.relativePath })}
          >
            <svg class="pv-file__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4 1.75h5l3 3v9.5H4z" />
              <path d="M9 1.75v3h3" />
            </svg>
            <span class="pv-file__name">{node.name}</span>
            {#if ext}<span class="pv-file__ext" data-ext={ext}>{ext}</span>{/if}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  .pv {
    min-width: 0;
    padding: var(--space-3, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }

  /* Manifest header ------------------------------------------------------- */
  .pv-manifest {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-3);
    overflow: hidden;
    padding: var(--space-3);
    padding-left: calc(var(--space-3) + var(--border-emphasis, 3px));
    border: 1px solid var(--character-card-border, var(--card-border));
    border-radius: var(--radius-lg, 14px);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent 46%),
      var(--section);
    box-shadow: var(--card-shadow);
  }
  .pv-manifest::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--border-emphasis, 3px);
    background: var(--muted);
    opacity: 0.85;
  }
  .pv-manifest[data-status='ready']::before { background: var(--success); }
  .pv-manifest[data-status='static']::before { background: var(--accent); }
  .pv-manifest[data-status='invalid']::before { background: var(--error); }
  .pv-manifest[data-status='invalid'] {
    border-color: color-mix(in srgb, var(--error) 34%, var(--card-border));
  }

  .pv-manifest__icon {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--focus) 34%, var(--card-border));
    border-radius: var(--radius-md, 10px);
    background: color-mix(in srgb, var(--section) 70%, transparent);
  }
  .pv-manifest__icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .pv-manifest__icon--fallback {
    color: var(--badge-text);
    background:
      radial-gradient(circle at 30% 22%, color-mix(in srgb, var(--focus) 46%, transparent), transparent 42%),
      var(--badge);
    font-size: var(--text-xl);
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  .pv-manifest__body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .pv-eyebrow {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .pv-title-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }
  .pv-title {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: var(--card-title-size, 21px);
    font-weight: 800;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pv-version {
    flex: 0 0 auto;
    padding: var(--pill-padding-y, 2px) var(--space-2);
    border-radius: var(--radius-pill);
    color: var(--badge-text);
    background: var(--badge);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .pv-desc {
    display: -webkit-box;
    overflow: hidden;
    margin: 2px 0 0;
    color: var(--muted);
    font-size: var(--text-md);
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .pv-scripts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }
  .pv-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .pv-status::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: var(--radius-pill);
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
  }
  .pv-status--ready { color: var(--success); }
  .pv-status--static { color: var(--accent); }
  .pv-status--invalid { color: var(--error); }
  .pv-status--idle { color: var(--muted); }
  .pv-status--idle::before { box-shadow: none; }

  .pv-chip {
    padding: var(--pill-padding-y, 2px) var(--space-2);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-pill);
    color: var(--muted);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .pv-chip[data-on='true'] {
    color: var(--text);
    border-color: color-mix(in srgb, var(--success) 48%, var(--card-border));
    background: color-mix(in srgb, var(--success) 12%, transparent);
  }
  .pv-chip[data-on='false'] {
    opacity: 0.55;
    text-decoration: line-through;
  }

  .pv-icon-btn {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    color: var(--muted);
    background: transparent;
  }
  .pv-icon-btn svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .pv-icon-btn:hover:not(:disabled) {
    color: var(--text);
    background: var(--vscode-toolbar-hoverBackground, color-mix(in srgb, var(--focus) 16%, transparent));
    outline: 0;
  }

  /* Alert ----------------------------------------------------------------- */
  .pv-alert {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid color-mix(in srgb, var(--error) 42%, var(--card-border));
    border-radius: var(--radius-md);
    color: var(--text);
    background: color-mix(in srgb, var(--error) 12%, transparent);
    font-size: var(--text-md);
    line-height: 1.4;
  }
  .pv-alert__glyph {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    margin-top: 1px;
    fill: none;
    stroke: var(--error);
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Actions --------------------------------------------------------------- */
  .pv-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }
  .pv-run {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    font-weight: 600;
  }
  .pv-run svg {
    width: 13px;
    height: 13px;
    fill: currentColor;
  }
  .pv-run--dev svg { fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linejoin: round; }

  /* Files ----------------------------------------------------------------- */
  .pv-files {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
  }
  .pv-files__head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .pv-count {
    min-width: var(--count-min-width, 26px);
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    color: var(--badge-text);
    background: var(--badge);
    font-size: var(--text-xs);
    font-weight: 700;
    text-align: center;
  }
  .pv-empty {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-md);
  }

  .pv-tree {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pv-tree--nested {
    gap: 1px;
  }
  .pv-tree__row {
    min-width: 0;
  }

  .pv-dir,
  .pv-file {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    padding-left: calc(var(--space-2) + var(--depth, 0) * var(--space-3));
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--text);
    background: transparent;
    font: inherit;
    font-weight: 500;
    text-align: left;
  }
  .pv-dir:hover,
  .pv-file:hover {
    background: var(--vscode-list-hoverBackground, color-mix(in srgb, var(--focus) 12%, transparent));
    outline: 0;
  }
  .pv-dir:focus-visible,
  .pv-file:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: -1px;
  }

  .pv-dir { font-weight: 650; }
  .pv-dir__chevron {
    display: inline-grid;
    place-items: center;
    width: 14px;
    height: 14px;
    color: var(--muted);
    transition: transform 120ms ease;
  }
  .pv-dir__chevron svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .pv-dir__chevron--open { transform: rotate(90deg); }
  .pv-dir__glyph {
    flex: 0 0 auto;
    width: 15px;
    height: 15px;
    fill: color-mix(in srgb, var(--accent) 26%, transparent);
    stroke: color-mix(in srgb, var(--accent) 78%, var(--muted));
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .pv-dir__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pv-file {
    padding-left: calc(var(--space-2) + 14px + var(--space-2) + var(--depth, 0) * var(--space-3));
  }
  .pv-file__glyph {
    flex: 0 0 auto;
    width: 15px;
    height: 15px;
    fill: none;
    stroke: var(--muted);
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .pv-file:hover .pv-file__glyph { stroke: var(--text); }
  .pv-file__name {
    min-width: 0;
    overflow: hidden;
    color: var(--vscode-foreground);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pv-file__ext {
    flex: 0 0 auto;
    margin-left: auto;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    color: var(--muted);
    background: color-mix(in srgb, var(--section) 82%, transparent);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .pv-file__ext[data-ext='ts'],
  .pv-file__ext[data-ext='tsx'],
  .pv-file__ext[data-ext='js'],
  .pv-file__ext[data-ext='mjs'],
  .pv-file__ext[data-ext='cjs'] {
    color: var(--text);
    background: color-mix(in srgb, var(--focus) 22%, transparent);
  }
  .pv-file__ext[data-ext='json'] {
    color: var(--text);
    background: color-mix(in srgb, var(--warning) 20%, transparent);
  }
  .pv-file__ext[data-ext='css'],
  .pv-file__ext[data-ext='svelte'],
  .pv-file__ext[data-ext='html'] {
    color: var(--text);
    background: color-mix(in srgb, var(--success) 20%, transparent);
  }

  /* Loading --------------------------------------------------------------- */
  .pv-loading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-3);
    color: var(--muted);
    font-size: var(--text-md);
  }
  .pv-spinner {
    width: 15px;
    height: 15px;
    border: 2px solid color-mix(in srgb, var(--muted) 40%, transparent);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: pv-spin 720ms linear infinite;
  }
  @keyframes pv-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pv-spinner { animation: none; }
    .pv-dir__chevron { transition: none; }
  }
</style>
