/**
 * Character asset manifest 빌더.
 * 디스크 스캔 + asset-catalog.json merge로 manifest.json을 생성함.
 * CLI(assets)와 VS Code Asset Manager가 공유함.
 * @file packages/core/src/node/asset-manifest.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ASSET_CATALOG_FILENAME,
  parseAssetCatalog,
  type AssetCatalog,
} from '../domain/asset/catalog';
import { findDuplicateNameGroups, type DuplicateNameGroup } from '../domain/asset/missing';
import { renderAssetName } from '../domain/asset/naming';
import { readJsonIfExists, writeText } from './fs-helpers';

export const CHARACTER_ASSET_DIRS = ['additional', 'emotions', 'icons', 'other'] as const;

export type CharacterAssetSubdir = (typeof CHARACTER_ASSET_DIRS)[number];

export interface CharacterAssetManifestEntry {
  readonly index: number;
  readonly original_uri: null;
  readonly extracted_path: string;
  readonly status: 'extracted';
  readonly type: 'icon' | 'emotion' | 'x-risu-asset' | 'asset';
  readonly name: string;
  readonly ext: string;
  readonly subdir: CharacterAssetSubdir;
  readonly size_bytes: number;
}

export interface CharacterAssetManifest {
  readonly version: 1;
  readonly source_format: 'workspace';
  readonly total: number;
  readonly extracted: number;
  readonly skipped: 0;
  readonly assets: readonly CharacterAssetManifestEntry[];
}

export interface AssetManifestBuildSummary {
  readonly manifestPath: string;
  readonly manifest: CharacterAssetManifest;
  readonly total: number;
  readonly named: number;
  readonly unassigned: number;
  readonly duplicates: readonly DuplicateNameGroup[];
  readonly orphanPaths: readonly string[];
}

export interface AssetBuildWarnings {
  readonly duplicates: readonly DuplicateNameGroup[];
  readonly orphanPaths: readonly string[];
  readonly named: number;
  readonly unassigned: number;
}

export function loadAssetCatalogFromAssetsDir(assetsDir: string): AssetCatalog | null {
  const raw = readJsonIfExists(path.join(assetsDir, ASSET_CATALOG_FILENAME));
  return raw === null ? null : parseAssetCatalog(raw);
}

export function collectCharacterAssetEntries(
  assetsDir: string,
  catalog: AssetCatalog | null,
): CharacterAssetManifestEntry[] {
  const entries: CharacterAssetManifestEntry[] = [];

  for (const subdir of CHARACTER_ASSET_DIRS) {
    const dirPath = path.join(assetsDir, subdir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;

    for (const filePath of listFiles(dirPath)) {
      const relativePath = toPosix(path.relative(assetsDir, filePath));
      const parsed = path.parse(filePath);
      const renderedName = renderAssignedName(catalog, relativePath);
      entries.push({
        index: entries.length,
        original_uri: null,
        extracted_path: relativePath,
        status: 'extracted',
        type: assetTypeFromSubdir(subdir),
        name: renderedName ?? parsed.name,
        ext: parsed.ext.replace(/^\./, '') || 'bin',
        subdir,
        size_bytes: fs.statSync(filePath).size,
      });
    }
  }

  return entries;
}

export function computeAssetBuildWarnings(
  catalog: AssetCatalog | null,
  scannedPaths: readonly string[],
): AssetBuildWarnings {
  if (catalog === null) {
    return { duplicates: [], orphanPaths: [], named: 0, unassigned: scannedPaths.length };
  }

  const scanned = new Set(scannedPaths);
  const orphanPaths = Object.keys(catalog.assignments)
    .filter((assignedPath) => !scanned.has(assignedPath))
    .sort();
  const named = scannedPaths.filter((scannedPath) => renderAssignedName(catalog, scannedPath) !== null).length;

  return {
    duplicates: findDuplicateNameGroups(catalog),
    orphanPaths,
    named,
    unassigned: scannedPaths.length - named,
  };
}

export function buildCharacterAssetManifest(options: { readonly rootDir: string }): AssetManifestBuildSummary {
  const assetsDir = path.join(options.rootDir, 'assets');
  const catalog = loadAssetCatalogFromAssetsDir(assetsDir);
  const entries = collectCharacterAssetEntries(assetsDir, catalog);
  const manifest: CharacterAssetManifest = {
    version: 1,
    source_format: 'workspace',
    total: entries.length,
    extracted: entries.length,
    skipped: 0,
    assets: entries,
  };
  const manifestPath = path.join(assetsDir, 'manifest.json');
  writeText(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const warnings = computeAssetBuildWarnings(catalog, entries.map((entry) => entry.extracted_path));

  return {
    manifestPath,
    manifest,
    total: entries.length,
    named: warnings.named,
    unassigned: warnings.unassigned,
    duplicates: warnings.duplicates,
    orphanPaths: warnings.orphanPaths,
  };
}

function renderAssignedName(catalog: AssetCatalog | null, relativePath: string): string | null {
  if (catalog === null) return null;
  const assignment = catalog.assignments[relativePath];
  return assignment === undefined ? null : renderAssetName(catalog.schema, assignment);
}

function listFiles(dirPath: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'manifest.json' || entry.name === ASSET_CATALOG_FILENAME) continue;

    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => toPosix(left).localeCompare(toPosix(right)));
}

function assetTypeFromSubdir(
  subdir: CharacterAssetSubdir,
): CharacterAssetManifestEntry['type'] {
  switch (subdir) {
    case 'icons':
      return 'icon';
    case 'emotions':
      return 'emotion';
    case 'additional':
      return 'x-risu-asset';
    case 'other':
      return 'asset';
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
