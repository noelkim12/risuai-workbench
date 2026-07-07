/**
 * Asset Manager WebviewPanel.
 * stableId별 단일 인스턴스로 메인 영역에 열리며, 메시지를 AssetManagerService에 위임함.
 * @file packages/vscode/src/asset-manager/AssetManagerPanel.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { createWebviewNonce } from '../shared/webviewNonce';
import {
  createWebviewDevServerHtml,
  getConfiguredWebviewDevServerUrl,
  getWebviewDevServerPortMapping,
} from '../views/webviewDevServer';
import { AssetManagerService, replacementTargetForAsset } from './AssetManagerService';
import { createAssetManagerExtensionMessage, isAssetManagerWebviewMessage } from './assetManagerMessages';
import {
  ASSET_MANAGER_VIEW_NAME,
  type AssetManagerExtensionMessage,
  type AssetManagerScanSnapshot,
  type AssetManagerWebviewMessage,
} from './assetManagerTypes';

export interface AssetManagerTarget {
  stableId: string;
  name: string;
  rootUri: string;
}

export class AssetManagerPanel {
  private static readonly panels = new Map<string, AssetManagerPanel>();

  static createOrShow(context: vscode.ExtensionContext, target: AssetManagerTarget): void {
    const existing = AssetManagerPanel.panels.get(target.stableId);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'risuaiWorkbench.assetManager',
      `Assets: ${target.name}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        portMapping: getWebviewDevServerPortMapping(),
      },
    );
    AssetManagerPanel.panels.set(target.stableId, new AssetManagerPanel(panel, context, target));
  }

  private readonly service: AssetManagerService;
  private readonly rootUri: vscode.Uri;
  private readonly watcher: vscode.FileSystemWatcher;
  private fsRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private knownPaths = new Set<string>();

  private static readonly FS_REFRESH_DEBOUNCE_MS = 500;
  private static readonly REPLACE_MAX_BYTES = 50 * 1024 * 1024;
  private static readonly REPLACE_DIALOG_EXTENSIONS = [
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'avif',
    'mp3',
    'ogg',
    'wav',
    'mp4',
    'webm',
  ] as const;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly target: AssetManagerTarget,
  ) {
    this.rootUri = vscode.Uri.parse(target.rootUri);
    this.service = new AssetManagerService(this.rootUri.fsPath);
    this.rememberPaths(this.service.scan());
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.rootUri, 'assets/**/*'));
    const onFsEvent = (uri: vscode.Uri) => this.scheduleFsRefresh(uri);
    this.watcher.onDidCreate(onFsEvent, null, context.subscriptions);
    this.watcher.onDidDelete(onFsEvent, null, context.subscriptions);
    this.watcher.onDidChange(onFsEvent, null, context.subscriptions);

    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
        ...(vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? []),
      ],
      portMapping: getWebviewDevServerPortMapping(),
    };
    this.panel.webview.html = this.getHtml(context.extensionUri, this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (!isAssetManagerWebviewMessage(message)) return;
        this.handleMessage(message);
      },
      null,
      context.subscriptions,
    );

    this.panel.onDidDispose(
      () => {
        AssetManagerPanel.panels.delete(this.target.stableId);
        this.watcher.dispose();
        if (this.fsRefreshTimer !== undefined) clearTimeout(this.fsRefreshTimer);
      },
      null,
      context.subscriptions,
    );
  }

  private post(message: AssetManagerExtensionMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private postError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.post(
      createAssetManagerExtensionMessage('asset-manager/error', {
        stableId: this.target.stableId,
        context,
        message,
      }),
    );
  }

  private assetsRootWebviewUri(): string {
    return this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.rootUri, 'assets')).toString();
  }

  private sendSnapshot(type: 'asset-manager/assetsLoaded' | 'asset-manager/catalogSaved'): void {
    const snapshot = this.service.scan();
    this.rememberPaths(snapshot);
    if (type === 'asset-manager/assetsLoaded') {
      this.post(
        createAssetManagerExtensionMessage('asset-manager/assetsLoaded', {
          ...snapshot,
          stableId: this.target.stableId,
          artifactName: this.target.name,
          assetsRootWebviewUri: this.assetsRootWebviewUri(),
        }),
      );
      return;
    }
    this.post(
      createAssetManagerExtensionMessage('asset-manager/catalogSaved', {
        ...snapshot,
        stableId: this.target.stableId,
      }),
    );
  }

  private static isSelfWrittenFile(uri: vscode.Uri): boolean {
    const base = path.basename(uri.fsPath);
    return base === 'asset-catalog.json' || base.startsWith('asset-catalog.json.bak-') || base === 'manifest.json';
  }

  private scheduleFsRefresh(uri: vscode.Uri): void {
    if (AssetManagerPanel.isSelfWrittenFile(uri)) return;
    if (this.fsRefreshTimer !== undefined) clearTimeout(this.fsRefreshTimer);
    this.fsRefreshTimer = setTimeout(() => {
      this.fsRefreshTimer = undefined;
      this.refreshFromFsChange();
    }, AssetManagerPanel.FS_REFRESH_DEBOUNCE_MS);
  }

  private rememberPaths(snapshot: AssetManagerScanSnapshot): void {
    this.knownPaths = new Set(snapshot.entries.map((entry) => entry.path));
  }

  private refreshFromFsChange(): void {
    try {
      const snapshot = this.service.scan();
      const newPaths = snapshot.entries.map((entry) => entry.path).filter((entryPath) => !this.knownPaths.has(entryPath));

      if (newPaths.length > 0 && snapshot.catalog.bootstrap !== undefined) {
        const result = this.service.autoAssignNewAssets(newPaths);
        this.rememberPaths(result.snapshot);
        this.post(
          createAssetManagerExtensionMessage('asset-manager/autoAssignApplied', {
            ...result.snapshot,
            stableId: this.target.stableId,
            assignedPaths: result.assignedPaths,
            anomalyPaths: result.anomalyPaths,
            addedVocab: result.addedVocab,
          }),
        );
        return;
      }

      this.rememberPaths(snapshot);
      this.post(
        createAssetManagerExtensionMessage('asset-manager/assetsLoaded', {
          ...snapshot,
          stableId: this.target.stableId,
          artifactName: this.target.name,
          assetsRootWebviewUri: this.assetsRootWebviewUri(),
        }),
      );
    } catch (error) {
      this.postError('asset-manager/fsWatch', error);
    }
  }

  private async replaceAssetFile(relPath: string): Promise<void> {
    try {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: '이 파일로 교체',
        filters: { 'Asset files': [...AssetManagerPanel.REPLACE_DIALOG_EXTENSIONS] },
      });
      const pickedUri = picked?.[0];
      if (pickedUri === undefined) return;

      const target = replacementTargetForAsset(relPath, path.basename(pickedUri.fsPath));
      const detail =
        target.deletePath !== undefined
          ? `${relPath} → ${target.targetPath}\n기존 파일은 삭제되고 slot 할당은 새 경로로 이어집니다.`
          : `${relPath}의 내용을 선택한 파일로 덮어씁니다.`;
      const confirm = '교체';
      const answer = await vscode.window.showWarningMessage('Asset 파일을 교체할까요?', { modal: true, detail }, confirm);
      if (answer !== confirm) return;

      const bytes = await vscode.workspace.fs.readFile(pickedUri);
      if (bytes.byteLength > AssetManagerPanel.REPLACE_MAX_BYTES) {
        throw new Error(`50MB를 넘는 파일은 교체할 수 없습니다: ${path.basename(pickedUri.fsPath)}`);
      }

      const result = this.service.writeAssetFiles([
        {
          targetPath: target.targetPath,
          bytesBase64: Buffer.from(bytes).toString('base64'),
          ...(target.deletePath !== undefined && { deletePath: target.deletePath }),
        },
      ]);
      this.post(
        createAssetManagerExtensionMessage('asset-manager/assetsWritten', {
          stableId: this.target.stableId,
          writtenPaths: result.writtenPaths,
          deletedPaths: result.deletedPaths,
        }),
      );
    } catch (error) {
      this.postError('asset-manager/replaceAssetFile', error);
    }
  }

  /**
   * VS Code는 Shift 없는 외부 파일 드래그에서 webview iframe을 pointer-events:none으로 막으므로
   * (workbench WebviewWindowDragMonitor), D&D가 막힌 사용자를 위한 네이티브 파일 선택 fallback.
   */
  private async pickAssetFiles(): Promise<void> {
    try {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: true,
        openLabel: 'assets에 추가',
        filters: { 'Asset files': [...AssetManagerPanel.REPLACE_DIALOG_EXTENSIONS] },
      });
      if (picked === undefined || picked.length === 0) return;

      const files: { name: string; bytesBase64: string; sizeBytes: number }[] = [];
      const skipped: string[] = [];
      for (const uri of picked) {
        const name = path.basename(uri.fsPath);
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.byteLength > AssetManagerPanel.REPLACE_MAX_BYTES) {
          skipped.push(name);
          continue;
        }
        files.push({ name, bytesBase64: Buffer.from(bytes).toString('base64'), sizeBytes: bytes.byteLength });
      }
      this.post(
        createAssetManagerExtensionMessage('asset-manager/filesPicked', {
          stableId: this.target.stableId,
          files,
          skipped,
        }),
      );
    } catch (error) {
      this.postError('asset-manager/pickAssetFiles', error);
    }
  }

  private handleMessage(message: AssetManagerWebviewMessage): void {
    const stableId = this.target.stableId;
    try {
      switch (message.type) {
        case 'asset-manager/ready':
        case 'asset-manager/refreshAssets':
          this.sendSnapshot('asset-manager/assetsLoaded');
          return;
        case 'asset-manager/updateAssignments':
          this.service.applyAssignmentChanges(message.payload.changes);
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/updateVocab':
          this.service.updateVocab(message.payload.vocab);
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/updateSchema':
          this.service.updateSchema(message.payload.schema, message.payload.outputs);
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/updateExpected':
          this.service.updateExpected(message.payload.expected);
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/analyzeLorebookNames':
          this.post(
            createAssetManagerExtensionMessage('asset-manager/lorebookNamesResult', {
              stableId,
              candidates: this.service.lorebookNames(),
            }),
          );
          return;
        case 'asset-manager/bootstrapFromFilenames':
          this.post(
            createAssetManagerExtensionMessage('asset-manager/tokenizeResult', {
              stableId,
              ...this.service.tokenizeUnassigned(),
            }),
          );
          return;
        case 'asset-manager/bootstrapFromManifest':
          this.service.bootstrapFromManifest();
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/bootstrapCatalog':
          this.service.bootstrapCatalog({
            source: message.payload.source,
            mode: message.payload.mode,
            split: message.payload.split,
            schema: message.payload.schema,
          });
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/previewCatalogBootstrap':
          this.post(
            createAssetManagerExtensionMessage('asset-manager/catalogBootstrapPreview', {
              stableId,
              ...this.service.previewCatalogBootstrap({
                source: message.payload.source,
                mode: message.payload.mode,
                split: message.payload.split,
                schema: message.payload.schema,
              }),
            }),
          );
          return;
        case 'asset-manager/readImageMeta':
          this.post(
            createAssetManagerExtensionMessage('asset-manager/imageMetaResult', {
              stableId,
              path: message.payload.path,
              meta: this.service.readMeta(message.payload.path),
            }),
          );
          return;
        case 'asset-manager/generateOutputs':
          this.post(
            createAssetManagerExtensionMessage('asset-manager/outputsResult', {
              stableId,
              ...this.service.generateOutputs(message.payload.kinds),
            }),
          );
          return;
        case 'asset-manager/saveOutput': {
          const savedPath = this.service.saveOutput(message.payload.targetPath, message.payload.content);
          this.post(
            createAssetManagerExtensionMessage('asset-manager/outputSaved', {
              stableId,
              kind: message.payload.kind,
              savedPath,
            }),
          );
          return;
        }
        case 'asset-manager/buildManifest': {
          const summary = this.service.buildManifest();
          this.post(
            createAssetManagerExtensionMessage('asset-manager/manifestBuilt', {
              stableId,
              total: summary.total,
              named: summary.named,
              unassigned: summary.unassigned,
              duplicates: summary.duplicates,
              orphanPaths: summary.orphanPaths,
            }),
          );
          return;
        }
        case 'asset-manager/undoAutoAssign':
          this.service.undoAutoAssign({
            assignedPaths: message.payload.assignedPaths,
            addedVocab: message.payload.addedVocab,
          });
          this.sendSnapshot('asset-manager/catalogSaved');
          return;
        case 'asset-manager/writeAssets': {
          const result = this.service.writeAssetFiles(message.payload.files);
          this.post(
            createAssetManagerExtensionMessage('asset-manager/assetsWritten', {
              stableId,
              writtenPaths: result.writtenPaths,
              deletedPaths: result.deletedPaths,
            }),
          );
          return;
        }
        case 'asset-manager/replaceAssetFile':
          void this.replaceAssetFile(message.payload.path);
          return;
        case 'asset-manager/pickAssetFiles':
          void this.pickAssetFiles();
          return;
      }
    } catch (error) {
      this.postError(message.type, error);
    }
  }

  private getHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const devServerUrl = getConfiguredWebviewDevServerUrl();
    if (devServerUrl) {
      return createWebviewDevServerHtml(devServerUrl, {
        title: 'Risu Asset Manager',
        viewName: ASSET_MANAGER_VIEW_NAME,
        webview,
      });
    }

    const webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
    const htmlPath = path.join(webviewRoot.fsPath, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      return `<!doctype html><html lang="en"><body><p>Webview bundle is missing. Run the vscode package build.</p></body></html>`;
    }

    const nonce = createWebviewNonce();
    const html = fs.readFileSync(htmlPath, 'utf8');
    const assetHtml = html.replace(/(src|href)="(\.\/assets\/[^"]+)"/g, (_match, attr, assetPath) => {
      const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, assetPath.replace('./', '')));
      return `${attr}="${assetUri.toString()}"`;
    });
    const withNonce = assetHtml.replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`);
    const withView = withNonce
      .replace(/<html([^>]*)>/, (fullMatch, attrs: string) =>
        attrs.includes('data-risuai-workbench-view=')
          ? fullMatch
          : `<html${attrs} data-risuai-workbench-view="${ASSET_MANAGER_VIEW_NAME}">`,
      )
      .replace(
        '</head>',
        `    <meta name="risuai-workbench-view" content="${ASSET_MANAGER_VIEW_NAME}" />\n  </head>`,
      );

    return withView.replace(
      '</head>',
      `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />\n  </head>`,
    );
  }
}
