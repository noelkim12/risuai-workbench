import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { parseModuleRisum } from '../src/cli/extract/parsers';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('pack.js character round-trip (canonical mode)', () => {
  it('packs from canonical artifacts without charx.json', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-pack-canonical-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    mkdirSync(characterDir, { recursive: true });

    // Write canonical character artifacts (no charx.json needed)
    writeFileSync(path.join(characterDir, 'description.txt'), 'canonical description', 'utf-8');
    writeFileSync(path.join(characterDir, 'first_mes.txt'), 'canonical first message', 'utf-8');
    writeFileSync(path.join(characterDir, 'system_prompt.txt'), 'canonical system prompt', 'utf-8');
    writeFileSync(path.join(characterDir, 'post_history_instructions.txt'), 'canonical post history', 'utf-8');
    writeFileSync(path.join(characterDir, 'creator_notes.txt'), 'canonical creator notes', 'utf-8');
    writeFileSync(path.join(characterDir, 'additional_text.txt'), 'canonical additional text', 'utf-8');
    writeFileSync(
      path.join(characterDir, 'alternate_greetings.json'),
      `${JSON.stringify(['greeting one', 'greeting two'], null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(
      path.join(characterDir, 'metadata.json'),
      `${JSON.stringify(
        {
          name: 'Canonical Character',
          creator: 'Canonical Creator',
          character_version: '1.0.0',
          creation_date: '2025-01-01',
          modification_date: '2025-01-02',
          utilityBot: false,
          lowLevelAccess: true,
        },
        null,
        2
      )}\n`,
      'utf-8'
    );

    // Note: module.risutoggle is NOT written for charx (module/preset only per spec)

    // Write canonical lua file using target-name-based naming (sanitized)
    const luaDir = path.join(workDir, 'lua');
    mkdirSync(luaDir, { recursive: true });
    writeFileSync(
      path.join(luaDir, 'Canonical_Character.risulua'),
      '-- Test Lua\nfunction test() end\n',
      'utf-8'
    );

    // Write canonical variables file using target-name-based naming (sanitized)
    const variablesDir = path.join(workDir, 'variables');
    mkdirSync(variablesDir, { recursive: true });
    writeFileSync(
      path.join(variablesDir, 'Canonical_Character.risuvar'),
      'testVar=value\n',
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

    // Verify character fields from canonical artifacts
    expect(packedCharx.spec).toBe('chara_card_v3');
    expect(packedCharx.data.description).toBe('canonical description');
    expect(packedCharx.data.first_mes).toBe('canonical first message');
    expect(packedCharx.data.system_prompt).toBe('canonical system prompt');
    expect(packedCharx.data.post_history_instructions).toBe('canonical post history');
    expect(packedCharx.data.creator_notes).toBe('canonical creator notes');
    expect(packedCharx.data.extensions.risuai.additionalText).toBe('canonical additional text');
    expect(packedCharx.data.alternate_greetings).toEqual(['greeting one', 'greeting two']);
    expect(packedCharx.data.name).toBe('Canonical Character');
    expect(packedCharx.data.creator).toBe('Canonical Creator');
    expect(packedCharx.data.character_version).toBe('1.0.0');
    expect(packedCharx.data.creation_date).toBe('2025-01-01');
    expect(packedCharx.data.modification_date).toBe('2025-01-02');
    expect(packedCharx.data.extensions.risuai.utilityBot).toBe(false);
    expect(packedCharx.data.extensions.risuai.lowLevelAccess).toBe(true);

    // Verify module.risum exists but customModuleToggle is NOT present for charx
    const module = parseModuleRisum(Buffer.from(archive['module.risum']));
    expect(module.name).toBe('Canonical Character Module');
    expect(module.customModuleToggle).toBeUndefined();
  });

  it('ignores module.risutoggle for charx (module/preset only)', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-pack-charx-no-toggle-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    mkdirSync(characterDir, { recursive: true });

    // Write canonical character artifacts
    writeFileSync(path.join(characterDir, 'description.txt'), 'test description', 'utf-8');
    writeFileSync(path.join(characterDir, 'metadata.json'), `${JSON.stringify({ name: 'Test Char' })}\n`, 'utf-8');

    // Write module.risutoggle (should be ignored for charx per spec)
    writeFileSync(path.join(characterDir, 'module.risutoggle'), '<module-toggle>should-be-ignored</module-toggle>', 'utf-8');

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
    const module = parseModuleRisum(Buffer.from(archive['module.risum']));

    // customModuleToggle should NOT be present for charx
    expect(module.customModuleToggle).toBeUndefined();
  });
});
