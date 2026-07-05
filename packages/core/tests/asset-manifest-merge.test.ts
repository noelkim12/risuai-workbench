import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  bootstrapAssetCatalogFromEntries,
  bootstrapAssetCatalogFromManifest,
  previewAssetCatalogBootstrapEntries,
} from '../src/node/asset-catalog-bootstrap';
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

describe('bootstrapAssetCatalogFromManifest', () => {
  it('extracts vocab and assigns all manifest names using the current schema', () => {
    const workDir = setupWorkspace();
    fs.writeFileSync(
      path.join(workDir, 'assets', 'manifest.json'),
      JSON.stringify({
        version: 1,
        assets: [
          { extracted_path: 'additional/rin_angry.png', status: 'extracted', name: 'Rin angry' },
          { extracted_path: 'additional/rin_smile.png', status: 'extracted', name: 'Rin smile' },
        ],
      }),
    );

    const catalog = bootstrapAssetCatalogFromManifest({ rootDir: workDir });

    expect(catalog.vocab).toEqual({ s1: ['Rin'], s2: ['angry', 'smile'] });
    expect(catalog.assignments).toEqual({
      'additional/rin_angry.png': { s1: 'Rin', s2: 'angry' },
      'additional/rin_smile.png': { s1: 'Rin', s2: 'smile' },
    });
  });

  it('supports multi-word character names in legacy manifests', () => {
    const workDir = setupWorkspace();
    fs.writeFileSync(
      path.join(workDir, 'assets', 'manifest.json'),
      JSON.stringify({
        version: 1,
        assets: [
          { extracted_path: 'additional/ahn_angry.png', status: 'extracted', name: 'Ahn Do-hyun angry' },
          { extracted_path: 'additional/ahn_acting_coy.png', status: 'extracted', name: 'Ahn Do-hyun acting coy' },
        ],
      }),
    );

    const catalog = bootstrapAssetCatalogFromManifest({ rootDir: workDir });

    expect(catalog.vocab.s1).toEqual(['Ahn Do-hyun']);
    expect(catalog.vocab.s2).toEqual(['acting coy', 'angry']);
    expect(catalog.assignments['additional/ahn_acting_coy.png']).toEqual({ s1: 'Ahn Do-hyun', s2: 'acting coy' });
  });

  it('preserves underscore-composed trailing slot values when schema uses underscore separator', () => {
    const workDir = setupWorkspace();
    fs.writeFileSync(
      path.join(workDir, 'assets', 'manifest.json'),
      JSON.stringify({
        version: 1,
        assets: [{ extracted_path: 'additional/anelia_acting_coy.png', status: 'extracted', name: 'anelia_acting_coy' }],
      }),
    );

    const catalog = bootstrapAssetCatalogFromManifest({ rootDir: workDir });

    expect(catalog.vocab).toEqual({ s1: ['anelia'], s2: ['acting_coy'] });
    expect(catalog.assignments['additional/anelia_acting_coy.png']).toEqual({ s1: 'anelia', s2: 'acting_coy' });
  });

  it('assigns first separator tokens to earlier slots and keeps the remainder in the last slot', () => {
    const workDir = setupWorkspace();
    fs.writeFileSync(
      path.join(workDir, 'assets', 'asset-catalog.json'),
      JSON.stringify({
        version: 1,
        schema: {
          slots: [
            { id: 's1', label: 'character' },
            { id: 's2', label: 'costume' },
            { id: 's3', label: 'pose' },
          ],
          joinTemplate: '{s1}_{s2}_{s3}',
        },
        vocab: { s1: [], s2: [], s3: [] },
        expected: {},
        assignments: {},
      }),
    );
    fs.writeFileSync(
      path.join(workDir, 'assets', 'manifest.json'),
      JSON.stringify({
        version: 1,
        assets: [
          {
            extracted_path: 'additional/agatha_nun_reverse_tes_aa.png',
            status: 'extracted',
            name: 'agatha_nun_reverse_tes_aa',
          },
        ],
      }),
    );

    const catalog = bootstrapAssetCatalogFromManifest({ rootDir: workDir });

    expect(catalog.vocab).toEqual({ s1: ['agatha'], s2: ['nun'], s3: ['reverse_tes_aa'] });
    expect(catalog.assignments['additional/agatha_nun_reverse_tes_aa.png']).toEqual({
      s1: 'agatha',
      s2: 'nun',
      s3: 'reverse_tes_aa',
    });
  });

  it('uses the saved schema separator for positional bootstrap', () => {
    const workDir = setupWorkspace();
    fs.writeFileSync(
      path.join(workDir, 'assets', 'asset-catalog.json'),
      JSON.stringify({
        version: 1,
        schema: {
          slots: [
            { id: 's1', label: 'character' },
            { id: 's2', label: 'costume' },
            { id: 's3', label: 'pose' },
          ],
          joinTemplate: '{s1}-{s2}-{s3}',
        },
        vocab: { s1: [], s2: [], s3: [] },
        expected: {},
        assignments: {},
      }),
    );
    fs.writeFileSync(
      path.join(workDir, 'assets', 'manifest.json'),
      JSON.stringify({
        version: 1,
        assets: [{ extracted_path: 'additional/agatha-nun-reverse-tes-aa.png', status: 'extracted', name: 'agatha-nun-reverse-tes-aa' }],
      }),
    );

    const catalog = bootstrapAssetCatalogFromManifest({ rootDir: workDir });

    expect(catalog.vocab).toEqual({ s1: ['agatha'], s2: ['nun'], s3: ['reverse-tes-aa'] });
  });

  it('assigns separatorless extension-stripped names to the first slot', () => {
    const workDir = setupWorkspace();
    fs.writeFileSync(
      path.join(workDir, 'assets', 'manifest.json'),
      JSON.stringify({
        version: 1,
        assets: [
          {
            extracted_path: 'additional/3-corruption.png.png',
            status: 'extracted',
            name: '3-corruption.png',
          },
        ],
      }),
    );

    const catalog = bootstrapAssetCatalogFromManifest({ rootDir: workDir });

    expect(catalog.vocab).toEqual({ s1: ['3-corruption'], s2: [] });
    expect(catalog.assignments['additional/3-corruption.png.png']).toEqual({ s1: '3-corruption' });
  });

  it('can regenerate from file names or fill only missing assignments', () => {
    const workDir = setupWorkspace();
    writeCatalog(workDir);
    const base = bootstrapAssetCatalogFromManifest({ rootDir: workDir });
    const entries = [
      { path: 'additional/rin_angry.png', name: 'Rin angry' },
      { path: 'additional/rin_smile.png', name: 'Rin smile' },
      { path: 'additional/yuna_angry.png', name: 'Yuna angry' },
    ];

    const full = bootstrapAssetCatalogFromEntries(base, entries, 'full');
    const missing = bootstrapAssetCatalogFromEntries(base, entries, 'missing');

    expect(full.assignments).toEqual({
      'additional/rin_angry.png': { s1: 'Rin', s2: 'angry' },
      'additional/rin_smile.png': { s1: 'Rin', s2: 'smile' },
      'additional/yuna_angry.png': { s1: 'Yuna', s2: 'angry' },
    });
    expect(missing.assignments['additional/gone.png']).toEqual({ s1: 'Rin', s2: 'smile' });
    expect(missing.assignments['additional/yuna_angry.png']).toEqual({ s1: 'Yuna', s2: 'angry' });
  });

  it('previews and applies configured separator token counts for underscore-composed first slots', () => {
    const workDir = setupWorkspace();
    writeCatalog(workDir);
    const base = bootstrapAssetCatalogFromManifest({ rootDir: workDir });
    const entries = [
      { path: 'additional/Ahn_Do-hyun_acting_coy.png', name: 'Ahn_Do-hyun_acting_coy' },
      { path: 'additional/Ahn_Do-hyun_angry.png', name: 'Ahn_Do-hyun_angry' },
    ];
    const split = { separator: '_', slotTokenCounts: { s1: 2 } };

    const preview = previewAssetCatalogBootstrapEntries(base, entries, split);
    const catalog = bootstrapAssetCatalogFromEntries(base, entries, { mode: 'full', split });

    expect(preview.map((entry) => entry.slots)).toEqual([
      { s1: 'Ahn_Do-hyun', s2: 'acting_coy' },
      { s1: 'Ahn_Do-hyun', s2: 'angry' },
    ]);
    expect(catalog.vocab).toEqual({ s1: ['Ahn_Do-hyun'], s2: ['acting_coy', 'angry'] });
    expect(catalog.assignments['additional/Ahn_Do-hyun_acting_coy.png']).toEqual({
      s1: 'Ahn_Do-hyun',
      s2: 'acting_coy',
    });
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
