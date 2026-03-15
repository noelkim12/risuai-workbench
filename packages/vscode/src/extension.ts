import * as vscode from 'vscode';
import { registerCoreCommands } from './commands';
import { RisuTreeProvider } from './providers/tree-provider';
import { AnalysisService } from './services/analysis-service';
import { CardService } from './services/card-service';

export function activate(context: vscode.ExtensionContext) {
  console.log('risu-workbench-vscode extension activated');

  const cardService = new CardService();
  const analysisService = new AnalysisService(cardService);

  const treeProvider = new RisuTreeProvider(cardService);
  const treeView = vscode.window.createTreeView('risuWorkbench.cards', {
    treeDataProvider: treeProvider,
  });

  context.subscriptions.push(treeView);
  context.subscriptions.push(registerCoreCommands(context, cardService, analysisService));
}

export function deactivate() {
  console.log('risu-workbench-vscode extension deactivated');
}
