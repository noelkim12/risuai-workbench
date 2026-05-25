/**
 * Tests for gated core workflow MCP wrappers.
 * @file packages/risuai-workbench-mcp/tests/tools/run-workflows.test.ts
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleRunExtract } from '../../src/tools/mutation/run-extract';
import { handleRunScaffold } from '../../src/tools/mutation/run-scaffold';
import { runRisuCoreCommand } from '../../src/tools/mutation/core-workflow-cli';

interface WorkflowFixture {
  root: string;
  workspace: WorkspaceRootStatus;
}

async function createWorkflowFixture(): Promise<WorkflowFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-workflow-'));
  return { root, workspace: { ok: true, path: root, reason: null } };
}

function diagnosticEnvelope(result: DiagnosticEnvelope | MutationResultEnvelope): DiagnosticEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.diagnostics') throw new Error(`Expected diagnostic envelope, got ${result.schema}`);
  return result;
}

function mutationResult(result: DiagnosticEnvelope | MutationResultEnvelope): MutationResultEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') throw new Error(`Expected mutation result, got ${result.schema}`);
  return result;
}

function createRecordingProgressReporter() {
  const messages: Array<{ message: string; progress: number; total: number | undefined }> = [];
  return {
    messages,
    reporter: {
      async report(progress: number, total: number | undefined, message: string): Promise<void> {
        messages.push({ message, progress, total });
      },
    },
  };
}

describe('core workflow wrappers', () => {
  it('previews scaffold command in preview-only mutation mode', async () => {
    const fixture = await createWorkflowFixture();

    const result = diagnosticEnvelope(await handleRunScaffold(
      { mode: 'commit', name: 'Preview Character', outDir: 'generated/preview-character', type: 'charx' },
      fixture.workspace,
      'preview-only',
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ expectedConfirmationText: 'RUN_SCAFFOLD generated/preview-character', preview: true, target: 'generated/preview-character' });
    await expect(readFile(path.join(fixture.root, 'generated', 'preview-character', '.risuchar'), 'utf8')).rejects.toThrow();
  });

  it('rejects scaffold when output directory already exists', async () => {
    const fixture = await createWorkflowFixture();
    await mkdir(path.join(fixture.root, 'existing'), { recursive: true });

    const result = diagnosticEnvelope(await handleRunScaffold(
      { mode: 'commit', name: 'Existing', outDir: 'existing', type: 'module' },
      fixture.workspace,
      'enabled',
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'RUN_SCAFFOLD_OUTDIR_EXISTS')).toBe(true);
  });

  it('returns preview for scaffold in preview-only mutation mode', async () => {
    const fixture = await createWorkflowFixture();

    const result = diagnosticEnvelope(await handleRunScaffold(
      { confirmation: { accepted: true, confirmationText: 'RUN_SCAFFOLD new-module' }, mode: 'commit', name: 'New Module', outDir: 'new-module', type: 'module' },
      fixture.workspace,
      'preview-only',
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ preview: true, expectedConfirmationText: 'RUN_SCAFFOLD new-module' });
  });

  it('previews extract command in preview-only mutation mode', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not a real preset; preview must not parse it', 'utf8');

    const result = diagnosticEnvelope(await handleRunExtract(
      { mode: 'commit', outDir: 'extracted/preset', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'preview-only',
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ expectedConfirmationText: 'RUN_EXTRACT source.risup TO extracted/preset WITH WIKI extracted/preset/wiki', preview: true, source: 'source.risup', target: 'extracted/preset' });
    expect(result.data).toMatchObject({ postExtractAnalyze: { args: expect.arrayContaining(['analyze', '--type', 'preset', 'extracted/preset', '--wiki', '--wiki-root', 'extracted/preset/wiki']), defaultWikiRoot: 'extracted/preset/wiki' } });
  });

  it('rejects extract when output directory and fallback already exists', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not executed', 'utf8');
    await mkdir(path.join(fixture.root, 'existing-extract', 'source'), { recursive: true });

    const result = diagnosticEnvelope(await handleRunExtract(
      { mode: 'commit', outDir: 'existing-extract', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'enabled',
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'RUN_EXTRACT_OUTDIR_EXISTS')).toBe(true);
  });

  it('returns preview for extract in preview-only mutation mode', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not executed', 'utf8');

    const result = diagnosticEnvelope(await handleRunExtract(
      { confirmation: { accepted: true, confirmationText: 'RUN_EXTRACT source.risup TO extracted WITH WIKI extracted/wiki' }, mode: 'commit', outDir: 'extracted', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'preview-only',
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ preview: true, expectedConfirmationText: 'RUN_EXTRACT source.risup TO extracted WITH WIKI extracted/wiki' });
  });

  it('uses fallback extract output when requested nested wiki root already exists', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not executed', 'utf8');
    await mkdir(path.join(fixture.root, 'extracted', 'preset', 'wiki'), { recursive: true });

    const result = diagnosticEnvelope(await handleRunExtract(
      { mode: 'commit', outDir: 'extracted/preset', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'preview-only',
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ expectedConfirmationText: 'RUN_EXTRACT source.risup TO extracted/preset/source WITH WIKI extracted/preset/source/wiki', preview: true });
  });

  it('reports progress milestones for run_extract preview', async () => {
    const progress = createRecordingProgressReporter();
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-extract-progress-'));
    await writeFile(path.join(root, 'source.risup'), 'not a real preset; preview must not parse it', 'utf8');

    await handleRunExtract(
      { mode: 'preview', outDir: 'generated/extract-preview', sourcePath: 'source.risup', type: 'preset' },
      { ok: true, path: root, reason: null },
      'preview-only',
      progress.reporter,
    );

    expect(progress.messages.map((entry) => entry.message)).toEqual([
      'Validating run_extract input.',
      'Resolving run_extract workspace paths.',
      'Preparing run_extract command preview.',
      'run_extract preview complete.',
    ]);
  });

  it('run_extract is aborted before command execution', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not executed', 'utf8');

    const controller = new AbortController();
    controller.abort();

    const result = await handleRunExtract(
    { confirmation: { accepted: true, confirmationText: 'RUN_EXTRACT source.risup TO generated/cancelled-extract WITH WIKI generated/cancelled-extract/wiki' }, mode: 'commit', outDir: 'generated/cancelled-extract', sourcePath: 'source.risup' },
      fixture.workspace,
      'enabled',
      undefined,
      controller.signal,
    );

    const diagnosticResult = diagnosticEnvelope(result);
    expect(diagnosticResult.status).toBe('domain_warning');
    expect(diagnosticResult.diagnostics[0].id).toBe('REQUEST_CANCELLED');
  });

  it('run_scaffold is aborted before command execution', async () => {
    const fixture = await createWorkflowFixture();

    const controller = new AbortController();
    controller.abort();

    const result = await handleRunScaffold(
      { confirmation: { accepted: true, confirmationText: 'RUN_SCAFFOLD generated/cancelled-scaffold' }, mode: 'commit', name: 'Cancelled', outDir: 'generated/cancelled-scaffold', type: 'charx' },
      fixture.workspace,
      'enabled',
      undefined,
      controller.signal,
    );

    const diagnosticResult = diagnosticEnvelope(result);
    expect(diagnosticResult.status).toBe('domain_warning');
    expect(diagnosticResult.diagnostics[0].id).toBe('REQUEST_CANCELLED');
  });

  it('reports progress milestones for run_scaffold preview', async () => {
    const progress = createRecordingProgressReporter();

    await handleRunScaffold(
      { mode: 'preview', name: 'Progress Character', outDir: 'generated/progress-character', type: 'charx' },
      { ok: true, path: await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-scaffold-progress-')), reason: null },
      'preview-only',
      progress.reporter,
    );

    expect(progress.messages.map((entry) => entry.message)).toEqual([
      'Validating run_scaffold input.',
      'Resolving run_scaffold workspace paths.',
      'Preparing run_scaffold command preview.',
      'run_scaffold preview complete.',
    ]);
  });

  it('derives outDir from sourcePath when omitted in preview-only mode', async () => {
    const fixture = await createWorkflowFixture();
    await mkdir(path.join(fixture.root, 'characters', 'merry'), { recursive: true });
    await writeFile(path.join(fixture.root, 'characters', 'merry', 'source.charx'), 'not a real charx; preview must not parse it', 'utf8');

    const result = diagnosticEnvelope(await handleRunExtract(
      { mode: 'commit', sourcePath: 'characters/merry/source.charx' },
      fixture.workspace,
      'preview-only',
    ));
    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ postExtractAnalyze: { defaultWikiRoot: 'characters/merry/source/wiki' }, target: 'characters/merry/source' });
  });

  it('marks risu-core command result as cancelled when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runRisuCoreCommand(['--version'], process.cwd(), { signal: controller.signal });

    expect(result.cancelled).toBe(true);
    expect(result.exitCode).toBe(130);
    expect(result.stderr).toContain('cancelled before start');
  });
});
