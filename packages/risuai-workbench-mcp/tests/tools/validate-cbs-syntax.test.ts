import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { createWorkbenchActionRegistry } from '../../src/actions/create-registry';
import type { ActionExecutionContext } from '../../src/actions/types';
import { handleRunAction } from '../../src/tools/facade';
import { handleValidateCbsSyntax } from '../../src/tools/validate/validate-cbs-syntax';

describe('handleValidateCbsSyntax', () => {
  it('returns empty diagnostics for valid CBS text', async () => {
    const result = await handleValidateCbsSyntax({ sourceText: 'Hello, {{user}}!' });
    expect(result.data?.diagnostics).toEqual([]);
    expect(result.status).toBe('ok');
  });

  it('detects unknown tag CBS003', async () => {
    const result = await handleValidateCbsSyntax({ sourceText: '{{unknownTag::arg}}' });
    const codes = result.data?.diagnostics.map((d) => d.code) ?? [];
    expect(codes).toContain('CBS003');
  });

  it('detects deprecated #if as CBS100', async () => {
    const result = await handleValidateCbsSyntax({ sourceText: '{{#if::cond}}body{{/if}}' });
    const codes = result.data?.diagnostics.map((d) => d.code) ?? [];
    expect(codes).toContain('CBS100');
    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toContain('CBS100');
    expect(result.summary.warningCount).toBe(1);
    expect(result.status).toBe('domain_warning');
  });

  it('maps parser errors and source paths into the outer envelope', async () => {
    const result = await handleValidateCbsSyntax({
      sourceText: '{{unknownTag::arg}}',
      path: 'prompt_template/manual-qa.risuprompt',
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        id: 'CBS003',
        path: 'prompt_template/manual-qa.risuprompt',
        severity: 'error',
      }),
    );
    expect(result.summary.errorCount).toBe(1);
    expect(result.status).toBe('domain_error');
  });

  it('returns schema marker in envelope', async () => {
    const result = await handleValidateCbsSyntax({ sourceText: '{{user}}' });
    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
  });

  it('reads a workspace-relative sourcePath and reports its normalized path and hash', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-cbs-source-'));
    const sourcePath = 'lorebooks/system/action.risulorebook';
    const sourceText = '{{#if::cond}}body{{/if}}';
    await mkdir(path.join(root, 'lorebooks/system'), { recursive: true });
    await writeFile(path.join(root, sourcePath), sourceText, 'utf8');

    const context: ActionExecutionContext = {
      mutationMode: 'preview-only',
      patchStore: {
        findByIdeaId: () => null,
        getPatchPlan: () => null,
        savePatchPlan: () => {},
      },
      workspace: { ok: true, path: root, reason: null },
    };
    const result = await handleRunAction(
      { actionId: 'validate.cbs_syntax', args: { sourcePath } },
      createWorkbenchActionRegistry(context),
      context,
    );

    expect(result).toMatchObject({
      data: {
        sourceHash: `sha256:${createHash('sha256').update(sourceText).digest('hex')}`,
        sourceMode: 'workspace-file',
        sourcePath,
      },
      diagnostics: expect.arrayContaining([expect.objectContaining({ id: 'CBS100', path: sourcePath })]),
    });
  });

  it('returns a structured error when sourcePath is not a readable file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-cbs-source-'));
    await mkdir(path.join(root, 'lorebooks/directory.risulorebook'), { recursive: true });
    const context: ActionExecutionContext = {
      mutationMode: 'preview-only',
      patchStore: {
        findByIdeaId: () => null,
        getPatchPlan: () => null,
        savePatchPlan: () => {},
      },
      workspace: { ok: true, path: root, reason: null },
    };

    const result = await handleRunAction(
      { actionId: 'validate.cbs_syntax', args: { sourcePath: 'lorebooks/directory.risulorebook' } },
      createWorkbenchActionRegistry(context),
      context,
    );

    expect(result).toMatchObject({
      status: 'domain_error',
      diagnostics: expect.arrayContaining([expect.objectContaining({ id: 'CBS_SOURCE_READ_FAILED' })]),
    });
  });
});
