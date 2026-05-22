<!--
  Main editor side toolbar for CBS snippets.
  @file packages/webview/src/lib/components/editor/shared/SideToolbar.svelte
-->

<script lang="ts">
  import { CBS_SNIPPET_GROUPS, type CbsSnippetVariant } from '../lorebook/lorebookAuthoringTypes';

  export let disabled = false;
  export let onInsertSnippet: (variant: CbsSnippetVariant) => void;

  let openGroupId: string | undefined;

  /**
   * toggleGroup 함수.
   * snippet group popup을 열거나 닫음.
   *
   * @param groupId - 토글할 snippet group id
   */
  function toggleGroup(groupId: string): void {
    if (disabled) return;
    openGroupId = openGroupId === groupId ? undefined : groupId;
  }

  /**
   * insertVariant 함수.
   * 선택한 snippet을 상위 Monaco editor로 전달함.
   *
   * @param variant - 사용자가 선택한 snippet variant
   */
  function insertVariant(variant: CbsSnippetVariant): void {
    if (disabled) return;
    onInsertSnippet(variant);
    openGroupId = undefined;
  }
</script>

<nav class="main-editor-side-toolbar__content" aria-label="CBS snippet toolbar">
  {#each CBS_SNIPPET_GROUPS as group}
    <div class="main-editor-side-toolbar__group">
      <button type="button" disabled={disabled} aria-expanded={openGroupId === group.id} onclick={() => toggleGroup(group.id)}>
        {group.label}
      </button>
      {#if openGroupId === group.id}
        <div class="main-editor-side-toolbar__popup" role="menu">
          {#each group.variants as variant}
            <button type="button" role="menuitem" onclick={() => insertVariant(variant)}>{variant.label}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>
