/**
 * Mutation mode, confirmation, hash, and journal foundation tests.
 * @file packages/risuai-workbench-mcp/tests/mutation/mutation-policy.test.ts
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { computeFileHash, verifyFileHashPrecondition } from '../../src/mutation/file-hash';
import { appendJournalEntry, readJournalEntries, type MutationJournalStatus } from '../../src/mutation/journal';
import { evaluateMutationSafetyGate } from '../../src/mutation/safety-gate';
import { createStartupContext } from '../../src/server';

/**
 * createMutationFixture 함수.
 * mutation policy 테스트용 temp workspace를 구성함.
 *
 * @returns temp workspace root와 source/generated fixture 경로
 */
async function createMutationFixture(): Promise<{ generatedPath: string; root: string; sourcePath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-mutation-'));
  await mkdir(path.join(root, 'characters', 'merry', 'lorebooks'), { recursive: true });
  await mkdir(path.join(root, 'wiki', 'artifacts', 'merry', '_generated'), { recursive: true });
  const sourcePath = 'characters/merry/lorebooks/intro.risulorebook';
  const generatedPath = 'wiki/artifacts/merry/_generated/summary.md';
  await writeFile(path.join(root, sourcePath), 'source artifact\n', 'utf8');
  await writeFile(path.join(root, generatedPath), 'generated wiki\n', 'utf8');
  return { generatedPath, root, sourcePath };
}

describe('mutation mode safety gate', () => {
  it('keeps preview-only as the default and blocks writes through the shared foundation', async () => {
    const fixture = await createMutationFixture();
    const context = await createStartupContext({ root: fixture.root });

    const result = await evaluateMutationSafetyGate({
      mode: context.mutationMode,
      targets: [{ intent: 'write-existing', path: fixture.generatedPath }],
      toolName: 'workbench.refresh_wiki',
      workspace: context.workspace,
    });

    expect(context.mutationMode).toBe('preview-only');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected preview-only mutation to be rejected.');
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('mutation-mode-preview-only');
  });

  it('rejects source artifact paths in generated-only mode', async () => {
    const fixture = await createMutationFixture();
    const context = await createStartupContext({ root: fixture.root });

    const result = await evaluateMutationSafetyGate({
      mode: 'generated-only',
      targets: [{ intent: 'write-existing', path: fixture.sourcePath }],
      toolName: 'workbench.refresh_wiki',
      workspace: context.workspace,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected generated-only source path to be rejected.');
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('generated-only-target-rejected');
  });

  it('allows generated wiki paths in generated-only mode and source paths in enabled mode', async () => {
    const fixture = await createMutationFixture();
    const context = await createStartupContext({ root: fixture.root });

    const generatedResult = await evaluateMutationSafetyGate({
      mode: 'generated-only',
      targets: [{ intent: 'write-existing', path: fixture.generatedPath }],
      toolName: 'workbench.refresh_wiki',
      workspace: context.workspace,
    });
    const enabledResult = await evaluateMutationSafetyGate({
      mode: 'enabled',
      targets: [{ intent: 'write-existing', path: fixture.sourcePath }],
      toolName: 'workbench.edit_order',
      workspace: context.workspace,
    });

    expect(generatedResult.ok).toBe(true);
    expect(enabledResult.ok).toBe(true);
  });
});

describe('confirmation policy', () => {
  it('rejects missing, wrong, and accepts exact high-risk confirmation text', async () => {
    const fixture = await createMutationFixture();
    const context = await createStartupContext({ root: fixture.root });
    const base = {
      expectedConfirmationText: 'DELETE characters/merry/lorebooks/intro.risulorebook',
      mode: 'enabled' as const,
      risk: 'high' as const,
      targets: [{ intent: 'write-existing' as const, path: fixture.sourcePath }],
      toolName: 'workbench.delete_artifact',
      workspace: context.workspace,
    };

    const missing = await evaluateMutationSafetyGate(base);
    const wrong = await evaluateMutationSafetyGate({
      ...base,
      confirmation: { accepted: true, confirmationText: 'DELETE wrong-path' },
    });
    const exact = await evaluateMutationSafetyGate({
      ...base,
      confirmation: { accepted: true, confirmationText: 'DELETE characters/merry/lorebooks/intro.risulorebook' },
    });

    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error('Expected missing high-risk confirmation to be rejected.');
    expect(missing.reason).toBe('confirmation-missing');
    expect(wrong.ok).toBe(false);
    if (wrong.ok) throw new Error('Expected wrong high-risk confirmation to be rejected.');
    expect(wrong.reason).toBe('confirmation-text-mismatch');
    expect(exact.ok).toBe(true);
  });
});

describe('file hash preconditions', () => {
  it('accepts matching hashes and rejects stale hashes', async () => {
    const fixture = await createMutationFixture();
    const target = path.join(fixture.root, fixture.sourcePath);
    const expectedHash = await computeFileHash(target);

    const matching = await verifyFileHashPrecondition({ expectedHash, operation: 'update', targetPath: target });
    await writeFile(target, 'source artifact changed\n', 'utf8');
    const stale = await verifyFileHashPrecondition({ expectedHash, operation: 'update', targetPath: target });

    expect(matching.ok).toBe(true);
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error('Expected stale source hash to be rejected.');
    expect(stale.reason).toBe('hash-stale');
  });

  it('rejects missing update targets and allows create-if-not-exists targets', async () => {
    const fixture = await createMutationFixture();
    const missingTarget = path.join(fixture.root, 'wiki', 'artifacts', 'merry', '_generated', 'new.md');

    const update = await verifyFileHashPrecondition({ expectedHash: 'sha256:missing', operation: 'update', targetPath: missingTarget });
    const create = await verifyFileHashPrecondition({ operation: 'create', targetPath: missingTarget });

    expect(update.ok).toBe(false);
    if (update.ok) throw new Error('Expected missing update target to be rejected.');
    expect(update.reason).toBe('target-missing');
    expect(create.ok).toBe(true);
    expect(create.currentHash).toBe(null);
  });
});

describe('append-only mutation journal', () => {
  it('writes and reads all foundation statuses without compaction', async () => {
    const fixture = await createMutationFixture();
    const statuses: MutationJournalStatus[] = ['previewed', 'rejected', 'failed-precondition', 'applied', 'failed-validation'];
    const journalPath = path.join(fixture.root, '.risuai-workbench-mcp', 'journal.jsonl');

    for (const status of statuses) {
      await appendJournalEntry(journalPath, {
        affectedFiles: [fixture.sourcePath],
        mutationId: `mutation:${status}`,
        status,
        toolName: 'workbench.test',
      });
    }

    const raw = await readFile(journalPath, 'utf8');
    const entries = await readJournalEntries(journalPath);

    expect(raw.trim().split('\n')).toHaveLength(statuses.length);
    expect(entries.map((entry) => entry.status)).toEqual(statuses);
  });
});
