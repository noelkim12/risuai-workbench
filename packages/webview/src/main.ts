import './styles.css';
import App from './App.svelte';
import AssetManagerApp from './AssetManagerApp.svelte';
import CreateWizardApp from './CreateWizardApp.svelte';
import MainEditor from './lib/components/editor/main/MainEditor.svelte';
import MarkerEditor from './lib/components/editor/marker/MarkerEditor.svelte';
import { mount } from 'svelte';
import { get, writable } from 'svelte/store';
import {
  createArtifactBrowserAnalyzeArtifactMessage,
  createArtifactBrowserImportArtifactChunkMessage,
  createArtifactBrowserCreateArtifactMessage,
  createArtifactBrowserCreateSectionEntryMessage,
  createArtifactBrowserMoveLorebookFolderMessage,
  createArtifactBrowserMoveLorebookItemMessage,
  createArtifactBrowserMoveGreetingItemMessage,
  createArtifactBrowserMoveRegexItemMessage,
  createArtifactBrowserOpenAssetManagerMessage,
  createArtifactBrowserOpenCreateWizardMessage,
  createArtifactBrowserCloseCreateWizardMessage,
  createArtifactBrowserOpenItemMessage,
  createArtifactBrowserPackArtifactMessage,
  createArtifactBrowserReadyMessage,
  createArtifactBrowserRefreshMessage,
  createArtifactBrowserSelectMessage,
  getVsCodeApi,
} from './lib/vscode';
import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
  type ArtifactBrowserCardsPayload,
  type ArtifactBrowserCreateArtifactPayload,
  type ArtifactBrowserCreateSectionEntryKind,
  type ArtifactBrowserCreateSectionKind,
  type BrowserArtifactCard,
  type ArtifactBrowserExtensionMessage,
  type ArtifactBrowserDetailPayload,
  type ArtifactBrowserPackCompletedPayload,
  type CharacterItem,
  type CharacterSection,
} from './lib/types';
import { isPlainRecord, isProtocolEnvelope, isProtocolMessageEnvelope } from './lib/protocolEnvelope';

const vscode = getVsCodeApi();
const cards = writable<BrowserArtifactCard[]>([]);
const selectedStableId = writable<string | undefined>(undefined);
const detailSections = writable<CharacterSection[]>([]);
const expandedSectionIds = writable<string[]>([]);
const viewMode = writable<'artifacts' | 'artifactDetail'>('artifacts');
const status = writable('Connecting to extension host…');
const packState = writable<ArtifactBrowserPackCompletedPayload | null>(null);
const importing = writable(false);
const app = document.querySelector<HTMLDivElement>('#app');
const IMPORT_CHUNK_BYTES = 1024 * 1024;
const isEditorMode = document.documentElement.dataset.editorMode === 'true';
const webviewName =
  document.documentElement.dataset.risuaiWorkbenchView ??
  document.querySelector('meta[name="risuai-workbench-view"]')?.getAttribute('content');
let artifactBrowserReadyRetryTimer: ReturnType<typeof setInterval> | undefined;
let artifactBrowserInitialized = false;

type ArtifactBrowserExtensionMessageType = ArtifactBrowserExtensionMessage['type'];
type ArtifactBrowserExtensionPayloadGuard<TType extends ArtifactBrowserExtensionMessageType> = (
  payload: unknown,
) => payload is Extract<ArtifactBrowserExtensionMessage, { type: TType }>['payload'];
type ArtifactBrowserExtensionMessageGuard = (message: unknown) => message is ArtifactBrowserExtensionMessage;

const ARTIFACT_BROWSER_EXTENSION_MESSAGE_TYPES = [
  'artifact-browser/cards',
  'artifact-browser/detailLoaded',
  'artifact-browser/packCompleted',
] as const satisfies readonly ArtifactBrowserExtensionMessageType[];

const ARTIFACT_BROWSER_EXTENSION_MESSAGE_GUARDS = {
  'artifact-browser/cards': createArtifactBrowserExtensionMessageGuard(
    'artifact-browser/cards',
    isArtifactBrowserCardsPayload,
  ),
  'artifact-browser/detailLoaded': createArtifactBrowserExtensionMessageGuard(
    'artifact-browser/detailLoaded',
    isArtifactBrowserDetailPayload,
  ),
  'artifact-browser/packCompleted': createArtifactBrowserExtensionMessageGuard(
    'artifact-browser/packCompleted',
    isArtifactBrowserPackCompletedPayload,
  ),
} satisfies Record<ArtifactBrowserExtensionMessageType, ArtifactBrowserExtensionMessageGuard>;

if (!app) {
  throw new Error('Missing #app root for Risu Workbench webview.');
}

if (webviewName === 'asset-manager') {
  mount(AssetManagerApp, {
    target: app,
  });
} else if (webviewName === 'create-wizard') {
  mount(CreateWizardApp, {
    target: app,
    props: {
      onCreate: createArtifact,
      onClose: closeCreateWizard,
    },
  });
} else if (isEditorMode && webviewName === 'main-editor') {
  mount(MainEditor, {
    target: app,
  });
} else if (isEditorMode) {
  mount(MarkerEditor, {
    target: app,
  });
} else {
  mount(App, {
    target: app,
    props: {
      cards,
      selectedStableId,
      detailSections,
      expandedSectionIds,
      viewMode,
      status,
      importing,
      refreshCards,
      openCreateWizard,
      importArtifact,
      selectCard,
      returnToCards,
      toggleSection,
      openItem,
      openAssetManager,
      moveLorebookItem,
      moveLorebookFolder,
      moveRegexItem,
      moveGreetingItem,
      createSectionEntry,
      analyzeArtifact,
      packArtifact,
      packState,
    },
  });

  window.addEventListener('message', handleMessage);
  announceArtifactBrowserReady();
  artifactBrowserReadyRetryTimer = setInterval(() => {
    if (artifactBrowserInitialized) {
      stopArtifactBrowserReadyRetry();
      return;
    }
    announceArtifactBrowserReady();
  }, 500);
}

/**
 * announceArtifactBrowserReady 함수.
 * Sidebar webview가 host listener 준비 race에서 복구되도록 ready를 반복 전송함.
 */
function announceArtifactBrowserReady(): void {
  vscode?.postMessage(createArtifactBrowserReadyMessage());
}

/**
 * stopArtifactBrowserReadyRetry 함수.
 * 첫 cards 응답을 받으면 sidebar ready 재전송 timer를 정리함.
 */
function stopArtifactBrowserReadyRetry(): void {
  if (!artifactBrowserReadyRetryTimer) return;
  clearInterval(artifactBrowserReadyRetryTimer);
  artifactBrowserReadyRetryTimer = undefined;
}

function handleMessage(event: MessageEvent<unknown>): void {
  const message = event.data;
  if (!isArtifactBrowserExtensionMessage(message)) return;

  if (message.type === 'artifact-browser/cards') {
    importing.set(false);
    artifactBrowserInitialized = true;
    stopArtifactBrowserReadyRetry();
    const nextCards = message.payload.cards;
    if (message.payload.selectedStableId) {
      selectedStableId.set(message.payload.selectedStableId);
    }
    cards.set(nextCards);
    setStatus(`${nextCards.length} .risuchar/.risumodule root-marker artifacts loaded from workspace discovery.`);
    return;
  }

  if (message.type === 'artifact-browser/detailLoaded') {
    // 같은 아티팩트에 대한 background refresh(외부 파일 추가/삭제 감지)면 펼침 상태를 유지하고,
    // 다른 아티팩트를 새로 선택한 경우에만 접힌 상태로 초기화한다. section/item은 keyed each로
    // in-place diff되어 변경된 항목만 갱신되므로, 스크롤·포커스·작업 위치가 보존된다.
    const isSameArtifactRefresh = get(selectedStableId) === message.payload.stableId;
    selectedStableId.set(message.payload.stableId);
    detailSections.set(message.payload.sections);
    if (!isSameArtifactRefresh) {
      expandedSectionIds.set([]);
    }
    viewMode.set('artifactDetail');
    setStatus(`Detail loaded with ${message.payload.sections.length} sections.`);
    return;
  }

  if (message.type === 'artifact-browser/packCompleted') {
    packState.set(message.payload);
    setStatus(
      message.payload.ok
        ? `Packed → ${message.payload.outputPath}`
        : `Pack failed: ${message.payload.error ?? 'unknown error'}`,
    );
    return;
  }
}

/**
 * refreshCards 함수.
 * Refresh button action을 typed webview-to-extension message로 전달함.
 */
function refreshCards(): void {
  setStatus('Refreshing .risuchar and .risumodule root markers…');
  viewMode.set('artifacts');
  detailSections.set([]);
  vscode?.postMessage(createArtifactBrowserRefreshMessage());
}

function createArtifact(payload: ArtifactBrowserCreateArtifactPayload): void {
  const artifactLabel = payload.kind === 'charx' ? '.risuchar' : payload.kind === 'plugin' ? '.risuplugin' : '.risumodule';
  setStatus(`Creating ${artifactLabel} scaffold…`);
  viewMode.set('artifacts');
  detailSections.set([]);
  vscode?.postMessage(createArtifactBrowserCreateArtifactMessage(payload));
}

function openCreateWizard(): void {
  vscode?.postMessage(createArtifactBrowserOpenCreateWizardMessage());
}

function closeCreateWizard(): void {
  vscode?.postMessage(createArtifactBrowserCloseCreateWizardMessage());
}

function encodeChunkAsBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function importArtifact(file: File): Promise<void> {
  importing.set(true);
  setStatus(`Importing ${file.name}…`);
  viewMode.set('artifacts');
  detailSections.set([]);
  try {
    const transferId = crypto.randomUUID();
    const totalChunks = Math.max(1, Math.ceil(file.size / IMPORT_CHUNK_BYTES));
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * IMPORT_CHUNK_BYTES;
      const chunk = file.slice(start, start + IMPORT_CHUNK_BYTES);
      vscode?.postMessage(
        createArtifactBrowserImportArtifactChunkMessage({
          transferId,
          fileName: file.name,
          chunkIndex,
          totalChunks,
          chunkBase64: encodeChunkAsBase64(await chunk.arrayBuffer()),
        }),
      );
    }
  } catch (error) {
    importing.set(false);
    setStatus(`Import failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

/**
 * packArtifact 함수.
 * Pack 요청을 typed webview-to-extension message로 전달하고 완료 상태를 초기화함.
 *
 * @param stableId - Pack 대상 artifact stable id
 * @param recovery - RisuLua 복원 메타데이터 포함 여부
 */
function packArtifact(stableId: string, recovery: boolean): void {
  packState.set(null);
  setStatus('Packing…');
  vscode?.postMessage(createArtifactBrowserPackArtifactMessage({ stableId, recovery }));
}

function analyzeArtifact(stableId: string): void {
  setStatus('Analyzing and generating wiki…');
  vscode?.postMessage(createArtifactBrowserAnalyzeArtifactMessage({ stableId }));
}

/**
 * openAssetManager 함수.
 * Assets 아코디언 진입 버튼 → extension host에 Asset Manager 패널 오픈을 요청함.
 */
function openAssetManager(stableId: string): void {
  vscode?.postMessage(createArtifactBrowserOpenAssetManagerMessage(stableId));
}

/**
 * selectCard 함수.
 * 선택한 card id를 local state와 extension host에 함께 반영함.
 *
 * @param stableId - 선택된 card stable id
 */
function selectCard(stableId: string): void {
  let selectedCard: BrowserArtifactCard | undefined;
  cards.subscribe((value) => {
    selectedCard = value.find((card) => card.stableId === stableId);
  })();
  if (!selectedCard) return;

  if (selectedCard.artifactKind === 'plugin') {
    selectedStableId.set(stableId);
    detailSections.set([]);
    setStatus('Plugin project selected. Detail view is not available yet.');
    return;
  }

  selectedStableId.set(stableId);
  detailSections.set([]);
  setStatus(`Loading ${selectedCard.artifactKind} detail…`);
  vscode?.postMessage(createArtifactBrowserSelectMessage(stableId));
}

/**
 * returnToCards 함수.
 * Host discovery를 다시 요청하지 않고 보존된 card state로 돌아감.
 */
function returnToCards(): void {
  viewMode.set('artifacts');
  setStatus('Returned to artifact cards.');
}

/**
 * toggleSection 함수.
 * Stable section id 기준으로 accordion 펼침 상태를 토글함.
 *
 * @param sectionId - 토글할 accordion section id
 */
function toggleSection(sectionId: string): void {
  expandedSectionIds.update((current) =>
    current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId],
  );
}

/**
 * openItem 함수.
 * File-backed detail item을 typed bridge message로 extension host에 전달함.
 *
 * @param item - 사용자가 클릭한 detail item
 */
function openItem(item: CharacterItem): void {
  if (!item.fileUri) return;
  let stableId: string | undefined;
  selectedStableId.subscribe((value) => {
    stableId = value;
  })();
  if (!stableId) return;

  vscode?.postMessage(createArtifactBrowserOpenItemMessage(stableId, item.id));
}

function getSelectedStableId(): string | undefined {
  let stableId: string | undefined;
  selectedStableId.subscribe((value) => {
    stableId = value;
  })();
  return stableId;
}

function moveLorebookItem(
  item: CharacterItem,
  targetFolderPath: string | null,
  placement?: 'inside' | 'before' | 'after',
  targetItemId?: string,
): void {
  const stableId = getSelectedStableId();
  if (!stableId) return;
  vscode?.postMessage(
    createArtifactBrowserMoveLorebookItemMessage(stableId, item.id, targetFolderPath, placement, targetItemId),
  );
}

function moveLorebookFolder(folderPath: string, targetFolderPath: string, placement: 'before' | 'after'): void {
  const stableId = getSelectedStableId();
  if (!stableId) return;
  vscode?.postMessage(createArtifactBrowserMoveLorebookFolderMessage(stableId, folderPath, targetFolderPath, placement));
}

function moveRegexItem(item: CharacterItem, targetItemId: string, placement: 'before' | 'after'): void {
  const stableId = getSelectedStableId();
  if (!stableId) return;
  vscode?.postMessage(createArtifactBrowserMoveRegexItemMessage(stableId, item.id, targetItemId, placement));
}

function moveGreetingItem(item: CharacterItem, targetItemId: string, placement: 'before' | 'after'): void {
  const stableId = getSelectedStableId();
  if (!stableId) return;
  vscode?.postMessage(createArtifactBrowserMoveGreetingItemMessage(stableId, item.id, targetItemId, placement));
}

function createSectionEntry(
  sectionKind: ArtifactBrowserCreateSectionKind,
  entryKind: ArtifactBrowserCreateSectionEntryKind,
  targetFolderPath?: string,
): void {
  const stableId = getSelectedStableId();
  if (!stableId) return;
  vscode?.postMessage(createArtifactBrowserCreateSectionEntryMessage(stableId, sectionKind, entryKind, targetFolderPath));
}

function setStatus(text: string): void {
  status.set(text);
}

function isArtifactBrowserExtensionMessage(message: unknown): message is ArtifactBrowserExtensionMessage {
  if (!isProtocolMessageEnvelope(message, ARTIFACT_BROWSER_PROTOCOL, ARTIFACT_BROWSER_PROTOCOL_VERSION)) return false;
  if (!isArtifactBrowserExtensionMessageType(message.type)) return false;
  return ARTIFACT_BROWSER_EXTENSION_MESSAGE_GUARDS[message.type](message);
}

/**
 * createArtifactBrowserExtensionMessageGuard 함수.
 * Artifact Browser host message envelope와 payload guard를 결합함.
 *
 * @param type - 검증할 Artifact Browser extension message type
 * @param payloadGuard - type별 payload shape 검증 callback
 * @returns Artifact Browser extension message guard
 */
function createArtifactBrowserExtensionMessageGuard<TType extends ArtifactBrowserExtensionMessageType>(
  type: TType,
  payloadGuard: ArtifactBrowserExtensionPayloadGuard<TType>,
): (message: unknown) => message is Extract<ArtifactBrowserExtensionMessage, { type: TType }> {
  return (message: unknown): message is Extract<ArtifactBrowserExtensionMessage, { type: TType }> =>
    isProtocolEnvelope(message, ARTIFACT_BROWSER_PROTOCOL, ARTIFACT_BROWSER_PROTOCOL_VERSION, type) &&
    payloadGuard(message.payload);
}

function isArtifactBrowserCardsPayload(payload: unknown): payload is ArtifactBrowserCardsPayload {
  return isPlainRecord(payload) && Array.isArray(payload.cards);
}

function isArtifactBrowserDetailPayload(payload: unknown): payload is ArtifactBrowserDetailPayload {
  return isPlainRecord(payload) && typeof payload.stableId === 'string' && Array.isArray(payload.sections);
}

function isArtifactBrowserPackCompletedPayload(payload: unknown): payload is ArtifactBrowserPackCompletedPayload {
  return isPlainRecord(payload) && typeof payload.stableId === 'string' && typeof payload.ok === 'boolean';
}

function isArtifactBrowserExtensionMessageType(value: unknown): value is ArtifactBrowserExtensionMessageType {
  return (
    typeof value === 'string' &&
    ARTIFACT_BROWSER_EXTENSION_MESSAGE_TYPES.includes(value as ArtifactBrowserExtensionMessageType)
  );
}
