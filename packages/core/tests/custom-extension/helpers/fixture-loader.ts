import fs from 'node:fs';
import {
  discoverCustomExtensionWorkspace,
  type CustomExtensionWorkspaceDiscovery,
} from '../../../src/node/custom-extension-file-discovery';
import {
  CUSTOM_EXTENSION_FIXTURE_CORPUS,
  type FixtureCorpusEntry,
  type FixtureCorpusSourceKind,
  type FixtureCorpusTarget,
} from '../fixture-corpus';

/** Round-trip fixture selection filters. */
export interface RoundTripFixtureCorpusFilters {
  ids?: readonly string[];
  targets?: readonly FixtureCorpusTarget[];
  sourceKinds?: readonly FixtureCorpusSourceKind[];
}

/** Loaded extract-dir fixture source with discovery metadata. */
export interface LoadedExtractDirFixtureSource {
  kind: 'extract-dir';
  rootDir: string;
  discovery: CustomExtensionWorkspaceDiscovery;
  canonicalFileCount: number;
  markerFileCount: number;
  structuredJsonFileCount: number;
}

/** Loaded source-file fixture source with raw bytes. */
export interface LoadedSourceFileFixtureSource {
  kind: 'source-file';
  filePath: string;
  buffer: Buffer;
  byteLength: number;
}

/** Loaded fixture corpus entry ready for oracle adapters. */
export interface LoadedRoundTripFixtureCorpusEntry {
  entry: FixtureCorpusEntry;
  source: LoadedExtractDirFixtureSource | LoadedSourceFileFixtureSource;
}

/** selectRoundTripFixtureCorpusEntries resolves a deterministic corpus subset for oracle tests. */
export function selectRoundTripFixtureCorpusEntries(
  filters: RoundTripFixtureCorpusFilters = {},
): readonly FixtureCorpusEntry[] {
  validateFixtureIds(filters.ids);

  const idSet = filters.ids ? new Set(filters.ids) : undefined;
  const targetSet = filters.targets ? new Set(filters.targets) : undefined;
  const sourceKindSet = filters.sourceKinds ? new Set(filters.sourceKinds) : undefined;

  return CUSTOM_EXTENSION_FIXTURE_CORPUS.filter((entry) => {
    if (idSet && !idSet.has(entry.id)) return false;
    if (targetSet && !targetSet.has(entry.target)) return false;
    if (sourceKindSet && !sourceKindSet.has(entry.sourceKind)) return false;
    return true;
  });
}

/** loadRoundTripFixtureCorpusEntries loads deterministic fixture inputs for later adapters. */
export function loadRoundTripFixtureCorpusEntries(
  filters: RoundTripFixtureCorpusFilters = {},
): readonly LoadedRoundTripFixtureCorpusEntry[] {
  return selectRoundTripFixtureCorpusEntries(filters).map((entry) => loadRoundTripFixtureCorpusEntry(entry));
}

/** loadRoundTripFixtureCorpusEntry loads one curated fixture entry. */
export function loadRoundTripFixtureCorpusEntry(
  entry: FixtureCorpusEntry,
): LoadedRoundTripFixtureCorpusEntry {
  if (entry.sourceKind === 'extract-dir') {
    const discovery = discoverCustomExtensionWorkspace(entry.sourcePath);

    return {
      entry,
      source: {
        kind: 'extract-dir',
        rootDir: entry.sourcePath,
        discovery,
        canonicalFileCount: discovery.canonicalFiles.length,
        markerFileCount: discovery.markerFiles.length,
        structuredJsonFileCount: discovery.structuredJsonFiles.length,
      },
    };
  }

  const buffer = fs.readFileSync(entry.sourcePath);
  return {
    entry,
    source: {
      kind: 'source-file',
      filePath: entry.sourcePath,
      buffer,
      byteLength: buffer.byteLength,
    },
  };
}

function validateFixtureIds(ids: readonly string[] | undefined): void {
  if (!ids) return;

  const knownIds = new Set(CUSTOM_EXTENSION_FIXTURE_CORPUS.map((entry) => entry.id));
  const missing = ids.filter((id) => !knownIds.has(id));

  if (missing.length === 0) return;

  throw new Error(`Unknown round-trip fixture corpus ids: ${missing.join(', ')}`);
}
