import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RISUCHAR_KIND,
  discoverRisuLuaBundleTarget,
} from '../src/cli/shared/risulua-target';
import {
  RISUMODULE_KIND,
  RISUMODULE_SCHEMA_URL,
  RISUMODULE_SCHEMA_VERSION,
} from '../src/cli/shared/risumodule';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('risulua target discovery', () => {
  it('risulua target discovery resolves .risuchar metadata in auto classic mode', () => {
    const rootDir = createTempRoot();
    writeRisuchar(rootDir, { name: 'Hero Name: Alpha' });

    const target = discoverRisuLuaBundleTarget({ rootDir });

    expect(target.rootDir).toBe(path.resolve(rootDir));
    expect(target.markerPath).toBe(path.join(rootDir, '.risuchar'));
    expect(target.markerKind).toBe(RISUCHAR_KIND);
    expect(target.rawTargetName).toBe('Hero Name: Alpha');
    expect(target.targetName).toBe('Hero_Name_Alpha');
    expect(target.mode).toBe('classic');
    expect(target.sourceRoot).toBe(path.join(rootDir, 'lua'));
    expect(target.entryRelativePath).toBe('lua/Hero_Name_Alpha.risulua');
    expect(target.entryPath).toBe(path.join(rootDir, 'lua', 'Hero_Name_Alpha.risulua'));
    expect(target.distRelativePath).toBe('dist/Hero_Name_Alpha.risulua');
    expect(target.distPath).toBe(path.join(rootDir, 'dist', 'Hero_Name_Alpha.risulua'));
  });

  it('risulua target discovery resolves .risumodule metadata and dist paths', () => {
    const rootDir = createTempRoot();
    writeRisumodule(rootDir, { name: 'Workflow Module/One' });

    const target = discoverRisuLuaBundleTarget({ rootDir });

    expect(target.markerPath).toBe(path.join(rootDir, '.risumodule'));
    expect(target.markerKind).toBe(RISUMODULE_KIND);
    expect(target.rawTargetName).toBe('Workflow Module/One');
    expect(target.targetName).toBe('Workflow_Module_One');
    expect(target.mode).toBe('classic');
    expect(target.entryRelativePath).toBe('lua/Workflow_Module_One.risulua');
    expect(target.entryPath).toBe(path.join(rootDir, 'lua', 'Workflow_Module_One.risulua'));
    expect(target.distRelativePath).toBe('dist/Workflow_Module_One.risulua');
    expect(target.distRelativePath).not.toContain(path.sep === '\\' ? '\\' : '\\');
    expect(path.isAbsolute(target.distPath)).toBe(true);
  });

  it('risulua target discovery auto-detects modular when lua/main.risulua exists', () => {
    const rootDir = createTempRoot();
    writeRisuchar(rootDir, { name: 'Modular Hero' });
    writeFile(rootDir, 'lua/main.risulua', 'return require("features.entry")\n');

    const target = discoverRisuLuaBundleTarget({ rootDir, mode: null });

    expect(target.mode).toBe('modular');
    expect(target.entryRelativePath).toBe('lua/main.risulua');
    expect(target.entryPath).toBe(path.join(rootDir, 'lua', 'main.risulua'));
  });

  it('risulua target discovery auto-detects classic when lua/main.risulua is absent', () => {
    const rootDir = createTempRoot();
    writeRisumodule(rootDir, { name: 'Classic Module' });
    writeFile(rootDir, 'lua/Classic_Module.risulua', '-- classic single file\n');

    const target = discoverRisuLuaBundleTarget({ rootDir });

    expect(target.mode).toBe('classic');
    expect(target.entryRelativePath).toBe('lua/Classic_Module.risulua');
    expect(target.entryPath).toBe(path.join(rootDir, 'lua', 'Classic_Module.risulua'));
  });

  it('risulua target discovery rejects explicit classic when lua/main.risulua exists', () => {
    const rootDir = createTempRoot();
    writeRisuchar(rootDir, { name: 'Conflict Hero' });
    writeFile(rootDir, 'lua/main.risulua', '-- modular entry\n');

    expect(() => discoverRisuLuaBundleTarget({ rootDir, mode: 'classic' })).toThrow(
      `RisuLua classic mode cannot be used when lua/main.risulua exists: ${path.join(rootDir, 'lua', 'main.risulua')}`,
    );
  });

  it('risulua target discovery rejects explicit modular when lua/main.risulua is missing', () => {
    const rootDir = createTempRoot();
    writeRisumodule(rootDir, { name: 'Missing Entry Module' });

    expect(() => discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' })).toThrow(
      `RisuLua modular mode requires lua/main.risulua: ${path.join(rootDir, 'lua', 'main.risulua')}`,
    );
  });

  it('risulua target discovery keeps dist metadata POSIX relative and filesystem path absolute', () => {
    const rootDir = createTempRoot();
    writeRisuchar(rootDir, { name: '경로 테스트' });
    writeFile(rootDir, 'lua/main.risulua', '-- entry\n');

    const target = discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' });

    expect(target.distRelativePath).toBe('dist/경로_테스트.risulua');
    expect(target.distRelativePath).not.toContain('\\');
    expect(path.isAbsolute(target.distPath)).toBe(true);
    expect(target.distPath).toBe(path.join(rootDir, 'dist', '경로_테스트.risulua'));
  });
});

function createTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-target-discovery-'));
  tempDirs.push(rootDir);
  return rootDir;
}

function writeRisuchar(rootDir: string, overrides: Record<string, unknown> = {}): void {
  writeFile(rootDir, '.risuchar', `${JSON.stringify({
    $schema: 'https://risuai-workbench.dev/schemas/risuchar.schema.json',
    kind: RISUCHAR_KIND,
    schemaVersion: 1,
    id: 'character-id',
    name: 'Character',
    creator: 'tester',
    characterVersion: '1.0.0',
    createdAt: null,
    modifiedAt: null,
    sourceFormat: 'scaffold',
    image: null,
    tags: [],
    flags: {
      utilityBot: false,
      lowLevelAccess: false,
    },
    ...overrides,
  }, null, 2)}\n`);
}

function writeRisumodule(rootDir: string, overrides: Record<string, unknown> = {}): void {
  writeFile(rootDir, '.risumodule', `${JSON.stringify({
    $schema: RISUMODULE_SCHEMA_URL,
    kind: RISUMODULE_KIND,
    schemaVersion: RISUMODULE_SCHEMA_VERSION,
    id: 'module-id',
    name: 'Module',
    description: '',
    createdAt: null,
    modifiedAt: null,
    sourceFormat: 'scaffold',
    ...overrides,
  }, null, 2)}\n`);
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolutePath = path.join(rootDir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf-8');
}
