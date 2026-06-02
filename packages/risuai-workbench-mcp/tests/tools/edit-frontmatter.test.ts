/**
 * Tests for edit_frontmatter direct mutation tool with unsafe/malformed scenarios.
 * @file packages/risuai-workbench-mcp/tests/tools/edit-frontmatter.test.ts
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import { createPatchPlanStore } from '../../src/mutation/patch-store';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleEditFrontmatter } from '../../src/tools/mutation/edit-frontmatter';

interface FrontmatterFixture {
  filePath: string;
  root: string;
  workspace: WorkspaceRootStatus;
}

/**
 * createFrontmatterFixture 함수.
 * edit_frontmatter tests가 쓰는 isolated temp workspace를 구성함.
 *
 * @param content - 파일에 쓸 초기 내용
 * @param relativePath - workspace 내 relative path
 * @returns temp workspace fixture paths
 */
async function createFrontmatterFixture(content: string, relativePath = 'characters/test/lorebooks/intro.risulorebook'): Promise<FrontmatterFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-frontmatter-'));
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
  return { filePath, root, workspace: { ok: true, path: root, reason: null } };
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

describe('handleEditFrontmatter', () => {
  it('returns preview with patchPlan and bodyPreserved in preview-only mutation mode', async () => {
    const fixture = await createFrontmatterFixture('---\nenabled: true\npriority: 10\n---\nbody text\n');
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleEditFrontmatter(
      {
        mode: 'commit',
        operations: [{ key: 'priority', kind: 'set', value: '40' }],
        path: 'characters/test/lorebooks/intro.risulorebook',
        preserveBody: true,
      },
      fixture.workspace,
      'preview-only',
      patchStore,
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ bodyPreserved: true, preview: true });

    const afterContent = await readFile(fixture.filePath, 'utf8');
    expect(afterContent).toContain('priority: 10');
  });

  it('applies frontmatter set in enabled commit mode', async () => {
    const fixture = await createFrontmatterFixture('---\nenabled: true\npriority: 10\n---\nbody text\n');
    const patchStore = createPatchPlanStore();

    const result = mutationResult(await handleEditFrontmatter(
      {
        confirmation: { accepted: true },
        mode: 'commit',
        operations: [{ key: 'priority', kind: 'set', value: '40' }],
        path: 'characters/test/lorebooks/intro.risulorebook',
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('applied');
    expect(result.changedFiles).toHaveLength(1);

    const afterContent = await readFile(fixture.filePath, 'utf8');
    expect(afterContent).toContain('priority: 40');
    expect(afterContent).toContain('body text');
  });

  it('rejects unsafe malformed commit without force', async () => {
    const malformedContent = '---\nenabled true\n---\nbody\n';
    const fixture = await createFrontmatterFixture(malformedContent);
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleEditFrontmatter(
      {
        confirmation: { accepted: true },
        mode: 'commit',
        operations: [{ key: 'enabled', kind: 'set', value: 'false' }],
        path: 'characters/test/lorebooks/intro.risulorebook',
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((d) => d.id === 'FRONTMATTER_UNSAFE_COMMIT')).toBe(true);

    const afterContent = await readFile(fixture.filePath, 'utf8');
    expect(afterContent).toBe(malformedContent);
  });

  it('returns preview in preview-only mutation mode', async () => {
    const fixture = await createFrontmatterFixture('---\nenabled: true\n---\nbody\n');
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleEditFrontmatter(
      {
        confirmation: { accepted: true },
        mode: 'commit',
        operations: [{ key: 'enabled', kind: 'set', value: 'false' }],
        path: 'characters/test/lorebooks/intro.risulorebook',
      },
      fixture.workspace,
      'preview-only',
      patchStore,
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ preview: true });
  });

  it('rejects stale expectedHash', async () => {
    const fixture = await createFrontmatterFixture('---\nenabled: true\n---\nbody\n');
    const patchStore = createPatchPlanStore();

    const result = mutationResult(await handleEditFrontmatter(
      {
        confirmation: { accepted: true },
        expectedHash: 'sha256:0000000000000000',
        mode: 'commit',
        operations: [{ key: 'enabled', kind: 'set', value: 'false' }],
        path: 'characters/test/lorebooks/intro.risulorebook',
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('rejected');
  });

  it('edits an existing outside path when explicitly provided', async () => {
    const fixture = await createFrontmatterFixture('---\nenabled: true\n---\nbody\n');
    const patchStore = createPatchPlanStore();

    const outsideDir = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-outside-fm-'));
    const outsideFile = path.join(outsideDir, 'target.txt');
    await writeFile(outsideFile, '---\nenabled: secret\n---\nsecret body\n', 'utf8');

    const outsideRelative = path.relative(fixture.root, outsideFile);

    const result = mutationResult(await handleEditFrontmatter(
      {
        confirmation: { accepted: true },
        mode: 'commit',
        operations: [{ key: 'enabled', kind: 'set', value: 'false' }],
        path: outsideRelative,
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('applied');

    const outsideContent = await readFile(outsideFile, 'utf8');
    expect(outsideContent).toContain('enabled: false');
  });
});
