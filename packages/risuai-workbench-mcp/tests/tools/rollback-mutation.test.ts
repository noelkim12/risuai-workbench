/**
 * Tests for rollback_mutation confirmation-disabled behavior.
 * @file packages/risuai-workbench-mcp/tests/tools/rollback-mutation.test.ts
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import { computeFileHash } from '../../src/mutation/file-hash';
import { appendJournalEntry, readJournalEntries } from '../../src/mutation/journal';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleRollbackMutation } from '../../src/tools/mutation/rollback-mutation';

interface RollbackFixture {
  journalPath: string;
  movedPath: string;
  mutationId: string;
  originalPath: string;
  workspace: WorkspaceRootStatus;
}

/**
 * createRollbackFixture 함수.
 * rollback 가능한 move-back journal scenario를 isolated temp workspace에 구성함.
 *
 * @returns rollback fixture paths and mutation id
 */
async function createRollbackFixture(): Promise<RollbackFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-rollback-'));
  const lorebookDir = path.join(root, 'characters', 'merry', 'lorebooks');
  const movedPath = path.join(lorebookDir, 'renamed.risulorebook');
  const originalPath = path.join(lorebookDir, 'intro.risulorebook');
  const journalPath = path.join(root, '.risuai-workbench-mcp', 'journal.jsonl');
  const mutationId = 'mutation:test:move-artifact';
  const workspace: WorkspaceRootStatus = { ok: true, path: root, reason: null };
  await mkdir(lorebookDir, { recursive: true });
  await writeFile(movedPath, '---\nname: intro\n---\nbody\n', 'utf8');
  const movedHash = await computeFileHash(movedPath);
  await appendJournalEntry(journalPath, {
    affectedFiles: ['characters/merry/lorebooks/intro.risulorebook', 'characters/merry/lorebooks/renamed.risulorebook'],
    changedFiles: [{ beforeHash: movedHash, operationCount: 1, path: 'characters/merry/lorebooks/intro.risulorebook' }, { afterHash: movedHash, operationCount: 1, path: 'characters/merry/lorebooks/renamed.risulorebook' }],
    mutationId,
    patchOperations: [{ from: 'characters/merry/lorebooks/intro.risulorebook', kind: 'file.move', to: 'characters/merry/lorebooks/renamed.risulorebook' }],
    postValidation: { diagnostics: [], status: 'ok' },
    rollbackAvailable: true,
    rollbackData: { expectedCurrentHash: movedHash, from: 'characters/merry/lorebooks/renamed.risulorebook', kind: 'move-back', to: 'characters/merry/lorebooks/intro.risulorebook' },
    status: 'applied',
    toolName: 'workbench.move_artifact',
  });
  return { journalPath, movedPath, mutationId, originalPath, workspace };
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

describe('handleRollbackMutation', () => {
  it('rolls back without confirmation', async () => {
    const missingFixture = await createRollbackFixture();
    const wrongFixture = await createRollbackFixture();

    const missing = mutationResult(await handleRollbackMutation(
      { mode: 'commit', mutationId: missingFixture.mutationId },
      missingFixture.workspace,
      'enabled',
    ));
    const wrong = mutationResult(await handleRollbackMutation(
      { mode: 'commit', mutationId: wrongFixture.mutationId },
      wrongFixture.workspace,
      'enabled',
    ));

    expect(missing.status).toBe('applied');
    expect(wrong.status).toBe('applied');
    await expect(readFile(missingFixture.movedPath, 'utf8')).rejects.toThrow();
    await expect(readFile(wrongFixture.movedPath, 'utf8')).rejects.toThrow();
    expect(await readFile(missingFixture.originalPath, 'utf8')).toContain('name: intro');
    expect(await readFile(wrongFixture.originalPath, 'utf8')).toContain('name: intro');
    expect(await readJournalEntries(missingFixture.journalPath)).toHaveLength(2);
    expect(await readJournalEntries(wrongFixture.journalPath)).toHaveLength(2);
  });
});
