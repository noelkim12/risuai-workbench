/**
 * Path resolution helpers for MCP file access.
 *
 * Historical note: this module used to enforce a hard workspace boundary. That
 * made the MCP server awkward for non-developer users because the server refused
 * valid Risu workspace files whenever `--root` did not match the user's actual
 * artifact directory. The exported name is kept for API compatibility, but the
 * implementation now resolves paths without root-boundary or symlink-escape
 * rejection. Mutation-specific confirmation/hash/mode gates still live in the
 * mutation layer.
 *
 * @file packages/risuai-workbench-mcp/src/project/safe-path.ts
 */

import { realpath } from 'node:fs/promises';
import path from 'node:path';

import type { WorkspaceRootStatus } from './resolve-root';

export type SafePathIntent = 'create-missing' | 'read-existing' | 'write-existing';

export type SafePathFailureReason =
  | 'absolute-path-rejected'
  | 'empty-path-rejected'
  | 'path-outside-workspace'
  | 'symlink-escape'
  | 'target-missing'
  | 'workspace-root-unavailable';

export type SafePathResult =
  | {
      absolutePath: string;
      ok: true;
      relativePath: string;
      rootPath: string;
    }
  | {
      ok: false;
      reason: SafePathFailureReason;
      rootPath?: string;
    };

export interface ResolveSafeWorkspacePathOptions {
  inputPath: string;
  intent: SafePathIntent;
  workspace: WorkspaceRootStatus;
}

/**
 * isNodeMissing 함수.
 * Node filesystem error가 missing path 계열인지 판정함.
 *
 * @param error - filesystem 호출에서 발생한 unknown error
 * @returns missing path error 여부
 */
function isNodeMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR';
}

/**
 * realpathIfExists 함수.
 * target path의 realpath를 얻고, 없으면 null로 돌려줌.
 *
 * @param targetPath - 검사할 absolute path
 * @returns realpath 또는 null
 */
async function realpathIfExists(targetPath: string): Promise<string | null> {
  try {
    return await realpath(targetPath);
  } catch (error) {
    if (isNodeMissing(error)) {
      return null;
    }

    throw error;
  }
}

/**
 * resolveBasePath 함수.
 * configured workspace가 유효하면 그 realpath를, 아니면 process cwd를 base로 사용함.
 *
 * @param workspace - startup workspace 상태
 * @returns path resolution base
 */
async function resolveBasePath(workspace: WorkspaceRootStatus): Promise<string> {
  if (workspace.ok) {
    return workspace.path;
  }

  return (await realpathIfExists(process.cwd())) ?? process.cwd();
}

/**
 * toPortableDisplayPath 함수.
 * resolved path를 base 기준 상대 경로로 표시하되, base 밖이면 absolute path를 유지함.
 *
 * @param basePath - 표시 기준 path
 * @param absolutePath - resolved absolute path
 * @returns portable display path
 */
function toPortableDisplayPath(basePath: string, absolutePath: string): string {
  const relative = path.relative(basePath, absolutePath);
  if (relative === '') {
    return '.';
  }

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return absolutePath.split(path.sep).join('/');
  }

  return relative.split(path.sep).join('/');
}

/**
 * resolveSafeWorkspacePath 함수.
 * 이름은 기존 handler 호환을 위해 유지하지만, 더 이상 workspace boundary나
 * symlink escape를 거부하지 않는다. 입력 path를 absolute path로 해석하고,
 * read/write-existing intent에서는 대상 존재 여부만 확인한다.
 *
 * @param options - workspace 상태, path input, filesystem intent
 * @returns resolved path 또는 reject 사유
 */
export async function resolveSafeWorkspacePath(options: ResolveSafeWorkspacePathOptions): Promise<SafePathResult> {
  const { inputPath, intent, workspace } = options;
  if (inputPath.trim() === '') {
    return { ok: false, reason: 'empty-path-rejected', rootPath: workspace.path };
  }

  const basePath = await resolveBasePath(workspace);
  const candidatePath = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(basePath, inputPath);

  if (intent === 'create-missing') {
    return {
      absolutePath: candidatePath,
      ok: true,
      relativePath: toPortableDisplayPath(basePath, candidatePath),
      rootPath: basePath,
    };
  }

  const targetRealpath = await realpathIfExists(candidatePath);
  if (!targetRealpath) {
    return { ok: false, reason: 'target-missing', rootPath: basePath };
  }

  return {
    absolutePath: targetRealpath,
    ok: true,
    relativePath: toPortableDisplayPath(basePath, targetRealpath),
    rootPath: basePath,
  };
}
