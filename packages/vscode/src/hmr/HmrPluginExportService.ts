import * as vscode from 'vscode';
import { getErrorMessage } from '../shared/errors';

export const HMR_PLUGIN_FILENAME = 'risuai-hmr-provider.js';

export type HmrPluginExportResult =
  | { readonly kind: 'saved' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly error: string };

export class HmrPluginExportService {
  private savedUri: vscode.Uri | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  async save(): Promise<HmrPluginExportResult> {
    this.savedUri = undefined;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    const destinationUri = await vscode.window.showSaveDialog({
      defaultUri: workspaceRoot
        ? vscode.Uri.joinPath(workspaceRoot, HMR_PLUGIN_FILENAME)
        : vscode.Uri.file(HMR_PLUGIN_FILENAME),
      filters: { JavaScript: ['js'] },
      saveLabel: 'Save HMR Plugin',
    });
    if (destinationUri === undefined) return { kind: 'cancelled' };

    try {
      const sourceUri = vscode.Uri.joinPath(this.extensionUri, 'dist', HMR_PLUGIN_FILENAME);
      const bytes = await vscode.workspace.fs.readFile(sourceUri);
      await vscode.workspace.fs.writeFile(destinationUri, bytes);
      this.savedUri = destinationUri;
      void vscode.window.showInformationMessage(
        'HMR plugin saved. Import the JavaScript file from the RisuAI API v3 plugin screen.',
      );
      return { kind: 'saved' };
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      const message = getErrorMessage(error);
      void vscode.window.showErrorMessage(`Failed to save HMR plugin: ${message}`);
      return { kind: 'failed', error: message };
    }
  }

  async openInExplorer(): Promise<void> {
    if (this.savedUri === undefined) {
      void vscode.window.showErrorMessage('Save the HMR plugin before opening it in Explorer.');
      return;
    }
    await vscode.commands.executeCommand('revealInExplorer', this.savedUri);
  }
}
