import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

/**
 * Recursively get all .ts files in a directory.
 * Throws if directory cannot be read to avoid silent failures.
 *
 * @param dir - Directory to scan
 * @returns Array of absolute file paths
 * @throws Error if directory does not exist or cannot be read
 */
function getTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...getTsFiles(fullPath));
    } else if (stat.isFile() && entry.endsWith('.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Recursively scan simulator source files for stale @file paths.
 *
 * @param rootPath - Repository root path
 * @returns Array of files containing stale paths
 */
function findStaleSimulatorPaths(rootPath: string): Array<{ file: string; lines: number[] }> {
  const simulatorDir = resolve(rootPath, 'packages/core/src/simulator');
  const stalePattern = /packages\/core\/src\/domain\/cbs\/simulator/;
  const results: Array<{ file: string; lines: number[] }> = [];

  const files = getTsFiles(simulatorDir);

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines: number[] = [];
    const linesArray = content.split('\n');

    for (let i = 0; i < linesArray.length; i++) {
      if (stalePattern.test(linesArray[i])) {
        lines.push(i + 1); // 1-indexed line numbers
      }
    }

    if (lines.length > 0) {
      results.push({ file, lines });
    }
  }

  return results;
}

describe('CBS simulator @file path sweep', () => {
  it('has no stale @file paths referencing domain/cbs/simulator', () => {
    // Use import.meta.url for ESM-compatible path resolution
    // tests/domain/cbs/ -> tests/ -> packages/core/ -> packages/ -> repo root
    const testFilePath = new URL('.', import.meta.url).pathname;
    const repoRoot = resolve(testFilePath, '../../../../..');
    const staleFiles = findStaleSimulatorPaths(repoRoot);

    if (staleFiles.length > 0) {
      const report = staleFiles
        .map(({ file, lines }) => `  - ${file.replace(repoRoot + '/', '')} (lines: ${lines.join(', ')})`)
        .join('\n');

      throw new Error(
        `Found ${staleFiles.length} simulator source file(s) with stale @file paths:\n${report}\n\n` +
          `These files contain references to 'packages/core/src/domain/cbs/simulator' ` +
          `which should be 'packages/core/src/simulator'.`
      );
    }

    expect(staleFiles).toHaveLength(0);
  });
});
