/**
 * Copy MCP Config command snippet boundary tests.
 * @file packages/vscode/tests/e2e/mcp-config-boundary.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');
const vscodePackageRoot = path.resolve(__dirname, '../../..');
const mcpConfigModule = localRequire(
  path.join(vscodeDistRoot, 'commands/mcpConfig.js'),
) as typeof import('../../src/commands/mcpConfig');

const PINNED_PACKAGE = `@risuai-workbench/mcp@${mcpConfigModule.RISU_MCP_PACKAGE_VERSION}`;
const EXPECTED_ARGS = ['--yes', '--package', PINNED_PACKAGE, 'risuai-workbench-mcp', '--stdio'];

test('pinned MCP version matches the MCP package version', () => {
  const mcpPackageJson = JSON.parse(
    fs.readFileSync(
      path.resolve(vscodePackageRoot, '../risuai-workbench-mcp/package.json'),
      'utf-8',
    ),
  ) as { version: string };
  assert.equal(mcpConfigModule.RISU_MCP_PACKAGE_VERSION, mcpPackageJson.version);
});

test('JSON snippets parse and launch the pinned stdio server', () => {
  const claude = JSON.parse(mcpConfigModule.buildMcpConfigSnippet('claude-json'));
  assert.deepEqual(claude.mcpServers['risuai-workbench'], {
    type: 'stdio',
    command: 'npx',
    args: EXPECTED_ARGS,
  });

  const opencode = JSON.parse(mcpConfigModule.buildMcpConfigSnippet('opencode-json'));
  assert.deepEqual(opencode.mcp['risuai-workbench'].command, ['npx', ...EXPECTED_ARGS]);
  assert.equal(opencode.mcp['risuai-workbench'].type, 'local');
});

test('CLI snippets register the pinned server as one command line', () => {
  const npxCommand = `npx ${EXPECTED_ARGS.join(' ')}`;
  assert.equal(
    mcpConfigModule.buildMcpConfigSnippet('claude-cli'),
    `claude mcp add --transport stdio --scope local risuai-workbench -- ${npxCommand}`,
  );
  assert.equal(
    mcpConfigModule.buildMcpConfigSnippet('codex-cli'),
    `codex mcp add risuai-workbench -- ${npxCommand}`,
  );
});

test('TOML and YAML snippets include every pinned arg', () => {
  const toml = mcpConfigModule.buildMcpConfigSnippet('codex-toml');
  assert.match(toml, /^\[mcp_servers\.risuai-workbench\]$/m);
  assert.match(toml, new RegExp(`^args = \\[${EXPECTED_ARGS.map((arg) => `"${arg}"`).join(', ')}\\]$`, 'm'));

  const yaml = mcpConfigModule.buildMcpConfigSnippet('hermes-yaml');
  for (const arg of EXPECTED_ARGS) {
    assert.ok(yaml.includes(`      - '${arg}'`), `missing yaml arg ${arg}`);
  }
});

test('every client option produces a snippet', () => {
  for (const option of mcpConfigModule.MCP_CLIENT_OPTIONS) {
    assert.ok(mcpConfigModule.buildMcpConfigSnippet(option.id).includes(PINNED_PACKAGE), option.id);
  }
});
