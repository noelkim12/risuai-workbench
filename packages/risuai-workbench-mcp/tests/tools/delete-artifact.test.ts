/**
 * Tests for delete_artifact deletion behavior.
 * @file packages/risuai-workbench-mcp/tests/tools/delete-artifact.test.ts
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleDeleteArtifact } from '../../src/tools/mutation/delete-artifact';

interface DeleteFixture {
  artifactPath: string;
  orderPath: string;
  root: string;
  workspace: WorkspaceRootStatus;
}

/**
 * createDeleteFixture 함수.
 * delete_artifact tests가 쓰는 isolated temp workspace를 구성함.
 *
 * @returns delete fixture paths
 */
async function createDeleteFixture(): Promise<DeleteFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-delete-'));
  const lorebookDir = path.join(root, 'lorebooks');
  const artifactPath = path.join(lorebookDir, 'unused.risulorebook');
  const orderPath = path.join(lorebookDir, '_order.json');
  await mkdir(lorebookDir, { recursive: true });
  await writeFile(artifactPath, '---\nname: unused\n---\nbody\n', 'utf8');
  await writeFile(orderPath, `${JSON.stringify(['unused.risulorebook', 'keep.risulorebook'], null, 2)}\n`, 'utf8');
  return { artifactPath, orderPath, root, workspace: { ok: true, path: root, reason: null } };
}

/**
 * hashFile 함수.
 * 파일 내용을 sha256으로 요약함.
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

describe('handleDeleteArtifact', () => {
  it('deletes without confirmation', async () => {
    const missingFixture = await createDeleteFixture();
    const wrongFixture = await createDeleteFixture();

    const missing = mutationResult(await handleDeleteArtifact(
      { mode: 'commit', path: 'lorebooks/unused.risulorebook', updateOrder: true },
      missingFixture.workspace,
      'enabled',
    ));
    const wrong = mutationResult(await handleDeleteArtifact(
      { mode: 'commit', path: 'lorebooks/unused.risulorebook', updateOrder: true },
      wrongFixture.workspace,
      'enabled',
    ));

    expect(missing.status).toBe('applied');
    expect(wrong.status).toBe('applied');
    await expect(readFile(missingFixture.artifactPath, 'utf8')).rejects.toThrow();
    await expect(readFile(wrongFixture.artifactPath, 'utf8')).rejects.toThrow();
  });

  it('deletes and cleans order when requested', async () => {
    const fixture = await createDeleteFixture();

    const result = mutationResult(await handleDeleteArtifact(
      { createBackup: true, mode: 'commit', path: 'lorebooks/unused.risulorebook', updateOrder: true },
      fixture.workspace,
      'enabled',
    ));

    expect(result.status).toBe('applied');
    await expect(readFile(fixture.artifactPath, 'utf8')).rejects.toThrow();
    expect(JSON.parse(await readFile(fixture.orderPath, 'utf8'))).toEqual(['keep.risulorebook']);
  });
});
