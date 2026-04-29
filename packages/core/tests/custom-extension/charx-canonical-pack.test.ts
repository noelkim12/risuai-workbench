import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
import { parseModuleRisum } from '../../src/cli/extract/parsers';

const tempDirs: string[] = [];

function packCharx(workDir: string, outPath = path.join(workDir, 'packed.charx')): { stdout: string; stderr: string } {
  const result = spawnSync(
    'node',
    [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'pack', '--in', workDir, '--format', 'charx', '--out', outPath],
    {
      cwd: process.cwd(),
      encoding: 'utf-8',
    }
  );

  if (result.status !== 0) {
    throw new Error(`${result.stderr}${result.stdout}`);
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

function readPackedCharx(outPath: string): any {
  const archive = unzipSync(readFileSync(outPath));
  return JSON.parse(strFromU8(archive['charx.json']));
}

function writeCanonicalManifest(workDir: string, overrides: Record<string, unknown> = {}): void {
  writeFileSync(
    path.join(workDir, '.risuchar'),
    `${JSON.stringify({
      kind: 'risu.character',
      schemaVersion: 1,
      id: 'test-character-id',
      name: 'Canonical Character',
      creator: 'Canonical Creator',
      characterVersion: '2.0',
      createdAt: '2026-04-01',
      modifiedAt: '2026-04-02',
      sourceFormat: 'charx',
      flags: {
        utilityBot: true,
        lowLevelAccess: false,
      },
      ...overrides,
    })}\n`,
    'utf-8'
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('charx canonical pack', () => {
  it('packs canonical-only .risuchar metadata and .risutext prose', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-canonical-only-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    mkdirSync(characterDir, { recursive: true });
    writeCanonicalManifest(workDir);
    writeFileSync(path.join(characterDir, 'description.risutext'), 'canonical description', 'utf-8');
    writeFileSync(path.join(characterDir, 'first_mes.risutext'), 'canonical first message', 'utf-8');
    writeFileSync(path.join(characterDir, 'additional_text.risutext'), 'canonical additional text', 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    packCharx(workDir, outPath);
    const packedCharx = readPackedCharx(outPath);

    expect(packedCharx.data.name).toBe('Canonical Character');
    expect(packedCharx.data.creator).toBe('Canonical Creator');
    expect(packedCharx.data.character_version).toBe('2.0');
    expect(packedCharx.data.creation_date).toBe('2026-04-01');
    expect(packedCharx.data.modification_date).toBe('2026-04-02');
    expect(packedCharx.data.extensions.risuai.utilityBot).toBe(true);
    expect(packedCharx.data.extensions.risuai.lowLevelAccess).toBe(false);
    expect(packedCharx.data.description).toBe('canonical description');
    expect(packedCharx.data.first_mes).toBe('canonical first message');
    expect(packedCharx.data.extensions.risuai.additionalText).toBe('canonical additional text');
  });

  it('packs canonical sidecar extensions, assets, and script safety flags', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-sidecar-assets-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const assetDir = path.join(workDir, 'assets');
    const iconDir = path.join(assetDir, 'icons');
    mkdirSync(characterDir, { recursive: true });
    mkdirSync(iconDir, { recursive: true });

    writeCanonicalManifest(workDir, {
      name: 'Sidecar Asset Character',
      flags: {
        utilityBot: false,
        lowLevelAccess: true,
      },
    });
    writeFileSync(path.join(characterDir, 'description.risutext'), 'sidecar asset description', 'utf-8');
    writeFileSync(path.join(characterDir, 'extensions.json'), `${JSON.stringify({
      vendorFixture: {
        preserved: true,
      },
      risuai: {
        safetyNote: 'lowLevelAccess remains explicit metadata',
      },
    })}\n`, 'utf-8');
    writeFileSync(path.join(iconDir, 'main.png'), Buffer.from([137, 80, 78, 71]));
    writeFileSync(path.join(assetDir, 'manifest.json'), `${JSON.stringify({
      version: 1,
      source_format: 'charx',
      total: 1,
      extracted: 1,
      skipped: 0,
      assets: [
        {
          index: 0,
          original_uri: 'embeded://assets/main.png',
          extracted_path: 'icons/main.png',
          status: 'extracted',
          type: 'icon',
          name: 'main',
          ext: 'png',
          subdir: 'icons',
          size_bytes: 4,
        },
      ],
    })}\n`, 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    packCharx(workDir, outPath);
    const archive = unzipSync(readFileSync(outPath));
    const packedCharx = JSON.parse(strFromU8(archive['charx.json']));

    expect(packedCharx.data.extensions.vendorFixture).toEqual({ preserved: true });
    expect(packedCharx.data.extensions.risuai.safetyNote).toBe('lowLevelAccess remains explicit metadata');
    expect(packedCharx.data.extensions.risuai.lowLevelAccess).toBe(true);
    expect(packedCharx.data.assets).toHaveLength(1);
    expect(packedCharx.data.assets[0]).toMatchObject({
      type: 'icon',
      name: 'main',
      ext: 'png',
    });
    expect(packedCharx.data.assets[0].uri).toMatch(/^embeded:\/\/assets\//);
    expect(Object.keys(archive).some((entryName) => entryName.startsWith('assets/'))).toBe(true);
  });

  it('packs .risuchar tags and selected image as the main icon asset', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-image-tags-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const assetDir = path.join(workDir, 'assets');
    const iconDir = path.join(assetDir, 'icons');
    mkdirSync(characterDir, { recursive: true });
    mkdirSync(iconDir, { recursive: true });

    writeCanonicalManifest(workDir, {
      name: 'Image Tags Character',
      image: 'assets/icons/portrait.png',
      tags: ['female', 'OfficeLady', 'romance'],
    });
    writeFileSync(path.join(characterDir, 'description.risutext'), 'image tags description', 'utf-8');
    writeFileSync(path.join(iconDir, 'portrait.png'), Buffer.from([137, 80, 78, 71, 9]));
    writeFileSync(path.join(assetDir, 'manifest.json'), `${JSON.stringify({
      version: 1,
      source_format: 'charx',
      total: 1,
      extracted: 1,
      skipped: 0,
      assets: [
        {
          index: 0,
          original_uri: 'embeded://assets/icons/portrait.png',
          extracted_path: 'icons/portrait.png',
          status: 'extracted',
          type: 'icon',
          name: 'portrait',
          ext: 'png',
          subdir: 'icons',
          size_bytes: 5,
        },
      ],
    })}\n`, 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    packCharx(workDir, outPath);
    const archive = unzipSync(readFileSync(outPath));
    const packedCharx = JSON.parse(strFromU8(archive['charx.json']));

    expect(packedCharx.data.tags).toEqual(['female', 'OfficeLady', 'romance']);
    expect(packedCharx.data.assets[0]).toMatchObject({
      type: 'icon',
      name: 'main',
      ext: 'png',
    });
    expect(packedCharx.data.assets[0].uri).toMatch(/^embeded:\/\/assets\/icon\/image\/main\.png$/);
    expect(Object.keys(archive)).toContain('assets/icon/image/main.png');
  });

  it('packs manifestless .risuchar selected image as the main icon asset', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-image-no-manifest-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const iconDir = path.join(workDir, 'assets', 'icons');
    mkdirSync(characterDir, { recursive: true });
    mkdirSync(iconDir, { recursive: true });

    writeCanonicalManifest(workDir, {
      name: 'Manifestless Image Character',
      image: 'assets/icons/portrait.png',
    });
    writeFileSync(path.join(characterDir, 'description.risutext'), 'manifestless image description', 'utf-8');
    writeFileSync(path.join(iconDir, 'portrait.png'), Buffer.from([137, 80, 78, 71, 10]));

    const outPath = path.join(workDir, 'packed.charx');
    packCharx(workDir, outPath);
    const archive = unzipSync(readFileSync(outPath));
    const packedCharx = JSON.parse(strFromU8(archive['charx.json']));

    expect(packedCharx.data.assets[0]).toMatchObject({
      type: 'icon',
      name: 'main',
      ext: 'png',
    });
    expect(packedCharx.data.assets[0].uri).toMatch(/^embeded:\/\/assets\/icon\/image\/main\.png$/);
    expect(Object.keys(archive)).toContain('assets/icon/image/main.png');
    expect(Array.from(archive['assets/icon/image/main.png'])).toEqual([137, 80, 78, 71, 10]);
  });

  it('round-trips extracted image and tags through canonical workspace', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-image-tags-roundtrip-'));
    tempDirs.push(workDir);

    const sourceCharx = path.join(workDir, 'source.charx');
    const extractedDir = path.join(workDir, 'extracted');
    const packedPath = path.join(workDir, 'repacked.charx');
    const charxData = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: 'Roundtrip Image Tags',
        description: 'roundtrip description',
        tags: ['female', 'OfficeLady', 'romance'],
        assets: [
          {
            type: 'icon',
            name: 'main',
            ext: 'png',
            uri: 'embeded://assets/main.png',
          },
        ],
        extensions: {
          risuai: {
            triggerscript: [],
            customScripts: [],
            additionalText: '',
            utilityBot: false,
            lowLevelAccess: false,
          },
        },
      },
    };

    writeFileSync(sourceCharx, Buffer.from(zipSync({
      'charx.json': strToU8(JSON.stringify(charxData, null, 2)),
      'assets/main.png': new Uint8Array([137, 80, 78, 71, 7]),
    }, { level: 0 })));

    const extractResult = spawnSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'extract', sourceCharx, '--out', extractedDir],
      { cwd: process.cwd(), encoding: 'utf-8' },
    );
    expect(extractResult.status, extractResult.stderr || extractResult.stdout).toBe(0);

    packCharx(extractedDir, packedPath);
    const packedCharx = readPackedCharx(packedPath);

    expect(packedCharx.data.tags).toEqual(['female', 'OfficeLady', 'romance']);
    expect(packedCharx.data.assets[0]).toMatchObject({
      type: 'icon',
      name: 'main',
      ext: 'png',
    });
  });

  it('warns and skips .risuchar image paths outside assets icons', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-image-tags-invalid-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    mkdirSync(characterDir, { recursive: true });
    writeCanonicalManifest(workDir, {
      name: 'Invalid Image Character',
      image: 'character/description.risutext',
      tags: ['safe-tag'],
    });
    writeFileSync(path.join(characterDir, 'description.risutext'), 'not an image', 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    const result = packCharx(workDir, outPath);
    const packedCharx = readPackedCharx(outPath);

    expect(result.stderr).toContain('.risuchar image');
    expect(packedCharx.data.tags).toEqual(['safe-tag']);
    expect(packedCharx.data.assets ?? []).toEqual([]);
  });

  it('falls back to legacy metadata, txt prose, and alternate_greetings.json when canonical sources are absent', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-legacy-fallback-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    mkdirSync(characterDir, { recursive: true });
    writeFileSync(path.join(characterDir, 'metadata.json'), `${JSON.stringify({ name: 'Legacy Character' })}\n`, 'utf-8');
    writeFileSync(path.join(characterDir, 'description.txt'), 'legacy description', 'utf-8');
    writeFileSync(path.join(characterDir, 'additional_text.txt'), 'legacy additional text', 'utf-8');
    writeFileSync(path.join(characterDir, 'alternate_greetings.json'), `${JSON.stringify(['legacy hello'])}\n`, 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    packCharx(workDir, outPath);
    const packedCharx = readPackedCharx(outPath);

    expect(packedCharx.data.name).toBe('Legacy Character');
    expect(packedCharx.data.description).toBe('legacy description');
    expect(packedCharx.data.extensions.risuai.additionalText).toBe('legacy additional text');
    expect(packedCharx.data.alternate_greetings).toEqual(['legacy hello']);
  });

  it('warns and ignores legacy values when canonical metadata, prose, and greetings exist', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-conflicts-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const greetingsDir = path.join(characterDir, 'alternate_greetings');
    mkdirSync(greetingsDir, { recursive: true });
    writeCanonicalManifest(workDir, { name: 'Canonical Wins' });
    writeFileSync(path.join(characterDir, 'metadata.json'), `${JSON.stringify({ name: 'Legacy Loses' })}\n`, 'utf-8');
    writeFileSync(path.join(characterDir, 'description.risutext'), 'canonical description', 'utf-8');
    writeFileSync(path.join(characterDir, 'description.txt'), 'legacy description', 'utf-8');
    writeFileSync(path.join(greetingsDir, 'greeting-001.risutext'), 'canonical greeting', 'utf-8');
    writeFileSync(path.join(characterDir, 'alternate_greetings.json'), `${JSON.stringify(['legacy greeting'])}\n`, 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    const result = packCharx(workDir, outPath);
    const packedCharx = readPackedCharx(outPath);

    expect(packedCharx.data.name).toBe('Canonical Wins');
    expect(packedCharx.data.description).toBe('canonical description');
    expect(packedCharx.data.alternate_greetings).toEqual(['canonical greeting']);
    expect(result.stderr).toContain('.risuchar');
    expect(result.stderr).toContain('metadata.json');
    expect(result.stderr).toContain('description.risutext');
    expect(result.stderr).toContain('description.txt');
    expect(result.stderr).toContain('alternate_greetings');
    expect(result.stderr).toContain('alternate_greetings.json');
  });

  it('packs ordered canonical alternate greetings before sorted unlisted risutext files', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-greeting-order-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const greetingsDir = path.join(characterDir, 'alternate_greetings');
    mkdirSync(greetingsDir, { recursive: true });
    writeCanonicalManifest(workDir, { name: 'Greeting Order' });
    writeFileSync(path.join(characterDir, 'description.risutext'), 'test', 'utf-8');
    writeFileSync(path.join(greetingsDir, '_order.json'), `${JSON.stringify(['second.risutext'])}\n`, 'utf-8');
    writeFileSync(path.join(greetingsDir, 'z-last.risutext'), 'z unlisted', 'utf-8');
    writeFileSync(path.join(greetingsDir, 'a-first.risutext'), 'a unlisted', 'utf-8');
    writeFileSync(path.join(greetingsDir, 'second.risutext'), 'ordered second', 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    packCharx(workDir, outPath);
    const packedCharx = readPackedCharx(outPath);

    expect(packedCharx.data.alternate_greetings).toEqual(['ordered second', 'a unlisted', 'z unlisted']);
  });

  it('errors when canonical alternate greeting _order.json lists a missing file', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-greeting-missing-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const greetingsDir = path.join(characterDir, 'alternate_greetings');
    mkdirSync(greetingsDir, { recursive: true });
    writeCanonicalManifest(workDir, { name: 'Greeting Missing' });
    writeFileSync(path.join(characterDir, 'description.risutext'), 'test', 'utf-8');
    writeFileSync(path.join(greetingsDir, '_order.json'), `${JSON.stringify(['missing.risutext'])}\n`, 'utf-8');

    expect(() => packCharx(workDir)).toThrow(/missing\.risutext/);
  });
  it('packs canonical lorebooks into character_book.entries', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-lorebooks-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const lorebooksDir = path.join(workDir, 'lorebooks');
    mkdirSync(characterDir, { recursive: true });
    mkdirSync(lorebooksDir, { recursive: true });

    // Write minimal character
    writeFileSync(path.join(characterDir, 'description.txt'), 'test', 'utf-8');
    writeFileSync(path.join(characterDir, 'metadata.json'), `${JSON.stringify({ name: 'Lorebook Test' })}\n`, 'utf-8');

    // Write canonical lorebook files
    const lorebook1 = `---
name: "Test Lorebook"
comment: "A test lorebook entry"
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
test key
another key
@@@ CONTENT
This is the lorebook content.
`;
    writeFileSync(path.join(lorebooksDir, 'test_lorebook.risulorebook'), lorebook1, 'utf-8');

    writeFileSync(
      path.join(lorebooksDir, '_order.json'),
      `${JSON.stringify(['test_lorebook.risulorebook'])}\n`,
      'utf-8'
    );

    const outPath = path.join(workDir, 'packed.charx');
    execFileSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'pack', '--in', workDir, '--format', 'charx', '--out', outPath],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      }
    );

    const archive = unzipSync(readFileSync(outPath));
    const packedCharx = JSON.parse(strFromU8(archive['charx.json']));

    expect(packedCharx.data.character_book).toBeDefined();
    expect(packedCharx.data.character_book.entries).toBeDefined();
    expect(packedCharx.data.character_book.entries.length).toBe(1);

    const entry = packedCharx.data.character_book.entries[0];
    expect(entry.name).toBe('Test Lorebook');
    expect(entry.comment).toBe('A test lorebook entry');
    expect(entry.keys).toEqual(['test key', 'another key']);
    expect(entry.content).toBe('This is the lorebook content.');
    expect(entry.mode).toBe('normal');
    expect(entry.constant).toBe(false);
    expect(entry.selective).toBe(false);
    expect(entry.enabled).toBe(true); // V3 export hardcodes enabled: true
  });

  it('packs lorebook folder metadata from path-based lorebook directories and _order.json', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-folders-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const lorebooksDir = path.join(workDir, 'lorebooks');
    mkdirSync(characterDir, { recursive: true });
    mkdirSync(lorebooksDir, { recursive: true });

    // Write minimal character
    writeFileSync(path.join(characterDir, 'description.txt'), 'test', 'utf-8');
    writeFileSync(path.join(characterDir, 'metadata.json'), `${JSON.stringify({ name: 'Folder Test' })}\n`, 'utf-8');

    mkdirSync(path.join(lorebooksDir, 'Test_Folder'), { recursive: true });

    // Write _order.json with a folder path entry only
    writeFileSync(
      path.join(lorebooksDir, '_order.json'),
      `${JSON.stringify(['Test_Folder'])}\n`,
      'utf-8'
    );

    const outPath = path.join(workDir, 'packed.charx');
    execFileSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'pack', '--in', workDir, '--format', 'charx', '--out', outPath],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      }
    );

    const archive = unzipSync(readFileSync(outPath));
    const packedCharx = JSON.parse(strFromU8(archive['charx.json']));

    expect(packedCharx.data.character_book).toBeDefined();
    expect(packedCharx.data.character_book.entries).toBeDefined();
    expect(packedCharx.data.character_book.entries.length).toBe(1);

    const entry = packedCharx.data.character_book.entries[0];
    expect(entry.name).toBe('Test_Folder');
    expect(entry.comment).toBe('Test_Folder');
    expect(entry.mode).toBe('folder');
    expect(entry.keys).toEqual(['folder-1']);
    expect(entry.content).toBe(''); // Folders have empty content
  });

  it('packs canonical regex into customScripts', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-regex-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const regexDir = path.join(workDir, 'regex');
    mkdirSync(characterDir, { recursive: true });
    mkdirSync(regexDir, { recursive: true });

    // Write minimal character
    writeFileSync(path.join(characterDir, 'description.txt'), 'test', 'utf-8');
    writeFileSync(path.join(characterDir, 'metadata.json'), `${JSON.stringify({ name: 'Regex Test' })}\n`, 'utf-8');

    // Write canonical regex file
    const regex = `---
comment: "Test Regex"
type: editinput
flag: "g"
ableFlag: true
---
@@@ IN
old text
@@@ OUT
new text
`;
    writeFileSync(path.join(regexDir, 'test_regex.risuregex'), regex, 'utf-8');

    writeFileSync(
      path.join(regexDir, '_order.json'),
      `${JSON.stringify(['test_regex.risuregex'])}\n`,
      'utf-8'
    );

    const outPath = path.join(workDir, 'packed.charx');
    execFileSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'pack', '--in', workDir, '--format', 'charx', '--out', outPath],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      }
    );

    const archive = unzipSync(readFileSync(outPath));
    const packedCharx = JSON.parse(strFromU8(archive['charx.json']));

    expect(packedCharx.data.extensions.risuai.customScripts).toBeDefined();
    expect(packedCharx.data.extensions.risuai.customScripts.length).toBe(1);

    const script = packedCharx.data.extensions.risuai.customScripts[0];
    expect(script.comment).toBe('Test Regex');
    expect(script.type).toBe('editinput');
    expect(script.flag).toBe('g');
    expect(script.ableFlag).toBe(true);
    expect(script.in).toBe('old text');
    expect(script.out).toBe('new text');
  });

  it('packs canonical lua triggerscript', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-lua-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const luaDir = path.join(workDir, 'lua');
    mkdirSync(characterDir, { recursive: true });
    mkdirSync(luaDir, { recursive: true });

    // Write minimal character
    writeFileSync(path.join(characterDir, 'description.txt'), 'test', 'utf-8');
    writeFileSync(path.join(characterDir, 'metadata.json'), `${JSON.stringify({ name: 'Lua Test' })}
`, 'utf-8');

    // Write canonical lua file using target-name-based naming (sanitized)
    const luaCode = `-- Test triggerscript
function onTrigger()
  print("Hello from trigger!")
end
`;
    writeFileSync(path.join(luaDir, 'Lua_Test.risulua'), luaCode, 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    execFileSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'pack', '--in', workDir, '--format', 'charx', '--out', outPath],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      }
    );

    const archive = unzipSync(readFileSync(outPath));
    const packedCharx = JSON.parse(strFromU8(archive['charx.json']));

    // Verify triggerscript is proper array structure (not raw string)
    expect(packedCharx.data.extensions.risuai.triggerscript).toBeDefined();
    expect(Array.isArray(packedCharx.data.extensions.risuai.triggerscript)).toBe(true);
    expect(packedCharx.data.extensions.risuai.triggerscript.length).toBe(1);

    const trigger = packedCharx.data.extensions.risuai.triggerscript[0];
    expect(trigger.comment).toBe('Canonical Lua Trigger');
    expect(trigger.type).toBe('manual');
    expect(trigger.effect).toBeDefined();
    expect(trigger.effect.length).toBe(1);
    expect(trigger.effect[0].type).toBe('triggerlua');
    expect(trigger.effect[0].code).toContain('onTrigger');

    // Verify module.risum retains trigger content (round-trip check)
    const module = parseModuleRisum(Buffer.from(archive['module.risum']));
    expect(module.trigger).toBeDefined();
    expect(Array.isArray(module.trigger)).toBe(true);
    expect(module.trigger.length).toBe(1);
    expect(module.trigger[0].effect[0].code).toContain('onTrigger');
  });

  it('packs canonical html background', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-html-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const htmlDir = path.join(workDir, 'html');
    mkdirSync(characterDir, { recursive: true });
    mkdirSync(htmlDir, { recursive: true });

    // Write minimal character
    writeFileSync(path.join(characterDir, 'description.txt'), 'test', 'utf-8');
    writeFileSync(path.join(characterDir, 'metadata.json'), `${JSON.stringify({ name: 'HTML Test' })}\n`, 'utf-8');

    // Write canonical html file
    const html = `<div class="background">
  <h1>Character Background</h1>
  <p>Welcome to the scene!</p>
</div>`;
    writeFileSync(path.join(htmlDir, 'background.risuhtml'), html, 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    execFileSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'pack', '--in', workDir, '--format', 'charx', '--out', outPath],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      }
    );

    const archive = unzipSync(readFileSync(outPath));
    const packedCharx = JSON.parse(strFromU8(archive['charx.json']));

    expect(packedCharx.data.extensions.risuai.backgroundHTML).toBeDefined();
    expect(packedCharx.data.extensions.risuai.backgroundHTML).toContain('Character Background');
  });

  it('packs canonical variables', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-variables-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    const variablesDir = path.join(workDir, 'variables');
    mkdirSync(characterDir, { recursive: true });
    mkdirSync(variablesDir, { recursive: true });

    // Write minimal character
    writeFileSync(path.join(characterDir, 'description.txt'), 'test', 'utf-8');
    writeFileSync(path.join(characterDir, 'metadata.json'), `${JSON.stringify({ name: 'Variables Test' })}
`, 'utf-8');

    // Write canonical variables file using target-name-based naming (sanitized)
    const variables = `playerName=Hero
health=100
mana=50
emptyValue=
`;
    writeFileSync(path.join(variablesDir, 'Variables_Test.risuvar'), variables, 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    execFileSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'pack', '--in', workDir, '--format', 'charx', '--out', outPath],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      }
    );

    const archive = unzipSync(readFileSync(outPath));
    const packedCharx = JSON.parse(strFromU8(archive['charx.json']));

    expect(packedCharx.data.extensions.risuai.defaultVariables).toBeDefined();
    expect(packedCharx.data.extensions.risuai.defaultVariables).toContain('playerName=Hero');
    expect(packedCharx.data.extensions.risuai.defaultVariables).toContain('health=100');
    expect(packedCharx.data.extensions.risuai.defaultVariables).toContain('mana=50');
  });

  it('does not include .risutoggle in charx output', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-toggle-check-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    mkdirSync(characterDir, { recursive: true });

    // Write minimal character
    writeFileSync(path.join(characterDir, 'description.txt'), 'test', 'utf-8');
    writeFileSync(path.join(characterDir, 'metadata.json'), `${JSON.stringify({ name: 'Toggle Test' })}\n`, 'utf-8');

    // Write module.risutoggle (should be ignored for charx)
    writeFileSync(path.join(characterDir, 'module.risutoggle'), '<module-toggle>test</module-toggle>', 'utf-8');

    const outPath = path.join(workDir, 'packed.charx');
    execFileSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'pack', '--in', workDir, '--format', 'charx', '--out', outPath],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      }
    );

    const archive = unzipSync(readFileSync(outPath));
    const packedCharx = JSON.parse(strFromU8(archive['charx.json']));

    // customModuleToggle should NOT be in charx extensions
    expect(packedCharx.data.extensions.risuai.customModuleToggle).toBeUndefined();
  });
});
