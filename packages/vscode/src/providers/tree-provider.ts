import * as vscode from 'vscode';
import { CardService } from '../services/card-service';

const CARD_GLOB = '**/*.{png,json,charx}';

export class RisuTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly cardService: CardService) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) {
      return [];
    }

    const cardFiles = await vscode.workspace.findFiles(CARD_GLOB, '**/node_modules/**', 200);
    return cardFiles.map((fileUri) => this.createCardItem(fileUri));
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  private createCardItem(fileUri: vscode.Uri): vscode.TreeItem {
    const filePath = fileUri.fsPath;
    const summary = this.cardService.summarizeCard(filePath);
    const filename = filePath.split(/[/\\]/).pop() ?? filePath;

    const item = new vscode.TreeItem(
      summary?.name ?? filename,
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = summary
      ? `lorebook ${summary.lorebookEntries} · scripts ${summary.customScripts}`
      : 'card parse failed';
    item.tooltip = filePath;
    item.resourceUri = fileUri;
    item.command = {
      command: 'vscode.open',
      title: 'Open Card File',
      arguments: [fileUri],
    };
    item.contextValue = 'risuWorkbench.cardItem';
    return item;
  }
}
