import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderLuaSplit } from '@/cli/analyze/shared/wiki/artifact/lua-split';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

let extractDir: string;

function writeJson(relativePath: string, value: unknown): void {
  const filePath = path.join(extractDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

describe('wiki/artifact/lua-split', () => {
  beforeEach(() => {
    extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-lua-split-wiki-'));
  });

  afterEach(() => {
    fs.rmSync(extractDir, { recursive: true, force: true });
  });

  it('renders split plan and sidecar summaries when docs exist', () => {
    writeJson('docs/risulua-split-plan.json', {
      version: 1,
      mode: 'module-table',
      sourceProfile: 'plain-single',
      entryPath: 'lua/main.risulua',
      distPath: 'dist/sample.risulua',
      packable: true,
      files: [
        { path: 'lua/main.risulua', kind: 'coarse-block' },
        { path: 'lua/domain/core.risulua', kind: 'domain-candidate' },
      ],
    });
    writeJson('docs/domain-candidates.json', {
      candidates: [
        { symbolName: 'core', targetPath: 'lua/domain/core.risulua', status: 'generated' },
        { symbolName: 'blocked', targetPath: 'lua/domain/blocked.risulua', status: 'blocked' },
      ],
    });
    writeJson('docs/refactor-map.json', {
      modules: [
        { path: 'lua/domain/core.risulua' },
        { path: 'lua/runtime/output.risulua' },
      ],
    });
    writeJson('docs/risulua-export-manifest.json', {
      exports: [{ name: 'onOutput' }],
      duplicateGroups: [{ name: 'foo' }],
    });
    writeJson('docs/risulua-button-action-index.json', {
      actions: [{ name: 'open_shop' }, { name: 'close_shop' }],
    });

    const report = minimalCharxReport();
    report.luaArtifacts[0].relativePath = 'lua/main.risulua';
    report.luaArtifacts[0].splitRole = 'main';
    const ctx = buildRenderContext({
      artifactKey: 'char_test',
      artifactType: 'character',
      wikiRoot: '/tmp/wiki',
      extractDir,
      workspace: EMPTY_WORKSPACE_CONFIG,
      now: new Date('2026-04-15T12:00:00Z'),
    });

    const file = renderLuaSplit(report, ctx);

    expect(file).not.toBeNull();
    expect(file!.relativePath).toBe('lua-split.md');
    expect(file!.content).toContain('# Lua Split Workspace');
    expect(file!.content).toContain('- **mode:** `module-table`');
    expect(file!.content).toContain('- **entry:** `lua/main.risulua`');
    expect(file!.content).toContain('- **dist:** `dist/sample.risulua`');
    expect(file!.content).toContain('- **planned files:** 2');
    expect(file!.content).toContain('- **domain candidates:** 2 total · 1 generated · 1 blocked');
    expect(file!.content).toContain('- **refactor map modules:** 2');
    expect(file!.content).toContain('- **host exports:** 1');
    expect(file!.content).toContain('- **duplicate groups:** 1');
    expect(file!.content).toContain('- **button actions:** 2');
  });
});
