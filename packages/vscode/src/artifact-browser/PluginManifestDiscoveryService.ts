/**
 * Workspace `.risuplugin` discovery and plugin card model conversion.
 * @file packages/vscode/src/artifact-browser/PluginManifestDiscoveryService.ts
 */

import path from 'node:path';
import * as vscode from 'vscode';
import {
  createHashFallbackStableId,
  findArtifactMarkers,
  getWorkspaceRelativePath,
  readManifestText,
  sortArtifactCardsByRootLabel,
  withArtifactKindStableId,
} from './shared/manifestDiscovery';
import { parseRisupluginManifest, RISUPLUGIN_FILENAME } from './risupluginManifest';
import type { BrowserAnalysisProfile, ManifestParseWarning, PluginBrowserCard } from './artifactBrowserTypes';
import { getErrorMessage } from '../shared/errors';

export const RISUPLUGIN_GLOB = `**/${RISUPLUGIN_FILENAME}`;

/**
 * PluginManifestDiscoveryService 클래스.
 * 모든 workspace folder에서 `.risuplugin` marker를 찾아 plugin card model로 변환함.
 */
export class PluginManifestDiscoveryService {
  constructor(private readonly webview?: vscode.Webview) {}

  /**
   * discoverCards 함수.
   * workspace-wide risuplugin marker scan 결과를 card로 변환하고 marker별 오류를 보존함.
   *
   * @returns sidebar에 전송할 plugin cards
   */
  async discoverCards(): Promise<PluginBrowserCard[]> {
    const markerUris = await findArtifactMarkers(RISUPLUGIN_GLOB);
    const cards: PluginBrowserCard[] = [];

    for (const markerUri of markerUris) {
      cards.push(await this.discoverCard(markerUri));
    }

    return sortArtifactCardsByRootLabel(cards);
  }

  private async discoverCard(markerUri: vscode.Uri): Promise<PluginBrowserCard> {
    const rootUri = vscode.Uri.file(path.dirname(markerUri.fsPath));
    const base = {
      markerUri: markerUri.toString(),
      rootUri: rootUri.toString(),
      rootPathLabel: getWorkspaceRelativePath(rootUri),
      markerPathLabel: getWorkspaceRelativePath(markerUri),
    };

    try {
      const manifest = parseRisupluginManifest(await readManifestText(markerUri), markerUri.fsPath);
      const iconUri = await this.resolveIconUri(rootUri, manifest.icon);
      return {
        artifactKind: 'plugin',
        stableId: withArtifactKindStableId(
          'plugin',
          manifest.id ||
            createHashFallbackStableId({
              name: manifest.name,
              seed: base.rootPathLabel,
              fallbackPrefix: 'plugin',
            }),
        ),
        manifestId: manifest.id,
        name: manifest.name,
        description: manifest.description,
        framework: manifest.framework,
        ...(iconUri && { iconUri }),
        status: 'ready',
        warnings: [],
        analysisProfile: { kind: 'none' } as BrowserAnalysisProfile,
        ...base,
      };
    } catch (error) {
      const warning: ManifestParseWarning = {
        code: 'invalidJson',
        field: 'manifest',
        message: getErrorMessage(error),
      };
      return {
        artifactKind: 'plugin',
        stableId: withArtifactKindStableId(
          'plugin',
          createHashFallbackStableId({
            name: base.rootPathLabel,
            seed: base.rootPathLabel,
            fallbackPrefix: 'plugin',
          }),
        ),
        manifestId: '',
        name: `Invalid ${RISUPLUGIN_FILENAME} manifest`,
        description: '',
        framework: 'unknown',
        status: 'invalid',
        warnings: [warning],
        analysisProfile: { kind: 'none' } as BrowserAnalysisProfile,
        ...base,
      };
    }
  }

  /**
   * resolveIconUri 함수.
   * manifest의 icon 경로가 실제 파일로 존재할 때만 webview-safe URI로 변환함.
   *
   * @param rootUri - plugin root 디렉터리 URI
   * @param icon - manifest에 기록된 plugin-root-relative icon 경로
   * @returns icon 파일이 존재하면 webview URI 문자열, 아니면 undefined
   */
  private async resolveIconUri(rootUri: vscode.Uri, icon: string | undefined): Promise<string | undefined> {
    if (!icon || !this.webview) return undefined;
    const iconRelative = icon.replace(/^\.\//, '');
    const iconUri = vscode.Uri.joinPath(rootUri, ...iconRelative.split('/'));
    try {
      const stat = await vscode.workspace.fs.stat(iconUri);
      if (stat.type === vscode.FileType.File) {
        return this.webview.asWebviewUri(iconUri).toString();
      }
    } catch {
      // Missing icon file is not an error; the card falls back to the default thumbnail.
    }
    return undefined;
  }
}
