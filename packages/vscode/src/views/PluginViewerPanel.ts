/**
 * Plugin Viewer webview panel: header, Build/Dev run, read-only file tree.
 * Clones the AssetManagerPanel webview-hosting skeleton (createWebviewPanel, nonce HTML, singleton Map).
 * @file packages/vscode/src/views/PluginViewerPanel.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { createWebviewNonce } from '../shared/webviewNonce';
import {
  createWebviewDevServerHtml,
  getConfiguredWebviewDevServerUrl,
  getWebviewDevServerPortMapping,
} from './webviewDevServer';
import { derivePluginPackageInfo, type PluginPackageInfo } from './pluginPackageJson';
import { shouldExcludePluginEntry } from './pluginFileTree';
import {
  createPluginViewerLoadedMessage,
  isPluginViewerOpenFileMessage,
  isPluginViewerReadyMessage,
  isPluginViewerRefreshMessage,
  isPluginViewerRunScriptMessage,
  PLUGIN_VIEWER_VIEW_NAME,
  type PluginTreeNode,
  type PluginViewerLoadedPayload,
} from './pluginViewerMessages';

export interface PluginViewerTarget {
  stableId: string;
  name: string;
  description: string;
  iconUri?: string;
  rootUri: string;
}

export class PluginViewerPanel {
  private static readonly panels = new Map<string, PluginViewerPanel>();
  private readonly rootUri: vscode.Uri;

  static createOrShow(context: vscode.ExtensionContext, target: PluginViewerTarget): void {
    const existing = PluginViewerPanel.panels.get(target.stableId);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'risuaiWorkbench.pluginViewer',
      `Plugin: ${target.name}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        portMapping: getWebviewDevServerPortMapping(),
      },
    );
    PluginViewerPanel.panels.set(target.stableId, new PluginViewerPanel(panel, context, target));
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly target: PluginViewerTarget,
  ) {
    this.rootUri = vscode.Uri.parse(target.rootUri);

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
        if (isPluginViewerReadyMessage(message) || isPluginViewerRefreshMessage(message)) {
          void this.sendSnapshot();
          return;
        }
        if (isPluginViewerRunScriptMessage(message)) {
          this.runScript(message.payload.script);
          return;
        }
        if (isPluginViewerOpenFileMessage(message)) {
          void this.openFile(message.payload.relativePath);
        }
      },
      null,
      context.subscriptions,
    );

    this.panel.onDidDispose(
      () => {
        PluginViewerPanel.panels.delete(this.target.stableId);
      },
      null,
      context.subscriptions,
    );
  }

  private async readPackageInfo(): Promise<PluginPackageInfo> {
    const packageJsonUri = vscode.Uri.joinPath(this.rootUri, 'package.json');
    try {
      const bytes = await vscode.workspace.fs.readFile(packageJsonUri);
      return derivePluginPackageInfo(Buffer.from(bytes).toString('utf-8'));
    } catch {
      return { version: null, scripts: { build: false, dev: false }, error: 'package.json not found' };
    }
  }

  private async sendSnapshot(): Promise<void> {
    const packageInfo = await this.readPackageInfo();
    const payload: PluginViewerLoadedPayload = {
      stableId: this.target.stableId,
      name: this.target.name,
      description: this.target.description,
      iconUri: this.target.iconUri ?? null,
      version: packageInfo.version,
      scripts: packageInfo.scripts,
      packageJsonError: packageInfo.error,
      tree: await this.scanTree(this.rootUri, ''),
    };
    this.panel.webview.postMessage(createPluginViewerLoadedMessage(payload));
  }

  private async scanTree(dirUri: vscode.Uri, relativePrefix: string): Promise<PluginTreeNode[]> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch {
      return [];
    }
    const nodes: PluginTreeNode[] = [];
    for (const [name, fileType] of entries) {
      if (shouldExcludePluginEntry(name)) continue;
      const relativePath = relativePrefix ? `${relativePrefix}/${name}` : name;
      if (fileType === vscode.FileType.Directory) {
        nodes.push({
          name,
          relativePath,
          kind: 'directory',
          children: await this.scanTree(vscode.Uri.joinPath(dirUri, name), relativePath),
        });
      } else if (fileType === vscode.FileType.File) {
        nodes.push({ name, relativePath, kind: 'file' });
      }
    }
    return nodes.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1,
    );
  }

  private async openFile(relativePath: string): Promise<void> {
    const fileUri = vscode.Uri.joinPath(this.rootUri, ...relativePath.split('/'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document, { preview: true });
  }

  private runScript(script: 'build' | 'dev'): void {
    const task = new vscode.Task(
      { type: 'risuaiWorkbench.pluginViewer', script },
      vscode.TaskScope.Workspace,
      `plugin: ${script}`,
      'risuai-workbench',
      new vscode.ShellExecution(`npm run ${script}`, { cwd: this.rootUri.fsPath }),
    );
    void vscode.tasks.executeTask(task);
  }

  private getHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const devServerUrl = getConfiguredWebviewDevServerUrl();
    if (devServerUrl) {
      return createWebviewDevServerHtml(devServerUrl, {
        title: 'Risu Plugin Viewer',
        viewName: PLUGIN_VIEWER_VIEW_NAME,
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
          : `<html${attrs} data-risuai-workbench-view="${PLUGIN_VIEWER_VIEW_NAME}">`,
      )
      .replace(
        '</head>',
        `    <meta name="risuai-workbench-view" content="${PLUGIN_VIEWER_VIEW_NAME}" />\n  </head>`,
      );

    return withView.replace(
      '</head>',
      `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />\n  </head>`,
    );
  }
}
