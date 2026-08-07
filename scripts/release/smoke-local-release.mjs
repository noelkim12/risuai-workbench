/**
 * Pack and smoke-test the complete public release train before npm publish.
 * @file scripts/release/smoke-local-release.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageDefinitions = [
  { key: 'wasm', workspace: '@risuai-workbench/lua-analyzer-wasm' },
  { key: 'core', workspace: '@risuai-workbench/core' },
  { key: 'lsp', workspace: '@risuai-workbench/cbs-language-server' },
  { key: 'mcp', workspace: '@risuai-workbench/mcp' },
];

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({
        code: code ?? 1,
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      });
    });
  });
}

async function runChecked(command, args, cwd) {
  const result = await runCommand(command, args, cwd);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} exited with ${result.code}`);
  }
  return result.stdout;
}

async function packWorkspace(workspace, destination) {
  const output = await runChecked(
    'npm',
    ['pack', '--workspace', workspace, '--pack-destination', destination, '--json'],
    repoRoot,
  );
  const packResult = JSON.parse(output);
  const filename = packResult[0]?.filename;
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new Error(`npm pack did not return a filename for ${workspace}.`);
  }
  return path.join(destination, filename);
}

async function readPackageVersion(relativePath) {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, relativePath), 'utf8'));
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`Package version is missing from ${relativePath}.`);
  }
  return manifest.version;
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'risuai-release-smoke-'));
  try {
    const tarballs = {};
    for (const definition of packageDefinitions) {
      tarballs[definition.key] = await packWorkspace(definition.workspace, tempRoot);
    }

    const lspVersion = await readPackageVersion('packages/cbs-lsp/package.json');
    const mcpVersion = await readPackageVersion('packages/risuai-workbench-mcp/package.json');
    const commonArgs = ['--attempts', '1', '--delay-ms', '0'];

    await runChecked(
      process.execPath,
      [
        'scripts/release/smoke-published-cbs-lsp.mjs',
        '--version', lspVersion,
        '--package-spec', tarballs.lsp,
        '--dependency-spec', tarballs.wasm,
        '--dependency-spec', tarballs.core,
        ...commonArgs,
      ],
      repoRoot,
    );
    await runChecked(
      process.execPath,
      [
        'scripts/release/smoke-published-mcp.mjs',
        '--version', mcpVersion,
        '--package-spec', tarballs.mcp,
        '--dependency-spec', tarballs.wasm,
        '--dependency-spec', tarballs.core,
        '--dependency-spec', tarballs.lsp,
        ...commonArgs,
      ],
      repoRoot,
    );

    console.log(`Local release tarballs passed LSP and MCP smoke tests at version ${lspVersion}.`);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
