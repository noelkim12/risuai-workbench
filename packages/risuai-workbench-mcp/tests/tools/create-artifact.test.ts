/**
 * Tests for create_artifact direct mutation tool.
 * @file packages/risuai-workbench-mcp/tests/tools/create-artifact.test.ts
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import { createPatchPlanStore } from '../../src/mutation/patch-store';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleCreateArtifact } from '../../src/tools/mutation/create-artifact';

interface CreateFixture {
  root: string;
  workspace: WorkspaceRootStatus;
}

/**
 * createCreateFixture 함수.
 * create_artifact tests가 쓰는 isolated temp workspace를 구성함.
 *
 * @returns temp workspace fixture paths
 */
async function createCreateFixture(): Promise<CreateFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-create-'));
  const lorebookDir = path.join(root, 'lorebooks');
  await mkdir(lorebookDir, { recursive: true });
  await writeFile(path.join(lorebookDir, '_order.json'), `${JSON.stringify(['existing.risulorebook'], null, 2)}\n`, 'utf8');
  await writeFile(path.join(lorebookDir, 'existing.risulorebook'), '---\nname: existing\n---\nbody\n', 'utf8');
  return { root, workspace: { ok: true, path: root, reason: null } };
}

/**
 * mutationResult 함수.
 * handler union result를 mutation result로 좁힘.
 */
function mutationResult(result: DiagnosticEnvelope | MutationResultEnvelope): MutationResultEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') {
    throw new Error(`Expected mutation result, got ${result.schema}`);
  }
  return result;
}

/**
 * diagnosticEnvelope 함수.
 * handler union result를 diagnostic envelope로 좁힘.
 */
function diagnosticEnvelope(result: DiagnosticEnvelope | MutationResultEnvelope): DiagnosticEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.diagnostics') {
    throw new Error(`Expected diagnostic envelope, got ${result.schema}`);
  }
  return result;
}

describe('handleCreateArtifact', () => {
  it('creates artifact with frontmatter and body in enabled commit mode', async () => {
    const fixture = await createCreateFixture();
    const patchStore = createPatchPlanStore();

    const result = mutationResult(await handleCreateArtifact(
      {
        artifact: 'lorebook',
        body: 'combat emotion text',
        initialFrontmatter: { enabled: 'true', priority: '30' },
        mode: 'commit',
        order: { index: 1, insert: true },
        root: 'characters/merry',
        stem: 'combat-emotion',
        target: 'charx',
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('applied');
    expect(result.changedFiles.length).toBeGreaterThanOrEqual(1);
    expect(result.changedFiles.some((f) => f.path.includes('combat-emotion'))).toBe(true);
    expect(result.postValidation.status).not.toBe('error');

    const createdPath = path.join(fixture.root, 'lorebooks', 'combat-emotion.risulorebook');
    const createdFile = await readFile(createdPath, 'utf8');
    expect(createdFile).toContain('enabled: true');
    expect(createdFile).toContain('combat emotion text');

    const order = JSON.parse(await readFile(path.join(fixture.root, 'lorebooks', '_order.json'), 'utf8')) as string[];
    expect(order).toContain('combat-emotion.risulorebook');
  });

  it('returns preview with patchPlan in preview-only mutation mode', async () => {
    const fixture = await createCreateFixture();
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleCreateArtifact(
      {
        artifact: 'lorebook',
        body: 'preview text',
        initialFrontmatter: { enabled: 'true' },
        mode: 'commit',
        root: 'characters/merry',
        stem: 'preview-test',
        target: 'charx',
      },
      fixture.workspace,
      'preview-only',
      patchStore,
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ preview: true });
    expect((result.data as { canonicalPath: string }).canonicalPath).toContain('preview-test');

    const canonicalPath = (result.data as { canonicalPath: string }).canonicalPath;
    await expect(readFile(path.join(fixture.root, canonicalPath), 'utf8')).rejects.toThrow();
  });

  it('returns preview in preview-only mode', async () => {
    const fixture = await createCreateFixture();
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleCreateArtifact(
      {
        artifact: 'lorebook',
        mode: 'commit',
        root: 'characters/merry',
        stem: 'blocked',
        target: 'charx',
      },
      fixture.workspace,
      'preview-only',
      patchStore,
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ preview: true });
  });

  it('rejects when file already exists', async () => {
    const fixture = await createCreateFixture();
    const patchStore = createPatchPlanStore();

    await writeFile(path.join(fixture.root, 'lorebooks', 'conflict.risulorebook'), '---\nname: conflict\n---\nbody\n', 'utf8');

    const result = diagnosticEnvelope(await handleCreateArtifact(
      {
        artifact: 'lorebook',
        mode: 'preview',
        root: 'characters/merry',
        stem: 'conflict',
        target: 'charx',
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((d) => d.id === 'FILE_ALREADY_EXISTS')).toBe(true);
  });


});
