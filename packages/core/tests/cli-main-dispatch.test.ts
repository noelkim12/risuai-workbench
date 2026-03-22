import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cliPath = path.join(process.cwd(), 'dist', 'cli', 'main.js');
const scriptGuardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-cli-guard-'));
const scriptGuardPath = path.join(scriptGuardDir, 'deny-legacy-scripts.cjs');

fs.writeFileSync(
  scriptGuardPath,
  `
const cp = require('node:child_process');
const Module = require('node:module');
const originalSpawnSync = cp.spawnSync;
const originalExecSync = cp.execSync;
const originalLoad = Module._load;

function hasLegacyScriptPath(command, args) {
  const joined = [String(command || ''), ...(args || []).map((x) => String(x))].join(' ');
  return /(?:^|[\\/])scripts[\\/].+\\.js/.test(joined);
}

function hasLegacyScriptRequest(request) {
  return /(?:^|[\\/])scripts[\\/].+\\.js(?:$|[?#])/.test(String(request || ''));
}

cp.spawnSync = function patchedSpawnSync(command, args, options) {
  if (hasLegacyScriptPath(command, args)) {
    throw new Error('legacy-script-execution-blocked');
  }
  return originalSpawnSync.call(cp, command, args, options);
};

cp.execSync = function patchedExecSync(command, options) {
  if (String(command || '').match(/(?:^|[\\/])scripts[\\/].+\\.js/)) {
    throw new Error('legacy-script-execution-blocked');
  }
  return originalExecSync.call(cp, command, options);
};

Module._load = function patchedLoad(request, parent, isMain) {
  if (hasLegacyScriptRequest(request)) {
    throw new Error('legacy-script-module-load-blocked');
  }
  return originalLoad.call(this, request, parent, isMain);
};
`,
  'utf-8',
);

function runCli(args: readonly string[]) {
  const existingNodeOptions = process.env.NODE_OPTIONS || '';
  const nodeOptions = [existingNodeOptions, `--require=${scriptGuardPath}`]
    .filter((value) => value.length > 0)
    .join(' ');

  return spawnSync('node', [cliPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
  });
}

describe('src/cli main dispatcher integration', () => {
  it('shows top-level help', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('risu-core CLI');
    expect(result.stdout).toContain('Run \'risu-core <command> --help\'');
  });

  it('returns exit code 1 for an unknown command', () => {
    const result = runCli(['not-a-command']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown command');
  });

  it('dispatches extract to TypeScript command path', () => {
    const result = runCli(['extract', '--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Character Card Extractor');
    expect(result.stdout).toContain('node extract.js');
    expect(result.stderr).not.toContain('legacy-script-execution-blocked');
  });

  it('dispatches pack to TypeScript command path', () => {
    const result = runCli(['pack', '--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Character Card Packer');
    expect(result.stdout).toContain('node pack.js');
    expect(result.stderr).not.toContain('legacy-script-execution-blocked');
  });

  it('dispatches analyze to unified analyze router', () => {
    const analyze = runCli(['analyze', '--help']);
    expect(analyze.status).toBe(0);
    expect(analyze.stdout).toContain('risu-core analyze');
    expect(analyze.stderr).not.toContain('legacy-script-execution-blocked');
  });

  it('dispatches analyze --type lua', () => {
    const result = runCli(['analyze', '--type', 'lua', '--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: node analyze.js');
  });

  it('dispatches analyze --type charx', () => {
    const result = runCli(['analyze', '--type', 'charx', '--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Character Card Analyzer');
  });

  it('returns exit code 1 for unknown analyze type', () => {
    const result = runCli(['analyze', '--type', 'unknown']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown analyze type');
  });

  it('dispatches build to TypeScript command path', () => {
    const result = runCli(['build', '--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RisuAI Component Builder');
    expect(result.stdout).toContain('node build-components.js');
    expect(result.stderr).not.toContain('legacy-script-execution-blocked');
  });
});
