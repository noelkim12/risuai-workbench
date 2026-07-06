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
import { AssetManagerService } from './AssetManagerService';
import { createAssetManagerExtensionMessage, isAssetManagerWebviewMessage } from './assetManagerMessages';
import {
  ASSET_MANAGER_VIEW_NAME,
  type AssetManagerExtensionMessage,
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

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly target: AssetManagerTarget,
  ) {
    this.rootUri = vscode.Uri.parse(target.rootUri);
    this.service = new AssetManagerService(this.rootUri.fsPath);

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
