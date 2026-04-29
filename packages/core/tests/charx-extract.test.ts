import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createMockCharxWithTriggerscript(): Buffer {
  // Create a mock charx with triggerscript array (real upstream format)
  const charxData = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: 'Test Character',
      description: 'Test description',
      first_mes: 'Hello!',
      extensions: {
        risuai: {
          triggerscript: [
            {
              comment: 'Test Trigger',
              type: 'manual',
              conditions: [],
              effect: [
                {
                  type: 'triggerlua',
                  code: 'function onTrigger()\n  print("Hello from trigger!")\nend',
                  indent: 0,
                },
              ],
            },
          ],
          customScripts: [],
          additionalText: '',
          utilityBot: false,
          lowLevelAccess: false,
        },
      },
    },
  };

  const zipData = zipSync({
    'charx.json': strToU8(JSON.stringify(charxData, null, 2)),
  }, { level: 0 });

  return Buffer.from(zipData);
}

/**
 * createCanonicalCharacterFixture 함수.
 * canonical character extract 기대값을 검증할 수 있는 최소 charx를 만듦.
 *
 * @returns zip으로 직렬화한 charx fixture 버퍼
 */
function createCanonicalCharacterFixture(): Buffer {
  const charxData = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      character_id: 'char-fixture-001',
      name: 'Canonical Character',
      creator: 'Fixture Author',
      character_version: '2.3',
      creation_date: '2026-04-28T00:00:00.000Z',
      modification_date: '2026-04-29T00:00:00.000Z',
      description: 'Fixture description',
      first_mes: 'Fixture first message',
      system_prompt: 'Fixture system prompt',
      replaceGlobalNote: 'Fixture replace global note',
      creator_notes: 'Fixture creator notes',
      alternate_greetings: ['Greeting one', 'Greeting two'],
      assets: [
        {
          type: 'icon',
          name: 'main',
          ext: 'png',
          uri: 'embeded://assets/main.png',
        },
      ],
      extensions: {
        vendorFixture: {
          compatibility: 'opaque-extension-value',
        },
        risuai: {
          triggerscript: [],
          customScripts: [],
          additionalText: 'Fixture additional text',
          utilityBot: true,
          lowLevelAccess: false,
          safetyNote: 'script access stays metadata-only',
        },
      },
    },
  };

  return Buffer.from(zipSync({
    'charx.json': strToU8(JSON.stringify(charxData, null, 2)),
    'assets/main.png': new Uint8Array([137, 80, 78, 71]),
  }, { level: 0 }));
}

describe('charx extract integration (canonical mode)', () => {
  it('extracts character metadata owner and full-file .risutext prose', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-risuchar-extract-'));
    tempDirs.push(workDir);

    const charxPath = path.join(workDir, 'canonical.charx');
    writeFileSync(charxPath, createCanonicalCharacterFixture());

    const outDir = path.join(workDir, 'output');
    mkdirSync(outDir, { recursive: true });

    const result = spawnSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'extract', charxPath, '--out', outDir],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const manifest = JSON.parse(readFileSync(path.join(outDir, '.risuchar'), 'utf-8')) as Record<string, any>;
    expect(manifest).toMatchObject({
      $schema: 'https://risuai-workbench.dev/schemas/risuchar.schema.json',
      kind: 'risu.character',
      schemaVersion: 1,
      id: 'char-fixture-001',
      name: 'Canonical Character',
      creator: 'Fixture Author',
      characterVersion: '2.3',
      createdAt: '2026-04-28T00:00:00.000Z',
      modifiedAt: '2026-04-29T00:00:00.000Z',
      sourceFormat: 'charx',
      flags: {
        utilityBot: true,
        lowLevelAccess: false,
      },
    });
    expect(manifest.description).toBeUndefined();
    expect(manifest.prose).toBeUndefined();
    expect(manifest.fields).toBeUndefined();
    expect(manifest.data).toBeUndefined();

    const extensionSidecar = JSON.parse(
      readFileSync(path.join(outDir, 'character', 'extensions.json'), 'utf-8'),
    ) as Record<string, any>;
    expect(extensionSidecar).toEqual({
      vendorFixture: {
        compatibility: 'opaque-extension-value',
      },
      risuai: {
        safetyNote: 'script access stays metadata-only',
      },
    });

    const proseExpectations: Array<[string, string]> = [
      ['description.risutext', 'Fixture description'],
      ['first_mes.risutext', 'Fixture first message'],
      ['system_prompt.risutext', 'Fixture system prompt'],
      ['replace_global_note.risutext', 'Fixture replace global note'],
      ['creator_notes.risutext', 'Fixture creator notes'],
      ['additional_text.risutext', 'Fixture additional text'],
    ];
    for (const [fileName, expectedContent] of proseExpectations) {
      expect(readFileSync(path.join(outDir, 'character', fileName), 'utf-8')).toBe(expectedContent);
    }

    const greetingsDir = path.join(outDir, 'character', 'alternate_greetings');
    const greetingOrder = JSON.parse(readFileSync(path.join(greetingsDir, '_order.json'), 'utf-8')) as string[];
    expect(greetingOrder).toEqual(['greeting-001.risutext', 'greeting-002.risutext']);
    expect(readFileSync(path.join(greetingsDir, 'greeting-001.risutext'), 'utf-8')).toBe('Greeting one');
    expect(readFileSync(path.join(greetingsDir, 'greeting-002.risutext'), 'utf-8')).toBe('Greeting two');

    const assetManifest = JSON.parse(readFileSync(path.join(outDir, 'assets', 'manifest.json'), 'utf-8')) as Record<string, any>;
    expect(assetManifest.assets).toEqual([
      expect.objectContaining({
        index: 0,
        original_uri: 'embeded://assets/main.png',
        status: 'extracted',
        type: 'icon',
        name: 'main',
        ext: 'png',
      }),
    ]);
  });

  it('keeps the .risuchar schema limited to metadata and safety flags', () => {
    const repoRoot = path.resolve(process.cwd(), '..', '..');
    const schemaPath = path.join(repoRoot, 'docs', 'schemas', 'risuchar.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as Record<string, any>;

    expect(schema.$id).toBe('https://risuai-workbench.dev/schemas/risuchar.schema.json');
    expect(schema.required).toEqual([
      'kind',
      'schemaVersion',
      'id',
      'name',
      'creator',
      'characterVersion',
      'createdAt',
      'modifiedAt',
      'sourceFormat',
      'flags',
    ]);
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining([
      'kind',
      'schemaVersion',
      'id',
      'name',
      'creator',
      'characterVersion',
      'createdAt',
      'modifiedAt',
      'sourceFormat',
      'flags',
    ]));
    expect(schema.properties.sourceFormat.enum).toEqual(['charx', 'png', 'json', 'scaffold']);
    expect(schema.properties.flags.required).toEqual(['utilityBot', 'lowLevelAccess']);
    expect(schema.properties.prose).toBeUndefined();
    expect(schema.properties.fields).toBeUndefined();
    expect(schema.properties.fieldMappings).toBeUndefined();
    expect(schema.required).not.toContain('prose');
    expect(schema.required).not.toContain('fields');
    expect(schema.required).not.toContain('fieldMappings');
  });

  it('scaffolds a canonical charx workspace without legacy character files', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-scaffold-'));
    tempDirs.push(workDir);
    const outDir = path.join(workDir, 'canonical-scaffold');

    const result = spawnSync(
      'node',
      [
        path.join(process.cwd(), 'dist', 'cli', 'main.js'),
        'scaffold',
        'charx',
        '--name',
        'Scaffold Character',
        '--creator',
        'Scaffold Author',
        '--out',
        outDir,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const manifest = JSON.parse(readFileSync(path.join(outDir, '.risuchar'), 'utf-8')) as Record<string, any>;
    expect(manifest).toMatchObject({
      $schema: 'https://risuai-workbench.dev/schemas/risuchar.schema.json',
      kind: 'risu.character',
      schemaVersion: 1,
      name: 'Scaffold Character',
      creator: 'Scaffold Author',
      characterVersion: '1.0',
      sourceFormat: 'scaffold',
      flags: {
        utilityBot: false,
        lowLevelAccess: false,
      },
    });
    expect(typeof manifest.id).toBe('string');
    expect(existsSync(path.join(outDir, 'character', 'metadata.json'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'description.txt'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'post_history_instructions.risutext'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'alternate_greetings.json'))).toBe(false);

    for (const fileName of [
      'description.risutext',
      'first_mes.risutext',
      'system_prompt.risutext',
      'replace_global_note.risutext',
      'creator_notes.risutext',
      'additional_text.risutext',
    ]) {
      expect(existsSync(path.join(outDir, 'character', fileName))).toBe(true);
    }
    expect(JSON.parse(readFileSync(path.join(outDir, 'character', 'alternate_greetings', '_order.json'), 'utf-8'))).toEqual([]);
    expect(existsSync(path.join(outDir, 'lorebooks', '_order.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'regex', '_order.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'variables', 'Scaffold_Character.risuvar'))).toBe(true);
  });

  it('extracts triggerscript array to .risulua file (T12 regression test)', () => {
    // This test specifically catches the regression where triggerscript array
    // wasn't being extracted to .risulua because extractLuaFromCharx expected a string
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-lua-extract-'));
    tempDirs.push(workDir);

    const charxPath = path.join(workDir, 'test.charx');
    const charxBuffer = createMockCharxWithTriggerscript();
    writeFileSync(charxPath, charxBuffer);

    const outDir = path.join(workDir, 'output');
    mkdirSync(outDir, { recursive: true });

    const result = spawnSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'extract', charxPath, '--out', outDir],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);

    // Verify lua file was extracted using target-name-based naming (sanitized)
    const luaFile = path.join(outDir, 'lua', 'Test_Character.risulua');
    expect(existsSync(luaFile)).toBe(true);

    const luaContent = readFileSync(luaFile, 'utf-8');
    expect(luaContent).toContain('onTrigger');
    expect(luaContent).toContain('Hello from trigger!');
  });

  it('extracts charx defaultVariables into variables/<character>.risuvar', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-vars-extract-'));
    tempDirs.push(workDir);

    const charxPath = path.join(workDir, 'vars.charx');
    const charxData = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: 'Variable Character',
        description: 'Test description',
        extensions: {
          risuai: {
            defaultVariables: 'hp=100\nmp=30',
            triggerscript: [],
            customScripts: [],
            additionalText: '',
            utilityBot: false,
            lowLevelAccess: false,
          },
        },
      },
    };
    writeFileSync(charxPath, Buffer.from(zipSync({ 'charx.json': strToU8(JSON.stringify(charxData, null, 2)) }, { level: 0 })));

    const outDir = path.join(workDir, 'output');
    mkdirSync(outDir, { recursive: true });

    const result = spawnSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'extract', charxPath, '--out', outDir],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const variableFile = path.join(outDir, 'variables', 'Variable_Character.risuvar');
    expect(existsSync(variableFile)).toBe(true);
    expect(readFileSync(variableFile, 'utf-8')).toContain('hp=100');
    expect(readFileSync(variableFile, 'utf-8')).toContain('mp=30');
  });

  it('extracts the real playground charx sample to canonical artifacts only', () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..', '..');
    const sample = path.join(
      workspaceRoot,
      'playground',
      '260406-test',
      'charx',
      'Chikan Train-latest.charx',
    );
    const outDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-'));
    tempDirs.push(outDir);

    const result = spawnSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'extract', sample, '--out', outDir],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);

    // charx.json should NOT exist in canonical mode
    expect(existsSync(path.join(outDir, 'charx.json'))).toBe(false);

    // Character fields
    expect(existsSync(path.join(outDir, '.risuchar'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'description.risutext'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'first_mes.risutext'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'system_prompt.risutext'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'replace_global_note.risutext'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'creator_notes.risutext'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'additional_text.risutext'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'alternate_greetings', '_order.json'))).toBe(true);

    // Legacy character output should not be emitted by canonical extract.
    expect(existsSync(path.join(outDir, 'character', 'metadata.json'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'description.txt'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'first_mes.txt'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'system_prompt.txt'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'post_history_instructions.txt'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'post_history_instructions.risutext'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'creator_notes.txt'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'additional_text.txt'))).toBe(false);
    expect(existsSync(path.join(outDir, 'character', 'alternate_greetings.json'))).toBe(false);

    // .risutoggle should NOT exist for charx (module/preset only)
    expect(existsSync(path.join(outDir, 'character', 'module.risutoggle'))).toBe(false);

    // Canonical lorebooks
    expect(existsSync(path.join(outDir, 'lorebooks', '_order.json'))).toBe(true);
    // manifest.json is no longer emitted in canonical mode
    expect(existsSync(path.join(outDir, 'lorebooks', 'manifest.json'))).toBe(false);

    // Canonical regex
    expect(existsSync(path.join(outDir, 'regex', '_order.json'))).toBe(true);

    // Assets
    expect(existsSync(path.join(outDir, 'assets', 'manifest.json'))).toBe(true);

    // Canonical HTML
    expect(existsSync(path.join(outDir, 'html', 'background.risuhtml'))).toBe(true);
    // Old .html extension should not exist
    expect(existsSync(path.join(outDir, 'html', 'background.html'))).toBe(false);

    // Canonical variables (if present in source)
    // Note: The test sample may or may not have variables
    // Old .txt extension should not exist
    expect(existsSync(path.join(outDir, 'variables', 'default.txt'))).toBe(false);

    // Analysis outputs are NOT created in canonical mode
    // The analysis workflow requires charx.json which is intentionally excluded
    // This is a known limitation of T12 canonical cutover
    expect(existsSync(path.join(outDir, 'analysis', 'charx-analysis.md'))).toBe(false);
    expect(existsSync(path.join(outDir, 'analysis', 'charx-analysis.html'))).toBe(false);
    expect(existsSync(path.join(outDir, 'analysis', 'charx-analysis.data.js'))).toBe(false);

    // Verify canonical lorebook files exist (at least one .risulorebook)
    // Path-based contract: _order.json contains folder paths + file paths
    const lorebooksDir = path.join(outDir, 'lorebooks');
    const lorebookFiles = existsSync(lorebooksDir)
      ? readFileSync(path.join(lorebooksDir, '_order.json'), 'utf-8')
      : '[]';
    const lorebookOrder = JSON.parse(lorebookFiles) as string[];
    expect(lorebookOrder.length).toBeGreaterThan(0);
    let lorebookFileCount = 0;
    for (const lorebookEntry of lorebookOrder) {
      // Entry can be a folder path (no extension) or a file path (.risulorebook)
      const isFolder = !lorebookEntry.includes('.') || lorebookEntry.endsWith('/');
      const isFile = lorebookEntry.endsWith('.risulorebook');
      expect(isFolder || isFile).toBe(true);
      expect(existsSync(path.join(lorebooksDir, lorebookEntry))).toBe(true);
      if (isFile) {
        lorebookFileCount += 1;
      }
    }
    expect(lorebookFileCount).toBeGreaterThan(0);

    // Verify canonical regex files exist
    const regexDir = path.join(outDir, 'regex');
    const regexOrder = existsSync(regexDir)
      ? JSON.parse(readFileSync(path.join(regexDir, '_order.json'), 'utf-8')) as string[]
      : [];
    expect(regexOrder.length).toBeGreaterThan(0);
    for (const regexFile of regexOrder) {
      expect(existsSync(path.join(regexDir, regexFile))).toBe(true);
      expect(regexFile.endsWith('.risuregex')).toBe(true);
    }

    // Verify canonical lua file exists if triggerscript is present in source
    // This tests the fix for triggerscript array extraction (T12 final QA)
    // Note: Uses target-name-based naming (e.g., lua/<charxName>.risulua)
    const luaDir = path.join(outDir, 'lua');
    if (existsSync(luaDir)) {
      const luaFiles = readdirSync(luaDir).filter(f => f.endsWith('.risulua'));
      expect(luaFiles.length).toBeGreaterThan(0);
      for (const luaFile of luaFiles) {
        const luaContent = readFileSync(path.join(luaDir, luaFile), 'utf-8');
        // Should contain actual Lua code, not be empty
        expect(luaContent.length).toBeGreaterThan(0);
      }
    }

  });
});
