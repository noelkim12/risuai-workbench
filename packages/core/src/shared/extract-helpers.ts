import {
  buildRisuFolderMap,
  resolveRisuFolderName,
  type RisuCharbookEntry,
} from '../domain';
import { sanitizeFilename } from '../domain';
import { ensureDir, uniquePath, writeBinary, writeJson, writeText } from '../node/fs-helpers';
import { parsePngTextChunks } from '../node/png';

export { sanitizeFilename, ensureDir, writeJson, writeText, writeBinary, uniquePath };

/** Wrapper around parsePngTextChunks from risu-api. */
export function parsePngChunks(buf: Buffer): Record<string, string> {
  return parsePngTextChunks(buf);
}

/** Wrapper that applies sanitizeFilename transform to folder names. */
export function buildFolderMap(
  entries: RisuCharbookEntry[],
): Record<string, string> {
  return buildRisuFolderMap(entries, {
    nameTransform: sanitizeFilename,
    fallbackName: "unnamed_folder",
  });
}

/** Wrapper that uses sanitizeFilename as the fallback transform. */
export function resolveFolderName(
  folderRef: string | null | undefined,
  folderMap: Record<string, string>,
): string | null {
  return resolveRisuFolderName(folderRef, folderMap, sanitizeFilename);
}
