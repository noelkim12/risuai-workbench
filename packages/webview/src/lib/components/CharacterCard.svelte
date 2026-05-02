<script lang="ts">
  import type { CharacterBrowserCard } from '../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import StatusBadge from './StatusBadge.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import TagChip from './TagChip.svelte';

  export let card: CharacterBrowserCard;
  export let selected = false;
  export let onSelect: (stableId: string) => void;

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup reads and writes this image fallback state.
  let imageLoadFailed = false;

  $: if (card.imageUri) {
    imageLoadFailed = false;
  }

  /**
   * getSourceIcon 함수.
   * Source format을 카드 제목 앞의 작은 시각 식별자로 변환함.
   *
   * @param format - character source format 값
   * @returns 카드 제목 행에 표시할 unicode icon
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this source icon helper.
  function getSourceIcon(format: CharacterBrowserCard['sourceFormat']): string {
    switch (format) {
      case 'charx':
        return '📦';
      case 'png':
        return '🖼️';
      case 'json':
        return '📄';
      case 'scaffold':
        return '🏗️';
      default:
        return '❓';
    }
  }

  /**
   * getInitials 함수.
   * Image fallback에 표시할 짧은 character initials를 만듦.
   *
   * @param value - initials를 추출할 card name
   * @returns 두 글자 이내의 fallback label
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this fallback label helper.
  function getInitials(value: string): string {
    return (
      value
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'RC'
    );
  }
</script>

<button
  type="button"
  class={`character-card character-card--${card.status}`}
  class:character-card--selected={selected}
  aria-pressed={selected}
  aria-label={`Select ${card.name}`}
  on:click={() => onSelect(card.stableId)}
>
  <span class:thumbnail--fallback={!card.imageUri || imageLoadFailed} class="thumbnail" aria-hidden="true">
    {#if card.imageUri && !imageLoadFailed}
      <img src={card.imageUri} alt="" on:error={() => (imageLoadFailed = true)} />
    {:else}
      <span class="thumbnail__initials">{getInitials(card.name)}</span>
      <span class="thumbnail__hint">No image</span>
    {/if}
  </span>

  <span class="card-body">
    <span class="card-source-icon" aria-hidden="true">{getSourceIcon(card.sourceFormat)}</span>

    <span class="card-title-row">
      <span class="card-title">{card.name}</span>
    </span>

    {#if card.tags.length > 0}
      <span class="chip-row chip-row--tags" aria-label="Character tags">
        {#each card.tags as tag, tagIndex}
          <span class={`tag-chip-frame tag-chip-frame--${tagIndex % 4}`}>
            <TagChip label={tag} />
          </span>
        {/each}
      </span>
    {/if}

    <span class="card-bottom-row" aria-label="Character version and status">
      <span class="card-version">v{card.characterVersion}</span>
      <StatusBadge status={card.status} />
    </span>
  </span>
</button>
