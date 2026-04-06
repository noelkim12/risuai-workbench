import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('charx extract integration', () => {
  it('extracts the real playground charx sample that uses the upstream import path', () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..', '..');
    const sample = path.join(
      workspaceRoot,
      'playground',
      '260406-test',
      'charx',
      'Chikan Train-latest.charx',
    );
    const outDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-'));
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
    expect(existsSync(path.join(outDir, 'charx.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'metadata.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'lorebooks', 'manifest.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'regex', '_order.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'assets', 'manifest.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'html', 'background.html'))).toBe(true);
    expect(existsSync(path.join(outDir, 'analysis', 'charx-analysis.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'analysis', 'charx-analysis.html'))).toBe(true);

    const analysisHtml = readFileSync(path.join(outDir, 'analysis', 'charx-analysis.html'), 'utf-8');
    expect(analysisHtml).toContain('data-panel-id="charx-lorebook-graph"');
    expect(analysisHtml).toContain('data-library="force-graph"');

    const charx = JSON.parse(readFileSync(path.join(outDir, 'charx.json'), 'utf-8')) as {
      spec?: string;
      data?: { name?: string; extensions?: { risuai?: { customScripts?: unknown[]; triggerscript?: unknown[] } } };
    };
    expect(charx.spec).toBe('chara_card_v3');
    expect(charx.data?.name).toBeTruthy();
    expect(Array.isArray(charx.data?.extensions?.risuai?.customScripts)).toBe(true);
    expect(Array.isArray(charx.data?.extensions?.risuai?.triggerscript)).toBe(true);
  });
});
