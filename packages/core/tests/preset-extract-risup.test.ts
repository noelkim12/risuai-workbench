import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('preset extract binary risup integration', () => {
  it('extracts real .risup samples from test_cases/preset', () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..', '..');
    const samples = [
      path.join(workspaceRoot, 'test_cases', 'preset', 'New Preset_preset.risup'),
      path.join(workspaceRoot, 'test_cases', 'preset', '😈소악마 프롬프트 v14-6 [Gem3.1]_preset.risup'),
    ];

    for (const sample of samples) {
      const outDir = mkdtempSync(path.join(tmpdir(), 'risu-core-preset-'));
      tempDirs.push(outDir);

      const result = spawnSync(
        'node',
        [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'extract', sample, '--out', outDir],
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
        },
      );

      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(existsSync(path.join(outDir, 'preset.json'))).toBe(true);
      expect(existsSync(path.join(outDir, 'metadata.json'))).toBe(true);

      const metadata = JSON.parse(readFileSync(path.join(outDir, 'metadata.json'), 'utf-8'));
      expect(typeof metadata.name).toBe('string');
      expect(metadata.name.length).toBeGreaterThan(0);
      expect(['risuai', 'nai', 'sillytavern', 'unknown']).toContain(metadata.preset_type);
    }
  });
});
