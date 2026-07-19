import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderRegex } from '@/cli/analyze/shared/wiki/artifact/regex';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/artifact/regex', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-regex-'));
    fs.mkdirSync(path.join(tempDir, 'regex'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('renders canonical regex files even when they have no CBS reads or writes', () => {
    fs.writeFileSync(
      path.join(tempDir, 'regex', 'status_display.risuregex'),
      `---
comment: status_display
type: editdisplay
---
@@@ IN
\\[Anal State:([^\\]]+)\\]
@@@ OUT
<span>Anal State:$1</span>
`,
      'utf-8',
    );
    const ctx = buildRenderContext({
      artifactKey: 'module_test',
      artifactType: 'module',
      wikiRoot: path.join(tempDir, 'wiki'),
      extractDir: tempDir,
      workspace: EMPTY_WORKSPACE_CONFIG,
      now: new Date('2026-04-15T12:00:00Z'),
    });
    const report = minimalCharxReport();
    report.collected.regexCBS = [];

    const file = renderRegex(report, ctx);

    expect(file).not.toBeNull();
    expect(file?.content).toContain('regex-count: 1');
    expect(file?.content).toContain('`[module]/status_display`');
    expect(file?.content).toContain('| `[module]/status_display` | — | — |');
  });
});
