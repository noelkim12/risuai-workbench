/**
 * Tests for variable-flow analyze query tools.
 * @file packages/risuai-workbench-mcp/tests/tools/query-variable-flow.test.ts
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import { computeFileHash } from '../../src/mutation/file-hash';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleQueryVariable, handleQueryVariableFlow } from '../../src/tools/query-analyze';

interface VariableFlowFixture {
  root: string;
  sourcePath: string;
  workspace: WorkspaceRootStatus;
}

/**
 * createVariableFlowFixture 함수.
 * read-only analyze query가 참조할 isolated source file을 만든다.
 *
 * @returns temp workspace fixture
 */
async function createVariableFlowFixture(): Promise<VariableFlowFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-query-flow-'));
  const sourcePath = path.join(root, 'characters', 'merry', 'script.cbs');
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, '{{setvar::mood::happy}} {{getvar::mood}}', 'utf8');
  return { root, sourcePath, workspace: { ok: true, path: root, reason: null } };
}

describe('analyze variable-flow query tools', () => {
  it('returns normalized variable flow with snapshot metadata without mutating source files', async () => {
    const fixture = await createVariableFlowFixture();
    const beforeHash = await computeFileHash(fixture.sourcePath);

    const result = await handleQueryVariableFlow(
      {
        defaultVariables: {},
        elements: [
          { elementName: 'intro', elementType: 'lorebook', reads: ['mood'], writes: [] },
          { elementName: 'setup', elementType: 'regex', reads: [], writes: ['mood'] },
        ],
        sourcePath: 'characters/merry/script.cbs',
      },
      fixture.workspace,
    );

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({
      snapshot: {
        analyzerVersion: '0.2.0',
        sourceHash: beforeHash,
        stale: false,
        staleReasons: [],
        workspaceRoot: fixture.root,
      },
      summary: { totalVariables: 1 },
    });
    expect((result.data as { snapshot: { snapshotId: string; createdAt: string } }).snapshot.snapshotId).toMatch(/^snapshot:/);
    expect((result.data as { snapshot: { createdAt: string } }).snapshot.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await computeFileHash(fixture.sourcePath)).toBe(beforeHash);
    expect(await readFile(fixture.sourcePath, 'utf8')).toBe('{{setvar::mood::happy}} {{getvar::mood}}');
  });

  it('returns a focused variable view with readers, writers, and bridge diagnostics', async () => {
    const fixture = await createVariableFlowFixture();

    const result = await handleQueryVariable(
      {
        elements: [
          { elementName: 'intro', elementType: 'lorebook', reads: ['mood'], writes: [] },
          { elementName: 'setup', elementType: 'regex', reads: [], writes: ['mood'] },
        ],
        sourcePath: 'characters/merry/script.cbs',
        variableName: 'mood',
      },
      fixture.workspace,
    );

    expect(result.status).toBe('ok');
    expect(result.tool).toBe('workbench.query_variable');
    expect(result.data).toMatchObject({
      exists: true,
      readers: ['intro'],
      variableName: 'mood',
      writers: ['setup'],
    });
  });

  it('reports missing variables as domain warnings rather than transport errors', async () => {
    const fixture = await createVariableFlowFixture();

    const result: DiagnosticEnvelope = await handleQueryVariable(
      {
        elements: [{ elementName: 'intro', elementType: 'lorebook', reads: ['mood'], writes: [] }],
        sourcePath: 'characters/merry/script.cbs',
        variableName: 'missing',
      },
      fixture.workspace,
    );

    expect(result.status).toBe('domain_warning');
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'VARIABLE_NOT_FOUND')).toBe(true);
    expect(result.data).toMatchObject({ exists: false, variableName: 'missing' });
  });
});
