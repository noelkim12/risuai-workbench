import fs from 'node:fs';
import path from 'node:path';

import { isPathSafe } from '../shared/path-policy';

export interface RisuLuaWorkspaceFile {
  path: string;
  content: string;
}

export interface WriteRisuLuaWorkspaceFilesOptions {
  outputRoot: string;
}

export interface WriteRisuLuaWorkspaceFilesResult {
  paths: string[];
}

export function writeRisuLuaWorkspaceFiles(
  files: RisuLuaWorkspaceFile[],
  options: WriteRisuLuaWorkspaceFilesOptions,
): WriteRisuLuaWorkspaceFilesResult {
  const paths: string[] = [];

  for (const file of files) {
    if (!isPathSafe(file.path)) {
      throw new Error(`Refusing to write unsafe risulua split path: ${file.path}`);
    }
    const outputPath = path.join(options.outputRoot, ...file.path.split('/'));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, file.content, 'utf8');
    paths.push(outputPath);
  }

  return { paths };
}
