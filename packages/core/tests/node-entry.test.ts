import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const packageDir = process.cwd();
const packageJsonPath = path.join(packageDir, 'package.json');
const builtNodeEntryPath = path.join(packageDir, 'dist', 'node', 'index.js');

describe('packages/core node entry contract', () => {
  it('declares a public ./node subpath export', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    expect(packageJson.exports).toMatchObject({
      '.': './dist/index.js',
      './node': './dist/node/index.js',
    });
  });

  it('builds a node entry that exposes stripPngTextChunks', async () => {
    const nodeEntry = await import(builtNodeEntryPath);

    expect(nodeEntry.stripPngTextChunks).toBeTypeOf('function');
  });
});
