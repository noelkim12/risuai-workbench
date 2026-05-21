/**
 * MCP package startup and registry smoke tests.
 * @file packages/risuai-workbench-mcp/tests/server/startup.test.ts
 */

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

import { buildHelpText, parseCliArgs } from '../../src/cli';
import { createStartupContext } from '../../src/server';

const packageRoot = path.resolve(__dirname, '..', '..');
const binPath = path.join(packageRoot, 'bin', 'risuai-workbench-mcp.js');
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures', 'workspaces', 'standard');

/**
 * createTempFixtureDir 함수.
 * invalid-root 테스트가 건드리지 않아야 할 fixture 파일을 준비함.
 *
 * @returns 생성된 temp root와 sentinel file 경로
 */
async function createTempFixtureDir(): Promise<{ root: string; sentinelPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-'));
  const sentinelPath = path.join(root, 'sentinel.txt');
  await writeFile(sentinelPath, 'fixture remains unchanged\n', 'utf8');
  return { root, sentinelPath };
}

describe('risuai-workbench-mcp startup', () => {
  it('prints package help without starting MCP stdio', () => {
    const parsed = parseCliArgs(['--help']);

    expect(parsed.command).toBe('help');
    expect(buildHelpText()).toContain('risuai-workbench-mcp');
    expect(buildHelpText()).toContain('--stdio');
  });

  it('invalid-root leaves fixture files unchanged', async () => {
    const fixture = await createTempFixtureDir();
    const missingRoot = path.join(fixture.root, 'missing-workspace');
    const before = await readFile(fixture.sentinelPath, 'utf8');

    const context = await createStartupContext({ root: missingRoot });

    const after = await readFile(fixture.sentinelPath, 'utf8');
    expect(context.workspace.ok).toBe(false);
    expect(context.workspace.reason).toBe('root-not-found');
    expect(after).toBe(before);
  });

  it('lists a minimal MCP smoke tool over stdio', async () => {
    const transport = new StdioClientTransport({
      args: [binPath, '--stdio'],
      command: process.execPath,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'risuai-workbench-mcp-startup-test', version: '0.1.0' });

    try {
      await client.connect(transport);
      const tools = await client.listTools();

      expect(tools.tools.map((tool) => tool.name)).toContain('workbench.smoke');
    } finally {
      await client.close();
    }
  });

  it('inspect_path returns ok result with role data over stdio with --root', async () => {
    const transport = new StdioClientTransport({
      args: [binPath, '--stdio', '--root', fixturesRoot],
      command: process.execPath,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'risuai-workbench-mcp-inspect-test', version: '0.1.0' });

    try {
      await client.connect(transport);
      const result = await client.callTool({
        arguments: { path: 'characters/merry/lorebooks/intro.risulorebook' },
        name: 'workbench.inspect_path',
      }) as { content: Array<{ text: string; type: string }> };

      expect(result.content).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.schema).toBe('risuai-workbench-mcp.diagnostics');
      expect(parsed.tool).toBe('workbench.inspect_path');
      expect(parsed.status).toBe('ok');
      expect(parsed.data).toBeDefined();
      expect(parsed.data.role).toBe('canonical-file');
      expect(parsed.data.relativePath).toBe('characters/merry/lorebooks/intro.risulorebook');
      expect(parsed.data.artifact).toBe('lorebook');
      expect(parsed.data.contract).toBeDefined();
      expect(parsed.data.contract.suffix).toBe('.risulorebook');
    } finally {
      await client.close();
    }
  });
});
