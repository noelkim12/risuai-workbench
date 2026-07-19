/**
 * Tests for refresh_wiki generated-only mutation boundaries.
 * @file packages/risuai-workbench-mcp/tests/tools/refresh-wiki.test.ts
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleRefreshWiki } from '../../src/tools/wiki/refresh-wiki';

interface RefreshWikiFixture {
  root: string;
  workspace: WorkspaceRootStatus;
}

/**
 * createRefreshWikiFixture 함수.
 * generated wiki와 protected wiki/source 파일을 포함한 isolated temp workspace를 구성함.
 *
 * @returns refresh_wiki temp fixture
 */
async function createRefreshWikiFixture(): Promise<RefreshWikiFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-refresh-wiki-'));
  await mkdir(path.join(root, 'wiki', 'artifacts', 'merry', '_generated'), { recursive: true });
  await mkdir(path.join(root, 'wiki', 'notes'), { recursive: true });
  await mkdir(path.join(root, 'wiki', 'domain'), { recursive: true });
  await mkdir(path.join(root, 'characters', 'merry', 'lorebooks'), { recursive: true });
  await writeFile(path.join(root, 'wiki', 'artifacts', 'merry', '_generated', 'overview.md'), 'old generated\n', 'utf8');
  await writeFile(path.join(root, 'wiki', 'notes', 'manual.md'), 'manual notes\n', 'utf8');
  await writeFile(path.join(root, 'wiki', 'domain', 'manual.md'), 'domain manual\n', 'utf8');
  await writeFile(path.join(root, 'workspace.yaml'), 'artifacts: []\n', 'utf8');
  await writeFile(path.join(root, 'characters', 'merry', 'lorebooks', 'source.risulorebook'), 'source\n', 'utf8');
  return { root, workspace: { ok: true, path: root, reason: null } };
}

/**
 * hashFile 함수.
 * fixture 파일 내용을 sha256으로 요약함.
 *
 * @param filePath - absolute file path
 * @returns sha256 digest
 */
async function hashFile(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function mutationResult(result: DiagnosticEnvelope | MutationResultEnvelope): MutationResultEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') throw new Error(`Expected mutation result, got ${result.schema}`);
  return result;
}

function diagnosticEnvelope(result: DiagnosticEnvelope | MutationResultEnvelope): DiagnosticEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.diagnostics') throw new Error(`Expected diagnostic envelope, got ${result.schema}`);
  return result;
}

describe('handleRefreshWiki', () => {
  it('runs the analyzer when target all is requested without generatedFiles', async () => {
    const fixture = await createRefreshWikiFixture();
    const wikiRoot = path.join(fixture.root, 'wiki');
    await writeFile(
      path.join(fixture.root, '.risumodule'),
      `${JSON.stringify({
        $schema: 'https://risuai-workbench.dev/schemas/risumodule.schema.json',
        id: 'refresh-test',
        kind: 'risu.module',
        name: 'refresh-test',
        schemaVersion: 1,
        sourceFormat: 'json',
      }, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(wikiRoot, 'workspace.yaml'),
      'artifacts:\n  - path: .\n    type: module\n',
      'utf8',
    );

    const result = mutationResult(await handleRefreshWiki(
      {
        mode: 'commit',
        postValidate: true,
        target: 'all',
        wikiRoot,
      },
      fixture.workspace,
      'generated-only',
    ));

    expect(result.status).toBe('applied');
    expect(result.postValidation.status).toBe('ok');
    expect(result.workflowSummary?.analyzeArgs).toContain('--all');
    expect(result.changedFiles.some((file) => file.path.endsWith('/_generated/overview.md'))).toBe(true);
    expect(result.changedFiles.some((file) => file.path === 'wiki/_log.md')).toBe(true);
    expect(await readFile(path.join(wikiRoot, '_log.md'), 'utf8')).toContain('regenerated _generated/');
  });

  it('refuses an analyzer wiki root that escapes through a symlink', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-refresh-wiki-root-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-refresh-wiki-outside-'));
    const protectedFile = path.join(outside, 'artifacts', 'external', '_generated', 'overview.md');
    await mkdir(path.dirname(protectedFile), { recursive: true });
    await writeFile(protectedFile, 'external generated content\n', 'utf8');
    await symlink(outside, path.join(root, 'wiki'), 'dir');

    const result = diagnosticEnvelope(await handleRefreshWiki(
      { mode: 'commit', postValidate: true, target: 'all', wikiRoot: 'wiki' },
      { ok: true, path: root, reason: null },
      'generated-only',
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toContain('REFRESH_WIKI_PROTECTED_PATH');
    expect(await readFile(protectedFile, 'utf8')).toBe('external generated content\n');
  });

  it('refuses nested symlinks in analyzer-owned wiki paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-refresh-wiki-nested-root-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-refresh-wiki-nested-outside-'));
    await mkdir(path.join(root, 'wiki'), { recursive: true });
    await symlink(outside, path.join(root, 'wiki', 'artifacts'), 'dir');

    const result = diagnosticEnvelope(await handleRefreshWiki(
      { mode: 'preview', postValidate: true, target: 'all', wikiRoot: 'wiki' },
      { ok: true, path: root, reason: null },
      'preview-only',
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toContain('REFRESH_WIKI_PROTECTED_PATH');
  });

  it('writes only generated wiki paths and preserves protected manual/source files', async () => {
    const fixture = await createRefreshWikiFixture();
    const protectedPaths = [
      path.join(fixture.root, 'wiki', 'notes', 'manual.md'),
      path.join(fixture.root, 'wiki', 'domain', 'manual.md'),
      path.join(fixture.root, 'workspace.yaml'),
      path.join(fixture.root, 'characters', 'merry', 'lorebooks', 'source.risulorebook'),
    ];
    const beforeProtectedHashes = await Promise.all(protectedPaths.map(hashFile));

    const result = mutationResult(await handleRefreshWiki(
      {
        generatedFiles: [
          { content: '# New Overview\n', path: 'wiki/artifacts/merry/_generated/overview.md' },
          { content: '# Schema\n', path: 'wiki/SCHEMA.md' },
          { content: '### Characters\n- [merry](artifacts/merry/_generated/overview.md)\n', path: 'wiki/_index.md' },
          { content: '## refresh\n- ok\n', path: 'wiki/_log.md' },
        ],
        mode: 'commit',
      },
      fixture.workspace,
      'generated-only',
    ));

    expect(result.status).toBe('applied');
    expect(await readFile(path.join(fixture.root, 'wiki', 'artifacts', 'merry', '_generated', 'overview.md'), 'utf8')).toBe('# New Overview\n');
    expect(await readFile(path.join(fixture.root, 'wiki', 'SCHEMA.md'), 'utf8')).toBe('# Schema\n');
    expect(await readFile(path.join(fixture.root, 'wiki', '_index.md'), 'utf8')).toContain('BEGIN:artifacts');
    expect(await readFile(path.join(fixture.root, 'wiki', '_log.md'), 'utf8')).toContain('refresh');
    await expect(Promise.all(protectedPaths.map(hashFile))).resolves.toEqual(beforeProtectedHashes);
  });

  it('refuses protected paths before any generated wiki writes', async () => {
    const fixture = await createRefreshWikiFixture();
    const generatedPath = path.join(fixture.root, 'wiki', 'artifacts', 'merry', '_generated', 'overview.md');
    const beforeGenerated = await hashFile(generatedPath);

    const result = diagnosticEnvelope(await handleRefreshWiki(
      {
        generatedFiles: [
          { content: '# should not write\n', path: 'wiki/artifacts/merry/_generated/overview.md' },
          { content: 'blocked\n', path: 'wiki/notes/manual.md' },
          { content: 'blocked\n', path: 'workspace.yaml' },
        ],
        mode: 'commit',
      },
      fixture.workspace,
      'generated-only',
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['REFRESH_WIKI_PROTECTED_PATH', 'REFRESH_WIKI_PROTECTED_PATH']);
    expect(await hashFile(generatedPath)).toBe(beforeGenerated);
  });
});
