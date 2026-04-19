import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runAnalyzeCharxWorkflow } from '@/cli/analyze/charx/workflow';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('runAnalyzeCharxWorkflow', () => {
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
