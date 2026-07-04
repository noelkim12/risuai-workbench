import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAnalyzeWorkflow } from '../src/cli/analyze/workflow';

const tempDirs: string[] = [];

const LOREBOOK = (name: string) =>
  `---\nname: ${name}\ncomment: ${name}\nmode: normal\n---\n@@@ KEYS\nkey\n@@@ CONTENT\nbody\n`;

function makeWorkspace(): string {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-lorebook-names-'));
  tempDirs.push(workDir);
  fs.mkdirSync(path.join(workDir, 'lorebooks', 'characters'), { recursive: true });
  fs.mkdirSync(path.join(workDir, 'lorebooks', 'places'), { recursive: true });
  fs.writeFileSync(path.join(workDir, 'lorebooks', 'characters', 'ades.risulorebook'), LOREBOOK('Ades'));
  fs.writeFileSync(path.join(workDir, 'lorebooks', 'characters', 'dup.risulorebook'), LOREBOOK('Ades'));
  fs.writeFileSync(path.join(workDir, 'lorebooks', 'places', 'town.risulorebook'), LOREBOOK('Town'));
  return workDir;
}

describe('analyze --type lorebook-names', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('prints lorebook name candidates grouped by folder', () => {
    const workDir = makeWorkspace();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = runAnalyzeWorkflow(['--type', 'lorebook-names', workDir]);

    expect(code).toBe(0);
    const output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('lorebooks/characters');
    expect(output).toContain('Ades');
    expect(output).toContain('lorebooks/characters/ades.risulorebook');
    expect(output).toContain('lorebooks/places');
    expect(output).toContain('Town');
    expect(output).not.toContain('dup.risulorebook');
  });

  it('prints lorebook name candidates as json', () => {
    const workDir = makeWorkspace();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = runAnalyzeWorkflow(['--type', 'lorebook-names', workDir, '--json']);

    expect(code).toBe(0);
    expect(JSON.parse(log.mock.calls[0]?.[0] ?? '{}')).toEqual({
      candidates: [
        {
          name: 'Ades',
          filePath: 'lorebooks/characters/ades.risulorebook',
          folderPath: 'lorebooks/characters',
        },
        { name: 'Town', filePath: 'lorebooks/places/town.risulorebook', folderPath: 'lorebooks/places' },
      ],
    });
  });

  it('returns exit code 1 when target directory is missing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const missingDir = path.join(os.tmpdir(), 'risu-core-missing-lorebook-names-dir');

    const code = runAnalyzeWorkflow(['--type', 'lorebook-names', missingDir]);

    expect(code).toBe(1);
    expect(error.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Target directory not found');
  });
});
