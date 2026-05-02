<script lang="ts">
  import type { CharacterItem, CharacterSection } from '../../types';

  export let sections: CharacterSection[];
  export let expandedSectionIds: string[];
  export let onToggleSection: (sectionId: string) => void;
  export let onOpenItem: (item: CharacterItem) => void;
</script>

<section class="accordion" aria-label="Character detail sections">
  {#each sections as section (section.id)}
    {@const expanded = expandedSectionIds.includes(section.id)}
    <article class="accordion__section" class:accordion__section--direct={section.kind === 'lua'}>
      {#if section.kind === 'lua'}
        <div class="accordion__direct-heading" aria-label={`${section.label} section`}>
          <span>{section.label}</span>
          <span class="accordion__count">{section.count}</span>
        </div>
        <div id={`section-${section.id}`} class="accordion__panel">
          {#if section.items.length === 0}
            <p class="accordion__empty">No related items found.</p>
          {:else}
            <ul class="item-list">
              {#each section.items as item (item.id)}
                <li>
                  <button
                    type="button"
                    class="item-button"
                    class:item-button--static={!item.fileUri}
                    disabled={!item.fileUri}
                    title={item.relativePath ?? item.label}
                    onclick={() => onOpenItem(item)}
                  >
                    <span class={`item-button__type item-button__type--${item.type}`}>{item.type}</span>
                    <span class="item-button__copy">
                      <span class="item-button__label">{item.label}</span>
                      {#if item.relativePath}
                        <span class="item-button__path">{item.relativePath}</span>
                      {/if}
                      {#if item.description}
                        <span class="item-button__description">{item.description}</span>
                      {/if}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else}
        <button
          type="button"
          class="accordion__header"
          aria-expanded={expanded}
          aria-controls={`section-${section.id}`}
          onclick={() => onToggleSection(section.id)}
        >
          <span>{section.label}</span>
          <span class="accordion__count">{section.count}</span>
        </button>

        {#if expanded}
          <div id={`section-${section.id}`} class="accordion__panel">
            {#if section.items.length === 0}
              <p class="accordion__empty">No related items found.</p>
            {:else}
              <ul class="item-list">
                {#each section.items as item (item.id)}
                  <li>
                    <button
                      type="button"
                      class="item-button"
                      class:item-button--static={!item.fileUri}
                      disabled={!item.fileUri}
                      title={item.relativePath ?? item.label}
                      onclick={() => onOpenItem(item)}
                    >
                      <span class={`item-button__type item-button__type--${item.type}`}>{item.type}</span>
                      <span class="item-button__copy">
                        <span class="item-button__label">{item.label}</span>
                        {#if item.relativePath}
                          <span class="item-button__path">{item.relativePath}</span>
                        {/if}
                        {#if item.description}
                          <span class="item-button__description">{item.description}</span>
                        {/if}
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      {/if}
    </article>
  {/each}
</section>
