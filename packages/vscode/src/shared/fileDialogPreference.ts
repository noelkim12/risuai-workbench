import * as vscode from 'vscode';

const USE_SYSTEM_FILE_PICKER_LABEL = 'Use system file picker';
const KEEP_VSCODE_DIALOG_LABEL = 'Keep VS Code dialog';

export async function promptForSystemFilePickerWhenSimpleDialogEnabled(): Promise<void> {
  const filesConfiguration = vscode.workspace.getConfiguration('files');
  if (filesConfiguration.get<boolean>('simpleDialog.enable') !== true) return;

  const selectedAction = await vscode.window.showInformationMessage(
    'VS Code simple file dialog is enabled. Disable it to use your system file picker for RisuAI imports?',
    USE_SYSTEM_FILE_PICKER_LABEL,
    KEEP_VSCODE_DIALOG_LABEL,
  );
  if (selectedAction !== USE_SYSTEM_FILE_PICKER_LABEL) return;

  await filesConfiguration.update('simpleDialog.enable', false, vscode.ConfigurationTarget.Global);
}
