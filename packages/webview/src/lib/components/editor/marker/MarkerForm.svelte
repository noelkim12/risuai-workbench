<!--
  MarkerForm component.
  Marker editor 우측 패널: 편집 가능한 root marker 필드 목록.
  ImagePicker와 TagsInput을 포함함.
  @file packages/webview/src/lib/components/editor/marker/MarkerForm.svelte
-->

<script lang="ts">
  import type { CharacterEditFields, MarkerEditorMode, ModuleEditFields } from '../../../types/markerEditor';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import ImagePicker from './ImagePicker.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import TagsInput from './TagsInput.svelte';

  export let mode: MarkerEditorMode;
  export let fields: CharacterEditFields | ModuleEditFields;
  export let imageUri: string | null | undefined = undefined;
  export let markerUri: string;
  export let rootUri: string;
  export let onSave: () => void;
  export let onReset: () => void;

  $: isCharacterMode = mode === 'character';
  $: characterFields = isCharacterMode ? (fields as CharacterEditFields) : null;
  $: moduleFields = isCharacterMode ? null : (fields as ModuleEditFields);
</script>

<section class="marker-form" aria-label="Root Marker Editor Form">
  <header class="marker-form__header">
    <h2 class="marker-form__title">{isCharacterMode ? 'Character Root Marker' : 'Module Root Marker'}</h2>
    <p class="marker-form__subtitle">Edit .{isCharacterMode ? 'risuchar' : 'risumodule'} metadata</p>
  </header>

  <div class="marker-form__fields">
    <label class="marker-form__field">
      <span class="marker-form__field-label">Name</span>
      <input type="text" bind:value={fields.name} class="marker-form__input" placeholder="Enter name" autocomplete="off" />
    </label>

    {#if characterFields}
      <label class="marker-form__field">
        <span class="marker-form__field-label">Creator</span>
        <input
          type="text"
          bind:value={characterFields.creator}
          class="marker-form__input"
          placeholder="Enter creator name"
          autocomplete="off"
        />
      </label>

      <label class="marker-form__field">
        <span class="marker-form__field-label">Character Version</span>
        <input
          type="text"
          bind:value={characterFields.characterVersion}
          class="marker-form__input"
          placeholder="e.g. 20260405"
          autocomplete="off"
        />
      </label>
    {/if}

    {#if moduleFields}
      <label class="marker-form__field">
        <span class="marker-form__field-label">Description</span>
        <input
          type="text"
          bind:value={moduleFields.description}
          class="marker-form__input"
          placeholder="Enter description"
          autocomplete="off"
        />
      </label>

      <label class="marker-form__field">
        <span class="marker-form__field-label">Namespace</span>
        <input
          type="text"
          bind:value={moduleFields.namespace}
          class="marker-form__input"
          placeholder="Enter namespace"
          autocomplete="off"
        />
      </label>
    {/if}

    <ImagePicker bind:imagePath={fields.image} bind:imageUri {markerUri} {rootUri} {mode} />

    {#if characterFields}
      <TagsInput bind:tags={characterFields.tags} />

      <label class="marker-form__field marker-form__field--toggle">
        <span class="marker-form__field-label">Utility Bot</span>
        <input type="checkbox" role="switch" bind:checked={characterFields.utilityBot} class="marker-form__toggle" />
        <span class="marker-form__switch" aria-hidden="true">
          <span class="marker-form__switch-thumb"></span>
        </span>
        <span class="marker-form__toggle-label">{characterFields.utilityBot ? 'On' : 'Off'}</span>
      </label>
    {/if}

    <label class="marker-form__field marker-form__field--toggle">
      <span class="marker-form__field-label">Low Level Access</span>
      <input type="checkbox" role="switch" bind:checked={fields.lowLevelAccess} class="marker-form__toggle" />
      <span class="marker-form__switch" aria-hidden="true">
        <span class="marker-form__switch-thumb"></span>
      </span>
      <span class="marker-form__toggle-label">{fields.lowLevelAccess ? 'On' : 'Off'}</span>
    </label>

    {#if moduleFields}
      <label class="marker-form__field marker-form__field--toggle">
        <span class="marker-form__field-label">Hide Icon</span>
        <input type="checkbox" role="switch" bind:checked={moduleFields.hideIcon} class="marker-form__toggle" />
        <span class="marker-form__switch" aria-hidden="true">
          <span class="marker-form__switch-thumb"></span>
        </span>
        <span class="marker-form__toggle-label">{moduleFields.hideIcon ? 'On' : 'Off'}</span>
      </label>
    {/if}
  </div>

  <footer class="marker-form__actions">
    <!-- <button type="button" class="button-secondary" onclick={onReset}>Reset</button> -->
    <button type="button" onclick={onSave}>Save Marker</button>
  </footer>
</section>
