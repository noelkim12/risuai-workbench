import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAssetsWorkflow } from '../src/cli/assets/workflow';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('asset manifest builder', () => {
  it('builds a character asset manifest from canonical asset directories', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-asset-manifest-'));
    tempDirs.push(workDir);

    fs.mkdirSync(path.join(workDir, 'assets', 'icons'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'icons', 'main.png'), Buffer.from([1, 2, 3]));
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'voice.ogg'), Buffer.from([4, 5]));

    const result = runAssetsWorkflow(['--in', workDir]);

    expect(result).toBe(0);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(workDir, 'assets', 'manifest.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      version: 1,
      source_format: 'workspace',
      total: 2,
      extracted: 2,
      skipped: 0,
    });
    expect(manifest.assets).toEqual([
      expect.objectContaining({
        index: 0,
        extracted_path: 'additional/voice.ogg',
        type: 'x-risu-asset',
        name: 'voice',
        ext: 'ogg',
        status: 'extracted',
        size_bytes: 2,
      }),
      expect.objectContaining({
        index: 1,
        extracted_path: 'icons/main.png',
        type: 'icon',
        name: 'main',
        ext: 'png',
        status: 'extracted',
        size_bytes: 3,
      }),
    ]);
  });
});
