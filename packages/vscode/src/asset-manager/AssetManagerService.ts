/**
 * Asset Manager 서비스 레이어.
 * fs 스캔/카탈로그 IO/메타 파싱/파생 출력은 core 함수 조합으로 처리하며 vscode API에 의존하지 않는다.
 * @file packages/vscode/src/asset-manager/AssetManagerService.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ASSET_CATALOG_FILENAME,
  bootstrapVocabCandidates,
  createDefaultAssetCatalog,
  findDuplicateNameGroups,
  generateMissingReport,
  generatePromptBlock,
  generateWhitelistRegex,
  listMissingCombos,
  renderAssetName,
  serializeAssetCatalog,
  stripExtensionResidue,
  tokenizeAssetFilename,
  type AssetCatalog,
  type AssetCatalogOutputsConfig,
  type AssetCatalogSchema,
  type AssetExpectedMap,
  type AssetSlotId,
  type LorebookNameCandidate,
  type MissingCombo,
} from 'risu-workbench-core';
import {
  bootstrapAssetCatalogFromEntries,
  bootstrapAssetCatalogFromManifest,
  buildCharacterAssetManifest,
  collectAssetCatalogBootstrapEntriesFromManifest,
  collectCharacterAssetEntries,
  extractLorebookNameCandidates,
  loadAssetCatalogFromAssetsDir,
  previewAssetCatalogBootstrapEntries,
  readImageMeta,
  summarizeAssetCatalogBootstrapGroups,
  type AssetCatalogBootstrapGroupSummary,
  type AssetCatalogBootstrapSplitOptions,
  type AssetManifestBuildSummary,
  type ImageMeta,
} from 'risu-workbench-core/node';
import type {
  AssetManagerAssetEntry,
  AssetManagerAssignmentChange,
  AssetManagerBootstrapCatalogPayload,
  AssetManagerCatalogBootstrapPreviewEntry,
  AssetManagerScanSnapshot,
  AssetManagerTokenizeProposal,
  AssetManagerWriteAssetFile,
  AssetOutputKind,
} from './assetManagerTypes';

export interface AssetOutputsBundle {
  promptBlock?: string;
  whitelistRegex?: { readonly inPattern: string; readonly outPattern: string } | null;
  missingReport?: string;
  missingCombos?: readonly MissingCombo[];
}

export interface AssetAutoAssignResult {
  readonly snapshot: AssetManagerScanSnapshot;
  readonly assignedPaths: readonly string[];
  readonly anomalyPaths: readonly string[];
  readonly addedVocab: Partial<Record<AssetSlotId, string[]>>;
}

export interface AssetManagerWriteAssetFilesResult {
  readonly writtenPaths: readonly string[];
  readonly deletedPaths: readonly string[];
}

class AssetManagerWriteValidationError extends Error {
  readonly name = 'AssetManagerWriteValidationError';
}

const MAX_WRITE_ASSET_FILES = 200;
const WRITEABLE_ASSET_SUBDIRS: readonly string[] = ['additional', 'emotions', 'other'];
const SUPPORTED_ASSET_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'mp3', 'ogg', 'wav', 'mp4', 'webm'];
const RESERVED_ASSET_BASENAMES: readonly string[] = ['asset-catalog.json', 'manifest.json'];
const ASSET_EXTENSION_RESIDUE = /(\.(png|jpe?g|webp|gif|avif|mp3|ogg|wav|mp4|webm))+$/i;

function assertSafeRelativePath(relPath: string): void {
  if (
    relPath.length === 0 ||
    relPath.includes('\\') ||
    path.isAbsolute(relPath) ||
    path.win32.isAbsolute(relPath) ||
    relPath.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error(`Unsafe asset manager path: ${relPath}`);
  }
}

function assetPathBasename(relPath: string): string {
  const segments = relPath.split('/');
  return segments[segments.length - 1] ?? '';
}

function assetPathExtension(relPath: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(assetPathBasename(relPath));
  return match?.[1].toLowerCase() ?? '';
}

function strippedAssetStem(relPath: string): string {
  return assetPathBasename(relPath).replace(/\.[A-Za-z0-9]+$/, '').replace(ASSET_EXTENSION_RESIDUE, '');
}

export function replacementTargetForAsset(
  existingPath: string,
  pickedFileName: string,
): { readonly targetPath: string; readonly deletePath?: string } {
  const pickedExt = /\.([A-Za-z0-9]+)$/.exec(pickedFileName)?.[1].toLowerCase() ?? '';
  if (pickedExt === assetPathExtension(existingPath)) return { targetPath: existingPath };

  const dir = existingPath.includes('/') ? existingPath.slice(0, existingPath.lastIndexOf('/') + 1) : '';
  const stem = assetPathBasename(existingPath).replace(/\.[A-Za-z0-9]+$/, '');
  return { targetPath: `${dir}${stem}.${pickedExt}`, deletePath: existingPath };
}

function assertWriteableAssetPath(relPath: string): void {
  assertSafeRelativePath(relPath);
  const subdir = relPath.split('/')[0];
  if (subdir === undefined || !WRITEABLE_ASSET_SUBDIRS.includes(subdir)) {
    throw new AssetManagerWriteValidationError(`Unsupported asset manager write subdir: ${relPath}`);
  }
  if (!SUPPORTED_ASSET_EXTENSIONS.includes(assetPathExtension(relPath))) {
    throw new AssetManagerWriteValidationError(`Unsupported asset extension: ${relPath}`);
  }
  if (RESERVED_ASSET_BASENAMES.includes(assetPathBasename(relPath).toLowerCase())) {
    throw new AssetManagerWriteValidationError(`Reserved asset basename: ${relPath}`);
  }
}

function decodeAssetBase64(bytesBase64: string): Buffer {
  if (bytesBase64.length === 0 || bytesBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(bytesBase64)) {
    throw new AssetManagerWriteValidationError('Invalid base64 asset payload');
  }
  const decoded = Buffer.from(bytesBase64, 'base64');
  if (decoded.length === 0) throw new AssetManagerWriteValidationError('Empty asset payload');
  return decoded;
}

function assertValidAssetReplacement(targetPath: string, deletePath: string): void {
  assertWriteableAssetPath(deletePath);
  if (deletePath === targetPath) throw new AssetManagerWriteValidationError(`Replacement path matches target: ${targetPath}`);
  if (strippedAssetStem(deletePath) !== strippedAssetStem(targetPath)) {
    throw new AssetManagerWriteValidationError(`Replacement stem mismatch: ${deletePath} -> ${targetPath}`);
  }
}

function validateWriteAssetFiles(files: readonly AssetManagerWriteAssetFile[]): readonly Buffer[] {
  if (files.length === 0 || files.length > MAX_WRITE_ASSET_FILES) {
    throw new AssetManagerWriteValidationError(`Asset write count out of range: ${files.length}`);
  }

  const decoded: Buffer[] = [];
  for (const file of files) {
    assertWriteableAssetPath(file.targetPath);
    if (file.deletePath !== undefined) assertValidAssetReplacement(file.targetPath, file.deletePath);
    decoded.push(decodeAssetBase64(file.bytesBase64));
  }
  return decoded;
}

function withCatalogAssignments(
  catalog: AssetCatalog,
  changes: readonly AssetManagerAssignmentChange[],
): AssetCatalog {
  const assignments: AssetCatalog['assignments'] = { ...catalog.assignments };
  for (const change of changes) {
    if (change.slots === null) delete assignments[change.path];
    else assignments[change.path] = change.slots;
  }
  return { ...catalog, assignments };
}

function isAssetManagerPath(relativePath: string): boolean {
  return !relativePath.startsWith('icons/');
}

function isAssetManagerEntry(entry: { readonly extracted_path: string }): boolean {
  return isAssetManagerPath(entry.extracted_path);
}

export class AssetManagerService {
  private readonly assetsDir: string;

  constructor(private readonly rootFsPath: string) {
    this.assetsDir = path.join(rootFsPath, 'assets');
  }

  scan(): AssetManagerScanSnapshot {
    const { catalog, exists } = this.loadCatalog();
    const rawEntries = collectCharacterAssetEntries(this.assetsDir, null).filter(isAssetManagerEntry);
    const duplicateGroups = findDuplicateNameGroups(catalog)
      .map((group) => ({ ...group, paths: group.paths.filter(isAssetManagerPath) }))
      .filter((group) => group.paths.length > 1);
    const duplicatePaths = new Set(duplicateGroups.flatMap((group) => group.paths));
    const scannedPaths = new Set(rawEntries.map((entry) => entry.extracted_path));

    const entries: AssetManagerAssetEntry[] = rawEntries.map((entry) => {
      const assignment = catalog.assignments[entry.extracted_path] ?? null;
      const generatedName = assignment === null ? null : renderAssetName(catalog.schema, assignment);
      const absolutePath = path.join(this.assetsDir, ...entry.extracted_path.split('/'));
      const stat = fs.statSync(absolutePath);

      return {
        path: entry.extracted_path,
        subdir: entry.subdir,
        ext: entry.ext,
        sizeBytes: entry.size_bytes,
        mtimeMs: stat.mtimeMs,
        fileStem: stripExtensionResidue(path.parse(entry.extracted_path).name),
        assignment,
        generatedName,
        flags: { unassigned: generatedName === null, duplicate: duplicatePaths.has(entry.extracted_path) },
      };
    });

    return {
      entries,
      catalog,
      catalogExists: exists,
      orphanPaths: Object.keys(catalog.assignments)
        .filter((assignedPath) => isAssetManagerPath(assignedPath) && !scannedPaths.has(assignedPath))
        .sort(),
      duplicateNames: duplicateGroups.map((group) => group.name),
    };
  }

  applyAssignmentChanges(changes: readonly AssetManagerAssignmentChange[]): AssetManagerScanSnapshot {
    for (const change of changes) assertSafeRelativePath(change.path);
    return this.saveAndScan(withCatalogAssignments(this.loadCatalog().catalog, changes));
  }

  updateVocab(vocab: AssetCatalog['vocab']): AssetManagerScanSnapshot {
    const catalog = this.loadCatalog().catalog;
    return this.saveAndScan({ ...catalog, vocab });
  }

  updateSchema(schema: AssetCatalogSchema, outputs?: AssetCatalogOutputsConfig): AssetManagerScanSnapshot {
    const catalog = this.loadCatalog().catalog;
    const vocab: AssetCatalog['vocab'] = { ...catalog.vocab };
    for (const slot of schema.slots) vocab[slot.id] = vocab[slot.id] ?? [];
    const updated: AssetCatalog = { ...catalog, schema, vocab };
    return this.saveAndScan(outputs === undefined ? updated : { ...updated, outputs });
  }

  updateExpected(expected: AssetExpectedMap): AssetManagerScanSnapshot {
    const catalog = this.loadCatalog().catalog;
    return this.saveAndScan({ ...catalog, expected });
  }

  readMeta(relPath: string): ImageMeta {
    assertSafeRelativePath(relPath);
    return readImageMeta(path.join(this.assetsDir, ...relPath.split('/')));
  }

  lorebookNames(): LorebookNameCandidate[] {
    return extractLorebookNameCandidates(this.rootFsPath);
  }

  tokenizeUnassigned(): {
    readonly proposals: readonly AssetManagerTokenizeProposal[];
    readonly prefixes: readonly { readonly value: string; readonly count: number }[];
    readonly suffixes: readonly { readonly value: string; readonly count: number }[];
  } {
    const snapshot = this.scan();
    const proposals = snapshot.entries
      .filter((entry) => entry.flags.unassigned)
      .map((entry) => {
        const result = tokenizeAssetFilename(entry.fileStem, snapshot.catalog.schema, snapshot.catalog.vocab);
        return { path: entry.path, slots: result.slots, matched: result.matched, residue: result.residue };
      });
    const clusters = bootstrapVocabCandidates(snapshot.entries.map((entry) => entry.fileStem));
    return { proposals, prefixes: clusters.prefixes, suffixes: clusters.suffixes };
  }

  bootstrapFromManifest(): AssetManagerScanSnapshot {
    return this.saveAndScan(bootstrapAssetCatalogFromManifest({ rootDir: this.rootFsPath }));
  }

  bootstrapCatalog(options: Pick<AssetManagerBootstrapCatalogPayload, 'source' | 'mode' | 'split' | 'schema'>): AssetManagerScanSnapshot {
    const catalog = withBootstrapSchema(this.loadCatalog().catalog, options.schema);
    const bootstrapped = bootstrapAssetCatalogFromEntries(catalog, this.bootstrapEntries(options.source), options);
    return this.saveAndScan(withBootstrapConfig(bootstrapped, options.split));
  }

  autoAssignNewAssets(newPaths: readonly string[]): AssetAutoAssignResult {
    for (const relPath of newPaths) assertSafeRelativePath(relPath);
    const { catalog } = this.loadCatalog();
    const rules = catalog.bootstrap;
    if (rules === undefined) {
      return { snapshot: this.scan(), assignedPaths: [], anomalyPaths: [], addedVocab: {} };
    }

    const scanned = new Set(this.bootstrapEntries('filename').map((entry) => entry.path));
    const entries = newPaths
      .filter((relPath) => scanned.has(relPath) && catalog.assignments[relPath] === undefined)
      .map((relPath) => ({ path: relPath, name: stripExtensionResidue(path.parse(relPath).name) }));
    const preview = previewAssetCatalogBootstrapEntries(catalog, entries, rules);
    const assignedPaths = preview.filter((entry) => entry.slots !== null).map((entry) => entry.path).sort();
    const anomalyPaths = preview.filter((entry) => entry.slots === null).map((entry) => entry.path).sort();
    if (assignedPaths.length === 0) {
      return { snapshot: this.scan(), assignedPaths, anomalyPaths, addedVocab: {} };
    }

    const next = bootstrapAssetCatalogFromEntries(catalog, entries, { mode: 'missing', split: rules });
    return { snapshot: this.saveAndScan(next), assignedPaths, anomalyPaths, addedVocab: diffVocab(catalog.vocab, next.vocab) };
  }

  undoAutoAssign(payload: {
    readonly assignedPaths: readonly string[];
    readonly addedVocab: Partial<Record<AssetSlotId, readonly string[]>>;
  }): AssetManagerScanSnapshot {
    for (const relPath of payload.assignedPaths) assertSafeRelativePath(relPath);
    const { catalog } = this.loadCatalog();
    const assignments = { ...catalog.assignments };
    for (const relPath of payload.assignedPaths) delete assignments[relPath];
    const vocab: AssetCatalog['vocab'] = { ...catalog.vocab };
    for (const [slotId, removed] of Object.entries(payload.addedVocab) as [AssetSlotId, readonly string[]][]) {
      const drop = new Set(removed);
      vocab[slotId] = (vocab[slotId] ?? []).filter((value) => !drop.has(value));
    }
    return this.saveAndScan({ ...catalog, assignments, vocab });
  }

  writeAssetFiles(files: readonly AssetManagerWriteAssetFile[]): AssetManagerWriteAssetFilesResult {
    const decoded = validateWriteAssetFiles(files);
    const writtenPaths: string[] = [];
    const deletedPaths: string[] = [];
    const { catalog } = this.loadCatalog();
    const assignments: AssetCatalog['assignments'] = { ...catalog.assignments };
    let catalogChanged = false;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const bytes = decoded[index];
      if (file === undefined || bytes === undefined) throw new AssetManagerWriteValidationError('Mismatched asset write payload');

      const targetAbsolutePath = path.join(this.assetsDir, ...file.targetPath.split('/'));
      fs.mkdirSync(path.dirname(targetAbsolutePath), { recursive: true });
      fs.writeFileSync(targetAbsolutePath, bytes);
      writtenPaths.push(file.targetPath);

      if (file.deletePath !== undefined) {
        fs.rmSync(path.join(this.assetsDir, ...file.deletePath.split('/')), { force: true });
        deletedPaths.push(file.deletePath);
        const existingAssignment = assignments[file.deletePath];
        if (existingAssignment !== undefined) {
          assignments[file.targetPath] = existingAssignment;
          delete assignments[file.deletePath];
          catalogChanged = true;
        }
      }
    }

    if (catalogChanged) this.saveAndScan({ ...catalog, assignments });
    return { writtenPaths, deletedPaths };
  }

  previewCatalogBootstrap(
    options: Pick<AssetManagerBootstrapCatalogPayload, 'source' | 'mode' | 'split' | 'schema'>,
  ): {
    readonly rows: readonly AssetManagerCatalogBootstrapPreviewEntry[];
    readonly groups: readonly AssetCatalogBootstrapGroupSummary[];
  } {
    const catalog = withBootstrapSchema(this.loadCatalog().catalog, options.schema);
    const preview = previewAssetCatalogBootstrapEntries(catalog, this.bootstrapEntries(options.source), options.split);
    return {
      rows: preview.slice(0, 80),
      groups: summarizeAssetCatalogBootstrapGroups(catalog, preview, options.split),
    };
  }

  generateOutputs(kinds: readonly AssetOutputKind[]): AssetOutputsBundle {
    const { catalog } = this.loadCatalog();
    const result: AssetOutputsBundle = {};
    if (kinds.includes('promptBlock')) result.promptBlock = generatePromptBlock(catalog);
    if (kinds.includes('whitelistRegex')) result.whitelistRegex = generateWhitelistRegex(catalog);
    if (kinds.includes('missingReport')) {
      result.missingReport = generateMissingReport(catalog, 'markdown');
      result.missingCombos = listMissingCombos(catalog);
    }
    return result;
  }

  saveOutput(targetPath: string, content: string): string {
    assertSafeRelativePath(targetPath);
    const absolutePath = path.join(this.rootFsPath, ...targetPath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf-8');
    return absolutePath;
  }

  buildManifest(): AssetManifestBuildSummary {
    return buildCharacterAssetManifest({ rootDir: this.rootFsPath });
  }

  private bootstrapEntries(source: AssetManagerBootstrapCatalogPayload['source']): readonly { readonly path: string; readonly name: string }[] {
    if (source === 'manifest') {
      return collectAssetCatalogBootstrapEntriesFromManifest(this.rootFsPath).filter((entry) => isAssetManagerPath(entry.path));
    }
    return collectCharacterAssetEntries(this.assetsDir, null)
      .filter(isAssetManagerEntry)
      .map((entry) => ({
        path: entry.extracted_path,
        name: stripExtensionResidue(path.parse(entry.extracted_path).name),
      }));
  }

  private loadCatalog(): { readonly catalog: AssetCatalog; readonly exists: boolean } {
    const catalog = loadAssetCatalogFromAssetsDir(this.assetsDir);
    if (catalog !== null) return { catalog, exists: true };

    const catalogPath = path.join(this.assetsDir, ASSET_CATALOG_FILENAME);
    if (fs.existsSync(catalogPath)) fs.renameSync(catalogPath, `${catalogPath}.bak-${Date.now()}`);
    return { catalog: createDefaultAssetCatalog(), exists: false };
  }

  private saveAndScan(catalog: AssetCatalog): AssetManagerScanSnapshot {
    fs.mkdirSync(this.assetsDir, { recursive: true });
    fs.writeFileSync(path.join(this.assetsDir, ASSET_CATALOG_FILENAME), serializeAssetCatalog(catalog), 'utf-8');
    return this.scan();
  }
}

/** 부트스트랩 시 함께 전달된 스키마를 catalog에 적용(누락 슬롯 vocab 보정). 없으면 그대로 반환. */
function withBootstrapSchema(catalog: AssetCatalog, schema?: AssetCatalogSchema): AssetCatalog {
  if (schema === undefined) return catalog;
  const vocab: AssetCatalog['vocab'] = { ...catalog.vocab };
  for (const slot of schema.slots) vocab[slot.id] = vocab[slot.id] ?? [];
  return { ...catalog, schema, vocab };
}

/** 적용된 split 옵션을 catalog의 bootstrap 섹션으로 persist. split이 없으면 기존 섹션을 유지한다. */
function withBootstrapConfig(catalog: AssetCatalog, split?: AssetCatalogBootstrapSplitOptions): AssetCatalog {
  if (split === undefined) return catalog;
  return {
    ...catalog,
    bootstrap: {
      separator: split.separator ?? '_',
      slotTokenCounts: split.slotTokenCounts ?? {},
      ...(split.groupOverrides !== undefined && split.groupOverrides.length > 0 && { groupOverrides: split.groupOverrides }),
    },
  };
}

function diffVocab(before: AssetCatalog['vocab'], after: AssetCatalog['vocab']): Partial<Record<AssetSlotId, string[]>> {
  const added: Partial<Record<AssetSlotId, string[]>> = {};
  for (const [slotId, values] of Object.entries(after) as [AssetSlotId, string[]][]) {
    const previous = new Set(before[slotId] ?? []);
    const fresh = values.filter((value) => !previous.has(value));
    if (fresh.length > 0) added[slotId] = fresh;
  }
  return added;
}
