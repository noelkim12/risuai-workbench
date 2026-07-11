<script lang="ts">
  type ProfileKind = 'none' | 'legacy' | 'invalid' | 'available';

  export let profileKind: ProfileKind;
  export let canOpenReport: boolean;
  export let stableId: string;
  export let onAnalyze: (stableId: string) => void;
  export let onOpenReport: (stableId: string) => void;
</script>

<div class="profile-actions">
  {#if profileKind === 'none'}
    <button
      type="button"
      class="profile-action profile-action--primary"
      on:click={() => onAnalyze(stableId)}
    >
      Reveal Analysis
    </button>
  {:else if profileKind === 'legacy'}
    <button type="button" class="profile-action" on:click={() => onOpenReport(stableId)}>
      Open Full Report
    </button>
    <button type="button" class="profile-action" on:click={() => onAnalyze(stableId)}>
      Re-analyze
    </button>
  {:else if profileKind === 'invalid'}
    <button
      type="button"
      class="profile-action profile-action--primary"
      on:click={() => onAnalyze(stableId)}
    >
      Re-analyze
    </button>
  {:else}
    <button
      type="button"
      class="profile-action"
      disabled={!canOpenReport}
      on:click={() => onOpenReport(stableId)}
    >
      Open Full Report
    </button>
    <button type="button" class="profile-action" on:click={() => onAnalyze(stableId)}>
      Re-analyze
    </button>
  {/if}
</div>

<style>
  .profile-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .profile-action {
    padding: var(--space-1) var(--space-3);
    min-width: 76px;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    color: var(--secondary-text);
    background: var(--secondary);
    font-size: var(--text-md);
    font-weight: 600;
    text-align: center;
    transition:
      background 120ms ease,
      border-color 120ms ease;
  }

  .profile-action:hover:not(:disabled) {
    background: color-mix(in srgb, var(--secondary) 82%, var(--focus));
    border-color: var(--focus);
    outline: none;
  }

  .profile-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .profile-action--primary {
    color: var(--accent-text);
    background: var(--accent);
    border-color: transparent;
  }

  .profile-action--primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 86%, var(--focus));
    border-color: transparent;
  }
</style>
