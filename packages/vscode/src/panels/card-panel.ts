import * as vscode from 'vscode';

interface WebviewIncomingMessage {
  type: 'ping';
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
    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(
      () => {
        CardPanel.currentPanel = undefined;
      },
      null,
      context.subscriptions,
    );

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewIncomingMessage) => {
        if (message.type === 'ping') {
          this.postMessage({ type: 'pong' });
        }
      },
      null,
      context.subscriptions,
    );

    this.postMessage({ type: 'ready' });
  }

  private postMessage(message: WebviewOutgoingMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private getHtml(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Risu Card Panel</title>
  </head>
  <body>
    <h1>Risu Card Panel</h1>
    <p>Webview host skeleton is ready.</p>
    <script>
      const vscode = acquireVsCodeApi();
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'ready') {
          vscode.postMessage({ type: 'ping' });
        }
      });
    </script>
  </body>
</html>`;
  }
}
