<!--
  Marker Editor image selection controls.
  @file packages/webview/src/lib/components/editor/marker/ImagePicker.svelte
-->

<script lang="ts">
  import type { MarkerEditorSelectImageMessage } from '../../../types';
  import type { MarkerEditorMode } from '../../../types/markerEditor';
  import { getVsCodeApi } from '../../../vscode';
  import { createMarkerEditorSelectImageMessage } from '../../../vscode/markerEditorMessages';

  type MarkerEditorVsCodeApi = {
    postMessage(message: MarkerEditorSelectImageMessage): void;
  };

  export let imagePath: string | null = null;
  export let imageUri: string | null = null;
  export let markerUri: string;
  export let rootUri: string;
  export let mode: MarkerEditorMode;

  /**
   * selectImage 함수.
   * Extension host에 marker/root/mode 기준 image 선택 요청을 보냄.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this image selection helper.
  function selectImage(): void {
    const vscodeApi = getVsCodeApi() as MarkerEditorVsCodeApi | undefined;

    vscodeApi?.postMessage(
      createMarkerEditorSelectImageMessage({
        markerUri,
        rootUri,
        mode,
      }),
    );
  }

  /**
   * removeImage 함수.
   * Svelte binding으로 연결된 image path와 preview URI를 빈 상태로 되돌림.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this image removal helper.
  function removeImage(): void {
    imagePath = null;
    imageUri = null;
  }
</script>

<section class="image-picker" aria-labelledby="image-picker-label">
  <span id="image-picker-label" class="image-picker__label">Image</span>

  <div class="image-picker__row">
    {#if imageUri}
      <div class="image-picker__preview">
        <img src={imageUri} alt="Selected marker preview" />
      </div>
    {:else}
      <div class="image-picker__placeholder" aria-label="No image selected">
        <span class="image-picker__placeholder-text">No image</span>
      </div>
    {/if}

    <div class="image-picker__actions">
      <button type="button" class="button-secondary" onclick={selectImage}>Select Image</button>
      {#if imagePath}
        <button type="button" class="button-secondary" onclick={removeImage}>Remove</button>
      {/if}
    </div>
  </div>

  {#if imagePath}
    <p class="image-picker__path">{imagePath}</p>
  {:else}
    <p class="image-picker__path image-picker__path--empty">No image set</p>
  {/if}
</section>
