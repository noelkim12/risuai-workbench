/**
 * CBS language server standalone CLI smoke tests.
 * @file packages/cbs-lsp/tests/standalone/cli-contract.test.ts
 */

import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface PackageManifest {
  version: string;
  bin?: Record<string, string>;
  exports?: Record<string, string | { types?: string; default?: string }>;
}

const packageRoot = process.cwd();
const cliPath = path.join(packageRoot, 'dist', 'cli.js');
const packageJsonPath = path.join(packageRoot, 'package.json');
const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageManifest;
const stdioChildren = new Set<ReturnType<typeof spawn>>();

function runCliFlag(flag: '--help' | '--version') {
  return spawnSync(process.execPath, [cliPath, flag], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
}

beforeAll(() => {
  const buildResult = spawnSync('npm', ['run', 'build'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });

  expect(buildResult.status, buildResult.stderr).toBe(0);
});

afterAll(async () => {
  await Promise.all(
    [...stdioChildren].map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) {
            resolve();
            return;
          }

          child.once('exit', () => resolve());
          child.kill('SIGTERM');
        }),
    ),
  );
});

describe.sequential('cbs-language-server standalone CLI contract', () => {
  it('publishes an explicit bin and server-module export surface', () => {
    expect(manifest.bin?.['cbs-language-server']).toBe('dist/cli.js');
    expect(manifest.exports?.['.']).toEqual({
      types: './dist/server.d.ts',
      default: './dist/server.js',
    });
    expect(manifest.exports?.['./server']).toEqual({
      types: './dist/server.d.ts',
      default: './dist/server.js',
    });
    expect(manifest.exports?.['./cli']).toEqual({
      types: './dist/cli.d.ts',
      default: './dist/cli.js',
    });
  });

  it('shows help for --help', () => {
    const result = runCliFlag('--help');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CBS Language Server CLI');
    expect(result.stdout).toContain('cbs-language-server --stdio');
    expect(result.stdout).toContain('--config');
    expect(result.stdout).toContain('--log-level');
  });

  it('prints the package version for --version', () => {
    const result = runCliFlag('--version');

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(manifest.version);
  });

  it('starts the stdio server without exiting immediately for --stdio', async () => {
    const child = spawn(process.execPath, [cliPath, '--stdio'], {
      cwd: packageRoot,
      stdio: 'pipe',
    });
    stdioChildren.add(child);

    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(child.exitCode).toBeNull();
    expect(Buffer.concat(stderrChunks).toString('utf8')).toBe('');
  });

  it('rejects invalid standalone log levels with a non-zero exit code', () => {
    const result = spawnSync(process.execPath, [cliPath, '--stdio', '--log-level', 'verbose'], {
      cwd: packageRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported log level');
  });
});
