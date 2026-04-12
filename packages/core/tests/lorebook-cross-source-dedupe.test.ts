import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { phase2_extractLorebooks } from '@/cli/extract/character/phases';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('lorebook cross-source dedupe', () => {
  it('does not emit duplicated lorebook files when character and module lorebooks are semantically identical', () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'risu-core-lorebook-dedupe-'));
    tempDirs.push(outputDir);

    const charx = {
      data: {
        character_book: {
          entries: [
            {
              keys: ['folder-key'],
              content: '',
              extensions: {},
              enabled: true,
              insertion_order: 100,
              constant: false,
              selective: false,
              name: '🏙️길드/세력',
              comment: '🏙️길드/세력',
              case_sensitive: false,
              use_regex: false,
              mode: 'folder',
            },
            {
              keys: ['Baek ryeon', '백련', 'White Lotus'],
              content: 'Baekryeon guild content',
              extensions: { risu_case_sensitive: false, risu_loreCache: null },
              enabled: true,
              insertion_order: 680,
              constant: false,
              selective: false,
              name: '백련 길드',
              comment: '백련 길드',
              case_sensitive: false,
              use_regex: false,
              mode: 'normal',
              folder: 'folder-key',
            },
          ],
        },
        extensions: {
          risuai: {
            _moduleLorebook: [
              {
                key: 'folder-key',
                comment: '🏙️길드/세력',
                content: '',
                mode: 'folder',
                insertorder: 100,
                alwaysActive: false,
                secondkey: '',
                selective: false,
                bookVersion: 2,
              },
              {
                key: 'Baek ryeon,백련,White Lotus',
                secondkey: '',
                insertorder: 680,
                comment: '백련 길드',
                content: 'Baekryeon guild content',
                mode: 'normal',
                alwaysActive: false,
                selective: false,
                extentions: { risu_case_sensitive: false, risu_loreCache: null },
                loreCache: null,
                useRegex: false,
                bookVersion: 2,
                folder: 'folder-key',
              },
            ],
          },
        },
      },
    };

    const count = phase2_extractLorebooks(charx, outputDir);
    const lorebooksDir = path.join(outputDir, 'lorebooks');
    const manifest = JSON.parse(readFileSync(path.join(lorebooksDir, 'manifest.json'), 'utf-8'));
    const order = JSON.parse(readFileSync(path.join(lorebooksDir, '_order.json'), 'utf-8'));

    expect(count).toBe(2);
    expect(existsSync(path.join(lorebooksDir, '🏙️길드_세력', '백련_길드.json'))).toBe(true);
    expect(existsSync(path.join(lorebooksDir, '🏙️길드_세력', '백련_길드_1.json'))).toBe(false);
    expect(readdirSync(path.join(lorebooksDir, '🏙️길드_세력'))).toEqual(['백련_길드.json']);
    expect(manifest.entries).toEqual([
      {
        type: 'folder',
        source: 'character',
        dir: '🏙️길드_세력',
        data: expect.objectContaining({ mode: 'folder', name: '🏙️길드/세력' }),
      },
      {
        type: 'entry',
        source: 'character',
        path: '🏙️길드_세력/백련_길드.json',
      },
    ]);
    expect(order).toEqual(['🏙️길드_세력/백련_길드.json']);
  });
});
