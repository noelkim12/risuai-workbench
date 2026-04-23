/**
 * VS Code extension-host runtime test launcher for the CBS language client.
 * @file packages/vscode/tests/e2e/run-extension-runtime-tests.ts
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { runTests } from '@vscode/test-electron';

const SYSTEM_ASOUND_LIB_CANDIDATES = [
  '/usr/lib/x86_64-linux-gnu/libasound.so.2',
  '/lib/x86_64-linux-gnu/libasound.so.2',
];

/**
 * assertPathExists 함수.
 * extension-host runner가 필요한 파일/디렉토리를 시작 전에 확인함.
 *
 * @param targetPath - 존재 여부를 검증할 절대 경로
 * @param label - 실패 메시지에 넣을 대상 이름
 */
function assertPathExists(targetPath: string, label: string): void {
  assert.ok(existsSync(targetPath), `${label} not found: ${targetPath}`);
}

/**
 * resolveRuntimeLibraryPath 함수.
 * Extension host가 필요로 하는 libasound를 시스템 또는 user-space cache에서 찾음.
 *
 * @param packageRoot - `packages/vscode` 루트 경로
 * @returns VS Code child process에 주입할 추가 library search path 또는 undefined
 */
function resolveRuntimeLibraryPath(packageRoot: string): string | undefined {
  if (SYSTEM_ASOUND_LIB_CANDIDATES.some((candidate) => existsSync(candidate))) {
    return undefined;
  }

  const runtimeLibRoot = path.join(packageRoot, '.vscode-test', 'runtime-libs');
  const extractedLibDir = path.join(runtimeLibRoot, 'usr', 'lib', 'x86_64-linux-gnu');
  const extractedLibPath = path.join(extractedLibDir, 'libasound.so.2');

  if (!existsSync(extractedLibPath)) {
    execFileSync('mkdir', ['-p', runtimeLibRoot]);
    execFileSync('sh', ['-c', 'rm -f libasound2t64_*.deb'], { cwd: runtimeLibRoot });
    execFileSync('apt-get', ['download', 'libasound2t64'], { cwd: runtimeLibRoot, stdio: 'inherit' });
    execFileSync('sh', ['-c', 'dpkg-deb -x libasound2t64_*.deb .'], {
      cwd: runtimeLibRoot,
      stdio: 'inherit',
    });
  }

  assertPathExists(extractedLibPath, 'Vendored libasound runtime library');
  return extractedLibDir;
}

/**
 * ensureWritableRuntimeDir 함수.
 * Electron/VS Code가 IPC socket과 runtime 파일을 쓸 수 있는 XDG runtime 디렉토리를 준비함.
 *
 * @param packageRoot - `packages/vscode` 루트 경로
 * @returns child process가 사용할 writable runtime directory
 */
function ensureWritableRuntimeDir(packageRoot: string): string {
  const runtimeDir = path.join(packageRoot, '.vscode-test', 'xdg-runtime');
  mkdirSync(runtimeDir, { recursive: true });
  chmodSync(runtimeDir, 0o700);
  return runtimeDir;
}

/**
 * main 함수.
 * compiled extension-host suite를 실제 VS Code Extension Development Host에서 실행함.
 */
async function main(): Promise<void> {
  const packageRoot = process.cwd();
  const extensionDevelopmentPath = packageRoot;
  const extensionTestsPath = path.join(
    packageRoot,
    'dist-tests',
    'tests',
    'e2e',
    'extension-host',
    'suite.js',
  );
  const workspacePath = path.join(packageRoot, 'tests', 'fixtures', 'extension-host-workspace');

  assertPathExists(extensionDevelopmentPath, 'Extension development path');
  assertPathExists(extensionTestsPath, 'Compiled extension-host suite');
  assertPathExists(workspacePath, 'Extension-host workspace fixture');

  const runtimeLibraryPath = resolveRuntimeLibraryPath(packageRoot);
  const runtimeDir = ensureWritableRuntimeDir(packageRoot);
  if (runtimeLibraryPath) {
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${runtimeLibraryPath}:${process.env.LD_LIBRARY_PATH}`
      : runtimeLibraryPath;
  }
  process.env.XDG_RUNTIME_DIR = runtimeDir;

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      workspacePath,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--skip-release-notes',
      '--skip-welcome',
    ],
  });
}

void main().catch((error: unknown) => {
  console.error('[cbs-client-runtime]', error);
  process.exitCode = 1;
});
