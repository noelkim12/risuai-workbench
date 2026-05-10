import path from 'node:path';
import * as vscode from 'vscode';
import { CBS_OCCURRENCE_NAVIGATION_COMMAND } from './cbsCommands';

const SOURCE_COMMENT_PATTERN = /^(\s*)---@source\s+(.+):([0-9]+):([0-9]+)\s*$/u;
const RISULUA_LANGUAGE_IDS = new Set(['lua', 'risulua']);

interface RisuLuaSourceLinkTarget {
  column: number;
  line: number;
  linkRange: vscode.Range;
  sourcePath: string;
  targetUri: vscode.Uri;
}

export function isRisuLuaSourceLinkDocument(document: Pick<vscode.TextDocument, 'fileName' | 'languageId' | 'uri'>): boolean {
  return document.uri.scheme === 'file'
    && document.fileName.toLowerCase().endsWith('.risulua')
    && RISULUA_LANGUAGE_IDS.has(document.languageId);
}

export function createRisuLuaSourceDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
  if (!isRisuLuaSourceLinkDocument(document)) {
    return [];
  }

  const links: vscode.DocumentLink[] = [];
  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
    const line = document.lineAt(lineIndex);
    const target = parseRisuLuaSourceLinkTarget(document, line.text, lineIndex);
    if (!target) {
      continue;
    }

    const commandUri = createOpenOccurrenceCommandUri(target);
    const link = new vscode.DocumentLink(target.linkRange, commandUri);
    link.tooltip = `Open original source: ${target.sourcePath}:${target.line}:${target.column}`;
    links.push(link);
  }
  return links;
}

export function registerRisuLuaSourceDocumentLinks(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      [
        { scheme: 'file', language: 'lua', pattern: '**/*.risulua' },
        { scheme: 'file', language: 'risulua', pattern: '**/*.risulua' },
      ],
      {
        provideDocumentLinks(document) {
          return createRisuLuaSourceDocumentLinks(document);
        },
      },
    ),
  );
}

function parseRisuLuaSourceLinkTarget(
  document: vscode.TextDocument,
  lineText: string,
  lineIndex: number,
): RisuLuaSourceLinkTarget | null {
  const match = SOURCE_COMMENT_PATTERN.exec(lineText);
  if (!match) {
    return null;
  }

  const sourcePath = match[2]?.trim() ?? '';
  const sourceLine = Number.parseInt(match[3] ?? '', 10);
  const sourceColumn = Number.parseInt(match[4] ?? '', 10);
  if (sourcePath.length === 0 || !Number.isInteger(sourceLine) || !Number.isInteger(sourceColumn) || sourceLine < 1 || sourceColumn < 0) {
    return null;
  }

  const linkStartCharacter = lineText.indexOf(sourcePath);
  if (linkStartCharacter < 0) {
    return null;
  }

  const targetPath = path.isAbsolute(sourcePath)
    ? path.normalize(sourcePath)
    : path.normalize(path.join(resolveRisuLuaWorkspaceRoot(document), sourcePath));
  return {
    column: sourceColumn,
    line: sourceLine,
    linkRange: new vscode.Range(
      new vscode.Position(lineIndex, linkStartCharacter),
      new vscode.Position(lineIndex, linkStartCharacter + sourcePath.length),
    ),
    sourcePath,
    targetUri: vscode.Uri.file(targetPath),
  };
}

function resolveRisuLuaWorkspaceRoot(document: vscode.TextDocument): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (workspaceFolder) {
    return workspaceFolder.uri.fsPath;
  }

  const normalized = path.normalize(document.uri.fsPath);
  const segments = normalized.split(path.sep);
  const luaIndex = segments.lastIndexOf('lua');
  if (luaIndex > 0) {
    const root = segments.slice(0, luaIndex).join(path.sep);
    return root.length > 0 ? root : path.sep;
  }

  return path.dirname(normalized);
}

function createOpenOccurrenceCommandUri(target: RisuLuaSourceLinkTarget): vscode.Uri {
  const args = encodeURIComponent(JSON.stringify([
    {
      uri: target.targetUri.toString(),
      range: {
        start: { line: target.line - 1, character: target.column },
        end: { line: target.line - 1, character: target.column },
      },
    },
  ]));
  return vscode.Uri.parse(`command:${CBS_OCCURRENCE_NAVIGATION_COMMAND}?${args}`);
}
