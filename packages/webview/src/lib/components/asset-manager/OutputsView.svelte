<!--
  Asset Manager Outputs view: 파생 출력 3종(프롬프트/디스플레이 정규식/missing 리포트) + manifest 빌드 요약.
  D5 가 D3 스텁을 본 구현으로 교체함.
  - 각 카드: 생성·복사·저장(기본 경로 편집 가능).
  - 디스플레이 정규식: .risuregex 직렬화(frontmatter comment/type editdisplay + @@@ IN/OUT).
  - manifest 빌드 카드: onBuildManifest → buildSummary 표시.
  @file packages/webview/src/lib/components/asset-manager/OutputsView.svelte
-->

<script lang="ts">
  import type { AssetCatalogMirror, AssetOutputKind } from '../../types/assetManager';

  export let catalog: AssetCatalogMirror;
  export let outputsState: {
    promptBlock?: string;
    whitelistRegex?: { inPattern: string; outPattern: string } | null;
    missingReport?: string;
  } = {};
  export let buildSummary: {
    total: number;
    named: number;
    unassigned: number;
    duplicates: number;
    orphans: number;
  } | null = null;
  export let onGenerateOutputs: (kinds: AssetOutputKind[]) => void = () => undefined;
  export let onSaveOutput: (kind: AssetOutputKind, targetPath: string, content: string) => void = () => undefined;
  export let onBuildManifest: () => void = () => undefined;

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds these via bind:value.
  let promptPath = 'docs/asset-prompt-block.md';
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds these via bind:value.
  let regexPath = 'regex/90_asset_whitelist.risuregex';
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds these via bind:value.
  let reportPath = 'docs/asset-missing-report.md';

  $: whitelistDocument = outputsState.whitelistRegex
    ? [
        '---',
        'comment: "asset-display"',
        'type: editdisplay',
        '---',
        '@@@ IN',
        outputsState.whitelistRegex.inPattern,
        '@@@ OUT',
        outputsState.whitelistRegex.outPattern,
        '',
      ].join('\n')
    : '';

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function copyText(text: string): void {
    void navigator.clipboard?.writeText(text);
  }
</script>

<div class="outputs-layout">
  <section class="output-card">
    <header>
      <h2>프롬프트 블록</h2>
      <div>
        <button type="button" class="button-secondary" onclick={() => onGenerateOutputs(['promptBlock'])}>생성</button>
        <button
          type="button"
          class="button-secondary"
          disabled={!outputsState.promptBlock}
          onclick={() => copyText(outputsState.promptBlock ?? '')}>복사</button
        >
      </div>
    </header>
    <textarea readonly rows="10" value={outputsState.promptBlock ?? ''}></textarea>
    <div class="output-save">
      <input type="text" bind:value={promptPath} />
      <button
        type="button"
        disabled={!outputsState.promptBlock}
        onclick={() => onSaveOutput('promptBlock', promptPath, outputsState.promptBlock ?? '')}>저장</button
      >
    </div>
  </section>

  <section class="output-card">
    <header>
      <h2>디스플레이 정규식</h2>
      <div>
        <button
          type="button"
          class="button-secondary"
          onclick={() => onGenerateOutputs(['whitelistRegex'])}>생성</button
        >
        <button
          type="button"
          class="button-secondary"
          disabled={!whitelistDocument}
          onclick={() => copyText(whitelistDocument)}>복사</button
        >
      </div>
    </header>
    {#if outputsState.whitelistRegex === null}
      <p class="output-hint">s1 vocab이 비어 있어 생성할 수 없습니다.</p>
    {/if}
    <textarea readonly rows="10" value={whitelistDocument}></textarea>
    <div class="output-save">
      <input type="text" bind:value={regexPath} />
      <button
        type="button"
        disabled={!whitelistDocument}
        onclick={() => onSaveOutput('whitelistRegex', regexPath, whitelistDocument)}>저장</button
      >
    </div>
  </section>

  <section class="output-card">
    <header>
      <h2>Missing 리포트</h2>
      <div>
        <button
          type="button"
          class="button-secondary"
          onclick={() => onGenerateOutputs(['missingReport'])}>생성</button
        >
        <button
          type="button"
          class="button-secondary"
          disabled={!outputsState.missingReport}
          onclick={() => copyText(outputsState.missingReport ?? '')}>복사</button
        >
      </div>
    </header>
    <textarea readonly rows="10" value={outputsState.missingReport ?? ''}></textarea>
    <div class="output-save">
      <input type="text" bind:value={reportPath} />
      <button
        type="button"
        disabled={!outputsState.missingReport}
        onclick={() => onSaveOutput('missingReport', reportPath, outputsState.missingReport ?? '')}>저장</button
      >
    </div>
  </section>

  <section class="output-card output-card--build">
    <header>
      <h2>Manifest 빌드</h2>
      <button type="button" onclick={onBuildManifest}>Build ▶</button>
    </header>
    <p class="output-schema">
      스키마: {catalog.schema.slots.map((slot) => slot.label).join(' / ')}
      (<code>{catalog.schema.joinTemplate}</code>)
    </p>
    {#if buildSummary}
      <ul class="build-summary">
        <li>총 {buildSummary.total} entries</li>
        <li>curated name {buildSummary.named}</li>
        <li>미할당 {buildSummary.unassigned}</li>
        <li>중복 name {buildSummary.duplicates}</li>
        <li>orphan {buildSummary.orphans}</li>
      </ul>
    {:else}
      <p class="output-hint">아직 빌드하지 않았습니다. catalog 큐레이션이 manifest name에 반영됩니다.</p>
    {/if}
  </section>
</div>

<style>
  .outputs-layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: var(--space-3);
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    align-content: start;
  }
  .output-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    background: var(--card);
  }
  .output-card header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }
  .output-card header > div {
    display: flex;
    gap: var(--space-1);
    flex: 0 0 auto;
  }
  .output-card h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
  }
  .output-card textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--text-sm);
    resize: vertical;
  }
  .output-save {
    display: flex;
    gap: var(--space-1);
  }
  .output-save input {
    flex: 1;
    min-width: 0;
  }
  .output-hint {
    color: var(--secondary-text);
    font-size: var(--text-sm);
    margin: 0;
  }
  .build-summary {
    margin: 0;
    padding-left: 1.2em;
    font-size: var(--text-sm);
  }
  .output-schema {
    margin: 0;
    color: var(--secondary-text);
    font-size: var(--text-sm);
  }
  .output-schema code {
    font-weight: 700;
  }
</style>
