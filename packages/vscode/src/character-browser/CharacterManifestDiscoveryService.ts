/**
 * Workspace `.risuchar` discovery and webview card model conversion.
 * @file packages/vscode/src/character-browser/CharacterManifestDiscoveryService.ts
 */

import path from 'node:path';
import * as vscode from 'vscode';
import { createManifestReadErrorModel, RisucharManifestParser } from './RisucharManifestParser';
import type { CharacterBrowserCard, ManifestParseWarning, RisucharManifestNormalized } from './characterBrowserTypes';

const RISUCHAR_GLOB = '**/.risuchar';
const RISUCHAR_EXCLUDE_GLOB = '{**/node_modules/**,**/.git/**,**/.vscode/**,**/dist/**,**/build/**,**/out/**,**/coverage/**}';

/**
 * CharacterManifestDiscoveryService 클래스.
 * 모든 workspace folder에서 `.risuchar` marker를 찾아 sidebar card model로 변환함.
 */
export class CharacterManifestDiscoveryService {
  private readonly parser = new RisucharManifestParser();

  constructor(private readonly webview: vscode.Webview) {}

  /**
   * discoverCards 함수.
   * workspace-wide risuchar marker scan 결과를 읽고 manifest별 오류를 invalid card로 보존함.
   *
   * @returns sidebar에 전송할 manifest-backed character cards
   */
  async discoverCards(): Promise<CharacterBrowserCard[]> {
    const markerUris = await vscode.workspace.findFiles(RISUCHAR_GLOB, RISUCHAR_EXCLUDE_GLOB);
    const cards: CharacterBrowserCard[] = [];

    for (const markerUri of markerUris) {
      cards.push(await this.discoverCard(markerUri));
    }

    return cards.sort((a, b) => a.rootPathLabel.localeCompare(b.rootPathLabel));
  }

  private async discoverCard(markerUri: vscode.Uri): Promise<CharacterBrowserCard> {
    const rootUri = vscode.Uri.file(path.dirname(markerUri.fsPath));
    const context = this.createParseContext(markerUri, rootUri);

    try {
      const manifestText = Buffer.from(await vscode.workspace.fs.readFile(markerUri)).toString('utf-8');
      const manifest = this.parser.parse({ ...context, text: manifestText });
      return this.toCardModel(manifest);
    } catch (error) {
      return this.toCardModel(createManifestReadErrorModel(context, error));
    }
  }

  private createParseContext(markerUri: vscode.Uri, rootUri: vscode.Uri) {
    const rootPathLabel = getWorkspaceRelativePath(rootUri);
    const markerPathLabel = getWorkspaceRelativePath(markerUri);
    return {
      markerUri: markerUri.toString(),
      rootUri: rootUri.toString(),
      rootPathLabel,
      markerPathLabel,
      stableHashSeed: rootPathLabel,
    };
  }

  private async toCardModel(manifest: RisucharManifestNormalized): Promise<CharacterBrowserCard> {
    const warnings = [...manifest.parseWarnings];
    const imageUri = await this.resolveImageUri(manifest, warnings);
    const status = manifest.valid ? (warnings.length > 0 ? 'warning' : 'ready') : 'invalid';

    return {
      stableId: manifest.stableId,
      manifestId: manifest.manifestId,
      name: manifest.name,
      creator: manifest.creator,
      characterVersion: manifest.characterVersion,
      sourceFormat: manifest.sourceFormat,
      imageUri,
      status,
      tags: manifest.tags,
      flags: manifest.flags,
      markerUri: manifest.markerUri,
      rootUri: manifest.rootUri,
      imagePath: manifest.imagePath,
      rootPathLabel: manifest.rootPathLabel,
      markerPathLabel: manifest.markerPathLabel,
      createdAtLabel: manifest.createdAt ?? undefined,
      modifiedAtLabel: manifest.modifiedAt ?? undefined,
      warnings,
    };
  }

  private async resolveImageUri(
    manifest: RisucharManifestNormalized,
    warnings: ManifestParseWarning[],
  ): Promise<string | undefined> {
    if (!manifest.imagePath) return undefined;

    const imageUri = vscode.Uri.joinPath(vscode.Uri.parse(manifest.rootUri), ...splitRelativePath(manifest.imagePath));
    try {
      const stat = await vscode.workspace.fs.stat(imageUri);
      if (stat.type === vscode.FileType.File) {
        return this.webview.asWebviewUri(imageUri).toString();
      }
    } catch {
      // Converted into a structured warning below so one missing image never breaks discovery.
    }

    warnings.push({
      code: 'missingImageFile',
      field: 'image',
      message: `manifest.image target does not exist under the character root: ${manifest.imagePath}`,
    });
    return undefined;
  }
}

function getWorkspaceRelativePath(uri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) return uri.fsPath;
  const relative = path.relative(workspaceFolder.uri.fsPath, uri.fsPath).replace(/\\/g, '/');
  return relative ? `${workspaceFolder.name}/${relative}` : workspaceFolder.name;
}

function splitRelativePath(value: string): string[] {
  return value.split(/[\\/]+/).filter((segment) => segment && segment !== '.' && segment !== '..');
}
