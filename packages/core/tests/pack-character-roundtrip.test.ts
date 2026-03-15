import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('pack.js character round-trip', () => {
  it('merges extracted character fields back into card.json before packing', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-pack-character-'));
    tempDirs.push(workDir);

    const characterDir = path.join(workDir, 'character');
    mkdirSync(characterDir, { recursive: true });

    const sourceCard = {
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
          },
        },
      },
    };

    writeFileSync(path.join(workDir, 'card.json'), `${JSON.stringify(sourceCard, null, 2)}\n`, 'utf-8');
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
    const packedCard = JSON.parse(strFromU8(archive['card.json']));

    expect(packedCard.data.description).toBe('updated description');
    expect(packedCard.data.first_mes).toBe('updated first message');
    expect(packedCard.data.system_prompt).toBe('updated system prompt');
    expect(packedCard.data.post_history_instructions).toBe('updated post history');
    expect(packedCard.data.creator_notes).toBe('updated creator notes');
    expect(packedCard.data.extensions.risuai.additionalText).toBe('updated additional text');
    expect(packedCard.data.alternate_greetings).toEqual(['hello there', 'general kenobi']);
    expect(packedCard.data.name).toBe('Updated Name');
    expect(packedCard.data.creator).toBe('Updated Creator');
    expect(packedCard.data.character_version).toBe('2.0.0');
    expect(packedCard.data.creation_date).toBe('2025-05-01');
    expect(packedCard.data.modification_date).toBe('2025-05-02');
    expect(packedCard.data.extensions.risuai.utilityBot).toBe(true);
    expect(packedCard.data.extensions.risuai.lowLevelAccess).toBe(true);
  });
});
