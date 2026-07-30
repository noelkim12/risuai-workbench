<!--
  Monaco-backed editor for the lorebook CONTENT section.
  @file packages/webview/src/lib/components/editor/lorebook/LorebookContentEditor.svelte
-->

<script lang="ts">
  import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
  import { onDestroy, onMount } from 'svelte';
  import { getMainEditorChangeEndPosition, registerMainEditorCbsRootCompletionProvider, shouldTriggerMainEditorCbsSuggestForChange, triggerMainEditorCbsSuggest } from '../../../monaco/mainEditorCbsAutoSuggest';
  import { MAIN_EDITOR_CBS_LANGUAGE_ID, retainMainEditorCbsLanguage } from '../../../monaco/mainEditorCbsLanguage';
  import { registerMainEditorLorebookDecoratorCompletionProvider, shouldTriggerMainEditorLorebookDecoratorSuggestForChange } from '../../../monaco/mainEditorLorebookDecoratorAutoSuggest';
  import type { MainEditorMonacoLspClient } from '../../../monaco/mainEditorLspClient';
  import type { MainEditorContentVersionCounter, MainEditorSectionController } from '../../../monaco/mainEditorSectionController';
  import { createMainEditorContentVersionCounter, createMainEditorSectionController } from '../../../monaco/mainEditorSectionController';
  import type { MainEditorDiagnosticMarkerPayload } from '../../../types/mainEditor';
  import type { AdvancedLspRequestController } from '../lsp/advancedLspBridge';
  import { registerAdvancedLspProviders } from '../lsp/advancedLspBridge';
  import type { CbsSnippetVariant } from './lorebookAuthoringTypes';

  export let documentUri: string;
  export let formatKind: 'lorebook' | 'text';
  export let sectionName: 'CONTENT' | 'TEXT';
  export let enableDecoratorCompletion: boolean;
  export let documentVersion: number;
  export let contentVersion: number;
  export let contentText: string;
  export let diagnosticsMarkers: MainEditorDiagnosticMarkerPayload[] = [];
  export let pendingSnippet: CbsSnippetVariant | undefined;
  export let lspClient: MainEditorMonacoLspClient | undefined;
  export let advancedLspController: AdvancedLspRequestController | undefined;
  export let onStatus: (message: string) => void = () => undefined;
  export let onChange: (contentText: string) => void;
  export let onContentVersionChange: (contentVersion: number) => void;
  export let onSnippetConsumed: () => void;

  const CONTENT_LANGUAGE_ID = MAIN_EDITOR_CBS_LANGUAGE_ID;

  let container: HTMLDivElement;
  let editor: monaco.editor.IStandaloneCodeEditor | undefined;
  let model: monaco.editor.ITextModel | undefined;
  let controller: MainEditorSectionController | undefined;
  let rootCompletionDisposable: monaco.IDisposable | undefined;
  let decoratorCompletionDisposable: monaco.IDisposable | undefined;
  let providerDisposables: monaco.IDisposable[] = [];
  let consumedSnippet: CbsSnippetVariant | undefined;
  const contentVersionCounter: MainEditorContentVersionCounter = createMainEditorContentVersionCounter(contentVersion);
  let pendingSuggestFrame: number | undefined;
  let lastSuggestKey = '';

  onMount(() => {
    controller = createMainEditorSectionController({
      container,
      initialValue: contentText,
      languageId: CONTENT_LANGUAGE_ID,
      modelUri: `${documentUri}#${sectionName}`,
      onChange: (value, event) => {
        onChange(value);
        scheduleCbsAutoSuggest(event.changes);
      },
      onContentVersionChange,
      contentVersionCounter,
      retainLanguage: () => retainMainEditorCbsLanguage(monaco),
    });
    editor = controller.editor;
    model = controller.model;

    rootCompletionDisposable = registerMainEditorCbsRootCompletionProvider(monaco, CONTENT_LANGUAGE_ID);
    decoratorCompletionDisposable = enableDecoratorCompletion
      ? registerMainEditorLorebookDecoratorCompletionProvider(monaco, CONTENT_LANGUAGE_ID)
      : undefined;
    registerProviders();
    applyMarkers();
  });

  onDestroy(() => {
    if (pendingSuggestFrame !== undefined) cancelAnimationFrame(pendingSuggestFrame);
    rootCompletionDisposable?.dispose();
    decoratorCompletionDisposable?.dispose();
    clearMarkers();
    disposeProviders();
    controller?.dispose();
  });

  $: if (contentVersion !== contentVersionCounter.get()) {
    contentVersionCounter.set(contentVersion);
  }

  $: controller?.syncExternalValue(contentText);

  $: if (model && documentVersion >= 0) {
    applyMarkers();
  }

  $: if (model && lspClient) {
    registerProviders();
  }

  $: if (pendingSnippet && pendingSnippet !== consumedSnippet && editor && model) {
    insertSnippet(pendingSnippet);
  }

  /**
   * insertSnippet 함수.
   * Monaco cursor/selection 위치에 side toolbar snippet을 삽입함.
   *
   * @param snippet - 삽입할 CBS snippet variant
   */
  function insertSnippet(snippet: CbsSnippetVariant): void {
    if (!editor || !model) return;

    const selection = editor.getSelection();
    const range = selection ?? editor.getModel()?.getFullModelRange();
    if (!range) return;

    editor.executeEdits('side-toolbar-snippet', [{ range, text: snippet.insertText, forceMoveMarkers: true }]);

    const insertedEnd = model.getOffsetAt(range.getStartPosition()) + snippet.insertText.length;
    const cursorOffset = Math.max(0, insertedEnd + snippet.cursorOffset);
    const cursorPosition = model.getPositionAt(cursorOffset);
    editor.setPosition(cursorPosition);
    editor.focus();
    consumedSnippet = snippet;
    onSnippetConsumed();
  }

  /**
   * registerProviders 함수.
   * CONTENT 전용 Monaco language provider를 bridge client에 등록함.
   */
  function registerProviders(): void {
    if (!lspClient || providerDisposables.length > 0) return;
    providerDisposables = lspClient.register(monaco, CONTENT_LANGUAGE_ID);
    if (advancedLspController && formatKind === 'lorebook' && sectionName === 'CONTENT') {
      providerDisposables.push(
        ...registerAdvancedLspProviders(monaco, advancedLspController, {
          documentUri,
          getDocumentVersion: () => documentVersion,
          getFormatKind: () => formatKind,
          getSectionName: () => sectionName,
          onStatus,
        }),
      );
    }
  }

  /**
   * scheduleCbsAutoSuggest 함수.
   * `{{` 같은 다문자 CBS prefix를 감지해 Monaco suggest widget을 명시적으로 엶.
   *
   * @param changes - Monaco content change 목록
   */
  function scheduleCbsAutoSuggest(changes: readonly monaco.editor.IModelContentChange[]): void {
    const currentModel = model;
    if (!editor || !currentModel) return;
    const triggerChange = changes.find(
      (change) =>
        shouldTriggerMainEditorCbsSuggestForChange(currentModel, change) ||
        (enableDecoratorCompletion && shouldTriggerMainEditorLorebookDecoratorSuggestForChange(currentModel, change)),
    );
    if (!triggerChange) return;

    const position = getMainEditorChangeEndPosition(triggerChange);
    const key = `${contentVersionCounter.get()}:${position.lineNumber}:${position.column}`;
    if (key === lastSuggestKey) return;
    lastSuggestKey = key;
    if (pendingSuggestFrame !== undefined) cancelAnimationFrame(pendingSuggestFrame);
    pendingSuggestFrame = requestAnimationFrame(() => {
      pendingSuggestFrame = undefined;
      const currentPosition = editor?.getPosition();
      if (!currentPosition || currentPosition.lineNumber !== position.lineNumber || currentPosition.column !== position.column) return;
      if (editor) triggerMainEditorCbsSuggest(editor);
    });
  }

  /**
   * disposeProviders 함수.
   * CONTENT provider disposable들을 정리함.
   */
  function disposeProviders(): void {
    for (const disposable of providerDisposables.splice(0)) disposable.dispose();
  }

  /**
   * applyMarkers 함수.
   * extension host diagnostics DTO를 Monaco marker로 변환해 반영함.
   */
  function applyMarkers(): void {
    if (!model) return;
    monaco.editor.setModelMarkers(model, 'cbs-lsp', diagnosticsMarkers.map(toMarkerData));
  }

  /**
   * clearMarkers 함수.
   * CONTENT model marker를 제거함.
   */
  function clearMarkers(): void {
    if (!model) return;
    monaco.editor.setModelMarkers(model, 'cbs-lsp', []);
  }

  function toMarkerData(marker: MainEditorDiagnosticMarkerPayload): monaco.editor.IMarkerData {
    return {
      severity: markerSeverity(marker.severity),
      message: marker.message,
      code: marker.code,
      startLineNumber: marker.range.startLineNumber,
      startColumn: marker.range.startColumn,
      endLineNumber: marker.range.endLineNumber,
      endColumn: marker.range.endColumn,
      source: marker.source,
    };
  }

  function markerSeverity(severity: MainEditorDiagnosticMarkerPayload['severity']): monaco.MarkerSeverity {
    switch (severity) {
      case 'error':
        return monaco.MarkerSeverity.Error;
      case 'warning':
        return monaco.MarkerSeverity.Warning;
      case 'info':
        return monaco.MarkerSeverity.Info;
      case 'hint':
        return monaco.MarkerSeverity.Hint;
    }
    return monaco.MarkerSeverity.Info;
  }
</script>

<div class="lorebook-content-editor" bind:this={container} aria-label={`${formatKind} ${sectionName} editor`}></div>
