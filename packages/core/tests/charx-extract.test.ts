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

describe('charx extract integration (canonical mode)', () => {
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
    expect(existsSync(path.join(outDir, 'character', 'metadata.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'description.txt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'first_mes.txt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'system_prompt.txt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'post_history_instructions.txt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'creator_notes.txt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'additional_text.txt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'alternate_greetings.json'))).toBe(true);

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
