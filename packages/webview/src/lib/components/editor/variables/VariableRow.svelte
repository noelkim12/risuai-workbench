<!--
  Variable drawer row with typed controls and raw fallback.
  @file packages/webview/src/lib/components/editor/variables/VariableRow.svelte
-->

<script lang="ts">
  import type { MainEditorVariableBindingPayload } from '../../../types/mainEditor';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup reads isBareBooleanToggle.
  import { isBareBooleanToggle, isNullTestSentinel } from './variableDrawerHelpers';

  export let binding: MainEditorVariableBindingPayload;
  export let onRawChange: (variableName: string, rawValue: string) => void;
  export let onCandidateSelect: (variableName: string, value: string) => void;

  const CUSTOM_VALUE_OPTION = '__risu_custom_variable_value__';

  let expanded = false;

  type VariableCandidateOption = MainEditorVariableBindingPayload['candidates'][number] & { value: string | null };

  /**
   * candidate option 값을 select용 문자열로 정규화함.
   * Runtime에서 null candidate가 들어와도 native select의 빈 값과 충돌하지 않게 유지함.
   */
  function getCandidateOptionValue(candidate: VariableCandidateOption): string {
    return candidate.value === null ? 'null' : candidate.value;
  }

  /**
   * 현재 rawValue와 매칭되는 candidate가 없으면 custom sentinel을 선택함.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup reads this select value helper.
  function getSelectedCandidateValue(): string {
    return binding.candidates.some((candidate) => getCandidateOptionValue(candidate) === binding.rawValue) ? binding.rawValue : CUSTOM_VALUE_OPTION;
  }

  /**
   * Custom Value placeholder는 내부 sentinel만 사용하고, raw override에는 빈 문자열로 반영함.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this select change handler.
  function handleCandidateChange(event: Event): void {
    if (!(event.currentTarget instanceof HTMLSelectElement)) return;

    const selectedValue = event.currentTarget.value;
    onCandidateSelect(binding.variableName, selectedValue === CUSTOM_VALUE_OPTION ? '' : selectedValue);
  }

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
    {#if isBareBooleanToggle(binding)}
      <label class="variable-row__toggle">
        <span>boolean</span>
        <button
          type="button"
          class="variable-row__toggle-switch"
          role="switch"
          aria-label={`${binding.variableName} boolean toggle`}
          aria-checked={binding.rawValue === '1' || binding.rawValue === 'true'}
          onclick={() => {
            const next = binding.rawValue === '1' || binding.rawValue === 'true' ? 'false' : 'true';
            onCandidateSelect(binding.variableName, next);
          }}
        >
          <span class="variable-row__toggle-track">
            <span class="variable-row__toggle-thumb" />
          </span>
        </button>
      </label>
    {:else if binding.valueKind === 'boolean'}
      <div class="variable-row__segmented" role="group" aria-label={`${binding.variableName} boolean override`}>
        <button type="button" class:active={binding.rawValue === 'false'} onclick={() => onCandidateSelect(binding.variableName, 'false')}>false</button>
        <button type="button" class:active={binding.rawValue === 'true'} onclick={() => onCandidateSelect(binding.variableName, 'true')}>true</button>
      </div>
    {:else if binding.candidates.length > 0}
      <label class="variable-row__candidate">
        <span>candidate</span>
        <span class="variable-row__select" aria-label={`${binding.variableName} candidates`}>
          <select
            value={getSelectedCandidateValue()}
            onchange={handleCandidateChange}
          >
            <option value={CUSTOM_VALUE_OPTION}>-- select --</option>
            {#each binding.candidates as candidate}
              <option value={getCandidateOptionValue(candidate)} class:is-sentinel={isNullTestSentinel(candidate.value)}>{candidate.label}</option>
            {/each}
          </select>
        </span>
      </label>
    {/if}

    <label class="variable-row__raw">
      <span>raw value</span>
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
