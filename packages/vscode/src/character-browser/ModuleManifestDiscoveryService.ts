/**
 * Workspace `.risumodule` discovery and module card model conversion.
 * @file packages/vscode/src/character-browser/ModuleManifestDiscoveryService.ts
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';
import {
  parseRisumoduleManifest,
  RISUMODULE_FILENAME,
  type RisumoduleManifest,
} from 'risu-workbench-core/node';
import {
  ARTIFACT_MARKER_EXCLUDE_GLOB,
  getWorkspaceRelativePath,
  withArtifactKindStableId,
} from './CharacterManifestDiscoveryService';
import type { ManifestParseWarning, ModuleBrowserCard } from './characterBrowserTypes';

export const RISUMODULE_GLOB = `**/${RISUMODULE_FILENAME}`;

interface ModuleParseContext {
  markerUri: vscode.Uri;
  rootUri: vscode.Uri;
  markerPathLabel: string;
  rootPathLabel: string;
}

/**
 * ModuleManifestDiscoveryService 클래스.
 * 모든 workspace folder에서 `.risumodule` marker를 찾아 module card model로 변환함.
 */
export class ModuleManifestDiscoveryService {
  /**
   * discoverCards 함수.
   * workspace-wide risumodule marker scan 결과를 card로 변환하고 marker별 오류를 보존함.
   *
   * @returns sidebar에 전송할 module cards
   */
  async discoverCards(): Promise<ModuleBrowserCard[]> {
    const markerUris = await vscode.workspace.findFiles(RISUMODULE_GLOB, ARTIFACT_MARKER_EXCLUDE_GLOB);
    const cards: ModuleBrowserCard[] = [];

    for (const markerUri of markerUris) {
      cards.push(await this.discoverCard(markerUri));
    }

    return cards.sort((a, b) => a.rootPathLabel.localeCompare(b.rootPathLabel));
  }

  private async discoverCard(markerUri: vscode.Uri): Promise<ModuleBrowserCard> {
    const rootUri = vscode.Uri.file(path.dirname(markerUri.fsPath));
    const context = this.createParseContext(markerUri, rootUri);

    let manifestText: string;
    try {
      manifestText = Buffer.from(await vscode.workspace.fs.readFile(markerUri)).toString('utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.toInvalidCardModel(new Error(`Could not read ${RISUMODULE_FILENAME}: ${message}`), context);
    }

    try {
      const manifest = parseRisumoduleManifest(manifestText, markerUri.fsPath);
      return this.toValidCardModel(manifest, context);
    } catch (error) {
      return this.toInvalidCardModel(error, context, manifestText);
    }
  }

  private createParseContext(markerUri: vscode.Uri, rootUri: vscode.Uri): ModuleParseContext {
    return {
      markerUri,
      rootUri,
      markerPathLabel: getWorkspaceRelativePath(markerUri),
      rootPathLabel: getWorkspaceRelativePath(rootUri),
    };
  }

  private toValidCardModel(manifest: RisumoduleManifest, context: ModuleParseContext): ModuleBrowserCard {
    return {
      artifactKind: 'module',
      stableId: withArtifactKindStableId('module', manifest.id || createFallbackStableId(context.rootPathLabel, manifest.name)),
      manifestId: manifest.id,
      name: manifest.name,
      description: manifest.description,
      sourceFormat: manifest.sourceFormat,
      ...(manifest.namespace !== undefined && { namespace: manifest.namespace }),
      status: 'ready',
      flags: {
        lowLevelAccess: manifest.lowLevelAccess === true,
        hideIcon: manifest.hideIcon === true,
        hasCjs: typeof manifest.cjs === 'string' && manifest.cjs.length > 0,
        hasMcp: manifest.mcp !== undefined,
      },
      markerUri: context.markerUri.toString(),
      rootUri: context.rootUri.toString(),
      rootPathLabel: context.rootPathLabel,
      markerPathLabel: context.markerPathLabel,
      warnings: [],
    };
  }

  private toInvalidCardModel(error: unknown, context: ModuleParseContext, manifestText?: string): ModuleBrowserCard {
    const message = error instanceof Error ? error.message : String(error);
    const warning = classifyModuleParseWarning(message);
    const raw = readRawModuleFields(message, manifestText);
    const status = warning.code === 'invalidKind' ? 'warning' : 'invalid';

    return {
      artifactKind: 'module',
      stableId: withArtifactKindStableId('module', raw.manifestId || createFallbackStableId(context.rootPathLabel, raw.name)),
      manifestId: raw.manifestId,
      name: raw.name || `Invalid ${RISUMODULE_FILENAME} manifest`,
      description: raw.description,
      sourceFormat: raw.sourceFormat,
      ...(raw.namespace !== undefined && { namespace: raw.namespace }),
      status,
      flags: raw.flags,
      markerUri: context.markerUri.toString(),
      rootUri: context.rootUri.toString(),
      rootPathLabel: context.rootPathLabel,
      markerPathLabel: context.markerPathLabel,
      warnings: [warning],
    };
  }
}

function classifyModuleParseWarning(message: string): ManifestParseWarning {
  if (message.includes('Invalid .risumodule JSON')) {
    return { code: 'invalidJson', field: 'manifest', message };
  }
  if (message.includes('kind must')) {
    return { code: 'invalidKind', field: 'kind', message };
  }
  if (message.includes('sourceFormat')) {
    return { code: 'invalidSourceFormat', field: 'sourceFormat', message };
  }
  if (message.includes('schemaVersion')) {
    return { code: 'unknownSchemaVersion', field: 'schemaVersion', message };
  }
  if (message.includes('missing required fields')) {
    return { code: 'missingRequiredField', field: 'manifest', message };
  }
  if (message.includes('Could not read')) {
    return { code: 'readError', field: 'manifest', message };
  }
  return { code: 'invalidJson', field: 'manifest', message };
}

function readRawModuleFields(message: string, manifestText?: string): Omit<ModuleBrowserCard, 'artifactKind' | 'stableId' | 'status' | 'markerUri' | 'rootUri' | 'rootPathLabel' | 'markerPathLabel' | 'warnings'> {
  const fallback = createRawModuleFallback();
  if (!manifestText || message.includes('Invalid .risumodule JSON') || message.includes('Could not read')) return fallback;

  try {
    const parsed: unknown = JSON.parse(manifestText);
    if (!isRecord(parsed)) return fallback;
    return {
      manifestId: typeof parsed.id === 'string' ? parsed.id : '',
      name: typeof parsed.name === 'string' ? parsed.name : fallback.name,
      description: typeof parsed.description === 'string' ? parsed.description : fallback.description,
      sourceFormat: parsed.sourceFormat === 'risum' || parsed.sourceFormat === 'json' || parsed.sourceFormat === 'scaffold'
        ? parsed.sourceFormat
        : 'unknown',
      namespace: typeof parsed.namespace === 'string' ? parsed.namespace : undefined,
      flags: {
        lowLevelAccess: parsed.lowLevelAccess === true,
        hideIcon: parsed.hideIcon === true,
        hasCjs: typeof parsed.cjs === 'string' && parsed.cjs.length > 0,
        hasMcp: isRecord(parsed.mcp),
      },
    };
  } catch {
    return fallback;
  }
}

function createRawModuleFallback(): Omit<ModuleBrowserCard, 'artifactKind' | 'stableId' | 'status' | 'markerUri' | 'rootUri' | 'rootPathLabel' | 'markerPathLabel' | 'warnings'> {
  return {
    manifestId: '',
    name: '',
    description: '',
    sourceFormat: 'unknown',
    flags: { lowLevelAccess: false, hideIcon: false, hasCjs: false, hasMcp: false },
  };
}

function createFallbackStableId(rootPathLabel: string, name: string): string {
  const slug = slugify(name || rootPathLabel) || 'module';
  const hash = createHash('sha256').update(rootPathLabel).digest('hex').slice(0, 10);
  return `${slug}-${hash}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
