import path from 'node:path';
import { listMissingCombos } from '@/domain/asset/missing';
import {
  buildCharacterAssetManifest,
  collectCharacterAssetEntries,
  computeAssetBuildWarnings,
  loadAssetCatalogFromAssetsDir,
} from '@/node/asset-manifest';
import { argValue, getErrorMessage } from '../shared';
import type { AssetManifestBuildSummary } from '@/node/asset-manifest';

interface AssetWorkflowOptions {
  readonly inDir: string;
  readonly checkOnly: boolean;
}

interface AssetWarningReport {
  readonly duplicateNames: readonly string[];
  readonly orphanPaths: readonly string[];
}

export { buildCharacterAssetManifest } from '@/node/asset-manifest';
export type { AssetManifestBuildSummary as CharacterAssetManifestBuildResult } from '@/node/asset-manifest';

export function runAssetsWorkflow(argv: readonly string[]): number {
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    return 0;
  }

  const options = parseAssetWorkflowOptions(argv);
  try {
    if (options.checkOnly) return runCheck(options.inDir);

    const result = buildCharacterAssetManifest({ rootDir: options.inDir });
    console.log('\nRisuAI Asset Manifest Builder\n');
    console.log(`- workspace : ${options.inDir}`);
    console.log('\nBuild complete:');
    console.log(
      `- ${path.relative(process.cwd(), result.manifestPath)} (${result.total} assets, curated ${result.named})`,
    );
    printWarnings(toWarningReport(result));
    console.log('');
    return 0;
  } catch (error) {
    console.error(`\nERROR: ${getErrorMessage(error)}\n`);
    return 1;
  }
}

function runCheck(inDir: string): number {
  const assetsDir = path.join(inDir, 'assets');
  const catalog = loadAssetCatalogFromAssetsDir(assetsDir);
  console.log('\nRisuAI Asset Catalog Check\n');
  if (catalog === null) {
    console.log('- asset-catalog.json 없음 (검사할 큐레이션 데이터가 없습니다)');
    console.log('');
    return 0;
  }

  const entries = collectCharacterAssetEntries(assetsDir, catalog);
  const warnings = computeAssetBuildWarnings(catalog, entries.map((entry) => entry.extracted_path));
  printWarnings({
    duplicateNames: warnings.duplicates.map((group) => group.name),
    orphanPaths: warnings.orphanPaths,
  });
  const missing = listMissingCombos(catalog);
  console.log(`- missing combos : ${missing.length}`);
  for (const combo of missing.slice(0, 50)) {
    console.log(`    ${combo.name ?? JSON.stringify(combo.slots)}`);
  }
  if (missing.length > 50) console.log(`    ... ${missing.length - 50} more`);
  console.log('');
  return 0;
}

function toWarningReport(summary: AssetManifestBuildSummary): AssetWarningReport {
  return {
    duplicateNames: summary.duplicates.map((group) => group.name),
    orphanPaths: summary.orphanPaths,
  };
}

function printWarnings(report: AssetWarningReport): void {
  if (report.duplicateNames.length > 0) {
    console.log(
      `- WARN duplicate names (${report.duplicateNames.length}): ${report.duplicateNames.slice(0, 10).join(', ')}`,
    );
  }
  if (report.orphanPaths.length > 0) {
    console.log(
      `- WARN orphan assignments (${report.orphanPaths.length}): ${report.orphanPaths.slice(0, 10).join(', ')}`,
    );
  }
}

function printHelp(): void {
  console.log(`
RisuAI Asset Manifest Builder

Usage:
  risu-core assets [options]

Options:
  --in <dir>   Character workspace root (default: .)
  --check      manifest를 쓰지 않고 missing/중복/orphan 리포트만 출력
  -h, --help   Show help

Input:
  assets/additional/ -> type x-risu-asset
  assets/emotions/   -> type emotion
  assets/icons/      -> type icon
  assets/other/      -> type asset
  assets/asset-catalog.json 이 있으면 할당된 파일의 name을 joinTemplate로 렌더
`);
}

function parseAssetWorkflowOptions(argv: readonly string[]): AssetWorkflowOptions {
  return {
    inDir: path.resolve(argValue(argv, '--in') || '.'),
    checkOnly: argv.includes('--check'),
  };
}
