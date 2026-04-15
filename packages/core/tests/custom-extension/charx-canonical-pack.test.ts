import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { parseModuleRisum } from '../../src/cli/extract/parsers';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('charx canonical pack', () => {
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
