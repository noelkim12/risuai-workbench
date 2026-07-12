import fs from 'node:fs';
import path from 'node:path';

import { buildCharxFromCanonical } from '../cli/pack/character/workflow';
import { buildModuleFromCanonicalDirectory } from '../cli/pack/module/workflow';
import { convertCharxV3ToRisuDefinition } from '../domain/hmr/charx-to-risu';
import { hmrAssetPlaceholder, type HmrAssetEntry } from '../domain/hmr/protocol';
import { AssetHashCache, sha256Hex } from './hmr-asset-hash';

export type HmrAssetSource =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'buffer'; readonly buffer: Buffer };

export interface HmrBuildResult {
  readonly kind: 'character' | 'module';
  readonly data: Record<string, unknown>;
  readonly assets: readonly HmrAssetEntry[];
  readonly assetSources: ReadonlyMap<string, HmrAssetSource>;
}

interface ManifestAssetEntry {
  readonly index: number;
  readonly type: string;
  readonly name: string;
  readonly ext: string | null;
  readonly extractedPath: string;
}

interface HashedAssets {
  readonly placeholders: ReadonlyMap<number, string>;
  readonly entries: readonly HmrAssetEntry[];
  readonly sources: ReadonlyMap<string, HmrAssetSource>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return isRecord(parsed) ? parsed : null;
}

function readManifestEntries(inRoot: string): readonly ManifestAssetEntry[] {
  const manifestPath = path.join(inRoot, 'assets', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = readJsonObject(manifestPath);
  if (!manifest || !Array.isArray(manifest.assets)) return [];
  return manifest.assets
    .filter(isRecord)
    .filter((entry) => Number.isInteger(entry.index))
    .sort((left, right) => Number(left.index) - Number(right.index))
    .map((entry) => ({
      index: Number(entry.index),
      type: typeof entry.type === 'string' ? entry.type : 'asset',
      name: typeof entry.name === 'string' ? entry.name : '',
      ext: typeof entry.ext === 'string' ? entry.ext : null,
      extractedPath: typeof entry.extracted_path === 'string' ? entry.extracted_path : '',
    }));
}

function extensionFromEntry(entry: ManifestAssetEntry): string {
  if (entry.ext && entry.ext.length > 0) return entry.ext;
  const extractedExt = path.extname(entry.extractedPath).replace(/^\./, '');
  return extractedExt.length > 0 ? extractedExt : 'bin';
}

function resolveContainedManifestAssetPath(assetsDir: string, extractedPath: string): string | null {
  if (path.isAbsolute(extractedPath) || path.win32.isAbsolute(extractedPath)) return null;
  const assetPath = path.resolve(assetsDir, extractedPath);
  const relativePath = path.relative(assetsDir, assetPath);
  if (relativePath.length === 0) return assetPath;
  return relativePath.startsWith('..') || path.isAbsolute(relativePath) ? null : assetPath;
}

function hashCharacterManifestAssets(inRoot: string, cache: AssetHashCache): HashedAssets {
  const assetsDir = path.resolve(inRoot, 'assets');
  const placeholders = new Map<number, string>();
  const entries: HmrAssetEntry[] = [];
  const sources = new Map<string, HmrAssetSource>();
  for (const entry of readManifestEntries(inRoot)) {
    if (entry.extractedPath.length === 0) continue;
    const assetPath = resolveContainedManifestAssetPath(assetsDir, entry.extractedPath);
    if (assetPath === null) continue;
    if (!fs.existsSync(assetPath)) continue;
    const hash = cache.hashFile(assetPath);
    placeholders.set(entry.index, hmrAssetPlaceholder(hash));
    if (sources.has(hash)) continue;
    const size = fs.statSync(assetPath).size;
    sources.set(hash, { kind: 'file', path: assetPath });
    entries.push({ hash, ext: extensionFromEntry(entry), role: `${entry.type}:${entry.name}`, size });
  }
  return { placeholders, entries, sources };
}

function moduleAssetTuples(moduleObj: Record<string, unknown>): Array<[string | null, string | null, string | null]> {
  if (!Array.isArray(moduleObj.assets)) return [];
  return moduleObj.assets.filter((tuple): tuple is [string | null, string | null, string | null] => {
    return Array.isArray(tuple) && tuple.length >= 3;
  });
}

/**
 * buildHmrCharacterPayload 함수.
 * character 아티팩트 루트를 RisuAI 네이티브 정의 + 에셋 매니페스트로 빌드한다.
 */
export function buildHmrCharacterPayload(
  inRoot: string,
  cache: AssetHashCache = new AssetHashCache(),
): HmrBuildResult {
  const charx = buildCharxFromCanonical(inRoot, null, 'none', { writeRisuLuaDist: false });
  const hashed = hashCharacterManifestAssets(inRoot, cache);
  const data = convertCharxV3ToRisuDefinition(charx, hashed.placeholders);
  return { kind: 'character', data, assets: hashed.entries, assetSources: hashed.sources };
}

/**
 * buildHmrModulePayload 함수.
 * module 아티팩트 루트를 RisuModule JSON + 에셋 매니페스트로 빌드한다.
 */
export function buildHmrModulePayload(inRoot: string): HmrBuildResult {
  const { module: moduleObj, assetBuffers } = buildModuleFromCanonicalDirectory(inRoot, {
    risuluaMode: null,
    risuluaRecovery: 'none',
    writeRisuLuaDist: false,
  });
  const manifestEntries = readManifestEntries(inRoot);
  const entries: HmrAssetEntry[] = [];
  const sources = new Map<string, HmrAssetSource>();

  moduleAssetTuples(moduleObj).forEach((tuple, index) => {
    const buffer = assetBuffers[index];
    if (!buffer) return;
    const hash = sha256Hex(buffer);
    tuple[1] = hmrAssetPlaceholder(hash);
    if (sources.has(hash)) return;
    const manifestEntry = manifestEntries[index];
    sources.set(hash, { kind: 'buffer', buffer });
    entries.push({
      hash,
      ext: manifestEntry ? extensionFromEntry(manifestEntry) : 'bin',
      role: `${tuple[2] ?? 'asset'}:${tuple[0] ?? index}`,
      size: buffer.byteLength,
    });
  });

  return { kind: 'module', data: moduleObj, assets: entries, assetSources: sources };
}
