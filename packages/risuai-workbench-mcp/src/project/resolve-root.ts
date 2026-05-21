/**
 * Workspace root resolution helpers for MCP project boundaries.
 * @file packages/risuai-workbench-mcp/src/project/resolve-root.ts
 */

import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export type WorkspaceRootStatus =
  | {
      ok: true;
      path: string;
      reason: null;
    }
  | {
      ok: false;
      path: string;
      reason: 'root-not-found' | 'root-not-directory';
    };

/**
 * resolveWorkspaceRoot 함수.
 * MCP startup root를 절대 realpath로 해석하고 directory 여부를 검증함.
 *
 * @param root - CLI에서 받은 workspace root 후보
 * @returns mutation 없이 계산한 workspace root 상태
 */
export async function resolveWorkspaceRoot(root: string = process.cwd()): Promise<WorkspaceRootStatus> {
  const resolvedRoot = path.resolve(root);

  try {
    const stats = await stat(resolvedRoot);
    if (!stats.isDirectory()) {
      return { ok: false, path: resolvedRoot, reason: 'root-not-directory' };
    }

    return { ok: true, path: await realpath(resolvedRoot), reason: null };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return { ok: false, path: resolvedRoot, reason: 'root-not-found' };
    }

    throw error;
  }
}
