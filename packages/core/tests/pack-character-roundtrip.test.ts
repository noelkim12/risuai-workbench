import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { parseModuleRisum } from '@/cli/extract/parsers';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('pack.js character round-trip', () => {
  it('merges extracted character fields back into charx.json before packing', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-pack-character-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    mkdirSync(characterDir, { recursive: true });

    const sourceCharx = {
      spec: 'chara_card_v3',
      data: {
        name: 'Original Name',
        creator: 'Original Creator',
        character_version: '1.0.0',
        creation_date: '2024-01-01',
        modification_date: '2024-01-02',
        description: 'original description',
        first_mes: 'original first',
        system_prompt: 'original system',
        post_history_instructions: 'original post history',
        creator_notes: 'original notes',
        alternate_greetings: ['original greeting'],
        extensions: {
          risuai: {
            additionalText: 'original additional',
            utilityBot: false,
            lowLevelAccess: false,
            customScripts: [],
            triggerscript: [],
            customModuleToggle: '<module-toggle><![CDATA[enabled]]></module-toggle>',
          },
        },
      },
    };

    writeFileSync(path.join(workDir, 'charx.json'), `${JSON.stringify(sourceCharx, null, 2)}\n`, 'utf-8');
    writeFileSync(path.join(characterDir, 'description.txt'), 'updated description', 'utf-8');
    writeFileSync(path.join(characterDir, 'first_mes.txt'), 'updated first message', 'utf-8');
    writeFileSync(path.join(characterDir, 'system_prompt.txt'), 'updated system prompt', 'utf-8');
    writeFileSync(path.join(characterDir, 'post_history_instructions.txt'), 'updated post history', 'utf-8');
    writeFileSync(path.join(characterDir, 'creator_notes.txt'), 'updated creator notes', 'utf-8');
    writeFileSync(path.join(characterDir, 'additional_text.txt'), 'updated additional text', 'utf-8');
    writeFileSync(
      path.join(characterDir, 'alternate_greetings.json'),
      `${JSON.stringify(['hello there', 'general kenobi'], null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(
      path.join(characterDir, 'metadata.json'),
      `${JSON.stringify(
        {
          name: 'Updated Name',
          creator: 'Updated Creator',
          character_version: '2.0.0',
          creation_date: '2025-05-01',
          modification_date: '2025-05-02',
          utilityBot: true,
          lowLevelAccess: true,
        },
        null,
        2
      )}\n`,
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

    expect(packedCharx.data.description).toBe('updated description');
    expect(packedCharx.data.first_mes).toBe('updated first message');
    expect(packedCharx.data.system_prompt).toBe('updated system prompt');
    expect(packedCharx.data.post_history_instructions).toBe('updated post history');
    expect(packedCharx.data.creator_notes).toBe('updated creator notes');
    expect(packedCharx.data.extensions.risuai.additionalText).toBe('updated additional text');
    expect(packedCharx.data.alternate_greetings).toEqual(['hello there', 'general kenobi']);
    expect(packedCharx.data.name).toBe('Updated Name');
    expect(packedCharx.data.creator).toBe('Updated Creator');
    expect(packedCharx.data.character_version).toBe('2.0.0');
    expect(packedCharx.data.creation_date).toBe('2025-05-01');
    expect(packedCharx.data.modification_date).toBe('2025-05-02');
    expect(packedCharx.data.extensions.risuai.utilityBot).toBe(true);
    expect(packedCharx.data.extensions.risuai.lowLevelAccess).toBe(true);

    const module = parseModuleRisum(Buffer.from(archive['module.risum']));
    expect(module.customModuleToggle).toBe('<module-toggle><![CDATA[enabled]]></module-toggle>');
  });
  it('merges module.risutoggle file into customModuleToggle during packing', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-pack-character-toggle-file-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    mkdirSync(characterDir, { recursive: true });

    const sourceCharx = {
      spec: 'chara_card_v3',
      data: {
        name: 'Pack Toggle Source',
        creator: 'Source Creator',
        character_version: '1.0.0',
        creation_date: '2024-01-01',
        modification_date: '2024-01-02',
        description: 'description',
        first_mes: 'first',
        system_prompt: 'system',
        post_history_instructions: 'post',
        creator_notes: 'notes',
        extensions: {
          risuai: {
            additionalText: 'original additional',
            utilityBot: false,
            lowLevelAccess: false,
            customScripts: [],
            triggerscript: [],
          },
        },
      },
    };

    writeFileSync(path.join(workDir, 'charx.json'), `${JSON.stringify(sourceCharx, null, 2)}
`, 'utf-8');
    writeFileSync(
      path.join(characterDir, 'metadata.json'),
      `${JSON.stringify(
        {
          name: 'Updated Name',
          creator: 'Updated Creator',
          character_version: '2.0.0',
          creation_date: '2025-05-01',
          modification_date: '2025-05-02',
          utilityBot: true,
          lowLevelAccess: true,
        },
        null,
        2,
      )}
`,
      'utf-8'
    );
    writeFileSync(path.join(characterDir, 'module.risutoggle'), '<module-toggle>updated</module-toggle>', 'utf-8');

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

    expect(module.customModuleToggle).toBe('<module-toggle>updated</module-toggle>');
  });
});
