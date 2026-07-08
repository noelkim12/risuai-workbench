<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { ArtifactBrowserPackCompletedPayload, BrowserArtifactCard } from '../types';

  export let artifact: BrowserArtifactCard;
  export let packState: Writable<ArtifactBrowserPackCompletedPayload | null>;
  export let onConfirm: (recovery: boolean) => void;
  export let onClose: () => void;

  let recovery = false;
  let submitted = false;

  // Mirror of the host planner's format→extension mapping (cosmetic preview only;
  // the host recomputes authoritatively). Keep in sync with resolvePackFormat.
  $: formatLabel =
    artifact.artifactKind === 'module'
      ? 'risum'
      : artifact.artifactKind === 'character' && artifact.sourceFormat === 'png'
        ? 'png'
        : 'charx';
  $: ext = formatLabel === 'risum' ? '.risum' : formatLabel === 'png' ? '.png' : '.charx';
  $: fileName = `${artifact.name}${ext}`;
  $: outputPath = `${artifact.rootPathLabel}/out/${fileName}`;

  $: matchesThisArtifact = $packState?.stableId === artifact.stableId;
  $: phase =
    !submitted ? 'idle' : $packState === null || !matchesThisArtifact ? 'packing' : $packState.ok ? 'done' : 'error';

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this event handler.
  function confirm(): void {
    submitted = true;
    onConfirm(recovery);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this event handler.
  function dismiss(): void {
    if (phase === 'packing') return;
    onClose();
  }
</script>

<section class="modal-backdrop" aria-label="Pack dialog backdrop">
  <button
    type="button"
    class="modal-scrim"
    aria-label="Close pack dialog"
    disabled={phase === 'packing'}
    on:click={dismiss}
  ></button>
  <div class="create-modal" aria-label="Pack workbench artifact" role="dialog" aria-modal="true">
    <header class="create-modal__header">
      <div>
        <p class="eyebrow">Pack artifact</p>
        <h2>{artifact.name}</h2>
      </div>
      <button
        type="button"
        class="button-icon button-icon--quiet"
        aria-label="Close pack dialog"
        disabled={phase === 'packing'}
        on:click={dismiss}
      >×</button>
    </header>

    <dl class="pack-modal__info">
      <div><dt>Format</dt><dd>{formatLabel}</dd></div>
      <div><dt>File</dt><dd>{fileName}</dd></div>
      <div><dt>Path</dt><dd>{outputPath}</dd></div>
    </dl>

    <label class="pack-modal__toggle">
      <input type="checkbox" bind:checked={recovery} disabled={phase === 'packing'} />
      RisuLua 복원 메타데이터 포함 (round-trip)
    </label>

    {#if phase === 'packing'}
      <div class="pack-modal__progress" role="progressbar" aria-label="Packing in progress">
        <div class="pack-modal__progress-bar"></div>
      </div>
      <p class="bridge-status">Packing…</p>
    {:else if phase === 'done'}
      <p class="pack-modal__result pack-modal__result--ok">Packed → {$packState?.outputPath}</p>
    {:else if phase === 'error'}
      <p class="pack-modal__result pack-modal__result--error">Pack failed: {$packState?.error ?? 'unknown error'}</p>
    {/if}

    <footer class="create-modal__actions">
      {#if phase === 'done' || phase === 'error'}
        <button type="button" on:click={onClose}>Close</button>
      {:else}
        <button type="button" class="button-secondary" on:click={onClose} disabled={phase === 'packing'}>Cancel</button>
        <button type="button" on:click={confirm} disabled={phase === 'packing'}>Pack</button>
      {/if}
    </footer>
  </div>
</section>

<style>
  .pack-modal__info {
    display: grid;
    gap: 0.35rem;
    margin: 0.75rem 0;
    font-size: 0.85rem;
  }
  .pack-modal__info div {
    display: flex;
    gap: 0.5rem;
  }
  .pack-modal__info dt {
    min-width: 3.5rem;
    opacity: 0.7;
  }
  .pack-modal__info dd {
    margin: 0;
    word-break: break-all;
  }
  .pack-modal__toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
  }
  .pack-modal__progress {
    height: 4px;
    border-radius: 2px;
    background: var(--vscode-progressBar-background, rgba(255, 255, 255, 0.15));
    overflow: hidden;
  }
  .pack-modal__progress-bar {
    height: 100%;
    width: 40%;
    background: var(--vscode-progressBar-foreground, #0a84ff);
    animation: pack-indeterminate 1.1s ease-in-out infinite;
  }
  @keyframes pack-indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(300%); }
  }
  .pack-modal__result {
    font-size: 0.85rem;
    word-break: break-all;
  }
  .pack-modal__result--error {
    color: var(--vscode-errorForeground, #f14c4c);
  }
</style>
