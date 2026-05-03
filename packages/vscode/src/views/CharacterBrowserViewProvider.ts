/**
 * VS Code sidebar Webview View provider for the Character Browser skeleton.
 * @file packages/vscode/src/views/CharacterBrowserViewProvider.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { CharacterDetailScanner } from '../character-browser/CharacterDetailScanner';
import { ModuleDetailScanner } from '../character-browser/ModuleDetailScanner';
import * as vscode from 'vscode';
import { WorkspaceArtifactDiscoveryService } from '../character-browser/WorkspaceArtifactDiscoveryService';
import {
  createCharacterBrowserCardsMessage,
  createCharacterBrowserDetailMessage,
  isCharacterBrowserOpenItemMessage,
  isCharacterBrowserReadyMessage,
  isCharacterBrowserRefreshMessage,
  isCharacterBrowserSelectMessage,
} from '../character-browser/characterBrowserMessages';
import { CHARACTER_BROWSER_VIEW_ID, type BrowserArtifactCard, type BrowserSection } from '../character-browser/characterBrowserTypes';

/**
 * CharacterBrowserViewProvider 클래스.
 * 기존 `risuWorkbench.cards` view id에 Svelte bundle을 로드하고 typed bridge를 연결함.
 */
export class CharacterBrowserViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = CHARACTER_BROWSER_VIEW_ID;

  private view: vscode.WebviewView | undefined;
  private selectedStableId: string | undefined;
  private currentCards: BrowserArtifactCard[] = [];
  private currentSections = new Map<string, BrowserSection[]>();

  constructor(private readonly context: vscode.ExtensionContext) {}

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
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (isCharacterBrowserReadyMessage(message)) {
          void this.sendDiscoveredCards(webviewView.webview);
          return;
        }

        if (isCharacterBrowserRefreshMessage(message)) {
          void this.sendDiscoveredCards(webviewView.webview);
          return;
        }

        if (isCharacterBrowserSelectMessage(message)) {
          void this.selectCharacter(message.payload.stableId);
          return;
        }

        if (isCharacterBrowserOpenItemMessage(message)) {
          void this.openItem(message.payload.stableId, message.payload.itemId);
        }
      },
      null,
      this.context.subscriptions,
    );
  }

  private postMessage(
    message: ReturnType<typeof createCharacterBrowserCardsMessage> | ReturnType<typeof createCharacterBrowserDetailMessage>,
  ): void {
    void this.view?.webview.postMessage(message);
  }

  private async sendDiscoveredCards(webview: vscode.Webview): Promise<void> {
    const discoveryService = new WorkspaceArtifactDiscoveryService(webview);
    const cards = await discoveryService.discoverCards();
    this.currentCards = cards;
    if (this.selectedStableId && !cards.some((card) => card.stableId === this.selectedStableId)) {
      this.selectedStableId = undefined;
    }
    this.postMessage(createCharacterBrowserCardsMessage(cards));
  }

  /**
   * selectCharacter 함수.
   * 선택 stable id를 보존하고 artifact kind별 read-only detail scanner 결과를 webview로 전송함.
   *
   * @param stableId - Webview에서 선택한 artifact card stable id
   */
  private async selectCharacter(stableId: string): Promise<void> {
    this.selectedStableId = stableId;
    const selectedCard = this.currentCards.find((card) => card.stableId === stableId);
    if (!selectedCard) return;

    const sections = selectedCard.artifactKind === 'character'
      ? await new CharacterDetailScanner().scan(selectedCard)
      : await new ModuleDetailScanner().scan(selectedCard);
    if (this.selectedStableId !== stableId) return;

    this.currentSections.set(stableId, sections);
    this.postMessage(createCharacterBrowserDetailMessage(stableId, sections));
  }

  /**
   * openItem 함수.
   * Detail view file-backed item 요청을 VS Code editor open으로 연결함.
   *
   * @param stableId - item이 속한 character stable id
   * @param itemId - detail scanner가 만든 item stable id
   */
  private async openItem(stableId: string, itemId: string): Promise<void> {
    const sections = this.currentSections.get(stableId);
    const item = sections?.flatMap((section) => section.items).find((candidate) => candidate.id === itemId);
    if (!item?.fileUri) return;

    await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(item.fileUri));
  }

  private getHtml(webview: vscode.Webview): string {
    const webviewRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const htmlPath = path.join(webviewRoot.fsPath, 'index.html');

    if (!fs.existsSync(htmlPath)) {
      return this.getFallbackHtml(webview);
    }

    const nonce = createNonce();
    const html = fs.readFileSync(htmlPath, 'utf8');
    const assetHtml = html.replace(/(src|href)="(\.\/assets\/[^\"]+)"/g, (_match, attr, assetPath) => {
      const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, assetPath.replace('./', '')));
      return `${attr}="${assetUri.toString()}"`;
    });
    const withNonce = assetHtml.replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`);

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
 * createNonce 함수.
 * VS Code webview CSP에서 module script를 허용할 일회성 nonce를 생성함.
 *
 * @returns CSP script nonce
 */
function createNonce(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
