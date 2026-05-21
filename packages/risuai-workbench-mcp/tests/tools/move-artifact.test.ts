/**
 * Tests for move_artifact high-risk confirmation rejection paths.
 * @file packages/risuai-workbench-mcp/tests/tools/move-artifact.test.ts
 */

import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleMoveArtifact } from '../../src/tools/move-artifact';

interface MoveFixture {
  destinationPath: string;
  orderPath: string;
  sourcePath: string;
  workspace: WorkspaceRootStatus;
}

/**
 * createMoveFixture 함수.
 * move_artifact confirmation tests용 isolated temp workspace를 구성함.
 *
 * @returns move fixture paths and workspace status
 */
async function createMoveFixture(): Promise<MoveFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-move-'));
  const lorebookDir = path.join(root, 'characters', 'merry', 'lorebooks');
  const sourcePath = path.join(lorebookDir, 'intro.risulorebook');
  const destinationPath = path.join(lorebookDir, 'renamed.risulorebook');
  const orderPath = path.join(lorebookDir, '_order.json');
  await mkdir(lorebookDir, { recursive: true });
  await writeFile(sourcePath, '---\nname: intro\n---\nbody\n', 'utf8');
  await writeFile(orderPath, `${JSON.stringify(['intro.risulorebook', 'keep.risulorebook'], null, 2)}\n`, 'utf8');
  return { destinationPath, orderPath, sourcePath, workspace: { ok: true, path: root, reason: null } };
}

/**
 * hashFile 함수.
 * 파일 내용을 sha256 digest로 요약함.
 *
 * @param filePath - hash 대상 absolute file path
 * @returns sha256 digest
 */
async function hashFile(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

/**
 * mutationResult 함수.
 * handler union result를 mutation result로 좁힘.
 *
 * @param result - handler 반환값
 * @returns mutation result envelope
 */
function mutationResult(result: DiagnosticEnvelope | MutationResultEnvelope): MutationResultEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') throw new Error(`Expected mutation result, got ${result.schema}`);
  return result;
}

describe('handleMoveArtifact', () => {
  it('confirmation: rejects missing/wrong exact confirmation before moving files or order entries', async () => {
    const fixture = await createMoveFixture();
    const beforeSourceHash = await hashFile(fixture.sourcePath);
    const beforeOrderHash = await hashFile(fixture.orderPath);
    const beforeOrderContent = await readFile(fixture.orderPath, 'utf8');

    const missing = mutationResult(await handleMoveArtifact(
      { from: 'characters/merry/lorebooks/intro.risulorebook', mode: 'commit', toStem: 'renamed', updateOrder: true },
      fixture.workspace,
      'enabled',
    ));
    const wrong = mutationResult(await handleMoveArtifact(
      {
        confirmation: { accepted: true, confirmationText: 'MOVE characters/merry/lorebooks/intro.risulorebook TO characters/merry/lorebooks/other.risulorebook' },
        from: 'characters/merry/lorebooks/intro.risulorebook',
        mode: 'commit',
        toStem: 'renamed',
        updateOrder: true,
      },
      fixture.workspace,
      'enabled',
    ));

    expect(missing.status).toBe('rejected');
    expect(wrong.status).toBe('rejected');
    expect(missing.postValidation.diagnostics[0]?.ruleId).toBe('move-artifact.confirmation-missing');
    expect(wrong.postValidation.diagnostics[0]?.ruleId).toBe('move-artifact.confirmation-text-mismatch');
    expect(await hashFile(fixture.sourcePath)).toBe(beforeSourceHash);
    await expect(readFile(fixture.destinationPath, 'utf8')).rejects.toThrow();
    expect(await hashFile(fixture.orderPath)).toBe(beforeOrderHash);
    expect(await readFile(fixture.orderPath, 'utf8')).toBe(beforeOrderContent);
  });
});
