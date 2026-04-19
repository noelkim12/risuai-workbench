import * as vscode from 'vscode';
import { CardPanel } from '../panels/card-panel';
import { AnalysisService } from '../services/analysis-service';
import { CardService } from '../services/card-service';
import { CoreCliService } from '../services/core-cli-service';

export function registerCoreCommands(
  context: vscode.ExtensionContext,
  cardService: CardService,
  analysisService: AnalysisService,
): vscode.Disposable {
  const output = vscode.window.createOutputChannel('Risu Workbench');
  const cliService = new CoreCliService();

  const commands: vscode.Disposable[] = [
    vscode.commands.registerCommand('risuWorkbench.extractCard', async () => {
      const source = await pickSingleFile('Select source card', ['charx', 'png']);
      if (!source) {
        return;
      }

      const out = await pickFolder('Select extract output folder');
      if (!out) {
        return;
      }

      await runCli(output, () =>
        cliService.run('extract', [source.fsPath, '--out', out.fsPath], {
          cwd: workspaceRoot(),
        }),
      );
    }),
    vscode.commands.registerCommand('risuWorkbench.packCard', async () => {
      const sourceDir = await pickFolder('Select extracted character folder');
      if (!sourceDir) {
        return;
      }

      const outPath = await vscode.window.showInputBox({
        title: 'Output file path',
        prompt: 'Absolute path to output .png/.charx file',
        value: `${sourceDir.fsPath}.png`,
        ignoreFocusOut: true,
      });
      if (!outPath) {
        return;
      }

      await runCli(output, () =>
        cliService.run('pack', ['--in', sourceDir.fsPath, '--out', outPath], {
          cwd: workspaceRoot(),
        }),
      );
    }),
    vscode.commands.registerCommand('risuWorkbench.analyzeLua', async () => {
      const luaFile = await pickSingleFile('Select lua file to analyze', ['lua']);
      if (!luaFile) {
        return;
      }

      const cardFile = await pickSingleFile('Select optional card file', ['json', 'png']);
      const args = [luaFile.fsPath, '--json'];
      if (cardFile) {
        args.push('--card', cardFile.fsPath);
      }

      await runCli(output, () =>
        cliService.run('analyze', args, {
          cwd: workspaceRoot(),
        }),
      );

      if (cardFile) {
        const summary = analysisService.analyzeCard(cardFile.fsPath);
        if (summary) {
          void vscode.window.showInformationMessage(
            `Card ${summary.cardName}: lorebook ${summary.lorebookEntryCount}, regex ${summary.regexScriptCount}, shared vars ${summary.linkedPairs}`,
          );
        }
      }
    }),
    vscode.commands.registerCommand('risuWorkbench.inspectCard', async (uri?: vscode.Uri) => {
      const target = uri ?? (await pickSingleFile('Select card to inspect', ['json', 'png']));
      if (!target) {
        return;
      }

      const summary = cardService.summarizeCard(target.fsPath);
      if (!summary) {
        void vscode.window.showErrorMessage(`Failed to parse card: ${target.fsPath}`);
        return;
      }

      void vscode.window.showInformationMessage(
        `${summary.name} — lorebook ${summary.lorebookEntries}, scripts ${summary.customScripts}`,
      );
    }),
    vscode.commands.registerCommand('risuWorkbench.openCardPanel', () => {
      CardPanel.createOrShow(context);
    }),
  ];

  return vscode.Disposable.from(...commands, output);
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function runCli(output: vscode.OutputChannel, runner: () => Promise<void>): Promise<void> {
  output.show(true);
  output.appendLine('[Risu Workbench] Running core CLI...');
  try {
    await runner();
    output.appendLine('[Risu Workbench] CLI completed successfully.');
    void vscode.window.showInformationMessage('Risu core command completed.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[Risu Workbench] CLI failed: ${message}`);
    void vscode.window.showErrorMessage(`Risu core command failed: ${message}`);
  }
}

async function pickSingleFile(
  title: string,
  extensions: string[],
  canPickMany = false,
): Promise<vscode.Uri | undefined> {
  const selection = await vscode.window.showOpenDialog({
    title,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: canPickMany,
    filters: {
      Files: extensions,
    },
  });
  return selection?.[0];
}

async function pickFolder(title: string): Promise<vscode.Uri | undefined> {
  const selection = await vscode.window.showOpenDialog({
    title,
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
  });
  return selection?.[0];
}
