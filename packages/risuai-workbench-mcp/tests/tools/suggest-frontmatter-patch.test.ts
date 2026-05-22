/**
 * Tests for suggest_frontmatter_patch preview-only handler.
 * @file packages/risuai-workbench-mcp/tests/tools/suggest-frontmatter-patch.test.ts
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { handleSuggestFrontmatterPatch } from '../../src/tools/patch/suggest-frontmatter-patch';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';

const FM_ROOT = path.resolve(__dirname, '../fixtures/workspaces/frontmatter-test');
const MALFORMED_RELATIVE_PATH = 'characters/fm/lorebooks/malformed-field.risulorebook';
const VALID_RELATIVE_PATH = 'characters/fm/lorebooks/valid.risulorebook';
const MALFORMED_ABSOLUTE_PATH = path.join(FM_ROOT, MALFORMED_RELATIVE_PATH);
const JOURNAL_ABSOLUTE_PATH = path.join(FM_ROOT, '.risuai-workbench-mcp', 'journal.jsonl');

/**
 * makeOkWorkspace 함수.
 * fixture root를 WorkspaceRootStatus로 감쌈.
 *
 * @param dir - fixture workspace root
 * @returns ok workspace status
 */
function makeOkWorkspace(dir: string): WorkspaceRootStatus {
  return { ok: true, path: path.resolve(dir), reason: null };
}

/**
 * hashFile 함수.
 * preview 호출 전후 no-write 검증용 digest를 계산함.
 *
 * @param filePath - 검사할 파일 path
 * @returns sha256 hex digest
 */
async function hashFile(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

/**
 * fileExists 함수.
 * journal 같은 side-effect 파일 생성 여부를 확인함.
 *
 * @param filePath - 확인할 파일 path
 * @returns 파일 존재 여부
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') return false;
    throw error;
  }
}

describe('handleSuggestFrontmatterPatch', () => {
  it('malformed: returns repair preview only, preserves body, and writes nothing', async () => {
    const workspace = makeOkWorkspace(FM_ROOT);
    const beforeText = await readFile(MALFORMED_ABSOLUTE_PATH, 'utf8');
    const beforeHash = await hashFile(MALFORMED_ABSOLUTE_PATH);
    const journalExistedBefore = await fileExists(JOURNAL_ABSOLUTE_PATH);

    const result = await handleSuggestFrontmatterPatch(
      { path: MALFORMED_RELATIVE_PATH, set: { name: 'fixed-name' } },
      workspace,
    );

    const afterText = await readFile(MALFORMED_ABSOLUTE_PATH, 'utf8');
    const afterHash = await hashFile(MALFORMED_ABSOLUTE_PATH);
    const journalExistedAfter = await fileExists(JOURNAL_ABSOLUTE_PATH);

    expect(result.tool).toBe('workbench.suggest_frontmatter_patch');
    expect(result.status).toBe('domain_warning');
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'FRONTMATTER_REPAIR_PREVIEW')).toBe(true);
    expect(afterText).toBe(beforeText);
    expect(afterHash).toBe(beforeHash);
    expect(journalExistedAfter).toBe(journalExistedBefore);

    const data = result.data as { bodyPreserved: boolean; patchPlan: { operations: Array<{ kind: string; path?: string }>; preconditions: Array<{ kind: string; expectedHash?: string }>; preview: { affectedFiles: Array<{ path: string }>; unifiedDiff: string } }; previewText: string; repairPreviewOnly: boolean };
    expect(data.repairPreviewOnly).toBe(true);
    expect(data.bodyPreserved).toBe(true);
    expect(data.previewText.endsWith('body text\n')).toBe(true);
    expect(data.previewText).not.toContain('missing colon line');
    expect(data.patchPlan.operations.map((operation) => operation.kind)).toContain('frontmatter.set');
    expect(data.patchPlan.operations.map((operation) => operation.kind)).toContain('text.replace');
    expect(data.patchPlan.preconditions.some((precondition) => precondition.kind === 'file.hash' && precondition.expectedHash?.startsWith('sha256:'))).toBe(true);
    expect(data.patchPlan.preview.affectedFiles[0].path).toBe(MALFORMED_RELATIVE_PATH);
  });

  it('returns structured frontmatter operation for valid frontmatter', async () => {
    const workspace = makeOkWorkspace(FM_ROOT);
    const result = await handleSuggestFrontmatterPatch(
      { path: VALID_RELATIVE_PATH, set: { name: 'renamed' } },
      workspace,
    );

    const data = result.data as { bodyPreserved: boolean; patchPlan: { operations: Array<{ kind: string; path?: string }> }; previewText: string };
    expect(result.status).toBe('ok');
    expect(data.bodyPreserved).toBe(true);
    expect(data.previewText).toContain('name: renamed');
    expect(data.previewText.endsWith('frontmatter test body\n')).toBe(true);
    expect(data.patchPlan.operations.some((operation) => operation.kind === 'frontmatter.set' && operation.path === VALID_RELATIVE_PATH)).toBe(true);
  });
});
