/**
 * Create Wizard WebviewPanel.
 * 단일 인스턴스로 에디터 영역(ViewColumn.Active)에 열리며, create/close 메시지를 delegate에 위임함.
 * AssetManagerPanel의 webview 호스팅 골격만 재사용하고 asset 전용 로직(watcher/service/Map)은 두지 않음.
 * @file packages/vscode/src/views/CreateWizardPanel.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import {
  isArtifactBrowserCloseCreateWizardMessage,
  isArtifactBrowserCreateArtifactMessage,
} from '../artifact-browser/artifactBrowserMessages';
import type { ArtifactBrowserCreateArtifactPayload } from '../artifact-browser/artifactBrowserTypes';
import { createWebviewNonce } from '../shared/webviewNonce';
import {
  createWebviewDevServerHtml,
  getConfiguredWebviewDevServerUrl,
  getWebviewDevServerPortMapping,
} from './webviewDevServer';

const CREATE_WIZARD_VIEW_NAME = 'create-wizard';

export interface CreateWizardPanelDeps {
  onSubmit: (payload: ArtifactBrowserCreateArtifactPayload) => Promise<boolean>;
}

export class CreateWizardPanel {
  private static current: CreateWizardPanel | undefined;

  static createOrShow(context: vscode.ExtensionContext, deps: CreateWizardPanelDeps): void {
    if (CreateWizardPanel.current) {
      CreateWizardPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'risuaiWorkbench.createWizard',
      'New Workbench Item',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        portMapping: getWebviewDevServerPortMapping(),
      },
    );
    CreateWizardPanel.current = new CreateWizardPanel(panel, context, deps);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly deps: CreateWizardPanelDeps,
  ) {
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
        void this.handleMessage(message);
      },
      null,
      context.subscriptions,
    );

    this.panel.onDidDispose(
      () => {
        CreateWizardPanel.current = undefined;
      },
      null,
      context.subscriptions,
    );
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (isArtifactBrowserCreateArtifactMessage(message)) {
      const ok = await this.deps.onSubmit(message.payload);
      if (ok) this.panel.dispose();
      return;
    }
    if (isArtifactBrowserCloseCreateWizardMessage(message)) {
      this.panel.dispose();
    }
  }

  private getHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const devServerUrl = getConfiguredWebviewDevServerUrl();
    if (devServerUrl) {
      return createWebviewDevServerHtml(devServerUrl, {
        title: 'New Workbench Item',
        viewName: CREATE_WIZARD_VIEW_NAME,
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
          : `<html${attrs} data-risuai-workbench-view="${CREATE_WIZARD_VIEW_NAME}">`,
      )
      .replace(
        '</head>',
        `    <meta name="risuai-workbench-view" content="${CREATE_WIZARD_VIEW_NAME}" />\n  </head>`,
      );

    return withView.replace(
      '</head>',
      `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />\n  </head>`,
    );
  }
}
