/**
 * Product-level CLI/LSP test helpers for cbs-lsp.
 * @file packages/cbs-lsp/tests/product/test-helpers.ts
 */

import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';

import { expect } from 'vitest';

export const packageRoot = process.cwd();
export const cliPath = path.join(packageRoot, 'dist', 'cli.js');

let packageBuilt = false;

/**
 * ensureBuiltPackage 함수.
 * product-level 테스트가 dist CLI/server 산출물을 직접 실행할 수 있게 build를 한 번만 보장함.
 */
export function ensureBuiltPackage(): void {
  if (packageBuilt) {
    return;
  }

  const buildResult = spawnSync('npm', ['run', 'build'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });

  expect(buildResult.status, buildResult.stderr).toBe(0);
  packageBuilt = true;
}

/**
 * createWorkspaceRoot 함수.
 * 테스트마다 격리된 extracted workspace root를 만들고 정리 대상 목록에 등록함.
 *
 * @param prefix - 임시 디렉터리 이름 접두사
 * @param tempRoots - afterEach cleanup에서 비울 루트 목록
 * @returns 새로 만든 workspace root 경로
 */
export async function createWorkspaceRoot(prefix: string, tempRoots: string[]): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

/**
 * writeWorkspaceFile 함수.
 * canonical extracted workspace 상대 경로에 테스트 fixture 파일을 기록함.
 *
 * @param root - 테스트용 workspace root
 * @param relativePath - workspace root 기준 상대 경로
 * @param text - 파일에 기록할 UTF-8 본문
 * @returns 기록된 절대 경로
 */
export async function writeWorkspaceFile(root: string, relativePath: string, text: string): Promise<string> {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, text, 'utf8');
  return absolutePath;
}

/**
 * spawnCliProcess 함수.
 * built standalone CLI를 stdio child process로 실행함.
 *
 * @param args - CLI에 전달할 인자 목록
 * @returns stdio pipe가 연결된 child process
 */
export function spawnCliProcess(args: readonly string[]): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [cliPath, ...args], {
    cwd: packageRoot,
    stdio: 'pipe',
  });
}

/**
 * runCliJson 함수.
 * built standalone CLI query/report 명령을 실행하고 stdout JSON을 파싱해 반환함.
 *
 * @param args - CLI에 전달할 인자 목록
 * @returns spawn 결과와 파싱된 JSON payload
 */
export function runCliJson<T>(args: readonly string[]): {
  payload: T;
  result: ReturnType<typeof spawnSync>;
} {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  expect(result.status, result.stderr).toBe(0);
  return {
    payload: JSON.parse(result.stdout) as T,
    result,
  };
}
