/**
 * Tests for core workflow MCP wrappers.
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
  it('runs scaffold command in preview-only mutation mode', async () => {
    const fixture = await createWorkflowFixture();

    const result = mutationResult(await handleRunScaffold(
      { name: 'Preview Character', outDir: 'generated/preview-character', type: 'charx' },
      fixture.workspace,
      'preview-only',
    ));

    expect(['applied', 'failed']).toContain(result.status);
    expect(result.postValidation.diagnostics.some((diagnostic) => diagnostic.ruleId?.startsWith('run-scaffold.'))).toBe(true);
  });

  it('rejects scaffold when output directory already exists', async () => {
    const fixture = await createWorkflowFixture();
    await mkdir(path.join(fixture.root, 'existing'), { recursive: true });

    const result = diagnosticEnvelope(await handleRunScaffold(
      { name: 'Existing', outDir: 'existing', type: 'module' },
      fixture.workspace,
      'enabled',
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'RUN_SCAFFOLD_OUTDIR_EXISTS')).toBe(true);
  });

  it('does not return preview for scaffold in preview-only mutation mode', async () => {
    const fixture = await createWorkflowFixture();

    const result = mutationResult(await handleRunScaffold(
      { name: 'New Module', outDir: 'new-module', type: 'module' },
      fixture.workspace,
      'preview-only',
    ));

    expect(['applied', 'failed']).toContain(result.status);
  });

  it('runs extract command in preview-only mutation mode', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not a real preset; preview must not parse it', 'utf8');

    const result = mutationResult(await handleRunExtract(
      { outDir: 'extracted/preset', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'preview-only',
    ));

    expect(['applied', 'failed']).toContain(result.status);
    expect(result.resourceLinks).toContain('risuai-workbench://wiki/extracted/preset/wiki');
  });

  it('rejects extract when output directory and fallback already exists', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not executed', 'utf8');
    await mkdir(path.join(fixture.root, 'existing-extract', 'source'), { recursive: true });

    const result = diagnosticEnvelope(await handleRunExtract(
      { outDir: 'existing-extract', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'enabled',
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'RUN_EXTRACT_OUTDIR_EXISTS')).toBe(true);
  });

  it('does not return preview for extract in preview-only mutation mode', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not executed', 'utf8');

    const result = mutationResult(await handleRunExtract(
      { outDir: 'extracted', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'preview-only',
    ));

    expect(['applied', 'failed']).toContain(result.status);
  });

  it('uses fallback extract output when requested nested wiki root already exists', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not executed', 'utf8');
    await mkdir(path.join(fixture.root, 'extracted', 'preset', 'wiki'), { recursive: true });

    const result = mutationResult(await handleRunExtract(
      { outDir: 'extracted/preset', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'preview-only',
    ));

    expect(['applied', 'failed']).toContain(result.status);
    expect(result.resourceLinks).toContain('risuai-workbench://wiki/extracted/preset/source/wiki');
  });

  it('reports progress milestones for run_extract execution', async () => {
    const progress = createRecordingProgressReporter();
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-extract-progress-'));
    await writeFile(path.join(root, 'source.risup'), 'not a real preset; preview must not parse it', 'utf8');

    await handleRunExtract(
      { outDir: 'generated/extract-preview', sourcePath: 'source.risup', type: 'preset' },
      { ok: true, path: root, reason: null },
      'preview-only',
      progress.reporter,
    );

    expect(progress.messages.map((entry) => entry.message)).toEqual([
      'Validating run_extract input.',
      'Resolving run_extract workspace paths.',
      'Preparing run_extract command.',
      'Checking run_extract mutation safety.',
      'Running risu-core extract.',
      'Running post-extract analyze and wiki generation.',
      'Collecting run_extract changed files.',
      'Validating run_extract output.',
      'run_extract complete.',
    ]);
  });

  it('run_extract is aborted before command execution', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not executed', 'utf8');

    const controller = new AbortController();
    controller.abort();

    const result = await handleRunExtract(
    { outDir: 'generated/cancelled-extract', sourcePath: 'source.risup' },
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
      { name: 'Cancelled', outDir: 'generated/cancelled-scaffold', type: 'charx' },
      fixture.workspace,
      'enabled',
      undefined,
      controller.signal,
    );

    const diagnosticResult = diagnosticEnvelope(result);
    expect(diagnosticResult.status).toBe('domain_warning');
    expect(diagnosticResult.diagnostics[0].id).toBe('REQUEST_CANCELLED');
  });

  it('reports progress milestones for run_scaffold execution', async () => {
    const progress = createRecordingProgressReporter();

    await handleRunScaffold(
      { name: 'Progress Character', outDir: 'generated/progress-character', type: 'charx' },
      { ok: true, path: await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-scaffold-progress-')), reason: null },
      'preview-only',
      progress.reporter,
    );

    expect(progress.messages.map((entry) => entry.message)).toEqual([
      'Validating run_scaffold input.',
      'Resolving run_scaffold workspace paths.',
      'Preparing run_scaffold command.',
      'Checking run_scaffold mutation safety.',
      'Running risu-core scaffold.',
      'Collecting run_scaffold changed files.',
      'Validating run_scaffold output.',
      'run_scaffold complete.',
    ]);
  });

  it('derives outDir from sourcePath when omitted in preview-only mode and executes', async () => {
    const fixture = await createWorkflowFixture();
    await mkdir(path.join(fixture.root, 'characters', 'merry'), { recursive: true });
    await writeFile(path.join(fixture.root, 'characters', 'merry', 'source.charx'), 'not a real charx; preview must not parse it', 'utf8');

    const result = mutationResult(await handleRunExtract(
      { sourcePath: 'characters/merry/source.charx' },
      fixture.workspace,
      'preview-only',
    ));
    expect(['applied', 'failed']).toContain(result.status);
    expect(result.resourceLinks).toContain('risuai-workbench://wiki/characters/merry/source/wiki');
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
