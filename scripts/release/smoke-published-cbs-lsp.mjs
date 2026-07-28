/**
 * Published @risuai-workbench/cbs-language-server smoke verifier.
 * @file scripts/release/smoke-published-cbs-lsp.mjs
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PACKAGE_NAME = '@risuai-workbench/cbs-language-server';
const DEFAULT_ATTEMPTS = 6;
const DEFAULT_DELAY_MS = 10_000;

/**
 * parseCliArgs 함수.
 * CLI 인자와 환경 변수를 읽어 smoke test 설정을 정리함.
 *
 * @param argv - `process.argv.slice(2)` 형태의 인자 배열
 * @param env - smoke test를 제어할 환경 변수 집합
 * @returns 검증에 쓸 version/tag/attempt 설정
 */
function parseCliArgs(argv, env) {
  let version = env.CBS_LSP_RELEASE_VERSION?.trim() ?? '';
  let tag = env.CBS_LSP_RELEASE_TAG?.trim() || 'latest';
  let attempts = Number.parseInt(env.CBS_LSP_RELEASE_ATTEMPTS ?? String(DEFAULT_ATTEMPTS), 10);
  let delayMs = Number.parseInt(env.CBS_LSP_RELEASE_DELAY_MS ?? String(DEFAULT_DELAY_MS), 10);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--version' && nextValue) {
      version = nextValue.trim();
      index += 1;
      continue;
    }

    if (argument === '--tag' && nextValue) {
      tag = nextValue.trim();
      index += 1;
      continue;
    }

    if (argument === '--attempts' && nextValue) {
      attempts = Number.parseInt(nextValue, 10);
      index += 1;
      continue;
    }

    if (argument === '--delay-ms' && nextValue) {
      delayMs = Number.parseInt(nextValue, 10);
      index += 1;
    }
  }

  return { version, tag, attempts, delayMs };
}

/**
 * runCommand 함수.
 * child process를 실행하고 stdout/stderr를 수집함.
 *
 * @param command - 실행할 바이너리 이름
 * @param args - 바이너리에 전달할 인자 배열
 * @param cwd - 프로세스를 실행할 작업 디렉토리
 * @returns 종료 코드와 출력 문자열
 */
function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
    });

    child.once('error', reject);
    child.once('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });
}

/**
 * sleep 함수.
 * npm registry 전파 대기 시간을 비동기로 쉼.
 *
 * @param delayMs - 대기할 밀리초
 * @returns 대기 완료 promise
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * verifyPublishedPackage 함수.
 * npm registry에 올라간 정확한 버전을 임시 디렉토리에 설치해 CLI/module surface를 검증함.
 *
 * @param options - release version, dist-tag, retry 정책
 */
async function verifyPublishedPackage(options) {
  const { attempts, delayMs, tag, version } = options;

  if (!version) {
    throw new Error('CBS_LSP_RELEASE_VERSION or --version is required for post-publish smoke testing.');
  }

  if (!Number.isInteger(attempts) || attempts <= 0) {
    throw new Error(`Invalid retry count: ${String(attempts)}`);
  }

  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new Error(`Invalid retry delay: ${String(delayMs)}`);
  }

  const packageSpec = `${PACKAGE_NAME}@${version}`;
  let lastError = '';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-publish-smoke-'));

    try {
      console.log(`[smoke] Attempt ${attempt}/${attempts} for ${packageSpec} (tag=${tag})`);
      await writeFile(
        path.join(tempRoot, 'package.json'),
        JSON.stringify({ name: 'cbs-lsp-smoke', private: true, version: '0.0.0' }, null, 2),
      );

      const installResult = await runCommand(
        'npm',
        ['install', '--no-fund', '--no-audit', '--tag', tag, packageSpec],
        tempRoot,
      );

      if (installResult.code !== 0) {
        lastError = installResult.stderr || installResult.stdout;
        throw new Error(`npm install failed: ${lastError}`);
      }

      const cliPath = path.join(tempRoot, 'node_modules', '.bin', 'cbs-language-server');
      const versionResult = await runCommand(cliPath, ['--version'], tempRoot);
      if (versionResult.code !== 0 || versionResult.stdout.trim() !== version) {
        lastError = versionResult.stderr || versionResult.stdout;
        throw new Error(`CLI --version check failed: ${lastError}`);
      }

      const helpResult = await runCommand(cliPath, ['--help'], tempRoot);
      if (helpResult.code !== 0 || !helpResult.stdout.includes('CBS Language Server CLI')) {
        lastError = helpResult.stderr || helpResult.stdout;
        throw new Error(`CLI --help check failed: ${lastError}`);
      }

      const modulePath = path.join(tempRoot, 'node_modules', PACKAGE_NAME, 'dist', 'server.js');
      await import(pathToFileURL(modulePath).href);
      console.log(`[smoke] Published package ${packageSpec} passed install, CLI, and module-import smoke checks.`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      if (attempt === attempts) {
        throw new Error(`Post-publish smoke test failed for ${packageSpec}: ${lastError}`);
      }

      console.warn(`[smoke] ${lastError}`);
      console.warn(`[smoke] Waiting ${delayMs}ms before retrying registry propagation...`);
      await sleep(delayMs);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }
}

const options = parseCliArgs(process.argv.slice(2), process.env);

verifyPublishedPackage(options).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
