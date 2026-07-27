import path from 'node:path';

const ARCHIVE_EXTENSIONS: readonly string[] = ['.charx', '.risum', '.risup'];

export function isArchiveArtifactPath(filePath: string): boolean {
  return ARCHIVE_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}
