/**
 * Tests for move_artifact confirmation-disabled behavior.
 * @file packages/risuai-workbench-mcp/tests/tools/move-artifact.test.ts
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleMoveArtifact } from '../../src/tools/mutation/move-artifact';

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
  it('accepts missing or wrong confirmation because confirmation gate is disabled', async () => {
    const missingFixture = await createMoveFixture();
    const wrongFixture = await createMoveFixture();

    const missing = mutationResult(await handleMoveArtifact(
      { from: 'characters/merry/lorebooks/intro.risulorebook', mode: 'commit', toStem: 'renamed', updateOrder: true },
      missingFixture.workspace,
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
      wrongFixture.workspace,
      'enabled',
    ));

    expect(missing.status).toBe('applied');
    expect(wrong.status).toBe('applied');
    await expect(readFile(missingFixture.sourcePath, 'utf8')).rejects.toThrow();
    await expect(readFile(wrongFixture.sourcePath, 'utf8')).rejects.toThrow();
    expect(await readFile(missingFixture.destinationPath, 'utf8')).toContain('name: intro');
    expect(await readFile(wrongFixture.destinationPath, 'utf8')).toContain('name: intro');
  });
});
