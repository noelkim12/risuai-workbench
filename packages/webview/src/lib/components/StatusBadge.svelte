<script lang="ts">
  import type { CharacterBrowserStatus } from '../types';

  export let status: CharacterBrowserStatus;

  /**
   * getStatusLabel 함수.
   * Browser status를 카드 하단에 표시할 짧은 상태명으로 변환함.
   *
   * @param value - character browser status 값
   * @returns status badge에 표시할 label
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this status label helper.
  function getStatusLabel(value: CharacterBrowserStatus): string {
    return value === 'ready' ? 'Active' : 'Inactive';
  }
</script>

<span class={`status status--${status}`}>{getStatusLabel(status)}</span>
