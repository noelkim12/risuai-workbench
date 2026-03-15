import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { collectLorebookCBS } = require('../dist/cli/analyze-card/collectors.js');

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('analyze-card lorebook manifest support', () => {
  it('uses manifest source metadata when reading extracted lorebooks from disk', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-lorebook-cbs-'));
    tempDirs.push(workDir);

    const lorebooksDir = path.join(workDir, 'lorebooks');
    const folderDir = path.join(lorebooksDir, 'Module_Folder');
    mkdirSync(folderDir, { recursive: true });

    writeFileSync(
      path.join(folderDir, 'Entry.json'),
      `${JSON.stringify({
        name: 'Entry',
        comment: 'Entry',
        content: '{{getvar::foo}} {{setvar::bar}}',
        mode: 'normal',
        folder: 'module-folder-key',
      }, null, 2)}\n`,
      'utf-8'
    );

    writeFileSync(
      path.join(lorebooksDir, 'manifest.json'),
      `${JSON.stringify({
        version: 1,
        entries: [
          {
            type: 'folder',
            source: 'module',
            dir: 'Module_Folder',
            data: {
              keys: ['module-folder-key'],
              name: 'Module Folder',
              comment: 'Module Folder',
              content: '',
              mode: 'folder',
            },
          },
          {
            type: 'entry',
            source: 'module',
            path: 'Module_Folder/Entry.json',
          },
        ],
      }, null, 2)}\n`,
      'utf-8'
    );

    const cbs = collectLorebookCBS({ data: {} }, workDir);
    expect(cbs).toHaveLength(1);
    expect(cbs[0].elementName).toBe('[module]/Module_Folder/Entry');
  });
});
