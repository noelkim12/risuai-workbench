/**
 * Path resolution tests for MCP mutation foundations.
 * @file packages/risuai-workbench-mcp/tests/project/safe-path.test.ts
 */

import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { computeFileHash } from '../../src/mutation/file-hash';
import { createStartupContext } from '../../src/server';
import { resolveSafeWorkspacePath } from '../../src/project/safe-path';

/**
 * createWorkspaceFixture 함수.
 * safe-path 테스트용 temp workspace와 source artifact fixture를 구성함.
 *
 * @returns temp workspace와 주요 fixture 경로
 */
async function createWorkspaceFixture(): Promise<{ outsideFile: string; root: string; sourceRelativePath: string }> {
  const actualRoot = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-safe-'));
  const sourceRelativePath = 'characters/merry/lorebooks/intro.risulorebook';
  await mkdir(path.join(actualRoot, 'characters', 'merry', 'lorebooks'), { recursive: true });
  await writeFile(path.join(actualRoot, sourceRelativePath), 'intro lorebook\n', 'utf8');

  const outsideRoot = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-outside-'));
  const outsideFile = path.join(outsideRoot, 'escape.md');
  await writeFile(outsideFile, 'outside sentinel\n', 'utf8');

  return { outsideFile, root: actualRoot, sourceRelativePath };
}

describe('resolveSafeWorkspacePath', () => {
  it('resolves traversal paths instead of enforcing a workspace boundary', async () => {
    const fixture = await createWorkspaceFixture();
    const context = await createStartupContext({ root: fixture.root });

    const result = await resolveSafeWorkspacePath({
      inputPath: '../escape.md',
      intent: 'write-existing',
      workspace: context.workspace,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected missing traversal target to be reported.');
    expect(result.reason).toBe('target-missing');
  });

  it('accepts absolute paths outside the configured workspace root', async () => {
    const fixture = await createWorkspaceFixture();
    const context = await createStartupContext({ root: fixture.root });

    const result = await resolveSafeWorkspacePath({
      inputPath: fixture.outsideFile,
      intent: 'read-existing',
      workspace: context.workspace,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected absolute outside path to be resolved.');
    expect(result.absolutePath).toBe(fixture.outsideFile);
    expect(result.relativePath).toBe(fixture.outsideFile.split(path.sep).join('/'));
  });

  it('accepts absolute paths inside the workspace root', async () => {
    const fixture = await createWorkspaceFixture();
    const context = await createStartupContext({ root: fixture.root });

    const absoluteInsidePath = path.join(fixture.root, fixture.sourceRelativePath);
    const result = await resolveSafeWorkspacePath({
      inputPath: absoluteInsidePath,
      intent: 'read-existing',
      workspace: context.workspace,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected in-workspace absolute path to pass.');
    expect(result.relativePath).toBe('characters/merry/lorebooks/intro.risulorebook');
  });

  it('resolves symlink targets instead of rejecting symlink escape', async () => {
    const fixture = await createWorkspaceFixture();
    const linkPath = path.join(fixture.root, 'linked-outside.md');
    await symlink(fixture.outsideFile, linkPath);
    const beforeHash = await computeFileHash(fixture.outsideFile);
    const context = await createStartupContext({ root: fixture.root });

    const readResult = await resolveSafeWorkspacePath({
      inputPath: 'linked-outside.md',
      intent: 'read-existing',
      workspace: context.workspace,
    });
    const writeResult = await resolveSafeWorkspacePath({
      inputPath: 'linked-outside.md',
      intent: 'write-existing',
      workspace: context.workspace,
    });
    const after = await readFile(fixture.outsideFile, 'utf8');
    const afterHash = await computeFileHash(fixture.outsideFile);

    expect(readResult.ok).toBe(true);
    if (!readResult.ok) throw new Error('Expected symlink read to resolve.');
    expect(readResult.absolutePath).toBe(fixture.outsideFile);
    expect(writeResult.ok).toBe(true);
    if (!writeResult.ok) throw new Error('Expected symlink write to resolve.');
    expect(writeResult.absolutePath).toBe(fixture.outsideFile);
    expect(after).toBe('outside sentinel\n');
    expect(afterHash).toBe(beforeHash);
  });

  it('falls back to process cwd when the configured workspace root is missing', async () => {
    const fixture = await createWorkspaceFixture();
    const missingRoot = path.join(fixture.root, 'missing-root');
    const context = await createStartupContext({ root: missingRoot });

    const result = await resolveSafeWorkspacePath({
      inputPath: 'characters/merry/lorebooks/intro.risulorebook',
      intent: 'write-existing',
      workspace: context.workspace,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected unresolved relative path to be missing.');
    expect(result.reason).toBe('target-missing');
  });

  it('allows an in-workspace source artifact path when mutation mode is enabled', async () => {
    const fixture = await createWorkspaceFixture();
    const context = await createStartupContext({ root: fixture.root });

    const result = await resolveSafeWorkspacePath({
      inputPath: fixture.sourceRelativePath,
      intent: 'write-existing',
      workspace: context.workspace,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected in-workspace fixture path to pass.');
    expect(result.relativePath).toBe('characters/merry/lorebooks/intro.risulorebook');
  });
});
