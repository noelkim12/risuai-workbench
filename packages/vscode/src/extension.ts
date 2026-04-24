import * as vscode from 'vscode';
import { CBSBracketPairHighlighter } from './cbs/legacy/providers/bracketPairProvider';
import { registerCbsAutoSuggestTrigger } from './completion/cbsAutoSuggest';
import { registerCoreCommands } from './commands';
import {
  awaitCbsLanguageClientReady,
  getCbsLanguageClientRuntimeState,
  startCbsLanguageClient,
  stopCbsLanguageClient,
  type CbsLanguageClientRuntimeState,
} from './lsp/cbsLanguageClient';
import { RisuTreeProvider } from './providers/tree-provider';
import { AnalysisService } from './services/analysis-service';
import { CardService } from './services/card-service';

/**
 * Official VS Code extension API surface.
 * Exposes runtime-test helpers from the live extension module instance.
 */
export interface RisuWorkbenchExtensionApi {
  awaitCbsLanguageClientReady: () => Promise<void>;
  getCbsLanguageClientRuntimeState: () => CbsLanguageClientRuntimeState;
  stopCbsLanguageClient: () => Promise<void>;
}

export function activate(context: vscode.ExtensionContext): RisuWorkbenchExtensionApi {
  console.log('risu-workbench-vscode extension activated');

  const cardService = new CardService();
  const analysisService = new AnalysisService(cardService);

  const treeProvider = new RisuTreeProvider(cardService);
  const treeView = vscode.window.createTreeView('risuWorkbench.cards', {
    treeDataProvider: treeProvider,
  });
  const bracketHighlighter = new CBSBracketPairHighlighter();

  context.subscriptions.push(treeView);
  context.subscriptions.push(bracketHighlighter);
  context.subscriptions.push(registerCoreCommands(context, cardService, analysisService));
  registerCbsAutoSuggestTrigger(context);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      bracketHighlighter.updateActiveEditor(editor);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        bracketHighlighter.updateActiveEditor(editor);
      }
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      bracketHighlighter.updateActiveEditor(event.textEditor);
    }),
  );

  bracketHighlighter.updateActiveEditor(vscode.window.activeTextEditor);
  
  // Start CBS language client for .risu* files
  startCbsLanguageClient(context);

  return {
    awaitCbsLanguageClientReady,
    getCbsLanguageClientRuntimeState,
    stopCbsLanguageClient,
  };
}

export async function deactivate() {
  console.log('risu-workbench-vscode extension deactivated');
  await stopCbsLanguageClient();
}
