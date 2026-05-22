/**
 * File hash and source precondition helpers for MCP mutations.
 * @file packages/risuai-workbench-mcp/src/mutation/file-hash.ts
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export type HashPreconditionOperation = 'create' | 'update';

export type HashPreconditionResult =
  | {
      currentHash: string | null;
      ok: true;
    }
  | {
      currentHash: string | null;
      ok: false;
      reason: 'hash-missing' | 'hash-stale' | 'target-exists' | 'target-missing';
    };

export interface VerifyFileHashPreconditionOptions {
  expectedHash?: string;
  operation: HashPreconditionOperation;
  targetPath: string;
}

/**
 * computeFileHash 함수.
 * 파일 내용을 sha256 source hash 문자열로 계산함.
 *
 * @param targetPath - hash를 계산할 absolute file path
 * @returns `sha256:<hex>` 형식의 파일 hash
 */
export async function computeFileHash(targetPath: string): Promise<string> {
  const content = await readFile(targetPath);
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

/**
 * tryComputeFileHash 함수.
 * 파일이 없으면 null을 반환하고 다른 filesystem 오류는 그대로 전파함.
 *
 * @param targetPath - hash를 계산할 absolute file path
 * @returns 파일 hash 또는 null
 */
async function tryComputeFileHash(targetPath: string): Promise<string | null> {
  try {
    return await computeFileHash(targetPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOTDIR') {
      return null;
    }

    throw error;
  }
}

/**
 * verifyFileHashPrecondition 함수.
 * update/create mutation 전에 stale write를 막는 hash precondition을 평가함.
 *
 * @param options - 대상 path, operation, expected hash
 * @returns transport exception 없이 사용할 수 있는 precondition 결과
 */
export async function verifyFileHashPrecondition(
  options: VerifyFileHashPreconditionOptions,
): Promise<HashPreconditionResult> {
  const currentHash = await tryComputeFileHash(options.targetPath);

  if (options.operation === 'create') {
    if (currentHash !== null) {
      return { currentHash, ok: false, reason: 'target-exists' };
    }

    return { currentHash: null, ok: true };
  }

  if (currentHash === null) {
    return { currentHash: null, ok: false, reason: 'target-missing' };
  }

  if (!options.expectedHash) {
    return { currentHash, ok: false, reason: 'hash-missing' };
  }

  if (currentHash !== options.expectedHash) {
    return { currentHash, ok: false, reason: 'hash-stale' };
  }

  return { currentHash, ok: true };
}
