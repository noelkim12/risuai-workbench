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
  it('extracts real lorebook directories, records folder metadata in manifest, and repacks correctly', () => {
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
    const manifestPath = path.join(lorebooksDir, 'manifest.json');
    const orderPath = path.join(lorebooksDir, '_order.json');
    const folderDir = path.join(lorebooksDir, 'Lorebook_Folder_Example1');
    const folderEntryPath = path.join(folderDir, 'Lorebook_Example1.json');

    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(folderDir)).toBe(true);
    expect(existsSync(folderEntryPath)).toBe(true);

    const lorebookFiles = readdirSync(lorebooksDir);
    expect(lorebookFiles.some((name) => name.startsWith('_folder_'))).toBe(false);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.entries).toEqual([
      {
        type: 'folder',
        source: 'character',
        dir: 'Lorebook_Folder_Example1',
        data: expect.objectContaining({ mode: 'folder', name: 'Lorebook Folder Example1' }),
      },
      {
        type: 'entry',
        source: 'character',
        path: 'Lorebook_Folder_Example1/Lorebook_Example1.json',
      },
      {
        type: 'entry',
        source: 'character',
        path: 'Lorebook_Example2_With_Active_Key.json',
      },
      {
        type: 'entry',
        source: 'character',
        path: 'Lorebook_Example2_Always_Active.json',
      },
    ]);

    const order = JSON.parse(readFileSync(orderPath, 'utf-8'));
    expect(order).toEqual([
      'Lorebook_Folder_Example1/Lorebook_Example1.json',
      'Lorebook_Example2_With_Active_Key.json',
      'Lorebook_Example2_Always_Active.json',
    ]);

    runCoreCommand('build', ['--in', extractDir, '--out', extractDir]);
    const lorebookExport = JSON.parse(readFileSync(path.join(extractDir, 'lorebook_export.json'), 'utf-8'));
    expect(lorebookExport.data[0]).toEqual(expect.objectContaining({ mode: 'folder', comment: 'Lorebook Folder Example1' }));

    const packedPath = path.join(workDir, 'roundtrip.charx');
    runCoreCommand('pack', ['--in', extractDir, '--format', 'charx', '--out', packedPath]);

    const packedArchive = unzipSync(readFileSync(packedPath));
    const packedCard = JSON.parse(strFromU8(packedArchive['charx.json']));
    expect(packedCard.data.character_book.entries[0]).toEqual(expect.objectContaining({ mode: 'folder', name: 'Lorebook Folder Example1' }));
    expect(packedCard.data.character_book.entries[1]).toEqual(expect.objectContaining({ folder: 'folder-key-1', name: 'Lorebook Example1' }));
  });
});
