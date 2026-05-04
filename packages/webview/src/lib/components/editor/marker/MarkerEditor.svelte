<!--
  Marker Editor root shell component.
  @file packages/webview/src/lib/components/editor/marker/MarkerEditor.svelte
-->

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    MARKER_EDITOR_PROTOCOL,
    MARKER_EDITOR_PROTOCOL_VERSION,
    type MarkerEditorExtensionMessage,
    type MarkerEditorWebviewMessage,
  } from '../../../types';
  import type {
    CharacterEditFields,
    MarkerEditFields,
    MarkerEditorMode,
    MarkerEditorResetResponsePayload,
    ModuleEditFields,
  } from '../../../types/markerEditor';
  import { getVsCodeApi } from '../../../vscode';
  import { createMarkerEditorResetMessage, createMarkerEditorSaveMessage } from '../../../vscode/markerEditorMessages';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import LivePreview from './LivePreview.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import MarkerForm from './MarkerForm.svelte';

  type MarkerEditorVsCodeApi = {
    postMessage(message: MarkerEditorWebviewMessage): void;
  };

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup reads this init state.
  let initialized = false;
  let mode: MarkerEditorMode = 'character';
  let markerUri = '';
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup passes this URI to MarkerForm.
  let rootUri = '';
  let fields: MarkerEditFields = createEmptyCharacterFields();
  let imageUri: string | null | undefined;
  $: previewImageUri = imageUri ?? undefined;

  onMount(() => {
    window.addEventListener('message', handleMessage);
  });

  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
  });

  /**
   * createEmptyCharacterFields 함수.
   * Init 전 character editor 기본 field 상태를 제공함.
   *
   * @returns 빈 character marker edit fields
   */
  function createEmptyCharacterFields(): CharacterEditFields {
    return {
      name: '',
      creator: '',
      characterVersion: '',
      image: null,
      tags: [],
      utilityBot: false,
      lowLevelAccess: false,
    };
  }

  /**
   * createEmptyModuleFields 함수.
   * Module editor field 교체가 필요할 때 안전한 빈 상태를 제공함.
   *
   * @returns 빈 module marker edit fields
   */
  function createEmptyModuleFields(): ModuleEditFields {
    return {
      name: '',
      description: '',
      namespace: '',
      image: null,
      lowLevelAccess: false,
      hideIcon: false,
    };
  }

  /**
   * handleMessage 함수.
   * Marker editor protocol message만 받아 shell state로 반영함.
   *
   * @param event - extension host에서 전달된 postMessage event
   */
  function handleMessage(event: MessageEvent<unknown>): void {
    const message = event.data;
    if (!isMarkerEditorExtensionMessage(message)) return;

    if (message.type === 'marker-editor/init') {
      mode = message.payload.mode;
      markerUri = message.payload.markerUri;
      rootUri = message.payload.rootUri;
      fields = cloneFields(message.payload.fields);
      imageUri = message.payload.imageUri;
      initialized = true;
      return;
    }

    if (message.type === 'marker-editor/imageSelected') {
      fields = cloneFields({ ...fields, image: message.payload.imagePath });
      imageUri = message.payload.imageUri;
      return;
    }

    if (message.type === 'marker-editor/reset') {
      replaceEditableState(message.payload);
      return;
    }

    if (message.type === 'marker-editor/saved') {
      if (isMarkerEditFields(message.payload.fields)) {
        fields = cloneFields(message.payload.fields);
      }
      if ('imageUri' in message.payload) {
        imageUri = message.payload.imageUri;
      }
      return;
    }

    void message.payload.message;
  }

  /**
   * saveMarker 함수.
   * 현재 shell state를 marker editor save message로 전달함.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup passes this handler to MarkerForm.
  function saveMarker(): void {
    const vscodeApi = getVsCodeApi() as MarkerEditorVsCodeApi | undefined;
    vscodeApi?.postMessage(
      createMarkerEditorSaveMessage({
        markerUri,
        mode,
        fields: cloneFields(fields),
      }),
    );
  }

  /**
   * resetMarker 함수.
   * 현재 marker URI와 mode 기준 reset 요청을 extension host에 전달함.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup passes this handler to MarkerForm.
  function resetMarker(): void {
    const vscodeApi = getVsCodeApi() as MarkerEditorVsCodeApi | undefined;
    vscodeApi?.postMessage(
      createMarkerEditorResetMessage({
        markerUri,
        mode,
      }),
    );
  }

  /**
   * replaceEditableState 함수.
   * Reset 응답의 fields/image URI를 preview 갱신 가능한 새 객체로 교체함.
   *
   * @param payload - extension host reset 응답 payload
   */
  function replaceEditableState(payload: MarkerEditorResetResponsePayload): void {
    fields = cloneFields(payload.fields);
    imageUri = payload.imageUri;
  }

  /**
   * cloneFields 함수.
   * Nested tag 변경과 reset/save 응답이 Svelte 반응성을 잃지 않도록 field 객체를 복제함.
   *
   * @param value - 복제할 marker editor fields
   * @returns preview/form에 전달할 새 field 객체
   */
  function cloneFields(value: MarkerEditFields): MarkerEditFields {
    if (isCharacterEditFields(value)) {
      return {
        ...createEmptyCharacterFields(),
        ...value,
        tags: [...value.tags],
      };
    }

    return {
      ...createEmptyModuleFields(),
      ...value,
    };
  }

  function isMarkerEditorExtensionMessage(message: unknown): message is MarkerEditorExtensionMessage {
    if (!message || typeof message !== 'object') return false;

    const candidate = message as Partial<MarkerEditorExtensionMessage>;
    if (candidate.protocol !== MARKER_EDITOR_PROTOCOL || candidate.version !== MARKER_EDITOR_PROTOCOL_VERSION) {
      return false;
    }

    if (candidate.type === 'marker-editor/init') {
      const payload = candidate.payload;
      return (
        Boolean(payload) &&
        typeof payload?.markerUri === 'string' &&
        typeof payload.rootUri === 'string' &&
        isMarkerEditorMode(payload.mode) &&
        isMarkerEditFields(payload.fields)
      );
    }

    if (candidate.type === 'marker-editor/imageSelected') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.imagePath === 'string';
    }

    if (candidate.type === 'marker-editor/reset') {
      const payload = candidate.payload;
      return Boolean(payload) && isMarkerEditFields(payload?.fields);
    }

    if (candidate.type === 'marker-editor/saved') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.success === 'boolean';
    }

    if (candidate.type === 'marker-editor/error') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.message === 'string';
    }

    return false;
  }

  function isMarkerEditorMode(value: unknown): value is MarkerEditorMode {
    return value === 'character' || value === 'module';
  }

  function isMarkerEditFields(value: unknown): value is MarkerEditFields {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<MarkerEditFields>;
    return typeof candidate.name === 'string' && 'image' in candidate && typeof candidate.lowLevelAccess === 'boolean';
  }

  function isCharacterEditFields(value: MarkerEditFields): value is CharacterEditFields {
    return 'tags' in value;
  }
</script>

{#if !initialized}
  <div class="marker-editor-loading">
    <p>Loading marker editor...</p>
  </div>
{:else}
  <main class="marker-editor-shell" aria-label="Root Marker Editor">
    <LivePreview {mode} {fields} imageUri={previewImageUri} />
    <MarkerForm
      {mode}
      bind:fields
      bind:imageUri
      {markerUri}
      {rootUri}
      onSave={saveMarker}
      onReset={resetMarker}
    />
  </main>
{/if}
