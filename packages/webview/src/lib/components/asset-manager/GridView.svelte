<!--
  Asset Manager Grid view: 가상 스크롤 그리드 + Inspector.
  D4 가 D3 스텁을 본 구현으로 교체함.
  - 가상화: computeVirtualWindow 로 위/아래 spacer + visible window 렌더.
  - 선택: ctrl/meta 토글, shift 범위, 단일 클릭 단일 선택 (applyTileSelection).
  - Inspector: KEEP 시맨틱 일괄 부여, tokenize 제안 적용, orphan 정리.
  - 더블클릭 시 AssetDetailModal 오픈(메타 온디맨드 로드).
  @file packages/webview/src/lib/components/asset-manager/GridView.svelte
-->

<script lang="ts">
  import {
    applyTileSelection,
    computeVirtualWindow,
    filterAssetEntries,
    sortAssetEntries,
  } from '../../asset-manager/gridModel';
  import type {
    AssetCatalogMirror,
    AssetManagerAssetEntry,
    AssetManagerAssignmentChange,
    AssetManagerTokenizeProposal,
    AssetSlotId,
    AssetSlotValues,
    ImageMetaMirror,
  } from '../../types/assetManager';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import AssetDetailModal from './AssetDetailModal.svelte';

  // D3 AssetManagerApp 가 readonly 상태를 내려주므로 props 도 readonly 로 받는다.
  export let entries: readonly AssetManagerAssetEntry[] = [];
  export let catalog: AssetCatalogMirror;
  export let orphanPaths: readonly string[] = [];
  export let tokenizeProposals: readonly AssetManagerTokenizeProposal[] = [];
  export let metaByPath: Record<string, ImageMetaMirror> = {};
  export let assetImageSrc: (path: string) => string = () => '';
  export let onUpdateAssignments: (changes: AssetManagerAssignmentChange[]) => void = () => undefined;
  export let onBootstrap: () => void = () => undefined;
  export let onReadMeta: (path: string) => void = () => undefined;
  export let presetQuery: string | null = null;

  // KEEP 센티넬: 해당 슬롯은 기존 할당 값을 유지(덮어쓰지 않음).
  const KEEP = '__keep__';
  const GAP = 8;

  let subdir: string | 'all' = 'all';
  let query = '';
  let onlyUnassigned = false;
  let onlyDuplicate = false;
  let sortKey: 'name' | 'size' | 'mtime' = 'name';
  let tileSize = 160;
  let scrollTop = 0;
  let viewportHeight = 0;
  let viewportWidth = 0;
  let selected = new Set<string>();
  let anchorPath: string | null = null;
  let modalIndex: number | null = null;
  // Inspector select 값. KEEP 또는 vocab 값. 미선택 시 KEEP(유지).
  let inspectorValues: Record<string, string> = {};
  // Matrix 셀 클릭 점프 시 presetQuery 를 query/subdir 에 1회 적용하기 위한 가드.
  let lastPreset: string | null = null;
  $: if (presetQuery !== null && presetQuery !== lastPreset) {
    lastPreset = presetQuery;
    query = presetQuery;
    subdir = 'all';
  }

  $: visibleEntries = sortAssetEntries(
    filterAssetEntries(entries, { subdir, query, onlyUnassigned, onlyDuplicate }),
    sortKey,
  );
  $: orderedPaths = visibleEntries.map((entry) => entry.path);
  $: columns = Math.max(1, Math.floor((viewportWidth + GAP) / (tileSize + GAP)));
  $: window_ = computeVirtualWindow({
    scrollTop,
    viewportHeight,
    tileSize: tileSize + 44, // 타일 하단 라벨 영역 포함
    gap: GAP,
    columns,
    totalItems: visibleEntries.length,
    overscanRows: 2,
  });
  $: windowEntries = visibleEntries.slice(window_.startIndex, window_.endIndex);
  $: selectedEntries = visibleEntries.filter((entry) => selected.has(entry.path));
  $: proposalByPath = new Map(tokenizeProposals.map((proposal) => [proposal.path, proposal]));
  $: modalEntry = modalIndex === null ? null : (visibleEntries[modalIndex] ?? null);

  function selectionMode(event: MouseEvent): 'single' | 'toggle' | 'range' {
    if (event.shiftKey) return 'range';
    if (event.ctrlKey || event.metaKey) return 'toggle';
    return 'single';
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clickTile(event: MouseEvent, path: string): void {
    const next = applyTileSelection(orderedPaths, selected, anchorPath, path, selectionMode(event));
    selected = next.selected;
    anchorPath = next.anchorPath;
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function openModal(index: number): void {
    modalIndex = index;
    const entry = visibleEntries[index];
    if (entry && !metaByPath[entry.path]) onReadMeta(entry.path);
  }

  function ensureMeta(index: number): void {
    const entry = visibleEntries[index];
    if (entry && !metaByPath[entry.path]) onReadMeta(entry.path);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function moveModal(delta: number): void {
    if (modalIndex === null) return;
    const nextIndex = Math.min(visibleEntries.length - 1, Math.max(0, modalIndex + delta));
    modalIndex = nextIndex;
    ensureMeta(nextIndex);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function applyInspector(): void {
    const changes: AssetManagerAssignmentChange[] = selectedEntries.map((entry) => {
      const slots: AssetSlotValues = { ...(entry.assignment ?? {}) };
      for (const slot of catalog.schema.slots) {
        const chosen = inspectorValues[slot.id];
        // KEEP (또는 미선택) 은 기존 값을 유지하고 덮어쓰지 않는다.
        if (chosen && chosen !== KEEP) slots[slot.id] = chosen;
      }
      return { path: entry.path, slots };
    });
    if (changes.length > 0) onUpdateAssignments(changes);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function clearAssignments(): void {
    if (selectedEntries.length === 0) return;
    onUpdateAssignments(selectedEntries.map((entry) => ({ path: entry.path, slots: null })));
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function applyTokenizeToSelection(): void {
    if (tokenizeProposals.length === 0) {
      onBootstrap();
      return;
    }
    const targets = selectedEntries.length > 0 ? selectedEntries : visibleEntries;
    const changes: AssetManagerAssignmentChange[] = [];
    for (const entry of targets) {
      const proposal = proposalByPath.get(entry.path);
      if (proposal?.matched) changes.push({ path: entry.path, slots: { ...proposal.slots } });
    }
    if (changes.length > 0) onUpdateAssignments(changes);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function cleanOrphans(): void {
    if (orphanPaths.length === 0) return;
    onUpdateAssignments(orphanPaths.map((path) => ({ path, slots: null })));
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this handler.
  function onScroll(event: Event): void {
    scrollTop = (event.currentTarget as HTMLElement).scrollTop;
  }

  // value+onchange 패턴: indexed bind 대신 명시적 갱신(inspectorValues 는 선택/해제해도 유지).
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this handler.
  function onInspectorChange(slotId: AssetSlotId, event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    inspectorValues = { ...inspectorValues, [slotId]: value };
  }
</script>

<div class="grid-layout">
  <section class="grid-main" aria-label="Asset grid">
    <div class="grid-toolbar" role="toolbar" aria-label="Grid filters">
      <select bind:value={subdir} aria-label="Subdirectory filter">
        {#each ['all', 'additional', 'emotions', 'icons', 'other'] as option (option)}
          <option value={option}>{option === 'all' ? '전체' : option}</option>
        {/each}
      </select>
      <input type="search" placeholder="검색 (이름/슬롯 값)" bind:value={query} />
      <label><input type="checkbox" bind:checked={onlyUnassigned} /> 미할당</label>
      <label><input type="checkbox" bind:checked={onlyDuplicate} /> 중복</label>
      <select bind:value={sortKey} aria-label="Sort key">
        <option value="name">이름순</option>
        <option value="size">크기순</option>
        <option value="mtime">수정순</option>
      </select>
      <input type="range" min="96" max="256" step="16" bind:value={tileSize} aria-label="Tile size" />
      <button type="button" class="button-secondary" onclick={applyTokenizeToSelection}>
        {tokenizeProposals.length === 0 ? 'tokenize 분석' : 'tokenize 제안 적용'}
      </button>
      {#if orphanPaths.length > 0}
        <button type="button" class="button-secondary" onclick={cleanOrphans}
          >orphan {orphanPaths.length} 정리</button
        >
      {/if}
      <span class="grid-toolbar__count">{visibleEntries.length} / {entries.length}</span>
    </div>

    <div
      class="grid-viewport"
      onscroll={onScroll}
      bind:clientHeight={viewportHeight}
      bind:clientWidth={viewportWidth}
    >
      <div style={`height:${window_.topPadding}px`}></div>
      <div
        class="grid-tiles"
        style={`grid-template-columns:repeat(${columns}, ${tileSize}px); gap:${GAP}px;`}
      >
        {#each windowEntries as entry, offset (entry.path)}
          {@const index = window_.startIndex + offset}
          <button
            type="button"
            class="tile"
            class:tile--selected={selected.has(entry.path)}
            onclick={(event) => clickTile(event, entry.path)}
            ondblclick={() => openModal(index)}
            title={entry.path}
          >
            <img
              src={assetImageSrc(entry.path)}
              alt={entry.generatedName ?? entry.fileStem}
              width={tileSize}
              height={tileSize}
              loading="lazy"
              decoding="async"
            />
            <span class="tile__name">{entry.generatedName ?? entry.fileStem}</span>
            <span class="tile__badges">
              {#if entry.flags.unassigned}<span class="badge badge--warn">미할당</span>{/if}
              {#if entry.flags.duplicate}<span class="badge badge--dup">중복</span>{/if}
            </span>
          </button>
        {/each}
      </div>
      <div style={`height:${window_.bottomPadding}px`}></div>
    </div>
  </section>

  <aside class="inspector" aria-label="Assignment inspector">
    <h2>선택: {selectedEntries.length}</h2>
    {#each catalog.schema.slots as slot (slot.id)}
      <label class="inspector__field">
        <span>{slot.label}</span>
        <select
          value={inspectorValues[slot.id] ?? KEEP}
          onchange={(event) => onInspectorChange(slot.id, event)}
        >
          <option value={KEEP}>(유지)</option>
          {#each catalog.vocab[slot.id] ?? [] as value (value)}
            <option {value}>{value}</option>
          {/each}
        </select>
      </label>
    {/each}
    <div class="inspector__actions">
      <button type="button" onclick={applyInspector} disabled={selectedEntries.length === 0}
        >선택에 적용</button
      >
      <button
        type="button"
        class="button-secondary"
        onclick={clearAssignments}
        disabled={selectedEntries.length === 0}>할당 해제</button
      >
    </div>
    {#if selectedEntries.length === 1}
      {@const single = selectedEntries[0]}
      <dl class="inspector__meta">
        <dt>path</dt><dd>{single.path}</dd>
        <dt>name</dt><dd>{single.generatedName ?? '(미할당)'}</dd>
        <dt>size</dt><dd>{(single.sizeBytes / 1024).toFixed(1)} KB</dd>
      </dl>
    {/if}
  </aside>
</div>

{#if modalEntry}
  <AssetDetailModal
    entry={modalEntry}
    imgSrc={assetImageSrc(modalEntry.path)}
    meta={metaByPath[modalEntry.path] ?? null}
    {catalog}
    onClose={() => (modalIndex = null)}
    onPrev={() => moveModal(-1)}
    onNext={() => moveModal(1)}
    onApplySlots={(path, slots) => onUpdateAssignments([{ path, slots }])}
  />
{/if}

<style>
  .grid-layout {
    display: flex;
    gap: var(--space-3);
    flex: 1;
    min-height: 0;
  }
  .grid-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .grid-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    margin-bottom: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--section);
  }
  .grid-toolbar :global(label) {
    font-size: var(--text-sm);
    color: var(--muted);
  }
  .grid-toolbar :global(input[type='range']) {
    width: 96px;
  }
  .grid-toolbar__count {
    margin-left: auto;
    padding: var(--pill-padding-y) var(--space-2);
    border-radius: var(--radius-pill);
    color: var(--badge-text);
    background: var(--badge);
    font-size: var(--text-sm);
    font-weight: 700;
  }
  .grid-viewport {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .grid-tiles {
    display: grid;
  }
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-1);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
    cursor: pointer;
    text-align: left;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease,
      transform 120ms ease;
  }
  .tile:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--focus) 55%, var(--card-border));
    outline: none;
    transform: translateY(-1px);
  }
  .tile--selected {
    border-color: var(--focus);
    box-shadow: 0 0 0 1px var(--focus);
  }
  .tile img {
    width: 100%;
    object-fit: cover;
    border-radius: var(--radius-sm);
    background: var(--secondary);
  }
  .tile__name {
    padding: 0 2px;
    font-size: var(--text-sm);
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tile__badges {
    position: absolute;
    top: var(--space-2);
    left: var(--space-2);
    display: flex;
    gap: var(--space-1);
  }
  .badge {
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 700;
    box-shadow: 0 1px 3px color-mix(in srgb, black 40%, transparent);
  }
  .badge--warn {
    background: var(--warning);
    color: #000;
  }
  .badge--dup {
    background: var(--focus);
    color: #fff;
  }
  .inspector {
    width: 240px;
    flex-shrink: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
  }
  .inspector h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
  }
  .inspector__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .inspector__field > span {
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .inspector__actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
  .inspector__meta {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 2px var(--space-2);
    margin: 0;
    padding-top: var(--space-2);
    border-top: 1px solid var(--card-border);
    font-size: var(--text-sm);
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .inspector__meta dt {
    font-weight: 700;
    color: var(--muted);
  }
  .inspector__meta dd {
    margin: 0;
    color: var(--text);
  }
</style>
