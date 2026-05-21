/**
 * Tests for suggest_order_patch preview-only handler.
 * @file packages/risuai-workbench-mcp/tests/tools/suggest-order-patch.test.ts
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { handleSuggestOrderPatch } from '../../src/tools/suggest-order-patch';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';

const STANDARD_ROOT = path.resolve(__dirname, '../fixtures/workspaces/standard');
const ORDER_RELATIVE_PATH = 'characters/merry/lorebooks/_order.json';
const ORDER_ABSOLUTE_PATH = path.join(STANDARD_ROOT, ORDER_RELATIVE_PATH);
const JOURNAL_ABSOLUTE_PATH = path.join(STANDARD_ROOT, '.risuai-workbench-mcp', 'journal.jsonl');

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

describe('handleSuggestOrderPatch', () => {
  it('creates structured order patch preview with no file or journal writes', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const beforeOrderHash = await hashFile(ORDER_ABSOLUTE_PATH);
    const journalExistedBefore = await fileExists(JOURNAL_ABSOLUTE_PATH);

    const result = await handleSuggestOrderPatch(
      {
        directory: 'characters/merry/lorebooks',
        operations: [
          { entry: 'background.risulorebook', kind: 'move', toIndex: 0 },
          { entry: 'afterword.risulorebook', index: 2, kind: 'insert' },
        ],
      },
      workspace,
    );

    const afterOrderHash = await hashFile(ORDER_ABSOLUTE_PATH);
    const journalExistedAfter = await fileExists(JOURNAL_ABSOLUTE_PATH);

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.suggest_order_patch');
    expect(result.status).toBe('ok');
    expect(afterOrderHash).toBe(beforeOrderHash);
    expect(journalExistedAfter).toBe(journalExistedBefore);

    const data = result.data as { patchPlan: { operations: Array<{ kind: string; orderPath?: string }>; preconditions: Array<{ kind: string; expectedHash?: string }>; preview: { affectedFiles: Array<{ path: string }>; resourceLinks: string[] } }; previewOrder: string[] };
    expect(data.patchPlan.operations.map((operation) => operation.kind)).toEqual(['order.move', 'order.insert']);
    expect(data.patchPlan.operations.every((operation) => operation.orderPath === ORDER_RELATIVE_PATH)).toBe(true);
    expect(data.patchPlan.preconditions.some((precondition) => precondition.kind === 'file.hash' && precondition.expectedHash?.startsWith('sha256:'))).toBe(true);
    expect(data.patchPlan.preconditions.some((precondition) => precondition.kind === 'path.inside-workspace')).toBe(true);
    expect(data.patchPlan.preview.affectedFiles).toEqual([{ operationKinds: ['order.insert', 'order.move'], path: ORDER_RELATIVE_PATH }]);
    expect(data.patchPlan.preview.resourceLinks[0]).toContain('risuai-workbench://mutations/patch-plans/');
    expect(data.previewOrder).toEqual(['background.risulorebook', 'intro.risulorebook', 'afterword.risulorebook']);
  });
});
