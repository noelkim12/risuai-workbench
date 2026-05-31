import fs from 'node:fs';
import path from 'node:path';
import { toPosix } from '@/domain';

export type LuaSplitRole =
  | 'main'
  | 'runtime'
  | 'handler_helpers'
  | 'common'
  | 'host_globals'
  | 'button_actions'
  | 'state'
  | 'prompts'
  | 'domain'
  | 'schema'
  | 'features'
  | 'sections'
  | 'preload'
  | 'unknown';

export interface DiscoveredLuaSourceFile {
  filePath: string;
  relativePath: string;
  luaRelativePath: string;
  role: LuaSplitRole;
  extension: '.risulua' | '.lua';
}

export interface DiscoveredLuaAnalysisFile {
  filePath: string;
  relativePath: string;
  luaRelativePath: string;
  elementName: string;
}

export function classifyLuaSourceRole(luaRelativePath: string): LuaSplitRole {
  const normalized = toPosix(luaRelativePath).replace(/^\.\//u, '');
  if (normalized === 'main.risulua' || normalized === 'main.lua') return 'main';

  const firstSegment = normalized.split('/')[0];
  switch (firstSegment) {
    case 'runtime':
    case 'handler_helpers':
    case 'common':
    case 'host_globals':
    case 'button_actions':
    case 'state':
    case 'prompts':
    case 'domain':
    case 'schema':
    case 'features':
    case 'sections':
    case 'preload':
      return firstSegment;
    default:
      return 'unknown';
  }
}

export function discoverLuaSourceFiles(outputDir: string): DiscoveredLuaSourceFile[] {
  const luaDir = path.join(outputDir, 'lua');
  if (!fs.existsSync(luaDir)) return [];

  const risuFiles = walkFiles(luaDir, (fileName) => fileName.toLowerCase().endsWith('.risulua'));
  const luaFiles = risuFiles.length > 0
    ? risuFiles.map((filePath) => ({ filePath, extension: '.risulua' as const }))
    : walkFiles(luaDir, (fileName) => fileName.toLowerCase().endsWith('.lua'))
        .map((filePath) => ({ filePath, extension: '.lua' as const }));

  return luaFiles
    .map(({ filePath, extension }) => {
      const luaRelativePath = toPosix(path.relative(luaDir, filePath));
      return {
        filePath,
        relativePath: toPosix(path.relative(outputDir, filePath)),
        luaRelativePath,
        role: classifyLuaSourceRole(luaRelativePath),
        extension,
      };
    })
    .sort(compareLuaSourceFiles);
}

export function discoverLuaAnalysisFiles(outputDir: string): DiscoveredLuaAnalysisFile[] {
  const luaDir = path.join(outputDir, 'lua');
  if (!fs.existsSync(luaDir)) return [];

  return walkFiles(luaDir, (fileName) => fileName.toLowerCase().endsWith('.analysis.json'))
    .map((filePath) => {
      const luaRelativePath = toPosix(path.relative(luaDir, filePath));
      const relativePath = toPosix(path.relative(outputDir, filePath));
      return {
        filePath,
        relativePath,
        luaRelativePath,
        elementName: stripAnalysisJsonExtension(relativePath),
      };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function compareLuaSourceFiles(a: DiscoveredLuaSourceFile, b: DiscoveredLuaSourceFile): number {
  const aIsMain = a.luaRelativePath === 'main.risulua' || a.luaRelativePath === 'main.lua';
  const bIsMain = b.luaRelativePath === 'main.risulua' || b.luaRelativePath === 'main.lua';
  if (aIsMain !== bIsMain) return aIsMain ? -1 : 1;
  return a.relativePath.localeCompare(b.relativePath);
}

function stripAnalysisJsonExtension(relativePath: string): string {
  return relativePath.toLowerCase().endsWith('.analysis.json')
    ? relativePath.slice(0, -'.analysis.json'.length)
    : relativePath;
}

function walkFiles(rootDir: string, predicate: (fileName: string) => boolean): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      results.push(fullPath);
    }
  }

  return results.sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
}
