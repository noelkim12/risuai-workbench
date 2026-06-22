import { execFile } from 'node:child_process';

type ExecFileResult = {
  readonly stdout: string;
};

type ExecFileCallback = (error: Error | null, stdout: string) => void;

type ExecFileRunner = (file: string, args: readonly string[]) => Promise<ExecFileResult>;

interface SystemFilePickerDeps {
  readonly platform: NodeJS.Platform;
  readonly execFile: ExecFileRunner;
}

const IMPORT_FILE_FILTER = 'RisuAI artifacts (*.charx;*.png;*.risum;*.risup;*.risupreset;*.preset;*.json)|*.charx;*.png;*.risum;*.risup;*.risupreset;*.preset;*.json|All files (*.*)|*.*';

function runExecFile(file: string, args: readonly string[]): Promise<ExecFileResult> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { windowsHide: true }, ((error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ stdout });
    }) as ExecFileCallback);
  });
}

function parsePickerStdout(stdout: string): string | undefined {
  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : undefined;
}

async function runPicker(file: string, args: readonly string[], execFileRunner: ExecFileRunner): Promise<string | undefined> {
  try {
    const result = await execFileRunner(file, args);
    return parsePickerStdout(result.stdout);
  } catch {
    return undefined;
  }
}

function buildWindowsPickerScript(): string {
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
    '$dialog.Title = "Import RisuAI artifact"',
    `$dialog.Filter = "${IMPORT_FILE_FILTER}"`,
    'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.FileName }',
  ].join('; ');
}

async function pickWithMacOs(execFileRunner: ExecFileRunner): Promise<string | undefined> {
  return runPicker(
    'osascript',
    ['-e', 'POSIX path of (choose file with prompt "Import RisuAI artifact")'],
    execFileRunner,
  );
}

async function pickWithWindows(execFileRunner: ExecFileRunner): Promise<string | undefined> {
  return runPicker(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', buildWindowsPickerScript()],
    execFileRunner,
  );
}

async function pickWithLinux(execFileRunner: ExecFileRunner): Promise<string | undefined> {
  const zenityPath = await runPicker(
    'zenity',
    [
      '--file-selection',
      '--title=Import RisuAI artifact',
      '--file-filter=RisuAI artifacts | *.charx *.png *.risum *.risup *.risupreset *.preset *.json',
      '--file-filter=All files | *',
    ],
    execFileRunner,
  );
  if (zenityPath) return zenityPath;

  return runPicker(
    'kdialog',
    ['--title', 'Import RisuAI artifact', '--getopenfilename', '', '*.charx *.png *.risum *.risup *.risupreset *.preset *.json|RisuAI artifacts'],
    execFileRunner,
  );
}

export async function pickImportArtifactFileWithSystemPickerForTest(
  deps: SystemFilePickerDeps,
): Promise<string | undefined> {
  switch (deps.platform) {
    case 'darwin':
      return pickWithMacOs(deps.execFile);
    case 'win32':
      return pickWithWindows(deps.execFile);
    case 'linux':
      return pickWithLinux(deps.execFile);
    default:
      return undefined;
  }
}

export async function pickImportArtifactFileWithSystemPicker(): Promise<string | undefined> {
  return pickImportArtifactFileWithSystemPickerForTest({
    platform: process.platform,
    execFile: runExecFile,
  });
}
