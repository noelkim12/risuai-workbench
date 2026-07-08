/**
 * Pure exclude filter for the read-only Plugin Viewer file tree.
 * @file packages/vscode/src/views/pluginFileTree.ts
 */

const EXPLICIT_EXCLUDES = new Set(['node_modules', '.git', 'dist']);

export function shouldExcludePluginEntry(name: string): boolean {
  if (EXPLICIT_EXCLUDES.has(name)) return true;
  return name.startsWith('.');
}
