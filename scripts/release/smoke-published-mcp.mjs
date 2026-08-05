/**
 * Published @risuai-workbench/mcp smoke verifier.
 * @file scripts/release/smoke-published-mcp.mjs
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_NAME = '@risuai-workbench/mcp';
const DEFAULT_ATTEMPTS = 6;
const DEFAULT_DELAY_MS = 10_000;

function parseCliArgs(argv, env) {
  let version = env.MCP_RELEASE_VERSION?.trim() ?? '';
  let tag = env.MCP_RELEASE_TAG?.trim() || 'latest';
  let packageSpec = env.MCP_RELEASE_SPEC?.trim() ?? '';
  const dependencySpecs = [];
  let attempts = Number.parseInt(env.MCP_RELEASE_ATTEMPTS ?? String(DEFAULT_ATTEMPTS), 10);
  let delayMs = Number.parseInt(env.MCP_RELEASE_DELAY_MS ?? String(DEFAULT_DELAY_MS), 10);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--version' && nextValue) {
      version = nextValue.trim();
      index += 1;
    } else if (argument === '--tag' && nextValue) {
      tag = nextValue.trim();
      index += 1;
    } else if (argument === '--package-spec' && nextValue) {
      packageSpec = nextValue.trim();
      index += 1;
    } else if (argument === '--dependency-spec' && nextValue) {
      dependencySpecs.push(nextValue.trim());
      index += 1;
    } else if (argument === '--attempts' && nextValue) {
      attempts = Number.parseInt(nextValue, 10);
      index += 1;
    } else if (argument === '--delay-ms' && nextValue) {
      delayMs = Number.parseInt(nextValue, 10);
      index += 1;
    }
  }

  return { attempts, delayMs, dependencySpecs, packageSpec, tag, version };
}

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

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function verifyMcpHandshake(tempRoot, cliPath, version) {
  const requireFromTemp = createRequire(path.join(tempRoot, 'package.json'));
  const { Client } = requireFromTemp('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = requireFromTemp('@modelcontextprotocol/sdk/client/stdio.js');
  const transport = new StdioClientTransport({
    args: [cliPath, '--stdio', '--root', tempRoot],
    command: process.execPath,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'published-mcp-smoke', version });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    if (!tools.tools.some((tool) => tool.name === 'workbench.smoke')) {
      throw new Error('tools/list did not expose workbench.smoke.');
    }
    const result = await client.callTool({ arguments: {}, name: 'workbench.smoke' });
    const text = result.content.find((item) => item.type === 'text')?.text;
    const payload = JSON.parse(text ?? '{}');
    if (payload.status !== 'ok' || payload.tool !== 'workbench.smoke') {
      throw new Error('workbench.smoke returned an unexpected diagnostic envelope.');
    }
  } finally {
    await client.close();
  }
}

async function verifyPublishedPackage(options) {
  const { attempts, delayMs, tag, version } = options;
  const packageSpec = options.packageSpec || (version ? `${PACKAGE_NAME}@${version}` : '');

  if (!packageSpec) {
    throw new Error(
      'MCP_RELEASE_VERSION, MCP_RELEASE_SPEC, --version, or --package-spec is required.',
    );
  }
  if (!Number.isInteger(attempts) || attempts <= 0) {
    throw new Error(`Invalid retry count: ${String(attempts)}`);
  }
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new Error(`Invalid retry delay: ${String(delayMs)}`);
  }

  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mcp-publish-smoke-'));
    try {
      console.log(`[smoke] Attempt ${attempt}/${attempts} for ${packageSpec} (tag=${tag})`);
      await writeFile(
        path.join(tempRoot, 'package.json'),
        JSON.stringify({ name: 'mcp-publish-smoke', private: true, version: '0.0.0' }, null, 2),
      );
      const installArgs = ['install', '--no-fund', '--no-audit'];
      if (!options.packageSpec) installArgs.push('--tag', tag);
      installArgs.push(...options.dependencySpecs, packageSpec);
      const installResult = await runCommand('npm', installArgs, tempRoot);
      if (installResult.code !== 0) {
        throw new Error(`npm install failed: ${installResult.stderr || installResult.stdout}`);
      }

      const cliPath = path.join(
        tempRoot,
        'node_modules',
        PACKAGE_NAME,
        'bin',
        'risuai-workbench-mcp.js',
      );
      const versionResult = await runCommand(process.execPath, [cliPath, '--version'], tempRoot);
      if (versionResult.code !== 0 || (version && versionResult.stdout.trim() !== version)) {
        throw new Error(
          `CLI --version check failed: ${versionResult.stderr || versionResult.stdout}`,
        );
      }
      const helpResult = await runCommand(process.execPath, [cliPath, '--help'], tempRoot);
      if (helpResult.code !== 0 || !helpResult.stdout.includes('risuai-workbench-mcp')) {
        throw new Error(`CLI --help check failed: ${helpResult.stderr || helpResult.stdout}`);
      }

      await verifyMcpHandshake(tempRoot, cliPath, version || versionResult.stdout.trim());
      console.log(
        `[smoke] ${packageSpec} passed install, CLI, tools/list, and workbench.smoke checks.`,
      );
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
