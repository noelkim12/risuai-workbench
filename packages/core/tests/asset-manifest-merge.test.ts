import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCharacterAssetManifest } from '../src/node/asset-manifest';
import { runAssetsWorkflow } from '../src/cli/assets/workflow';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function setupWorkspace(): string {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-asset-merge-'));
  tempDirs.push(workDir);
  fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
  fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));
  fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_smile.png'), Buffer.from([2]));
  return workDir;
}

function writeCatalog(workDir: string): void {
  fs.writeFileSync(
    path.join(workDir, 'assets', 'asset-catalog.json'),
    JSON.stringify({
      version: 1,
      schema: {
        slots: [
          { id: 's1', label: 'character' },
          { id: 's2', label: 'emotion' },
        ],
        joinTemplate: '{s1} {s2}',
      },
      vocab: { s1: ['Rin'], s2: ['angry', 'smile'] },
      expected: {},
      assignments: {
        'additional/rin_angry.png': { s1: 'Rin', s2: 'angry' },
        'additional/gone.png': { s1: 'Rin', s2: 'smile' },
      },
    }),
  );
}

describe('buildCharacterAssetManifest with catalog merge', () => {
  it('renders assigned names, falls back to stem, reports warnings', () => {
    const workDir = setupWorkspace();
    writeCatalog(workDir);

    const summary = buildCharacterAssetManifest({ rootDir: workDir });
    expect(summary.total).toBe(2);
    expect(summary.named).toBe(1);
    expect(summary.unassigned).toBe(1);
    expect(summary.orphanPaths).toEqual(['additional/gone.png']);

    const manifest = JSON.parse(fs.readFileSync(summary.manifestPath, 'utf-8')) as {
      assets: Array<{ extracted_path: string; name: string }>;
    };
    const byPath = new Map(manifest.assets.map((asset) => [asset.extracted_path, asset.name]));
    expect(byPath.get('additional/rin_angry.png')).toBe('Rin angry');
    expect(byPath.get('additional/rin_smile.png')).toBe('rin_smile');
  });

  it('preserves curated names across rebuilds', () => {
    const workDir = setupWorkspace();
    writeCatalog(workDir);
    buildCharacterAssetManifest({ rootDir: workDir });

    const summary = buildCharacterAssetManifest({ rootDir: workDir });
    const manifest = JSON.parse(fs.readFileSync(summary.manifestPath, 'utf-8')) as {
      assets: Array<{ extracted_path: string; name: string }>;
    };
    expect(manifest.assets.find((asset) => asset.extracted_path === 'additional/rin_angry.png')?.name).toBe('Rin angry');
  });

  it('builds without catalog exactly like before', () => {
    const workDir = setupWorkspace();
    const summary = buildCharacterAssetManifest({ rootDir: workDir });

    expect(summary.named).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(summary.manifestPath, 'utf-8')) as {
      assets: Array<{ name: string }>;
    };
    expect(manifest.assets.map((asset) => asset.name).sort()).toEqual(['rin_angry', 'rin_smile']);
  });
});

describe('assets CLI --check', () => {
  it('reports without writing manifest', () => {
    const workDir = setupWorkspace();
    writeCatalog(workDir);

    const exitCode = runAssetsWorkflow(['--in', workDir, '--check']);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(workDir, 'assets', 'manifest.json'))).toBe(false);
  });
});
