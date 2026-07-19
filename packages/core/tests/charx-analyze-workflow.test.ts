import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runAnalyzeCharxWorkflow } from '@/cli/analyze/charx/workflow';
import { parseAnalysisShowcase } from '@/domain';

const tempDirs: string[] = [];

function createCanonicalCharacterWorkspace(prefix: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(tempDir);

  fs.mkdirSync(path.join(tempDir, 'character'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'lorebooks'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, '.risuchar'), JSON.stringify({ name: 'Showcase Hero' }, null, 2), 'utf8');
  fs.writeFileSync(path.join(tempDir, 'character', 'metadata.json'), JSON.stringify({ name: 'Showcase Hero' }, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(tempDir, 'lorebooks', 'Entry.risulorebook'),
    `---
name: Entry
comment: Entry
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
entry
@@@ CONTENT
{{setvar::mood::bright}}
`,
    'utf8',
  );

  return tempDir;
}

function readValidSidecar(rootDir: string) {
  const raw = JSON.parse(fs.readFileSync(path.join(rootDir, 'analysis', 'risu-analysis.showcase.json'), 'utf8')) as unknown;
  const parsed = parseAnalysisShowcase(raw);
  expect(parsed.kind).toBe('valid');
  if (parsed.kind !== 'valid') throw new Error('expected valid analysis showcase sidecar');
  return parsed.value;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('runAnalyzeCharxWorkflow', () => {
  it('emits a schema-valid showcase sidecar for default character analysis', () => {
    const tempDir = createCanonicalCharacterWorkspace('risu-charx-showcase-default-');

    const exitCode = runAnalyzeCharxWorkflow([tempDir, '--locale', 'en']);

    expect(exitCode).toBe(0);
    const sidecar = readValidSidecar(tempDir);
    expect(sidecar.artifact).toEqual({ stableId: `character:${path.basename(tempDir)}`, name: 'Showcase Hero', type: 'character' });
    expect(sidecar.report.html).toBe('charx-analysis.html');
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'charx-analysis.html'))).toBe(true);
  });

  it('emits a character showcase sidecar without html when html output is disabled', () => {
    const tempDir = createCanonicalCharacterWorkspace('risu-charx-showcase-no-html-');

    const exitCode = runAnalyzeCharxWorkflow([tempDir, '--no-html', '--locale', 'en']);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'charx-analysis.html'))).toBe(false);
    expect(readValidSidecar(tempDir).report.html).toBe('charx-analysis.html');
  });

  it('preserves an existing character showcase sidecar during wiki-only analysis', () => {
    const tempDir = createCanonicalCharacterWorkspace('risu-charx-showcase-wiki-only-');
    const sidecarPath = path.join(tempDir, 'analysis', 'risu-analysis.showcase.json');
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    const oldBytes = '{"legacy":true}\n';
    fs.writeFileSync(sidecarPath, oldBytes, 'utf8');

    const exitCode = runAnalyzeCharxWorkflow([tempDir, '--wiki-only', '--locale', 'en']);

    expect(exitCode).toBe(0);
    expect(fs.readFileSync(sidecarPath, 'utf8')).toBe(oldBytes);
  });

  it('does not create analysis output during wiki-only analysis', () => {
    const tempDir = createCanonicalCharacterWorkspace('risu-charx-showcase-wiki-boundary-');

    const exitCode = runAnalyzeCharxWorkflow([tempDir, '--wiki-only', '--locale', 'en']);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis'))).toBe(false);
  });

  it('returns a failure when wiki-only generation fails', () => {
    const tempDir = createCanonicalCharacterWorkspace('risu-charx-showcase-wiki-failure-');
    const wikiRoot = path.join(tempDir, 'wiki-output-file');
    fs.writeFileSync(wikiRoot, 'not a directory\n', 'utf8');

    const exitCode = runAnalyzeCharxWorkflow([tempDir, '--wiki-only', '--wiki-root', wikiRoot, '--locale', 'en']);

    expect(exitCode).toBe(1);
  });

  it('preserves an existing character showcase sidecar when an earlier requested html output fails', () => {
    const tempDir = createCanonicalCharacterWorkspace('risu-charx-showcase-html-failure-');
    const analysisDir = path.join(tempDir, 'analysis');
    const sidecarPath = path.join(analysisDir, 'risu-analysis.showcase.json');
    fs.mkdirSync(path.join(analysisDir, 'charx-analysis.html'), { recursive: true });
    const oldBytes = '{"previous":true}\n';
    fs.writeFileSync(sidecarPath, oldBytes, 'utf8');

    const exitCode = runAnalyzeCharxWorkflow([tempDir, '--locale', 'en']);

    expect(exitCode).toBe(0);
    expect(fs.readFileSync(sidecarPath, 'utf8')).toBe(oldBytes);
  });

  it('derives lorebook folder grouping from canonical file layout instead of stale frontmatter folder', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-charx-analyze-folders-'));
    tempDirs.push(tempDir);

    fs.mkdirSync(path.join(tempDir, 'character'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'lorebooks', 'World', 'Combat'), { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, 'character', 'metadata.json'),
      JSON.stringify({ name: 'folder-hero' }, null, 2),
      'utf8',
    );

    fs.writeFileSync(
      path.join(tempDir, 'lorebooks', '_order.json'),
      JSON.stringify(['World', 'World/Combat', 'World/Combat/Slash.risulorebook'], null, 2),
      'utf8',
    );

    fs.writeFileSync(
      path.join(tempDir, 'lorebooks', 'World', 'Combat', 'Slash.risulorebook'),
      `---
name: Slash
comment: Slash
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
folder: legacy-folder-key
---
@@@ KEYS
slash
@@@ CONTENT
{{setvar::stance::attack}}
`,
      'utf8',
    );

    const exitCode = runAnalyzeCharxWorkflow([tempDir, '--no-markdown']);

    expect(exitCode).toBe(0);

    const dataJs = fs.readFileSync(path.join(tempDir, 'analysis', 'charx-analysis.data.js'), 'utf8');
    expect(dataJs).toContain('"groupLabel":"World/Combat"');
    expect(dataJs).toContain('"id":"lb:World/Combat/Slash"');
    expect(dataJs).not.toContain('folder:legacy-folder-key');
    expect(dataJs).not.toContain('"groupLabel":"(root)"');
  });
});
