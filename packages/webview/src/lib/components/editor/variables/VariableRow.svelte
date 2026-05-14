<!--
  Variable drawer row with typed controls and raw fallback.
  @file packages/webview/src/lib/components/editor/variables/VariableRow.svelte
-->

<script lang="ts">
  import type { MainEditorVariableBindingPayload } from '../../../types/mainEditor';

  export let binding: MainEditorVariableBindingPayload;
  export let onRawChange: (variableName: string, rawValue: string) => void;
  export let onCandidateSelect: (variableName: string, value: string) => void;

  let expanded = false;

  /**
   * toggleExpanded 함수.
   * variable row header 전체를 details toggle로 사용함.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this row header handler.
  function toggleExpanded(): void {
    expanded = !expanded;
  }
</script>

<article class="variable-row" data-status={binding.status}>
  <button type="button" class="variable-row__header" aria-expanded={expanded} onclick={toggleExpanded}>
    <span class="variable-row__expand" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
    <span class="variable-row__title">
      <strong>{binding.variableName}</strong>
      <span>{binding.source}</span>
    </span>
    <span class="variable-row__status">{binding.status}</span>
  </button>

  <div class="variable-row__controls">
    {#if binding.valueKind === 'boolean'}
      <div class="variable-row__segmented" role="group" aria-label={`${binding.variableName} boolean override`}>
        <button type="button" class:active={binding.rawValue === 'false'} onclick={() => onCandidateSelect(binding.variableName, 'false')}>false</button>
        <button type="button" class:active={binding.rawValue === 'true'} onclick={() => onCandidateSelect(binding.variableName, 'true')}>true</button>
      </div>
    {:else if binding.candidates.length > 0}
      <div class="variable-row__chips" aria-label={`${binding.variableName} candidates`}>
        {#each binding.candidates.slice(0, 6) as candidate}
          <button type="button" onclick={() => onCandidateSelect(binding.variableName, candidate.value)} title={candidate.source}>{candidate.label}</button>
        {/each}
      </div>
    {/if}

    <label class="variable-row__raw">
      <span>raw</span>
      <input value={binding.rawValue} oninput={(event) => onRawChange(binding.variableName, event.currentTarget.value)} />
    </label>
  </div>

  <div class="variable-row__details" class:variable-row__details--open={expanded} aria-hidden={!expanded}>
    <div class="variable-row__details-inner">
      <p>scope: {binding.scope} · operation: {binding.operation} · direction: {binding.direction}</p>
      <p>used at {binding.usageRanges.length} location(s)</p>
      <button type="button" disabled>Go to definition</button>
    </div>
  </div>
</article>
