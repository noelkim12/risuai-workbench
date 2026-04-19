import fs from 'node:fs';
import path from 'node:path';
import {
  CUSTOM_EXTENSION_MARKER_FILES,
  type CustomExtensionArtifact,
  type CustomExtensionMarkerKind,
  parseCustomExtensionArtifactFromSuffix,
} from '../domain/custom-extension/contracts';
import type {
  DiscoveredCanonicalFile,
  DiscoveredMarkerFile,
  DiscoveredStructuredJsonFile,
  CustomExtensionWorkspaceDiscovery,
} from '../domain/custom-extension/file-discovery';

export type {
  DiscoveredCanonicalFile,
  DiscoveredMarkerFile,
  DiscoveredStructuredJsonFile,
  CustomExtensionWorkspaceDiscovery,
} from '../domain/custom-extension/file-discovery';

/** discoverCustomExtensionWorkspace collects canonical artifacts, marker files, and structured json files. */
export function discoverCustomExtensionWorkspace(rootDir: string): CustomExtensionWorkspaceDiscovery {
  if (!isDirectory(rootDir)) {
    return {
      canonicalFiles: [],
      markerFiles: [],
      structuredJsonFiles: [],
    };
  }

  const canonicalFiles: DiscoveredCanonicalFile[] = [];
  const markerFiles: DiscoveredMarkerFile[] = [];
  const structuredJsonFiles: DiscoveredStructuredJsonFile[] = [];

  walkDirectory(rootDir, rootDir, canonicalFiles, markerFiles, structuredJsonFiles);

  return {
    canonicalFiles,
    markerFiles,
    structuredJsonFiles,
  };
}

import { filterCanonicalFilesByArtifact } from '../domain/custom-extension/file-discovery';

/** listCanonicalFilesByArtifact filters discovery output to one artifact kind. */
export function listCanonicalFilesByArtifact(
  rootDir: string,
  artifact: CustomExtensionArtifact,
): readonly DiscoveredCanonicalFile[] {
  return filterCanonicalFilesByArtifact(discoverCustomExtensionWorkspace(rootDir), artifact);
}

function walkDirectory(
  rootDir: string,
  currentDir: string,
  canonicalFiles: DiscoveredCanonicalFile[],
  markerFiles: DiscoveredMarkerFile[],
  structuredJsonFiles: DiscoveredStructuredJsonFile[],
): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(rootDir, absolutePath, canonicalFiles, markerFiles, structuredJsonFiles);
      continue;
    }
    if (!entry.isFile()) continue;

    const relativePath = toPosix(path.relative(rootDir, absolutePath));
    const lowerName = entry.name.toLowerCase();
    const lowerSuffix = path.extname(entry.name).toLowerCase();

    if (lowerName === CUSTOM_EXTENSION_MARKER_FILES.order) {
      markerFiles.push({ kind: 'order', absolutePath, relativePath });
      continue;
    }

    if (lowerName === CUSTOM_EXTENSION_MARKER_FILES.folders) {
      markerFiles.push({ kind: 'folders', absolutePath, relativePath });
      continue;
    }

    if (lowerSuffix === '.json') {
      if (lowerName !== 'manifest.json') {
        structuredJsonFiles.push({ absolutePath, relativePath });
      }
      continue;
    }

    if (!lowerSuffix.startsWith('.risu')) continue;

    canonicalFiles.push({
      artifact: parseCustomExtensionArtifactFromSuffix(lowerSuffix),
      absolutePath,
      relativePath,
    });
  }
}

function isDirectory(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
