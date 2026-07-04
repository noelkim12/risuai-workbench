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
  type LorebookNameCandidate,
  type MissingCombo,
} from 'risu-workbench-core';
import {
  buildCharacterAssetManifest,
  collectCharacterAssetEntries,
  extractLorebookNameCandidates,
  loadAssetCatalogFromAssetsDir,
  readImageMeta,
  type AssetManifestBuildSummary,
  type ImageMeta,
} from 'risu-workbench-core/node';
import type {
  AssetManagerAssetEntry,
  AssetManagerAssignmentChange,
  AssetManagerScanSnapshot,
  AssetManagerTokenizeProposal,
  AssetOutputKind,
} from './assetManagerTypes';

export interface AssetOutputsBundle {
  promptBlock?: string;
  whitelistRegex?: { readonly inPattern: string; readonly outPattern: string } | null;
  missingReport?: string;
  missingCombos?: readonly MissingCombo[];
}

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

export class AssetManagerService {
  private readonly assetsDir: string;

  constructor(private readonly rootFsPath: string) {
    this.assetsDir = path.join(rootFsPath, 'assets');
  }

  scan(): AssetManagerScanSnapshot {
    const { catalog, exists } = this.loadCatalog();
    const rawEntries = collectCharacterAssetEntries(this.assetsDir, null);
    const duplicateGroups = findDuplicateNameGroups(catalog);
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
      orphanPaths: Object.keys(catalog.assignments).filter((assignedPath) => !scannedPaths.has(assignedPath)).sort(),
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
