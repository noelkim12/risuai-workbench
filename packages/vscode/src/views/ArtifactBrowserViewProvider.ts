/**
 * VS Code sidebar Webview View provider for the Artifact Browser skeleton.
 * @file packages/vscode/src/views/ArtifactBrowserViewProvider.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CharacterDetailScanner } from '../artifact-browser/CharacterDetailScanner';
import { ModuleDetailScanner } from '../artifact-browser/ModuleDetailScanner';
import * as vscode from 'vscode';
import { getErrorMessage } from '../shared/errors';
import { pickImportArtifactFileWithSystemPicker } from '../shared/systemFilePicker';
import { createWebviewNonce } from '../shared/webviewNonce';
import { WorkspaceArtifactDiscoveryService } from '../artifact-browser/WorkspaceArtifactDiscoveryService';
import { selectPreferredCard } from '../artifact-browser/cardSelection';
import {
  createDebouncedTrigger,
  isEqualOrAncestorPath,
  wireWatcherToTrigger,
  type DebouncedTrigger,
} from '../artifact-browser/artifactBrowserWatch';
import { AssetManagerPanel } from '../asset-manager/AssetManagerPanel';
import {
  createArtifactBrowserCardsMessage,
  createArtifactBrowserDetailMessage,
  createArtifactBrowserHmrStatusMessage,
  createArtifactBrowserHmrSaveCompletedMessage,
  createArtifactBrowserPackCompletedMessage,
  isArtifactBrowserAnalyzeArtifactMessage,
  isArtifactBrowserCreateArtifactMessage,
  isArtifactBrowserCreateSectionEntryMessage,
  isArtifactBrowserHmrStartBroadcastMessage,
  isArtifactBrowserHmrSavePluginMessage,
  isArtifactBrowserHmrOpenSavedPluginMessage,
  isArtifactBrowserHmrStopBroadcastMessage,
  isArtifactBrowserImportArtifactMessage,
  isArtifactBrowserImportArtifactChunkMessage,
  isArtifactBrowserMoveLorebookFolderMessage,
  isArtifactBrowserMoveLorebookItemMessage,
  isArtifactBrowserMoveGreetingItemMessage,
  isArtifactBrowserMoveRegexItemMessage,
  isArtifactBrowserOpenAssetManagerMessage,
  isArtifactBrowserOpenCreateWizardMessage,
  isArtifactBrowserOpenItemMessage,
  isArtifactBrowserOpenMarkerEditorMessage,
  isArtifactBrowserOpenAnalysisReportMessage,
  isArtifactBrowserOpenAnalysisShowcaseMessage,
  isArtifactBrowserOpenPluginViewerMessage,
  isArtifactBrowserOpenPackedOutputMessage,
  isArtifactBrowserShareAnalysisShowcaseMessage,
  isArtifactBrowserPackArtifactMessage,
  isArtifactBrowserReadyMessage,
  isArtifactBrowserRefreshMessage,
  isArtifactBrowserSelectMessage,
} from '../artifact-browser/artifactBrowserMessages';
import {
  ARTIFACT_BROWSER_VIEW_ID,
  type ArtifactBrowserCreateArtifactPayload,
  type ArtifactBrowserImportArtifactChunkPayload,
  type ArtifactBrowserImportArtifactPayload,
  type ArtifactBrowserCreateSectionEntryKind,
  type ArtifactBrowserCreateSectionKind,
  type ArtifactBrowserPackArtifactPayload,
  type ArtifactBrowserPackCompletedMessage,
  type BrowserArtifactCard,
  type BrowserItem,
  type BrowserSection,
} from '../artifact-browser/artifactBrowserTypes';
import { getHmrServerService } from '../hmr/HmrServerService';
import { HmrPluginExportService } from '../hmr/HmrPluginExportService';
import { resolvePackFormat, sanitizePackFilename, formatCompactTimestamp, pickCollisionTimestampMs } from '../artifact-browser/packArtifactPlanner';
import { CreateWizardPanel } from './CreateWizardPanel';
import { MarkerEditorViewProvider } from './MarkerEditorViewProvider';
import { PluginViewerPanel } from './PluginViewerPanel';
import { AnalysisReportService, type AnalysisReportOpenResult } from '../analysis-showcase/AnalysisReportService';
import { AnalysisShowcasePanel } from '../analysis-showcase/AnalysisShowcasePanel';
import {
  createWebviewDevServerHtml,
  getConfiguredWebviewDevServerUrl,
  getWebviewDevServerPortMapping,
} from './webviewDevServer';
import { RISUPLUGIN_FILENAME, RISUPLUGIN_KIND, RISUPLUGIN_SCHEMA_VERSION } from '../artifact-browser/risupluginManifest';

const CHARACTER_MARKER_FILENAME = '.risuchar';
const MODULE_MARKER_FILENAME = '.risumodule';
/** Coalesce window for card-list rescans triggered by external marker changes. */
const CARDS_REFRESH_DEBOUNCE_MS = 250;
/** Coalesce window for detail/asset rescans triggered by external content changes. */
const DETAIL_REFRESH_DEBOUNCE_MS = 250;
const HMR_REBUILD_DEBOUNCE_MS = 500;
const LEGACY_ANALYSIS_REPORT_BY_KIND = {
  character: 'charx-analysis.html',
  module: 'module-analysis.html',
} as const;
const IMPORT_FILE_FILTERS = {
  'RisuAI artifacts': ['charx', 'png', 'risum', 'risup', 'risupreset', 'preset', 'json'],
};
const MODULE_TABLE_IMPORT_EXTENSIONS = new Set(['.charx', '.risum']);
const SECTION_CREATE_CONFIGS = {
  lorebooks: {
    directoryName: 'lorebooks',
    fileExtension: '.risulorebook',
    defaultFolderName: 'new_lorebook_folder',
    defaultFileName: 'new_lorebook',
    fileLabel: 'Lorebook',
    folderLabel: 'Lorebook Folder',
  },
  regexRules: {
    directoryName: 'regex',
    fileExtension: '.risuregex',
    defaultFileName: 'new_regex',
    fileLabel: 'Regex Rule',
  },
  lua: {
    directoryName: 'lua',
    fileExtension: '.risulua',
    defaultFolderName: 'new_lua_folder',
    defaultFileName: 'new_lua',
    fileLabel: 'RisuLua',
    folderLabel: 'Lua Folder',
  },
} as const;

interface SectionCreationConfig {
  directoryName: string;
  fileExtension?: string;
  defaultName: string;
  label: string;
}

interface PendingImportTransfer {
  filePath: string;
  nextChunkIndex: number;
  totalChunks: number;
}

/**
 * ArtifactBrowserViewProvider 클래스.
 * 기존 `risuaiWorkbench.cards` view id에 Svelte bundle을 로드하고 typed bridge를 연결함.
 */
export class ArtifactBrowserViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = ARTIFACT_BROWSER_VIEW_ID;
  private static readonly instances = new Set<ArtifactBrowserViewProvider>();

  private view: vscode.WebviewView | undefined;
  private selectedStableId: string | undefined;
  private currentCards: BrowserArtifactCard[] = [];
  private currentSections = new Map<string, BrowserSection[]>();
  private readonly pendingImportTransfers = new Map<string, PendingImportTransfer>();
  private readonly packedOutputUris = new Map<string, vscode.Uri>();

  private detailWatcher: vscode.FileSystemWatcher | undefined;
  private detailWatcherSubscriptions: vscode.Disposable[] = [];
  private detailTrigger: DebouncedTrigger | undefined;
  private detailWatcherRootUri: string | undefined;

  private hmrWatcher: vscode.FileSystemWatcher | undefined;
  private hmrWatcherSubscriptions: vscode.Disposable[] = [];
  private hmrTrigger: DebouncedTrigger | undefined;
  private hmrStatusSubscription: vscode.Disposable | undefined;
  private artifactBrowserInitialized = false;
  private artifactBrowserInitialization: Promise<void> | undefined;
  private readonly analysisReportService = new AnalysisReportService();
  private readonly hmrPluginExportService: HmrPluginExportService;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.hmrPluginExportService = new HmrPluginExportService(context.extensionUri);
    ArtifactBrowserViewProvider.instances.add(this);
    this.registerMarkerWatcher();
    this.context.subscriptions.push({
      dispose: () => {
        this.clearDetailWatcher();
        this.clearHmrWatcher();
        this.clearHmrStatusSubscription();
        ArtifactBrowserViewProvider.instances.delete(this);
      },
    });
  }

  /**
   * registerMarkerWatcher 함수.
   * `.risuchar`/`.risumodule` marker의 외부 생성·삭제·변경을 감시해 card 목록을 debounce refresh함.
   * 외부(터미널·git·다른 에디터)에서 artifact가 추가/삭제되어도 사이드바가 즉시 갱신되도록 함.
   */
  private registerMarkerWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher(
      `**/{${CHARACTER_MARKER_FILENAME},${MODULE_MARKER_FILENAME},${RISUPLUGIN_FILENAME}}`,
    );
    const trigger = createDebouncedTrigger(() => this.refreshIfOpen(), CARDS_REFRESH_DEBOUNCE_MS);
    const subscriptions = wireWatcherToTrigger(watcher, () => trigger.trigger()) as vscode.Disposable[];

    // 폴더 전체가 삭제·이동되면 VS Code는 폴더 하나의 이벤트만 내보내고 내부 marker
    // 파일 이벤트는 생략하므로, marker glob watcher만으로는 카드 목록이 갱신되지 않음.
    const folderWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    const folderSubscriptions = [
      folderWatcher.onDidDelete((uri) => {
        if (this.coversKnownArtifactRoot(uri.fsPath)) trigger.trigger();
      }),
      folderWatcher.onDidCreate((uri) => {
        void this.triggerOnDirectoryCreate(uri, trigger);
      }),
    ];

    this.context.subscriptions.push(watcher, folderWatcher, ...subscriptions, ...folderSubscriptions, {
      dispose: () => trigger.dispose(),
    });
  }

  /**
   * coversKnownArtifactRoot 함수.
   * 삭제된 경로가 현재 카드 root와 같거나 그 상위 폴더인지 판별함.
   *
   * @param deletedFsPath - 삭제 이벤트가 발생한 파일시스템 경로
   * @returns 카드 목록 rescan이 필요한 삭제 여부
   */
  private coversKnownArtifactRoot(deletedFsPath: string): boolean {
    return this.currentCards.some((card) =>
      isEqualOrAncestorPath(deletedFsPath, vscode.Uri.parse(card.rootUri).fsPath, path.sep),
    );
  }

  /**
   * triggerOnDirectoryCreate 함수.
   * 폴더 단위 이동/복사로 생긴 create 이벤트에서만 카드 rescan을 예약함.
   * 파일 create는 marker glob watcher가 담당하므로 directory만 확인함.
   *
   * @param uri - create 이벤트가 발생한 URI
   * @param trigger - 카드 목록 debounce trigger
   */
  private async triggerOnDirectoryCreate(uri: vscode.Uri, trigger: DebouncedTrigger): Promise<void> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type & vscode.FileType.Directory) trigger.trigger();
    } catch {
      // 이벤트 처리 전에 경로가 사라진 경우: 삭제 이벤트가 별도로 처리함.
    }
  }

  /**
   * watchSelectedArtifactContents 함수.
   * 현재 선택된 artifact root 하위 파일의 외부 변경을 감시해 detail/asset section을 debounce refresh함.
   * root가 바뀔 때만 watcher를 재생성하고, 동일 root면 기존 watcher를 유지함.
   *
   * @param card - 새로 선택되었거나 refresh 후 유지된 선택 card
   */
  private watchSelectedArtifactContents(card: BrowserArtifactCard): void {
    if (this.detailWatcherRootUri === card.rootUri) return;
    this.clearDetailWatcher();

    const pattern = new vscode.RelativePattern(vscode.Uri.parse(card.rootUri), '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const stableId = card.stableId;
    const trigger = createDebouncedTrigger(
      () => this.refreshWatchedDetail(stableId),
      DETAIL_REFRESH_DEBOUNCE_MS,
    );
    this.detailWatcher = watcher;
    this.detailTrigger = trigger;
    this.detailWatcherSubscriptions = wireWatcherToTrigger(watcher, () =>
      trigger.trigger(),
    ) as vscode.Disposable[];
    this.detailWatcherRootUri = card.rootUri;
  }

  /**
   * clearDetailWatcher 함수.
   * 선택된 artifact content watcher와 관련 구독·timer를 모두 해제함.
   */
  private clearDetailWatcher(): void {
    this.detailTrigger?.dispose();
    this.detailTrigger = undefined;
    for (const subscription of this.detailWatcherSubscriptions) subscription.dispose();
    this.detailWatcherSubscriptions = [];
    this.detailWatcher?.dispose();
    this.detailWatcher = undefined;
    this.detailWatcherRootUri = undefined;
  }

  /**
   * refreshWatchedDetail 함수.
   * watcher가 가리키는 artifact가 아직 선택 상태일 때만 detail section을 다시 scan해 전송함.
   *
   * @param stableId - watcher 생성 시점에 선택되어 있던 artifact stable id
   */
  private refreshWatchedDetail(stableId: string): void {
    if (this.selectedStableId !== stableId) return;
    const card = this.currentCards.find((candidate) => candidate.stableId === stableId);
    if (!card) return;
    void this.refreshSelectedDetail(card);
  }

  /**
   * refreshOpenViews 함수.
   * 열린 Artifact Browser sidebar가 있으면 workspace artifact 목록을 다시 전송함.
   */
  static refreshOpenViews(): void {
    for (const instance of ArtifactBrowserViewProvider.instances) {
      instance.refreshIfOpen();
    }
  }

  /**
   * refreshIfOpen 함수.
   * resolve된 sidebar webview에만 새 discovery snapshot을 전송함.
   */
  private refreshIfOpen(): void {
    if (!this.view) return;
    void this.sendDiscoveredCards(this.view.webview);
  }

  /**
   * resolveWebviewView 함수.
   * Sidebar Webview View가 열릴 때 script-enabled HTML과 readiness message handler를 등록함.
   *
   * @param webviewView - VS Code가 생성한 sidebar webview view
   */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    this.artifactBrowserInitialized = false;
    this.artifactBrowserInitialization = undefined;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        ...(vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? []),
      ],
      portMapping: getWebviewDevServerPortMapping(),
    };
    webviewView.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (isArtifactBrowserReadyMessage(message)) {
          void this.initializeArtifactBrowser(webviewView.webview);
          return;
        }

        if (isArtifactBrowserRefreshMessage(message)) {
          void this.sendDiscoveredCards(webviewView.webview);
          return;
        }

        if (isArtifactBrowserCreateArtifactMessage(message)) {
          void this.createArtifactFromWizard(message.payload);
          return;
        }

        if (isArtifactBrowserImportArtifactMessage(message)) {
          void this.importArtifact(message.payload, webviewView.webview);
          return;
        }

        if (isArtifactBrowserImportArtifactChunkMessage(message)) {
          void this.importArtifactChunk(message.payload, webviewView.webview);
          return;
        }

        if (isArtifactBrowserPackArtifactMessage(message)) {
          void this.packArtifact(message.payload, webviewView.webview);
          return;
        }

        if (isArtifactBrowserOpenPackedOutputMessage(message)) {
          void this.openPackedOutput(message.payload.stableId, message.payload.destination);
          return;
        }

        if (isArtifactBrowserHmrStartBroadcastMessage(message)) {
          void this.startHmrBroadcast(message.payload.stableId).finally(() => {
            this.postMessage(createArtifactBrowserHmrStatusMessage(getHmrServerService().getStatus()));
          });
          return;
        }

        if (isArtifactBrowserHmrStopBroadcastMessage(message)) {
          void this.stopHmrBroadcast();
          return;
        }

        if (isArtifactBrowserHmrSavePluginMessage(message)) {
          void this.saveHmrPlugin();
          return;
        }

        if (isArtifactBrowserHmrOpenSavedPluginMessage(message)) {
          void this.hmrPluginExportService.openInExplorer();
          return;
        }

        if (isArtifactBrowserAnalyzeArtifactMessage(message)) {
          void this.analyzeArtifact(message.payload.stableId, webviewView.webview);
          return;
        }

        if (isArtifactBrowserOpenAnalysisShowcaseMessage(message)) {
          this.openAnalysisShowcase(message.payload.stableId, false);
          return;
        }

        if (isArtifactBrowserShareAnalysisShowcaseMessage(message)) {
          this.openAnalysisShowcase(message.payload.stableId, true);
          return;
        }

        if (isArtifactBrowserOpenAnalysisReportMessage(message)) {
          void this.openAnalysisReport(message.payload.stableId);
          return;
        }

        if (isArtifactBrowserOpenAssetManagerMessage(message)) {
          this.openAssetManager(message.payload.stableId);
          return;
        }

        if (isArtifactBrowserOpenMarkerEditorMessage(message)) {
          this.openPluginMarkerEditor(message.payload.stableId);
          return;
        }

        if (isArtifactBrowserOpenPluginViewerMessage(message)) {
          this.openPluginViewer(message.payload.stableId);
          return;
        }

        if (isArtifactBrowserOpenCreateWizardMessage(message)) {
          CreateWizardPanel.createOrShow(this.context, {
            onSubmit: (payload) => this.createArtifactFromWizard(payload),
          });
          return;
        }

        if (isArtifactBrowserSelectMessage(message)) {
          void this.selectArtifact(message.payload.stableId);
          return;
        }

        if (isArtifactBrowserOpenItemMessage(message)) {
          void this.openItem(message.payload.stableId, message.payload.itemId);
          return;
        }

        if (isArtifactBrowserCreateSectionEntryMessage(message)) {
          void this.createSectionEntry(
            message.payload.stableId,
            message.payload.sectionKind,
            message.payload.entryKind,
            message.payload.targetFolderPath,
          );
          return;
        }

        if (isArtifactBrowserMoveLorebookItemMessage(message)) {
          void this.moveLorebookItem(
            message.payload.stableId,
            message.payload.itemId,
            message.payload.targetFolderPath,
            message.payload.placement,
            message.payload.targetItemId,
          );
          return;
        }

        if (isArtifactBrowserMoveLorebookFolderMessage(message)) {
          void this.moveLorebookFolder(
            message.payload.stableId,
            message.payload.folderPath,
            message.payload.targetFolderPath,
            message.payload.placement,
          );
          return;
        }

        if (isArtifactBrowserMoveRegexItemMessage(message)) {
          void this.moveRegexItem(
            message.payload.stableId,
            message.payload.itemId,
            message.payload.targetItemId,
            message.payload.placement,
          );
          return;
        }

        if (isArtifactBrowserMoveGreetingItemMessage(message)) {
          void this.moveGreetingItem(
            message.payload.stableId,
            message.payload.itemId,
            message.payload.targetItemId,
            message.payload.placement,
          );
          return;
        }

      },
      null,
      this.context.subscriptions,
    );

    this.clearHmrStatusSubscription();
    const unsubscribeHmrStatus = getHmrServerService().onStatus((status) => {
      this.postMessage(createArtifactBrowserHmrStatusMessage(status));
    });
    this.hmrStatusSubscription = { dispose: unsubscribeHmrStatus };

    webviewView.webview.html = this.getHtml(webviewView.webview);
  }

  private postMessage(
    message:
      | ReturnType<typeof createArtifactBrowserCardsMessage>
      | ReturnType<typeof createArtifactBrowserDetailMessage>
      | ReturnType<typeof createArtifactBrowserHmrStatusMessage>
      | ReturnType<typeof createArtifactBrowserHmrSaveCompletedMessage>
      | ArtifactBrowserPackCompletedMessage,
  ): void {
    void this.view?.webview.postMessage(message);
  }

  private async initializeArtifactBrowser(webview: vscode.Webview): Promise<void> {
    if (this.artifactBrowserInitialized) return;
    if (this.artifactBrowserInitialization) return this.artifactBrowserInitialization;

    this.artifactBrowserInitialization = (async () => {
      await this.sendDiscoveredCards(webview);
      this.artifactBrowserInitialized = true;
      this.postMessage(createArtifactBrowserHmrStatusMessage(getHmrServerService().getStatus()));
    })();

    try {
      await this.artifactBrowserInitialization;
    } finally {
      this.artifactBrowserInitialization = undefined;
    }
  }

  private async createArtifactFromWizard(payload: ArtifactBrowserCreateArtifactPayload): Promise<boolean> {
    const webview = this.view?.webview;
    const workspaceRoot = getPrimaryWorkspaceRoot();
    if (!workspaceRoot) {
      void vscode.window.showErrorMessage('Open a workspace folder before creating a RisuAI artifact.');
      if (webview) await this.sendDiscoveredCards(webview);
      return false;
    }

    let createdRootUri: string | undefined;
    let created = false;
    try {
      const outDir = resolveUniqueWorkspacePath(workspaceRoot, sanitizeWorkspaceName(payload.name, 'untitled'));

      if (payload.kind === 'plugin') {
        await runCreateRisuPluginCli(payload, outDir, workspaceRoot);
        writePluginRootMarker(outDir, payload);
        void vscode.window.showInformationMessage(
          `Created plugin scaffold. Run "npm install" in ${path.basename(outDir)} before building.`,
        );
      } else {
        const args = ['scaffold', payload.kind, '--name', payload.name.trim(), '--out', outDir];
        if (payload.kind === 'charx' && payload.creator?.trim()) {
          args.push('--creator', payload.creator.trim());
        }

        await runRisuCoreCli(args, workspaceRoot);
        patchScaffoldRootMarker(outDir, payload);
        void vscode.window.showInformationMessage(`Created ${payload.kind === 'charx' ? '.risuchar' : '.risumodule'} scaffold.`);
      }

      createdRootUri = vscode.Uri.file(outDir).toString();
      created = true;
    } catch (error) {
      void vscode.window.showErrorMessage(`Create failed: ${getErrorMessage(error)}`);
    } finally {
      if (webview) await this.sendDiscoveredCards(webview, createdRootUri);
    }

    return created;
  }

  private async importArtifact(payload: ArtifactBrowserImportArtifactPayload, webview: vscode.Webview): Promise<void> {
    const workspaceRoot = getPrimaryWorkspaceRoot();
    if (!workspaceRoot) {
      void vscode.window.showErrorMessage('Open a workspace folder before importing a RisuAI artifact.');
      await this.sendDiscoveredCards(webview);
      return;
    }

    const importedFile = await resolveImportFilePath(payload);
    if (!importedFile) {
      await this.sendDiscoveredCards(webview);
      return;
    }

    try {
      await runImportPipeline(importedFile, workspaceRoot);
    } catch (error) {
      void vscode.window.showErrorMessage(`Import failed: ${getErrorMessage(error)}`);
    } finally {
      removeTemporaryImportFileIfNeeded(importedFile);
      await this.sendDiscoveredCards(webview);
    }
  }

  private async importArtifactChunk(payload: ArtifactBrowserImportArtifactChunkPayload, webview: vscode.Webview): Promise<void> {
    const workspaceRoot = getPrimaryWorkspaceRoot();
    if (!workspaceRoot) {
      void vscode.window.showErrorMessage('Open a workspace folder before importing a RisuAI artifact.');
      await this.sendDiscoveredCards(webview);
      return;
    }

    let transfer = this.pendingImportTransfers.get(payload.transferId);
    try {
      if (!transfer) {
        if (payload.chunkIndex !== 0) throw new Error(`Import chunk ${payload.transferId} started at ${payload.chunkIndex}.`);
        const filePath = createTemporaryImportFile(payload.fileName);
        transfer = { filePath, nextChunkIndex: 0, totalChunks: payload.totalChunks };
        this.pendingImportTransfers.set(payload.transferId, transfer);
      }

      if (payload.totalChunks !== transfer.totalChunks || payload.chunkIndex !== transfer.nextChunkIndex) {
        throw new Error(`Import chunk order mismatch for ${payload.fileName}.`);
      }

      fs.appendFileSync(transfer.filePath, Buffer.from(payload.chunkBase64, 'base64'));
      transfer.nextChunkIndex += 1;

      if (transfer.nextChunkIndex < transfer.totalChunks) return;

      this.pendingImportTransfers.delete(payload.transferId);
      await runImportPipeline(transfer.filePath, workspaceRoot);
      removeTemporaryImportFileIfNeeded(transfer.filePath);
      await this.sendDiscoveredCards(webview);
    } catch (error) {
      if (transfer) {
        this.pendingImportTransfers.delete(payload.transferId);
        removeTemporaryImportFileIfNeeded(transfer.filePath);
      }
      void vscode.window.showErrorMessage(`Import failed: ${getErrorMessage(error)}`);
      await this.sendDiscoveredCards(webview);
    }
  }

  private async packArtifact(payload: ArtifactBrowserPackArtifactPayload, _webview: vscode.Webview): Promise<void> {
    const stableId = payload.stableId;
    this.packedOutputUris.delete(stableId);
    const selectedCard = this.currentCards.find((card) => card.stableId === stableId);
    if (!selectedCard) {
      this.postMessage(
        createArtifactBrowserPackCompletedMessage({ stableId, ok: false, error: 'Selected artifact not found.' }),
      );
      return;
    }
    if (selectedCard.artifactKind === 'plugin') {
      const error = 'Plugin cards do not support packing yet.';
      this.postMessage(createArtifactBrowserPackCompletedMessage({ stableId, ok: false, error }));
      return;
    }

    const workspaceRoot = getPrimaryWorkspaceRoot();
    if (!workspaceRoot) {
      const error = 'Open a workspace folder before packing a RisuAI artifact.';
      void vscode.window.showErrorMessage(error);
      this.postMessage(createArtifactBrowserPackCompletedMessage({ stableId, ok: false, error }));
      return;
    }

    let archivedPath: string | undefined;
    let finalPath: string | undefined;
    try {
      const rootFsPath = vscode.Uri.parse(selectedCard.rootUri).fsPath;
      const { formatArgs, ext } = resolvePackFormat(selectedCard);
      const baseName = sanitizePackFilename(selectedCard.name, 'artifact');
      const outDir = path.join(rootFsPath, 'out');
      fs.mkdirSync(outDir, { recursive: true });
      finalPath = path.join(outDir, `${baseName}${ext}`);

      if (fs.existsSync(finalPath)) {
        const stat = fs.statSync(finalPath);
        const timestamp = formatCompactTimestamp(new Date(pickCollisionTimestampMs(stat.birthtimeMs, stat.mtimeMs)));
        archivedPath = pickUniqueArchivePath(outDir, timestamp, baseName, ext);
        fs.renameSync(finalPath, archivedPath);
      }

      const recoveryArgs = payload.recovery ? ['--risulua-recovery', 'full-source'] : [];
      await runRisuCoreCli(['pack', '--in', rootFsPath, '--out', finalPath, ...formatArgs, ...recoveryArgs], workspaceRoot);

      this.packedOutputUris.set(stableId, vscode.Uri.file(finalPath));
      void vscode.window.showInformationMessage(`Packed ${path.basename(finalPath)} to the artifact out folder.`);
      this.postMessage(
        createArtifactBrowserPackCompletedMessage({
          stableId,
          ok: true,
          outputPath: finalPath,
          outputRelativePath: `out/${path.basename(finalPath)}`,
        }),
      );
    } catch (error) {
      if (archivedPath && finalPath && !fs.existsSync(finalPath) && fs.existsSync(archivedPath)) {
        try {
          fs.renameSync(archivedPath, finalPath);
        } catch (restoreError) {
          console.warn(`Failed to restore archived artifact ${archivedPath} to ${finalPath}: ${getErrorMessage(restoreError)}`);
        }
      }
      const message = getErrorMessage(error);
      void vscode.window.showErrorMessage(`Pack failed: ${message}`);
      this.postMessage(createArtifactBrowserPackCompletedMessage({ stableId, ok: false, error: message }));
    }
  }

  private async openPackedOutput(
    stableId: string,
    destination: 'os' | 'explorer' | 'clipboard',
  ): Promise<void> {
    const outputUri = this.packedOutputUris.get(stableId);
    if (!outputUri) {
      void vscode.window.showErrorMessage('Pack the artifact before opening its output.');
      return;
    }

    if (destination === 'os') {
      await vscode.commands.executeCommand('revealFileInOS', outputUri);
      return;
    }

    if (destination === 'explorer') {
      await vscode.commands.executeCommand('revealInExplorer', outputUri);
      return;
    }

    await vscode.env.clipboard.writeText(outputUri.fsPath);
    void vscode.window.showInformationMessage('Packed artifact path copied.');
  }

  private async startHmrBroadcast(stableId: string): Promise<void> {
    const card = this.currentCards.find((candidate) => candidate.stableId === stableId);
    if (!card) {
      void vscode.window.showErrorMessage('HMR broadcast failed: Selected artifact not found.');
      return;
    }

    if (card.artifactKind === 'plugin') {
      void vscode.window.showErrorMessage('HMR broadcast failed: Plugin artifacts are not broadcastable.');
      return;
    }

    const service = getHmrServerService();
    const status = service.getStatus();
    if (status.running && status.stableId && status.stableId !== stableId) {
      const choice = await vscode.window.showWarningMessage(
        `Currently broadcasting '${status.artifactName ?? status.stableId}'. Switch to '${card.name}'?`,
        { modal: true },
        'Switch',
      );
      if (choice !== 'Switch') return;
    }

    try {
      await service.startBroadcast({
        stableId,
        name: card.name,
        kind: card.artifactKind,
        rootFsPath: vscode.Uri.parse(card.rootUri).fsPath,
      });
      this.watchHmrRoot(card.rootUri);
    } catch (error) {
      void vscode.window.showErrorMessage(`HMR broadcast failed: ${getErrorMessage(error)}`);
    }
  }

  private async saveHmrPlugin(): Promise<void> {
    const result = await this.hmrPluginExportService.save();
    this.postMessage(createArtifactBrowserHmrSaveCompletedMessage(result));
  }

  private async stopHmrBroadcast(): Promise<void> {
    this.clearHmrWatcher();
    await getHmrServerService().stop();
  }

  private watchHmrRoot(rootUri: string): void {
    this.clearHmrWatcher();
    const pattern = new vscode.RelativePattern(vscode.Uri.parse(rootUri), '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const trigger = createDebouncedTrigger(() => getHmrServerService().rebuild(), HMR_REBUILD_DEBOUNCE_MS);
    this.hmrWatcher = watcher;
    this.hmrTrigger = trigger;
    this.hmrWatcherSubscriptions = wireWatcherToTrigger(watcher, () => trigger.trigger()) as vscode.Disposable[];
  }

  private clearHmrWatcher(): void {
    this.hmrTrigger?.dispose();
    this.hmrTrigger = undefined;
    for (const subscription of this.hmrWatcherSubscriptions.splice(0)) subscription.dispose();
    this.hmrWatcher?.dispose();
    this.hmrWatcher = undefined;
  }

  private clearHmrStatusSubscription(): void {
    this.hmrStatusSubscription?.dispose();
    this.hmrStatusSubscription = undefined;
  }

  private async analyzeArtifact(stableId: string, webview: vscode.Webview): Promise<void> {
    const selectedCard = this.currentCards.find((card) => card.stableId === stableId);
    if (!selectedCard) {
      void vscode.window.showErrorMessage('Analyze failed: Selected artifact not found.');
      return;
    }
    if (selectedCard.artifactKind === 'plugin') {
      void vscode.window.showErrorMessage('Analyze failed: Plugin cards do not support analysis yet.');
      return;
    }

    const workspaceRoot = getPrimaryWorkspaceRoot();
    if (!workspaceRoot) {
      void vscode.window.showErrorMessage('Open a workspace folder before analyzing a RisuAI artifact.');
      return;
    }

    try {
      const rootFsPath = vscode.Uri.parse(selectedCard.rootUri).fsPath;
      await runAnalyzeForExtractedArtifact(rootFsPath, workspaceRoot);
      void vscode.window.showInformationMessage(`Analyzed ${selectedCard.name}.`);
      await this.sendDiscoveredCards(webview);
    } catch (error) {
      void vscode.window.showErrorMessage(`Analyze failed: ${getErrorMessage(error)}`);
    }
  }

  private openAnalysisShowcase(stableId: string, captureOnReady: boolean): void {
    const selectedCard = this.currentCards.find((card) => card.stableId === stableId);
    if (!selectedCard || selectedCard.artifactKind === 'plugin') return;
    this.openAvailableAnalysisShowcase(selectedCard, captureOnReady);
  }

  private async openAnalysisReport(stableId: string): Promise<void> {
    const selectedCard = this.currentCards.find((card) => card.stableId === stableId);
    if (!selectedCard || selectedCard.artifactKind === 'plugin') return;

    const reportFileName = this.resolveAnalysisReportFileName(selectedCard);
    if (!reportFileName) {
      void vscode.window.showErrorMessage('Analysis report is not available. Re-analyze to generate it.');
      return;
    }

    const result = await this.analysisReportService.open(vscode.Uri.parse(selectedCard.rootUri), reportFileName);
    await this.handleAnalysisReportOpenResult(result);
  }

  private resolveAnalysisReportFileName(card: BrowserArtifactCard): string | undefined {
    if (card.artifactKind === 'plugin') return undefined;

    const { analysisProfile } = card;
    switch (analysisProfile.kind) {
      case 'available':
        return analysisProfile.reportAvailable ? analysisProfile.showcase.report.html : undefined;
      case 'legacy':
        return LEGACY_ANALYSIS_REPORT_BY_KIND[card.artifactKind];
      case 'invalid':
      case 'none':
        return undefined;
    }
  }

  private async handleAnalysisReportOpenResult(result: AnalysisReportOpenResult): Promise<void> {
    switch (result.kind) {
      case 'opened':
        return;
      case 'missing':
        void vscode.window.showErrorMessage('Report file not found. Re-analyze to generate it.');
        return;
      case 'unsafe':
        void vscode.window.showErrorMessage('Report filename is invalid.');
        return;
      case 'not-opened': {
        const choice = await vscode.window.showWarningMessage(
          'The report could not be opened in the default browser.',
          'Reveal Report',
        );
        if (choice === 'Reveal Report') {
          await this.analysisReportService.reveal(result.uri);
        }
        return;
      }
    }
  }

  private openAvailableAnalysisShowcase(card: BrowserArtifactCard, captureOnReady: boolean): void {
    if (card.analysisProfile.kind !== 'available') {
      void vscode.window.showErrorMessage('Analysis Showcase is not available. Analyze this artifact first.');
      return;
    }

    AnalysisShowcasePanel.createOrShow(
      this.context,
      {
        stableId: card.stableId,
        rootUri: vscode.Uri.parse(card.rootUri),
        profile: card.analysisProfile,
      },
      { captureOnReady },
    );
  }

  private openAssetManager(stableId: string): void {
    const selectedCard = this.currentCards.find((card) => card.stableId === stableId);
    if (!selectedCard) return;

    AssetManagerPanel.createOrShow(this.context, {
      stableId: selectedCard.stableId,
      name: selectedCard.name,
      rootUri: selectedCard.rootUri,
    });
  }

  /**
   * openPluginMarkerEditor 함수.
   * Plugin detail header의 Marker Editor 버튼 요청을 `.risuplugin` marker editor open으로 연결함.
   *
   * @param stableId - 대상 plugin artifact stable id
   */
  private openPluginMarkerEditor(stableId: string): void {
    const card = this.currentCards.find((candidate) => candidate.stableId === stableId);
    if (!card || card.artifactKind !== 'plugin') return;
    MarkerEditorViewProvider.openEditor(this.context, vscode.Uri.parse(card.markerUri));
  }

  /**
   * openPluginViewer 함수.
   * Plugin detail header의 Plugin Viewer 버튼 요청을 PluginViewerPanel open으로 연결함.
   *
   * @param stableId - 대상 plugin artifact stable id
   */
  private openPluginViewer(stableId: string): void {
    const card = this.currentCards.find((candidate) => candidate.stableId === stableId);
    if (!card || card.artifactKind !== 'plugin') return;
    PluginViewerPanel.createOrShow(this.context, {
      stableId: card.stableId,
      name: card.name,
      description: card.description,
      iconUri: card.iconUri,
      rootUri: card.rootUri,
    });
  }

  private async sendDiscoveredCards(webview: vscode.Webview, preferredRootUri?: string): Promise<void> {
    const previousSelectedCard = this.selectedStableId
      ? this.currentCards.find((card) => card.stableId === this.selectedStableId)
      : undefined;
    const discoveryService = new WorkspaceArtifactDiscoveryService(webview);
    const cards = await discoveryService.discoverCards();
    const refreshedSelectedCard =
      selectPreferredCard(cards, preferredRootUri) ?? this.resolveRefreshedSelection(cards, previousSelectedCard);
    this.currentCards = cards;

    if (refreshedSelectedCard) {
      this.selectedStableId = refreshedSelectedCard.stableId;
      if (refreshedSelectedCard.artifactKind === 'plugin') {
        this.clearDetailWatcher();
      } else {
        this.watchSelectedArtifactContents(refreshedSelectedCard);
      }
    } else if (this.selectedStableId) {
      this.selectedStableId = undefined;
      this.clearDetailWatcher();
    }

    this.postMessage(createArtifactBrowserCardsMessage(cards, refreshedSelectedCard?.stableId));
    if (refreshedSelectedCard && refreshedSelectedCard.artifactKind !== 'plugin') {
      await this.postDetailSections(refreshedSelectedCard);
    }
  }

  /**
   * resolveRefreshedSelection 함수.
   * Discovery refresh 후에도 같은 marker file card를 현재 선택으로 이어붙임.
   *
   * @param cards - 새 discovery snapshot cards
   * @param previousSelectedCard - refresh 전 선택되어 있던 card
   * @returns refresh 후 유지할 선택 card
   */
  private resolveRefreshedSelection(
    cards: BrowserArtifactCard[],
    previousSelectedCard: BrowserArtifactCard | undefined,
  ): BrowserArtifactCard | undefined {
    if (!this.selectedStableId) return undefined;

    const stableIdMatch = cards.find((card) => card.stableId === this.selectedStableId);
    if (stableIdMatch) return stableIdMatch;

    if (!previousSelectedCard) return undefined;
    return cards.find((card) => card.markerUri === previousSelectedCard.markerUri);
  }

  /**
   * selectArtifact 함수.
   * 선택 stable id를 보존하고 artifact kind별 read-only detail scanner 결과를 webview로 전송함.
   *
   * @param stableId - Webview에서 선택한 artifact card stable id
   */
  private async selectArtifact(stableId: string): Promise<void> {
    this.selectedStableId = stableId;
    const selectedCard = this.currentCards.find((card) => card.stableId === stableId);
    if (!selectedCard) return;

    if (selectedCard.artifactKind === 'plugin') {
      // Plugin cards render header-action buttons instead of an accordion, so the
      // detail view gets an empty section list. Marker editor / plugin viewer are
      // opened on-demand by the header buttons, not auto-opened on selection.
      this.clearDetailWatcher();
      this.currentSections.set(stableId, []);
      this.postMessage(createArtifactBrowserDetailMessage(stableId, []));
      return;
    }

    this.watchSelectedArtifactContents(selectedCard);
    this.openMarkerEditor(selectedCard.markerUri);

    await this.postDetailSections(selectedCard);
  }

  /**
   * postDetailSections 함수.
   * 선택 card의 detail section을 scan하고 최신 선택이 유지될 때만 webview로 전송함.
   *
   * @param selectedCard - detail section을 만들 현재 선택 card
   */
  private async postDetailSections(selectedCard: BrowserArtifactCard): Promise<void> {
    if (selectedCard.artifactKind === 'plugin') return;

    const stableId = selectedCard.stableId;
    const sections =
      selectedCard.artifactKind === 'character'
        ? await new CharacterDetailScanner().scan(selectedCard)
        : await new ModuleDetailScanner().scan(selectedCard);
    if (this.selectedStableId !== stableId) return;

    this.currentSections.set(stableId, sections);
    this.postMessage(createArtifactBrowserDetailMessage(stableId, sections));
  }

  /**
   * openItem 함수.
   * Detail view file-backed item 요청을 VS Code editor open으로 연결함.
   *
   * @param stableId - item이 속한 artifact stable id
   * @param itemId - detail scanner가 만든 item stable id
   */
  private async openItem(stableId: string, itemId: string): Promise<void> {
    const sections = this.currentSections.get(stableId);
    const item = sections
      ?.flatMap((section) => section.items)
      .find((candidate) => candidate.id === itemId);
    if (!item?.fileUri) return;

    const uri = vscode.Uri.parse(item.fileUri);
    if (isRootMarkerUri(uri)) {
      MarkerEditorViewProvider.openEditor(this.context, uri);
      return;
    }

    await vscode.commands.executeCommand('vscode.open', uri);
  }

  private async createSectionEntry(
    stableId: string,
    sectionKind: ArtifactBrowserCreateSectionKind,
    entryKind: ArtifactBrowserCreateSectionEntryKind,
    targetFolderPath?: string,
  ): Promise<void> {
    const card = this.currentCards.find((entry) => entry.stableId === stableId);
    if (!card) return;
    if (sectionKind === 'character') {
      await this.createGreetingEntry(card);
      return;
    }

    const config = getSectionCreationConfig(sectionKind, entryKind);
    if (!config) return;

    const requestedName = await vscode.window.showInputBox({
      title: `Create ${config.label}`,
      prompt: `Name for the new ${config.label.toLowerCase()}. Invalid filename characters are cleaned automatically.`,
      value: config.defaultName,
      valueSelection: [0, config.defaultName.length],
      ignoreFocusOut: true,
    });
    if (requestedName === undefined) return;

    const sanitizedName = sanitizeWorkspaceName(stripKnownExtension(requestedName, config.fileExtension), config.defaultName);
    const normalizedTargetFolderPath = normalizeTargetFolderPath(targetFolderPath);
    const artifactRootUri = vscode.Uri.parse(card.rootUri);
    const sectionRootUri = vscode.Uri.joinPath(artifactRootUri, config.directoryName);
    const targetDirectoryUri = normalizedTargetFolderPath
      ? vscode.Uri.joinPath(sectionRootUri, ...normalizedTargetFolderPath.split('/'))
      : sectionRootUri;
    await vscode.workspace.fs.createDirectory(targetDirectoryUri);

    if (entryKind === 'folder') {
      const folderUri = await resolveUniqueChildUri(targetDirectoryUri, sanitizedName);
      await vscode.workspace.fs.createDirectory(folderUri);
      if (sectionKind === 'lorebooks') {
        const createdFolderPath = normalizedTargetFolderPath
          ? `${normalizedTargetFolderPath}/${path.basename(folderUri.fsPath)}`
          : path.basename(folderUri.fsPath);
        await this.appendSectionOrderPath(stableId, sectionRootUri, sectionKind, config.directoryName, createdFolderPath);
      }
      await this.refreshSelectedDetail(card);
      return;
    }

    if (!config.fileExtension) return;
    const fileUri = await resolveUniqueChildUri(targetDirectoryUri, sanitizedName, config.fileExtension);
    const fileStem = path.basename(fileUri.fsPath, config.fileExtension);
    const createdFilePath = normalizedTargetFolderPath
      ? `${normalizedTargetFolderPath}/${path.basename(fileUri.fsPath)}`
      : path.basename(fileUri.fsPath);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(renderCreatedFileContent(sectionKind, fileStem), 'utf8'));

    if (sectionKind === 'lorebooks' || sectionKind === 'regexRules') {
      await this.appendSectionOrderPath(stableId, sectionRootUri, sectionKind, config.directoryName, createdFilePath);
    }

    await this.refreshSelectedDetail(card);
    await vscode.commands.executeCommand('vscode.open', fileUri);
  }

  private async moveLorebookItem(
    stableId: string,
    itemId: string,
    targetFolderPath: string | null,
    placement: 'inside' | 'before' | 'after' = 'inside',
    targetItemId?: string,
  ): Promise<void> {
    const card = this.currentCards.find((entry) => entry.stableId === stableId);
    const item = this.findSectionItem(stableId, itemId);
    if (!card || !item?.fileUri || item.type !== 'risulorebook') return;

    const sourceUri = vscode.Uri.parse(item.fileUri);
    const sourceRelativePath = stripDirectoryPrefix(item.relativePath, 'lorebooks');
    const lorebookRootUri = vscode.Uri.joinPath(vscode.Uri.parse(card.rootUri), 'lorebooks');
    const targetDirectoryUri = targetFolderPath
      ? vscode.Uri.joinPath(lorebookRootUri, ...targetFolderPath.split('/').filter(Boolean))
      : lorebookRootUri;
    const targetUri = vscode.Uri.joinPath(targetDirectoryUri, path.basename(sourceUri.fsPath));

    if (sourceUri.toString() !== targetUri.toString()) {
      await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: false });
    }

    const targetRelativePath = targetFolderPath
      ? `${targetFolderPath}/${path.basename(targetUri.fsPath)}`
      : path.basename(targetUri.fsPath);
    await this.updateLorebookOrder(stableId, lorebookRootUri, targetRelativePath, placement, targetItemId, undefined, sourceRelativePath);
    await this.refreshSelectedDetail(card);
  }

  private async moveLorebookFolder(
    stableId: string,
    folderPath: string,
    targetFolderPath: string,
    placement: 'before' | 'after',
  ): Promise<void> {
    const card = this.currentCards.find((entry) => entry.stableId === stableId);
    if (!card || folderPath === targetFolderPath || targetFolderPath.startsWith(`${folderPath}/`)) return;

    const lorebookRootUri = vscode.Uri.joinPath(vscode.Uri.parse(card.rootUri), 'lorebooks');
    const folderName = path.posix.basename(folderPath);
    const targetParentPath = path.posix.dirname(targetFolderPath) === '.' ? null : path.posix.dirname(targetFolderPath);
    const destinationPath = targetParentPath ? `${targetParentPath}/${folderName}` : folderName;
    const sourceUri = vscode.Uri.joinPath(lorebookRootUri, ...folderPath.split('/').filter(Boolean));
    const targetUri = vscode.Uri.joinPath(lorebookRootUri, ...destinationPath.split('/').filter(Boolean));

    if (sourceUri.toString() !== targetUri.toString()) {
      await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: false });
    }

    await this.updateLorebookOrder(stableId, lorebookRootUri, destinationPath, placement, undefined, targetFolderPath, folderPath);
    await this.refreshSelectedDetail(card);
  }

  private async moveRegexItem(
    stableId: string,
    itemId: string,
    targetItemId: string,
    placement: 'before' | 'after',
  ): Promise<void> {
    const card = this.currentCards.find((entry) => entry.stableId === stableId);
    const item = this.findSectionItem(stableId, itemId);
    const targetItem = this.findSectionItem(stableId, targetItemId);
    if (!card || !item || !targetItem || item.id === targetItem.id) return;

    const regexRootUri = vscode.Uri.joinPath(vscode.Uri.parse(card.rootUri), 'regex');
    const movedPath = stripDirectoryPrefix(item.relativePath, 'regex');
    const targetPath = stripDirectoryPrefix(targetItem.relativePath, 'regex');
    if (!movedPath || !targetPath) return;

    const currentOrder = await readOrderedPaths(regexRootUri);
    const fallbackOrder = this.getSectionRelativePaths(stableId, 'regexRules', 'regex');
    await writeOrderedPaths(regexRootUri, reorderPaths(mergeOrder(currentOrder, fallbackOrder), movedPath, targetPath, placement));
    await this.refreshSelectedDetail(card);
  }

  private async moveGreetingItem(
    stableId: string,
    itemId: string,
    targetItemId: string,
    placement: 'before' | 'after',
  ): Promise<void> {
    const card = this.currentCards.find((entry) => entry.stableId === stableId);
    const item = this.findSectionItem(stableId, itemId);
    const targetItem = this.findSectionItem(stableId, targetItemId);
    if (!card || !item || !targetItem || item.id === targetItem.id) return;

    const greetingRootUri = vscode.Uri.joinPath(vscode.Uri.parse(card.rootUri), 'character', 'alternate_greetings');
    const movedPath = stripDirectoryPrefix(item.relativePath, 'character/alternate_greetings');
    const targetPath = stripDirectoryPrefix(targetItem.relativePath, 'character/alternate_greetings');
    if (!movedPath || !targetPath) return;

    const currentOrder = await readOrderedPaths(greetingRootUri);
    const fallbackOrder = this.getGreetingRelativePaths(stableId);
    await writeOrderedPaths(greetingRootUri, reorderPaths(mergeOrder(currentOrder, fallbackOrder), movedPath, targetPath, placement));
    await this.refreshSelectedDetail(card);
  }

  private async appendSectionOrderPath(
    stableId: string,
    sectionRootUri: vscode.Uri,
    sectionKind: ArtifactBrowserCreateSectionKind,
    directoryName: string,
    createdPath: string,
  ): Promise<void> {
    const currentOrder = await readOrderedPaths(sectionRootUri);
    const fallbackOrder = this.getSectionOrderPaths(stableId, sectionKind, directoryName);
    await writeOrderedPaths(sectionRootUri, appendPath(mergeOrder(currentOrder, fallbackOrder), createdPath));
  }

  private findSectionItem(stableId: string, itemId: string): BrowserItem | undefined {
    return this.currentSections
      .get(stableId)
      ?.flatMap((section) => section.items)
      .find((candidate) => candidate.id === itemId);
  }

  private async updateLorebookOrder(
    stableId: string,
    lorebookRootUri: vscode.Uri,
    movedPath: string,
    placement: 'inside' | 'before' | 'after',
    targetItemId: string | undefined,
    targetPathOverride?: string,
    previousPath?: string,
  ): Promise<void> {
    const targetItem = targetItemId ? this.findSectionItem(stableId, targetItemId) : undefined;
    const targetPath = targetPathOverride ?? (targetItem ? stripDirectoryPrefix(targetItem.relativePath, 'lorebooks') : undefined);
    const currentOrder = withoutPaths(await readOrderedPaths(lorebookRootUri), previousPath);
    const fallbackOrder = withoutPaths(this.getSectionOrderPaths(stableId, 'lorebooks', 'lorebooks'), previousPath);
    const nextOrder = targetPath && placement !== 'inside'
      ? reorderPaths(mergeOrder(currentOrder, fallbackOrder), movedPath, targetPath, placement)
      : appendPath(mergeOrder(currentOrder, fallbackOrder), movedPath);
    await writeOrderedPaths(lorebookRootUri, nextOrder);
  }

  private getSectionRelativePaths(stableId: string, sectionKind: string, directoryName: string): string[] {
    const section = this.currentSections.get(stableId)?.find((entry) => entry.kind === sectionKind);
    if (!section) return [];
    return section.items
      .map((item) => stripDirectoryPrefix(item.relativePath, directoryName))
      .filter((entry): entry is string => Boolean(entry));
  }

  private getGreetingRelativePaths(stableId: string): string[] {
    const section = this.currentSections.get(stableId)?.find((entry) => entry.kind === 'character');
    if (!section) return [];
    return section.items
      .map((item) => stripDirectoryPrefix(item.relativePath, 'character/alternate_greetings'))
      .filter((entry): entry is string => Boolean(entry));
  }

  private async createGreetingEntry(card: BrowserArtifactCard): Promise<void> {
    const greetingRootUri = vscode.Uri.joinPath(vscode.Uri.parse(card.rootUri), 'character', 'alternate_greetings');
    await vscode.workspace.fs.createDirectory(greetingRootUri);

    const existingFileNames = await listGreetingFileNames(greetingRootUri);
    const fileName = nextGreetingFileName(existingFileNames);
    const fileUri = vscode.Uri.joinPath(greetingRootUri, fileName);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from('', 'utf8'));

    const currentOrder = await readOrderedPaths(greetingRootUri);
    await writeOrderedPaths(greetingRootUri, appendPath(mergeOrder(currentOrder, existingFileNames), fileName));

    await this.refreshSelectedDetail(card);
    await vscode.commands.executeCommand('vscode.open', fileUri);
  }

  private getSectionOrderPaths(stableId: string, sectionKind: string, directoryName: string): string[] {
    const section = this.currentSections.get(stableId)?.find((entry) => entry.kind === sectionKind);
    if (!section) return [];

    const fromTree = collectTreeOrderPaths(section.tree ?? [], directoryName);
    if (fromTree.length > 0) return fromTree;

    return this.getSectionRelativePaths(stableId, sectionKind, directoryName);
  }

  private async refreshSelectedDetail(card: BrowserArtifactCard): Promise<void> {
    await this.postDetailSections(card);
  }

  /**
   * openMarkerEditor 함수.
   * 선택된 character/module card의 root marker를 marker editor panel로 엶.
   *
   * @param markerUri - 선택 card가 가리키는 `.risuchar` 또는 `.risumodule` URI 문자열
   */
  private openMarkerEditor(markerUri: string): void {
    MarkerEditorViewProvider.openEditor(this.context, vscode.Uri.parse(markerUri));
  }

  private getHtml(webview: vscode.Webview): string {
    const devServerUrl = getConfiguredWebviewDevServerUrl();
    if (devServerUrl) {
      return createWebviewDevServerHtml(devServerUrl, {
        title: 'Risu Workbench Browser',
        viewName: 'artifact-browser',
        webview,
      });
    }

    const webviewRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const htmlPath = path.join(webviewRoot.fsPath, 'index.html');

    if (!fs.existsSync(htmlPath)) {
      return this.getFallbackHtml(webview);
    }

    const nonce = createWebviewNonce();
    const html = fs.readFileSync(htmlPath, 'utf8');
    const assetHtml = html.replace(
      /(src|href)="(\.\/assets\/[^\"]+)"/g,
      (_match, attr, assetPath) => {
        const assetUri = webview.asWebviewUri(
          vscode.Uri.joinPath(webviewRoot, assetPath.replace('./', '')),
        );
        return `${attr}="${assetUri.toString()}"`;
      },
    );
    const withNonce = assetHtml.replace(
      /<script type="module"/g,
      `<script nonce="${nonce}" type="module"`,
    );

    return withNonce.replace(
      '</head>',
      `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />\n  </head>`,
    );
  }

  private getFallbackHtml(webview: vscode.Webview): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource};" />
    <title>Risu Workbench Browser</title>
  </head>
  <body>
    <h1>Risu Workbench Browser</h1>
    <p>Webview bundle is missing. Run the vscode package build to generate Vite assets.</p>
  </body>
</html>`;
  }
}

/**
 * isRootMarkerUri 함수.
 * detail item URI가 root marker manifest 파일인지 판별함.
 *
 * @param uri - detail item이 가리키는 file URI
 * @returns `.risuchar` 또는 `.risumodule` marker 여부
 */
function isRootMarkerUri(uri: vscode.Uri): boolean {
  const basename = path.basename(uri.fsPath);
  return basename === CHARACTER_MARKER_FILENAME || basename === MODULE_MARKER_FILENAME;
}


function getSectionCreationConfig(
  sectionKind: Exclude<ArtifactBrowserCreateSectionKind, 'character'>,
  entryKind: ArtifactBrowserCreateSectionEntryKind,
): SectionCreationConfig | undefined {
  const baseConfig = SECTION_CREATE_CONFIGS[sectionKind];
  if (entryKind === 'folder') {
    if (!('defaultFolderName' in baseConfig)) return undefined;
    return {
      directoryName: baseConfig.directoryName,
      defaultName: baseConfig.defaultFolderName,
      label: baseConfig.folderLabel,
    };
  }

  return {
    directoryName: baseConfig.directoryName,
    fileExtension: baseConfig.fileExtension,
    defaultName: baseConfig.defaultFileName,
    label: baseConfig.fileLabel,
  };
}

function stripKnownExtension(value: string, extension: string | undefined): string {
  const trimmed = value.trim();
  if (!extension) return trimmed;
  return trimmed.toLowerCase().endsWith(extension) ? trimmed.slice(0, -extension.length) : trimmed;
}

function sanitizeWorkspaceName(name: string, fallback: string): string {
  const cleaned = [...name]
    .map((ch) => (/[<>:"/\\|?*]/.test(ch) || ch.charCodeAt(0) < 32 ? '_' : ch))
    .join('')
    .replace(/\.\./g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 100);
  return cleaned || fallback;
}

function normalizeTargetFolderPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) return undefined;
  return segments.join('/') || undefined;
}

async function resolveUniqueChildUri(directoryUri: vscode.Uri, baseName: string, extension = ''): Promise<vscode.Uri> {
  let candidateName = `${baseName}${extension}`;
  let candidateUri = vscode.Uri.joinPath(directoryUri, candidateName);
  let suffix = 1;
  while (await uriExists(candidateUri)) {
    candidateName = `${baseName}_${suffix}${extension}`;
    candidateUri = vscode.Uri.joinPath(directoryUri, candidateName);
    suffix += 1;
  }
  return candidateUri;
}

async function listGreetingFileNames(directoryUri: vscode.Uri): Promise<string[]> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(directoryUri);
  } catch {
    return [];
  }

  return entries
    .filter(([name, fileType]) => fileType === vscode.FileType.File && name.toLowerCase().endsWith('.risutext'))
    .map(([name]) => name);
}

export function nextGreetingFileName(existingFileNames: string[]): string {
  let maxIndex = 0;
  for (const name of existingFileNames) {
    const match = /^greeting-(\d+)\.risutext$/i.exec(name);
    const digits = match?.[1];
    if (!digits) continue;

    const value = Number.parseInt(digits, 10);
    if (Number.isFinite(value) && value > maxIndex) maxIndex = value;
  }

  return `greeting-${String(maxIndex + 1).padStart(3, '0')}.risutext`;
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function renderCreatedFileContent(sectionKind: ArtifactBrowserCreateSectionKind, fileStem: string): string {
  if (sectionKind === 'lorebooks') return renderLorebookTemplate(fileStem);
  if (sectionKind === 'regexRules') return renderRegexTemplate(fileStem);
  return renderLuaTemplate(fileStem);
}

function renderLorebookTemplate(name: string): string {
  return [
    '---',
    `name: ${JSON.stringify(name)}`,
    'comment: ""',
    'mode: normal',
    'constant: false',
    'selective: false',
    'insertion_order: 100',
    'case_sensitive: false',
    'use_regex: false',
    '---',
    '@@@ KEYS',
    '',
    '@@@ CONTENT',
    '',
  ].join('\n');
}

function renderRegexTemplate(name: string): string {
  return [
    '---',
    `comment: ${JSON.stringify(name)}`,
    'type: editinput',
    '---',
    '@@@ IN',
    '',
    '@@@ OUT',
    '',
  ].join('\n');
}

function renderLuaTemplate(name: string): string {
  return [`-- ${name}`, '', ''].join('\n');
}

function collectTreeOrderPaths(nodes: BrowserSection['tree'], directoryName: string): string[] {
  if (!nodes) return [];
  const paths: string[] = [];
  for (const node of nodes) {
    const localPath = stripDirectoryPrefix(node.relativePath, directoryName) ?? node.lorebookPath ?? node.treePath;
    if (localPath) paths.push(localPath);
    paths.push(...collectTreeOrderPaths(node.children, directoryName));
  }
  return paths;
}

function stripDirectoryPrefix(relativePath: string | undefined, directoryName: string): string | undefined {
  if (!relativePath) return undefined;
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized === directoryName) return '';
  const prefix = `${directoryName}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : undefined;
}

async function readOrderedPaths(directoryUri: vscode.Uri): Promise<string[]> {
  try {
    const orderUri = vscode.Uri.joinPath(directoryUri, '_order.json');
    const content = Buffer.from(await vscode.workspace.fs.readFile(orderUri)).toString('utf8');
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  } catch {
    return [];
  }
}

async function writeOrderedPaths(directoryUri: vscode.Uri, orderedPaths: string[]): Promise<void> {
  const orderUri = vscode.Uri.joinPath(directoryUri, '_order.json');
  const uniquePaths = [...new Set(orderedPaths)];
  await vscode.workspace.fs.writeFile(orderUri, Buffer.from(`${JSON.stringify(uniquePaths, null, 2)}\n`, 'utf8'));
}

function appendPath(currentOrder: string[], movedPath: string): string[] {
  return [...currentOrder.filter((entry) => entry !== movedPath), movedPath];
}

function mergeOrder(currentOrder: string[], fallbackOrder: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const entry of [...currentOrder, ...fallbackOrder]) {
    if (seen.has(entry)) continue;
    merged.push(entry);
    seen.add(entry);
  }
  return merged;
}

function withoutPaths(paths: string[], ...removedPaths: Array<string | undefined>): string[] {
  const removed = new Set(removedPaths.filter((entry): entry is string => Boolean(entry)));
  return paths.filter((entry) => !removed.has(entry));
}

function reorderPaths(
  currentOrder: string[],
  movedPath: string,
  targetPath: string,
  placement: 'before' | 'after',
): string[] {
  const withoutMoved = currentOrder.filter((entry) => entry !== movedPath);
  const targetIndex = withoutMoved.indexOf(targetPath);
  if (targetIndex < 0) return appendPath(withoutMoved, movedPath);
  const insertIndex = placement === 'before' ? targetIndex : targetIndex + 1;
  return [...withoutMoved.slice(0, insertIndex), movedPath, ...withoutMoved.slice(insertIndex)];
}

function getPrimaryWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function resolveUniqueWorkspacePath(workspaceRoot: string, baseName: string): string {
  let candidate = path.join(workspaceRoot, baseName);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(workspaceRoot, `${baseName}_${suffix}`);
    suffix += 1;
  }
  return candidate;
}

function pickUniqueArchivePath(outDir: string, timestamp: string, baseName: string, ext: string): string {
  let candidate = path.join(outDir, `${timestamp}_${baseName}${ext}`);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(outDir, `${timestamp}_${baseName}-${suffix}${ext}`);
    suffix += 1;
  }
  return candidate;
}

async function resolveImportFilePath(payload: ArtifactBrowserImportArtifactPayload): Promise<string | undefined> {
  if (payload.fileName && payload.dataBase64) return writeTemporaryImportFile(payload.fileName, payload.dataBase64);

  const systemSelectedPath = await pickImportArtifactFileWithSystemPicker();
  if (systemSelectedPath) return systemSelectedPath;

  const selectedFiles = await vscode.window.showOpenDialog({
    title: 'Import RisuAI artifact',
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: IMPORT_FILE_FILTERS,
    openLabel: 'Import',
  });
  return selectedFiles?.[0]?.fsPath;
}

function writeTemporaryImportFile(fileName: string, dataBase64: string): string {
  const filePath = createTemporaryImportFile(fileName);
  fs.writeFileSync(filePath, Buffer.from(dataBase64, 'base64'));
  return filePath;
}

function createTemporaryImportFile(fileName: string): string {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'risuai-import-'));
  const filePath = path.join(tempDirectory, path.basename(fileName));
  return filePath;
}

function removeTemporaryImportFileIfNeeded(filePath: string): void {
  if (!path.dirname(filePath).startsWith(path.join(os.tmpdir(), 'risuai-import-'))) return;
  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
}

function resolveRisuCoreBinPath(): string {
  const coreEntry = require.resolve('@risuai-workbench/core');
  return path.join(path.dirname(coreEntry), '..', 'bin', 'risu-core.js');
}

function runNodeCli(binPath: string, args: string[], cwd: string, cliLabel: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], { cwd, env: process.env });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error((stderr.trim() || stdout.trim() || `${cliLabel} exited with code ${code}`).slice(0, 2000)));
    });
  });
}

function runRisuCoreCli(args: string[], cwd: string): Promise<string> {
  return runNodeCli(resolveRisuCoreBinPath(), args, cwd, 'risu-core');
}

function runCreateRisuPluginCli(
  payload: ArtifactBrowserCreateArtifactPayload,
  outDir: string,
  cwd: string,
): Promise<string> {
  const args = [
    payload.name.trim(),
    '--framework',
    payload.framework ?? 'vanilla',
    '--out',
    outDir,
    '--skip-install',
  ];
  if (payload.description?.trim()) {
    args.push('--description', payload.description.trim());
  }

  return runNodeCli(require.resolve('create-risu-plugin/bin/index.js'), args, cwd, 'create-risu-plugin');
}

function createImportExtractArgs(importedFile: string): string[] {
  const extractArgs = ['extract', importedFile];
  if (MODULE_TABLE_IMPORT_EXTENSIONS.has(path.extname(importedFile).toLowerCase())) {
    // `--risulua-recovery full-source` lets extract restore the original modular
    // source verbatim when the packed `main.risulua` carries an embedded recovery
    // manifest. Without it, `risuluaRecovery` defaults to 'none' and the recovery
    // block is decoded but ignored, so extract re-splits via module-table instead
    // of restoring. When no recovery block is present, decode returns null and this
    // flag has no effect (falls through to the normal module-table split path).
    extractArgs.push(
      '--risulua-mode',
      'modular',
      '--risulua-split',
      'module-table',
      '--risulua-recovery',
      'full-source',
    );
  }
  return extractArgs;
}

async function runImportExtract(importedFile: string, workspaceRoot: string): Promise<string> {
  const stdout = await runRisuCoreCli(createImportExtractArgs(importedFile), workspaceRoot);
  return resolveExtractedDir(importedFile, stdout, workspaceRoot);
}

async function runImportPipeline(importedFile: string, workspaceRoot: string): Promise<void> {
  const extractedDir = await runImportExtract(importedFile, workspaceRoot);
  await runAnalyzeForExtractedArtifact(extractedDir, workspaceRoot);
  void vscode.window.showInformationMessage(`Imported ${path.basename(importedFile)}.`);
}

async function runAnalyzeForExtractedArtifact(extractedDir: string, workspaceRoot: string): Promise<void> {
  await runRisuCoreCli(createAnalyzeArgsForExtractedArtifact(extractedDir), workspaceRoot);
}

export function createAnalyzeArgsForExtractedArtifact(extractedDir: string): string[] {
  return ['analyze', extractedDir, '--wiki', '--wiki-root', path.join(extractedDir, 'wiki')];
}

function resolveExtractedDir(importedFile: string, stdout: string, workspaceRoot: string): string {
  const outputMatch = stdout.match(/(?:추출 완료\s*(?:→|->)|Imported\s*→)\s*(.+?)\/?\s*$/m);
  if (outputMatch?.[1]) return path.resolve(workspaceRoot, outputMatch[1].trim());

  const stem = sanitizeWorkspaceName(path.basename(importedFile, path.extname(importedFile)), 'artifact');
  const prefix = MODULE_TABLE_IMPORT_EXTENSIONS.has(path.extname(importedFile).toLowerCase()) && path.extname(importedFile).toLowerCase() === '.risum'
    ? 'module'
    : 'character';
  return path.resolve(workspaceRoot, `${prefix}_${stem}`);
}

function patchScaffoldRootMarker(outDir: string, payload: ArtifactBrowserCreateArtifactPayload): void {
  const markerPath = path.join(outDir, payload.kind === 'charx' ? CHARACTER_MARKER_FILENAME : MODULE_MARKER_FILENAME);
  const manifest = readJsonObject(markerPath);
  const now = new Date().toISOString();

  manifest.name = payload.name.trim();
  manifest.modifiedAt = now;

  if (payload.kind === 'charx') {
    const flags = isPlainObject(manifest.flags) ? manifest.flags : {};
    manifest.creator = payload.creator?.trim() ?? '';
    manifest.tags = payload.tags ?? [];
    manifest.flags = {
      ...flags,
      utilityBot: payload.utilityBot === true,
      lowLevelAccess: payload.lowLevelAccess === true,
    };
  } else {
    manifest.description = payload.description?.trim() ?? '';
    manifest.lowLevelAccess = payload.lowLevelAccess === true;
  }

  fs.writeFileSync(markerPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function writePluginRootMarker(outDir: string, payload: ArtifactBrowserCreateArtifactPayload): void {
  const now = new Date().toISOString();
  const manifest = {
    kind: RISUPLUGIN_KIND,
    schemaVersion: RISUPLUGIN_SCHEMA_VERSION,
    id: payload.name.trim(),
    name: payload.name.trim(),
    description: payload.description?.trim() ?? '',
    framework: payload.framework ?? 'vanilla',
    createdAt: now,
    modifiedAt: now,
  };

  fs.writeFileSync(path.join(outDir, RISUPLUGIN_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isPlainObject(parsed)) {
    throw new Error(`Expected JSON object at ${filePath}`);
  }
  return parsed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
