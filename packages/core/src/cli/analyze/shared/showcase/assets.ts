import fs from 'node:fs';
import path from 'node:path';

const ASSET_METADATA_FILES = new Set(['asset-catalog.json', 'manifest.json']);

export function countAssetFiles(rootDir: string): number {
  const assetsDir = path.join(rootDir, 'assets');
  if (!fs.existsSync(assetsDir)) return 0;

  let count = 0;
  for (const entry of fs.readdirSync(assetsDir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && !ASSET_METADATA_FILES.has(entry.name)) count += 1;
  }
  return count;
}
