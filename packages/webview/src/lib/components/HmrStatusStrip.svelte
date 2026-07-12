<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ArtifactBrowserHmrStatusPayload } from '../types';

  export let hmrStatus: ArtifactBrowserHmrStatusPayload | null;
  export let currentStableId: string;
  export let onStop: () => void;
  export let onBroadcastHere: () => void;

  const RECEIVER_FRESH_WINDOW_MS = 35_000;

  let nowMs = Date.now();
  const ticker = setInterval(() => {
    nowMs = Date.now();
  }, 5_000);

  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    clearInterval(ticker);
    if (copyResetTimer !== null) clearTimeout(copyResetTimer);
  });

  $: isRunning = hmrStatus?.running === true;
  $: isHere = isRunning && hmrStatus?.stableId === currentStableId;
  $: receiverConnected =
    typeof hmrStatus?.lastPollAtMs === 'number' && nowMs - hmrStatus.lastPollAtMs < RECEIVER_FRESH_WINDOW_MS;
  $: pollAgeSeconds =
    typeof hmrStatus?.lastPollAtMs === 'number' ? Math.max(0, Math.round((nowMs - hmrStatus.lastPollAtMs) / 1000)) : null;

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this copied flag.
  let copied = false;

  /**
   * copyConnectionString 함수.
   * 연결 문자열을 클립보드에 복사하고 일시적으로 Copied! 표시를 띄운다.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this event handler.
  function copyConnectionString(): void {
    const connectionString = hmrStatus?.connectionString;
    if (!connectionString) return;
    void navigator.clipboard?.writeText(connectionString);
    copied = true;
    if (copyResetTimer !== null) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copied = false;
      copyResetTimer = null;
    }, 1_500);
  }
</script>

{#if isHere && hmrStatus}
  <div class="hmr-strip" class:hmr-strip--error={Boolean(hmrStatus.lastError)}>
    <div class="hmr-strip__row">
      <span class="hmr-strip__dot" aria-hidden="true"></span>
      <span
        class="hmr-strip__label"
        title="Broadcasting: {hmrStatus.artifactName} ({hmrStatus.artifactKind}) · {hmrStatus.updateCount} updates"
      >
        Broadcasting: {hmrStatus.artifactName} ({hmrStatus.artifactKind}) · {hmrStatus.updateCount} updates
      </span>
    </div>
    <div class="hmr-strip__row hmr-strip__row--wrap">
      <span class="hmr-strip__receiver">
        {#if receiverConnected}
          Receiver: connected{pollAgeSeconds === null ? '' : ` (${pollAgeSeconds}s ago)`}
        {:else}
          Receiver: waiting for RisuAI…
        {/if}
      </span>
      <span class="hmr-strip__actions">
        <button
          type="button"
          class="hmr-strip__button"
          title="Copy connection string"
          on:click={copyConnectionString}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button type="button" class="hmr-strip__button hmr-strip__button--stop" on:click={onStop}>Stop</button>
      </span>
    </div>
    {#if hmrStatus.lastError}
      <p class="hmr-strip__error">Build error — last good version kept: {hmrStatus.lastError}</p>
    {/if}
  </div>
{:else if isRunning && hmrStatus}
  <div class="hmr-strip hmr-strip--hint">
    <span class="hmr-strip__hint-label" title="Broadcasting another artifact: {hmrStatus.artifactName}">
      Broadcasting another artifact: {hmrStatus.artifactName}
    </span>
    <button type="button" class="hmr-strip__button" on:click={onBroadcastHere}>Broadcast this instead</button>
  </div>
{/if}

<style>
  .hmr-strip {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .hmr-strip--hint {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    color: var(--muted);
  }

  .hmr-strip__hint-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hmr-strip--error {
    border-color: var(--error);
  }

  .hmr-strip__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .hmr-strip__row--wrap {
    flex-wrap: wrap;
    row-gap: var(--space-1);
  }

  .hmr-strip__dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    flex: none;
  }

  .hmr-strip__label {
    font-weight: 600;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hmr-strip__receiver {
    color: var(--muted);
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hmr-strip__actions {
    display: flex;
    gap: var(--space-2);
    flex: none;
    margin-left: auto;
  }

  .hmr-strip__button {
    padding: 2px var(--space-2);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--secondary);
    color: var(--secondary-text);
    white-space: nowrap;
  }

  .hmr-strip__button--stop {
    color: var(--error);
  }

  .hmr-strip__error {
    margin: 0;
    color: var(--error);
    overflow-wrap: anywhere;
  }
</style>
