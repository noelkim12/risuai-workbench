<!--
  Marker Editor character tag chip input controls.
  @file packages/webview/src/lib/components/editor/marker/TagsInput.svelte
-->

<script lang="ts">
  export let tags: string[] = [];

  let newTagText = '';

  /**
   * addTag 함수.
   * Draft 값을 trim한 뒤 빈 값과 중복을 제외하고 tags binding에 추가함.
   */
  function addTag(): void {
    const trimmed = newTagText.trim();

    if (!trimmed || tags.includes(trimmed)) {
      return;
    }

    tags = [...tags, trimmed];
    newTagText = '';
  }

  /**
   * removeTag 함수.
   * 클릭한 chip index만 제외한 새 tags 배열을 binding에 할당함.
   *
   * @param tagIndex - 제거할 tag chip의 현재 index
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this tag removal helper.
  function removeTag(tagIndex: number): void {
    tags = tags.filter((_, index) => index !== tagIndex);
  }

  /**
   * handleTagKeydown 함수.
   * Enter 키 입력을 tag 추가 동작으로 변환함.
   *
   * @param event - tags input에서 발생한 keyboard event
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this keyboard handler.
  function handleTagKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    addTag();
  }
</script>

<section class="tags-input" aria-labelledby="tags-input-label">
  <span id="tags-input-label" class="tags-input__label">Tags</span>

  {#if tags.length > 0}
    <div class="tags-input__chip-row" aria-label="Character tags">
      {#each tags as tag, tagIndex}
        <span class="tags-input__chip">
          <span class="tags-input__chip-label">{tag}</span>
          <button
            type="button"
            class="tags-input__chip-remove"
            aria-label={`Remove ${tag} tag`}
            onclick={() => removeTag(tagIndex)}
          >
            ×
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <div class="tags-input__add-row">
    <input
      id="tags-input-field"
      class="tags-input__field"
      type="text"
      bind:value={newTagText}
      onkeydown={handleTagKeydown}
      aria-labelledby="tags-input-label"
      placeholder="Type a tag and press Enter..."
      autocomplete="off"
    />
    <button type="button" class="button-secondary" disabled={!newTagText.trim()} onclick={addTag}>Add</button>
  </div>
</section>
