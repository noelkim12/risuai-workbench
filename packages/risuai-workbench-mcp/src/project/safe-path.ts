/**
 * Symlink-aware safe relative path resolution for workspace file access.
 * @file packages/risuai-workbench-mcp/src/project/safe-path.ts
 */

import { lstat, realpath } from 'node:fs/promises';
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
 * isInsideOrEqual 함수.
 * candidate가 root 내부 또는 root 자체인지 path separator 경계로 검증함.
 *
 * @param root - 기준 workspace root
 * @param candidate - 검사할 절대 경로
 * @returns workspace boundary 내부 여부
 */
function isInsideOrEqual(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * toSafeRelativePath 함수.
 * 사용자 입력 path를 workspace-relative portable path로 정규화함.
 *
 * @param inputPath - tool input으로 받은 path 값
 * @returns 정규화된 상대 경로 또는 reject 사유
 */
function toSafeRelativePath(inputPath: string): { ok: true; relativePath: string } | { ok: false; reason: SafePathFailureReason } {
  if (inputPath.trim() === '') {
    return { ok: false, reason: 'empty-path-rejected' };
  }

  if (path.isAbsolute(inputPath)) {
    return { ok: false, reason: 'absolute-path-rejected' };
  }

  const normalized = path.normalize(inputPath);
  if (normalized === '.' || normalized === '') {
    return { ok: false, reason: 'empty-path-rejected' };
  }

  return { ok: true, relativePath: normalized.split(path.sep).join('/') };
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
 * findExistingAncestorRealpath 함수.
 * create 대상의 가장 가까운 기존 ancestor를 realpath로 해석함.
 *
 * @param rootPath - workspace root absolute path
 * @param targetPath - create 대상 absolute path
 * @returns 기존 ancestor realpath 또는 null
 */
async function findExistingAncestorRealpath(rootPath: string, targetPath: string): Promise<string | null> {
  let currentPath = targetPath;

  while (isInsideOrEqual(rootPath, currentPath)) {
    const currentRealpath = await realpathIfExists(currentPath);
    if (currentRealpath) {
      return currentRealpath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }

  return null;
}

/**
 * hasSymlinkAtTarget 함수.
 * target 자체가 symlink인지 best-effort로 판정함.
 *
 * @param targetPath - 검사할 absolute path
 * @returns target symlink 여부
 */
async function hasSymlinkAtTarget(targetPath: string): Promise<boolean> {
  try {
    return (await lstat(targetPath)).isSymbolicLink();
  } catch (error) {
    if (isNodeMissing(error)) {
      return false;
    }

    throw error;
  }
}

/**
 * resolveSafeWorkspacePath 함수.
 * workspace-relative path를 symlink-aware absolute path로 해석하고 boundary를 검증함.
 *
 * @param options - workspace 상태, path input, filesystem intent
 * @returns 안전한 path 또는 reject 사유
 */
export async function resolveSafeWorkspacePath(options: ResolveSafeWorkspacePathOptions): Promise<SafePathResult> {
  const { inputPath, intent, workspace } = options;
  if (!workspace.ok) {
    return { ok: false, reason: 'workspace-root-unavailable', rootPath: workspace.path };
  }

  const relativeResult = toSafeRelativePath(inputPath);
  if (!relativeResult.ok) {
    return { ok: false, reason: relativeResult.reason, rootPath: workspace.path };
  }

  const rootRealpath = await realpath(workspace.path);
  const candidatePath = path.resolve(rootRealpath, relativeResult.relativePath);
  if (!isInsideOrEqual(rootRealpath, candidatePath)) {
    return { ok: false, reason: 'path-outside-workspace', rootPath: rootRealpath };
  }

  if (intent === 'create-missing') {
    const existingTargetRealpath = await realpathIfExists(candidatePath);
    if (existingTargetRealpath && !isInsideOrEqual(rootRealpath, existingTargetRealpath)) {
      return { ok: false, reason: 'symlink-escape', rootPath: rootRealpath };
    }

    const ancestorRealpath = await findExistingAncestorRealpath(rootRealpath, candidatePath);
    if (!ancestorRealpath || !isInsideOrEqual(rootRealpath, ancestorRealpath)) {
      return { ok: false, reason: 'symlink-escape', rootPath: rootRealpath };
    }

    return {
      absolutePath: candidatePath,
      ok: true,
      relativePath: path.relative(rootRealpath, candidatePath).split(path.sep).join('/'),
      rootPath: rootRealpath,
    };
  }

  const targetRealpath = await realpathIfExists(candidatePath);
  if (!targetRealpath) {
    return { ok: false, reason: 'target-missing', rootPath: rootRealpath };
  }

  if (!isInsideOrEqual(rootRealpath, targetRealpath)) {
    return { ok: false, reason: (await hasSymlinkAtTarget(candidatePath)) ? 'symlink-escape' : 'path-outside-workspace', rootPath: rootRealpath };
  }

  return {
    absolutePath: targetRealpath,
    ok: true,
    relativePath: path.relative(rootRealpath, targetRealpath).split(path.sep).join('/'),
    rootPath: rootRealpath,
  };
}
