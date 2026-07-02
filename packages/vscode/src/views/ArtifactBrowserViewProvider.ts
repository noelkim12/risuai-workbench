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
import {
  createArtifactBrowserCardsMessage,
  createArtifactBrowserDetailMessage,
  createArtifactBrowserPackCompletedMessage,
  isArtifactBrowserCreateArtifactMessage,
  isArtifactBrowserCreateSectionEntryMessage,
  isArtifactBrowserImportArtifactMessage,
  isArtifactBrowserMoveLorebookFolderMessage,
  isArtifactBrowserMoveLorebookItemMessage,
  isArtifactBrowserMoveRegexItemMessage,
  isArtifactBrowserOpenItemMessage,
  isArtifactBrowserPackArtifactMessage,
  isArtifactBrowserReadyMessage,
  isArtifactBrowserRefreshMessage,
  isArtifactBrowserSelectMessage,
} from '../artifact-browser/artifactBrowserMessages';
import {
  ARTIFACT_BROWSER_VIEW_ID,
  type ArtifactBrowserCreateArtifactPayload,
  type ArtifactBrowserImportArtifactPayload,
  type ArtifactBrowserCreateSectionEntryKind,
  type ArtifactBrowserCreateSectionKind,
  type ArtifactBrowserPackArtifactPayload,
  type ArtifactBrowserPackCompletedMessage,
  type BrowserArtifactCard,
  type BrowserItem,
  type BrowserSection,
} from '../artifact-browser/artifactBrowserTypes';
import { resolvePackFormat, sanitizePackFilename, formatCompactTimestamp, pickCollisionTimestampMs } from '../artifact-browser/packArtifactPlanner';
import { MarkerEditorViewProvider } from './MarkerEditorViewProvider';
import {
  createWebviewDevServerHtml,
  getConfiguredWebviewDevServerUrl,
  getWebviewDevServerPortMapping,
} from './webviewDevServer';

const CHARACTER_MARKER_FILENAME = '.risuchar';
const MODULE_MARKER_FILENAME = '.risumodule';
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

  constructor(private readonly context: vscode.ExtensionContext) {
    ArtifactBrowserViewProvider.instances.add(this);
    this.context.subscriptions.push({
      dispose: () => ArtifactBrowserViewProvider.instances.delete(this),
    });
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
          void this.sendDiscoveredCards(webviewView.webview);
          return;
        }

        if (isArtifactBrowserRefreshMessage(message)) {
          void this.sendDiscoveredCards(webviewView.webview);
          return;
        }

        if (isArtifactBrowserCreateArtifactMessage(message)) {
          void this.createArtifact(message.payload, webviewView.webview);
          return;
        }

        if (isArtifactBrowserImportArtifactMessage(message)) {
          void this.importArtifact(message.payload, webviewView.webview);
          return;
        }

        if (isArtifactBrowserPackArtifactMessage(message)) {
          void this.packArtifact(message.payload, webviewView.webview);
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

      },
      null,
      this.context.subscriptions,
    );

    webviewView.webview.html = this.getHtml(webviewView.webview);
  }

  private postMessage(
    message:
      | ReturnType<typeof createArtifactBrowserCardsMessage>
      | ReturnType<typeof createArtifactBrowserDetailMessage>
      | ArtifactBrowserPackCompletedMessage,
  ): void {
    void this.view?.webview.postMessage(message);
  }

  private async createArtifact(payload: ArtifactBrowserCreateArtifactPayload, webview: vscode.Webview): Promise<void> {
    const workspaceRoot = getPrimaryWorkspaceRoot();
    if (!workspaceRoot) {
      void vscode.window.showErrorMessage('Open a workspace folder before creating a RisuAI artifact.');
      await this.sendDiscoveredCards(webview);
      return;
    }

    try {
      const outDir = resolveUniqueWorkspacePath(workspaceRoot, sanitizeWorkspaceName(payload.name, 'untitled'));
      const args = ['scaffold', payload.kind, '--name', payload.name.trim(), '--out', outDir];
      if (payload.kind === 'charx' && payload.creator?.trim()) {
        args.push('--creator', payload.creator.trim());
      }

      await runRisuCoreCli(args, workspaceRoot);
      patchScaffoldRootMarker(outDir, payload);
      void vscode.window.showInformationMessage(`Created ${payload.kind === 'charx' ? '.risuchar' : '.risumodule'} scaffold.`);
    } catch (error) {
      void vscode.window.showErrorMessage(`Create failed: ${getErrorMessage(error)}`);
    } finally {
      await this.sendDiscoveredCards(webview);
    }
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
      await runRisuCoreCli(createImportExtractArgs(importedFile), workspaceRoot);
      void vscode.window.showInformationMessage(`Imported ${path.basename(importedFile)}.`);
    } catch (error) {
      void vscode.window.showErrorMessage(`Import failed: ${getErrorMessage(error)}`);
    } finally {
      removeTemporaryImportFileIfNeeded(importedFile);
      await this.sendDiscoveredCards(webview);
    }
  }

  private async packArtifact(payload: ArtifactBrowserPackArtifactPayload, _webview: vscode.Webview): Promise<void> {
    const selectedCard = this.currentCards.find((card) => card.stableId === payload.stableId);
    if (!selectedCard) {
      this.postMessage(createArtifactBrowserPackCompletedMessage({ ok: false, error: 'Selected artifact not found.' }));
      return;
    }

    const workspaceRoot = getPrimaryWorkspaceRoot();
    if (!workspaceRoot) {
      const error = 'Open a workspace folder before packing a RisuAI artifact.';
      void vscode.window.showErrorMessage(error);
      this.postMessage(createArtifactBrowserPackCompletedMessage({ ok: false, error }));
      return;
    }

    try {
      const rootFsPath = vscode.Uri.parse(selectedCard.rootUri).fsPath;
      const { formatArgs, ext } = resolvePackFormat(selectedCard);
      const baseName = sanitizePackFilename(selectedCard.name, 'artifact');
      const outDir = path.join(rootFsPath, 'out');
      fs.mkdirSync(outDir, { recursive: true });
      const finalPath = path.join(outDir, `${baseName}${ext}`);

      if (fs.existsSync(finalPath)) {
        const stat = fs.statSync(finalPath);
        const timestamp = formatCompactTimestamp(new Date(pickCollisionTimestampMs(stat.birthtimeMs, stat.mtimeMs)));
        const archivedPath = path.join(outDir, `${timestamp}_${baseName}${ext}`);
        fs.renameSync(finalPath, archivedPath);
      }

      const recoveryArgs = payload.recovery ? ['--risulua-recovery', 'full-source'] : [];
      await runRisuCoreCli(['pack', '--in', rootFsPath, '--out', finalPath, ...formatArgs, ...recoveryArgs], workspaceRoot);

      void vscode.window.showInformationMessage(`Packed → ${finalPath}`);
      this.postMessage(createArtifactBrowserPackCompletedMessage({ ok: true, outputPath: finalPath }));
    } catch (error) {
      const message = getErrorMessage(error);
      void vscode.window.showErrorMessage(`Pack failed: ${message}`);
      this.postMessage(createArtifactBrowserPackCompletedMessage({ ok: false, error: message }));
    }
  }

  private async sendDiscoveredCards(webview: vscode.Webview): Promise<void> {
    const previousSelectedCard = this.selectedStableId
      ? this.currentCards.find((card) => card.stableId === this.selectedStableId)
      : undefined;
    const discoveryService = new WorkspaceArtifactDiscoveryService(webview);
    const cards = await discoveryService.discoverCards();
    const refreshedSelectedCard = this.resolveRefreshedSelection(cards, previousSelectedCard);
    this.currentCards = cards;

    if (refreshedSelectedCard) {
      this.selectedStableId = refreshedSelectedCard.stableId;
    } else if (this.selectedStableId) {
      this.selectedStableId = undefined;
    }

    this.postMessage(createArtifactBrowserCardsMessage(cards, refreshedSelectedCard?.stableId));
    if (refreshedSelectedCard) {
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
    const config = getSectionCreationConfig(sectionKind, entryKind);
    if (!card || !config) return;

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
  sectionKind: ArtifactBrowserCreateSectionKind,
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
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'risuai-import-'));
  const filePath = path.join(tempDirectory, path.basename(fileName));
  fs.writeFileSync(filePath, Buffer.from(dataBase64, 'base64'));
  return filePath;
}

function removeTemporaryImportFileIfNeeded(filePath: string): void {
  if (!path.dirname(filePath).startsWith(path.join(os.tmpdir(), 'risuai-import-'))) return;
  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
}

function resolveRisuCoreBinPath(): string {
  const coreEntry = require.resolve('risu-workbench-core');
  return path.join(path.dirname(coreEntry), '..', 'bin', 'risu-core.js');
}

function runRisuCoreCli(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [resolveRisuCoreBinPath(), ...args], { cwd, env: process.env });
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
        resolve();
        return;
      }

      reject(new Error((stderr.trim() || stdout.trim() || `risu-core exited with code ${code}`).slice(0, 2000)));
    });
  });
}

function createImportExtractArgs(importedFile: string): string[] {
  const extractArgs = ['extract', importedFile];
  if (MODULE_TABLE_IMPORT_EXTENSIONS.has(path.extname(importedFile).toLowerCase())) {
    extractArgs.push('--risulua-mode', 'modular', '--risulua-split', 'module-table');
  }
  return extractArgs;
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
