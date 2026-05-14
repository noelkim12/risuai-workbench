<!--
  Main Editor Phase 1 raw source shell component.
  @file packages/webview/src/lib/components/editor/main/MainEditor.svelte
-->

<script lang="ts">
  import type { HtmlEditorState, LorebookEditorState, PromptEditorState, RegexEditorState } from 'risu-workbench-core';
  import { onDestroy, onMount } from 'svelte';
  import HtmlRenderedPreview from '../html/HtmlRenderedPreview.svelte';
  import HtmlSourceEditor from '../html/HtmlSourceEditor.svelte';
  import { createAdvancedLspRequestController, normalizeWorkspaceSymbolQuery, type AdvancedLspRequestController } from '../lsp/advancedLspBridge';
  import LorebookContentEditor from '../lorebook/LorebookContentEditor.svelte';
  import LorebookFrontmatter from '../lorebook/LorebookFrontmatter.svelte';
  import type { CbsSnippetVariant } from '../lorebook/lorebookAuthoringTypes';
  import PromptFrontmatter from '../prompt/PromptFrontmatter.svelte';
  import PromptSectionEditor from '../prompt/PromptSectionEditor.svelte';
  import RegexFrontmatter from '../regex/RegexFrontmatter.svelte';
  import RegexSplitEditor from '../regex/RegexSplitEditor.svelte';
  import SimulatorResultPanel from '../simulator/SimulatorResultPanel.svelte';
  import PreviewPanel from './PreviewPanel.svelte';
  import SideToolbar from '../shared/SideToolbar.svelte';
  import SplitPane from '../shared/SplitPane.svelte';
  import VariableDrawer from '../variables/VariableDrawer.svelte';
  import VariableRail from '../variables/VariableRail.svelte';
  import { createFallbackGetvarBindings, dedupeVariableBindings, mergeCandidateLists, toOverridePatch } from '../variables/variableDrawerTypes';
  import {
    MAIN_EDITOR_PROTOCOL,
    MAIN_EDITOR_PROTOCOL_VERSION,
    type MainEditorExtensionMessage,
    type MainEditorWebviewMessage,
  } from '../../../types';
  import type {
    MainEditorDiagnosticMarkerPayload,
    MainEditorDocumentModelPayload,
    MainEditorFormatPreviewResultPayload,
    MainEditorFormatKind,
    MainEditorHtmlStructuredStatePayload,
    MainEditorFormatSectionName,
    MainEditorPreferenceState,
    MainEditorPreviewResultPayload,
    MainEditorPreviewRuntimeResultPayload,
    MainEditorPromptStructuredStatePayload,
    MainEditorRegexStructuredStatePayload,
    MainEditorSimulatorProfilePayload,
    MainEditorVariableBindingPayload,
    MainEditorVariableOverridesPayload,
    MainEditorWorkspaceSymbolPayload,
  } from '../../../types/mainEditor';
  import { createMainEditorMonacoLspClient, type MainEditorMonacoLspClient } from '../../../monaco/mainEditorLspClient';
  import { getVsCodeApi, type VsCodeApi } from '../../../vscode';
  import {
    createMainEditorEditMessage,
    createMainEditorFormatPreviewRequestMessage,
    createMainEditorLspRevealLocationMessage,
    createMainEditorPreviewRequestMessage,
    createMainEditorPreviewRuntimeRequestMessage,
    createMainEditorReadyMessage,
    createMainEditorSimulatorProfileListRequestMessage,
    createMainEditorSimulatorProfileSaveRequestMessage,
    createMainEditorStructuredEditMessage,
    createMainEditorUpdatePreferencesMessage,
    createMainEditorVariableCandidatesRequestMessage,
  } from '../../../vscode/mainEditorMessages';
  import {
    applyEditAcknowledgement,
    applyEditError,
    applyExternalCanonicalSnapshot,
    createInitialDraftSyncState,
    hasLocalStructuredDraft,
    markRawEditSent,
    markStructuredEditSent,
    queueStructuredEdit,
    type MainEditorDraftSyncState,
  } from './mainEditorDraftSync';

  const EDIT_DEBOUNCE_MS = 350;
  const PREVIEW_DEBOUNCE_MS = 160;
  const RUNTIME_PREVIEW_DEBOUNCE_MS = 520;

  type MainEditorStructuredState = LorebookEditorState | RegexEditorState | PromptEditorState | HtmlEditorState;
  type MainEditorLocalDraftSyncState = MainEditorDraftSyncState<MainEditorStructuredState>;

  let initialized = false;
  let documentUri = '';
  let documentDisplayPath = '';
  let documentVersion = 0;
  let formatKind: MainEditorFormatKind = 'lorebook';
  let rawText = '';
  let draftText = '';
  let model: MainEditorDocumentModelPayload | undefined;
  let status = 'Connecting to extension host...';
  let preferences: MainEditorPreferenceState = {
    splitRatio: 0.58,
    frontmatterOpen: true,
    drawerOpen: false,
  };
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingRequestId: string | undefined;
  let pendingRequestKind: 'raw' | 'structured' | undefined;
  let pendingSentText: string | undefined;
  let pendingStructuredState: MainEditorStructuredState | undefined;
  let queuedStructuredState: MainEditorStructuredState | undefined;
  let pendingSnippet: CbsSnippetVariant | undefined;
  let contentVersion = 0;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let latestPreviewRequestId: string | undefined;
  let previewPending = false;
  let previewResult: MainEditorPreviewResultPayload | MainEditorPreviewRuntimeResultPayload | null = null;
  let formatPreviewResult: MainEditorFormatPreviewResultPayload | null = null;
  let formatPreviewRequestId: string | undefined;
  let runtimePreviewRequestId: string | undefined;
  let runtimePreviewPending = false;
  let runtimePreviewBindings: MainEditorVariableBindingPayload[] = [];
  let runtimePreviewFallbackBindings: MainEditorVariableBindingPayload[] = [];
  let variableOverrides: MainEditorVariableOverridesPayload = {};
  let runtimePreviewTimer: ReturnType<typeof setTimeout> | undefined;
  let resultTab: 'preview' | 'simulator' = 'preview';
  let diagnosticsMarkers: MainEditorDiagnosticMarkerPayload[] = [];
  let activeLspClient: MainEditorMonacoLspClient | undefined;
  let activeAdvancedLspController: AdvancedLspRequestController | undefined;
  let lspClientDocumentUri: string | undefined;
  let workspaceSymbolQuery = '';
  let workspaceSymbolTimer: ReturnType<typeof setTimeout> | undefined;
  let workspaceSymbolPending = false;
  let workspaceSymbols: MainEditorWorkspaceSymbolPayload[] = [];
  let regexSampleInput = '';
  let promptActiveSection: 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT' = 'TEXT';
  let promptSectionDrafts: Partial<Record<'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT', string>> = {};
  let simulatorProfiles: MainEditorSimulatorProfilePayload[] = [createDefaultSimulatorProfilePayload()];
  let activeProfileId = 'default';
  let profileDraft: MainEditorSimulatorProfilePayload = createDefaultSimulatorProfilePayload();
  let simulatorProfileEditorOpen = false;
  let simulatorProfilePending = false;
  let simulatorProfileStatus = 'Profiles not loaded yet.';
  let latestProfileListRequestId: string | undefined;
  let latestProfileSaveRequestId: string | undefined;
  let readyRetryTimer: ReturnType<typeof setInterval> | undefined;

  $: lorebookState = getLorebookEditorState(model, formatKind);
  $: regexState = getRegexEditorState(model, formatKind);
  $: promptState = getPromptEditorState(model, formatKind);
  $: htmlState = getHtmlEditorState(model, formatKind);
  $: isLorebookAuthoring = Boolean(lorebookState);
  $: isStructuredAuthoring = Boolean(lorebookState || regexState || promptState || htmlState);
  $: activeSimulatorProfile = simulatorProfiles.find((profile) => profile.id === activeProfileId) ?? simulatorProfiles[0];
  $: profileLabel = activeSimulatorProfile?.name ?? 'Default';
  $: profileSummary = buildSimulatorProfileSummary(activeSimulatorProfile);

  onMount(() => {
    window.addEventListener('message', handleMessage);
    announceMainEditorReady();
    readyRetryTimer = setInterval(() => {
      if (initialized) {
        stopReadyRetry();
        return;
      }
      announceMainEditorReady();
    }, 500);
  });

  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
    stopReadyRetry();
    if (pendingTimer) clearTimeout(pendingTimer);
    if (previewTimer) clearTimeout(previewTimer);
    if (runtimePreviewTimer) clearTimeout(runtimePreviewTimer);
    if (workspaceSymbolTimer) clearTimeout(workspaceSymbolTimer);
    activeLspClient?.dispose();
    activeAdvancedLspController?.dispose();
  });

  /**
   * handleMessage 함수.
   * extension host에서 온 init/sync/edit result message를 local shell state에 반영함.
   *
   * @param event - browser message event
   */
  function handleMessage(event: MessageEvent<unknown>): void {
    const message = event.data;
    if (!isMainEditorExtensionMessage(message)) return;

    if (activeLspClient?.handleMessage(message)) return;
    if (activeAdvancedLspController?.handleExtensionMessage(message)) return;

    if (message.type === 'main-editor/init') {
      stopReadyRetry();
      documentUri = message.payload.documentUri;
      documentDisplayPath = message.payload.documentDisplayPath;
      documentVersion = message.payload.documentVersion;
      formatKind = message.payload.formatKind;
      rawText = message.payload.rawText;
      draftText = message.payload.rawText;
      applyDraftSyncState(createInitialDraftSyncState(message.payload.rawText, message.payload.documentVersion));
      model = message.payload.model;
      preferences = message.payload.preferences;
      contentVersion = 0;
      diagnosticsMarkers = [];
      previewResult = null;
      formatPreviewResult = null;
      previewPending = false;
      resetRuntimePreviewState();
      initialized = true;
      status = `Loaded ${formatKind} document v${documentVersion}.`;
      resetLspClient();
      requestSimulatorProfiles();
      if (formatKind === 'lorebook' && isLorebookEditorState(message.payload.model.state)) {
        schedulePreview(message.payload.model.state.contentText);
        scheduleRuntimePreview(message.payload.model.state.contentText);
      } else if (message.payload.formatKind === 'regex' && isRegexEditorState(message.payload.model.state)) {
        scheduleFormatPreview('IN', message.payload.model.state);
      } else if (message.payload.formatKind === 'prompt' && isPromptEditorState(message.payload.model.state)) {
        promptSectionDrafts = { ...message.payload.model.state.sections };
        scheduleFormatPreview(promptActiveSection, message.payload.model.state);
      } else if (message.payload.formatKind === 'html' && isHtmlEditorState(message.payload.model.state)) {
        scheduleFormatPreview('FULL', message.payload.model.state);
      }
      return;
    }

    if (message.type === 'main-editor/documentChanged') {
      const documentChanged = message.payload.documentUri !== documentUri || message.payload.formatKind !== formatKind;
      model = createCanonicalModelForLocalDraft(message.payload.model, documentChanged);
      applyCanonicalSnapshot(message.payload);
      if (documentChanged) {
        diagnosticsMarkers = [];
        latestPreviewRequestId = undefined;
        previewPending = false;
        formatPreviewResult = null;
        resetRuntimePreviewState();
      }
      return;
    }

    if (message.type === 'main-editor/diagnosticsUpdate') {
      if (message.payload.documentUri === documentUri && message.payload.documentVersion === documentVersion && message.payload.sectionName === 'CONTENT') {
        diagnosticsMarkers = message.payload.markers;
      }
      return;
    }

    if (message.type === 'main-editor/previewRuntimeResult') {
      if (
        message.payload.requestId === runtimePreviewRequestId &&
        message.payload.documentUri === documentUri &&
        message.payload.formatKind === formatKind &&
        message.payload.sectionName === 'CONTENT' &&
        message.payload.contentVersion >= contentVersion
      ) {
        runtimePreviewPending = false;
        const nextBindings = message.payload.bindings.length > 0 ? message.payload.bindings : runtimePreviewFallbackBindings;
        runtimePreviewBindings = applyOverridesToBindings(nextBindings);
        previewResult = { ...message.payload, bindings: runtimePreviewBindings };
        status = `Runtime preview ${message.payload.status} · ${message.payload.coverageSummary}`;
      }
      return;
    }

    if (message.type === 'main-editor/variableCandidatesResult') {
      if (message.payload.stale) return;
      if (message.payload.documentUri !== documentUri) return;
      if (message.payload.documentVersion !== documentVersion) return;
      if (message.payload.contentVersion < contentVersion) return;
      runtimePreviewBindings = runtimePreviewBindings.map((binding) => ({
        ...binding,
        candidates: mergeCandidateLists([
          ...binding.candidates,
          ...(message.payload.candidatesByVariable[binding.variableName] ?? []),
        ]),
      }));
      if (isRuntimePreviewResult(previewResult)) {
        previewResult = { ...previewResult, bindings: runtimePreviewBindings };
      }
      return;
    }

    if (message.type === 'main-editor/previewResult') {
      if (
        message.payload.requestId === latestPreviewRequestId &&
        message.payload.documentUri === documentUri &&
        message.payload.formatKind === formatKind &&
        message.payload.sectionName === 'CONTENT' &&
        message.payload.contentVersion >= contentVersion
      ) {
        if (!previewResult) previewResult = message.payload;
        previewPending = false;
      }
      return;
    }

    if (message.type === 'main-editor/formatPreviewResult') {
      if (
        message.payload.requestId === formatPreviewRequestId &&
        message.payload.documentUri === documentUri &&
        message.payload.formatKind === formatKind
      ) {
        formatPreviewResult = message.payload;
        previewPending = false;
      }
      return;
    }

    if (message.type === 'main-editor/simulatorProfileListResult') {
      if (message.payload.requestId !== latestProfileListRequestId || message.payload.documentUri !== documentUri) return;
      simulatorProfiles = message.payload.profiles.length > 0 ? message.payload.profiles : [createDefaultSimulatorProfilePayload()];
      activeProfileId = message.payload.activeProfileId;
      profileDraft = cloneSimulatorProfilePayload(simulatorProfiles.find((profile) => profile.id === activeProfileId) ?? simulatorProfiles[0]);
      simulatorProfilePending = false;
      simulatorProfileStatus = `Loaded ${simulatorProfiles.length} profile(s).`;
      rescheduleActiveFormatPreview();
      return;
    }

    if (message.type === 'main-editor/simulatorProfileSaveResult') {
      if (message.payload.requestId !== latestProfileSaveRequestId || message.payload.documentUri !== documentUri) return;
      simulatorProfilePending = false;
      simulatorProfileStatus = message.payload.status === 'ok' ? 'Profile saved.' : (message.payload.message ?? 'Profile save failed.');
      if (message.payload.status === 'ok') {
        simulatorProfiles = upsertSimulatorProfile(simulatorProfiles, message.payload.profile);
        activeProfileId = message.payload.activeProfileId;
        profileDraft = cloneSimulatorProfilePayload(message.payload.profile);
        rescheduleActiveFormatPreview();
      }
      return;
    }

    if (message.type === 'main-editor/editApplied') {
      diagnosticsMarkers = [];
      const nextDraftSync = applyEditAcknowledgement(createDraftSyncState(), message.payload);
      const nextQueuedStructuredState = nextDraftSync.queuedStructuredState;
      applyDraftSyncState(nextDraftSync);
      if (nextDraftSync.shouldSendQueuedStructuredEdit && nextQueuedStructuredState) scheduleStructuredEdit(nextQueuedStructuredState);
      else if (nextDraftSync.shouldRescheduleRawEdit) scheduleEdit();
      return;
    }

    if (message.type === 'main-editor/error') {
      applyDraftSyncState(applyEditError(createDraftSyncState(), message.payload));
    }
  }

  /**
   * announceMainEditorReady 함수.
   * host init을 받을 때까지 main editor webview 준비 상태를 반복 알림.
   */
  function announceMainEditorReady(): void {
    getTypedVsCodeApi()?.postMessage(createMainEditorReadyMessage(documentUri));
  }

  /**
   * stopReadyRetry 함수.
   * init 수신 또는 unmount 시 ready retry timer를 정리함.
   */
  function stopReadyRetry(): void {
    if (!readyRetryTimer) return;
    clearInterval(readyRetryTimer);
    readyRetryTimer = undefined;
  }

  /**
   * applyCanonicalSnapshot 함수.
   * host canonical snapshot을 반영하되 pending 중인 local draft는 덮어쓰지 않음.
   *
   * @param snapshot - extension host가 보낸 최신 TextDocument snapshot
   */
  function applyCanonicalSnapshot(snapshot: Extract<MainEditorExtensionMessage, { type: 'main-editor/documentChanged' }>['payload']): void {
    documentUri = snapshot.documentUri;
    documentDisplayPath = snapshot.documentDisplayPath;
    formatKind = snapshot.formatKind;
    resetLspClient();
    const nextDraftSync = applyExternalCanonicalSnapshot(createDraftSyncState(), {
      rawText: snapshot.rawText,
      documentVersion: snapshot.documentVersion,
    });
    applyDraftSyncState(nextDraftSync);
    if (nextDraftSync.shouldRescheduleRawEdit) scheduleEdit();
  }

  /**
   * createCanonicalModelForLocalDraft 함수.
   * pending structured edit 중에는 host echo snapshot이 최신 Monaco draft를 덮지 않게 함.
   *
   * @param snapshotModel - extension host가 방금 파싱한 canonical model
   * @param documentChanged - 다른 문서/포맷으로 전환됐는지 여부
   * @returns webview state에 반영할 model payload
   */
  function createCanonicalModelForLocalDraft(
    snapshotModel: MainEditorDocumentModelPayload,
    documentChanged: boolean,
  ): MainEditorDocumentModelPayload {
    if (documentChanged || !model || model.formatKind !== snapshotModel.formatKind) return snapshotModel;
    if (!hasLocalStructuredDraft(createDraftSyncState())) return snapshotModel;
    return { ...snapshotModel, state: model.state };
  }

  /**
   * handleRawInput 함수.
   * textarea input event를 draft text로 반영하고 debounced edit request를 예약함.
   *
   * @param event - textarea input event
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this textarea input handler.
  function handleRawInput(event: Event): void {
    const textarea = event.currentTarget as HTMLTextAreaElement;
    draftText = textarea.value;
    scheduleEdit();
  }

  /**
   * scheduleEdit 함수.
   * 현재 draft를 document version과 함께 extension host로 debounce 전송함.
   */
  function scheduleEdit(): void {
    if (!initialized || draftText === rawText) return;
    if (pendingTimer) clearTimeout(pendingTimer);
    if (pendingRequestId) {
      status = `Waiting for edit ${pendingRequestId} before sending newer draft.`;
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingTimer = setTimeout(() => {
      const baseVersion = documentVersion;
      pendingTimer = undefined;
      const nextDraftSync = markRawEditSent(createDraftSyncState(), {
        requestId,
        sentText: draftText,
        draftText,
      });
      applyDraftSyncState(nextDraftSync);
      getTypedVsCodeApi()?.postMessage(
        createMainEditorEditMessage({
          requestId,
          documentUri,
          baseVersion,
          nextText: nextDraftSync.pendingSentText ?? draftText,
        }),
      );
      status = `Sending edit request based on v${baseVersion}.`;
    }, EDIT_DEBOUNCE_MS);
  }

  /**
   * updateLorebookState 함수.
   * lorebook authoring UI state를 panel-local model에 반영하고 structured edit을 예약함.
   *
   * @param nextState - extension host에 보낼 다음 lorebook structured state
   */
  function updateLorebookState(nextState: LorebookEditorState): void {
    if (!model || model.formatKind !== 'lorebook') return;
    model = { ...model, state: nextState };
    scheduleStructuredEdit(nextState);
  }

  function updateRegexState(nextState: RegexEditorState): void {
    if (!model || model.formatKind !== 'regex') return;
    model = { ...model, state: nextState };
    scheduleFormatPreview('IN', nextState);
    scheduleStructuredEdit(nextState);
  }

  function updateRegexSampleInput(sampleInput: string): void {
    regexSampleInput = sampleInput;
    if (regexState) scheduleFormatPreview('IN', regexState);
  }

  function updatePromptState(nextState: PromptEditorState): void {
    if (!model || model.formatKind !== 'prompt') return;
    const allowedSections = getAllowedPromptSections(nextState.type);
    promptSectionDrafts = { ...promptSectionDrafts, ...nextState.sections };
    const filteredSections = filterPromptSections(promptSectionDrafts, allowedSections);
    const canonicalState = { ...nextState, sections: filteredSections };
    model = { ...model, state: canonicalState };
    scheduleFormatPreview(resolvePromptPreviewSection(canonicalState), canonicalState);
    scheduleStructuredEdit(canonicalState);
  }

  function updatePromptSection(section: 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT', value: string): void {
    if (!promptState) return;
    promptSectionDrafts = { ...promptSectionDrafts, [section]: value };
    updatePromptState({ ...promptState, sections: { ...promptState.sections, [section]: value } });
  }

  function updatePromptActiveSection(section: 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT'): void {
    promptActiveSection = section;
    if (promptState) scheduleFormatPreview(section, promptState);
  }

  function updateHtmlState(nextState: HtmlEditorState): void {
    if (!model || model.formatKind !== 'html') return;
    model = { ...model, state: nextState };
    scheduleFormatPreview('FULL', nextState);
    scheduleStructuredEdit(nextState);
  }

  /**
   * updateLorebookContent 함수.
   * Monaco CONTENT 변경을 lorebook structured state에 반영함.
   *
   * @param contentText - Monaco editor의 다음 CONTENT 원문
   */
  function updateLorebookContent(contentText: string): void {
    if (!lorebookState) return;
    if (!previewResult) schedulePreview(contentText);
    scheduleRuntimePreview(contentText);
    updateLorebookState({ ...lorebookState, contentText });
  }

  /**
   * updateContentVersion 함수.
   * Monaco CONTENT model의 local version을 갱신함.
   *
   * @param nextContentVersion - CONTENT editor local version
   */
  function updateContentVersion(nextContentVersion: number): void {
    contentVersion = nextContentVersion;
  }

  /**
   * schedulePreview 함수.
   * CONTENT draft를 짧은 debounce로 quick preview bridge에 요청함.
   *
   * @param contentText - preview할 최신 CONTENT draft
   */
  function schedulePreview(contentText: string): void {
    if (!initialized || formatKind !== 'lorebook') return;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = undefined;
      const requestId = `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      latestPreviewRequestId = requestId;
      previewPending = true;
      getTypedVsCodeApi()?.postMessage(
        createMainEditorPreviewRequestMessage({
          requestId,
          documentUri,
          documentVersion,
          contentVersion,
          formatKind: 'lorebook',
          sectionName: 'CONTENT',
          contentText,
        }),
      );
    }, PREVIEW_DEBOUNCE_MS);
  }

  /**
   * scheduleRuntimePreview 함수.
   * CONTENT draft와 preview-only override를 runtime preview bridge에 debounce 전송함.
   *
   * @param contentText - preview할 최신 CONTENT draft
   */
  function scheduleRuntimePreview(contentText: string): void {
    if (!initialized || formatKind !== 'lorebook') return;
    if (runtimePreviewTimer) clearTimeout(runtimePreviewTimer);
    runtimePreviewTimer = setTimeout(() => {
      runtimePreviewTimer = undefined;
      const requestId = `runtime-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      runtimePreviewRequestId = requestId;
      runtimePreviewPending = true;
      runtimePreviewFallbackBindings = createFallbackGetvarBindings(contentText);
      if (runtimePreviewFallbackBindings.length > 0 && runtimePreviewBindings.length === 0) {
        runtimePreviewBindings = applyOverridesToBindings(runtimePreviewFallbackBindings);
      }
      getTypedVsCodeApi()?.postMessage(
        createMainEditorPreviewRuntimeRequestMessage({
          requestId,
          documentUri,
          documentVersion,
          contentVersion,
          formatKind: 'lorebook',
          sectionName: 'CONTENT',
          contentText,
          overrides: variableOverrides,
          profileId: activeProfileId,
        }),
      );
    }, RUNTIME_PREVIEW_DEBOUNCE_MS);
  }

  function scheduleFormatPreview(sectionName: MainEditorFormatSectionName, state: RegexEditorState | PromptEditorState | HtmlEditorState): void {
    if (!initialized || formatKind === 'lorebook') return;
    const structuredState = toFormatPreviewState(formatKind, state);
    if (!structuredState) return;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = undefined;
      const requestId = `format-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      formatPreviewRequestId = requestId;
      previewPending = true;
      getTypedVsCodeApi()?.postMessage(
        createMainEditorFormatPreviewRequestMessage({
          requestId,
          documentUri,
          documentVersion,
          formatKind: formatKind === 'regex' || formatKind === 'prompt' || formatKind === 'html' ? formatKind : 'regex',
          sectionName,
          activeProfileId,
          sampleInput: formatKind === 'regex' ? regexSampleInput : undefined,
          profile: activeSimulatorProfile,
          state: structuredState,
        }),
      );
    }, PREVIEW_DEBOUNCE_MS);
  }

  function toFormatPreviewState(
    activeFormatKind: MainEditorFormatKind,
    state: RegexEditorState | PromptEditorState | HtmlEditorState,
  ): MainEditorRegexStructuredStatePayload | MainEditorPromptStructuredStatePayload | MainEditorHtmlStructuredStatePayload | undefined {
    if (activeFormatKind === 'regex' && isRegexEditorState(state)) return state;
    if (activeFormatKind === 'html' && isHtmlEditorState(state)) return state;
    if (activeFormatKind === 'prompt' && isPromptEditorState(state) && isMainEditorPromptType(state.type)) {
      return {
        frontmatter: state.frontmatter,
        type: state.type,
        sections: state.sections,
      };
    }
    return undefined;
  }

  /**
   * updateVariableRaw 함수.
   * Variable drawer raw input을 preview override에 반영하고 runtime preview를 갱신함.
   *
   * @param variableName - override할 variable 이름
   * @param rawValue - drawer raw input 값
   */
  function updateVariableRaw(variableName: string, rawValue: string): void {
    const binding = runtimePreviewBindings.find((entry) => entry.variableName === variableName);
    if (!binding) return;
    const patchedBinding = { ...binding, rawValue };
    variableOverrides = mergeOverridePatch(variableOverrides, toOverridePatch(patchedBinding));
    runtimePreviewBindings = runtimePreviewBindings.map((entry) => entry.variableName === variableName ? patchedBinding : entry);
    if (lorebookState) scheduleRuntimePreview(lorebookState.contentText);
  }

  /**
   * selectVariableCandidate 함수.
   * Candidate chip 선택을 raw override 변경과 같은 경로로 처리함.
   *
   * @param variableName - override할 variable 이름
   * @param value - 선택된 candidate 값
   */
  function selectVariableCandidate(variableName: string, value: string): void {
    updateVariableRaw(variableName, value);
  }

  /**
   * requestLazyVariableSection 함수.
   * Drawer lazy section이 열릴 때만 workspace candidate 요청을 전송함.
   *
   * @param section - lazy drawer section 이름
   */
  function requestLazyVariableSection(section: 'workspace' | 'profiles' | 'traceContext'): void {
    if (section !== 'workspace' || !lorebookState) return;
    const variableNames = runtimePreviewBindings.map((binding) => binding.variableName);
    const requestId = `candidates-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    getTypedVsCodeApi()?.postMessage(
      createMainEditorVariableCandidatesRequestMessage({
        requestId,
        documentUri,
        documentVersion,
        contentVersion,
        formatKind: 'lorebook',
        sectionName: 'CONTENT',
        scope: 'workspace',
        variableNames,
      }),
    );
  }

  function requestSimulatorProfiles(): void {
    const requestId = `profiles-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    latestProfileListRequestId = requestId;
    simulatorProfilePending = true;
    getTypedVsCodeApi()?.postMessage(createMainEditorSimulatorProfileListRequestMessage({ requestId, documentUri }));
  }

  /**
   * updateWorkspaceSymbolQuery 함수.
   * Workspace symbol search query를 debounce해 advanced LSP bridge에 요청함.
   *
   * @param query - 사용자가 입력한 symbol query
   */
  function updateWorkspaceSymbolQuery(query: string): void {
    workspaceSymbolQuery = query;
    if (workspaceSymbolTimer) clearTimeout(workspaceSymbolTimer);
    workspaceSymbolTimer = setTimeout(() => {
      workspaceSymbolTimer = undefined;
      const normalized = normalizeWorkspaceSymbolQuery({ query: workspaceSymbolQuery, limit: 20 });
      if (!activeAdvancedLspController || normalized.query.length === 0) {
        workspaceSymbols = [];
        workspaceSymbolPending = false;
        return;
      }
      workspaceSymbolPending = true;
      void activeAdvancedLspController.requestWorkspaceSymbols({
        requestId: `workspace-symbols-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        query: normalized.query,
        limit: normalized.limit,
      }).then((symbols) => {
        workspaceSymbols = symbols;
        workspaceSymbolPending = false;
      }).catch((error: unknown) => {
        workspaceSymbolPending = false;
        status = error instanceof Error ? error.message : 'Workspace symbol search failed.';
      });
    }, 200);
  }

  /**
   * revealWorkspaceSymbol 함수.
   * 검색 결과 선택을 현재 Phase 8에서는 상태 메시지로 표시함.
   *
   * @param symbol - 선택된 workspace symbol
   */
  function revealWorkspaceSymbol(symbol: MainEditorWorkspaceSymbolPayload): void {
    status = `Selected ${symbol.name} at ${symbol.location.uri}.`;
    getTypedVsCodeApi()?.postMessage(
      createMainEditorLspRevealLocationMessage({
        requestId: `reveal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        location: symbol.location,
      }),
    );
  }

  function selectSimulatorProfile(profileId: string): void {
    const nextProfile = simulatorProfiles.find((profile) => profile.id === profileId);
    if (!nextProfile) return;
    activeProfileId = nextProfile.id;
    profileDraft = cloneSimulatorProfilePayload(nextProfile);
    simulatorProfileStatus = `Selected ${nextProfile.name}. Save is explicit.`;
    rescheduleActiveFormatPreview();
  }

  function updateProfileDraft(profile: MainEditorSimulatorProfilePayload): void {
    profileDraft = cloneSimulatorProfilePayload(profile);
    simulatorProfileStatus = 'Profile draft changed. Click Save profile to persist.';
    rescheduleActiveFormatPreview();
  }

  function saveProfileDraft(): void {
    const requestId = `profile-save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    latestProfileSaveRequestId = requestId;
    simulatorProfilePending = true;
    getTypedVsCodeApi()?.postMessage(
      createMainEditorSimulatorProfileSaveRequestMessage({
        requestId,
        documentUri,
        profile: profileDraft,
        activeProfileId: profileDraft.id,
      }),
    );
  }

  function openSimulatorEditor(): void {
    simulatorProfileEditorOpen = true;
    resultTab = 'simulator';
    profileDraft = cloneSimulatorProfilePayload(activeSimulatorProfile ?? createDefaultSimulatorProfilePayload());
  }

  function rescheduleActiveFormatPreview(): void {
    if (regexState) scheduleFormatPreview('IN', regexState);
    if (promptState) scheduleFormatPreview(resolvePromptPreviewSection(promptState), promptState);
    if (htmlState) scheduleFormatPreview('FULL', htmlState);
    if (lorebookState) scheduleRuntimePreview(lorebookState.contentText);
  }

  /**
   * mergeOverridePatch 함수.
   * 단일 row override patch를 누적 override payload에 병합함.
   *
   * @param overrides - 기존 preview override payload
   * @param patch - 단일 binding에서 만들어진 patch
   * @returns 병합된 preview override payload
   */
  function mergeOverridePatch(
    overrides: MainEditorVariableOverridesPayload,
    patch: MainEditorVariableOverridesPayload,
  ): MainEditorVariableOverridesPayload {
    return {
      chatVariables: { ...(overrides.chatVariables ?? {}), ...(patch.chatVariables ?? {}) },
      globalVariables: { ...(overrides.globalVariables ?? {}), ...(patch.globalVariables ?? {}) },
      toggleValues: { ...(overrides.toggleValues ?? {}), ...(patch.toggleValues ?? {}) },
      tempVariables: { ...(overrides.tempVariables ?? {}), ...(patch.tempVariables ?? {}) },
    };
  }

  /**
   * applyOverridesToBindings 함수.
   * Runtime result binding rawValue에 현재 preview override 값을 재반영함.
   *
   * @param bindings - extension host에서 받은 binding 목록
   * @returns drawer 표시용 binding 목록
   */
  function applyOverridesToBindings(bindings: MainEditorVariableBindingPayload[]): MainEditorVariableBindingPayload[] {
    return dedupeVariableBindings(bindings).map((binding) => {
      const rawValue = getOverrideRawValue(variableOverrides, binding) ?? binding.rawValue;
      return { ...binding, rawValue };
    });
  }

  /**
   * getOverrideRawValue 함수.
   * Binding scope에 맞는 preview override raw value를 조회함.
   *
   * @param overrides - 현재 preview override payload
   * @param binding - 조회할 binding row
   * @returns override raw value 또는 undefined
   */
  function getOverrideRawValue(
    overrides: MainEditorVariableOverridesPayload,
    binding: MainEditorVariableBindingPayload,
  ): string | undefined {
    if (binding.scope === 'toggle') {
      const value = overrides.toggleValues?.[binding.variableName];
      return value === undefined ? undefined : String(value);
    }
    if (binding.scope === 'global') return overrides.globalVariables?.[binding.variableName];
    if (binding.scope === 'temp') return overrides.tempVariables?.[binding.variableName];
    return overrides.chatVariables?.[binding.variableName];
  }

  /**
   * resetRuntimePreviewState 함수.
   * Canonical document 교체 시 runtime preview의 stale UI state를 비움.
   */
  function resetRuntimePreviewState(): void {
    if (runtimePreviewTimer) clearTimeout(runtimePreviewTimer);
    runtimePreviewTimer = undefined;
    runtimePreviewRequestId = undefined;
    runtimePreviewPending = false;
    runtimePreviewBindings = [];
    runtimePreviewFallbackBindings = [];
    variableOverrides = {};
  }

  /**
   * scheduleStructuredEdit 함수.
   * 현재 lorebook state를 document version과 함께 debounce 전송함.
   *
   * @param nextState - host reassembly에 사용할 다음 lorebook state
   */
  function scheduleStructuredEdit(nextState: MainEditorStructuredState): void {
    if (!initialized) return;
    applyDraftSyncState(queueStructuredEdit(createDraftSyncState(), nextState));
    if (pendingTimer) clearTimeout(pendingTimer);
    if (pendingRequestId) {
      status = `Waiting for edit ${pendingRequestId} before sending newer lorebook state.`;
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingTimer = setTimeout(() => {
      const state = queuedStructuredState;
      if (!state) return;
      const baseVersion = documentVersion;
      pendingTimer = undefined;
      applyDraftSyncState(
        markStructuredEditSent(
          {
            ...createDraftSyncState(),
            queuedStructuredState: undefined,
          },
          { requestId, state },
        ),
      );
      getTypedVsCodeApi()?.postMessage(
        createMainEditorStructuredEditMessage({
          requestId,
          documentUri,
          baseVersion,
          formatKind,
          state,
        }),
      );
      status = `Sending ${formatKind} structured edit based on v${baseVersion}.`;
    }, EDIT_DEBOUNCE_MS);
  }

  /**
   * updateSplitRatio 함수.
   * split pane ratio를 local preference와 host persistence에 함께 반영함.
   *
   * @param nextRatio - 0.2..0.8로 clamp된 split ratio
   */
  function updateSplitRatio(nextRatio: number): void {
    updatePreferences({ ...preferences, splitRatio: nextRatio });
  }

  /**
   * toggleFrontmatterOpen 함수.
   * lorebook frontmatter 접힘 상태를 format preference로 저장함.
   */
  function toggleFrontmatterOpen(): void {
    updatePreferences({ ...preferences, frontmatterOpen: !preferences.frontmatterOpen });
  }

  /**
   * updatePreferences 함수.
   * main editor UI preference를 local state와 extension host workspaceState에 반영함.
   *
   * @param nextPreferences - 다음 format-scoped preference state
   */
  function updatePreferences(nextPreferences: MainEditorPreferenceState): void {
    preferences = nextPreferences;
    getTypedVsCodeApi()?.postMessage(
      createMainEditorUpdatePreferencesMessage({ documentUri, formatKind, preferences: nextPreferences }),
    );
  }

  /**
   * setVariableDrawerOpen 함수.
   * Variables rail/drawer 양쪽에서 같은 경로로 drawer open preference를 갱신함.
   *
   * @param drawerOpen - drawer를 열지 닫을지 여부
   */
  function setVariableDrawerOpen(drawerOpen: boolean): void {
    updatePreferences({ ...preferences, drawerOpen });
  }

  /**
   * toggleVariableDrawer 함수.
   * 현재 preference snapshot 기준으로 variable drawer를 토글함.
   */
  function toggleVariableDrawer(): void {
    setVariableDrawerOpen(!preferences.drawerOpen);
  }

  /**
   * queueSnippet 함수.
   * side toolbar에서 선택한 CBS snippet을 Monaco wrapper로 전달함.
   *
   * @param variant - 삽입할 snippet variant
   */
  function queueSnippet(variant: CbsSnippetVariant): void {
    pendingSnippet = variant;
  }

  /**
   * consumeSnippet 함수.
   * Monaco wrapper가 snippet insertion을 끝낸 뒤 pending marker를 비움.
   */
  function consumeSnippet(): void {
    pendingSnippet = undefined;
  }

  function getTypedVsCodeApi(): VsCodeApi | undefined {
    return getVsCodeApi();
  }

  /**
   * createDraftSyncState 함수.
   * Svelte local draft variables를 pure helper 입력 state로 투영함.
   *
   * @returns 현재 draft/pending 변수 snapshot
   */
  function createDraftSyncState(): MainEditorLocalDraftSyncState {
    return {
      rawText,
      draftText,
      documentVersion,
      pendingRequestId,
      pendingRequestKind,
      pendingSentText,
      pendingStructuredState,
      queuedStructuredState,
      status,
      shouldRescheduleRawEdit: false,
      shouldSendQueuedStructuredEdit: false,
    };
  }

  /**
   * applyDraftSyncState 함수.
   * pure helper가 계산한 draft/pending state를 Svelte local variables에 반영함.
   *
   * @param state - helper transition 결과 state
   */
  function applyDraftSyncState(state: MainEditorLocalDraftSyncState): void {
    rawText = state.rawText;
    draftText = state.draftText;
    documentVersion = state.documentVersion;
    pendingRequestId = state.pendingRequestId;
    pendingRequestKind = state.pendingRequestKind;
    pendingSentText = state.pendingSentText;
    pendingStructuredState = state.pendingStructuredState;
    queuedStructuredState = state.queuedStructuredState;
    if (state.status) status = state.status;
  }

  /**
   * resetLspClient 함수.
   * 현재 document/version getter를 쓰는 Monaco LSP client를 재생성함.
   */
  function resetLspClient(): void {
    if (activeLspClient && lspClientDocumentUri === documentUri) return;
    activeLspClient?.dispose();
    activeAdvancedLspController?.dispose();
    const vscode = getTypedVsCodeApi();
    activeLspClient = vscode
      ? createMainEditorMonacoLspClient({
          vscode,
          documentUri,
          getDocumentVersion: () => documentVersion,
          getContentVersion: () => contentVersion,
        })
      : undefined;
    activeAdvancedLspController = vscode
      ? createAdvancedLspRequestController({ postMessage: (message) => vscode.postMessage(message) })
      : undefined;
    lspClientDocumentUri = activeLspClient ? documentUri : undefined;
  }

  function isMainEditorExtensionMessage(message: unknown): message is MainEditorExtensionMessage {
    if (!message || typeof message !== 'object') return false;

    const candidate = message as Partial<MainEditorExtensionMessage>;
    if (candidate.protocol !== MAIN_EDITOR_PROTOCOL || candidate.version !== MAIN_EDITOR_PROTOCOL_VERSION) return false;

    if (candidate.type === 'main-editor/init') {
      const payload = candidate.payload;
      return (
        Boolean(payload) &&
        typeof payload?.documentUri === 'string' &&
        typeof payload.documentDisplayPath === 'string' &&
        typeof payload.documentVersion === 'number' &&
        typeof payload.rawText === 'string' &&
        isMainEditorDocumentModelPayload(payload.model) &&
        isMainEditorFormatKind(payload.formatKind) &&
        isMainEditorPreferenceState(payload.preferences)
      );
    }

    if (candidate.type === 'main-editor/documentChanged') {
      const payload = candidate.payload;
      return (
        Boolean(payload) &&
        typeof payload?.documentUri === 'string' &&
        typeof payload.documentDisplayPath === 'string' &&
        typeof payload.documentVersion === 'number' &&
        typeof payload.rawText === 'string' &&
        isMainEditorDocumentModelPayload(payload.model) &&
        isMainEditorFormatKind(payload.formatKind)
      );
    }

    if (candidate.type === 'main-editor/editApplied') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.requestId === 'string' && typeof payload.documentVersion === 'number';
    }

    if (candidate.type === 'main-editor/error' || candidate.type === 'main-editor/lspError') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.code === 'string' && typeof payload.message === 'string';
    }

    if (candidate.type === 'main-editor/lspCompletionResult' || candidate.type === 'main-editor/lspHoverResult' || candidate.type === 'main-editor/lspDefinitionResult') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.requestId === 'string' && typeof payload.documentUri === 'string';
    }

    if (
      candidate.type === 'main-editor/lspReferencesResult' ||
      candidate.type === 'main-editor/lspPrepareRenameResult' ||
      candidate.type === 'main-editor/lspRenameResult' ||
      candidate.type === 'main-editor/lspCodeLensResult' ||
      candidate.type === 'main-editor/lspWorkspaceSymbolsResult'
    ) {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.requestId === 'string';
    }

    if (candidate.type === 'main-editor/lspAdvancedError') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.requestId === 'string' && typeof payload.message === 'string';
    }

    if (candidate.type === 'main-editor/diagnosticsUpdate') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.documentUri === 'string' && Array.isArray(payload.markers);
    }

    if (candidate.type === 'main-editor/previewResult') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.requestId === 'string' && typeof payload.output === 'string';
    }

    if (candidate.type === 'main-editor/previewRuntimeResult') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.requestId === 'string' && typeof payload.output === 'string' && Array.isArray(payload.bindings);
    }

    if (candidate.type === 'main-editor/formatPreviewResult') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.requestId === 'string' && typeof payload.output === 'string';
    }

    if (candidate.type === 'main-editor/simulatorProfileListResult') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.requestId === 'string' && typeof payload.documentUri === 'string' && Array.isArray(payload.profiles);
    }

    if (candidate.type === 'main-editor/simulatorProfileSaveResult') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.requestId === 'string' && typeof payload.documentUri === 'string' && typeof payload.status === 'string';
    }

    if (candidate.type === 'main-editor/variableCandidatesResult') {
      const payload = candidate.payload;
      return Boolean(payload) && typeof payload?.requestId === 'string' && typeof payload.documentUri === 'string';
    }

    return false;
  }

  function isMainEditorFormatKind(value: unknown): value is MainEditorFormatKind {
    return value === 'lorebook' || value === 'regex' || value === 'prompt' || value === 'html';
  }

  function isMainEditorPreferenceState(value: unknown): value is MainEditorPreferenceState {
    return (
      Boolean(value) &&
      typeof value === 'object' &&
      typeof (value as Partial<MainEditorPreferenceState>).splitRatio === 'number' &&
      Number.isFinite((value as Partial<MainEditorPreferenceState>).splitRatio) &&
      ((value as Partial<MainEditorPreferenceState>).splitRatio ?? 0) >= 0.2 &&
      ((value as Partial<MainEditorPreferenceState>).splitRatio ?? 0) <= 0.8 &&
      typeof (value as Partial<MainEditorPreferenceState>).frontmatterOpen === 'boolean' &&
      typeof (value as Partial<MainEditorPreferenceState>).drawerOpen === 'boolean'
    );
  }

  function isMainEditorDocumentModelPayload(value: unknown): value is MainEditorDocumentModelPayload {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<MainEditorDocumentModelPayload>;
    return (
      isMainEditorFormatKind(candidate.formatKind) &&
      Array.isArray(candidate.warnings) &&
      Array.isArray(candidate.sections)
    );
  }

  function getLorebookEditorState(
    documentModel: MainEditorDocumentModelPayload | undefined,
    activeFormatKind: MainEditorFormatKind,
  ): LorebookEditorState | undefined {
    if (activeFormatKind !== 'lorebook' || documentModel?.formatKind !== 'lorebook') return undefined;
    return isLorebookEditorState(documentModel.state) ? documentModel.state : undefined;
  }

  function getRegexEditorState(
    documentModel: MainEditorDocumentModelPayload | undefined,
    activeFormatKind: MainEditorFormatKind,
  ): RegexEditorState | undefined {
    if (activeFormatKind !== 'regex' || documentModel?.formatKind !== 'regex') return undefined;
    return isRegexEditorState(documentModel.state) ? documentModel.state : undefined;
  }

  function getPromptEditorState(
    documentModel: MainEditorDocumentModelPayload | undefined,
    activeFormatKind: MainEditorFormatKind,
  ): PromptEditorState | undefined {
    if (activeFormatKind !== 'prompt' || documentModel?.formatKind !== 'prompt') return undefined;
    return isPromptEditorState(documentModel.state) ? documentModel.state : undefined;
  }

  function getHtmlEditorState(
    documentModel: MainEditorDocumentModelPayload | undefined,
    activeFormatKind: MainEditorFormatKind,
  ): HtmlEditorState | undefined {
    if (activeFormatKind !== 'html' || documentModel?.formatKind !== 'html') return undefined;
    return isHtmlEditorState(documentModel.state) ? documentModel.state : undefined;
  }

  function isLorebookEditorState(value: unknown): value is LorebookEditorState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LorebookEditorState>;
    return (
      isStringRecord(candidate.frontmatter) &&
      Array.isArray(candidate.unknownFrontmatter) &&
      typeof candidate.keysText === 'string' &&
      typeof candidate.secondaryKeysText === 'string' &&
      typeof candidate.contentText === 'string' &&
      typeof candidate.hasSecondaryKeysSection === 'boolean'
    );
  }

  function isRegexEditorState(value: unknown): value is RegexEditorState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<RegexEditorState>;
    return isStringRecord(candidate.frontmatter) && typeof candidate.inText === 'string' && typeof candidate.outText === 'string';
  }

  function isPromptEditorState(value: unknown): value is PromptEditorState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<PromptEditorState>;
    return isStringRecord(candidate.frontmatter) && (typeof candidate.type === 'string' || candidate.type === null) && isPromptSections(candidate.sections);
  }

  function isHtmlEditorState(value: unknown): value is HtmlEditorState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<HtmlEditorState>;
    return typeof candidate.contentText === 'string';
  }

  function isPromptSections(value: unknown): value is Partial<Record<'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT', string>> {
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).every(([key, entry]) =>
      (key === 'TEXT' || key === 'INNER_FORMAT' || key === 'DEFAULT_TEXT') && typeof entry === 'string',
    );
  }

  function isMainEditorPromptType(value: unknown): value is NonNullable<MainEditorPromptStructuredStatePayload['type']> {
    return (
      value === 'plain' ||
      value === 'jailbreak' ||
      value === 'cot' ||
      value === 'chatML' ||
      value === 'persona' ||
      value === 'description' ||
      value === 'lorebook' ||
      value === 'postEverything' ||
      value === 'memory' ||
      value === 'authornote' ||
      value === 'chat' ||
      value === 'cache'
    );
  }

  function getAllowedPromptSections(type: string | null): Array<'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT'> {
    switch (type) {
      case 'plain':
      case 'jailbreak':
      case 'cot':
      case 'chatML':
        return ['TEXT'];
      case 'persona':
      case 'description':
      case 'lorebook':
      case 'postEverything':
      case 'memory':
        return ['INNER_FORMAT'];
      case 'authornote':
        return ['INNER_FORMAT', 'DEFAULT_TEXT'];
      default:
        return [];
    }
  }

  function filterPromptSections(
    sections: Partial<Record<'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT', string>>,
    allowedSections: readonly ('TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT')[],
  ): Partial<Record<'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT', string>> {
    const filtered: Partial<Record<'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT', string>> = {};
    for (const section of allowedSections) {
      if (sections[section] !== undefined) filtered[section] = sections[section];
    }
    return filtered;
  }

  function resolvePromptPreviewSection(state: PromptEditorState): MainEditorFormatSectionName {
    const allowedSections = getAllowedPromptSections(state.type);
    if (allowedSections.includes(promptActiveSection)) return promptActiveSection;
    return allowedSections[0] ?? 'TEXT';
  }

  function isStringRecord(value: unknown): value is Record<string, string> {
    return value !== null && typeof value === 'object' && Object.values(value).every((entry) => typeof entry === 'string');
  }

  function isRuntimePreviewResult(
    value: MainEditorPreviewResultPayload | MainEditorPreviewRuntimeResultPayload | MainEditorFormatPreviewResultPayload | null,
  ): value is MainEditorPreviewRuntimeResultPayload {
    return value !== null && typeof value === 'object' && 'trace' in value;
  }

  function createDefaultSimulatorProfilePayload(): MainEditorSimulatorProfilePayload {
    return {
      id: 'default',
      name: 'Default',
      target: { moduleIds: [] },
      variables: {
        chatVariables: {},
        globalVariables: {},
        toggleValues: {},
        tempVariables: {},
      },
      chatHistory: [],
      htmlContext: { enabledHtmlDocumentUris: [] },
    };
  }

  function cloneSimulatorProfilePayload(profile: MainEditorSimulatorProfilePayload): MainEditorSimulatorProfilePayload {
    return {
      id: profile.id,
      name: profile.name,
      target: {
        ...(profile.target.characterId ? { characterId: profile.target.characterId } : {}),
        moduleIds: [...profile.target.moduleIds],
        ...(profile.target.presetId ? { presetId: profile.target.presetId } : {}),
      },
      variables: {
        chatVariables: { ...(profile.variables.chatVariables ?? {}) },
        globalVariables: { ...(profile.variables.globalVariables ?? {}) },
        toggleValues: { ...(profile.variables.toggleValues ?? {}) },
        tempVariables: { ...(profile.variables.tempVariables ?? {}) },
      },
      chatHistory: profile.chatHistory.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.timestamp ? { timestamp: message.timestamp } : {}),
      })),
      htmlContext: { enabledHtmlDocumentUris: [...profile.htmlContext.enabledHtmlDocumentUris] },
    };
  }

  function upsertSimulatorProfile(
    profiles: MainEditorSimulatorProfilePayload[],
    profile: MainEditorSimulatorProfilePayload,
  ): MainEditorSimulatorProfilePayload[] {
    return [...profiles.filter((entry) => entry.id !== profile.id), cloneSimulatorProfilePayload(profile)];
  }

  function buildSimulatorProfileSummary(profile: MainEditorSimulatorProfilePayload | undefined): { variableCount: number; chatCount: number; htmlCount: number } {
    if (!profile) return { variableCount: 0, chatCount: 0, htmlCount: 0 };
    return {
      variableCount:
        Object.keys(profile.variables.chatVariables ?? {}).length +
        Object.keys(profile.variables.globalVariables ?? {}).length +
        Object.keys(profile.variables.toggleValues ?? {}).length +
        Object.keys(profile.variables.tempVariables ?? {}).length,
      chatCount: profile.chatHistory.length,
      htmlCount: profile.htmlContext.enabledHtmlDocumentUris.length,
    };
  }
</script>

{#if !initialized}
  <div class="main-editor-loading">
    <p>Loading Risu main editor...</p>
  </div>
{:else}
  <main class="main-editor-shell" class:main-editor-shell--raw={!isStructuredAuthoring} class:main-editor-shell--drawer-open={preferences.drawerOpen} aria-label="Risu Main Editor" style={`--main-editor-authoring-ratio: ${preferences.splitRatio}fr; --main-editor-result-ratio: ${1 - preferences.splitRatio}fr;`}>
    <aside class="main-editor-side-toolbar" aria-label="Side toolbar">
      {#if lorebookState}
        <SideToolbar onInsertSnippet={queueSnippet} />
      {:else}
        <span>Tools</span>
      {/if}
    </aside>
    {#if isStructuredAuthoring && model}
      <SplitPane ratio={preferences.splitRatio} onRatioChange={updateSplitRatio}>
        <section class="main-editor-authoring main-editor-authoring--lorebook" aria-label={`${formatKind} authoring area`}>
          <header class="main-editor-header">
            <div class="main-editor-header__identity">
              <div class="main-editor-header__meta">
                <strong>{formatKind}</strong>
                <span>v{documentVersion}</span>
              </div>
              <span class="main-editor-header__path" title={documentUri}>{documentDisplayPath}</span>
            </div>
            <span class="main-editor-header__status">{status}</span>
          </header>
          {#if lorebookState}
            <LorebookFrontmatter
              state={lorebookState}
              warnings={model.warnings}
              open={preferences.frontmatterOpen}
              onToggleOpen={toggleFrontmatterOpen}
              onChange={updateLorebookState}
            />
            <LorebookContentEditor
              {documentUri}
              {documentVersion}
              {contentVersion}
              contentText={lorebookState.contentText}
              {diagnosticsMarkers}
              {pendingSnippet}
              lspClient={activeLspClient}
              advancedLspController={activeAdvancedLspController}
              onStatus={(message) => (status = message)}
              onChange={updateLorebookContent}
              onContentVersionChange={updateContentVersion}
              onSnippetConsumed={consumeSnippet}
            />
          {:else if regexState}
            <RegexFrontmatter
              state={regexState}
              warnings={model.warnings}
              open={preferences.frontmatterOpen}
              onToggleOpen={toggleFrontmatterOpen}
              onChange={updateRegexState}
            />
            <RegexSplitEditor
              {documentUri}
              inText={regexState.inText}
              outText={regexState.outText}
              sampleInput={regexSampleInput}
              onInChange={(inText) => updateRegexState({ ...regexState, inText })}
              onOutChange={(outText) => updateRegexState({ ...regexState, outText })}
              onSampleInputChange={updateRegexSampleInput}
              onContentVersionChange={updateContentVersion}
            />
          {:else if promptState}
            <PromptFrontmatter
              state={promptState}
              warnings={model.warnings}
              open={preferences.frontmatterOpen}
              onToggleOpen={toggleFrontmatterOpen}
              onChange={updatePromptState}
            />
            <PromptSectionEditor
              {documentUri}
              state={{ ...promptState, sections: { ...promptSectionDrafts, ...promptState.sections } }}
              activeSection={promptActiveSection}
              onActiveSectionChange={updatePromptActiveSection}
              onSectionChange={updatePromptSection}
              onContentVersionChange={updateContentVersion}
            />
          {:else if htmlState}
            <HtmlSourceEditor
              {documentUri}
              contentText={htmlState.contentText}
              onChange={(contentText) => updateHtmlState({ contentText })}
              onContentVersionChange={updateContentVersion}
            />
          {/if}
        </section>
        <section class="main-editor-result-surface" aria-label="Result surface">
          <div class="main-editor-tabs" role="tablist" aria-label="Result tabs">
            <button type="button" class="main-editor-tab" class:main-editor-tab--active={resultTab === 'preview'} onclick={() => (resultTab = 'preview')}>Preview</button>
            <button type="button" class="main-editor-tab" class:main-editor-tab--active={resultTab === 'simulator'} onclick={() => (resultTab = 'simulator')}>Simulator</button>
          </div>
          {#if resultTab === 'preview'}
            <PreviewPanel preview={lorebookState ? previewResult : formatPreviewResult} pending={previewPending || runtimePreviewPending} />
            {#if htmlState && formatPreviewResult}
              <HtmlRenderedPreview
                srcdoc={formatPreviewResult.output}
                sandbox={formatPreviewResult.metadata.sandbox === 'allow-scripts' ? 'allow-scripts' : ''}
              />
            {/if}
          {:else}
            <SimulatorResultPanel
              profiles={simulatorProfiles}
              {activeProfileId}
              {profileDraft}
              editorOpen={simulatorProfileEditorOpen}
              pending={simulatorProfilePending}
              status={simulatorProfileStatus}
              onSelectProfile={selectSimulatorProfile}
              onOpenEditor={openSimulatorEditor}
              onProfileDraftChange={updateProfileDraft}
              onSaveProfile={saveProfileDraft}
            />
          {/if}
        </section>
      </SplitPane>
    {:else}
      <section class="main-editor-authoring" aria-label="Authoring area">
        <header class="main-editor-header">
          <div class="main-editor-header__identity">
            <div class="main-editor-header__meta">
              <strong>{formatKind}</strong>
              <span>v{documentVersion}</span>
            </div>
            <span class="main-editor-header__path" title={documentUri}>{documentDisplayPath}</span>
          </div>
          <span class="main-editor-header__status">{status}</span>
        </header>
        <textarea
          class="main-editor-raw-textarea"
          value={draftText}
          oninput={handleRawInput}
          spellcheck="false"
          aria-label="Raw document source"
        ></textarea>
      </section>
      <section class="main-editor-result-surface" aria-label="Result surface">
        <div class="main-editor-tabs" role="tablist" aria-label="Result tabs">
          <button type="button" class="main-editor-tab main-editor-tab--active">Preview</button>
          <button type="button" class="main-editor-tab">Simulator</button>
        </div>
        <div class="main-editor-placeholder">
          Preview and simulator are planned for later phases.
          {#if model}
            <section class="main-editor-model-summary" aria-label="Document model summary">
              <h2>Document Model</h2>
              <p>{model.sections.length} sections · {model.warnings.length} warnings</p>
              {#if model.warnings.length > 0}
                <ul>
                  {#each model.warnings as warning}
                    <li>{warning.severity}: {warning.message}</li>
                  {/each}
                </ul>
              {/if}
            </section>
          {/if}
        </div>
      </section>
    {/if}
    <VariableRail
      open={preferences.drawerOpen}
      hidden={preferences.drawerOpen}
      usedCount={runtimePreviewBindings.length}
      missingCount={runtimePreviewBindings.filter((binding) => binding.status === 'missing').length}
      runtimeUnknownCount={runtimePreviewBindings.filter((binding) => binding.status === 'runtimeUnknown').length}
      onToggle={toggleVariableDrawer}
    />
    <VariableDrawer
      open={preferences.drawerOpen}
      bindings={runtimePreviewBindings}
      preview={isRuntimePreviewResult(previewResult) ? previewResult : null}
      {profileLabel}
      profileVariableCount={profileSummary.variableCount}
      profileChatCount={profileSummary.chatCount}
      profileHtmlCount={profileSummary.htmlCount}
      onClose={() => setVariableDrawerOpen(false)}
      onRawChange={updateVariableRaw}
      onCandidateSelect={selectVariableCandidate}
      onLazySectionOpen={requestLazyVariableSection}
      onOpenSimulatorEditor={openSimulatorEditor}
    />
  </main>
{/if}
