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

describe('core workflow wrappers', () => {
  it('previews scaffold command without creating output directory', async () => {
    const fixture = await createWorkflowFixture();

    const result = diagnosticEnvelope(await handleRunScaffold(
      { mode: 'preview', name: 'Preview Character', outDir: 'generated/preview-character', type: 'charx' },
      fixture.workspace,
      'enabled',
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

  it('rejects scaffold commit in preview-only mutation mode before running command', async () => {
    const fixture = await createWorkflowFixture();

    const result = mutationResult(await handleRunScaffold(
      { confirmation: { accepted: true, confirmationText: 'RUN_SCAFFOLD new-module' }, mode: 'commit', name: 'New Module', outDir: 'new-module', type: 'module' },
      fixture.workspace,
      'preview-only',
    ));

    expect(result.status).toBe('rejected');
    expect(result.postValidation.diagnostics[0]?.ruleId).toBe('run-scaffold.mutation-mode-preview-only');
  });

  it('previews extract command with source and target paths', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not a real preset; preview must not parse it', 'utf8');

    const result = diagnosticEnvelope(await handleRunExtract(
      { mode: 'preview', outDir: 'extracted/preset', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'enabled',
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ expectedConfirmationText: 'RUN_EXTRACT source.risup TO extracted/preset', preview: true, source: 'source.risup', target: 'extracted/preset' });
  });

  it('rejects extract when output directory already exists', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not executed', 'utf8');
    await mkdir(path.join(fixture.root, 'existing-extract'), { recursive: true });

    const result = diagnosticEnvelope(await handleRunExtract(
      { mode: 'commit', outDir: 'existing-extract', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'enabled',
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'RUN_EXTRACT_OUTDIR_EXISTS')).toBe(true);
  });

  it('rejects extract commit in preview-only mutation mode before running command', async () => {
    const fixture = await createWorkflowFixture();
    await writeFile(path.join(fixture.root, 'source.risup'), 'not executed', 'utf8');

    const result = mutationResult(await handleRunExtract(
      { confirmation: { accepted: true, confirmationText: 'RUN_EXTRACT source.risup TO extracted' }, mode: 'commit', outDir: 'extracted', sourcePath: 'source.risup', type: 'preset' },
      fixture.workspace,
      'preview-only',
    ));

    expect(result.status).toBe('rejected');
    expect(result.postValidation.diagnostics[0]?.ruleId).toBe('run-extract.mutation-mode-preview-only');
  });
});
