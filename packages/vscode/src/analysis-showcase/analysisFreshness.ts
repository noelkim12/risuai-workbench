import * as vscode from 'vscode';

const CANONICAL_SOURCE_ENTRIES = [
  '.risuchar',
  '.risumodule',
  'character',
  'lorebooks',
  'regex',
  'lua',
  'variables',
  'toggle',
  'html',
  'prompt_template',
  'assets',
] as const;

export type AnalysisFreshness = 'fresh' | 'outdated';

export async function getLatestCanonicalSourceMtime(rootUri: vscode.Uri): Promise<number | null> {
  const mtimes = await Promise.all(
    CANONICAL_SOURCE_ENTRIES.map((entry) => getLatestEntryMtime(vscode.Uri.joinPath(rootUri, entry))),
  );
  return mtimes.reduce<number | null>(
    (latest, mtime) => (mtime !== null && (latest === null || mtime > latest) ? mtime : latest),
    null,
  );
}

export async function computeAnalysisFreshness(
  rootUri: vscode.Uri,
  generatedAt: string,
): Promise<AnalysisFreshness> {
  const generatedAtMs = Date.parse(generatedAt);
  const latestSourceMtime = await getLatestCanonicalSourceMtime(rootUri);
  if (latestSourceMtime !== null && latestSourceMtime > generatedAtMs + 1000) {
    return 'outdated';
  }
  return 'fresh';
}

async function getLatestEntryMtime(uri: vscode.Uri): Promise<number | null> {
  let stat: vscode.FileStat;
  try {
    stat = await vscode.workspace.fs.stat(uri);
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }

  let latest = stat.mtime;
  if (stat.type === vscode.FileType.Directory) {
    const children = await readDirectory(uri);
    const childMtimes = await Promise.all(
      children.map(([name]) => getLatestEntryMtime(vscode.Uri.joinPath(uri, name))),
    );
    for (const childLatest of childMtimes) {
      if (childLatest !== null && childLatest > latest) {
        latest = childLatest;
      }
    }
  }
  return latest;
}

async function readDirectory(uri: vscode.Uri): Promise<readonly [string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(uri);
  } catch (error) {
    if (error instanceof Error) return [];
    throw error;
  }
}
