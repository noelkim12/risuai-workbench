/**
 * Tests for ensure_wiki_root generated wiki bootstrap behavior.
 * @file packages/risuai-workbench-mcp/tests/tools/ensure-wiki-root.test.ts
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleEnsureWikiRoot } from '../../src/tools/wiki/ensure-wiki-root';

async function createFixture(): Promise<{ root: string; workspace: WorkspaceRootStatus }> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-ensure-wiki-'));
  return { root, workspace: { ok: true, path: root, reason: null } };
}

function mutationResult(result: DiagnosticEnvelope | MutationResultEnvelope): MutationResultEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') throw new Error(`Expected mutation result, got ${result.schema}`);
  return result;
}

function diagnosticEnvelope(result: DiagnosticEnvelope | MutationResultEnvelope): DiagnosticEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.diagnostics') throw new Error(`Expected diagnostic envelope, got ${result.schema}`);
  return result;
}

describe('handleEnsureWikiRoot', () => {
  it('creates minimal generated wiki bootstrap files when missing', async () => {
    const fixture = await createFixture();

    const result = mutationResult(await handleEnsureWikiRoot(
      { confirmation: { accepted: true }, mode: 'commit' },
      fixture.workspace,
      'generated-only',
    ));

    expect(result.status).toBe('applied');
    expect(result.changedFiles.map((file) => file.path).sort()).toEqual([
      'wiki/SCHEMA.md',
      'wiki/_index.md',
      'wiki/_log.md',
      'wiki/_schema/README.md',
    ]);
    expect(await readFile(path.join(fixture.root, 'wiki', 'SCHEMA.md'), 'utf8')).toContain('RisuAI Workbench Wiki Schema');
    expect(await readFile(path.join(fixture.root, 'wiki', '_index.md'), 'utf8')).toContain('BEGIN:artifacts');
    expect(await readFile(path.join(fixture.root, 'wiki', '_schema', 'README.md'), 'utf8')).toContain('Generated Schema');
  });

  it('previews planned writes without changing files', async () => {
    const fixture = await createFixture();

    const result = diagnosticEnvelope(await handleEnsureWikiRoot(
      { mode: 'preview' },
      fixture.workspace,
      'generated-only',
    ));

    expect(result.status).toBe('ok');
    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['ENSURE_WIKI_ROOT_PREVIEW']);
    await expect(readFile(path.join(fixture.root, 'wiki', 'SCHEMA.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('creates only missing bootstrap files and does not overwrite existing files', async () => {
    const fixture = await createFixture();
    await mkdir(path.join(fixture.root, 'wiki'), { recursive: true });
    await writeFile(path.join(fixture.root, 'wiki', 'SCHEMA.md'), 'custom schema\n', 'utf8');

    const result = mutationResult(await handleEnsureWikiRoot(
      { confirmation: { accepted: true }, mode: 'commit' },
      fixture.workspace,
      'generated-only',
    ));

    expect(result.status).toBe('applied');
    expect(result.changedFiles.map((file) => file.path).sort()).toEqual([
      'wiki/_index.md',
      'wiki/_log.md',
      'wiki/_schema/README.md',
    ]);
    expect(await readFile(path.join(fixture.root, 'wiki', 'SCHEMA.md'), 'utf8')).toBe('custom schema\n');
  });

  it('returns no-op diagnostics when bootstrap files already exist', async () => {
    const fixture = await createFixture();
    await handleEnsureWikiRoot({ confirmation: { accepted: true }, mode: 'commit' }, fixture.workspace, 'generated-only');

    const result = diagnosticEnvelope(await handleEnsureWikiRoot(
      { confirmation: { accepted: true }, mode: 'commit' },
      fixture.workspace,
      'generated-only',
    ));

    expect(result.status).toBe('ok');
    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['ENSURE_WIKI_ROOT_ALREADY_EXISTS']);
  });

  it('rejects non-default wiki roots until root-aware allowlists exist', async () => {
    const fixture = await createFixture();

    const result = diagnosticEnvelope(await handleEnsureWikiRoot(
      { confirmation: { accepted: true }, mode: 'commit', wikiRoot: 'project/wiki' },
      fixture.workspace,
      'generated-only',
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['ENSURE_WIKI_ROOT_UNSUPPORTED_ROOT']);
  });
});
