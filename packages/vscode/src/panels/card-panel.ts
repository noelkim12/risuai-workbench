import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';

interface WebviewIncomingMessage {
  type: 'ping' | 'webview-ready';
}

interface WebviewOutgoingMessage {
  type: 'ready' | 'pong';
}

export class CardPanel {
  private static currentPanel: CardPanel | undefined;

  static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (CardPanel.currentPanel) {
      CardPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'risuWorkbench.cardPanel',
      'Risu Card Panel',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    CardPanel.currentPanel = new CardPanel(panel, context);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
  ) {
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
    };

    this.panel.webview.html = this.getHtml(context.extensionUri, this.panel.webview);

    this.panel.onDidDispose(
      () => {
        CardPanel.currentPanel = undefined;
      },
      null,
      context.subscriptions,
    );

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewIncomingMessage) => {
        if (message.type === 'webview-ready') {
          this.postMessage({ type: 'ready' });
          return;
        }

        if (message.type === 'ping') {
          this.postMessage({ type: 'pong' });
        }
      },
      null,
      context.subscriptions,
    );
  }

  private postMessage(message: WebviewOutgoingMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private getHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
    const htmlPath = path.join(webviewRoot.fsPath, 'index.html');

    if (!fs.existsSync(htmlPath)) {
      return this.getFallbackHtml();
    }

    const nonce = createNonce();
    const html = fs.readFileSync(htmlPath, 'utf8');

    const assetHtml = html.replace(/(src|href)="(\.\/assets\/[^"]+)"/g, (_match, attr, assetPath) => {
      const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, assetPath.replace('./', '')));
      return `${attr}="${assetUri.toString()}"`;
    });

    const withNonce = assetHtml.replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`);

    return withNonce.replace(
      '</head>',
      `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />\n  </head>`,
    );
  }

  private getFallbackHtml(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Risu Card Panel</title>
  </head>
  <body>
    <h1>Risu Card Panel</h1>
    <p>Webview bundle is missing. Run the vscode package build to generate Vite assets.</p>
  </body>
</html>`;
  }
}

function createNonce(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
