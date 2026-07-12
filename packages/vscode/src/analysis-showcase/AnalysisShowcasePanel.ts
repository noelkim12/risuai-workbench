/**
 * Analysis Showcase webview panel: singleton per stableId, guarded messages,
 * service delegation to AnalysisReportService and AnalysisPngExportService.
 * @file packages/vscode/src/analysis-showcase/AnalysisShowcasePanel.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { createWebviewNonce } from '../shared/webviewNonce';
import { getErrorMessage } from '../shared/errors';
import {
  createWebviewDevServerHtml,
  getConfiguredWebviewDevServerUrl,
  getWebviewDevServerPortMapping,
} from '../views/webviewDevServer';
import {
  createAnalysisShowcaseLoadedMessage,
  createAnalysisShowcaseSaveCompletedMessage,
  createAnalysisShowcaseErrorMessage,
  isAnalysisShowcaseReadyMessage,
  isAnalysisShowcaseOpenFullReportMessage,
  isAnalysisShowcaseSavePngMessage,
  isAnalysisShowcasePngCaptureFailedMessage,
} from './analysisShowcaseProtocol';
import { AnalysisReportService } from './AnalysisReportService';
import { AnalysisPngExportService } from './AnalysisPngExportService';
import type { BrowserAnalysisProfile } from './AnalysisProfileService';

const SHOWCASE_VIEW_NAME = 'analysis-showcase';

export interface AnalysisShowcaseTarget {
  readonly stableId: string;
  readonly rootUri: vscode.Uri;
  readonly profile: Extract<BrowserAnalysisProfile, { readonly kind: 'available' }>;
}

export class AnalysisShowcasePanel {
  private static readonly panels = new Map<string, AnalysisShowcasePanel>();
  private readonly reportService = new AnalysisReportService();
  private readonly pngExportService = new AnalysisPngExportService();

  static createOrShow(
    context: vscode.ExtensionContext,
    target: AnalysisShowcaseTarget,
    options: { readonly captureOnReady: boolean },
  ): void {
    const existing = AnalysisShowcasePanel.panels.get(target.stableId);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      existing.captureOnReady = options.captureOnReady;
      existing.sendLoaded();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'risuaiWorkbench.analysisShowcase',
      `Showcase: ${target.profile.showcase.artifact.name}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        portMapping: getWebviewDevServerPortMapping(),
      },
    );

    AnalysisShowcasePanel.panels.set(
      target.stableId,
      new AnalysisShowcasePanel(panel, context, target, options.captureOnReady),
    );
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly target: AnalysisShowcaseTarget,
    private captureOnReady: boolean,
  ) {
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
      portMapping: getWebviewDevServerPortMapping(),
    };

    this.panel.webview.html = this.getHtml(context.extensionUri, this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (isAnalysisShowcaseReadyMessage(message)) {
          void this.handleReady();
          return;
        }
        if (isAnalysisShowcaseOpenFullReportMessage(message)) {
          void this.handleOpenFullReport();
          return;
        }
        if (isAnalysisShowcaseSavePngMessage(message)) {
          void this.handleSavePng(message.payload.dataUrl);
          return;
        }
        if (isAnalysisShowcasePngCaptureFailedMessage(message)) {
          this.handlePngCaptureFailed(message.payload.message);
        }
      },
      null,
      context.subscriptions,
    );

    this.panel.onDidDispose(
      () => {
        AnalysisShowcasePanel.panels.delete(this.target.stableId);
      },
      null,
      context.subscriptions,
    );
  }

  private async handleReady(): Promise<void> {
    this.sendLoaded();
  }

  private sendLoaded(): void {
    const { showcase, freshness, reportAvailable } = this.target.profile;
    this.panel.webview.postMessage(
      createAnalysisShowcaseLoadedMessage({
        showcase,
        freshness,
        reportAvailable,
        captureOnReady: this.captureOnReady,
      }),
    );
  }

  private async handleOpenFullReport(): Promise<void> {
    const result = await this.reportService.open(
      this.target.rootUri,
      this.target.profile.showcase.report.html,
    );

    switch (result.kind) {
      case 'opened':
        return;
      case 'missing':
        this.panel.webview.postMessage(
          createAnalysisShowcaseErrorMessage('Report file not found. Re-analyze to generate it.'),
        );
        return;
      case 'unsafe':
        this.panel.webview.postMessage(
          createAnalysisShowcaseErrorMessage('Report filename is invalid.'),
        );
        return;
      case 'not-opened': {
        const choice = await vscode.window.showWarningMessage(
          'The report could not be opened in the default browser.',
          'Reveal Report',
        );
        if (choice === 'Reveal Report') {
          await this.reportService.reveal(result.uri);
        }
        return;
      }
    }
  }

  private async handleSavePng(dataUrl: string): Promise<void> {
    try {
      const result = await this.pngExportService.save(
        this.target.profile.showcase.artifact.name,
        dataUrl,
      );
      if (result.kind === 'saved') {
        this.panel.webview.postMessage(createAnalysisShowcaseSaveCompletedMessage());
      }
    } catch (error) {
      this.panel.webview.postMessage(
        createAnalysisShowcaseErrorMessage(getErrorMessage(error)),
      );
    }
  }

  private handlePngCaptureFailed(message: string): void {
    this.panel.webview.postMessage(createAnalysisShowcaseErrorMessage(message));
  }

  private getHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const devServerUrl = getConfiguredWebviewDevServerUrl();
    if (devServerUrl) {
      return createWebviewDevServerHtml(devServerUrl, {
        title: 'Analysis Showcase',
        viewName: SHOWCASE_VIEW_NAME,
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
          : `<html${attrs} data-risuai-workbench-view="${SHOWCASE_VIEW_NAME}">`,
      )
      .replace(
        '</head>',
        `    <meta name="risuai-workbench-view" content="${SHOWCASE_VIEW_NAME}" />\n  </head>`,
      );

    return withView.replace(
      '</head>',
      `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />\n  </head>`,
    );
  }
}
