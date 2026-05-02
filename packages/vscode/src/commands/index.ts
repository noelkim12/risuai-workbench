import * as vscode from 'vscode';
import { CardPanel } from '../panels/card-panel';
import { AnalysisService } from '../services/analysis-service';
import { CardService } from '../services/card-service';
import { CoreCliService } from '../services/core-cli-service';
import {
  buildCbsActivationQuickPickItems,
  CBS_ACTIVATION_SUMMARY_COMMAND,
  type CbsActivationCodeLensPayload,
  type CbsActivationQuickPickItemModel,
} from '../lsp/cbsActivationCodeLens';
import { CBS_OCCURRENCE_NAVIGATION_COMMAND } from '../lsp/cbsLanguageClient';
import { RISU_LUALS_STUB_COMMAND, installRisuLuaWorkspaceStubs } from '../luals/risuLuaStubs';
import { RISU_CHARACTER_SELECT_IMAGE_COMMAND, selectCharacterImage } from './characterImage';

interface CbsOccurrenceNavigationTarget {
  uri?: string;
  range?: {
    start?: { line?: number; character?: number };
    end?: { line?: number; character?: number };
  };
}

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
    vscode.commands.registerCommand(RISU_CHARACTER_SELECT_IMAGE_COMMAND, async (uri?: vscode.Uri) => {
      await selectCharacterImage(uri);
    }),
    vscode.commands.registerCommand('risuWorkbench.openCardPanel', () => {
      CardPanel.createOrShow(context);
    }),
    vscode.commands.registerCommand(RISU_LUALS_STUB_COMMAND, async () => {
      await generateRisuLuaStubs(output);
    }),
    vscode.commands.registerCommand(
      CBS_OCCURRENCE_NAVIGATION_COMMAND,
      async (target?: CbsOccurrenceNavigationTarget) => {
        await openCbsOccurrence(target);
      },
    ),
    vscode.commands.registerCommand(
      CBS_ACTIVATION_SUMMARY_COMMAND,
      async (payload?: CbsActivationCodeLensPayload) => {
        await showCbsActivationSummary(payload);
      },
    ),
  ];

  return vscode.Disposable.from(...commands, output);
}

async function generateRisuLuaStubs(output: vscode.OutputChannel): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    void vscode.window.showWarningMessage(
      'Open a workspace folder before generating RisuAI Lua stubs.',
    );
    return;
  }

  try {
    const result = await installRisuLuaWorkspaceStubs(workspaceFolder);
    output.appendLine(`[Risu Workbench] Generated RisuAI LuaLS stub: ${result.stubFilePath}`);
    output.appendLine(`[Risu Workbench] Added Lua.workspace.library path: ${result.stubRootPath}`);
    void vscode.window.showInformationMessage(
      'RisuAI LuaLS stubs generated. Reload the Lua language server if hover does not update immediately.',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[Risu Workbench] Failed to generate RisuAI LuaLS stubs: ${message}`);
    void vscode.window.showErrorMessage(`Failed to generate RisuAI LuaLS stubs: ${message}`);
  }
}

async function showCbsActivationSummary(payload?: CbsActivationCodeLensPayload): Promise<void> {
  const items = buildCbsActivationQuickPickItems(payload).map(toVsCodeActivationQuickPickItem);
  const selected = await vscode.window.showQuickPick(items, {
    title: 'Lorebook activation links',
    placeHolder: '이동할 활성화 관계 엔트리를 선택하세요.',
    ignoreFocusOut: false,
  });

  if (!selected?.target) {
    return;
  }

  await openCbsOccurrence(selected.target);
}

function toVsCodeActivationQuickPickItem(
  item: CbsActivationQuickPickItemModel,
): vscode.QuickPickItem & { target?: CbsOccurrenceNavigationTarget } {
  if (item.kind === 'separator') {
    return {
      kind: vscode.QuickPickItemKind.Separator,
      label: item.label,
    };
  }

  return {
    label: item.label,
    description: item.description,
    detail: item.detail,
    target: item.target,
  };
}

async function openCbsOccurrence(target?: CbsOccurrenceNavigationTarget): Promise<void> {
  if (!target?.uri || !target.range?.start) {
    void vscode.window.showWarningMessage('CBS occurrence location is unavailable.');
    return;
  }

  const targetUri = vscode.Uri.parse(target.uri);
  if (targetUri.scheme !== 'file') {
    void vscode.window.showWarningMessage(
      'CBS occurrence navigation only supports local file targets.',
    );
    return;
  }

  const startLine = Math.max(0, target.range.start.line ?? 0);
  const startCharacter = Math.max(0, target.range.start.character ?? 0);
  const endLine = Math.max(startLine, target.range.end?.line ?? startLine);
  const endCharacter = Math.max(0, target.range.end?.character ?? startCharacter);
  const selection = new vscode.Range(
    new vscode.Position(startLine, startCharacter),
    new vscode.Position(endLine, endCharacter),
  );

  const document = await vscode.workspace.openTextDocument(targetUri);
  await vscode.window.showTextDocument(document, { selection });
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
