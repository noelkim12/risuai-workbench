import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runCoreCommand(commandName: string, args: string[], cwd = process.cwd()) {
  execFileSync('node', [path.join(cwd, 'dist', 'cli', 'main.js'), commandName, ...args], {
    cwd,
    stdio: 'pipe',
  });
}

describe('lorebook folder layout', () => {
  it('extracts real lorebook directories with path-based _order.json and repacks correctly', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-lorebook-layout-'));
    tempDirs.push(workDir);

    const inputCardPath = path.join(workDir, 'input.json');
    const extractDir = path.join(workDir, 'extracted');
    mkdirSync(extractDir, { recursive: true });

    const card = {
      spec: 'chara_card_v3',
      data: {
        name: 'Lorebook Layout Test',
        assets: [],
        extensions: {
          risuai: {},
        },
        character_book: {
          entries: [
            {
              keys: ['folder-key-1'],
              content: '',
              extensions: {},
              enabled: true,
              insertion_order: 100,
              constant: false,
              selective: false,
              name: 'Lorebook Folder Example1',
              comment: 'Lorebook Folder Example1',
              case_sensitive: false,
              use_regex: false,
              mode: 'folder',
            },
            {
              keys: [''],
              content: 'Lorebook Example1',
              extensions: {},
              enabled: true,
              insertion_order: 100,
              constant: false,
              selective: false,
              name: 'Lorebook Example1',
              comment: 'Lorebook Example1',
              case_sensitive: false,
              use_regex: false,
              mode: 'normal',
              folder: 'folder-key-1',
            },
            {
              keys: ['activekey1', 'activekey2'],
              content: 'Lorebook Example2',
              extensions: {},
              enabled: true,
              insertion_order: 100,
              constant: false,
              selective: false,
              name: 'Lorebook Example2 With Active Key',
              comment: 'Lorebook Example2 With Active Key',
              case_sensitive: false,
              use_regex: false,
              mode: 'normal',
            },
            {
              keys: [''],
              content: 'Lorebook Example2 Always Active',
              extensions: {},
              enabled: true,
              insertion_order: 100,
              constant: true,
              selective: false,
              name: 'Lorebook Example2 Always Active',
              comment: 'Lorebook Example2 Always Active',
              case_sensitive: false,
              use_regex: false,
              mode: 'normal',
            },
          ],
        },
      },
    };

    writeFileSync(inputCardPath, `${JSON.stringify(card, null, 2)}\n`, 'utf-8');

    runCoreCommand('extract', [inputCardPath, '--out', extractDir]);

    const lorebooksDir = path.join(extractDir, 'lorebooks');
    const orderPath = path.join(lorebooksDir, '_order.json');
    const foldersPath = path.join(lorebooksDir, '_folders.json');

    // Path-based contract: _order.json exists, _folders.json does NOT exist
    expect(existsSync(orderPath)).toBe(true);
    expect(existsSync(foldersPath)).toBe(false);

    // Verify .risulorebook files exist in real directory structure
    expect(existsSync(path.join(lorebooksDir, 'Lorebook_Folder_Example1', 'Lorebook_Example1.risulorebook'))).toBe(true);
    expect(existsSync(path.join(lorebooksDir, 'Lorebook_Example2_With_Active_Key.risulorebook'))).toBe(true);
    expect(existsSync(path.join(lorebooksDir, 'Lorebook_Example2_Always_Active.risulorebook'))).toBe(true);

    // Verify _order.json contains folder paths and file paths
    const order = JSON.parse(readFileSync(orderPath, 'utf-8'));
    expect(order).toEqual([
      'Lorebook_Folder_Example1',
      'Lorebook_Folder_Example1/Lorebook_Example1.risulorebook',
      'Lorebook_Example2_With_Active_Key.risulorebook',
      'Lorebook_Example2_Always_Active.risulorebook',
    ]);

    // Verify the .risulorebook file contains the entry (folder reference is path-based now)
    const lorebookContent = readFileSync(path.join(lorebooksDir, 'Lorebook_Folder_Example1', 'Lorebook_Example1.risulorebook'), 'utf-8');
    expect(lorebookContent).toContain('name: Lorebook Example1');

    // Pack and verify round-trip - folder keys are regenerated at pack time
    const packedPath = path.join(workDir, 'roundtrip.charx');
    runCoreCommand('pack', ['--in', extractDir, '--format', 'charx', '--out', packedPath]);

    const packedArchive = unzipSync(readFileSync(packedPath));
    const packedCard = JSON.parse(strFromU8(packedArchive['charx.json']));

    // Verify folder entry exists with correct name (path-based: name comes from directory)
    expect(packedCard.data.character_book.entries[0]).toEqual(
      expect.objectContaining({ mode: 'folder', name: 'Lorebook_Folder_Example1' })
    );

    // Verify lorebook entry exists with correct name
    expect(packedCard.data.character_book.entries[1]).toEqual(
      expect.objectContaining({ name: 'Lorebook Example1' })
    );

    // Verify folder key is regenerated (not the original 'folder-key-1')
    expect(typeof packedCard.data.character_book.entries[1].folder).toBe('string');
    expect(packedCard.data.character_book.entries[1].folder.length).toBeGreaterThan(0);
  });
});
