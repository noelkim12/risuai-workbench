import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractLorebookNameCandidates,
  extractNameFromLorebookText,
} from '../src/domain/analyze/lorebook-names';
import { extractLorebookNameCandidates as extractLorebookNameCandidatesFromFs } from '../src/node/lorebook-names';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const LOREBOOK = (name: string) =>
  `---\nname: ${name}\ncomment: ${name}\nmode: normal\n---\n@@@ KEYS\nkey\n@@@ CONTENT\nbody\n`;

describe('extractNameFromLorebookText', () => {
  it('reads name from the first frontmatter block', () => {
    expect(extractNameFromLorebookText(LOREBOOK('아데스·룬·드로크'))).toBe('아데스·룬·드로크');
  });

  it('returns null without frontmatter or name', () => {
    expect(extractNameFromLorebookText('@@@ CONTENT\nbody')).toBeNull();
    expect(extractNameFromLorebookText('---\ncomment: x\n---\nbody')).toBeNull();
  });

  it('ignores name-like lines outside the frontmatter block', () => {
    expect(extractNameFromLorebookText('---\ncomment: x\n---\nname: not-me')).toBeNull();
  });
});

describe('extractLorebookNameCandidates', () => {
  it('dedupes names and sorts by file path from provided sources', () => {
    expect(
      extractLorebookNameCandidates([
        { filePath: 'lorebooks/z.risulorebook', folderPath: 'lorebooks', text: LOREBOOK('Zed') },
        { filePath: 'lorebooks/a.risulorebook', folderPath: 'lorebooks', text: LOREBOOK('Ades') },
        { filePath: 'lorebooks/dup.risulorebook', folderPath: 'lorebooks', text: LOREBOOK('Ades') },
      ]),
    ).toEqual([
      { name: 'Ades', filePath: 'lorebooks/a.risulorebook', folderPath: 'lorebooks' },
      { name: 'Zed', filePath: 'lorebooks/z.risulorebook', folderPath: 'lorebooks' },
    ]);
  });

  it('walks lorebooks/ recursively, dedupes names, keeps folder grouping info', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-lorebook-names-'));
    tempDirs.push(workDir);
    fs.mkdirSync(path.join(workDir, 'lorebooks', '신격'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'lorebooks', '지역'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'lorebooks', '신격', 'a.risulorebook'), LOREBOOK('Ades'));
    fs.writeFileSync(path.join(workDir, 'lorebooks', '신격', 'dup.risulorebook'), LOREBOOK('Ades'));
    fs.writeFileSync(
      path.join(workDir, 'lorebooks', '지역', 'town.risulorebook'),
      LOREBOOK('Town Square'),
    );
    fs.writeFileSync(path.join(workDir, 'lorebooks', 'not-a-lorebook.txt'), 'name: skipme');

    const candidates = extractLorebookNameCandidatesFromFs(workDir);

    expect(candidates).toEqual([
      { name: 'Ades', filePath: 'lorebooks/신격/a.risulorebook', folderPath: 'lorebooks/신격' },
      {
        name: 'Town Square',
        filePath: 'lorebooks/지역/town.risulorebook',
        folderPath: 'lorebooks/지역',
      },
    ]);
  });

  it('walks lorebook/ recursively too', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-lorebook-names-'));
    tempDirs.push(workDir);
    fs.mkdirSync(path.join(workDir, 'lorebook', 'npc'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'lorebook', 'npc', 'villager.risulorebook'), LOREBOOK('Villager'));

    expect(extractLorebookNameCandidatesFromFs(workDir)).toEqual([
      { name: 'Villager', filePath: 'lorebook/npc/villager.risulorebook', folderPath: 'lorebook/npc' },
    ]);
  });

  it('returns empty list when no lorebook directory exists', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-lorebook-names-'));
    tempDirs.push(workDir);
    expect(extractLorebookNameCandidatesFromFs(workDir)).toEqual([]);
  });
});
