<script lang="ts">
  import {
    assetExtension,
    classifyDroppedFile,
    mimeForAssetExtension,
    parseNameWithRules,
    stripAssetExtension,
    validateEditedAssetFilename,
    validateStagedTargetPaths,
    type AssetFilenameValidationReason,
    type AssetFilenameValidationResult,
    type StagedClassification,
    type StagedItem,
  } from '../../asset-manager/staging';
  import type {
    AssetCatalogBootstrapConfigMirror,
    AssetManagerAssetEntry,
    AssetManagerWriteAssetFile,
    AssetSlotId,
    AssetSlotValues,
  } from '../../types/assetManager';

  export let items: StagedItem[];
  export let entries: readonly AssetManagerAssetEntry[];
  export let bootstrapConfig: AssetCatalogBootstrapConfigMirror | null = null;
  export let slotIds: readonly AssetSlotId[];
  export let assetImageSrc: (path: string) => string;
  export let applying = false;
  export let onApply: (files: readonly AssetManagerWriteAssetFile[]) => void;
  export let onClose: () => void;

  interface StagedRow {
    readonly item: StagedItem;
    readonly cls: StagedClassification;
    readonly slots: AssetSlotValues | null;
    readonly previewUrl: string;
    readonly isImage: boolean;
    readonly validation: AssetFilenameValidationResult;
  }

  const VALIDATION_LABEL: Record<AssetFilenameValidationReason, string> = {
    'unsupported-extension': '지원하지 않는 확장자',
    'unsafe-path': '경로 구분자(/ \\)는 쓸 수 없음',
    'dot-segment': '예약 경로 세그먼트(. ..)',
    'reserved-basename': '예약 파일명',
  };

  // 이름 편집 시 분류/파싱/검증을 실시간 재계산한다 (Q8).
  $: rows = items.map((item): StagedRow => {
    const ext = assetExtension(item.editedName);
    const mime = mimeForAssetExtension(ext);
    return {
      item,
      cls: classifyDroppedFile(item.editedName, entries),
      slots: bootstrapConfig === null ? null : parseNameWithRules(stripAssetExtension(item.editedName), bootstrapConfig, slotIds),
      previewUrl: `data:${mime};base64,${item.bytesBase64}`,
      isImage: mime.startsWith('image/'),
      validation: validateEditedAssetFilename(item.editedName),
    };
  });
  $: addRows = rows.filter((row) => row.cls.kind === 'add');
  $: replaceRows = rows.filter((row) => row.cls.kind === 'replace');
  $: targetValidation = validateStagedTargetPaths(rows.map((row) => row.cls));
  $: invalidCount = rows.filter((row) => !row.validation.valid).length;
  $: canApply = rows.length > 0 && invalidCount === 0 && targetValidation.valid && !applying;

  function renameItem(id: string, value: string): void {
    const next = value.trim();
    items = items.map((item) => (item.id === id ? { ...item, editedName: next.length > 0 ? next : item.editedName } : item));
  }

  function removeItem(id: string): void {
    items = items.filter((item) => item.id !== id);
    if (items.length === 0) onClose();
  }

  function slotsLabel(slots: AssetSlotValues | null): string {
    if (slots === null) return '파싱 실패 → 미할당으로 추가';
    return slotIds.map((slotId) => `${slotId}: ${slots[slotId] ?? '—'}`).join(' · ');
  }

  function apply(): void {
    if (!canApply) return;
    onApply(
      rows.map((row): AssetManagerWriteAssetFile => ({
        targetPath: row.cls.targetPath,
        bytesBase64: row.item.bytesBase64,
        ...(row.cls.deletePath !== undefined && { deletePath: row.cls.deletePath }),
      })),
    );
  }
</script>

{#snippet rowCard(row: StagedRow)}
  <li
    class="stg-row"
    class:is-invalid={!row.validation.valid}
    class:is-unparsed={row.validation.valid && row.slots === null}
  >
    <span class="stg-thumbs">
      {#if row.cls.replaces}
        <img class="stg-thumb stg-thumb--old" src={assetImageSrc(row.cls.replaces.path)} alt="기존" title="기존 파일" />
        <span class="stg-arrow" aria-hidden="true">→</span>
      {/if}
      {#if row.isImage}
        <img class="stg-thumb" src={row.previewUrl} alt={row.item.editedName} title="새 파일" />
      {:else}
        <span class="stg-thumb stg-thumb--file" title="미리보기 없음">파일</span>
      {/if}
    </span>
    <span class="stg-info">
      <input
        class="stg-name"
        type="text"
        value={row.item.editedName}
        onchange={(event) => renameItem(row.item.id, event.currentTarget.value)}
        aria-label="파일명 편집"
        disabled={applying}
      />
      {#if row.validation.valid}
        <span class="stg-meta">
          {row.cls.targetPath}
          {#if row.cls.extChange}<span class="stg-tag stg-tag--ext">{row.cls.extChange.from} → {row.cls.extChange.to}</span>{/if}
          · {(row.item.sizeBytes / 1024).toFixed(1)} KB
        </span>
        <span class="stg-slots">{slotsLabel(row.slots)}</span>
      {:else}
        <span class="stg-error">{VALIDATION_LABEL[row.validation.reason]}</span>
      {/if}
    </span>
    <button type="button" class="stg-remove" onclick={() => removeItem(row.item.id)} aria-label="목록에서 제외" disabled={applying}>✕</button>
  </li>
{/snippet}

<div class="modal-backdrop" role="presentation">
  <div class="stg" role="dialog" aria-modal="true" aria-labelledby="asset-staging-title">
    <header class="stg__header">
      <p class="stg__eyebrow">Drop Staging</p>
      <h2 id="asset-staging-title">드롭한 파일 {rows.length}개 확인</h2>
      {#if bootstrapConfig === null}
        <p class="stg__hint">저장된 catalog 생성 규칙이 없어 파싱 미리보기를 건너뜁니다. 적용하면 미할당으로 추가됩니다.</p>
      {/if}
    </header>

    {#if !targetValidation.valid}
      <p class="stg__error" role="alert">동일한 대상 경로가 {targetValidation.duplicatePaths.length}건 겹칩니다 — 파일명을 고쳐주세요: {targetValidation.duplicatePaths.join(', ')}</p>
    {/if}

    {#if addRows.length > 0}
      <section aria-label="추가될 파일">
        <h3 class="stg__section">추가 ({addRows.length})</h3>
        <ul class="stg__list">{#each addRows as row (row.item.id)}{@render rowCard(row)}{/each}</ul>
      </section>
    {/if}

    {#if replaceRows.length > 0}
      <section aria-label="교체될 파일">
        <h3 class="stg__section">수정 · 기존 파일을 덮어씁니다 ({replaceRows.length})</h3>
        <ul class="stg__list">{#each replaceRows as row (row.item.id)}{@render rowCard(row)}{/each}</ul>
      </section>
    {/if}

    <footer class="stg__footer">
      <button type="button" class="stg-btn stg-btn--secondary" onclick={onClose} disabled={applying}>취소</button>
      <button type="button" class="stg-btn stg-btn--primary" onclick={apply} disabled={!canApply}>
        {applying ? '기록 중…' : `적용 (${rows.length}개 쓰기)`}
      </button>
    </footer>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 45%);
  }
  .stg {
    width: min(760px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-lg);
    background: var(--vscode-editor-background, #1e1e1e);
    box-shadow: 0 18px 64px rgb(0 0 0 / 35%);
    overflow: auto;
  }
  .stg__header { display: grid; gap: 2px; }
  .stg__eyebrow {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--focus) 70%, var(--secondary-text));
  }
  .stg h2 { margin: 0; font-size: 1.1rem; }
  .stg__hint { margin: 0; color: var(--secondary-text); font-size: var(--text-sm); }
  .stg__error { margin: 0; color: var(--vscode-errorForeground, #f66); font-size: var(--text-sm); }
  .stg__section { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--secondary-text); }
  .stg__list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
  .stg-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
  }
  .stg-row.is-unparsed { border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 45%, var(--card-border)); }
  .stg-row.is-invalid { border-color: color-mix(in srgb, var(--vscode-errorForeground, #f66) 50%, var(--card-border)); }
  .stg-thumbs { display: inline-flex; align-items: center; gap: 6px; flex: none; }
  .stg-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: var(--radius-sm); background: var(--secondary); }
  .stg-thumb--old { opacity: 0.55; }
  .stg-thumb--file { display: grid; place-items: center; font-size: var(--text-sm); color: var(--secondary-text); }
  .stg-arrow { color: var(--secondary-text); font-weight: 700; }
  .stg-info { display: grid; gap: 3px; min-width: 0; flex: 1 1 auto; }
  .stg-name {
    padding: 4px 8px;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background, transparent);
    color: inherit;
    font: inherit;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--text-sm);
  }
  .stg-meta { color: var(--secondary-text); font-size: var(--text-sm); overflow-wrap: anywhere; }
  .stg-slots { font-size: var(--text-sm); }
  .stg-row.is-unparsed .stg-slots { color: var(--vscode-editorWarning-foreground, #cca700); }
  .stg-error { color: var(--vscode-errorForeground, #f66); font-size: var(--text-sm); font-weight: 600; }
  .stg-tag {
    display: inline-flex;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
  }
  .stg-tag--ext { color: var(--focus); background: color-mix(in srgb, var(--focus) 18%, transparent); }
  .stg-remove {
    flex: none;
    padding: 2px 8px;
    border: none;
    background: none;
    color: var(--secondary-text);
    font: inherit;
    cursor: pointer;
  }
  .stg-remove:disabled { opacity: 0.5; cursor: default; }
  .stg__footer { display: flex; justify-content: flex-end; gap: var(--space-2); }
  .stg-btn { padding: 5px 14px; border-radius: var(--radius-sm); font-size: var(--text-sm); font-weight: 600; border: none; cursor: pointer; }
  .stg-btn:disabled { opacity: 0.5; cursor: default; }
  .stg-btn--primary { color: var(--accent-text); background: var(--accent); }
  .stg-btn--secondary { color: var(--secondary-text); background: var(--secondary); }
</style>
