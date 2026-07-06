/**
 * Resolves regex preview {{raw}} asset names to image data URIs from a character assets directory.
 * @file packages/core/src/node/regex-asset-resolver.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderAssetName, stripExtensionResidue } from '../domain/asset/naming';
import { resolveAssetName } from '../simulator/regex/asset-resolver';
import { collectCharacterAssetEntries, loadAssetCatalogFromAssetsDir } from './asset-manifest';

export interface ResolveRegexAssetsOptions {
  readonly rootDir: string;
  readonly names: readonly string[];
  readonly maxImages?: number;
  readonly maxTotalBytes?: number;
}

export interface ResolvedRegexAsset {
  readonly name: string;
  readonly src: string | null;
  readonly matchedName?: string;
}

export interface ResolveRegexAssetsResult {
  readonly resolved: readonly ResolvedRegexAsset[];
  readonly truncated: boolean;
}

const DEFAULT_MAX_IMAGES = 24;
const DEFAULT_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
};

export function resolveRegexAssets(options: ResolveRegexAssetsOptions): ResolveRegexAssetsResult {
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const assetsDir = path.join(options.rootDir, 'assets');
  const nameToPath = buildCandidateMap(assetsDir);
  const candidateNames = [...nameToPath.keys()];
  const resolved: ResolvedRegexAsset[] = [];
  let truncated = false;
  let imageCount = 0;
  let totalBytes = 0;

  for (const name of options.names) {
    const match = candidateNames.length === 0 ? null : resolveAssetName(name, candidateNames);
    if (match === null) {
      resolved.push({ name, src: null });
      continue;
    }

    const relPath = nameToPath.get(match.matchedName);
    const extension = relPath?.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_BY_EXT[extension];
    if (relPath === undefined || mime === undefined) {
      resolved.push({ name, src: null, matchedName: match.matchedName });
      continue;
    }

    if (imageCount >= maxImages) {
      truncated = true;
      resolved.push({ name, src: null, matchedName: match.matchedName });
      continue;
    }

    const assetPath = path.join(assetsDir, ...relPath.split('/'));
    if (!fs.existsSync(assetPath)) {
      resolved.push({ name, src: null, matchedName: match.matchedName });
      continue;
    }

    const bytes = fs.readFileSync(assetPath);
    if (totalBytes + bytes.byteLength > maxTotalBytes) {
      truncated = true;
      resolved.push({ name, src: null, matchedName: match.matchedName });
      continue;
    }

    imageCount += 1;
    totalBytes += bytes.byteLength;
    resolved.push({
      name,
      src: `data:${mime};base64,${bytes.toString('base64')}`,
      matchedName: match.matchedName,
    });
  }

  return { resolved, truncated };
}

function buildCandidateMap(assetsDir: string): Map<string, string> {
  const nameToPath = new Map<string, string>();
  if (!fs.existsSync(assetsDir)) return nameToPath;

  try {
    const catalog = loadAssetCatalogFromAssetsDir(assetsDir);
    const entries = collectCharacterAssetEntries(assetsDir, catalog);

    for (const entry of entries) {
      const relPath = entry.extracted_path;
      const assignment = catalog?.assignments[relPath];
      if (catalog !== null && assignment !== undefined) {
        const generatedName = renderAssetName(catalog.schema, assignment);
        if (generatedName !== null && !nameToPath.has(generatedName)) nameToPath.set(generatedName, relPath);
      }

      const fileStem = stripExtensionResidue(path.parse(relPath).name);
      if (fileStem.length > 0 && !nameToPath.has(fileStem)) nameToPath.set(fileStem, relPath);
    }
  } catch {
    return new Map<string, string>();
  }

  return nameToPath;
}
