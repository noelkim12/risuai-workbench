export interface RisuCharbookEntry {
  mode: string;
  keys?: string[];
  name?: string;
  comment?: string;
}

export interface FolderMapOptions {
  nameTransform?: (name: string) => string;
  fallbackName?: string;
}

export function buildFolderMap(
  entries: RisuCharbookEntry[],
  opts?: FolderMapOptions,
): Record<string, string> {
  const options = opts || {};
  const nameTransform =
    typeof options.nameTransform === 'function'
      ? options.nameTransform
      : (value: string) => value;
  const fallbackName =
    typeof options.fallbackName === 'string' ? options.fallbackName : 'unnamed';
  const map: Record<string, string> = {};

  for (const entry of entries) {
    if (entry.mode === 'folder' && entry.keys && entry.keys.length > 0) {
      const folderKey = entry.keys[0];
      map[folderKey] = nameTransform(
        entry.name || entry.comment || fallbackName,
      );
    }
  }

  return map;
}

export function resolveFolderName(
  folderRef: string | null | undefined,
  folderMap: Record<string, string>,
  fallbackTransform?: (ref: string) => string,
): string | null {
  if (!folderRef) return null;
  if (Object.prototype.hasOwnProperty.call(folderMap, folderRef)) {
    return folderMap[folderRef];
  }
  if (typeof fallbackTransform === 'function') {
    return fallbackTransform(folderRef);
  }
  return folderRef;
}
